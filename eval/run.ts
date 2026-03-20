#!/usr/bin/env bun
/**
 * Evaluation harness runner.
 *
 * Usage:
 *   bun run eval/run.ts
 *   bun run eval/run.ts --class=pdf-digital
 *   bun run eval/run.ts --fixture=myfile.pdf
 *   bun run eval/run.ts --json
 *   bun run eval/run.ts --verbose
 */

import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { discoverFixtures } from "./discover";
import { scoreFixture, computeOverall } from "./score";
import { buildReport, formatCliTable, writeReport } from "./report";
import { countWords, estimateTokens } from "../src/core/tokens";
import { extract } from "../src/core/extraction";
import type { DocumentClass, FixtureResult, EvalReport } from "./types";

const ROOT = dirname(import.meta.dir);
const FIXTURES_DIR = join(ROOT, "eval", "fixtures");
const RESULTS_DIR = join(ROOT, "eval", "results");
const REPORTS_DIR = join(ROOT, "eval", "reports");

// --- CLI arg parsing ---

function parseArgs(argv: string[]) {
  let filterClass: DocumentClass | null = null;
  let filterFixture: string | null = null;
  let jsonOutput = false;
  let verbose = false;

  for (const arg of argv) {
    if (arg.startsWith("--class=")) {
      filterClass = arg.slice("--class=".length) as DocumentClass;
    } else if (arg.startsWith("--fixture=")) {
      filterFixture = arg.slice("--fixture=".length);
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--verbose") {
      verbose = true;
    }
  }

  return { filterClass, filterFixture, jsonOutput, verbose };
}

// --- Engine version detection ---

async function getPandocVersion(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["pandoc", "--version"], { stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const match = stdout.match(/pandoc\s+([\d.]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function getKreuzbergVersion(): Promise<string | null> {
  try {
    const pkgPath = join(ROOT, "node_modules", "@kreuzberg", "node", "package.json");
    const pkg = await Bun.file(pkgPath).json();
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Discover fixtures
  let fixtures = await discoverFixtures(FIXTURES_DIR);

  if (fixtures.length === 0) {
    console.log("\n  No fixtures found in eval/fixtures/.");
    console.log("  To get started:");
    console.log("    1. Create class directories: eval/fixtures/pdf-digital/, etc.");
    console.log("    2. Drop test documents into the appropriate directory.");
    console.log("    3. Optionally add {name}.meta.yaml sidecars.");
    console.log("    4. Run: bun run eval:run\n");
    console.log("  See eval/README.md for details.\n");
    process.exit(0);
  }

  // Apply filters
  if (args.filterClass) {
    fixtures = fixtures.filter((f) => f.documentClass === args.filterClass);
    if (fixtures.length === 0) {
      console.error(`No fixtures found for class: ${args.filterClass}`);
      process.exit(1);
    }
  }
  if (args.filterFixture) {
    fixtures = fixtures.filter((f) => f.fileName === args.filterFixture);
    if (fixtures.length === 0) {
      console.error(`Fixture not found: ${args.filterFixture}`);
      process.exit(1);
    }
  }

  console.log(`\n  Running eval on ${fixtures.length} fixture(s)...\n`);

  // Run conversions and score
  const results: FixtureResult[] = [];

  for (const fixture of fixtures) {
    const start = performance.now();
    let content = "";
    let error: string | null = null;
    let engine: string | undefined;
    let warnings: string[] | undefined;
    let extractionMs: number | undefined;

    try {
      const useSmartOcr = fixture.documentClass === "pdf-scanned" || fixture.meta.expect?.requiresOcr;
      const extractResult = await extract(fixture.filePath, { smartOcr: useSmartOcr });
      content = extractResult.contentMarkdown;
      engine = extractResult.engine;
      warnings = extractResult.warnings.length ? extractResult.warnings : undefined;
      extractionMs = extractResult.timings.totalMs;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (args.verbose) {
        console.error(`  [ERROR] ${fixture.fileName}: ${error}`);
      }
    }

    const durationMs = Math.round(performance.now() - start);
    const words = countWords(content);
    const tokens = estimateTokens(content, words);

    // Write raw output
    const outDir = join(RESULTS_DIR, fixture.documentClass);
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `${fixture.fileName}.md`);
    await writeFile(outPath, content);

    // Score
    const scores = scoreFixture(content, fixture);
    const overallScore = error ? 0 : computeOverall(scores);

    const result: FixtureResult = {
      fixture,
      content,
      scores,
      overallScore,
      durationMs,
      error,
      tokenCount: tokens,
      wordCount: words,
      engine,
      warnings,
      extractionMs,
    };

    results.push(result);

    if (args.verbose) {
      const status = error ? "\x1b[31mERR\x1b[0m" : overallScore >= 0.8 ? "\x1b[32mOK \x1b[0m" : "\x1b[33mLOW\x1b[0m";
      const engineTag = engine ? ` [${engine}]` : "";
      console.log(
        `  ${status} ${fixture.documentClass}/${fixture.fileName} ` +
          `score=${overallScore.toFixed(2)} ${durationMs}ms ${words}w${engineTag}`,
      );
    }
  }

  // Build report
  const engineInfo: EvalReport["engineInfo"] = {
    pandocVersion: await getPandocVersion(),
    kreuzbergVersion: await getKreuzbergVersion(),
  };
  const report = buildReport(results, engineInfo);

  if (args.jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatCliTable(report));

    // Write JSON report
    const reportPath = await writeReport(report, REPORTS_DIR);
    console.log(`  Report saved: ${reportPath}\n`);
  }
}

main().catch((err) => {
  console.error("Eval harness failed:", err);
  process.exit(1);
});

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
 *   bun run eval/run.ts --compare              # A/B: Defuddle vs baseline on HTML fixtures
 *   bun run eval/run.ts --compare-kreuzberg    # A/B: tuned vs baseline Kreuzberg on non-HTML
 */

import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { discoverFixtures } from "./discover";
import { scoreFixture, computeOverall } from "./score";
import { buildReport, formatCliTable, writeReport } from "./report";
import { countWords, estimateTokens } from "../src/core/tokens";
import { extract } from "../src/core/extraction";
import { convertHtmlToMarkdown } from "../src/core/adapters/pandoc-html";
import type { DocumentClass, Fixture, FixtureResult, EvalReport } from "./types";

const ROOT = dirname(import.meta.dir);
const FIXTURES_DIR = join(ROOT, "eval", "fixtures");
const RESULTS_DIR = join(ROOT, "eval", "results");
const REPORTS_DIR = join(ROOT, "eval", "reports");

const HTML_CLASSES = new Set(["article-html", "webpage-html", "email-html"]);

// --- CLI arg parsing ---

function parseArgs(argv: string[]) {
  let filterClass: DocumentClass | null = null;
  let filterFixture: string | null = null;
  let jsonOutput = false;
  let verbose = false;
  let compare = false;
  let compareKreuzberg = false;

  for (const arg of argv) {
    if (arg.startsWith("--class=")) {
      filterClass = arg.slice("--class=".length) as DocumentClass;
    } else if (arg.startsWith("--fixture=")) {
      filterFixture = arg.slice("--fixture=".length);
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--compare") {
      compare = true;
    } else if (arg === "--compare-kreuzberg") {
      compareKreuzberg = true;
    }
  }

  return { filterClass, filterFixture, jsonOutput, verbose, compare, compareKreuzberg };
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

// --- A/B comparison ---

interface CompareRow {
  fixture: string;
  documentClass: string;
  baseline: number;
  defuddle: number;
  delta: number;
  skipped: boolean;
}

async function runHtmlFixtureWithOptions(
  fixture: Fixture,
  skipDefuddle: boolean,
): Promise<{ content: string; engine: string; score: number }> {
  const html = await Bun.file(fixture.filePath).text();
  const { content, engine } = await convertHtmlToMarkdown(html, { skipDefuddle });
  const scores = scoreFixture(content, fixture);
  const score = computeOverall(scores);
  return { content, engine, score };
}

function formatCompareTable(rows: CompareRow[]): string {
  const lines: string[] = [];
  const color = {
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  };

  lines.push("");
  lines.push(color.bold("  A/B: HTML fixtures (Defuddle vs Baseline)"));
  lines.push("");

  const header = `  ${"Fixture".padEnd(45)} ${"Baseline".padStart(10)} ${"Defuddle".padStart(10)} ${"Delta".padStart(10)}`;
  lines.push(color.bold(header));
  lines.push(`  ${"─".repeat(77)}`);

  for (const row of rows) {
    const name = `${row.documentClass}/${row.fixture}`.slice(0, 44).padEnd(45);
    const base = row.baseline.toFixed(2).padStart(10);
    const def = row.defuddle.toFixed(2).padStart(10);

    let deltaStr: string;
    if (row.skipped) {
      deltaStr = color.dim("skipped".padStart(10));
    } else if (row.delta > 0.005) {
      deltaStr = color.green(`+${row.delta.toFixed(2)}`.padStart(10));
    } else if (row.delta < -0.005) {
      deltaStr = color.red(row.delta.toFixed(2).padStart(10));
    } else {
      deltaStr = color.dim(" 0.00".padStart(10));
    }

    lines.push(`  ${name} ${base} ${def} ${deltaStr}`);
  }

  lines.push(`  ${"─".repeat(77)}`);

  const applicable = rows.filter((r) => !r.skipped);
  if (applicable.length > 0) {
    const avgDelta = applicable.reduce((s, r) => s + r.delta, 0) / applicable.length;
    const avgBase = applicable.reduce((s, r) => s + r.baseline, 0) / applicable.length;
    const avgDef = applicable.reduce((s, r) => s + r.defuddle, 0) / applicable.length;
    const name = color.bold("Average".padEnd(45));
    const base = avgBase.toFixed(2).padStart(10);
    const def = avgDef.toFixed(2).padStart(10);
    const delta = avgDelta > 0.005
      ? color.green(`+${avgDelta.toFixed(2)}`.padStart(10))
      : avgDelta < -0.005
        ? color.red(avgDelta.toFixed(2).padStart(10))
        : color.dim(" 0.00".padStart(10));
    lines.push(`  ${name} ${base} ${def} ${delta}`);
  }

  lines.push("");
  return lines.join("\n");
}

function formatKreuzbergCompareTable(rows: CompareRow[]): string {
  const lines: string[] = [];
  const color = {
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  };

  lines.push("");
  lines.push(color.bold("  A/B: Non-HTML fixtures (Tuned Kreuzberg vs Baseline)"));
  lines.push("");

  const header = `  ${"Fixture".padEnd(45)} ${"Baseline".padStart(10)} ${"Tuned".padStart(10)} ${"Delta".padStart(10)}`;
  lines.push(color.bold(header));
  lines.push(`  ${"─".repeat(77)}`);

  for (const row of rows) {
    const name = `${row.documentClass}/${row.fixture}`.slice(0, 44).padEnd(45);
    const base = row.baseline.toFixed(2).padStart(10);
    const tuned = row.defuddle.toFixed(2).padStart(10);

    let deltaStr: string;
    if (row.delta > 0.005) {
      deltaStr = color.green(`+${row.delta.toFixed(2)}`.padStart(10));
    } else if (row.delta < -0.005) {
      deltaStr = color.red(row.delta.toFixed(2).padStart(10));
    } else {
      deltaStr = color.dim(" 0.00".padStart(10));
    }

    lines.push(`  ${name} ${base} ${tuned} ${deltaStr}`);
  }

  lines.push(`  ${"─".repeat(77)}`);

  if (rows.length > 0) {
    const avgDelta = rows.reduce((s, r) => s + r.delta, 0) / rows.length;
    const avgBase = rows.reduce((s, r) => s + r.baseline, 0) / rows.length;
    const avgTuned = rows.reduce((s, r) => s + r.defuddle, 0) / rows.length;
    const name = color.bold("Average".padEnd(45));
    const base = avgBase.toFixed(2).padStart(10);
    const tuned = avgTuned.toFixed(2).padStart(10);
    const delta = avgDelta > 0.005
      ? color.green(`+${avgDelta.toFixed(2)}`.padStart(10))
      : avgDelta < -0.005
        ? color.red(avgDelta.toFixed(2).padStart(10))
        : color.dim(" 0.00".padStart(10));
    lines.push(`  ${name} ${base} ${tuned} ${delta}`);
  }

  lines.push("");
  return lines.join("\n");
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

  // --- A/B compare mode ---
  if (args.compare) {
    const htmlFixtures = fixtures.filter((f) => HTML_CLASSES.has(f.documentClass));
    if (htmlFixtures.length === 0) {
      console.error("No HTML fixtures found for comparison.");
      process.exit(1);
    }

    console.log(`\n  Running A/B comparison on ${htmlFixtures.length} HTML fixture(s)...\n`);

    const rows: CompareRow[] = [];
    for (const fixture of htmlFixtures) {
      const isEmail = fixture.documentClass === "email-html";

      // Baseline: skip Defuddle
      const baseline = await runHtmlFixtureWithOptions(fixture, true);

      // Experiment: with Defuddle (unless email — Defuddle is already skipped for email)
      const experiment = isEmail
        ? baseline
        : await runHtmlFixtureWithOptions(fixture, false);

      rows.push({
        fixture: fixture.fileName,
        documentClass: fixture.documentClass,
        baseline: baseline.score,
        defuddle: experiment.score,
        delta: experiment.score - baseline.score,
        skipped: isEmail,
      });

      if (args.verbose) {
        const tag = isEmail ? " (email, skipped)" : "";
        console.log(
          `  ${fixture.documentClass}/${fixture.fileName}: ` +
            `baseline=${baseline.score.toFixed(2)} defuddle=${experiment.score.toFixed(2)} ` +
            `delta=${(experiment.score - baseline.score).toFixed(2)}${tag}`,
        );
      }
    }

    console.log(formatCompareTable(rows));
    return;
  }

  // --- Kreuzberg A/B compare mode ---
  if (args.compareKreuzberg) {
    const nonHtmlFixtures = fixtures.filter((f) => !HTML_CLASSES.has(f.documentClass));
    if (nonHtmlFixtures.length === 0) {
      console.error("No non-HTML fixtures found for Kreuzberg comparison.");
      process.exit(1);
    }

    console.log(`\n  Running Kreuzberg A/B comparison on ${nonHtmlFixtures.length} fixture(s)...\n`);

    const rows: CompareRow[] = [];
    for (const fixture of nonHtmlFixtures) {
      const useSmartOcr = fixture.documentClass === "pdf-scanned" || fixture.meta.expect?.requiresOcr;

      // Baseline: no MIME-aware tuning
      const baselineResult = await extract(fixture.filePath, { smartOcr: useSmartOcr, skipTuning: true });
      const baselineScores = scoreFixture(baselineResult.contentMarkdown, fixture);
      const baselineScore = computeOverall(baselineScores);

      // Tuned: full MIME-aware config + post-processing
      const tunedResult = await extract(fixture.filePath, { smartOcr: useSmartOcr });
      const tunedScores = scoreFixture(tunedResult.contentMarkdown, fixture);
      const tunedScore = computeOverall(tunedScores);

      rows.push({
        fixture: fixture.fileName,
        documentClass: fixture.documentClass,
        baseline: baselineScore,
        defuddle: tunedScore, // reuse field — labeled "Tuned" in output
        delta: tunedScore - baselineScore,
        skipped: false,
      });

      if (args.verbose) {
        console.log(
          `  ${fixture.documentClass}/${fixture.fileName}: ` +
            `baseline=${baselineScore.toFixed(2)} tuned=${tunedScore.toFixed(2)} ` +
            `delta=${(tunedScore - baselineScore).toFixed(2)}`,
        );
      }
    }

    console.log(formatKreuzbergCompareTable(rows));
    return;
  }

  // --- Standard eval mode ---
  console.log(`\n  Running eval on ${fixtures.length} fixture(s)...\n`);

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

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type {
  FixtureResult,
  EvalReport,
  ClassSummary,
  FailureEntry,
  ScoringDimension,
  DocumentClass,
} from "./types";

const DIMENSIONS: ScoringDimension[] = [
  "structure",
  "tables",
  "headings",
  "noise",
  "ocr",
  "links",
  "contentExtraction",
];

/** ANSI color helpers */
const color = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function colorScore(score: number): string {
  const text = score.toFixed(2);
  if (score >= 0.8) return color.green(text);
  if (score >= 0.5) return color.yellow(text);
  return color.red(text);
}

/** Build an EvalReport from fixture results */
export function buildReport(results: FixtureResult[], engineInfo: EvalReport["engineInfo"]): EvalReport {
  // Group by class
  const byClassMap = new Map<DocumentClass, FixtureResult[]>();
  for (const r of results) {
    const cls = r.fixture.documentClass;
    if (!byClassMap.has(cls)) byClassMap.set(cls, []);
    byClassMap.get(cls)!.push(r);
  }

  const byClass: ClassSummary[] = [];
  for (const [cls, classResults] of byClassMap) {
    const avgOverall =
      classResults.reduce((sum, r) => sum + r.overallScore, 0) / classResults.length;

    const avgByDimension = {} as Record<ScoringDimension, number>;
    for (const dim of DIMENSIONS) {
      const applicable = classResults.filter((r) => r.scores[dim].applicable);
      avgByDimension[dim] =
        applicable.length > 0
          ? applicable.reduce((sum, r) => sum + r.scores[dim].score, 0) / applicable.length
          : -1; // -1 = not applicable for this class
    }

    byClass.push({ documentClass: cls, count: classResults.length, avgOverall, avgByDimension });
  }

  byClass.sort((a, b) => a.documentClass.localeCompare(b.documentClass));

  // Top failures: all (fixture, dimension, score) where score < 0.7
  const failures: FailureEntry[] = [];
  for (const r of results) {
    for (const dim of DIMENSIONS) {
      const ds = r.scores[dim];
      if (ds.applicable && ds.score < 0.7) {
        failures.push({
          fixtureName: r.fixture.fileName,
          documentClass: r.fixture.documentClass,
          dimension: dim,
          score: ds.score,
          details: ds.details,
        });
      }
    }
  }
  failures.sort((a, b) => a.score - b.score);
  const topFailures = failures.slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    fixtureCount: results.length,
    byClass,
    topFailures,
    engineInfo,
  };
}

/** Format report as a CLI table with ANSI colors */
export function formatCliTable(report: EvalReport): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(color.bold("  Evaluation Report"));
  lines.push(color.dim(`  ${report.timestamp}  |  ${report.fixtureCount} fixture(s)`));
  if (report.engineInfo.pandocVersion) {
    lines.push(color.dim(`  Pandoc: ${report.engineInfo.pandocVersion}`));
  }
  lines.push("");

  // Header
  const header = [
    "Class".padEnd(16),
    "Cnt".padStart(4),
    "Overall".padStart(8),
    ...DIMENSIONS.map((d) => d.slice(0, 6).padStart(8)),
  ].join("  ");
  lines.push(`  ${color.bold(header)}`);
  lines.push(`  ${"─".repeat(header.length)}`);

  // Rows
  for (const cls of report.byClass) {
    const row = [
      cls.documentClass.padEnd(16),
      String(cls.count).padStart(4),
      colorScore(cls.avgOverall).padStart(8 + 9), // +9 for ANSI codes
      ...DIMENSIONS.map((d) => {
        const val = cls.avgByDimension[d];
        if (val < 0) return color.dim("  N/A".padStart(8));
        return colorScore(val).padStart(8 + 9);
      }),
    ].join("  ");
    lines.push(`  ${row}`);
  }

  // Footer totals
  if (report.byClass.length > 0) {
    const totalCount = report.byClass.reduce((s, c) => s + c.count, 0);
    const avgOverall =
      report.byClass.reduce((s, c) => s + c.avgOverall * c.count, 0) / totalCount;

    lines.push(`  ${"─".repeat(header.length)}`);
    const footer = [
      color.bold("TOTAL".padEnd(16)),
      String(totalCount).padStart(4),
      colorScore(avgOverall).padStart(8 + 9),
    ].join("  ");
    lines.push(`  ${footer}`);
  }

  // Top failures
  if (report.topFailures.length > 0) {
    lines.push("");
    lines.push(color.bold("  Top Failure Patterns"));
    lines.push("");
    for (let i = 0; i < report.topFailures.length; i++) {
      const f = report.topFailures[i];
      lines.push(
        `  ${color.red(`${i + 1}.`)} ${f.fixtureName} [${f.documentClass}] ` +
          `${f.dimension}: ${colorScore(f.score)} — ${f.details}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** Write JSON report to eval/reports/ */
export async function writeReport(report: EvalReport, reportsDir: string): Promise<string> {
  await mkdir(reportsDir, { recursive: true });

  const ts = report.timestamp.replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  const fileName = `${ts}.json`;
  const filePath = join(reportsDir, fileName);

  await writeFile(filePath, JSON.stringify(report, null, 2) + "\n");
  return filePath;
}

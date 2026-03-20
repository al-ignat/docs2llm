import type { Fixture, ScoringDimension, DimensionScore } from "./types";

const HTML_CLASSES = new Set(["article-html", "webpage-html", "email-html"]);

/**
 * Score structure: heading markers, paragraph separation, mustContain strings.
 */
export function scoreStructure(content: string, fixture: Fixture): DimensionScore {
  const lines = content.split("\n");
  const checks: string[] = [];
  let score = 1.0;

  // Check for heading markers
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
  if (headings.length === 0) {
    score -= 0.3;
    checks.push("no headings found");
  }

  // Check paragraph separation (at least some blank lines between content)
  const blankLines = lines.filter((l) => l.trim() === "").length;
  const ratio = lines.length > 0 ? blankLines / lines.length : 0;
  if (ratio < 0.05 && lines.length > 10) {
    score -= 0.2;
    checks.push("very few paragraph breaks");
  }

  // Check heading hierarchy (h1 before h2, etc.)
  const levels = headings.map((h) => h.match(/^(#+)/)?.[1].length ?? 0);
  let hierarchyOk = true;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      hierarchyOk = false;
      break;
    }
  }
  if (!hierarchyOk) {
    score -= 0.15;
    checks.push("heading hierarchy skips levels");
  }

  // mustContain (case-insensitive — extraction tools may normalize headings)
  const mustContain = fixture.meta.expect?.mustContain ?? [];
  const contentLower = content.toLowerCase();
  for (const str of mustContain) {
    if (!contentLower.includes(str.toLowerCase())) {
      score -= 0.2;
      checks.push(`missing expected: "${str}"`);
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : "OK",
    applicable: true,
  };
}

/**
 * Score table extraction: pipe table syntax, count vs minTables.
 */
export function scoreTables(content: string, fixture: Fixture): DimensionScore {
  const isXlsx = fixture.documentClass === "xlsx";
  const minTables = fixture.meta.expect?.minTables;
  const applicable = isXlsx || minTables !== undefined;

  if (!applicable) {
    return { score: 1, details: "N/A", applicable: false };
  }

  // Count pipe tables: sequences of lines containing | ... |
  const lines = content.split("\n");
  let tableCount = 0;
  let inTable = false;

  for (const line of lines) {
    const isTableLine = /\|.*\|/.test(line.trim());
    if (isTableLine && !inTable) {
      tableCount++;
      inTable = true;
    } else if (!isTableLine) {
      inTable = false;
    }
  }

  const checks: string[] = [];
  let score = 1.0;

  const expected = minTables ?? (isXlsx ? 1 : 0);
  if (tableCount < expected) {
    const penalty = expected > 0 ? (1 - tableCount / expected) * 0.6 : 0.3;
    score -= penalty;
    checks.push(`found ${tableCount} tables, expected >= ${expected}`);
  }

  if (tableCount === 0 && applicable) {
    score -= 0.3;
    checks.push("no pipe tables found");
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : `${tableCount} table(s) found`,
    applicable: true,
  };
}

/**
 * Score heading extraction: count and hierarchy monotonicity.
 */
export function scoreHeadings(content: string, fixture: Fixture): DimensionScore {
  const lines = content.split("\n");
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
  const minHeadings = fixture.meta.expect?.minHeadings;
  const checks: string[] = [];
  let score = 1.0;

  if (minHeadings !== undefined && headings.length < minHeadings) {
    const penalty = minHeadings > 0 ? (1 - headings.length / minHeadings) * 0.6 : 0;
    score -= penalty;
    checks.push(`${headings.length} headings, expected >= ${minHeadings}`);
  }

  // Monotonicity: first heading should be highest level
  const levels = headings.map((h) => h.match(/^(#+)/)?.[1].length ?? 0);
  if (levels.length > 1) {
    const firstLevel = levels[0];
    if (levels.some((l) => l < firstLevel)) {
      score -= 0.15;
      checks.push("heading before first level appears at higher level");
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : `${headings.length} heading(s)`,
    applicable: true,
  };
}

/**
 * Score noise: residual HTML, MSO artifacts, style attrs, mustNotContain.
 */
export function scoreNoise(content: string, fixture: Fixture): DimensionScore {
  const checks: string[] = [];
  let score = 1.0;

  // Residual HTML tags
  const htmlTags = content.match(/<[a-z][^>]*>/gi) ?? [];
  if (htmlTags.length > 0) {
    const penalty = Math.min(0.4, htmlTags.length * 0.05);
    score -= penalty;
    checks.push(`${htmlTags.length} residual HTML tag(s)`);
  }

  // MSO artifacts
  const msoMatches = content.match(/class="Mso|<o:p>|MsoNormal/gi) ?? [];
  if (msoMatches.length > 0) {
    score -= 0.3;
    checks.push(`${msoMatches.length} MSO artifact(s)`);
  }

  // Style attributes
  const styleAttrs = content.match(/style="[^"]*"/gi) ?? [];
  if (styleAttrs.length > 0) {
    const penalty = Math.min(0.3, styleAttrs.length * 0.03);
    score -= penalty;
    checks.push(`${styleAttrs.length} style attribute(s)`);
  }

  // mustNotContain
  const mustNotContain = fixture.meta.expect?.mustNotContain ?? [];
  for (const str of mustNotContain) {
    if (content.includes(str)) {
      score -= 0.2;
      checks.push(`found unwanted: "${str}"`);
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : "clean",
    applicable: true,
  };
}

/**
 * Score OCR quality: non-empty content, alphanumeric ratio, word count.
 */
export function scoreOcr(content: string, fixture: Fixture): DimensionScore {
  const isScanned = fixture.documentClass === "pdf-scanned";
  const requiresOcr = fixture.meta.expect?.requiresOcr;
  const applicable = isScanned || !!requiresOcr;

  if (!applicable) {
    return { score: 1, details: "N/A", applicable: false };
  }

  const checks: string[] = [];
  let score = 1.0;
  const trimmed = content.trim();

  // Non-empty check
  if (trimmed.length < 20) {
    return {
      score: 0,
      details: "near-empty content from scanned document",
      applicable: true,
    };
  }

  // Alphanumeric ratio
  const alphaNum = (trimmed.match(/[a-zA-Z0-9]/g) ?? []).length;
  const ratio = alphaNum / trimmed.length;
  if (ratio < 0.6) {
    score -= 0.3;
    checks.push(`low alphanumeric ratio: ${(ratio * 100).toFixed(0)}%`);
  }

  // Word count
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (words < 20) {
    score -= 0.3;
    checks.push(`only ${words} words extracted`);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : `${words} words, ${(ratio * 100).toFixed(0)}% alphanumeric`,
    applicable: true,
  };
}

/**
 * Score link extraction: markdown link syntax, count vs minLinks.
 */
export function scoreLinks(content: string, fixture: Fixture): DimensionScore {
  const applicable = HTML_CLASSES.has(fixture.documentClass);
  if (!applicable) {
    return { score: 1, details: "N/A", applicable: false };
  }

  // Count markdown links [text](url)
  const links = content.match(/\[[^\]]+\]\([^)]+\)/g) ?? [];
  const minLinks = fixture.meta.expect?.minLinks;
  const checks: string[] = [];
  let score = 1.0;

  if (minLinks !== undefined && links.length < minLinks) {
    const penalty = minLinks > 0 ? (1 - links.length / minLinks) * 0.5 : 0.3;
    score -= penalty;
    checks.push(`${links.length} links, expected >= ${minLinks}`);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : `${links.length} link(s)`,
    applicable: true,
  };
}

/**
 * Score content extraction: penalize web boilerplate and nav link clusters.
 * Only applicable to HTML document classes.
 */
export function scoreContentExtraction(content: string, fixture: Fixture): DimensionScore {
  if (!HTML_CLASSES.has(fixture.documentClass)) {
    return { score: 1, details: "N/A", applicable: false };
  }

  const checks: string[] = [];
  let score = 1.0;

  // Check for common boilerplate patterns that should be stripped
  const boilerplate = [
    "Privacy Policy", "Terms of Service", "Cookie", "Subscribe",
    "Sign up for our newsletter", "All rights reserved",
    "Follow us on", "Share this",
  ];
  const found = boilerplate.filter((b) => content.toLowerCase().includes(b.toLowerCase()));
  if (found.length > 0) {
    const penalty = Math.min(0.4, found.length * 0.1);
    score -= penalty;
    checks.push(`boilerplate: ${found.join(", ")}`);
  }

  // Check for navigation link clusters (3+ short links on consecutive lines)
  const lines = content.split("\n");
  let navClusterCount = 0;
  let consecutiveShortLinks = 0;
  for (const line of lines) {
    const isShortLink = /^\[.{1,30}\]\(/.test(line.trim()) && line.trim().length < 80;
    consecutiveShortLinks = isShortLink ? consecutiveShortLinks + 1 : 0;
    if (consecutiveShortLinks >= 3) navClusterCount++;
  }
  if (navClusterCount > 0) {
    score -= Math.min(0.3, navClusterCount * 0.1);
    checks.push(`${navClusterCount} nav link cluster(s)`);
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    details: checks.length > 0 ? checks.join("; ") : "clean",
    applicable: true,
  };
}

/** All scoring dimensions and their functions */
const SCORERS: Record<ScoringDimension, (content: string, fixture: Fixture) => DimensionScore> = {
  structure: scoreStructure,
  tables: scoreTables,
  headings: scoreHeadings,
  noise: scoreNoise,
  ocr: scoreOcr,
  links: scoreLinks,
  contentExtraction: scoreContentExtraction,
};

/** Score a fixture across all dimensions */
export function scoreFixture(
  content: string,
  fixture: Fixture,
): Record<ScoringDimension, DimensionScore> {
  const scores = {} as Record<ScoringDimension, DimensionScore>;
  for (const [dim, fn] of Object.entries(SCORERS)) {
    scores[dim as ScoringDimension] = fn(content, fixture);
  }
  return scores;
}

/** Compute overall score as arithmetic mean of applicable dimensions */
export function computeOverall(scores: Record<ScoringDimension, DimensionScore>): number {
  const applicable = Object.values(scores).filter((s) => s.applicable);
  if (applicable.length === 0) return 1;
  const sum = applicable.reduce((acc, s) => acc + s.score, 0);
  return sum / applicable.length;
}

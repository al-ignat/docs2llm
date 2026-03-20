// Evaluation harness types

/** Document classes for fixture categorization */
export type DocumentClass =
  | "article-html"
  | "webpage-html"
  | "email-html"
  | "pdf-digital"
  | "pdf-scanned"
  | "pptx"
  | "docx"
  | "xlsx";

export const DOCUMENT_CLASSES: DocumentClass[] = [
  "article-html",
  "webpage-html",
  "email-html",
  "pdf-digital",
  "pdf-scanned",
  "pptx",
  "docx",
  "xlsx",
];

/** Sidecar .meta.yaml shape */
export interface FixtureMeta {
  description?: string;
  expect?: {
    minHeadings?: number;
    minTables?: number;
    minLinks?: number;
    mustContain?: string[];
    mustNotContain?: string[];
    requiresOcr?: boolean;
  };
  knownIssues?: string[];
  skip?: boolean;
}

/** Discovered fixture */
export interface Fixture {
  filePath: string;
  fileName: string;
  documentClass: DocumentClass;
  meta: FixtureMeta;
  metaPath: string | null;
}

/** Scoring dimensions */
export type ScoringDimension =
  | "structure"
  | "tables"
  | "headings"
  | "noise"
  | "ocr"
  | "links";

/** Per-dimension result */
export interface DimensionScore {
  score: number; // 0–1
  details: string;
  applicable: boolean;
}

/** Full result per fixture */
export interface FixtureResult {
  fixture: Fixture;
  content: string;
  scores: Record<ScoringDimension, DimensionScore>;
  overallScore: number;
  durationMs: number;
  error: string | null;
  tokenCount: number;
  wordCount: number;
}

/** Per-class summary in report */
export interface ClassSummary {
  documentClass: DocumentClass;
  count: number;
  avgOverall: number;
  avgByDimension: Record<ScoringDimension, number>;
}

/** Top failure entry */
export interface FailureEntry {
  fixtureName: string;
  documentClass: DocumentClass;
  dimension: ScoringDimension;
  score: number;
  details: string;
}

/** Aggregate evaluation report */
export interface EvalReport {
  timestamp: string;
  fixtureCount: number;
  byClass: ClassSummary[];
  topFailures: FailureEntry[];
  engineInfo: {
    pandocVersion: string | null;
    kreuzbergVersion: string | null;
  };
}

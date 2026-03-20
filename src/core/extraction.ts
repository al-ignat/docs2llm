/**
 * Extraction contract — normalized interface between extraction engines
 * and consumer surfaces (CLI, API, MCP, Raycast).
 *
 * Each engine adapter implements `Extractor` and returns `ExtractionResult`.
 * Consumers only depend on this contract, never on engine internals.
 */

// Engine identifiers (extensible for Defuddle, Docling, etc.)
export type EngineName = "kreuzberg" | "kreuzberg-wasm" | "pandoc-html";

// How the source was provided
export type SourceType = "file" | "bytes" | "html-string" | "url";

// Quality signals from the extraction engine
export interface QualitySignals {
  score: number | null; // 0-1, null if not available
  usedOcr: boolean;
  appearsScanned: boolean;
}

// Timing breakdown
export interface ExtractionTimings {
  totalMs: number;
  extractionMs?: number;
  postProcessMs?: number;
}

// Warning types
export type ExtractionWarning =
  | "image_auto_ocr"
  | "tesseract_missing_image"
  | "tesseract_missing_scanned"
  | "scanned_pdf_detected"
  | "pandoc_fallback_to_kreuzberg"
  | "pandoc_not_available";

// === The normalized result contract ===
export interface ExtractionResult {
  engine: EngineName;
  sourceType: SourceType;
  source: string; // file path, URL, "clipboard", "stdin"
  mimeType: string;
  contentMarkdown: string; // Primary output
  contentText: string; // Raw text (same as markdown for most engines)
  metadata: Record<string, unknown>;
  quality: QualitySignals;
  warnings: ExtractionWarning[];
  timings: ExtractionTimings;
}

// === The extractor interface ===
export interface ExtractOptions {
  ocr?: { enabled?: boolean; force?: boolean; language?: string };
}

export interface Extractor {
  readonly name: EngineName;
  canHandle(mimeType: string): boolean;
  extractFile(filePath: string, options?: ExtractOptions): Promise<ExtractionResult>;
  extractBytes(data: Uint8Array, mimeType: string, options?: ExtractOptions): Promise<ExtractionResult>;
}

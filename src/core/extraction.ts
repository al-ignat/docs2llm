/**
 * Extraction contract — normalized interface between extraction engines
 * and consumer surfaces (CLI, API, MCP, Raycast).
 *
 * Each engine adapter implements `Extractor` and returns `ExtractionResult`.
 * Consumers only depend on this contract, never on engine internals.
 */

// Engine identifiers (extensible for Defuddle, Docling, etc.)
export type EngineName = "kreuzberg" | "kreuzberg-wasm" | "pandoc-html" | "defuddle+pandoc-html";

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
  | "pandoc_not_available"
  | "defuddle_used"
  | "defuddle_empty_fallback"
  | "pptx_html_cleaned";

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
  skipTuning?: boolean;
}

export interface Extractor {
  readonly name: EngineName;
  canHandle(mimeType: string): boolean;
  extractFile(filePath: string, options?: ExtractOptions): Promise<ExtractionResult>;
  extractBytes(data: Uint8Array, mimeType: string, options?: ExtractOptions): Promise<ExtractionResult>;
}

// === Convenience top-level extraction function ===

import { getExtractor } from "./adapters";
import { guessMime } from "./mime";
import { extname } from "path";
import { isImageFile, isTesseractError, looksLikeScannedPdf } from "./convert";

/**
 * Extract content from a file using the best available adapter.
 * Returns a normalized ExtractionResult with engine, timings, and warnings.
 *
 * With `smartOcr: true`, auto-enables OCR for images and retries
 * scanned PDFs — matching `convertFileWithSmartOcr` behavior but
 * returning the richer ExtractionResult contract.
 */
export async function extract(
  filePath: string,
  options?: ExtractOptions & { smartOcr?: boolean },
): Promise<ExtractionResult> {
  const ext = extname(filePath).toLowerCase();
  const mime = (ext === ".html" || ext === ".htm") ? "text/html" : guessMime(filePath);
  const extractor = getExtractor(mime);

  if (!options?.smartOcr) {
    return extractor.extractFile(filePath, options);
  }

  // Smart OCR: auto-detect images and scanned PDFs
  const explicitOcr = options?.ocr?.enabled;
  const isImg = isImageFile(filePath);

  // Image auto-OCR
  if (!explicitOcr && isImg) {
    try {
      const result = await extractor.extractFile(filePath, {
        ocr: { enabled: true, force: true },
        skipTuning: options?.skipTuning,
      });
      result.quality.usedOcr = true;
      result.warnings.push("image_auto_ocr");
      return result;
    } catch (err) {
      if (isTesseractError(err)) {
        const result = await extractor.extractFile(filePath, options);
        result.warnings.push("image_auto_ocr", "tesseract_missing_image");
        return result;
      }
      throw err;
    }
  }

  // Standard extraction
  let result = await extractor.extractFile(filePath, options);

  // Scanned PDF detection + auto-retry
  if (!explicitOcr && looksLikeScannedPdf(filePath, result.contentMarkdown)) {
    result.warnings.push("scanned_pdf_detected");
    try {
      const retried = await extractor.extractFile(filePath, {
        ocr: { enabled: true, force: true },
        skipTuning: options?.skipTuning,
      });
      retried.quality.usedOcr = true;
      retried.warnings.push("scanned_pdf_detected");
      return retried;
    } catch (err) {
      if (isTesseractError(err)) {
        result.warnings.push("tesseract_missing_scanned");
      } else {
        throw err;
      }
    }
  }

  return result;
}

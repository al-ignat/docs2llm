import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";
import { countWords, estimateTokens } from "./tokens";
import { OUTBOUND_FORMATS } from "./validate";
import { guessMime } from "./mime";
import { getExtractor } from "./adapters";
import { getKreuzberg, buildExtractionConfig } from "./adapters/kreuzberg";

// Re-exports for backward compatibility — these moved to adapters
export { cleanEmailHtml, cleanPandocMarkdown } from "./adapters/pandoc-html";
import { convertHtmlToMarkdown as _convertHtmlToMarkdown } from "./adapters/pandoc-html";

/**
 * Convert HTML string to Markdown. Pandoc-first with Kreuzberg fallback.
 * Re-exported from adapters/pandoc-html for backward compat.
 */
export async function convertHtmlToMarkdown(html: string): Promise<string> {
  const { content } = await _convertHtmlToMarkdown(html);
  return content;
}

export type OutputFormat = "md" | "json" | "yaml" | "docx" | "pptx" | "html";

export interface OcrOptions {
  enabled?: boolean;
  force?: boolean;
  language?: string;
}

export interface ConversionResult {
  content: string;
  formatted: string;
  sourcePath: string;
  mimeType: string;
  outputPath?: string;
  qualityScore?: number | null;
  engine?: string;
}

export interface ConvertOptions {
  outputDir?: string;
  pandocArgs?: string[];
  ocr?: OcrOptions;
}

export async function convertBytes(
  data: Uint8Array,
  mimeType: string,
  ocr?: OcrOptions
): Promise<{ content: string; mimeType: string; metadata: Record<string, unknown>; qualityScore?: number | null }> {
  const mod = await getKreuzberg();
  return mod.extractBytes(data, mimeType, buildExtractionConfig(ocr, mod.isWasm));
}

export async function convertFile(
  filePath: string,
  format: OutputFormat,
  options?: ConvertOptions
): Promise<ConversionResult> {
  // Outbound: Markdown → DOCX/PPTX/HTML via Pandoc
  const isOutbound = extname(filePath).toLowerCase() === ".md" && OUTBOUND_FORMATS.has(format);
  if (isOutbound) {
    const outPath = await convertMarkdownTo(
      filePath,
      format as OutboundFormat,
      options?.outputDir,
      options?.pandocArgs
    );
    return {
      content: "",
      formatted: "",
      sourcePath: filePath,
      mimeType: "",
      outputPath: outPath,
    };
  }

  // Inbound: delegate to adapter
  const ext = extname(filePath).toLowerCase();
  const mime = (ext === ".html" || ext === ".htm") ? "text/html" : guessMime(filePath);
  const extractor = getExtractor(mime);
  const result = await extractor.extractFile(filePath, { ocr: options?.ocr });

  const formatted = formatOutput(
    result.contentMarkdown, filePath, result.mimeType, result.metadata, format, result.quality.score,
  );

  return {
    content: result.contentMarkdown,
    formatted,
    sourcePath: filePath,
    mimeType: result.mimeType,
    qualityScore: result.quality.score,
    engine: result.engine,
  };
}

// --- Smart OCR: auto-detect images and scanned PDFs ---

export type SmartOcrWarning =
  | "image_auto_ocr"
  | "tesseract_missing_image"
  | "tesseract_missing_scanned"
  | "scanned_pdf_detected";

export interface SmartOcrResult extends ConversionResult {
  usedOcr: boolean;
  warnings: SmartOcrWarning[];
}

/**
 * Convert a file with automatic OCR detection.
 * - Images: auto-enable OCR, fall back if Tesseract is missing.
 * - PDFs: detect scanned pages, auto-retry with OCR.
 * If the caller provides explicit OCR options, those are used as-is.
 */
export async function convertFileWithSmartOcr(
  filePath: string,
  format: OutputFormat,
  options?: ConvertOptions,
): Promise<SmartOcrResult> {
  const explicitOcr = options?.ocr?.enabled;
  const isImg = isImageFile(filePath);
  const warnings: SmartOcrWarning[] = [];

  // Image auto-OCR (early return path — images aren't PDFs, so no scanned check)
  if (!explicitOcr && isImg) {
    warnings.push("image_auto_ocr");
    try {
      const result = await convertFile(filePath, format, { ...options, ocr: { enabled: true, force: true } });
      return { ...result, usedOcr: true, warnings };
    } catch (err) {
      if (isTesseractError(err)) {
        warnings.push("tesseract_missing_image");
        const result = await convertFile(filePath, format, options);
        return { ...result, usedOcr: false, warnings };
      }
      throw err;
    }
  }

  // Standard conversion
  let result = await convertFile(filePath, format, options);
  let usedOcr = !!explicitOcr;

  // Scanned PDF detection + auto-retry
  if (!explicitOcr && looksLikeScannedPdf(filePath, result.content)) {
    warnings.push("scanned_pdf_detected");
    try {
      result = await convertFile(filePath, format, { ...options, ocr: { enabled: true, force: true } });
      usedOcr = true;
    } catch (err) {
      if (isTesseractError(err)) {
        warnings.push("tesseract_missing_scanned");
      } else {
        throw err;
      }
    }
  }

  return { ...result, usedOcr, warnings };
}

/** Check if extraction result looks like a scanned/empty PDF */
export function looksLikeScannedPdf(filePath: string, content: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".pdf") return false;
  // Empty or near-empty content from a PDF suggests scanned pages
  const trimmed = content.trim();
  return trimmed.length < 50;
}

const IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/tiff",
  "image/bmp", "image/gif", "image/webp",
]);

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp"]);

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(extname(filePath).toLowerCase());
}

/** Check if an error is caused by missing Tesseract installation */
export function isTesseractError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /TESSDATA_PREFIX|tesseract|tessdata/i.test(msg);
}

export const TESSERACT_INSTALL_HINT =
  "Tesseract OCR is not installed. To enable OCR:\n" +
  "  macOS:   brew install tesseract\n" +
  "  Ubuntu:  sudo apt install tesseract-ocr\n" +
  "  Windows: choco install tesseract\n" +
  "  More:    https://github.com/tesseract-ocr/tesseract";

export function formatOutput(
  content: string,
  source: string,
  mimeType: string,
  metadata: Record<string, unknown>,
  format: OutputFormat,
  qualityScore?: number | null,
): string {
  if (format === "md") {
    return content;
  }

  // Rich structured output with token stats
  const words = countWords(content);
  const tokens = estimateTokens(content, words);

  const data: Record<string, unknown> = {
    source: source,
    mimeType: mimeType,
    words,
    tokens,
    metadata: metadata,
    content: content,
  };

  if (qualityScore != null) {
    data.qualityScore = qualityScore;
  }

  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  // yaml
  return yamlStringify(data);
}

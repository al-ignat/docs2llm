import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";
import { countWords, estimateTokens } from "./tokens";

export type OutputFormat = "md" | "json" | "yaml" | "docx" | "pptx" | "html";

const OUTBOUND_FORMATS = new Set<string>(["docx", "pptx", "html"]);

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
}

export interface ConvertOptions {
  outputDir?: string;
  pandocArgs?: string[];
  ocr?: OcrOptions;
}

interface ExtractionResult {
  content: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  qualityScore?: number | null;
}

type ExtractFileFn = (path: string, mime: any, config?: any) => Promise<ExtractionResult>;
type ExtractBytesFn = (data: Uint8Array, mimeType: string, config?: any) => Promise<ExtractionResult>;

interface KreuzbergModule {
  extractFile: ExtractFileFn;
  extractBytes: ExtractBytesFn;
  isWasm: boolean;
}

let kreuzbergPromise: Promise<KreuzbergModule> | null = null;

async function loadKreuzberg(): Promise<KreuzbergModule> {
  try {
    const mod = await import("@kreuzberg/node");
    return { extractFile: mod.extractFile, extractBytes: mod.extractBytes, isWasm: false };
  } catch {
    const wasm = await import("@kreuzberg/wasm");
    await wasm.initWasm();
    return { extractFile: wasm.extractFile, extractBytes: wasm.extractBytes, isWasm: true };
  }
}

function getKreuzberg(): Promise<KreuzbergModule> {
  if (!kreuzbergPromise) {
    kreuzbergPromise = loadKreuzberg();
  }
  return kreuzbergPromise;
}


function buildExtractionConfig(ocr: OcrOptions | undefined, isWasm: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = {
    outputFormat: "markdown",
    enableQualityProcessing: true,
  };

  if (ocr?.enabled || ocr?.force) {
    config.ocr = {
      backend: isWasm ? "tesseract-wasm" : "tesseract",
      ...(ocr.language ? { language: ocr.language } : {}),
    };
  }

  if (ocr?.force) {
    config.forceOcr = true;
  }

  return config;
}

export async function convertBytes(
  data: Uint8Array,
  mimeType: string,
  ocr?: OcrOptions
): Promise<{ content: string; mimeType: string; metadata: Record<string, unknown>; qualityScore?: number | null }> {
  const mod = await getKreuzberg();
  return mod.extractBytes(data, mimeType, buildExtractionConfig(ocr, mod.isWasm));
}

export async function convertHtmlToMarkdown(html: string): Promise<string> {
  const mod = await getKreuzberg();
  const buffer = new TextEncoder().encode(html);
  const result = await mod.extractBytes(buffer, "text/html", {
    outputFormat: "markdown",
    htmlOptions: {
      preprocessing: {
        enabled: true,
        removeNavigation: true,
        removeForms: true,
      },
    },
  });
  return result.content;
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

  // Inbound: documents → text via Kreuzberg
  const mod = await getKreuzberg();
  const config = buildExtractionConfig(options?.ocr, mod.isWasm);
  const result = await mod.extractFile(filePath, null, config);

  const textContent = result.content;
  const formatted = formatOutput(textContent, filePath, result.mimeType, result.metadata, format, result.qualityScore);

  return {
    content: textContent,
    formatted,
    sourcePath: filePath,
    mimeType: result.mimeType,
    qualityScore: result.qualityScore,
  };
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
  const tokens = estimateTokens(content);

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

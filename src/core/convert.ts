import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, checkPandoc, type OutboundFormat } from "./outbound";
import { countWords, estimateTokens } from "./tokens";
import { OUTBOUND_FORMATS } from "./validate";

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
  html = cleanEmailHtml(html);

  // Prefer Pandoc: handles rowspan/colspan, multi-line cells via grid tables
  try {
    if (await checkPandoc()) {
      return await pandocHtmlToMarkdown(html);
    }
  } catch {
    // Pandoc failed — fall back to Kreuzberg
  }

  // Fallback: Kreuzberg (handles simple tables, no merged cell support)
  const mod = await getKreuzberg();
  const buffer = new TextEncoder().encode(html);
  const result = await mod.extractBytes(buffer, "text/html", {
    outputFormat: "markdown",
    htmlOptions: {
      preprocessing: {
        enabled: true,
        preset: "aggressive",
        removeNavigation: true,
        removeForms: true,
      },
    },
  });
  return result.content;
}

/** Strip Outlook/email-specific HTML cruft before conversion. */
export function cleanEmailHtml(html: string): string {
  return html
    // MSO conditional comments: <!--[if gte mso 9]>...<![endif]-->
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
    // Orphaned endif comments
    .replace(/<!\[endif\]-->/gi, "")
    // MSO XML elements: <o:p>, <o:OfficeDocumentSettings>, etc.
    .replace(/<o:[^>]*(?:\/>|>[\s\S]*?<\/o:[^>]*>)/gi, "")
    // Embedded XML blocks
    .replace(/<xml>[\s\S]*?<\/xml>/gi, "")
    // MSO-specific classes (no semantic value)
    .replace(/ class="Mso[^"]*"/gi, "");
}

const PANDOC_HTML_TIMEOUT_MS = 30_000;

async function pandocHtmlToMarkdown(html: string): Promise<string> {
  const proc = Bun.spawn([
    "pandoc",
    "-f", "html",
    "-t", "markdown+pipe_tables-simple_tables-multiline_tables-raw_html-native_divs-native_spans-header_attributes-bracketed_spans-fenced_divs",
    "--wrap=none",
  ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });

  proc.stdin.write(html);
  proc.stdin.end();

  const timeout = setTimeout(() => proc.kill(), PANDOC_HTML_TIMEOUT_MS);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  clearTimeout(timeout);

  if (code !== 0) {
    throw new Error(`Pandoc HTML conversion failed (exit ${code}): ${stderr.trim()}`);
  }

  return cleanPandocMarkdown(stdout);
}

/** Post-process Pandoc markdown output for clean LLM consumption. */
export function cleanPandocMarkdown(md: string): string {
  return md
    // Unwrap Pandoc bracketed spans: [text]{style="..."} or [text]{.class} → text
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1")
    // Strip remaining standalone attribute blocks: {style="..."}, {.class}, {}
    .replace(/\s*\{[^}]*\}/g, "")
    // Remove fenced div markers (::: ...)
    .replace(/^:::\s*.*$/gm, "")
    // Unescape common Pandoc escapes (dollar, at-sign, percent)
    .replace(/\\\$/g, "$")
    .replace(/\\@/g, "@")
    .replace(/\\%/g, "%")
    // Remove standalone hard line breaks (\ on its own line)
    .replace(/^\\\s*$/gm, "")
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  // HTML files: use enhanced pipeline (Pandoc for merged tables, email cleanup)
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html" || ext === ".htm") {
    const html = await Bun.file(filePath).text();
    const content = await convertHtmlToMarkdown(html);
    const formatted = formatOutput(content, filePath, "text/html", {}, format);
    return { content, formatted, sourcePath: filePath, mimeType: "text/html" };
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

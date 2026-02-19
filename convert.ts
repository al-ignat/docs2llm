import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";

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

let extractFileFn: ((path: string, mime: any, config?: any) => Promise<ExtractionResult>) | null = null;

async function getExtractFile() {
  if (extractFileFn) return extractFileFn;

  try {
    const mod = await import("@kreuzberg/node");
    extractFileFn = mod.extractFile;
  } catch {
    const wasm = await import("@kreuzberg/wasm");
    await wasm.initWasm();
    extractFileFn = wasm.extractFile;
  }
  return extractFileFn!;
}

type ExtractBytesFn = (data: Uint8Array, mimeType: string, config?: any) => Promise<ExtractionResult>;
let extractBytesFn: ExtractBytesFn | null = null;

async function getExtractBytes(): Promise<ExtractBytesFn> {
  if (extractBytesFn) return extractBytesFn;

  try {
    const mod = await import("@kreuzberg/node");
    extractBytesFn = mod.extractBytes;
  } catch {
    const wasm = await import("@kreuzberg/wasm");
    await wasm.initWasm();
    extractBytesFn = wasm.extractBytes;
  }
  return extractBytesFn!;
}

function buildExtractionConfig(ocr?: OcrOptions): Record<string, unknown> {
  const config: Record<string, unknown> = {
    outputFormat: "markdown",
    enableQualityProcessing: true,
  };

  if (ocr?.enabled || ocr?.force) {
    config.ocr = {
      enabled: true,
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
  const extractBytes = await getExtractBytes();
  return extractBytes(data, mimeType, buildExtractionConfig(ocr));
}

export async function convertHtmlToMarkdown(html: string): Promise<string> {
  const extractBytes = await getExtractBytes();
  const buffer = new TextEncoder().encode(html);
  const result = await extractBytes(buffer, "text/html", {
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
  const extract = await getExtractFile();
  const config = buildExtractionConfig(options?.ocr);
  const result = await extract(filePath, null, config);

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

function formatOutput(
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
  const { countWords, estimateTokens } = require("./tokens");
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

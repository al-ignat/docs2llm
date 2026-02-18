import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";

export type OutputFormat = "md" | "json" | "yaml" | "docx" | "pptx" | "html";

const OUTBOUND_FORMATS = new Set<string>(["docx", "pptx", "html"]);

export function isOutboundConversion(filePath: string, format: OutputFormat): boolean {
  return extname(filePath).toLowerCase() === ".md" && OUTBOUND_FORMATS.has(format);
}

export interface ConversionResult {
  content: string;
  formatted: string;
  sourcePath: string;
  mimeType: string;
  outputPath?: string;
}

interface ExtractionResult {
  content: string;
  mimeType: string;
  metadata: Record<string, unknown>;
}

let extractFileFn: ((path: string) => Promise<ExtractionResult>) | null = null;

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

export async function convertFile(
  filePath: string,
  format: OutputFormat
): Promise<ConversionResult> {
  // Outbound: Markdown → DOCX/PPTX/HTML via Pandoc
  if (isOutboundConversion(filePath, format)) {
    const outPath = await convertMarkdownTo(filePath, format as OutboundFormat);
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
  const result = await extract(filePath);

  const textContent = result.content;
  const formatted = formatOutput(textContent, filePath, result.mimeType, result.metadata, format);

  return {
    content: textContent,
    formatted,
    sourcePath: filePath,
    mimeType: result.mimeType,
  };
}

function formatOutput(
  content: string,
  source: string,
  mimeType: string,
  metadata: Record<string, unknown>,
  format: OutputFormat
): string {
  if (format === "md") {
    return content;
  }

  const data = {
    source: source,
    mimeType: mimeType,
    metadata: metadata,
    content: content,
  };

  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }

  // yaml
  return yamlStringify(data);
}

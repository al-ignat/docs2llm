import { stringify as yamlStringify } from "yaml";
import { extname } from "path";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";

export type OutputFormat = "md" | "json" | "yaml" | "docx" | "pptx" | "html";

const OUTBOUND_FORMATS = new Set<string>(["docx", "pptx", "html"]);

export interface ConversionResult {
  content: string;
  formatted: string;
  sourcePath: string;
  mimeType: string;
  outputPath?: string;
}

export interface ConvertOptions {
  outputDir?: string;
  pandocArgs?: string[];
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
  const result = await extract(filePath, null, { outputFormat: "markdown" });

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

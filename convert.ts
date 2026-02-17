import { stringify as yamlStringify } from "yaml";

export type OutputFormat = "md" | "json" | "yaml";

interface ConversionResult {
  content: string;
  formatted: string;
  sourcePath: string;
  mimeType: string;
}

let extractFileFn: typeof import("@kreuzberg/node").extractFile | null = null;

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
  return extractFileFn;
}

export async function convertFile(
  filePath: string,
  format: OutputFormat
): Promise<ConversionResult> {
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

/**
 * Kreuzberg extraction adapter.
 *
 * Wraps the @kreuzberg/node (native) or @kreuzberg/wasm fallback into the
 * normalized Extractor interface. This is the catch-all adapter — it handles
 * every MIME type that no more-specific adapter claims.
 */

import type { Extractor, ExtractOptions, ExtractionResult, EngineName } from "../extraction";
import { guessMime } from "../mime";

interface KreuzbergNativeResult {
  content: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  qualityScore?: number | null;
}

type ExtractFileFn = (path: string, mime: any, config?: any) => Promise<KreuzbergNativeResult>;
type ExtractBytesFn = (data: Uint8Array, mimeType: string, config?: any) => Promise<KreuzbergNativeResult>;

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

export function getKreuzberg(): Promise<KreuzbergModule> {
  if (!kreuzbergPromise) {
    kreuzbergPromise = loadKreuzberg();
  }
  return kreuzbergPromise;
}

export function buildExtractionConfig(ocr: ExtractOptions["ocr"], isWasm: boolean): Record<string, unknown> {
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

function toExtractionResult(
  native: KreuzbergNativeResult,
  engine: EngineName,
  sourceType: "file" | "bytes",
  source: string,
  startMs: number,
): ExtractionResult {
  return {
    engine,
    sourceType,
    source,
    mimeType: native.mimeType,
    contentMarkdown: native.content,
    contentText: native.content,
    metadata: native.metadata,
    quality: {
      score: native.qualityScore ?? null,
      usedOcr: false,
      appearsScanned: false,
    },
    warnings: [],
    timings: {
      totalMs: Math.round(performance.now() - startMs),
    },
  };
}

export class KreuzbergExtractor implements Extractor {
  readonly name: EngineName = "kreuzberg";

  canHandle(_mimeType: string): boolean {
    return true; // Catch-all
  }

  async extractFile(filePath: string, options?: ExtractOptions): Promise<ExtractionResult> {
    const startMs = performance.now();
    const mod = await getKreuzberg();
    const config = buildExtractionConfig(options?.ocr, mod.isWasm);
    const native = await mod.extractFile(filePath, null, config);

    const engineName: EngineName = mod.isWasm ? "kreuzberg-wasm" : "kreuzberg";
    return toExtractionResult(native, engineName, "file", filePath, startMs);
  }

  async extractBytes(data: Uint8Array, mimeType: string, options?: ExtractOptions): Promise<ExtractionResult> {
    const startMs = performance.now();
    const mod = await getKreuzberg();
    const config = buildExtractionConfig(options?.ocr, mod.isWasm);
    const native = await mod.extractBytes(data, mimeType, config);

    const engineName: EngineName = mod.isWasm ? "kreuzberg-wasm" : "kreuzberg";
    return toExtractionResult(native, engineName, "bytes", `bytes(${mimeType})`, startMs);
  }
}

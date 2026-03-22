/**
 * Kreuzberg extraction adapter.
 *
 * Wraps the @kreuzberg/node (native) or @kreuzberg/wasm fallback into the
 * normalized Extractor interface. This is the catch-all adapter — it handles
 * every MIME type that no more-specific adapter claims.
 */

import type { Extractor, ExtractOptions, ExtractionResult, ExtractionWarning, EngineName } from "../extraction";
import { guessMime } from "../mime";

interface KreuzbergTable {
  markdown?: string;
}

interface KreuzbergNativeResult {
  content: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  qualityScore?: number | null;
  tables?: KreuzbergTable[];
}

type ExtractFileFn = (path: string, mime: any, config?: any) => Promise<KreuzbergNativeResult>;
type ExtractBytesFn = (data: Uint8Array, mimeType: string, config?: any) => Promise<KreuzbergNativeResult>;

interface KreuzbergModule {
  extractFile: ExtractFileFn;
  extractBytes: ExtractBytesFn;
  isWasm: boolean;
}

let kreuzbergPromise: Promise<KreuzbergModule> | null = null;

/**
 * In compiled binaries (bun build --compile), Kreuzberg's native loader
 * fails because createRequire(import.meta.url)("../index.js") can't
 * resolve inside the $bunfs virtual filesystem. We work around this by
 * directly requiring the .node addon and injecting it via Kreuzberg's
 * __setBindingForTests helper before any extraction call.
 */
function injectNativeBinding(mod: any): void {
  if (typeof mod.__setBindingForTests !== "function") return;
  try {
    const binding = require("@kreuzberg/node-darwin-arm64/kreuzberg-node.darwin-arm64.node");
    mod.__setBindingForTests(binding);
  } catch {
    // Not on darwin-arm64 or .node file not available — let Kreuzberg's own loader handle it
  }
}

async function loadKreuzberg(): Promise<KreuzbergModule> {
  try {
    const mod = await import("@kreuzberg/node");
    injectNativeBinding(mod);
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

const PPTX_MIMES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
];

export function buildExtractionConfig(
  ocr: ExtractOptions["ocr"],
  isWasm: boolean,
  mimeType?: string,
  skipTuning?: boolean,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    outputFormat: "markdown",
    enableQualityProcessing: true,
  };

  // PDF: heading detection via font-size clustering + margin filtering
  if (!skipTuning && mimeType === "application/pdf") {
    config.pdfOptions = {
      hierarchy: {
        enabled: true,
        kClusters: 6,
        includeBbox: false,
      },
      extractMetadata: true,
      topMarginFraction: 0.05,
      bottomMarginFraction: 0.05,
    };
  }

  // PPTX: slide boundary markers
  if (!skipTuning && mimeType && PPTX_MIMES.includes(mimeType)) {
    config.pages = {
      insertPageMarkers: true,
      markerFormat: "\n---\n",
    };
  }

  // OCR
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

/**
 * Append table markdown from Kreuzberg's separate `tables[]` array
 * when the main content doesn't already contain pipe tables.
 */
export function injectTables(content: string, tables: KreuzbergTable[] | undefined): string {
  if (!tables || tables.length === 0) return content;
  if (/\|.*\|/.test(content)) return content;
  const parts = tables.map((t) => t.markdown).filter(Boolean);
  if (parts.length === 0) return content;
  return content.trim() + "\n\n" + parts.join("\n\n");
}

/**
 * Prepend PDF metadata title as a top-level heading when the content
 * doesn't already start with one.
 */
export function prependTitle(content: string, title: string | null | undefined): string {
  if (!title || /^#{1,6}\s/m.test(content)) return content;
  return `# ${title}\n\n${content}`;
}

/**
 * Strip residual HTML tags from PPTX extraction output.
 * Kreuzberg's PPTX handler often leaves raw HTML in the content;
 * this cleans it to plain markdown text.
 */
export function cleanPptxContent(content: string): string {
  return content
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Promote the first bullet after each slide marker (---) to a ## heading.
 * PPTX slide titles come through as `- Title` — this makes them headings.
 */
export function promoteSlideHeadings(content: string): string {
  if (!content.includes("---")) return content;
  return content.replace(
    /^---\n- (.+)$/gm,
    (_, title) => `---\n## ${title}`,
  );
}

function isPptxMime(mimeType: string): boolean {
  return PPTX_MIMES.includes(mimeType);
}

function toExtractionResult(
  native: KreuzbergNativeResult,
  engine: EngineName,
  sourceType: "file" | "bytes",
  source: string,
  startMs: number,
  skipTuning?: boolean,
): ExtractionResult {
  let content = native.content;
  const warnings: ExtractionWarning[] = [];

  if (!skipTuning) {
    // Inject tables from Kreuzberg's separate table array
    content = injectTables(content, native.tables);

    // Surface PDF title as heading
    const title = native.metadata?.title;
    if (typeof title === "string") {
      content = prependTitle(content, title);
    }

    // PPTX: strip residual HTML tags + promote slide titles
    if (isPptxMime(native.mimeType)) {
      if (/<[^>]+>/.test(content)) {
        content = cleanPptxContent(content);
        warnings.push("pptx_html_cleaned");
      }
      content = promoteSlideHeadings(content);
    }
  }

  return {
    engine,
    sourceType,
    source,
    mimeType: native.mimeType,
    contentMarkdown: content,
    contentText: content,
    metadata: native.metadata,
    quality: {
      score: native.qualityScore ?? null,
      usedOcr: false,
      appearsScanned: false,
    },
    warnings,
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
    const mime = guessMime(filePath);
    const config = buildExtractionConfig(options?.ocr, mod.isWasm, mime, options?.skipTuning);
    const native = await mod.extractFile(filePath, null, config);

    const engineName: EngineName = mod.isWasm ? "kreuzberg-wasm" : "kreuzberg";
    return toExtractionResult(native, engineName, "file", filePath, startMs, options?.skipTuning);
  }

  async extractBytes(data: Uint8Array, mimeType: string, options?: ExtractOptions): Promise<ExtractionResult> {
    const startMs = performance.now();
    const mod = await getKreuzberg();
    const config = buildExtractionConfig(options?.ocr, mod.isWasm, mimeType, options?.skipTuning);
    const native = await mod.extractBytes(data, mimeType, config);

    const engineName: EngineName = mod.isWasm ? "kreuzberg-wasm" : "kreuzberg";
    return toExtractionResult(native, engineName, "bytes", `bytes(${mimeType})`, startMs, options?.skipTuning);
  }
}

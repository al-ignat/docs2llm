/**
 * Pandoc HTML extraction adapter.
 *
 * Specialized adapter for HTML → Markdown conversion. Uses Pandoc for
 * high-fidelity table handling (rowspan/colspan, grid tables), with
 * Kreuzberg as fallback when Pandoc is unavailable or fails.
 *
 * For article/webpage HTML, Defuddle preprocesses the HTML to strip
 * web boilerplate (nav, sidebar, footer, ads) before Pandoc conversion.
 * Email HTML and short fragments bypass Defuddle entirely.
 */

import type { Extractor, ExtractOptions, ExtractionResult, ExtractionWarning, EngineName } from "../extraction";
import { checkPandoc } from "../outbound";
import { getKreuzberg } from "./kreuzberg";
import { defuddleHtml } from "./defuddle";

const PANDOC_HTML_TIMEOUT_MS = 30_000;

const HTML_MIMES = new Set(["text/html", "application/xhtml+xml"]);

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

/** Post-process Pandoc markdown output for clean LLM consumption. */
export function cleanPandocMarkdown(md: string): string {
  return md
    // Unwrap Pandoc bracketed spans: [text]{style="..."} or [text]{.class} → text
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1")
    // Strip remaining standalone attribute blocks: {style="..."}, {.class}, {}
    .replace(/\s*\{[^}]*\}/g, "")
    // Remove fenced div markers (::: ...)
    .replace(/^:::\s*.*$/gm, "")
    // Unescape common Pandoc escapes (dollar, at-sign, percent, tilde, hash)
    .replace(/\\\$/g, "$")
    .replace(/\\@/g, "@")
    .replace(/\\%/g, "%")
    .replace(/\\~/g, "~")
    .replace(/\\#/g, "#")
    // Remove trailing hard line breaks (\ at end of line)
    .replace(/\\\s*$/gm, "")
    // Remove orphaned bold markers (** or ** ** on their own line)
    .replace(/^\*\*\s*\*?\*?\s*$/gm, "")
    // Remove inline bold-wrapped whitespace: ** ** → single space (Outlook <b> </b> artifacts)
    .replace(/\*\*\s+\*\*/g, " ")
    // Strip NBSP-only lines (Outlook &nbsp; spacers)
    .replace(/^\u00A0+$/gm, "")
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

/** Detect email HTML by looking for MSO conditional comments and Office XML. */
export function looksLikeEmailHtml(html: string): boolean {
  return /<!--\[if[\s\S]{0,200}mso/i.test(html)
    || /<o:p>/i.test(html)
    || / class="Mso/i.test(html);
}

/** Detect short HTML fragments that are too small for Defuddle to help with. */
export function isFragmentHtml(html: string): boolean {
  return html.length < 2000
    && !/<html[\s>]/i.test(html)
    && !/<body[\s>]/i.test(html);
}

/** Run Pandoc → Kreuzberg fallback chain on HTML. */
async function pandocOrKreuzbergFallback(
  html: string,
  warnings: ExtractionWarning[],
): Promise<string> {
  try {
    if (await checkPandoc()) {
      return await pandocHtmlToMarkdown(html);
    }
    warnings.push("pandoc_not_available");
  } catch {
    warnings.push("pandoc_fallback_to_kreuzberg");
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

export interface ConvertHtmlOptions {
  skipDefuddle?: boolean;
  sourceHint?: "url" | "clipboard" | "file" | "api";
}

/**
 * Convert HTML to Markdown with intelligent routing:
 * - Email HTML (MSO artifacts): cleanEmailHtml → Pandoc
 * - Fragment HTML (<2KB, no <html>/<body>): straight to Pandoc
 * - Article/webpage HTML: Defuddle preprocessing → Pandoc
 */
export async function convertHtmlToMarkdown(
  html: string,
  options?: ConvertHtmlOptions,
): Promise<{ content: string; warnings: ExtractionWarning[]; engine: EngineName }> {
  const warnings: ExtractionWarning[] = [];

  // Email HTML: use existing cleanup path, skip Defuddle
  if (looksLikeEmailHtml(html)) {
    html = cleanEmailHtml(html);
    const content = await pandocOrKreuzbergFallback(html, warnings);
    return { content, warnings, engine: "pandoc-html" };
  }

  // Fragment HTML: too short for Defuddle to help
  if (isFragmentHtml(html)) {
    const content = await pandocOrKreuzbergFallback(html, warnings);
    return { content, warnings, engine: "pandoc-html" };
  }

  // Article/webpage HTML: try Defuddle preprocessing
  if (!options?.skipDefuddle) {
    try {
      const defResult = await defuddleHtml(html);
      if (defResult) {
        warnings.push("defuddle_used");
        // Feed Defuddle's cleaned HTML through Pandoc for table handling
        const content = await pandocOrKreuzbergFallback(defResult.cleanedHtml, warnings);
        return { content, warnings, engine: "defuddle+pandoc-html" };
      }
    } catch {
      // Defuddle failed — fall through to existing path
    }
  }

  // Fallback: existing Pandoc → Kreuzberg path
  warnings.push("defuddle_empty_fallback");
  html = cleanEmailHtml(html); // still clean MSO artifacts just in case
  const content = await pandocOrKreuzbergFallback(html, warnings);
  return { content, warnings, engine: "pandoc-html" };
}

export class PandocHtmlExtractor implements Extractor {
  readonly name: EngineName = "pandoc-html";

  canHandle(mimeType: string): boolean {
    return HTML_MIMES.has(mimeType);
  }

  async extractFile(filePath: string, _options?: ExtractOptions): Promise<ExtractionResult> {
    const startMs = performance.now();
    const html = await Bun.file(filePath).text();
    const { content, warnings, engine } = await convertHtmlToMarkdown(html);

    return {
      engine,
      sourceType: "file",
      source: filePath,
      mimeType: "text/html",
      contentMarkdown: content,
      contentText: content,
      metadata: {},
      quality: {
        score: null,
        usedOcr: false,
        appearsScanned: false,
      },
      warnings,
      timings: {
        totalMs: Math.round(performance.now() - startMs),
      },
    };
  }

  async extractBytes(data: Uint8Array, mimeType: string, _options?: ExtractOptions): Promise<ExtractionResult> {
    const startMs = performance.now();
    const html = new TextDecoder().decode(data);
    const { content, warnings, engine } = await convertHtmlToMarkdown(html);

    return {
      engine,
      sourceType: "bytes",
      source: `bytes(${mimeType})`,
      mimeType: "text/html",
      contentMarkdown: content,
      contentText: content,
      metadata: {},
      quality: {
        score: null,
        usedOcr: false,
        appearsScanned: false,
      },
      warnings,
      timings: {
        totalMs: Math.round(performance.now() - startMs),
      },
    };
  }
}

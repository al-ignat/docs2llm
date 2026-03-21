/**
 * HTML extraction adapter.
 *
 * Specialized adapter for HTML → Markdown conversion. Uses Kreuzberg
 * as the primary converter (clean pipe tables, no escaping artifacts),
 * with Pandoc for email HTML cleanup and as a fallback.
 *
 * For article/webpage HTML, Defuddle preprocesses the HTML to strip
 * web boilerplate (nav, sidebar, footer, ads) before Kreuzberg conversion.
 * Email HTML bypasses Defuddle and routes through Pandoc.
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

/** Convert HTML to Markdown via Kreuzberg (primary path — clean output, pipe tables). */
async function kreuzbergHtmlToMarkdown(html: string): Promise<string> {
  const mod = await getKreuzberg();
  const buffer = new TextEncoder().encode(html);
  const result = await mod.extractBytes(buffer, "text/html", {
    outputFormat: "markdown",
  });
  return result.content;
}

/** Run Pandoc → Kreuzberg fallback chain on HTML (used for email HTML). */
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

  return kreuzbergHtmlToMarkdown(html);
}

export interface ConvertHtmlOptions {
  skipDefuddle?: boolean;
  sourceHint?: "url" | "clipboard" | "file" | "api";
}

/**
 * Convert HTML to Markdown with intelligent routing:
 * - Email HTML (MSO artifacts): cleanEmailHtml → Pandoc (best for MSO cleanup)
 * - Fragment HTML (<2KB, no <html>/<body>): straight to Kreuzberg
 * - Article/webpage HTML: Defuddle preprocessing → Kreuzberg
 */
export async function convertHtmlToMarkdown(
  html: string,
  options?: ConvertHtmlOptions,
): Promise<{ content: string; warnings: ExtractionWarning[]; engine: EngineName }> {
  const warnings: ExtractionWarning[] = [];

  // Email HTML: Pandoc handles MSO cleanup best
  if (looksLikeEmailHtml(html)) {
    html = cleanEmailHtml(html);
    const content = await pandocOrKreuzbergFallback(html, warnings);
    return { content, warnings, engine: "pandoc-html" };
  }

  // Fragment HTML: too short for Defuddle, use Kreuzberg directly
  if (isFragmentHtml(html)) {
    const content = await kreuzbergHtmlToMarkdown(html);
    return { content, warnings, engine: "kreuzberg" };
  }

  // Article/webpage HTML: try Defuddle preprocessing → Kreuzberg
  if (!options?.skipDefuddle) {
    try {
      const defResult = await defuddleHtml(html);
      if (defResult) {
        warnings.push("defuddle_used");
        const content = await kreuzbergHtmlToMarkdown(defResult.cleanedHtml);
        return { content, warnings, engine: "defuddle+kreuzberg" };
      }
    } catch {
      // Defuddle failed — fall through to direct Kreuzberg
    }
  }

  // Fallback: Kreuzberg on raw HTML
  warnings.push("defuddle_empty_fallback");
  const content = await kreuzbergHtmlToMarkdown(html);
  return { content, warnings, engine: "kreuzberg" };
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

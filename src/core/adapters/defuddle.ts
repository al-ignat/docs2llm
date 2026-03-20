/**
 * Defuddle extraction adapter.
 *
 * Thin wrapper around Defuddle (content extraction library) that strips
 * web boilerplate (nav, sidebar, footer, ads) from article/webpage HTML.
 * Defuddle internally uses linkedom as a lightweight DOM implementation.
 *
 * Lazy-loaded via dynamic import() — zero cost when not used (email, non-HTML).
 */

export interface DefuddleResult {
  cleanedHtml: string;
  title: string | null;
  wordCount: number;
  parseTimeMs: number;
}

let defuddleImport: Promise<typeof import("defuddle/node")> | null = null;

function getDefuddle() {
  if (!defuddleImport) defuddleImport = import("defuddle/node");
  return defuddleImport;
}

/**
 * Run Defuddle content extraction on raw HTML.
 * Returns cleaned HTML (main content only) or null if extraction
 * produced nothing useful (too short / empty).
 */
export async function defuddleHtml(
  html: string,
  url?: string,
): Promise<DefuddleResult | null> {
  const { Defuddle } = await getDefuddle();
  const result = await Defuddle(html, url ?? "");

  // Return null if Defuddle extracted nothing useful
  const content = result.content?.trim();
  if (!content || content.length < 50) return null;

  return {
    cleanedHtml: content,
    title: result.title || null,
    wordCount: result.wordCount ?? 0,
    parseTimeMs: result.parseTime ?? 0,
  };
}

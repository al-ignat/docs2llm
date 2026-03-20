/**
 * Adapter registry — resolves MIME types to the best extraction adapter.
 *
 * Order matters: more specific adapters first, catch-all last.
 * Each adapter's canHandle() is tested in order; first match wins.
 */

import { KreuzbergExtractor } from "./kreuzberg";
import { PandocHtmlExtractor } from "./pandoc-html";
import type { Extractor } from "../extraction";

// Order matters: more specific first, catch-all last
const adapters: Extractor[] = [
  new PandocHtmlExtractor(),
  new KreuzbergExtractor(),
];

export function getExtractor(mimeType: string): Extractor {
  for (const adapter of adapters) {
    if (adapter.canHandle(mimeType)) return adapter;
  }
  return adapters[adapters.length - 1]; // Kreuzberg catch-all
}

export { KreuzbergExtractor } from "./kreuzberg";
export { PandocHtmlExtractor } from "./pandoc-html";

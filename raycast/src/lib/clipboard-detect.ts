import { Clipboard } from "@raycast/api";
import { existsSync } from "node:fs";

export type ClipboardContent =
  | { kind: "html"; html: string; text?: string }
  | { kind: "url"; url: string }
  | { kind: "filepath"; path: string }
  | { kind: "text"; text: string }
  | { kind: "empty" };

/**
 * Detect clipboard content type using structured Clipboard.read().
 *
 * Priority:
 * 1. file — Finder-copied file (Cmd+C on a file)
 * 2. html — rich content from web page copy
 * 3. text matching URL pattern
 * 4. text matching file path (exists on disk)
 * 5. plain text
 * 6. empty
 */
export async function detectClipboard(): Promise<ClipboardContent> {
  const clip = await Clipboard.read();

  // 1. Finder-copied file
  if (clip.file) {
    return { kind: "filepath", path: clip.file };
  }

  // 2. Rich HTML content
  if (clip.html && clip.html.trim().length > 0) {
    return { kind: "html", html: clip.html, text: clip.text };
  }

  const text = clip.text?.trim();
  if (!text) {
    return { kind: "empty" };
  }

  // 3a. file:// URL → treat as filepath
  if (/^file:\/\//i.test(text)) {
    try {
      const filePath = decodeURIComponent(new URL(text).pathname);
      if (existsSync(filePath)) {
        return { kind: "filepath", path: filePath };
      }
    } catch {
      // invalid file URL, fall through
    }
  }

  // 3b. HTTP(S) URL
  if (/^https?:\/\/\S+$/i.test(text)) {
    return { kind: "url", url: text };
  }

  // 4. File path (single line, starts with / or ~/, file exists)
  if (!text.includes("\n")) {
    const expanded = text.startsWith("~/")
      ? text.replace("~", process.env.HOME || "")
      : text;
    if (
      (text.startsWith("/") || text.startsWith("~/")) &&
      existsSync(expanded)
    ) {
      return { kind: "filepath", path: expanded };
    }
  }

  // 5. Plain text
  return { kind: "text", text };
}

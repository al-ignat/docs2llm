import { Clipboard } from "@raycast/api";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export type ClipboardContent =
  | { kind: "html"; html: string; text?: string }
  | { kind: "url"; url: string }
  | { kind: "filepath"; path: string }
  | { kind: "text"; text: string }
  | { kind: "empty" };

/**
 * Read clipboard HTML via Swift/AppKit (bypasses Raycast API limits).
 * Raycast's Clipboard.read() can miss large HTML payloads (e.g. Outlook emails).
 */
function readClipboardHtmlNative(): string | null {
  try {
    const result = execFileSync(
      "swift",
      ["-e", 'import AppKit; if let html = NSPasteboard.general.string(forType: .html) { print(html) }'],
      { encoding: "utf-8", timeout: 5000 },
    );
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Detect clipboard content type using structured Clipboard.read().
 *
 * Priority:
 * 1. file — Finder-copied file (Cmd+C on a file)
 * 2. html — rich content from web page copy (Raycast API, then Swift fallback)
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

  // 2. Rich HTML content (Raycast API)
  if (clip.html && clip.html.trim().length > 0) {
    return { kind: "html", html: clip.html, text: clip.text };
  }

  // 2b. Fallback: read HTML via Swift/AppKit (handles large payloads Raycast misses)
  const nativeHtml = readClipboardHtmlNative();
  if (nativeHtml) {
    return { kind: "html", html: nativeHtml, text: clip.text };
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

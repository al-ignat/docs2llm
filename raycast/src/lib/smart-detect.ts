import {
  Clipboard,
  getSelectedFinderItems,
  getSelectedText,
  getFrontmostApplication,
} from "@raycast/api";
import { execFile } from "node:child_process";
import { detectClipboard, ClipboardContent } from "./clipboard-detect";

export type SmartSource =
  | { origin: "finder"; path: string; direction: "inbound" | "outbound" }
  | {
      origin: "selection";
      text: string;
      richHtml?: string;
      direction: "inbound" | "outbound" | "none";
    }
  | {
      origin: "clipboard";
      clip: ClipboardContent;
      direction: "inbound" | "outbound" | "none";
    }
  | { origin: "empty" };

export function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||
    /\*\*.+\*\*/.test(text) ||
    /^[-*+]\s/m.test(text) ||
    /^\d+\.\s/m.test(text) ||
    /^```/m.test(text) ||
    /\[.+\]\(.+\)/.test(text)
  );
}

/**
 * Detect the best available source for smart commands.
 *
 * Cascade:
 * 1. Selected Finder file
 * 2. Active text selection (with optional rich HTML from clipboard)
 * 3. Clipboard fallback
 * 4. Empty
 */
export async function detectSource(): Promise<SmartSource> {
  // 1. Finder selection
  try {
    const items = await getSelectedFinderItems();
    if (items.length > 0) {
      const path = items[0].path;
      const isMd = path.endsWith(".md") || path.endsWith(".markdown");
      return {
        origin: "finder",
        path,
        direction: isMd ? "outbound" : "inbound",
      };
    }
  } catch {
    /* Finder not frontmost or no selection */
  }

  // 2. Active text selection
  try {
    const selected = await getSelectedText();
    if (selected && selected.trim().length > 0) {
      const text = selected.trim();

      // Check if clipboard has richer version (HTML) of the same selection
      const clip = await Clipboard.read();
      const clipTextMatches = clip.text?.trim() === text;
      const richHtml = clipTextMatches && clip.html ? clip.html : undefined;

      // If we have HTML, it's inbound (HTML -> MD). If text is MD, outbound.
      if (richHtml) {
        return { origin: "selection", text, richHtml, direction: "inbound" };
      }

      return {
        origin: "selection",
        text,
        direction: looksLikeMarkdown(text) ? "outbound" : "none",
      };
    }
  } catch {
    /* no selection available */
  }

  // 3. Clipboard fallback
  const clip = await detectClipboard();
  if (clip.kind === "empty") return { origin: "empty" };

  let direction: "inbound" | "outbound" | "none";
  if (clip.kind === "html" || clip.kind === "url") {
    direction = "inbound";
  } else if (clip.kind === "filepath") {
    direction =
      clip.path.endsWith(".md") || clip.path.endsWith(".markdown")
        ? "outbound"
        : "inbound";
  } else if (clip.kind === "text") {
    direction = looksLikeMarkdown(clip.text) ? "outbound" : "none";
  } else {
    direction = "none";
  }

  return { origin: "clipboard", clip, direction };
}

/** Get the POSIX path of the current Finder insertion location. */
export async function getFinderFolder(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-e",
        'tell application "Finder" to get POSIX path of (insertion location as text)',
      ],
      { timeout: 3000 },
      (err, stdout) => resolve(err ? null : stdout.trim()),
    );
  });
}

/** Check if Finder is the frontmost application. */
export async function isFinderFrontmost(): Promise<boolean> {
  try {
    const app = await getFrontmostApplication();
    return app.bundleId === "com.apple.finder";
  } catch {
    return false;
  }
}

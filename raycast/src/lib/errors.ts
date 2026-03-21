import { Toast } from "@raycast/api";
import { basename } from "node:path";

export const BINARY_NOT_FOUND_HUD =
  "docs2llm not found — set binary path in preferences";

/**
 * Clean raw CLI errors for user display.
 * Detects common patterns and returns actionable messages.
 */
export function sanitizeError(raw: string): string {
  if (!raw) return "Unknown error";

  const lower = raw.toLowerCase();

  // Timeout (run() prefixes "Timed out after Xs." when err.killed is set)
  if (lower.includes("timed out")) {
    return "Conversion timed out. Try a smaller file, or disable OCR.";
  }

  // Pandoc not installed
  if (lower.includes("pandoc")) {
    return "Pandoc is required. Install: brew install pandoc";
  }

  // Tesseract not installed (OCR)
  if (lower.includes("tesseract") || lower.includes("tessdata")) {
    return "OCR unavailable. Install: brew install tesseract";
  }

  // File not found
  if (lower.includes("enoent") || lower.includes("no such file")) {
    return "File not found. It may have been moved or deleted.";
  }

  // Permission denied
  if (lower.includes("eacces") || lower.includes("permission denied")) {
    return "Permission denied. Check file permissions.";
  }

  // Network errors
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "Network error. Check your connection and try again.";
  }

  // Strip stack trace lines and reduce paths
  let cleaned = raw
    .split("\n")
    .filter((line) => !/^\s+at\s/.test(line))
    .join("\n")
    .trim();

  // Reduce filesystem paths to basenames
  cleaned = cleaned.replace(
    /(?:\/[\w.-]+){2,}\/[\w.-]+/g,
    (match) => basename(match),
  );

  // Truncate for toast display
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 197) + "...";
  }

  return cleaned || "Unknown error";
}

/** Safe error-to-string for catch blocks. */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Build a failure Toast.Options with baked-in Pandoc/timeout/generic detection.
 * Replaces 3 identical local failToast() functions + inline Pandoc checks.
 */
export function failToast(rawMessage: string): Toast.Options {
  const friendly = sanitizeError(rawMessage);
  const lower = rawMessage.toLowerCase();

  if (lower.includes("timed out")) {
    return {
      style: Toast.Style.Failure,
      title: "Conversion timed out",
      message: friendly,
    };
  }

  if (lower.includes("pandoc")) {
    return {
      style: Toast.Style.Failure,
      title: "Pandoc required",
      message: friendly,
    };
  }

  if (lower.includes("tesseract") || lower.includes("tessdata") || lower.includes("ocr unavailable")) {
    return {
      style: Toast.Style.Failure,
      title: "OCR unavailable",
      message: friendly,
    };
  }

  return {
    style: Toast.Style.Failure,
    title: "Conversion failed",
    message: friendly,
  };
}

import { describe, it, expect, vi } from "vitest";

vi.mock("@raycast/api", () => ({
  Toast: {
    Style: { Animated: "animated", Failure: "failure", Success: "success" },
  },
}));

import { sanitizeError, extractErrorMessage, failToast, BINARY_NOT_FOUND_HUD } from "../lib/errors";

// =============================================================================

describe("sanitizeError", () => {
  it("detects timeout", () => {
    expect(sanitizeError("Timed out after 30s. some stderr")).toBe(
      "Conversion timed out. Try a smaller file, or disable OCR.",
    );
  });

  it("detects Pandoc", () => {
    expect(sanitizeError("pandoc: command not found")).toBe(
      "Pandoc is required. Install: brew install pandoc",
    );
  });

  it("detects ENOENT", () => {
    expect(sanitizeError("ENOENT: no such file or directory")).toBe(
      "File not found. It may have been moved or deleted.",
    );
  });

  it("detects EACCES", () => {
    expect(sanitizeError("EACCES: permission denied")).toBe(
      "Permission denied. Check file permissions.",
    );
  });

  it("detects network errors (ECONNREFUSED)", () => {
    expect(sanitizeError("connect ECONNREFUSED 127.0.0.1:443")).toBe(
      "Network error. Check your connection and try again.",
    );
  });

  it("detects network errors (ENOTFOUND)", () => {
    expect(sanitizeError("getaddrinfo ENOTFOUND example.com")).toBe(
      "Network error. Check your connection and try again.",
    );
  });

  it("detects fetch failed", () => {
    expect(sanitizeError("fetch failed")).toBe(
      "Network error. Check your connection and try again.",
    );
  });

  it("strips stack trace lines", () => {
    const raw = "Error: something broke\n    at Module._compile (internal)\n    at Object.run (src/cli.ts)";
    const result = sanitizeError(raw);
    expect(result).not.toContain("at Module");
    expect(result).toContain("something broke");
  });

  it("reduces filesystem paths to basenames", () => {
    const raw = "Failed to read /Users/ignat/Documents/secret/file.pdf";
    const result = sanitizeError(raw);
    expect(result).toContain("file.pdf");
    expect(result).not.toContain("/Users/ignat");
  });

  it("truncates to 200 chars", () => {
    const long = "a".repeat(300);
    const result = sanitizeError(long);
    expect(result.length).toBe(200);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("returns 'Unknown error' for empty string", () => {
    expect(sanitizeError("")).toBe("Unknown error");
  });

  it("passes through generic errors cleaned up", () => {
    expect(sanitizeError("Something went wrong")).toBe("Something went wrong");
  });
});

// =============================================================================

describe("extractErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(extractErrorMessage(new Error("bad input"))).toBe("bad input");
  });

  it("returns string as-is", () => {
    expect(extractErrorMessage("direct string")).toBe("direct string");
  });

  it("stringifies other types", () => {
    expect(extractErrorMessage(42)).toBe("42");
    expect(extractErrorMessage(null)).toBe("null");
    expect(extractErrorMessage(undefined)).toBe("undefined");
  });
});

// =============================================================================

describe("failToast", () => {
  it("returns Pandoc title and message for Pandoc errors", () => {
    const result = failToast("pandoc: command not found");
    expect(result.title).toBe("Pandoc required");
    expect(result.message).toBe("Pandoc is required. Install: brew install pandoc");
    expect(result.style).toBe("failure");
  });

  it("returns timeout title for timeout errors", () => {
    const result = failToast("Timed out after 30s. stderr output");
    expect(result.title).toBe("Conversion timed out");
    expect(result.message).toBe(
      "Conversion timed out. Try a smaller file, or disable OCR.",
    );
  });

  it("returns generic title for other errors", () => {
    const result = failToast("Something broke");
    expect(result.title).toBe("Conversion failed");
    expect(result.message).toBe("Something broke");
    expect(result.style).toBe("failure");
  });
});

// =============================================================================

describe("BINARY_NOT_FOUND_HUD", () => {
  it("is a non-empty string", () => {
    expect(typeof BINARY_NOT_FOUND_HUD).toBe("string");
    expect(BINARY_NOT_FOUND_HUD.length).toBeGreaterThan(0);
  });
});

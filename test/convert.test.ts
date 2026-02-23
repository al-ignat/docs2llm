import { describe, expect, test } from "bun:test";
import {
  formatOutput,
  looksLikeScannedPdf,
  isImageFile,
  isImageMime,
  isTesseractError,
  TESSERACT_INSTALL_HINT,
} from "../src/core/convert";

describe("looksLikeScannedPdf", () => {
  test("returns true for a .pdf with empty content", () => {
    expect(looksLikeScannedPdf("/tmp/scan.pdf", "")).toBe(true);
  });

  test("returns true for a .pdf with very short content", () => {
    expect(looksLikeScannedPdf("/tmp/scan.pdf", "  page 1  ")).toBe(true);
  });

  test("returns false for a .pdf with substantial content", () => {
    const content = "A".repeat(100);
    expect(looksLikeScannedPdf("/tmp/doc.pdf", content)).toBe(false);
  });

  test("returns false for non-pdf files regardless of content", () => {
    expect(looksLikeScannedPdf("/tmp/doc.txt", "")).toBe(false);
    expect(looksLikeScannedPdf("/tmp/doc.docx", "")).toBe(false);
  });

  test("is case-insensitive on extension", () => {
    expect(looksLikeScannedPdf("/tmp/scan.PDF", "")).toBe(true);
  });
});

describe("isImageFile", () => {
  test("recognizes common image extensions", () => {
    expect(isImageFile("photo.png")).toBe(true);
    expect(isImageFile("photo.jpg")).toBe(true);
    expect(isImageFile("photo.jpeg")).toBe(true);
    expect(isImageFile("photo.gif")).toBe(true);
    expect(isImageFile("photo.webp")).toBe(true);
    expect(isImageFile("photo.tiff")).toBe(true);
    expect(isImageFile("photo.bmp")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isImageFile("photo.PNG")).toBe(true);
    expect(isImageFile("photo.JPG")).toBe(true);
  });

  test("rejects non-image extensions", () => {
    expect(isImageFile("doc.pdf")).toBe(false);
    expect(isImageFile("script.ts")).toBe(false);
    expect(isImageFile("data.csv")).toBe(false);
  });
});

describe("isImageMime", () => {
  test("recognizes image MIME types", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/tiff")).toBe(true);
    expect(isImageMime("image/gif")).toBe(true);
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("image/bmp")).toBe(true);
  });

  test("rejects non-image MIME types", () => {
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("text/plain")).toBe(false);
    expect(isImageMime("image/svg+xml")).toBe(false);
  });
});

describe("isTesseractError", () => {
  test("detects TESSDATA_PREFIX errors", () => {
    expect(isTesseractError(new Error("TESSDATA_PREFIX is not set"))).toBe(true);
    expect(isTesseractError(new Error("Error: TESSDATA_PREFIX=/opt/homebrew/share/tessdata"))).toBe(true);
  });

  test("detects Tesseract loading errors", () => {
    expect(isTesseractError(new Error("Failed to load Tesseract"))).toBe(true);
    expect(isTesseractError(new Error("tesseract not found"))).toBe(true);
  });

  test("detects tessdata path errors", () => {
    expect(isTesseractError(new Error("Cannot find tessdata directory"))).toBe(true);
    expect(isTesseractError(new Error("/usr/share/tessdata/eng.traineddata not found"))).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isTesseractError(new Error("File not found"))).toBe(false);
    expect(isTesseractError(new Error("Pandoc is not installed"))).toBe(false);
    expect(isTesseractError(new Error("ENOENT"))).toBe(false);
  });

  test("handles non-Error objects", () => {
    expect(isTesseractError("TESSDATA_PREFIX missing")).toBe(true);
    expect(isTesseractError("some other string")).toBe(false);
    expect(isTesseractError(null)).toBe(false);
    expect(isTesseractError(undefined)).toBe(false);
    expect(isTesseractError(0)).toBe(false);
  });
});

describe("TESSERACT_INSTALL_HINT", () => {
  test("contains install instructions for all platforms", () => {
    expect(TESSERACT_INSTALL_HINT).toContain("brew install tesseract");
    expect(TESSERACT_INSTALL_HINT).toContain("apt install tesseract-ocr");
    expect(TESSERACT_INSTALL_HINT).toContain("choco install tesseract");
  });
});

describe("formatOutput", () => {
  const metadata = { title: "Test" };

  test("returns raw content for md format", () => {
    const result = formatOutput("hello", "test.md", "text/plain", metadata, "md");
    expect(result).toBe("hello");
  });

  test("returns valid JSON for json format", () => {
    const result = formatOutput("hello", "test.pdf", "application/pdf", metadata, "json");
    const parsed = JSON.parse(result);
    expect(parsed.source).toBe("test.pdf");
    expect(parsed.content).toBe("hello");
    expect(parsed.mimeType).toBe("application/pdf");
    expect(parsed.words).toBe(1);
    expect(parsed.tokens).toBeGreaterThan(0);
  });

  test("includes qualityScore in JSON when provided", () => {
    const result = formatOutput("hello", "test.pdf", "application/pdf", metadata, "json", 0.95);
    const parsed = JSON.parse(result);
    expect(parsed.qualityScore).toBe(0.95);
  });

  test("omits qualityScore in JSON when not provided", () => {
    const result = formatOutput("hello", "test.pdf", "application/pdf", metadata, "json");
    const parsed = JSON.parse(result);
    expect(parsed.qualityScore).toBeUndefined();
  });

  test("returns valid YAML for yaml format", () => {
    const result = formatOutput("hello", "test.pdf", "application/pdf", metadata, "yaml");
    expect(result).toContain("source:");
    expect(result).toContain("content:");
  });
});

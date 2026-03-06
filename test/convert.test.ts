import { describe, expect, test } from "bun:test";
import {
  formatOutput,
  looksLikeScannedPdf,
  isImageFile,
  isImageMime,
  isTesseractError,
  TESSERACT_INSTALL_HINT,
  cleanEmailHtml,
  cleanPandocMarkdown,
  convertHtmlToMarkdown,
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

describe("cleanEmailHtml", () => {
  test("removes MSO conditional comments", () => {
    const html = '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--><p>Hello</p>';
    const result = cleanEmailHtml(html);
    expect(result).not.toContain("<!--[if");
    expect(result).not.toContain("<![endif]");
    expect(result).toContain("<p>Hello</p>");
  });

  test("removes orphaned endif comments", () => {
    const html = '<p>Hello</p><![endif]-->';
    expect(cleanEmailHtml(html)).not.toContain("<![endif]");
    expect(cleanEmailHtml(html)).toContain("Hello");
  });

  test("removes MSO XML elements", () => {
    const html = '<p>Hello</p><o:p></o:p><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings>';
    const result = cleanEmailHtml(html);
    expect(result).not.toContain("<o:");
    expect(result).toContain("Hello");
  });

  test("removes self-closing MSO XML elements", () => {
    const html = '<p>Hello</p><o:p/>';
    expect(cleanEmailHtml(html)).not.toContain("<o:p/>");
  });

  test("removes embedded XML blocks", () => {
    const html = '<xml><w:WordDocument></w:WordDocument></xml><p>Hello</p>';
    const result = cleanEmailHtml(html);
    expect(result).not.toContain("<xml>");
    expect(result).toContain("Hello");
  });

  test("removes MSO-specific classes", () => {
    const html = '<p class="MsoNormal">Hello</p><p class="MsoListParagraph">World</p>';
    const result = cleanEmailHtml(html);
    expect(result).not.toContain('class="Mso');
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  test("preserves non-MSO content", () => {
    const html = '<div class="content"><p>Normal HTML</p><a href="https://example.com">Link</a></div>';
    expect(cleanEmailHtml(html)).toBe(html);
  });

  test("handles complex Outlook HTML with all patterns", () => {
    const html = [
      '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->',
      '<div class="WordSection1">',
      '<p class="MsoNormal"><span>Hello</span><o:p></o:p></p>',
      '<xml><w:WordDocument></w:WordDocument></xml>',
      '<p class="MsoNormal">World</p>',
      '</div>',
      '<![endif]-->',
    ].join("\n");
    const result = cleanEmailHtml(html);
    expect(result).not.toContain("<!--[if");
    expect(result).not.toContain("<![endif]");
    expect(result).not.toContain("<o:");
    expect(result).not.toContain("<xml>");
    expect(result).not.toContain('class="Mso');
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });
});

describe("cleanPandocMarkdown", () => {
  test("unwraps bracketed spans with style attributes", () => {
    const md = '[Hello]{style="font-size:10pt;color:white"}';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("unwraps bracketed spans with class attributes", () => {
    const md = '[Hello]{.WordSection1}';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("strips standalone attribute blocks", () => {
    const md = 'Hello {.someclass}';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("strips empty attribute blocks", () => {
    const md = 'Hello {}';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("removes fenced div markers", () => {
    const md = '::: WordSection1\nHello\n:::';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("unescapes dollar signs", () => {
    const md = '\\$1,234,567';
    expect(cleanPandocMarkdown(md)).toBe("$1,234,567");
  });

  test("removes standalone hard line breaks", () => {
    const md = 'Hello\n\\\n\nWorld';
    expect(cleanPandocMarkdown(md)).toBe("Hello\n\nWorld");
  });

  test("collapses excessive blank lines", () => {
    const md = 'Hello\n\n\n\n\nWorld';
    expect(cleanPandocMarkdown(md)).toBe("Hello\n\nWorld");
  });

  test("handles Pandoc table output with style annotations", () => {
    const md = [
      '| **[Project]{style="font-size:10pt;color:white"}** | **[Status]{style="font-size:10pt"}** |',
      '|---|---|',
      '| [Alpha]{style="font-size:10pt"} | [On Track]{style="font-size:10pt"} |',
    ].join("\n");
    const result = cleanPandocMarkdown(md);
    expect(result).toContain("**Project**");
    expect(result).toContain("**Status**");
    expect(result).toContain("Alpha");
    expect(result).not.toContain("{style=");
  });
});

describe("convertHtmlToMarkdown", () => {
  test("converts simple table to pipe table", async () => {
    const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';
    const result = await convertHtmlToMarkdown(html);
    expect(result).toContain("|");
    expect(result).toContain("Name");
    expect(result).toContain("Alice");
    expect(result).toContain("30");
  });

  test("converts table with rowspan/colspan to grid table", async () => {
    const html = [
      '<table border="1">',
      '<tr><td rowspan="2">Category</td><td colspan="2">Q4</td></tr>',
      '<tr><td>Revenue</td><td>Cost</td></tr>',
      '<tr><td>Product A</td><td>$100</td><td>$50</td></tr>',
      '</table>',
    ].join("");
    const result = await convertHtmlToMarkdown(html);
    // Grid table uses + for corners
    expect(result).toContain("+");
    expect(result).toContain("Category");
    expect(result).toContain("Revenue");
    expect(result).toContain("Product A");
    // Should NOT be a bullet list (the old broken behavior)
    expect(result).not.toContain("- Category");
  });

  test("strips Outlook conditional comments", async () => {
    const html = '<!--[if gte mso 9]><xml></xml><![endif]--><p>Hello world</p><![endif]-->';
    const result = await convertHtmlToMarkdown(html);
    expect(result).not.toContain("<!--[if");
    expect(result).not.toContain("<![endif]");
    expect(result).toContain("Hello world");
  });

  test("strips Pandoc style annotations", async () => {
    const html = '<p style="font-size:10pt;color:red">Styled text</p>';
    const result = await convertHtmlToMarkdown(html);
    expect(result).not.toContain("{style=");
    expect(result).toContain("Styled text");
  });

  test("handles multi-line cell content", async () => {
    const html = '<table><tr><td>Line 1<br>Line 2</td><td>Other</td></tr></table>';
    const result = await convertHtmlToMarkdown(html);
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    expect(result).toContain("Other");
  });

  test("converts non-table HTML correctly", async () => {
    const html = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p><ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = await convertHtmlToMarkdown(html);
    expect(result).toContain("# Title");
    expect(result).toContain("**bold**");
    expect(result).toContain("*italic*");
    expect(result).toContain("Item 1");
  });

  test("preserves links", async () => {
    const html = '<p>See <a href="https://example.com">the docs</a> for details.</p>';
    const result = await convertHtmlToMarkdown(html);
    expect(result).toContain("[the docs](https://example.com)");
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

import { describe, expect, test } from "bun:test";
import {
  formatOutput,
  looksLikeScannedPdf,
  classifyPdfContent,
  isImageFile,
  isImageMime,
  isTesseractError,
  TESSERACT_INSTALL_HINT,
  cleanEmailHtml,
  cleanPandocMarkdown,
  convertHtmlToMarkdown,
} from "../src/core/convert";

describe("classifyPdfContent", () => {
  test("classifies empty PDF as scanned", () => {
    const result = classifyPdfContent("/tmp/scan.pdf", "", null, {});
    expect(result.contentClass).toBe("scanned");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("classifies near-empty PDF as scanned", () => {
    const result = classifyPdfContent("/tmp/scan.pdf", "  page 1  ", null, {});
    expect(result.contentClass).toBe("scanned");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("classifies substantial content as digital", () => {
    const content = "A".repeat(500);
    const result = classifyPdfContent("/tmp/doc.pdf", content, 0.85, { page_count: 2 });
    expect(result.contentClass).toBe("digital");
    expect(result.shouldRetryWithOcr).toBe(false);
  });

  test("classifies low chars-per-page as scanned", () => {
    // 11 chars across 10 pages = 1.1 chars/page
    const result = classifyPdfContent("/tmp/doc.pdf", "Header text", null, { page_count: 10 });
    expect(result.contentClass).toBe("scanned");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("classifies sparse single-page as sparse-digital (no OCR)", () => {
    // 26 chars on 1 page with good quality = sparse but valid
    const result = classifyPdfContent("/tmp/cover.pdf", "Company Annual Report 2026", 0.8, { page_count: 1 });
    expect(result.contentClass).toBe("sparse-digital");
    expect(result.shouldRetryWithOcr).toBe(false);
  });

  test("classifies low quality + low density as mixed", () => {
    const content = "Some extracted text layer. " + "x".repeat(80);
    const result = classifyPdfContent("/tmp/mixed.pdf", content, 0.25, { page_count: 5 });
    expect(result.contentClass).toBe("mixed");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("classifies moderate quality concern + moderate density as mixed", () => {
    const content = "x".repeat(150);
    const result = classifyPdfContent("/tmp/mixed.pdf", content, 0.35, { page_count: 3 });
    expect(result.contentClass).toBe("mixed");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("returns digital for non-PDF files", () => {
    const result = classifyPdfContent("/tmp/doc.docx", "", null, {});
    expect(result.contentClass).toBe("digital");
    expect(result.shouldRetryWithOcr).toBe(false);
  });

  test("is case-insensitive on extension", () => {
    const result = classifyPdfContent("/tmp/scan.PDF", "", null, {});
    expect(result.contentClass).toBe("scanned");
    expect(result.shouldRetryWithOcr).toBe(true);
  });

  test("defaults page_count to 1 when not in metadata", () => {
    // 60 chars, no page_count = 60 chars/page, null quality → sparse-digital
    const result = classifyPdfContent("/tmp/doc.pdf", "x".repeat(60), null, {});
    expect(result.contentClass).toBe("sparse-digital");
    expect(result.shouldRetryWithOcr).toBe(false);
  });
});

describe("looksLikeScannedPdf (deprecated wrapper)", () => {
  test("returns true for empty PDF", () => {
    expect(looksLikeScannedPdf("/tmp/scan.pdf", "")).toBe(true);
  });

  test("returns false for substantial content", () => {
    expect(looksLikeScannedPdf("/tmp/doc.pdf", "A".repeat(100))).toBe(false);
  });

  test("returns false for non-PDF", () => {
    expect(looksLikeScannedPdf("/tmp/doc.txt", "")).toBe(false);
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

  test("unescapes tildes", () => {
    const md = '\\~11% of processing time';
    expect(cleanPandocMarkdown(md)).toBe("~11% of processing time");
  });

  test("unescapes hashes", () => {
    const md = 'Hypercare Wk \\#3';
    expect(cleanPandocMarkdown(md)).toBe("Hypercare Wk #3");
  });

  test("removes trailing hard line breaks", () => {
    const md = '**Scope**\\\n∙ 50 customers\\';
    expect(cleanPandocMarkdown(md)).toBe("**Scope**\n∙ 50 customers");
  });

  test("removes standalone hard line breaks", () => {
    const md = 'Hello\n\\\n\nWorld';
    expect(cleanPandocMarkdown(md)).toBe("Hello\n\nWorld");
  });

  test("removes orphaned bold markers", () => {
    const md = '**\n\nSome content\n\n** **';
    expect(cleanPandocMarkdown(md)).toBe("Some content");
  });

  test("removes inline bold-wrapped whitespace", () => {
    const md = 'Auto rating** **stability to unlock operator** productivity**';
    expect(cleanPandocMarkdown(md)).toBe("Auto rating stability to unlock operator** productivity**");
  });

  test("strips NBSP-only lines", () => {
    const md = 'Hello\n\u00A0\nWorld';
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

  test("converts table with rowspan/colspan — preserves content", async () => {
    const html = [
      '<table border="1">',
      '<tr><td rowspan="2">Category</td><td colspan="2">Q4</td></tr>',
      '<tr><td>Revenue</td><td>Cost</td></tr>',
      '<tr><td>Product A</td><td>$100</td><td>$50</td></tr>',
      '</table>',
    ].join("");
    const result = await convertHtmlToMarkdown(html);
    // Kreuzberg may render complex tables as lists; content must be preserved
    expect(result).toContain("Category");
    expect(result).toContain("Revenue");
    expect(result).toContain("Product A");
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

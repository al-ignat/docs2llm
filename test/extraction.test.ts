import { describe, expect, test } from "bun:test";
import { getExtractor, KreuzbergExtractor, PandocHtmlExtractor } from "../src/core/adapters";
import { cleanEmailHtml, cleanPandocMarkdown, convertHtmlToMarkdown } from "../src/core/adapters/pandoc-html";
import type { ExtractionResult, Extractor } from "../src/core/extraction";

// --- Adapter dispatch ---

describe("getExtractor", () => {
  test("returns PandocHtmlExtractor for text/html", () => {
    const ext = getExtractor("text/html");
    expect(ext.name).toBe("pandoc-html");
    expect(ext).toBeInstanceOf(PandocHtmlExtractor);
  });

  test("returns PandocHtmlExtractor for application/xhtml+xml", () => {
    const ext = getExtractor("application/xhtml+xml");
    expect(ext.name).toBe("pandoc-html");
  });

  test("returns KreuzbergExtractor for application/pdf", () => {
    const ext = getExtractor("application/pdf");
    expect(ext.name).toBe("kreuzberg");
    expect(ext).toBeInstanceOf(KreuzbergExtractor);
  });

  test("returns KreuzbergExtractor for DOCX", () => {
    const ext = getExtractor("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(ext.name).toBe("kreuzberg");
  });

  test("returns KreuzbergExtractor for image/png", () => {
    const ext = getExtractor("image/png");
    expect(ext.name).toBe("kreuzberg");
  });

  test("returns KreuzbergExtractor for unknown MIME types", () => {
    const ext = getExtractor("application/octet-stream");
    expect(ext.name).toBe("kreuzberg");
  });
});

// --- canHandle ---

describe("PandocHtmlExtractor.canHandle", () => {
  const adapter = new PandocHtmlExtractor();

  test("accepts text/html", () => {
    expect(adapter.canHandle("text/html")).toBe(true);
  });

  test("accepts application/xhtml+xml", () => {
    expect(adapter.canHandle("application/xhtml+xml")).toBe(true);
  });

  test("rejects non-HTML types", () => {
    expect(adapter.canHandle("application/pdf")).toBe(false);
    expect(adapter.canHandle("text/plain")).toBe(false);
    expect(adapter.canHandle("image/png")).toBe(false);
  });
});

describe("KreuzbergExtractor.canHandle", () => {
  const adapter = new KreuzbergExtractor();

  test("accepts everything (catch-all)", () => {
    expect(adapter.canHandle("application/pdf")).toBe(true);
    expect(adapter.canHandle("text/html")).toBe(true);
    expect(adapter.canHandle("image/png")).toBe(true);
    expect(adapter.canHandle("application/octet-stream")).toBe(true);
  });
});

// --- ExtractionResult shape validation ---

function assertExtractionResultShape(result: ExtractionResult) {
  expect(result.engine).toBeDefined();
  expect(typeof result.engine).toBe("string");
  expect(result.sourceType).toBeDefined();
  expect(result.source).toBeDefined();
  expect(result.mimeType).toBeDefined();
  expect(typeof result.contentMarkdown).toBe("string");
  expect(typeof result.contentText).toBe("string");
  expect(result.metadata).toBeDefined();
  expect(result.quality).toBeDefined();
  expect(typeof result.quality.usedOcr).toBe("boolean");
  expect(typeof result.quality.appearsScanned).toBe("boolean");
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(result.timings).toBeDefined();
  expect(typeof result.timings.totalMs).toBe("number");
}

describe("ExtractionResult shape", () => {
  test("PandocHtmlExtractor.extractBytes returns valid shape", async () => {
    const adapter = new PandocHtmlExtractor();
    const html = "<h1>Hello</h1><p>World</p>";
    const data = new TextEncoder().encode(html);
    const result = await adapter.extractBytes(data, "text/html");
    assertExtractionResultShape(result);
    expect(result.engine).toBe("pandoc-html");
    expect(result.sourceType).toBe("bytes");
    expect(result.contentMarkdown).toContain("Hello");
    expect(result.contentMarkdown).toContain("World");
  });

  test("KreuzbergExtractor.extractBytes returns valid shape", async () => {
    const adapter = new KreuzbergExtractor();
    const text = "Hello, plain text.";
    const data = new TextEncoder().encode(text);
    const result = await adapter.extractBytes(data, "text/plain");
    assertExtractionResultShape(result);
    expect(["kreuzberg", "kreuzberg-wasm"]).toContain(result.engine);
    expect(result.sourceType).toBe("bytes");
    expect(result.contentMarkdown).toContain("Hello");
  });
});

// --- cleanEmailHtml (duplicated from convert.test.ts to verify adapter export) ---

describe("cleanEmailHtml (adapter)", () => {
  test("removes MSO conditional comments", () => {
    const html = '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--><p>Hello</p>';
    const result = cleanEmailHtml(html);
    expect(result).not.toContain("<!--[if");
    expect(result).toContain("<p>Hello</p>");
  });

  test("preserves non-MSO content", () => {
    const html = '<div class="content"><p>Normal HTML</p></div>';
    expect(cleanEmailHtml(html)).toBe(html);
  });
});

// --- cleanPandocMarkdown (adapter export) ---

describe("cleanPandocMarkdown (adapter)", () => {
  test("unwraps bracketed spans with style attributes", () => {
    const md = '[Hello]{style="font-size:10pt;color:white"}';
    expect(cleanPandocMarkdown(md)).toBe("Hello");
  });

  test("collapses excessive blank lines", () => {
    const md = "Hello\n\n\n\n\nWorld";
    expect(cleanPandocMarkdown(md)).toBe("Hello\n\nWorld");
  });
});

// --- convertHtmlToMarkdown (adapter) ---

describe("convertHtmlToMarkdown (adapter)", () => {
  test("converts simple HTML to markdown with warnings array", async () => {
    const html = "<h1>Title</h1><p>Paragraph</p>";
    const result = await convertHtmlToMarkdown(html);
    expect(result.content).toContain("# Title");
    expect(result.content).toContain("Paragraph");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test("converts table HTML", async () => {
    const html = "<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>";
    const result = await convertHtmlToMarkdown(html);
    expect(result.content).toContain("|");
    expect(result.content).toContain("Name");
    expect(result.content).toContain("Alice");
  });
});

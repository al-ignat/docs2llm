import { describe, expect, test } from "bun:test";
import { getExtractor, KreuzbergExtractor, PandocHtmlExtractor } from "../src/core/adapters";
import { cleanEmailHtml, cleanPandocMarkdown, convertHtmlToMarkdown, looksLikeEmailHtml, isFragmentHtml } from "../src/core/adapters/pandoc-html";
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

  test("returns engine field", async () => {
    const html = "<h1>Title</h1><p>Paragraph</p>";
    const result = await convertHtmlToMarkdown(html);
    expect(result.engine).toBeDefined();
    expect(typeof result.engine).toBe("string");
  });
});

// --- HTML routing: looksLikeEmailHtml ---

describe("looksLikeEmailHtml", () => {
  test("returns true for MSO conditional comments", () => {
    const html = '<!--[if gte mso 9]><xml></xml><![endif]--><p>Hello</p>';
    expect(looksLikeEmailHtml(html)).toBe(true);
  });

  test("returns true for Office XML elements", () => {
    const html = '<div><o:p>&nbsp;</o:p></div>';
    expect(looksLikeEmailHtml(html)).toBe(true);
  });

  test("returns true for MsoNormal class", () => {
    const html = '<p class="MsoNormal">Text</p>';
    expect(looksLikeEmailHtml(html)).toBe(true);
  });

  test("returns false for article HTML", () => {
    const html = '<html><body><article><h1>Title</h1><p>Content</p></article></body></html>';
    expect(looksLikeEmailHtml(html)).toBe(false);
  });

  test("returns false for plain HTML", () => {
    const html = '<div><h1>Hello</h1><p>World</p></div>';
    expect(looksLikeEmailHtml(html)).toBe(false);
  });
});

// --- HTML routing: isFragmentHtml ---

describe("isFragmentHtml", () => {
  test("returns true for short HTML without html/body tags", () => {
    expect(isFragmentHtml("<p>Hello world</p>")).toBe(true);
  });

  test("returns true for short div fragment", () => {
    expect(isFragmentHtml("<div><h1>Title</h1><p>Content</p></div>")).toBe(true);
  });

  test("returns false for full HTML page", () => {
    const html = "<html><head></head><body><p>Content</p></body></html>";
    expect(isFragmentHtml(html)).toBe(false);
  });

  test("returns false for long HTML without html tag", () => {
    const html = "<p>" + "x".repeat(2000) + "</p>";
    expect(isFragmentHtml(html)).toBe(false);
  });
});

// --- HTML routing: Defuddle integration ---

describe("convertHtmlToMarkdown routing", () => {
  test("uses Defuddle for article HTML with nav/sidebar, returns defuddle_used warning", async () => {
    const html = `
      <html><head><title>Test</title></head><body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <article>
          <h1>Main Article</h1>
          <p>This is the main content that should be extracted by Defuddle. It contains enough text to pass the minimum threshold for extraction quality.</p>
          <p>Additional paragraph with more context about the topic being discussed in this article.</p>
        </article>
        <aside><h3>Related</h3><ul><li>Link 1</li></ul></aside>
        <footer><p>Copyright 2024</p><a href="/privacy">Privacy Policy</a></footer>
      </body></html>`;

    const result = await convertHtmlToMarkdown(html);
    expect(result.engine).toBe("defuddle+pandoc-html");
    expect(result.warnings).toContain("defuddle_used");
    expect(result.content).toContain("Main Article");
  });

  test("does NOT use Defuddle for email HTML", async () => {
    const html = `
      <!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
      <div class="MsoNormal"><p>Meeting notes from today.</p></div>`;

    const result = await convertHtmlToMarkdown(html);
    expect(result.engine).toBe("pandoc-html");
    expect(result.warnings).not.toContain("defuddle_used");
  });

  test("does NOT use Defuddle for short fragment HTML", async () => {
    const html = "<h1>Title</h1><p>Short content</p>";
    const result = await convertHtmlToMarkdown(html);
    expect(result.engine).toBe("pandoc-html");
    expect(result.warnings).not.toContain("defuddle_used");
  });

  test("skipDefuddle option bypasses Defuddle", async () => {
    const html = `
      <html><head><title>Test</title></head><body>
        <article>
          <h1>Article Title</h1>
          <p>This is a sufficiently long article that would normally trigger Defuddle extraction in the pipeline.</p>
          <p>Additional content to ensure the threshold is met for processing.</p>
        </article>
      </body></html>`;

    const result = await convertHtmlToMarkdown(html, { skipDefuddle: true });
    expect(result.engine).toBe("pandoc-html");
    expect(result.warnings).not.toContain("defuddle_used");
  });
});

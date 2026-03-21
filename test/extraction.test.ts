import { describe, expect, test } from "bun:test";
import { getExtractor, KreuzbergExtractor, PandocHtmlExtractor } from "../src/core/adapters";
import { buildExtractionConfig, injectTables, prependTitle, cleanPptxContent } from "../src/core/adapters/kreuzberg";
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

// --- buildExtractionConfig MIME-aware tuning ---

describe("buildExtractionConfig", () => {
  test("PDF MIME enables pdfOptions.hierarchy", () => {
    const config = buildExtractionConfig(undefined, false, "application/pdf");
    expect(config.pdfOptions).toBeDefined();
    const pdf = config.pdfOptions as Record<string, unknown>;
    const hierarchy = pdf.hierarchy as Record<string, unknown>;
    expect(hierarchy.enabled).toBe(true);
    expect(hierarchy.kClusters).toBe(6);
  });

  test("PDF MIME enables margin filtering", () => {
    const config = buildExtractionConfig(undefined, false, "application/pdf");
    const pdf = config.pdfOptions as Record<string, unknown>;
    expect(pdf.topMarginFraction).toBe(0.05);
    expect(pdf.bottomMarginFraction).toBe(0.05);
  });

  test("PPTX MIME enables page markers", () => {
    const config = buildExtractionConfig(
      undefined,
      false,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(config.pages).toBeDefined();
    const pages = config.pages as Record<string, unknown>;
    expect(pages.insertPageMarkers).toBe(true);
  });

  test("legacy PPT MIME enables page markers", () => {
    const config = buildExtractionConfig(undefined, false, "application/vnd.ms-powerpoint");
    expect(config.pages).toBeDefined();
  });

  test("non-PDF/PPTX MIME returns no pdfOptions or pages", () => {
    const config = buildExtractionConfig(undefined, false, "text/html");
    expect(config.pdfOptions).toBeUndefined();
    expect(config.pages).toBeUndefined();
  });

  test("no mimeType returns baseline config", () => {
    const config = buildExtractionConfig(undefined, false);
    expect(config.pdfOptions).toBeUndefined();
    expect(config.pages).toBeUndefined();
    expect(config.outputFormat).toBe("markdown");
    expect(config.enableQualityProcessing).toBe(true);
  });

  test("OCR options still work with mimeType", () => {
    const config = buildExtractionConfig({ enabled: true, language: "deu" }, false, "application/pdf");
    expect(config.pdfOptions).toBeDefined();
    expect(config.ocr).toBeDefined();
    const ocr = config.ocr as Record<string, unknown>;
    expect(ocr.language).toBe("deu");
  });

  test("skipTuning disables PDF and PPTX config", () => {
    const pdfConfig = buildExtractionConfig(undefined, false, "application/pdf", true);
    expect(pdfConfig.pdfOptions).toBeUndefined();

    const pptxConfig = buildExtractionConfig(
      undefined,
      false,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      true,
    );
    expect(pptxConfig.pages).toBeUndefined();
    expect(pptxConfig.outputFormat).toBe("markdown");
  });
});

// --- injectTables ---

describe("injectTables", () => {
  test("appends table markdown when content has no pipe tables", () => {
    const content = "Some paragraph text.";
    const tables = [{ markdown: "| A | B |\n|---|---|\n| 1 | 2 |" }];
    const result = injectTables(content, tables);
    expect(result).toContain("Some paragraph text.");
    expect(result).toContain("| A | B |");
  });

  test("appends multiple tables separated by blank lines", () => {
    const content = "Text.";
    const tables = [
      { markdown: "| X |\n|---|\n| 1 |" },
      { markdown: "| Y |\n|---|\n| 2 |" },
    ];
    const result = injectTables(content, tables);
    expect(result).toContain("| X |");
    expect(result).toContain("| Y |");
  });

  test("is a no-op when content already contains pipe tables", () => {
    const content = "Text\n\n| Existing | Table |\n|---|---|\n| a | b |";
    const tables = [{ markdown: "| New | Table |\n|---|---|\n| c | d |" }];
    const result = injectTables(content, tables);
    expect(result).toBe(content);
    expect(result).not.toContain("New");
  });

  test("is a no-op with empty tables array", () => {
    const content = "Some content.";
    expect(injectTables(content, [])).toBe(content);
  });

  test("is a no-op with undefined tables", () => {
    const content = "Some content.";
    expect(injectTables(content, undefined)).toBe(content);
  });
});

// --- prependTitle ---

describe("prependTitle", () => {
  test("adds title heading when content has no heading", () => {
    const content = "Some paragraph text without a heading.";
    const result = prependTitle(content, "My Document");
    expect(result).toBe("# My Document\n\nSome paragraph text without a heading.");
  });

  test("is a no-op when content already has a heading", () => {
    const content = "# Existing Heading\n\nSome text.";
    const result = prependTitle(content, "My Document");
    expect(result).toBe(content);
  });

  test("is a no-op when content has heading not at start", () => {
    const content = "Intro text.\n\n## Section Heading\n\nMore text.";
    const result = prependTitle(content, "My Document");
    expect(result).toBe(content);
  });

  test("is a no-op with null title", () => {
    const content = "Some text.";
    expect(prependTitle(content, null)).toBe(content);
  });

  test("is a no-op with empty string title", () => {
    const content = "Some text.";
    expect(prependTitle(content, "")).toBe(content);
  });
});

// --- cleanPptxContent ---

describe("cleanPptxContent", () => {
  test("strips HTML tags", () => {
    const content = '<div class="slide"><p>Hello</p><span>World</span></div>';
    const result = cleanPptxContent(content);
    expect(result).toBe("HelloWorld");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  test("decodes common HTML entities", () => {
    const content = "A&amp;B &lt;C&gt; &quot;D&quot; foo&nbsp;bar";
    const result = cleanPptxContent(content);
    expect(result).toBe('A&B <C> "D" foo bar');
  });

  test("collapses excessive blank lines", () => {
    const content = "Slide 1\n\n\n\n\nSlide 2\n\n\n\nSlide 3";
    const result = cleanPptxContent(content);
    expect(result).toBe("Slide 1\n\nSlide 2\n\nSlide 3");
  });

  test("preserves text content between tags", () => {
    const content = "<h1>Title</h1><p>First paragraph.</p><p>Second paragraph.</p>";
    const result = cleanPptxContent(content);
    expect(result).toContain("Title");
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph.");
  });

  test("handles mixed content with markdown and HTML", () => {
    const content = "# Heading\n\n<p>Some text</p>\n\n- bullet point";
    const result = cleanPptxContent(content);
    expect(result).toContain("# Heading");
    expect(result).toContain("Some text");
    expect(result).toContain("- bullet point");
    expect(result).not.toContain("<p>");
  });

  test("returns trimmed output", () => {
    const content = "  \n\n  <p>Hello</p>  \n\n  ";
    const result = cleanPptxContent(content);
    expect(result).toBe("Hello");
  });
});

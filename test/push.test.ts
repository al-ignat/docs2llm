import { describe, expect, test } from "bun:test";
import { pandocMarkdownToHtml, checkPandoc } from "../src/core/outbound";

describe("pandocMarkdownToHtml", () => {
  test("converts heading to <h1>", async () => {
    const html = await pandocMarkdownToHtml("# Hello");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
  });

  test("converts bold to <strong>", async () => {
    const html = await pandocMarkdownToHtml("**bold text**");
    expect(html).toContain("<strong>bold text</strong>");
  });

  test("converts italic to <em>", async () => {
    const html = await pandocMarkdownToHtml("*italic*");
    expect(html).toContain("<em>italic</em>");
  });

  test("converts bullet list to <ul>/<li>", async () => {
    const html = await pandocMarkdownToHtml("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
  });

  test("converts link to <a>", async () => {
    const html = await pandocMarkdownToHtml("[click](https://example.com)");
    expect(html).toContain('<a href="https://example.com">click</a>');
  });

  test("converts code block to <pre><code>", async () => {
    const html = await pandocMarkdownToHtml("```\nconst x = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  test("converts multi-paragraph markdown", async () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    const html = await pandocMarkdownToHtml(md);
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  test("handles empty string", async () => {
    const html = await pandocMarkdownToHtml("");
    expect(html).toBe("");
  });

  test("preserves inline code", async () => {
    const html = await pandocMarkdownToHtml("Use `npm install` to install");
    expect(html).toContain("<code>npm install</code>");
  });

  test("converts table to HTML table", async () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = await pandocMarkdownToHtml(md);
    expect(html).toContain("<table");
    expect(html).toContain("<td");
  });
});

describe("checkPandoc", () => {
  test("returns true when pandoc is installed", async () => {
    expect(await checkPandoc()).toBe(true);
  });
});

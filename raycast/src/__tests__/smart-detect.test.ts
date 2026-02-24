import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks (available to vi.mock factories) ---

const mocks = vi.hoisted(() => ({
  getSelectedFinderItems: vi.fn(),
  getSelectedText: vi.fn(),
  clipboardRead: vi.fn(),
  detectClipboard: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  Clipboard: { read: mocks.clipboardRead },
  getSelectedFinderItems: mocks.getSelectedFinderItems,
  getSelectedText: mocks.getSelectedText,
  getFrontmostApplication: vi.fn(),
}));

vi.mock("../lib/clipboard-detect", () => ({
  detectClipboard: mocks.detectClipboard,
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { looksLikeMarkdown, detectSource } from "../lib/smart-detect";

// =============================================================================
// looksLikeMarkdown
// =============================================================================

describe("looksLikeMarkdown", () => {
  it("detects ATX headings", () => {
    expect(looksLikeMarkdown("# Title")).toBe(true);
    expect(looksLikeMarkdown("## Subtitle")).toBe(true);
    expect(looksLikeMarkdown("###### Deep heading")).toBe(true);
  });

  it("detects bold", () => {
    expect(looksLikeMarkdown("some **bold** text")).toBe(true);
  });

  it("detects unordered lists", () => {
    expect(looksLikeMarkdown("- item")).toBe(true);
    expect(looksLikeMarkdown("* item")).toBe(true);
    expect(looksLikeMarkdown("+ item")).toBe(true);
  });

  it("detects ordered lists", () => {
    expect(looksLikeMarkdown("1. first item")).toBe(true);
    expect(looksLikeMarkdown("42. later item")).toBe(true);
  });

  it("detects code fences", () => {
    expect(looksLikeMarkdown("```\ncode\n```")).toBe(true);
    expect(looksLikeMarkdown("```typescript\nconst x = 1;\n```")).toBe(true);
  });

  it("detects links", () => {
    expect(looksLikeMarkdown("[click here](https://example.com)")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeMarkdown("hello world")).toBe(false);
    expect(looksLikeMarkdown("just a sentence.")).toBe(false);
    expect(looksLikeMarkdown("")).toBe(false);
  });

  it("ignores hashtags mid-line", () => {
    expect(looksLikeMarkdown("use #tag for tagging")).toBe(false);
  });

  it("detects markdown in multi-line content", () => {
    expect(looksLikeMarkdown("Some text\n# Heading\nMore text")).toBe(true);
  });

  it("does not false-positive on numbers without dot-space", () => {
    expect(looksLikeMarkdown("There are 42 items")).toBe(false);
  });
});

// =============================================================================
// detectSource — cascade logic
// =============================================================================

describe("detectSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedFinderItems.mockRejectedValue(new Error("no finder"));
    mocks.getSelectedText.mockRejectedValue(new Error("no selection"));
    mocks.clipboardRead.mockResolvedValue({ text: "" });
    mocks.detectClipboard.mockResolvedValue({ kind: "empty" });
  });

  // ---------------------------------------------------------------------------
  // Step 1: Finder selection
  // ---------------------------------------------------------------------------

  describe("Finder selection", () => {
    it("returns inbound for non-.md file", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([
        { path: "/tmp/report.pdf" },
      ]);
      const result = await detectSource();
      expect(result).toEqual({
        origin: "finder",
        path: "/tmp/report.pdf",
        direction: "inbound",
      });
    });

    it("returns outbound for .md file", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([
        { path: "/tmp/notes.md" },
      ]);
      const result = await detectSource();
      expect(result).toEqual({
        origin: "finder",
        path: "/tmp/notes.md",
        direction: "outbound",
      });
    });

    it("returns outbound for .markdown file", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([
        { path: "/docs/readme.markdown" },
      ]);
      const result = await detectSource();
      expect(result).toEqual({
        origin: "finder",
        path: "/docs/readme.markdown",
        direction: "outbound",
      });
    });

    it("uses first file when multiple selected", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([
        { path: "/tmp/a.pdf" },
        { path: "/tmp/b.docx" },
      ]);
      const result = await detectSource();
      expect(result).toEqual({
        origin: "finder",
        path: "/tmp/a.pdf",
        direction: "inbound",
      });
    });

    it("skips empty Finder selection", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([]);
      const result = await detectSource();
      expect(result.origin).toBe("empty");
    });
  });

  // ---------------------------------------------------------------------------
  // Step 2: Text selection
  // ---------------------------------------------------------------------------

  describe("Text selection", () => {
    it("returns selection with richHtml when clipboard matches", async () => {
      mocks.getSelectedText.mockResolvedValue("Hello world");
      mocks.clipboardRead.mockResolvedValue({
        text: "Hello world",
        html: "<p>Hello world</p>",
      });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "selection",
        text: "Hello world",
        richHtml: "<p>Hello world</p>",
        direction: "inbound",
      });
    });

    it("returns selection without richHtml when clipboard text differs", async () => {
      mocks.getSelectedText.mockResolvedValue("Hello world");
      mocks.clipboardRead.mockResolvedValue({
        text: "Something else",
        html: "<p>Something else</p>",
      });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "selection",
        text: "Hello world",
        direction: "none",
      });
    });

    it("returns outbound when selected text looks like Markdown", async () => {
      mocks.getSelectedText.mockResolvedValue("# My Title\n- item 1");
      mocks.clipboardRead.mockResolvedValue({ text: "" });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "selection",
        text: "# My Title\n- item 1",
        direction: "outbound",
      });
    });

    it("returns none for plain text selection", async () => {
      mocks.getSelectedText.mockResolvedValue("just some text");
      mocks.clipboardRead.mockResolvedValue({ text: "" });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "selection",
        text: "just some text",
        direction: "none",
      });
    });

    it("trims whitespace from selection", async () => {
      mocks.getSelectedText.mockResolvedValue("  hello  ");
      mocks.clipboardRead.mockResolvedValue({ text: "" });
      const result = await detectSource();
      expect(result.origin).toBe("selection");
      if (result.origin === "selection") expect(result.text).toBe("hello");
    });

    it("skips whitespace-only selection", async () => {
      mocks.getSelectedText.mockResolvedValue("   ");
      const result = await detectSource();
      expect(result.origin).toBe("empty");
    });
  });

  // ---------------------------------------------------------------------------
  // Step 3: Clipboard fallback
  // ---------------------------------------------------------------------------

  describe("Clipboard fallback", () => {
    it("returns inbound for HTML", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "html",
        html: "<p>content</p>",
        text: "content",
      });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "clipboard",
        clip: { kind: "html", html: "<p>content</p>", text: "content" },
        direction: "inbound",
      });
    });

    it("returns inbound for URL", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "url",
        url: "https://example.com",
      });
      const result = await detectSource();
      expect(result).toEqual({
        origin: "clipboard",
        clip: { kind: "url", url: "https://example.com" },
        direction: "inbound",
      });
    });

    it("returns inbound for non-.md filepath", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/tmp/report.pdf",
      });
      const result = await detectSource();
      if (result.origin === "clipboard")
        expect(result.direction).toBe("inbound");
    });

    it("returns outbound for .md filepath", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/tmp/notes.md",
      });
      const result = await detectSource();
      if (result.origin === "clipboard")
        expect(result.direction).toBe("outbound");
    });

    it("returns outbound for .markdown filepath", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/tmp/notes.markdown",
      });
      const result = await detectSource();
      if (result.origin === "clipboard")
        expect(result.direction).toBe("outbound");
    });

    it("returns outbound for Markdown text", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "# Title\n- item",
      });
      const result = await detectSource();
      if (result.origin === "clipboard")
        expect(result.direction).toBe("outbound");
    });

    it("returns none for plain text", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "hello world",
      });
      const result = await detectSource();
      if (result.origin === "clipboard") expect(result.direction).toBe("none");
    });

    it("returns empty for empty clipboard", async () => {
      const result = await detectSource();
      expect(result).toEqual({ origin: "empty" });
    });
  });

  // ---------------------------------------------------------------------------
  // Cascade priority
  // ---------------------------------------------------------------------------

  describe("cascade priority", () => {
    it("Finder wins over selection and clipboard", async () => {
      mocks.getSelectedFinderItems.mockResolvedValue([{ path: "/tmp/a.pdf" }]);
      mocks.getSelectedText.mockResolvedValue("some text");
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "clipboard",
      });
      const result = await detectSource();
      expect(result.origin).toBe("finder");
    });

    it("selection wins over clipboard", async () => {
      mocks.getSelectedText.mockResolvedValue("some text");
      mocks.clipboardRead.mockResolvedValue({ text: "" });
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "clipboard",
      });
      const result = await detectSource();
      expect(result.origin).toBe("selection");
    });

    it("clipboard used when Finder and selection unavailable", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "clipboard",
      });
      const result = await detectSource();
      expect(result.origin).toBe("clipboard");
    });
  });
});

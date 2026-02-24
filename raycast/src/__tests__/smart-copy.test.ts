import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  showHUD: vi.fn(),
  showToast: vi.fn(),
  clipboardCopy: vi.fn(),
  getPreferenceValues: vi.fn(() => ({})),
  isInstalled: vi.fn(),
  convertFile: vi.fn(),
  convertUrl: vi.fn(),
  convertToHtmlFromText: vi.fn(),
  exportToHtml: vi.fn(),
  detectSource: vi.fn(),
  readFileSync: vi.fn(() => "# Mock MD content"),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  Clipboard: { copy: mocks.clipboardCopy },
  showHUD: mocks.showHUD,
  showToast: mocks.showToast,
  getPreferenceValues: mocks.getPreferenceValues,
  Toast: {
    Style: { Animated: "animated", Failure: "failure", Success: "success" },
  },
}));

vi.mock("../lib/docs2llm", () => ({
  isInstalled: mocks.isInstalled,
  convertFile: mocks.convertFile,
  convertUrl: mocks.convertUrl,
  convertToHtmlFromText: mocks.convertToHtmlFromText,
  exportToHtml: mocks.exportToHtml,
}));

vi.mock("../lib/smart-detect", () => ({
  detectSource: mocks.detectSource,
}));

vi.mock("node:fs", () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
}));

import Command from "../smart-copy";

// =============================================================================

describe("Smart Copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInstalled.mockReturnValue(true);
    mocks.getPreferenceValues.mockReturnValue({
      defaultFormat: "md",
      defaultExportFormat: "docx",
      enableOcr: false,
    });
  });

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  it("shows HUD when not installed", async () => {
    mocks.isInstalled.mockReturnValue(false);
    await Command();
    expect(mocks.showHUD).toHaveBeenCalledWith(
      "docs2llm not found — set binary path in preferences",
    );
  });

  it("shows HUD when source is empty", async () => {
    mocks.detectSource.mockResolvedValue({ origin: "empty" });
    await Command();
    expect(mocks.showHUD).toHaveBeenCalledWith("Nothing to convert");
  });

  // ---------------------------------------------------------------------------
  // Finder file
  // ---------------------------------------------------------------------------

  describe("Finder file", () => {
    it("inbound: converts and copies Markdown", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/tmp/report.pdf",
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "# Report",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/report.pdf", "md", false);
      expect(mocks.clipboardCopy).toHaveBeenCalledWith("# Report");
      expect(mocks.showHUD).toHaveBeenCalledWith(
        "Copied 1 words (~2 tokens) from report.pdf",
      );
    });

    it("outbound: converts .md to rich HTML", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/docs/notes.md",
        direction: "outbound",
      });
      mocks.exportToHtml.mockResolvedValue({ html: "<h1>Notes</h1>" });

      await Command();

      expect(mocks.exportToHtml).toHaveBeenCalledWith("/docs/notes.md");
      expect(mocks.clipboardCopy).toHaveBeenCalledWith({
        html: "<h1>Notes</h1>",
        text: "# Mock MD content",
      });
      expect(mocks.showHUD).toHaveBeenCalledWith(
        "Copied notes.md as rich text",
      );
    });

    it("shows error toast on conversion failure", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/tmp/broken.pdf",
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "",
        words: 0,
        tokens: 0,
        error: "Corrupted",
      });

      await Command();

      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: "failure" }),
      );
      expect(mocks.clipboardCopy).not.toHaveBeenCalled();
    });

    it("shows Pandoc error for outbound failure", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/docs/notes.md",
        direction: "outbound",
      });
      mocks.exportToHtml.mockResolvedValue({
        error: "pandoc: command not found",
      });

      await Command();

      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pandoc required",
          message: "brew install pandoc",
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Text selection
  // ---------------------------------------------------------------------------

  describe("Text selection", () => {
    it("inbound with richHtml: converts HTML to Markdown", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "Hello",
        richHtml: "<p>Hello</p>",
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "Hello",
        words: 1,
        tokens: 1,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith(
        expect.stringContaining("docs2llm-smart-"),
        "md",
        false,
      );
      expect(mocks.clipboardCopy).toHaveBeenCalledWith("Hello");
      expect(mocks.showHUD).toHaveBeenCalledWith(
        "Converted selection to MD",
      );
    });

    it("outbound: converts Markdown to rich HTML", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "# Title",
        direction: "outbound",
      });
      mocks.convertToHtmlFromText.mockResolvedValue({ html: "<h1>Title</h1>" });

      await Command();

      expect(mocks.convertToHtmlFromText).toHaveBeenCalledWith("# Title");
      expect(mocks.clipboardCopy).toHaveBeenCalledWith({
        html: "<h1>Title</h1>",
        text: "# Title",
      });
      expect(mocks.showHUD).toHaveBeenCalledWith("Copied as rich text");
    });

    it("none: copies plain text", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "just text",
        direction: "none",
      });

      await Command();

      expect(mocks.clipboardCopy).toHaveBeenCalledWith("just text");
      expect(mocks.showHUD).toHaveBeenCalledWith("Copied");
    });
  });

  // ---------------------------------------------------------------------------
  // Clipboard fallback
  // ---------------------------------------------------------------------------

  describe("Clipboard fallback", () => {
    it("HTML → converts to Markdown", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "html", html: "<h1>Title</h1>", text: "Title" },
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "# Title",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.clipboardCopy).toHaveBeenCalledWith("# Title");
      expect(mocks.showHUD).toHaveBeenCalledWith("Converted HTML to MD");
    });

    it("URL → fetches and converts", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "url", url: "https://example.com/page" },
        direction: "inbound",
      });
      mocks.convertUrl.mockResolvedValue({
        content: "# Page",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertUrl).toHaveBeenCalledWith("https://example.com/page", "md");
      expect(mocks.clipboardCopy).toHaveBeenCalledWith("# Page");
      expect(mocks.showHUD).toHaveBeenCalledWith(
        "Converted example.com to MD",
      );
    });

    it("filepath inbound → converts file", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "filepath", path: "/tmp/doc.docx" },
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "Content",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/doc.docx", "md", false);
      expect(mocks.clipboardCopy).toHaveBeenCalledWith("Content");
    });

    it("filepath .md outbound → converts to rich HTML", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "filepath", path: "/docs/notes.md" },
        direction: "outbound",
      });
      mocks.exportToHtml.mockResolvedValue({ html: "<h1>Notes</h1>" });

      await Command();

      expect(mocks.exportToHtml).toHaveBeenCalledWith("/docs/notes.md");
      expect(mocks.clipboardCopy).toHaveBeenCalledWith({
        html: "<h1>Notes</h1>",
        text: "# Mock MD content",
      });
    });

    it("text outbound → converts MD to rich HTML", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "text", text: "# Heading" },
        direction: "outbound",
      });
      mocks.convertToHtmlFromText.mockResolvedValue({
        html: "<h1>Heading</h1>",
      });

      await Command();

      expect(mocks.convertToHtmlFromText).toHaveBeenCalledWith("# Heading");
      expect(mocks.clipboardCopy).toHaveBeenCalledWith({
        html: "<h1>Heading</h1>",
        text: "# Heading",
      });
    });

    it("text none → shows 'Already plain text'", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "text", text: "hello" },
        direction: "none",
      });

      await Command();

      expect(mocks.showHUD).toHaveBeenCalledWith("Already plain text");
      expect(mocks.clipboardCopy).not.toHaveBeenCalled();
    });
  });
});

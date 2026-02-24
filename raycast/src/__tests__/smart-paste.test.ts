import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  showHUD: vi.fn(),
  showToast: vi.fn(),
  showInFinder: vi.fn(),
  clipboardPaste: vi.fn(),
  getPreferenceValues: vi.fn(() => ({})),
  isInstalled: vi.fn(),
  convertFile: vi.fn(),
  convertUrl: vi.fn(),
  convertToHtmlFromText: vi.fn(),
  exportMarkdown: vi.fn(),
  detectClipboard: vi.fn(),
  isFinderFrontmost: vi.fn(),
  getFinderFolder: vi.fn(),
  looksLikeMarkdown: vi.fn(),
  readFileSync: vi.fn(() => "# Mock MD content"),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
  Clipboard: { paste: mocks.clipboardPaste },
  showHUD: mocks.showHUD,
  showToast: mocks.showToast,
  showInFinder: mocks.showInFinder,
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
  exportMarkdown: mocks.exportMarkdown,
}));

vi.mock("../lib/clipboard-detect", () => ({
  detectClipboard: mocks.detectClipboard,
}));

vi.mock("../lib/smart-detect", () => ({
  isFinderFrontmost: mocks.isFinderFrontmost,
  getFinderFolder: mocks.getFinderFolder,
  looksLikeMarkdown: mocks.looksLikeMarkdown,
}));

vi.mock("node:fs", () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
  renameSync: mocks.renameSync,
}));

import Command from "../smart-paste";

// =============================================================================

describe("Smart Paste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInstalled.mockReturnValue(true);
    mocks.isFinderFrontmost.mockResolvedValue(false);
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

  it("shows HUD when clipboard is empty", async () => {
    mocks.detectClipboard.mockResolvedValue({ kind: "empty" });
    await Command();
    expect(mocks.showHUD).toHaveBeenCalledWith("Clipboard is empty");
  });

  // ---------------------------------------------------------------------------
  // Paste into text app
  // ---------------------------------------------------------------------------

  describe("into text app", () => {
    it("HTML → pastes Markdown", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "html",
        html: "<h1>Title</h1>",
        text: "Title",
      });
      mocks.convertFile.mockResolvedValue({
        content: "# Title",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.clipboardPaste).toHaveBeenCalledWith("# Title");
      expect(mocks.showHUD).toHaveBeenCalledWith("Pasted as MD");
    });

    it("URL → pastes Markdown", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "url",
        url: "https://example.com",
      });
      mocks.convertUrl.mockResolvedValue({
        content: "# Example",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertUrl).toHaveBeenCalledWith("https://example.com", "md");
      expect(mocks.clipboardPaste).toHaveBeenCalledWith("# Example");
      expect(mocks.showHUD).toHaveBeenCalledWith("Pasted as MD");
    });

    it("filepath inbound → pastes Markdown", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/tmp/doc.docx",
      });
      mocks.looksLikeMarkdown.mockReturnValue(false);
      mocks.convertFile.mockResolvedValue({
        content: "Content",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/doc.docx", "md", false);
      expect(mocks.clipboardPaste).toHaveBeenCalledWith("Content");
    });

    it("filepath .md outbound → pastes rich HTML", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/docs/notes.md",
      });
      mocks.looksLikeMarkdown.mockReturnValue(false);
      mocks.convertToHtmlFromText.mockResolvedValue({ html: "<h1>Notes</h1>" });

      await Command();

      expect(mocks.readFileSync).toHaveBeenCalledWith(
        "/docs/notes.md",
        "utf-8",
      );
      expect(mocks.convertToHtmlFromText).toHaveBeenCalledWith(
        "# Mock MD content",
      );
      expect(mocks.clipboardPaste).toHaveBeenCalledWith({
        html: "<h1>Notes</h1>",
        text: "# Mock MD content",
      });
    });

    it("MD text outbound → pastes rich HTML", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "# Heading",
      });
      mocks.looksLikeMarkdown.mockReturnValue(true);
      mocks.convertToHtmlFromText.mockResolvedValue({
        html: "<h1>Heading</h1>",
      });

      await Command();

      expect(mocks.convertToHtmlFromText).toHaveBeenCalledWith("# Heading");
      expect(mocks.clipboardPaste).toHaveBeenCalledWith({
        html: "<h1>Heading</h1>",
        text: "# Heading",
      });
      expect(mocks.showHUD).toHaveBeenCalledWith("Pasted as rich text");
    });

    it("plain text → pastes as-is", async () => {
      mocks.detectClipboard.mockResolvedValue({ kind: "text", text: "hello" });
      mocks.looksLikeMarkdown.mockReturnValue(false);

      await Command();

      expect(mocks.clipboardPaste).toHaveBeenCalledWith("hello");
      expect(mocks.convertFile).not.toHaveBeenCalled();
      expect(mocks.convertToHtmlFromText).not.toHaveBeenCalled();
    });

    it("conversion error → shows failure toast", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "html",
        html: "<p>x</p>",
        text: "x",
      });
      mocks.convertFile.mockResolvedValue({
        content: "",
        words: 0,
        tokens: 0,
        error: "Failed",
      });

      await Command();

      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ style: "failure" }),
      );
      expect(mocks.clipboardPaste).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Paste into Finder
  // ---------------------------------------------------------------------------

  describe("into Finder", () => {
    beforeEach(() => {
      mocks.isFinderFrontmost.mockResolvedValue(true);
      mocks.getFinderFolder.mockResolvedValue("/Users/test/Desktop");
    });

    it("shows HUD when Finder folder not found", async () => {
      mocks.detectClipboard.mockResolvedValue({ kind: "text", text: "hello" });
      mocks.looksLikeMarkdown.mockReturnValue(false);
      mocks.getFinderFolder.mockResolvedValue(null);

      await Command();

      expect(mocks.showHUD).toHaveBeenCalledWith(
        "Could not determine Finder folder",
      );
    });

    it("HTML → saves .md file", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "html",
        html: "<h1>T</h1>",
        text: "T",
      });
      mocks.convertFile.mockResolvedValue({
        content: "# T",
        words: 1,
        tokens: 1,
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Desktop/clipboard-"),
        "# T",
        "utf-8",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("URL → saves .md file with hostname", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "url",
        url: "https://docs.example.com/guide",
      });
      mocks.convertUrl.mockResolvedValue({
        content: "# Guide",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Desktop/docs-example-com.md",
        "# Guide",
        "utf-8",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("plain text → saves .md file", async () => {
      mocks.detectClipboard.mockResolvedValue({ kind: "text", text: "hello" });
      mocks.looksLikeMarkdown.mockReturnValue(false);

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Desktop/clipboard-"),
        "hello",
        "utf-8",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("MD text outbound → exports via Pandoc", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "text",
        text: "# Heading",
      });
      mocks.looksLikeMarkdown.mockReturnValue(true);
      mocks.getPreferenceValues.mockReturnValue({
        defaultExportFormat: "docx",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/tmp/out/docs2llm-smartpaste-123.docx",
      });

      await Command();

      expect(mocks.exportMarkdown).toHaveBeenCalledWith(
        expect.stringContaining("docs2llm-smartpaste-"),
        "docx",
      );
      expect(mocks.renameSync).toHaveBeenCalledWith(
        "/tmp/out/docs2llm-smartpaste-123.docx",
        "/Users/test/Desktop/docs2llm-smartpaste-123.docx",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("filepath inbound → saves .md with source stem", async () => {
      mocks.detectClipboard.mockResolvedValue({
        kind: "filepath",
        path: "/tmp/report.pdf",
      });
      mocks.looksLikeMarkdown.mockReturnValue(false);
      mocks.convertFile.mockResolvedValue({
        content: "# Report",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Desktop/report.md",
        "# Report",
        "utf-8",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });
  });
});

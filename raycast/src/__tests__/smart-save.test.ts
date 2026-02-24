import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  showHUD: vi.fn(),
  showToast: vi.fn(),
  showInFinder: vi.fn(),
  getPreferenceValues: vi.fn(() => ({})),
  isInstalled: vi.fn(),
  convertFile: vi.fn(),
  convertUrl: vi.fn(),
  exportMarkdown: vi.fn(),
  getOutputDir: vi.fn(() => "/Users/test/Downloads"),
  detectSource: vi.fn(),
  readFileSync: vi.fn(() => "# Mock MD content"),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("@raycast/api", () => ({
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
  exportMarkdown: mocks.exportMarkdown,
  getOutputDir: mocks.getOutputDir,
}));

vi.mock("../lib/smart-detect", () => ({
  detectSource: mocks.detectSource,
}));

vi.mock("node:fs", () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
}));

import Command from "../smart-save";

// =============================================================================

describe("Smart Save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInstalled.mockReturnValue(true);
    mocks.getPreferenceValues.mockReturnValue({
      defaultFormat: "md",
      defaultExportFormat: "docx",
    });
    mocks.getOutputDir.mockReturnValue("/Users/test/Downloads");
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
    expect(mocks.showHUD).toHaveBeenCalledWith("Nothing to save");
  });

  // ---------------------------------------------------------------------------
  // Inbound saves
  // ---------------------------------------------------------------------------

  describe("inbound", () => {
    it("Finder PDF → converts and saves", async () => {
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

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/report.pdf", "md");
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Downloads/report.md",
        "# Report",
        "utf-8",
      );
      expect(mocks.showHUD).toHaveBeenCalledWith("Saved report.md");
      expect(mocks.showInFinder).toHaveBeenCalledWith(
        "/Users/test/Downloads/report.md",
      );
    });

    it("selection with richHtml → converts and saves", async () => {
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
        expect.stringContaining("docs2llm-smartsave-"),
        "md",
      );
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Downloads/converted-"),
        "Hello",
        "utf-8",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("selection plain → saves text as-is", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "just text",
        direction: "none",
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Downloads/converted-"),
        "just text",
        "utf-8",
      );
      expect(mocks.convertFile).not.toHaveBeenCalled();
    });

    it("clipboard HTML → converts and saves", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "html", html: "<h1>T</h1>", text: "T" },
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "# T",
        words: 1,
        tokens: 1,
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Downloads/converted-"),
        "# T",
        "utf-8",
      );
    });

    it("clipboard URL → fetches, converts and saves", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "url", url: "https://docs.example.com/guide" },
        direction: "inbound",
      });
      mocks.convertUrl.mockResolvedValue({
        content: "# Guide",
        words: 1,
        tokens: 2,
      });

      await Command();

      expect(mocks.convertUrl).toHaveBeenCalledWith(
        "https://docs.example.com/guide",
        "md",
      );
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Downloads/docs-example-com.md",
        "# Guide",
        "utf-8",
      );
      expect(mocks.showHUD).toHaveBeenCalledWith("Saved docs-example-com.md");
    });

    it("clipboard filepath → converts and saves", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "filepath", path: "/tmp/doc.docx" },
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: "Content",
        words: 1,
        tokens: 1,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/doc.docx", "md");
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Downloads/doc.md",
        "Content",
        "utf-8",
      );
    });

    it("clipboard plain text → saves as-is", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "text", text: "hello world" },
        direction: "none",
      });

      await Command();

      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("/Users/test/Downloads/converted-"),
        "hello world",
        "utf-8",
      );
    });

    it("conversion error → shows failure toast, no file written", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/tmp/broken.pdf",
        direction: "inbound",
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
      // writeFileSync is called for temp HTML files, but not for the output
      expect(mocks.showInFinder).not.toHaveBeenCalled();
    });

    it("uses defaultFormat preference", async () => {
      mocks.getPreferenceValues.mockReturnValue({
        defaultFormat: "json",
        defaultExportFormat: "docx",
      });
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/tmp/report.pdf",
        direction: "inbound",
      });
      mocks.convertFile.mockResolvedValue({
        content: '{"ok":true}',
        words: 1,
        tokens: 1,
      });

      await Command();

      expect(mocks.convertFile).toHaveBeenCalledWith("/tmp/report.pdf", "json");
      expect(mocks.writeFileSync).toHaveBeenCalledWith(
        "/Users/test/Downloads/report.json",
        '{"ok":true}',
        "utf-8",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Outbound saves
  // ---------------------------------------------------------------------------

  describe("outbound", () => {
    it("Finder .md → exports via Pandoc", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/docs/notes.md",
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/notes.docx",
      });

      await Command();

      expect(mocks.readFileSync).toHaveBeenCalledWith(
        "/docs/notes.md",
        "utf-8",
      );
      expect(mocks.exportMarkdown).toHaveBeenCalledWith(
        expect.stringContaining("docs2llm-smartsave-"),
        "docx",
      );
      expect(mocks.showHUD).toHaveBeenCalledWith("Saved notes.docx");
      expect(mocks.showInFinder).toHaveBeenCalledWith(
        "/Users/test/Downloads/notes.docx",
      );
    });

    it("selection MD → exports via Pandoc", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "# Title",
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/out.docx",
      });

      await Command();

      expect(mocks.exportMarkdown).toHaveBeenCalledWith(
        expect.stringContaining("docs2llm-smartsave-"),
        "docx",
      );
      expect(mocks.showInFinder).toHaveBeenCalled();
    });

    it("clipboard MD text → exports via Pandoc", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "text", text: "# Heading" },
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/out.docx",
      });

      await Command();

      expect(mocks.exportMarkdown).toHaveBeenCalled();
    });

    it("clipboard .md filepath → reads and exports", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "filepath", path: "/docs/notes.md" },
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/notes.docx",
      });

      await Command();

      expect(mocks.readFileSync).toHaveBeenCalledWith(
        "/docs/notes.md",
        "utf-8",
      );
      expect(mocks.exportMarkdown).toHaveBeenCalled();
    });

    it("uses defaultExportFormat preference", async () => {
      mocks.getPreferenceValues.mockReturnValue({
        defaultFormat: "md",
        defaultExportFormat: "pptx",
      });
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/docs/slides.md",
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/slides.pptx",
      });

      await Command();

      expect(mocks.exportMarkdown).toHaveBeenCalledWith(
        expect.any(String),
        "pptx",
      );
    });

    it("Pandoc error → shows Pandoc toast", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "finder",
        path: "/docs/notes.md",
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
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

    it("clipboard HTML outbound → shows nothing to export", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "clipboard",
        clip: { kind: "html", html: "<p>test</p>" },
        direction: "outbound",
      });

      await Command();

      expect(mocks.showHUD).toHaveBeenCalledWith("Nothing to export");
    });

    it("cleans up temp .md file", async () => {
      mocks.detectSource.mockResolvedValue({
        origin: "selection",
        text: "# Title",
        direction: "outbound",
      });
      mocks.exportMarkdown.mockResolvedValue({
        outputPath: "/Users/test/Downloads/out.docx",
      });

      await Command();

      expect(mocks.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining("docs2llm-smartsave-"),
      );
    });
  });
});

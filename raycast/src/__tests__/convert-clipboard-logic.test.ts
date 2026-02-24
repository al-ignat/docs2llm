import { describe, it, expect } from "vitest";
import type { ClipboardContent } from "../lib/clipboard-detect";

// Import the exported helpers directly — no React mocking needed
import {
  describeClipboard,
  defaultDirection,
  defaultFilename,
} from "../convert-clipboard";

// We need to mock the React/Raycast imports that convert-clipboard.tsx pulls in,
// even though we're only testing the pure helper functions.
import { vi } from "vitest";

vi.mock("@raycast/api", () => ({
  Action: { SubmitForm: () => null, Open: () => null, OpenInBrowser: () => null },
  ActionPanel: () => null,
  Detail: () => null,
  Form: Object.assign(() => null, {
    Description: () => null,
    TextField: () => null,
    Dropdown: Object.assign(() => null, { Item: () => null }),
    Checkbox: () => null,
    FilePicker: () => null,
  }),
  getPreferenceValues: () => ({}),
  open: vi.fn(),
  showInFinder: vi.fn(),
  showToast: vi.fn(),
  Toast: { Style: { Animated: "animated", Failure: "failure", Success: "success" } },
  useNavigation: () => ({ push: vi.fn() }),
}));

vi.mock("react", () => ({
  useState: (init: unknown) => [init, vi.fn()],
  useEffect: vi.fn(),
}));

vi.mock("../lib/docs2llm", () => ({
  convertFile: vi.fn(),
  convertUrl: vi.fn(),
  convertWithTemplate: vi.fn(),
  exportMarkdown: vi.fn(),
  isInstalled: vi.fn(() => true),
  loadTemplates: vi.fn(() => []),
}));

vi.mock("../lib/clipboard-detect", () => ({
  detectClipboard: vi.fn(),
}));

// =============================================================================

describe("describeClipboard", () => {
  it("html → 'HTML from clipboard'", () => {
    const clip: ClipboardContent = { kind: "html", html: "<p>hi</p>" };
    expect(describeClipboard(clip)).toBe("HTML from clipboard");
  });

  it("url → 'URL: <url>'", () => {
    const clip: ClipboardContent = { kind: "url", url: "https://example.com" };
    expect(describeClipboard(clip)).toBe("URL: https://example.com");
  });

  it("filepath → 'File: <basename>'", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/tmp/report.pdf" };
    expect(describeClipboard(clip)).toBe("File: report.pdf");
  });

  it("text → 'Text from clipboard'", () => {
    const clip: ClipboardContent = { kind: "text", text: "hello" };
    expect(describeClipboard(clip)).toBe("Text from clipboard");
  });

  it("empty → 'Clipboard is empty'", () => {
    const clip: ClipboardContent = { kind: "empty" };
    expect(describeClipboard(clip)).toBe("Clipboard is empty");
  });
});

// =============================================================================

describe("defaultDirection", () => {
  it("text → outbound (assumes Markdown)", () => {
    const clip: ClipboardContent = { kind: "text", text: "# Heading" };
    expect(defaultDirection(clip)).toBe("outbound");
  });

  it("html → inbound", () => {
    const clip: ClipboardContent = { kind: "html", html: "<h1>T</h1>" };
    expect(defaultDirection(clip)).toBe("inbound");
  });

  it("url → inbound", () => {
    const clip: ClipboardContent = { kind: "url", url: "https://example.com" };
    expect(defaultDirection(clip)).toBe("inbound");
  });

  it("filepath .pdf → inbound", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/tmp/report.pdf" };
    expect(defaultDirection(clip)).toBe("inbound");
  });

  it("filepath .docx → inbound", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/tmp/doc.docx" };
    expect(defaultDirection(clip)).toBe("inbound");
  });

  it("filepath .md → outbound", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/docs/notes.md" };
    expect(defaultDirection(clip)).toBe("outbound");
  });

  it("filepath .markdown → outbound", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/docs/notes.markdown" };
    expect(defaultDirection(clip)).toBe("outbound");
  });

  it("empty → inbound", () => {
    const clip: ClipboardContent = { kind: "empty" };
    expect(defaultDirection(clip)).toBe("inbound");
  });
});

// =============================================================================

describe("defaultFilename", () => {
  it("url → hostname with dots replaced by dashes", () => {
    const clip: ClipboardContent = { kind: "url", url: "https://docs.example.com/guide" };
    expect(defaultFilename(clip)).toBe("docs-example-com");
  });

  it("url with invalid URL → 'url-content'", () => {
    const clip: ClipboardContent = { kind: "url", url: "not-a-url" };
    expect(defaultFilename(clip)).toBe("url-content");
  });

  it("filepath → stem without extension", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/tmp/report.pdf" };
    expect(defaultFilename(clip)).toBe("report");
  });

  it("filepath with multiple dots → removes last extension only", () => {
    const clip: ClipboardContent = { kind: "filepath", path: "/tmp/my.report.v2.pdf" };
    expect(defaultFilename(clip)).toBe("my.report.v2");
  });

  it("html → 'clipboard-html'", () => {
    const clip: ClipboardContent = { kind: "html", html: "<p>hi</p>" };
    expect(defaultFilename(clip)).toBe("clipboard-html");
  });

  it("text → 'clipboard-text'", () => {
    const clip: ClipboardContent = { kind: "text", text: "hello" };
    expect(defaultFilename(clip)).toBe("clipboard-text");
  });

  it("empty → 'clipboard'", () => {
    const clip: ClipboardContent = { kind: "empty" };
    expect(defaultFilename(clip)).toBe("clipboard");
  });
});

import { describe, it, expect } from "vitest";
import {
  detectDirection,
  formatTitle,
  INBOUND_FORMATS,
  OUTBOUND_FORMATS,
} from "../lib/format-utils";

// =============================================================================

describe("detectDirection", () => {
  it(".pdf → inbound", () => {
    expect(detectDirection("/tmp/report.pdf")).toBe("inbound");
  });

  it(".docx → inbound", () => {
    expect(detectDirection("/docs/file.docx")).toBe("inbound");
  });

  it(".pptx → inbound", () => {
    expect(detectDirection("/docs/slides.pptx")).toBe("inbound");
  });

  it(".html → inbound", () => {
    expect(detectDirection("/tmp/page.html")).toBe("inbound");
  });

  it(".txt → inbound", () => {
    expect(detectDirection("/tmp/notes.txt")).toBe("inbound");
  });

  it(".png → inbound", () => {
    expect(detectDirection("/tmp/image.png")).toBe("inbound");
  });

  it(".md → outbound", () => {
    expect(detectDirection("/docs/notes.md")).toBe("outbound");
  });

  it(".markdown → outbound", () => {
    expect(detectDirection("/docs/notes.markdown")).toBe("outbound");
  });

  it("case-sensitive: .MD → inbound (not outbound)", () => {
    expect(detectDirection("/docs/notes.MD")).toBe("inbound");
  });

  it("no extension → inbound", () => {
    expect(detectDirection("/tmp/Makefile")).toBe("inbound");
  });
});

// =============================================================================

describe("formatTitle", () => {
  it("md → Markdown", () => {
    expect(formatTitle("md")).toBe("Markdown");
  });

  it("json → JSON", () => {
    expect(formatTitle("json")).toBe("JSON");
  });

  it("yaml → YAML", () => {
    expect(formatTitle("yaml")).toBe("YAML");
  });

  it("docx → Word (.docx)", () => {
    expect(formatTitle("docx")).toBe("Word (.docx)");
  });

  it("pptx → PowerPoint (.pptx)", () => {
    expect(formatTitle("pptx")).toBe("PowerPoint (.pptx)");
  });

  it("html → HTML (.html)", () => {
    expect(formatTitle("html")).toBe("HTML (.html)");
  });

  it("unknown format → returned as-is", () => {
    expect(formatTitle("csv")).toBe("csv");
  });
});

// =============================================================================

describe("format arrays", () => {
  it("inbound formats are md, json, yaml", () => {
    expect([...INBOUND_FORMATS]).toEqual(["md", "json", "yaml"]);
  });

  it("outbound formats are docx, pptx, html", () => {
    expect([...OUTBOUND_FORMATS]).toEqual(["docx", "pptx", "html"]);
  });

  it("inbound and outbound don't overlap", () => {
    const overlap = INBOUND_FORMATS.filter((f) =>
      (OUTBOUND_FORMATS as readonly string[]).includes(f),
    );
    expect(overlap).toHaveLength(0);
  });
});

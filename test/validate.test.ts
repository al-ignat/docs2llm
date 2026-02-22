import { describe, expect, test } from "bun:test";
import { buildPlan, ValidationError } from "../validate";

describe("buildPlan", () => {
  // --- Inbound conversions (document → markdown) ---
  test("builds an inbound plan for a .pdf to md", () => {
    const plan = buildPlan("/tmp/doc.pdf", "md");
    expect(plan.direction).toBe("inbound");
    expect(plan.format).toBe("md");
    expect(plan.inputPath).toBe("/tmp/doc.pdf");
    expect(plan.outputPath).toEndWith(".md");
  });

  test("builds an inbound plan for a .docx to json", () => {
    const plan = buildPlan("/tmp/report.docx", "json");
    expect(plan.direction).toBe("inbound");
    expect(plan.format).toBe("json");
    expect(plan.outputPath).toEndWith(".json");
  });

  // --- Outbound conversions (markdown → docx/pptx/html) ---
  test("builds an outbound plan for .md to docx", () => {
    const plan = buildPlan("/tmp/readme.md", "docx", { formatExplicit: true });
    expect(plan.direction).toBe("outbound");
    expect(plan.format).toBe("docx");
    expect(plan.outputPath).toEndWith(".docx");
  });

  test("builds an outbound plan for .md to pptx", () => {
    const plan = buildPlan("/tmp/slides.md", "pptx", { formatExplicit: true });
    expect(plan.direction).toBe("outbound");
    expect(plan.format).toBe("pptx");
  });

  test("builds an outbound plan for .md to html", () => {
    const plan = buildPlan("/tmp/page.md", "html", { formatExplicit: true });
    expect(plan.direction).toBe("outbound");
    expect(plan.format).toBe("html");
  });

  // --- Smart default: .md input with no explicit format → docx ---
  test("defaults .md input to docx when format is md and not explicit", () => {
    const plan = buildPlan("/tmp/readme.md", "md");
    expect(plan.direction).toBe("outbound");
    expect(plan.format).toBe("docx");
  });

  test("respects defaultMdFormat override", () => {
    const plan = buildPlan("/tmp/readme.md", "md", { defaultMdFormat: "pptx" });
    expect(plan.direction).toBe("outbound");
    expect(plan.format).toBe("pptx");
  });

  test("keeps md format when explicitly requested", () => {
    const plan = buildPlan("/tmp/readme.md", "md", {
      formatExplicit: true,
      outputDir: "/tmp/out",
    });
    expect(plan.direction).toBe("inbound");
    expect(plan.format).toBe("md");
  });

  // --- Error: non-.md input with outbound format ---
  test("throws ValidationError for .pdf to docx", () => {
    expect(() => buildPlan("/tmp/doc.pdf", "docx")).toThrow(ValidationError);
  });

  test("throws ValidationError for .txt to pptx", () => {
    expect(() => buildPlan("/tmp/notes.txt", "pptx")).toThrow(ValidationError);
  });

  test("ValidationError message mentions outbound restriction", () => {
    try {
      buildPlan("/tmp/doc.pdf", "html");
      throw new Error("should not reach");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("Outbound formats");
    }
  });

  // --- Input/output collision ---
  test("throws ValidationError when output would overwrite input", () => {
    // .md input, explicit md format → same file
    expect(() =>
      buildPlan("/tmp/readme.md", "md", { formatExplicit: true })
    ).toThrow("overwrite input");
  });

  // --- Output directory ---
  test("uses outputDir when specified", () => {
    const plan = buildPlan("/tmp/doc.pdf", "md", { outputDir: "/out" });
    expect(plan.outputPath).toStartWith("/out/");
  });

  // --- Pandoc args ---
  test("includes pandocArgs when provided", () => {
    const plan = buildPlan("/tmp/doc.pdf", "md", {
      pandocArgs: ["--standalone"],
    });
    expect(plan.pandocArgs).toEqual(["--standalone"]);
  });

  test("omits pandocArgs when empty array", () => {
    const plan = buildPlan("/tmp/doc.pdf", "md", { pandocArgs: [] });
    expect(plan.pandocArgs).toBeUndefined();
  });
});

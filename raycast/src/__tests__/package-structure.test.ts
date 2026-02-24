import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

// =============================================================================

describe("package.json commands", () => {
  const commands: { name: string; mode: string; preferences?: unknown[] }[] =
    pkg.commands;
  const commandNames = commands.map((c) => c.name);

  it("has exactly 6 commands", () => {
    expect(commands).toHaveLength(6);
  });

  it("includes all expected commands", () => {
    expect(commandNames).toContain("convert-file");
    expect(commandNames).toContain("convert-clipboard");
    expect(commandNames).toContain("quick-convert");
    expect(commandNames).toContain("smart-copy");
    expect(commandNames).toContain("smart-paste");
    expect(commandNames).toContain("smart-save");
  });

  it("deleted commands are gone", () => {
    const deleted = [
      "convert-url",
      "export-markdown",
      "markdown-to-rich-text",
      "copy-as-rich-text",
      "save-clipboard",
    ];
    for (const name of deleted) {
      expect(commandNames).not.toContain(name);
    }
  });

  it("view commands use 'view' mode", () => {
    for (const name of ["convert-file", "convert-clipboard", "quick-convert"]) {
      const cmd = commands.find((c) => c.name === name);
      expect(cmd?.mode).toBe("view");
    }
  });

  it("smart commands use 'no-view' mode", () => {
    for (const name of ["smart-copy", "smart-paste", "smart-save"]) {
      const cmd = commands.find((c) => c.name === name);
      expect(cmd?.mode).toBe("no-view");
    }
  });
});

// =============================================================================

describe("per-command preferences", () => {
  const commands: { name: string; preferences?: { name: string }[] }[] =
    pkg.commands;

  it("every command has defaultFormat preference", () => {
    for (const cmd of commands) {
      const prefNames = (cmd.preferences || []).map((p) => p.name);
      expect(prefNames).toContain("defaultFormat");
    }
  });

  it("every command has defaultExportFormat preference", () => {
    for (const cmd of commands) {
      const prefNames = (cmd.preferences || []).map((p) => p.name);
      expect(prefNames).toContain("defaultExportFormat");
    }
  });
});

// =============================================================================

describe("extension-level preferences", () => {
  const prefs: { name: string; required?: boolean; type: string }[] =
    pkg.preferences;
  const prefNames = prefs.map((p) => p.name);

  it("includes binaryPath", () => {
    expect(prefNames).toContain("binaryPath");
  });

  it("includes pandocPath", () => {
    expect(prefNames).toContain("pandocPath");
  });

  it("includes enableOcr", () => {
    expect(prefNames).toContain("enableOcr");
  });

  it("includes outputDir", () => {
    expect(prefNames).toContain("outputDir");
  });

  it("includes defaultTemplate", () => {
    expect(prefNames).toContain("defaultTemplate");
  });

  it("outputDir is required", () => {
    const outputDir = prefs.find((p) => p.name === "outputDir");
    expect(outputDir?.required).toBe(true);
  });

  it("does NOT have defaultFormat at extension level", () => {
    expect(prefNames).not.toContain("defaultFormat");
  });

  it("does NOT have defaultExportFormat at extension level", () => {
    expect(prefNames).not.toContain("defaultExportFormat");
  });
});

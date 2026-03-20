import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

// -- Constants matching the module's internal paths (with mocked homedir) --
const MOCK_HOME = "/mock/home";
const BINARY = "/usr/local/bin/docs2llm";
const BUN = "/usr/local/bin/bun";
const BUN_GLOBAL_LINK = join(MOCK_HOME, ".bun/bin/docs2llm");
const OUTPUT_DIR = "/mock/output";
const CONFIG_PATH = join(MOCK_HOME, ".config/docs2llm/config.yaml");

// =============================================================================
// Hoisted mocks — declared before vi.mock so factories can reference them
// =============================================================================

const mocks = vi.hoisted(() => ({
  // node:fs
  existsSync: vi.fn((): boolean => false),
  readFileSync: vi.fn((): string => ""),
  readlinkSync: vi.fn((): string => ""),
  realpathSync: vi.fn((): string => ""),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  // node:child_process
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  // @raycast/api
  getPreferenceValues: vi.fn(() => ({
    binaryPath: "",
    pandocPath: "",
    enableOcr: false,
    outputDir: "",
    defaultTemplate: "",
  })),
  environment: { assetsPath: "/mock/raycast/assets" },
  // node:os
  homedir: vi.fn(() => "/mock/home"),
  tmpdir: vi.fn(() => "/mock/tmp"),
}));

// =============================================================================
// Module mocks (hoisted above imports by vitest)
// =============================================================================

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  readlinkSync: mocks.readlinkSync,
  realpathSync: mocks.realpathSync,
  writeFileSync: mocks.writeFileSync,
  unlinkSync: mocks.unlinkSync,
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
  execFileSync: mocks.execFileSync,
}));

vi.mock("@raycast/api", () => ({
  environment: mocks.environment,
  getPreferenceValues: mocks.getPreferenceValues,
}));

vi.mock("node:os", () => ({
  homedir: mocks.homedir,
  tmpdir: mocks.tmpdir,
}));

// =============================================================================
// Import module under test (after mocks are declared)
// =============================================================================

import {
  resolveInvocation,
  convertFile,
  convertUrl,
  getVersion,
  isInstalled,
  getOutputDir,
  saveToFile,
  exportMarkdown,
  exportToHtml,
  convertToHtmlFromText,
  convertWithTemplate,
  loadTemplates,
} from "../lib/docs2llm";

// =============================================================================
// Helpers
// =============================================================================

/** Make existsSync return true only for the listed paths. */
function mockPaths(...paths: string[]) {
  const set = new Set(paths);
  mocks.existsSync.mockImplementation((p: string) => set.has(p));
}

/** Fake stdin that accepts write/end calls (for Pandoc stdin piping). */
function fakeStdin() {
  return { write: vi.fn(), end: vi.fn() };
}

/** Mock execFile to invoke callback with stdout. */
function mockExecSuccess(stdout: string) {
  mocks.execFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, stdout, "");
      return { stdin: fakeStdin() };
    },
  );
}

/** Mock execFile to invoke callback with error + stderr. */
function mockExecError(stderr: string) {
  mocks.execFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(new Error("command failed"), "", stderr);
      return { stdin: fakeStdin() };
    },
  );
}

/** Default prefs shorthand. */
function prefs(overrides: Record<string, unknown> = {}) {
  mocks.getPreferenceValues.mockReturnValue({
    binaryPath: "",
    pandocPath: "",
    enableOcr: false,
    outputDir: "",
    defaultTemplate: "",
    ...overrides,
  });
}

// =============================================================================

describe("docs2llm CLI integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.execFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    prefs();
    mocks.environment.assetsPath = "/mock/raycast/assets";
  });

  // ---------------------------------------------------------------------------
  // 1. Binary resolution — resolveInvocation()
  // ---------------------------------------------------------------------------

  describe("resolveInvocation()", () => {
    it("returns binary when preference path exists", () => {
      prefs({ binaryPath: "/custom/docs2llm" });
      mockPaths("/custom/docs2llm");

      expect(resolveInvocation()).toEqual({
        cmd: "/custom/docs2llm",
        prefix: [],
      });
    });

    it("returns bun + script when preference is .ts and bun found", () => {
      prefs({ binaryPath: "/custom/cli.ts" });
      mockPaths("/custom/cli.ts", BUN);

      expect(resolveInvocation()).toEqual({
        cmd: BUN,
        prefix: ["run", "/custom/cli.ts"],
      });
    });

    it("falls through when preference is .ts but no bun found", () => {
      prefs({ binaryPath: "/custom/cli.ts" });
      mockPaths("/custom/cli.ts"); // only .ts exists, no bun

      expect(resolveInvocation()).toBeNull();
    });

    it("falls through when preference path does not exist", () => {
      prefs({ binaryPath: "/nonexistent/docs2llm" });
      // existsSync returns false for everything (default)

      expect(resolveInvocation()).toBeNull();
    });

    it("finds compiled binary in BINARY_PATHS", () => {
      mockPaths(BINARY);

      expect(resolveInvocation()).toEqual({ cmd: BINARY, prefix: [] });
    });

    it("finds binary via which on PATH", () => {
      mocks.execFileSync.mockReturnValue("/other/path/docs2llm\n");
      mockPaths("/other/path/docs2llm");

      expect(resolveInvocation()).toEqual({
        cmd: "/other/path/docs2llm",
        prefix: [],
      });
    });

    it("resolves bun-global symlink to .ts target", () => {
      const target = "/resolved/path/cli.ts";
      mockPaths(BUN, BUN_GLOBAL_LINK, target);
      mocks.realpathSync.mockReturnValue(target);

      expect(resolveInvocation()).toEqual({
        cmd: BUN,
        prefix: ["run", target],
      });
    });

    it("falls back to readlink when realpath fails (broken symlink)", () => {
      const resolved = join(MOCK_HOME, ".bun/relative/cli.ts");
      mockPaths(BUN, BUN_GLOBAL_LINK, resolved);
      mocks.realpathSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      mocks.readlinkSync.mockReturnValue("../relative/cli.ts");

      expect(resolveInvocation()).toEqual({
        cmd: BUN,
        prefix: ["run", resolved],
      });
    });

    it("finds project-local cli.ts via assetsPath", () => {
      const cliTs = join("/mock/raycast", "..", "src/commands/cli.ts");
      mockPaths(BUN, cliTs);

      expect(resolveInvocation()).toEqual({
        cmd: BUN,
        prefix: ["run", cliTs],
      });
    });

    it("returns null when nothing is found", () => {
      expect(resolveInvocation()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CLI invocation — run() via public API
  // ---------------------------------------------------------------------------

  describe("CLI invocation", () => {
    beforeEach(() => {
      // Default: binary found so run() can execute
      mockPaths(BINARY);
      mockExecSuccess("");
    });

    it("convertFile() constructs correct args", async () => {
      await convertFile("/tmp/test.pdf");

      expect(mocks.execFile).toHaveBeenCalledWith(
        BINARY,
        ["/tmp/test.pdf", "--stdout", "-f", "md", "--yes"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("convertFile() adds --ocr flag when enabled", async () => {
      await convertFile("/tmp/scan.pdf", undefined, true);

      expect(mocks.execFile).toHaveBeenCalledWith(
        BINARY,
        ["/tmp/scan.pdf", "--stdout", "-f", "md", "--yes", "--ocr"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("convertFile() passes custom format", async () => {
      await convertFile("/tmp/test.pdf", "json");

      expect(mocks.execFile).toHaveBeenCalledWith(
        BINARY,
        ["/tmp/test.pdf", "--stdout", "-f", "json", "--yes"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("convertUrl() constructs correct args", async () => {
      await convertUrl("https://example.com", "md");

      expect(mocks.execFile).toHaveBeenCalledWith(
        BINARY,
        ["https://example.com", "--stdout", "-f", "md", "--yes"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("getVersion() returns trimmed stdout on success", async () => {
      mockExecSuccess("1.5.0\n");

      expect(await getVersion()).toBe("1.5.0");
    });

    it("getVersion() returns null on error", async () => {
      mockExecError("unknown flag");

      expect(await getVersion()).toBeNull();
    });

    it("isInstalled() returns true when binary found", () => {
      expect(isInstalled()).toBe(true);
    });

    it("isInstalled() returns false when nothing found", () => {
      mocks.existsSync.mockReturnValue(false);

      expect(isInstalled()).toBe(false);
    });

    it("detects timeout when err.killed is true", async () => {
      mocks.execFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          const err = new Error("command timed out") as Error & { killed: boolean };
          err.killed = true;
          cb(err, "", "partial output");
        },
      );

      const result = await convertFile("/tmp/test.pdf");

      expect(result.error).toMatch(/Timed out/);
      expect(result.error).toContain("partial output");
    });

    it("returns error message without spawning when not installed", async () => {
      mocks.existsSync.mockReturnValue(false);

      const result = await convertFile("/tmp/test.pdf");

      expect(result.error).toMatch(/not found/i);
      expect(mocks.execFile).not.toHaveBeenCalled();
    });

    it("returns content with computed word/token stats", async () => {
      mockExecSuccess("hello world test content here");

      const result = await convertFile("/tmp/test.pdf");

      expect(result.content).toBe("hello world test content here");
      expect(result.words).toBe(5);
      // tokens ≈ ceil(words * 1.33)
      expect(result.tokens).toBe(Math.ceil(5 * 1.33));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. File operations
  // ---------------------------------------------------------------------------

  describe("File operations", () => {
    describe("getOutputDir()", () => {
      it("returns configured dir if it exists", () => {
        prefs({ outputDir: OUTPUT_DIR });
        mockPaths(OUTPUT_DIR);

        expect(getOutputDir()).toBe(OUTPUT_DIR);
      });

      it("throws if dir not configured", () => {
        prefs({ outputDir: "" });

        expect(() => getOutputDir()).toThrow(/not configured/i);
      });

      it("throws if dir does not exist on disk", () => {
        prefs({ outputDir: "/missing/dir" });
        // existsSync returns false (default)

        expect(() => getOutputDir()).toThrow(/not configured/i);
      });
    });

    describe("saveToFile()", () => {
      it("writes content and returns full path", () => {
        prefs({ outputDir: OUTPUT_DIR });
        mockPaths(OUTPUT_DIR);

        const result = saveToFile("# Hello", "output.md");

        expect(result).toBe(join(OUTPUT_DIR, "output.md"));
        expect(mocks.writeFileSync).toHaveBeenCalledWith(
          join(OUTPUT_DIR, "output.md"),
          "# Hello",
          "utf-8",
        );
      });
    });

    describe("exportMarkdown()", () => {
      const jsonOutputPath = "/mock/output/report.docx";

      beforeEach(() => {
        prefs({ outputDir: OUTPUT_DIR });
        mockPaths(BINARY, OUTPUT_DIR, jsonOutputPath);
      });

      it("parses JSON output for outputPath", async () => {
        mockExecSuccess(JSON.stringify({ output: jsonOutputPath }));

        const result = await exportMarkdown("/docs/report.md", "docx");

        expect(result).toEqual({ outputPath: jsonOutputPath });
      });

      it("falls back to expected path when JSON parsing fails", async () => {
        mockExecSuccess("non-json output");
        // The expected fallback path is join(OUTPUT_DIR, "report.docx")
        const fallbackPath = join(OUTPUT_DIR, "report.docx");
        mockPaths(BINARY, OUTPUT_DIR, fallbackPath);

        const result = await exportMarkdown("/docs/report.md", "docx");

        expect(result).toEqual({ outputPath: fallbackPath });
      });

      it("propagates error from run()", async () => {
        mockExecError("pandoc: command not found");

        const result = await exportMarkdown("/docs/report.md", "docx");

        expect(result).toEqual({ error: "pandoc: command not found" });
      });
    });

    describe("exportToHtml()", () => {
      it("reads file and delegates to convertToHtmlFromText", async () => {
        const pandocPath = "/usr/local/bin/pandoc";
        mockPaths(pandocPath);
        mocks.readFileSync.mockReturnValue("# Notes");
        mockExecSuccess("<h1>Notes</h1>");

        const result = await exportToHtml("/docs/notes.md");

        expect(result).toEqual({ html: "<h1>Notes</h1>" });
        expect(mocks.readFileSync).toHaveBeenCalledWith("/docs/notes.md", "utf-8");
      });
    });

    describe("convertToHtmlFromText()", () => {
      it("calls Pandoc directly via stdin/stdout for HTML fragment", async () => {
        const pandocPath = "/usr/local/bin/pandoc";
        mockPaths(pandocPath);
        mockExecSuccess("<p><strong>content</strong></p>");

        const result = await convertToHtmlFromText("some **markdown**");

        expect(result).toEqual({ html: "<p><strong>content</strong></p>" });
        // Pandoc called directly (not via docs2llm binary)
        expect(mocks.execFile).toHaveBeenCalledWith(
          pandocPath,
          ["-f", "markdown", "-t", "html", "--wrap=none"],
          expect.any(Object),
          expect.any(Function),
        );
      });

      it("returns error when Pandoc fails", async () => {
        const pandocPath = "/usr/local/bin/pandoc";
        mockPaths(pandocPath);
        mockExecError("pandoc: Unknown reader: md");

        const result = await convertToHtmlFromText("some text");

        expect(result.error).toMatch(/Pandoc failed/);
      });
    });

    describe("convertWithTemplate()", () => {
      it("passes -t flag and parses JSON output", async () => {
        const outPath = "/mock/output/report.docx";
        prefs({ outputDir: OUTPUT_DIR });
        mockPaths(BINARY, OUTPUT_DIR, outPath);
        mockExecSuccess(JSON.stringify({ output: outPath }));

        const result = await convertWithTemplate(
          "/docs/report.md",
          "my-template",
        );

        expect(result).toEqual({ outputPath: outPath });
        expect(mocks.execFile).toHaveBeenCalledWith(
          BINARY,
          [
            "/docs/report.md",
            "-t",
            "my-template",
            "-o",
            OUTPUT_DIR,
            "--yes",
            "--json",
          ],
          expect.any(Object),
          expect.any(Function),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Template loading — loadTemplates()
  // ---------------------------------------------------------------------------

  describe("loadTemplates()", () => {
    it("returns template from valid config", () => {
      mockPaths(CONFIG_PATH);
      mocks.readFileSync.mockReturnValue(
        [
          "templates:",
          "  report:",
          "    format: docx",
        ].join("\n"),
      );

      expect(loadTemplates()).toEqual([{ name: "report", format: "docx" }]);
    });

    it("returns multiple templates", () => {
      mockPaths(CONFIG_PATH);
      mocks.readFileSync.mockReturnValue(
        [
          "templates:",
          "  report:",
          "    format: docx",
          "  slides:",
          "    format: pptx",
        ].join("\n"),
      );

      expect(loadTemplates()).toEqual([
        { name: "report", format: "docx" },
        { name: "slides", format: "pptx" },
      ]);
    });

    it("includes description when present", () => {
      mockPaths(CONFIG_PATH);
      mocks.readFileSync.mockReturnValue(
        [
          "templates:",
          "  report:",
          "    format: docx",
          "    description: Weekly report template",
        ].join("\n"),
      );

      expect(loadTemplates()).toEqual([
        {
          name: "report",
          format: "docx",
          description: "Weekly report template",
        },
      ]);
    });

    it("returns empty array when config file is missing", () => {
      // existsSync returns false for CONFIG_PATH (default)
      expect(loadTemplates()).toEqual([]);
    });

    it("returns empty array for malformed file", () => {
      mockPaths(CONFIG_PATH);
      mocks.readFileSync.mockReturnValue("not: valid\nyaml: stuff\n");

      expect(loadTemplates()).toEqual([]);
    });

    it("stops parsing at next top-level key after templates", () => {
      mockPaths(CONFIG_PATH);
      mocks.readFileSync.mockReturnValue(
        [
          "templates:",
          "  report:",
          "    format: docx",
          "defaults:",
          "  format: md",
        ].join("\n"),
      );

      const result = loadTemplates();

      expect(result).toEqual([{ name: "report", format: "docx" }]);
    });
  });
});

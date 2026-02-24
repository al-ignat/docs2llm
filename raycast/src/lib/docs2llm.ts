import { execFile, execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { environment, getPreferenceValues } from "@raycast/api";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const TIMEOUT_MS = 30_000;

const HOME = homedir();

/** Places where a compiled docs2llm binary might live. */
const BINARY_PATHS = [
  "/usr/local/bin/docs2llm",
  "/opt/homebrew/bin/docs2llm",
  join(HOME, ".local/bin/docs2llm"),
];

/** Places where bun might live (Raycast doesn't inherit shell PATH). */
const BUN_PATHS = [
  "/usr/local/bin/bun",
  "/opt/homebrew/bin/bun",
  join(HOME, ".bun/bin/bun"),
];

/** The bun-global symlink that `bun install -g` creates. */
const BUN_GLOBAL_LINK = join(HOME, ".bun/bin/docs2llm");

interface Preferences {
  binaryPath: string;
  pandocPath: string;
  enableOcr: boolean;
  outputDir: string;
  defaultTemplate: string;
}

export interface ConvertResult {
  content: string;
  error?: string;
  words: number;
  tokens: number;
}

/**
 * Resolved invocation: either a standalone binary or bun + script path.
 * - binary mode:  cmd = "/path/to/docs2llm",  prefix = []
 * - bun mode:     cmd = "/path/to/bun",        prefix = ["run", "/path/to/cli.ts"]
 */
interface Invocation {
  cmd: string;
  prefix: string[];
}

function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

function findBun(): string | null {
  for (const p of BUN_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Resolve how to invoke docs2llm.
 *
 * Priority:
 * 1. Preference override (binary path) — used as-is if it's an executable;
 *    if it ends in .ts, run via bun.
 * 2. Compiled binary on PATH or in common locations.
 * 3. bun-global symlink (~/.bun/bin/docs2llm → .ts script) — run via bun.
 * 4. Project-local cli.ts in the parent repo — run via bun.
 */
export function resolveInvocation(): Invocation | null {
  const prefs = getPrefs();

  // 1. Preference override
  if (prefs.binaryPath) {
    const p = prefs.binaryPath;
    if (existsSync(p)) {
      if (p.endsWith(".ts")) {
        const bun = findBun();
        if (bun) return { cmd: bun, prefix: ["run", p] };
      } else {
        return { cmd: p, prefix: [] };
      }
    }
  }

  // 2. Compiled binary in common locations
  for (const p of BINARY_PATHS) {
    if (existsSync(p)) return { cmd: p, prefix: [] };
  }

  // Also check PATH (with expanded PATH that includes common dirs)
  try {
    const pathEnv = [
      process.env.PATH || "",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      join(HOME, ".local/bin"),
    ].join(":");
    const result = execFileSync("which", ["docs2llm"], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, PATH: pathEnv },
    }).trim();
    if (result && existsSync(result) && !result.endsWith(".ts")) {
      return { cmd: result, prefix: [] };
    }
  } catch {
    // not in PATH
  }

  // 3. bun-global symlink → resolve the .ts target and run via bun
  const bun = findBun();
  if (bun && existsSync(BUN_GLOBAL_LINK)) {
    try {
      const target = realpathSync(BUN_GLOBAL_LINK);
      if (target.endsWith(".ts") && existsSync(target)) {
        return { cmd: bun, prefix: ["run", target] };
      }
    } catch {
      // broken symlink — try reading the link target relative to the link dir
      try {
        const raw = readlinkSync(BUN_GLOBAL_LINK);
        const resolved = join(dirname(BUN_GLOBAL_LINK), raw);
        if (resolved.endsWith(".ts") && existsSync(resolved)) {
          return { cmd: bun, prefix: ["run", resolved] };
        }
      } catch {
        // give up on this path
      }
    }
  }

  // 4. Project-local cli.ts (extension lives inside the docs2llm repo)
  //    assetsPath points to raycast/assets/ → parent is raycast/ → grandparent is repo root
  if (bun) {
    const extensionDir = join(environment.assetsPath, "..");
    const repoRoot = join(extensionDir, "..");
    const cliTs = join(repoRoot, "src/commands/cli.ts");
    if (existsSync(cliTs)) {
      return { cmd: bun, prefix: ["run", cliTs] };
    }
  }

  return null;
}

function computeStats(content: string): { words: number; tokens: number } {
  const words = content.split(/\s+/).filter(Boolean).length;
  const tokens = Math.ceil(words * 1.33);
  return { words, tokens };
}

function run(args: string[]): Promise<ConvertResult> {
  const invocation = resolveInvocation();
  if (!invocation) {
    return Promise.resolve({
      content: "",
      words: 0,
      tokens: 0,
      error:
        "docs2llm not found. Install it or set the binary path in extension preferences.",
    });
  }

  const fullArgs = [...invocation.prefix, ...args];

  // Expand PATH so child process can find Pandoc and other tools
  const prefs = getPrefs();
  const pathSegments = [
    process.env.PATH || "",
    "/usr/local/bin",
    "/opt/homebrew/bin",
    join(HOME, ".local/bin"),
  ];
  // Prepend custom Pandoc directory if configured
  if (prefs.pandocPath?.trim()) {
    const pandocDir = dirname(prefs.pandocPath.trim());
    pathSegments.unshift(pandocDir);
  }
  const expandedPath = pathSegments.join(":");

  return new Promise((resolve) => {
    execFile(
      invocation.cmd,
      fullArgs,
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, PATH: expandedPath },
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          resolve({ content: "", words: 0, tokens: 0, error: msg });
        } else {
          const stats = computeStats(stdout);
          resolve({ content: stdout, ...stats });
        }
      },
    );
  });
}

export async function convertFile(
  filePath: string,
  format?: string,
  ocr?: boolean,
): Promise<ConvertResult> {
  const prefs = getPrefs();
  const fmt = format || "md";
  const useOcr = ocr ?? prefs.enableOcr;

  const args = [filePath, "--stdout", "-f", fmt, "--yes"];
  if (useOcr) args.push("--ocr");
  return run(args);
}

export async function convertUrl(
  url: string,
  format?: string,
): Promise<ConvertResult> {
  const fmt = format || "md";
  return run([url, "--stdout", "-f", fmt, "--yes"]);
}

export async function getVersion(): Promise<string | null> {
  const result = await run(["--version"]);
  if (result.error) return null;
  return result.content.trim();
}

export function isInstalled(): boolean {
  return resolveInvocation() !== null;
}

/** Returns the user-configured output directory. Throws if unset. */
export function getOutputDir(): string {
  const prefs = getPrefs();
  const dir = prefs.outputDir?.trim();
  if (dir && existsSync(dir)) return dir;
  throw new Error(
    "Output directory not configured. Set it in Docs2llm extension preferences.",
  );
}

/** Save text content to a file in the output directory. Returns the full path. */
export function saveToFile(content: string, filename: string): string {
  const outDir = getOutputDir();
  const outPath = join(outDir, filename);
  writeFileSync(outPath, content, "utf-8");
  return outPath;
}

/** Export a Markdown file to docx/pptx/html via Pandoc (outbound conversion). */
export async function exportMarkdown(
  mdPath: string,
  format: string,
): Promise<{ outputPath?: string; error?: string }> {
  const outDir = getOutputDir();
  const stem = basename(mdPath, ".md");
  const outputPath = join(outDir, `${stem}.${format}`);

  const result = await run([
    mdPath,
    "-f",
    format,
    "-o",
    outDir,
    "--yes",
    "--json",
  ]);

  if (result.error) {
    return { error: result.error };
  }

  try {
    const parsed = JSON.parse(result.content);
    if (parsed.output && existsSync(parsed.output)) {
      return { outputPath: parsed.output };
    }
  } catch {
    // --json not supported or different output; fall through
  }

  // Fallback: check if the expected output file was created
  if (existsSync(outputPath)) {
    return { outputPath };
  }

  return { error: "Conversion completed but output file was not found." };
}

/**
 * Export a Markdown file to HTML, returning the HTML string.
 * Used by outbound-to-clipboard flows (Markdown to Rich Text, Copy as Rich Text).
 */
export async function exportToHtml(
  mdPath: string,
): Promise<{ html?: string; error?: string }> {
  const tmpOut = join(tmpdir(), `docs2llm-html-${Date.now()}`);

  const result = await run([
    mdPath,
    "-f",
    "html",
    "-o",
    tmpOut,
    "--yes",
    "--json",
  ]);

  if (result.error) {
    return { error: result.error };
  }

  // Find the output HTML file
  let htmlPath: string | undefined;

  try {
    const parsed = JSON.parse(result.content);
    if (parsed.output && existsSync(parsed.output)) {
      htmlPath = parsed.output;
    }
  } catch {
    // fall through
  }

  if (!htmlPath) {
    const stem = basename(mdPath, ".md");
    const candidate = join(tmpOut, `${stem}.html`);
    if (existsSync(candidate)) {
      htmlPath = candidate;
    }
  }

  if (!htmlPath) {
    return { error: "HTML export completed but output file was not found." };
  }

  try {
    const html = readFileSync(htmlPath, "utf-8");
    return { html };
  } finally {
    try {
      unlinkSync(htmlPath);
    } catch {
      // ignore cleanup
    }
  }
}

/**
 * Convert Markdown text (from clipboard) to HTML string.
 * Writes a temp .md file, exports to HTML, cleans up.
 */
export async function convertToHtmlFromText(
  mdContent: string,
): Promise<{ html?: string; error?: string }> {
  const tmpMd = join(tmpdir(), `docs2llm-md-${Date.now()}.md`);

  try {
    writeFileSync(tmpMd, mdContent, "utf-8");
    return await exportToHtml(tmpMd);
  } finally {
    try {
      unlinkSync(tmpMd);
    } catch {
      // ignore cleanup
    }
  }
}

/**
 * Load templates from ~/.config/docs2llm/config.yaml.
 * Returns an empty array if no config or no templates section.
 */
export function loadTemplates(): {
  name: string;
  format: string;
  description?: string;
}[] {
  const configPath = join(HOME, ".config/docs2llm/config.yaml");
  if (!existsSync(configPath)) return [];

  try {
    const content = readFileSync(configPath, "utf-8");
    const templates: { name: string; format: string; description?: string }[] =
      [];

    // Simple YAML parser for templates section — avoids adding js-yaml dependency.
    // Expects format:
    //   templates:
    //     name1:
    //       format: docx
    //       description: optional text
    //     name2:
    //       format: pptx
    const lines = content.split("\n");
    let inTemplates = false;
    let currentName: string | null = null;
    let currentFormat = "";
    let currentDesc: string | undefined;

    for (const line of lines) {
      // Top-level "templates:" key
      if (/^templates:\s*$/.test(line)) {
        inTemplates = true;
        continue;
      }

      if (!inTemplates) continue;

      // Another top-level key → stop
      if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
        // Flush last template
        if (currentName && currentFormat) {
          templates.push({
            name: currentName,
            format: currentFormat,
            description: currentDesc,
          });
        }
        break;
      }

      // Template name (2-space indent)
      const nameMatch = line.match(/^ {2}(\w[\w-]*):\s*$/);
      if (nameMatch) {
        // Flush previous
        if (currentName && currentFormat) {
          templates.push({
            name: currentName,
            format: currentFormat,
            description: currentDesc,
          });
        }
        currentName = nameMatch[1];
        currentFormat = "";
        currentDesc = undefined;
        continue;
      }

      // Template fields (4-space indent)
      const fieldMatch = line.match(/^ {4}(\w+):\s*(.+)$/);
      if (fieldMatch && currentName) {
        const [, key, value] = fieldMatch;
        if (key === "format") currentFormat = value.trim();
        if (key === "description") currentDesc = value.trim();
      }
    }

    // Flush last
    if (currentName && currentFormat) {
      templates.push({
        name: currentName,
        format: currentFormat,
        description: currentDesc,
      });
    }

    return templates;
  } catch {
    return [];
  }
}

/**
 * Run CLI with a named template (-t flag).
 * The CLI resolves Pandoc args from config internally.
 */
export async function convertWithTemplate(
  filePath: string,
  template: string,
): Promise<{ outputPath?: string; error?: string }> {
  const outDir = getOutputDir();

  const result = await run([
    filePath,
    "-t",
    template,
    "-o",
    outDir,
    "--yes",
    "--json",
  ]);

  if (result.error) {
    return { error: result.error };
  }

  try {
    const parsed = JSON.parse(result.content);
    if (parsed.output && existsSync(parsed.output)) {
      return { outputPath: parsed.output };
    }
  } catch {
    // fall through
  }

  return { error: "Conversion completed but output file was not found." };
}

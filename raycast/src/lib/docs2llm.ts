import { execFile, execFileSync } from "node:child_process";
import { existsSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { environment, getPreferenceValues } from "@raycast/api";
import { homedir } from "node:os";
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
  defaultFormat: string;
  binaryPath: string;
  enableOcr: boolean;
  outputDir: string;
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

  return new Promise((resolve) => {
    execFile(
      invocation.cmd,
      fullArgs,
      { timeout: TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
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
  const fmt = format || prefs.defaultFormat || "md";
  const useOcr = ocr ?? prefs.enableOcr;

  const args = [filePath, "--stdout", "-f", fmt, "--yes"];
  if (useOcr) args.push("--ocr");
  return run(args);
}

export async function convertUrl(
  url: string,
  format?: string,
): Promise<ConvertResult> {
  const prefs = getPrefs();
  const fmt = format || prefs.defaultFormat || "md";

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

/** Returns the user-configured output directory, falling back to ~/Downloads. */
export function getOutputDir(): string {
  const prefs = getPrefs();
  const dir = prefs.outputDir?.trim();
  if (dir && existsSync(dir)) return dir;
  return join(HOME, "Downloads");
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

  // The CLI with --json outputs JSON with an outputPath field
  try {
    const parsed = JSON.parse(result.content);
    if (parsed.outputPath && existsSync(parsed.outputPath)) {
      return { outputPath: parsed.outputPath };
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

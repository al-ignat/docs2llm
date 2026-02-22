import { basename, dirname, join, extname } from "path";

export type OutboundFormat = "docx" | "pptx" | "html";

/**
 * Allowlist of safe Pandoc flags. Flags not on this list are rejected.
 * This is safer than a blocklist because new dangerous flags won't slip through.
 */
const ALLOWED_PANDOC_FLAGS = new Set([
  "--toc", "--table-of-contents",
  "--standalone", "-s",
  "--reference-doc",
  "--css",
  "--slide-level",
  "--shift-heading-level-by",
  "--columns",
  "--wrap",
  "--number-sections", "-N",
  "--highlight-style",
  "--no-highlight",
  "--toc-depth",
  "--tab-stop",
  "--preserve-tabs",
  "--strip-comments",
  "--ascii",
  "--from", "-f",
  "--to", "-t",
  "-V", "--variable",
  "-M", "--metadata",
  "--dpi",
  "--eol",
  "--resource-path",
  "--section-divs",
  "--number-offset",
  "--id-prefix",
  "--title-prefix",
  "--email-obfuscation",
  "--self-contained",
  "--embed-resources",
  "--mathml", "--mathjax", "--katex",
  "--gladtex", "--webtex",
  "--top-level-division",
  "--listings",
  "--incremental",
  "--reference-links",
  "--reference-location",
  "--atx-headers", "--markdown-headings",
  "--list-tables",
]);

function sanitizePandocArgs(args: string[]): void {
  for (const arg of args) {
    // Skip positional values (non-flag arguments that follow a flag)
    if (!arg.startsWith("-")) continue;
    const flag = arg.split("=")[0];
    if (!ALLOWED_PANDOC_FLAGS.has(flag)) {
      throw new Error(
        `Blocked Pandoc flag: "${flag}" is not in the allowed list. ` +
        `Only safe formatting flags are permitted.`
      );
    }
  }
}

let pandocAvailable: boolean | null = null;

async function checkPandoc(): Promise<boolean> {
  if (pandocAvailable !== null) return pandocAvailable;

  try {
    const proc = Bun.spawn(["pandoc", "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const code = await proc.exited;
    pandocAvailable = code === 0;
  } catch {
    pandocAvailable = false;
  }

  return pandocAvailable;
}

export async function convertMarkdownTo(
  inputPath: string,
  format: OutboundFormat,
  outputDir?: string,
  extraArgs?: string[]
): Promise<string> {
  if (!(await checkPandoc())) {
    throw new Error(
      "Pandoc is required for outbound conversion (md → docx/pptx/html).\nInstall: brew install pandoc"
    );
  }

  if (extraArgs?.length) sanitizePandocArgs(extraArgs);

  const name = basename(inputPath, extname(inputPath));
  const dir = outputDir ?? dirname(inputPath);
  const outPath = join(dir, `${name}.${format}`);

  const PANDOC_TIMEOUT_MS = 60_000; // 60 seconds

  const args = ["pandoc", inputPath, ...extraArgs ?? [], "-o", outPath];
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => proc.kill(), PANDOC_TIMEOUT_MS);
  const code = await proc.exited;
  clearTimeout(timeout);

  if (code === null || code === 137 || code === 143) {
    throw new Error(`Pandoc timed out after ${PANDOC_TIMEOUT_MS / 1000}s`);
  }

  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Pandoc failed (exit ${code}): ${stderr.trim()}`);
  }

  return outPath;
}

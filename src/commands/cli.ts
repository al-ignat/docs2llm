#!/usr/bin/env bun

import { resolve } from "path";
import { statSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { type OutputFormat, type OcrOptions } from "../core/convert";
import { runInteractive } from "./interactive";
import {
  loadConfig,
  resolveTemplate,
  type Config,
} from "../core/config";
import { runInit } from "./init";
import { runConfigWizard } from "./config-wizard";
import { runPaste, type PasteOptions } from "./paste";
import { startServer } from "../server/api";
import { startWatcher } from "./watch";
import { startMcpServer } from "../server/mcp";
import { setOutputMode, convertSingleFile, convertFolder, convertUrl, convertStdin, cliError } from "./run";

const VALID_FORMATS = new Set(["md", "json", "yaml", "docx", "pptx", "html"]);

function parseArgs(argv: string[]) {
  // Bun.argv: [bun, script, ...args]
  const args = argv.slice(2);
  let input: string | null = null;
  let format: OutputFormat = "md";
  let output: string | null = null;
  let formatExplicit = false;
  let force = false;
  let pandocArgs: string[] = [];
  let command: string | null = null;
  let template: string | null = null;
  let isGlobal = false;
  let ocr: OcrOptions | undefined;
  let yes = false;
  let json = false;
  let quiet = false;

  // Watch subcommand options
  let watchTo: string | null = null;
  // stdin/stdout flags
  let useStdin = false;
  let useStdout = false;
  // Chunking flags
  let chunks = false;
  let chunkSize: number | null = null;

  // Check for subcommand as first positional arg
  if (args.length > 0 && (args[0] === "init" || args[0] === "config" || args[0] === "paste" || args[0] === "open" || args[0] === "formats" || args[0] === "watch" || args[0] === "serve")) {
    command = args[0];
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--global") isGlobal = true;
    }
    if (command === "paste") {
      const pasteOpts: PasteOptions = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--copy") pasteOpts.copy = true;
        else if (args[i] === "--stdout") pasteOpts.stdout = true;
        else if (args[i] === "-o" || args[i] === "--output") {
          pasteOpts.output = args[++i];
          if (!pasteOpts.output) {
            console.error("Missing output path.");
            process.exit(1);
          }
        }
      }
      return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts, watchTo };
    }
    if (command === "watch") {
      // docs2llm watch <dir> --to <dir>
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--to" || args[i] === "-o") {
          watchTo = args[++i] || null;
        } else if (!args[i].startsWith("-") && !input) {
          input = args[i];
        }
      }
      return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts: undefined, watchTo };
    }
    return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts: undefined, watchTo };
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      pandocArgs = args.slice(i + 1);
      break;
    } else if (arg === "--force" || arg === "-y") {
      force = true;
    } else if (arg === "--global") {
      isGlobal = true;
    } else if (arg === "-t" || arg === "--template") {
      template = args[++i];
      if (!template) {
        console.error("Missing template name.");
        process.exit(1);
      }
    } else if (arg === "-f" || arg === "--format") {
      const val = args[++i];
      if (!val || !VALID_FORMATS.has(val)) {
        console.error(
          `✗ Unknown format '${val ?? "(empty)"}'.\n` +
          `  Inbound (document → text): md, json, yaml\n` +
          `  Outbound (Markdown → document): docx, pptx, html`
        );
        process.exit(1);
      }
      format = val as OutputFormat;
      formatExplicit = true;
    } else if (arg === "-o" || arg === "--output") {
      output = args[++i];
      if (!output) {
        console.error("Missing output path.");
        process.exit(1);
      }
    } else if (arg === "--ocr") {
      ocr = { ...ocr, enabled: true };
    } else if (arg === "--ocr=force") {
      ocr = { ...ocr, enabled: true, force: true };
    } else if (arg.startsWith("--ocr-lang=")) {
      const lang = arg.split("=")[1];
      ocr = { ...ocr, enabled: true, language: lang };
    } else if (arg === "--ocr-lang") {
      const lang = args[++i];
      if (!lang) {
        console.error("Missing OCR language code.");
        process.exit(1);
      }
      ocr = { ...ocr, enabled: true, language: lang };
    } else if (arg === "--stdin") {
      useStdin = true;
    } else if (arg === "--stdout") {
      useStdout = true;
    } else if (arg === "--chunks") {
      chunks = true;
    } else if (arg.startsWith("--chunk-size=")) {
      chunkSize = parseInt(arg.split("=")[1], 10);
      if (isNaN(chunkSize) || chunkSize <= 0) {
        console.error("✗ --chunk-size must be a positive number.");
        process.exit(1);
      }
      chunks = true;
    } else if (arg === "--chunk-size") {
      chunkSize = parseInt(args[++i], 10);
      if (isNaN(chunkSize) || chunkSize <= 0) {
        console.error("✗ --chunk-size must be a positive number.");
        process.exit(1);
      }
      chunks = true;
    } else if (arg === "-Y" || arg === "--yes") {
      yes = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "-q" || arg === "--quiet") {
      quiet = true;
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, ocr, pasteOpts: undefined as PasteOptions | undefined, watchTo: null as string | null, useStdin, useStdout, chunks, chunkSize, yes, json, quiet };
}

function printHelp() {
  console.log(`
docs2llm — Convert documents to LLM-friendly text

Usage:
  docs2llm                          Interactive mode
  docs2llm <file>                   Convert a file to .md
  docs2llm <folder>                 Convert all files in folder
  docs2llm <url>                    Fetch and convert a web page
  docs2llm <file> -f json -o ./out  Convert with options
  docs2llm <file> -t report         Use a named template

  Outbound (Markdown → documents, requires Pandoc):
  docs2llm notes.md -f docx         Convert .md to Word
  docs2llm notes.md -f pptx         Convert .md to PowerPoint
  docs2llm notes.md -f html         Convert .md to HTML

  Clipboard:
  docs2llm paste                    Clipboard → Markdown (interactive)
  docs2llm paste --copy             Convert and copy back to clipboard
  docs2llm paste --stdout           Convert and print to terminal
  docs2llm paste -o <file>          Convert and save to file

  Piping:
  cat report.pdf | docs2llm --stdin           Read from stdin
  cat report.pdf | docs2llm --stdin --stdout  Read from stdin, write to stdout

  Watch:
  docs2llm watch <dir> --to <dir>   Auto-convert new files in folder

  MCP:
  docs2llm serve                    Start MCP server for Claude Desktop / Cursor

  Web UI:
  docs2llm open                     Launch web UI at localhost:3000

  Info:
  docs2llm formats                  List all supported formats

  Config:
  docs2llm init                     Create local .docs2llm.yaml
  docs2llm init --global            Create global config
  docs2llm config                   View and manage config

Options:
  -f, --format <fmt>      Output format (default: md)
                            Inbound:  md, json, yaml
                            Outbound: docx, pptx, html (requires Pandoc)
  -t, --template <name>   Use a named template from config
  -o, --output <path>     Output directory
  -y, --force             Overwrite output files without prompting
  --ocr                   Enable OCR for scanned documents
  --ocr=force             Force OCR even if text is available
  --ocr-lang <code>       OCR language (e.g., deu, fra, jpn)
  -Y, --yes               Accept all defaults (implies --force)
  -q, --quiet             Only show errors and final output path
  --json                  Machine-readable JSON output (implies --yes)
  --stdin                 Read input from stdin instead of a file
  --stdout                Write output to stdout instead of a file
  --chunks                Split output into chunks (for RAG pipelines)
  --chunk-size <tokens>   Target tokens per chunk (default: 4000)
  --                      Pass remaining args to Pandoc (outbound only)
  -h, --help              Show this help
`);
}

function printFormats() {
  console.log(`
docs2llm — Supported formats

Documents:
  .docx  Word document
  .doc   Word document (legacy)
  .pptx  PowerPoint presentation
  .ppt   PowerPoint (legacy)
  .xlsx  Excel spreadsheet
  .xls   Excel (legacy)
  .odt   OpenDocument text
  .odp   OpenDocument presentation
  .ods   OpenDocument spreadsheet
  .rtf   Rich Text Format
  .pdf   PDF document (with OCR support for scanned pages)

Text & Data:
  .txt   Plain text
  .csv   Comma-separated values
  .tsv   Tab-separated values
  .html  Web page
  .xml   XML document
  .md    Markdown

Email:
  .eml   Email message
  .msg   Outlook message

eBooks:
  .epub  EPUB ebook
  .mobi  Kindle ebook

Images (via OCR):
  .png .jpg .jpeg .tiff .bmp .gif .webp

Tip: most source code files are also supported.
     Use --ocr for scanned PDFs and images.
`);
}

async function main() {
  const { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, ocr, pasteOpts, watchTo, useStdin, useStdout, chunks, chunkSize, yes = false, json = false, quiet = false } =
    parseArgs(Bun.argv);

  // --json implies --yes, --yes implies --force
  const effectiveYes = yes || json;
  setOutputMode(quiet, json);

  // Handle subcommands
  if (command === "init") {
    await runInit(isGlobal);
    return;
  }
  if (command === "config") {
    await runConfigWizard();
    return;
  }
  if (command === "paste") {
    await runPaste(pasteOpts ?? {});
    return;
  }
  if (command === "formats") {
    printFormats();
    return;
  }
  if (command === "open") {
    let server;
    try {
      server = startServer(3000);
    } catch {
      server = startServer(0);
    }
    const url = `http://localhost:${server.port}`;
    if (process.platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
    } else if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", url], { stdout: "ignore", stderr: "ignore" });
    } else {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
    }
    return;
  }
  if (command === "watch") {
    const watchDir = input ? resolve(input) : process.cwd();
    const outDir = watchTo ? resolve(watchTo) : resolve(watchDir, "converted");
    startWatcher(watchDir, outDir);
    return;
  }
  if (command === "serve") {
    await startMcpServer();
    return;
  }

  // --yes requires a file path
  if (effectiveYes && !input && !command) {
    console.error("✗ --yes requires a file path.");
    process.exit(1);
  }

  // Non-TTY detection
  if (!input && !command && !process.stdin.isTTY) {
    console.error(
      "✗ Non-interactive terminal detected.\n" +
      "  Provide a file path: docs2llm <file>\n" +
      "  Or pipe with flags: cat doc.pdf | docs2llm --stdin --stdout"
    );
    process.exit(1);
  }

  // Load config
  const config = loadConfig();

  // Apply config defaults
  const effectiveForce = force || effectiveYes || config.defaults?.force || false;

  // Resolve format: explicit -f > template format > config default > "md" (validate handles smart default)
  let effectiveFormat = format;
  let effectiveFormatExplicit = formatExplicit;

  if (template) {
    try {
      const tpl = resolveTemplate(config, template);
      if (!formatExplicit) {
        effectiveFormat = tpl.format;
        effectiveFormatExplicit = true;
      }
    } catch (err: any) {
      cliError(`✗ ${err.message}`);
      process.exit(1);
    }
  }

  // Resolve output dir: explicit -o > config default
  const effectiveOutputDir = output
    ? resolve(output)
    : config.defaults?.outputDir
      ? resolve(config.defaults.outputDir)
      : undefined;

  // stdin mode: read binary data from stdin and convert
  if (useStdin) {
    await convertStdin(format, useStdout, effectiveOutputDir, effectiveForce, ocr, chunks, chunkSize);
    return;
  }

  if (!input) {
    await runInteractive(config);
    return;
  }

  // URL detection: fetch and convert web pages or remote documents
  if (input.startsWith("http://") || input.startsWith("https://")) {
    await convertUrl(input, effectiveFormat, effectiveOutputDir, effectiveForce, useStdout);
    return;
  }

  const resolvedInput = resolve(input);
  let stat;
  try {
    stat = statSync(resolvedInput);
  } catch {
    const cwd = process.cwd().replace(homedir(), "~");
    cliError(
      `✗ Can't find '${input}'.\n` +
      `  Current folder: ${cwd}\n` +
      `  Tip: drag the file from Finder into this terminal, or use an absolute path.\n` +
      `  Tip: to convert a web page, use a full URL starting with https://`
    );
    process.exit(1);
  }

  if (effectiveOutputDir) {
    mkdirSync(effectiveOutputDir, { recursive: true });
  }

  if (stat.isFile()) {
    await convertSingleFile(
      resolvedInput, effectiveFormat, effectiveOutputDir,
      effectiveFormatExplicit, effectiveForce, pandocArgs, config, template, ocr,
      useStdout, chunks, chunkSize
    );
  } else if (stat.isDirectory()) {
    await convertFolder(
      resolvedInput, effectiveFormat, effectiveOutputDir,
      effectiveFormatExplicit, effectiveForce, pandocArgs, config, template, ocr
    );
  } else {
    cliError(
      `✗ '${input}' is not a file or folder.\n` +
      `  Tip: check the path and try again.`
    );
    process.exit(1);
  }
}

main();

#!/usr/bin/env bun

import { resolve } from "path";
import { statSync, mkdirSync, existsSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { convertFile, looksLikeScannedPdf, type OutputFormat, type OcrOptions } from "./convert";
import { writeOutput } from "./output";
import { buildPlan, ValidationError } from "./validate";
import { runInteractive } from "./interactive";
import {
  loadConfig,
  resolveTemplate,
  buildPandocArgs,
  type Config,
} from "./config";
import { runInit } from "./init";
import { runConfigWizard } from "./config-wizard";
import { runPaste, type PasteOptions } from "./paste";
import { getTokenStats, formatTokenStats } from "./tokens";
import { startServer } from "./api";
import { fetchAndConvert } from "./fetch";
import { startWatcher } from "./watch";
import { startMcpServer } from "./mcp";

function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

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
      chunks = true;
    } else if (arg === "--chunk-size") {
      chunkSize = parseInt(args[++i], 10);
      chunks = true;
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, ocr, pasteOpts: undefined as PasteOptions | undefined, watchTo: null as string | null, useStdin, useStdout, chunks, chunkSize };
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
  const { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, ocr, pasteOpts, watchTo, useStdin, useStdout, chunks, chunkSize } =
    parseArgs(Bun.argv);

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
    const port = 3000;
    startServer(port);
    const url = `http://localhost:${port}`;
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

  // Load config
  const config = loadConfig();

  // Apply config defaults
  const effectiveForce = force || config.defaults?.force || false;

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
      console.error(`✗ ${err.message}`);
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
    await convertUrl(input, effectiveOutputDir, effectiveForce, useStdout);
    return;
  }

  const resolvedInput = resolve(input);
  let stat;
  try {
    stat = statSync(resolvedInput);
  } catch {
    const cwd = process.cwd().replace(homedir(), "~");
    console.error(
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
    console.error(
      `✗ '${input}' is not a file or folder.\n` +
      `  Tip: check the path and try again.`
    );
    process.exit(1);
  }
}

async function convertSingleFile(
  filePath: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null,
  ocr?: OcrOptions,
  useStdout?: boolean,
  chunks?: boolean,
  chunkSize?: number | null,
) {
  let plan;
  try {
    plan = buildPlan(filePath, format, {
      outputDir,
      formatExplicit,
      defaultMdFormat: config?.defaults?.format,
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      console.error(`✗ ${err.message}`);
      if (err.message.includes("Outbound formats")) {
        console.error("  Tip: only .md files can be converted to docx/pptx/html.");
      }
      process.exit(1);
    }
    throw err;
  }

  // Resolve pandoc args through config for outbound
  if (plan.direction === "outbound" && config) {
    plan.pandocArgs = buildPandocArgs(
      plan.format, config, templateName ?? undefined, cliPandocArgs
    );
    if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
  } else if (cliPandocArgs?.length && plan.direction === "inbound") {
    console.log(`⚠ Pandoc args ignored for inbound conversion (${filePath})`);
  }

  if (!useStdout && !force && existsSync(plan.outputPath)) {
    const ok = await confirm(`Output file already exists: ${plan.outputPath}\nOverwrite? [y/N] `);
    if (!ok) process.exit(0);
  }

  try {
    if (plan.direction === "outbound") {
      const result = await convertFile(filePath, plan.format, {
        outputDir,
        pandocArgs: plan.pandocArgs,
      });
      console.log(`✓ ${filePath} → ${result.outputPath}`);
    } else {
      let result = await convertFile(filePath, plan.format, { ocr });

      // Auto-detect scanned PDFs
      if (!ocr?.enabled && looksLikeScannedPdf(filePath, result.content)) {
        if (!useStdout) console.log("⚠ This looks like a scanned document. Retrying with OCR…");
        result = await convertFile(filePath, plan.format, { ocr: { enabled: true, force: true } });
      }

      // --chunks mode: split and output as JSON
      if (chunks) {
        const { splitToFit } = await import("./tokens");
        const targetSize = chunkSize || 4000;
        const splitResult = splitToFit(result.content, targetSize);
        const output = splitResult.parts.map((text, i) => ({
          index: i,
          content: text,
          tokens: splitResult.tokensPerPart[i],
        }));

        if (useStdout) {
          process.stdout.write(JSON.stringify(output, null, 2));
        } else {
          await writeOutput(plan.outputPath, JSON.stringify(output, null, 2));
          console.log(`✓ ${filePath} → ${plan.outputPath} (${splitResult.parts.length} chunks)`);
        }
        return;
      }

      // --stdout mode: write to stdout
      if (useStdout) {
        process.stdout.write(result.formatted);
        return;
      }

      await writeOutput(plan.outputPath, result.formatted);
      const stats = getTokenStats(result.content);
      console.log(`✓ ${filePath} → ${plan.outputPath} (${formatTokenStats(stats)})`);

      // Quality warning
      if (result.qualityScore != null && result.qualityScore < 0.5) {
        console.log("⚠ Some text may not have been extracted correctly. Check the output.");
      }
    }
  } catch (err: any) {
    const msg = err.message ?? String(err);
    console.error(`✗ ${filePath}: ${msg}`);
    if (msg.includes("Pandoc")) {
      console.error("  Tip: install Pandoc with: brew install pandoc");
    }
    if (msg.includes("Unsupported") || msg.includes("format")) {
      console.error("  Tip: run docs2llm formats to see what's supported.");
    }
    process.exit(1);
  }
}

async function convertFolder(
  dir: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null,
  ocr?: OcrOptions
) {
  const { readdirSync } = await import("fs");
  const { join, basename } = await import("path");

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => join(dir, e.name));

  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  if (cliPandocArgs?.length) {
    const hasInbound = files.some((f) => {
      try {
        return buildPlan(f, format, {
          outputDir,
          formatExplicit,
          defaultMdFormat: config?.defaults?.format,
        }).direction === "inbound";
      } catch { return false; }
    });
    if (hasInbound) {
      console.log("⚠ Pandoc args ignored for inbound conversions.");
    }
  }

  if (!force) {
    const overwrites: string[] = [];
    for (const file of files) {
      try {
        const plan = buildPlan(file, format, {
          outputDir,
          formatExplicit,
          defaultMdFormat: config?.defaults?.format,
        });
        if (existsSync(plan.outputPath)) {
          overwrites.push(basename(plan.outputPath));
        }
      } catch { /* skip */ }
    }
    if (overwrites.length > 0) {
      console.log(`${overwrites.length} file(s) would be overwritten:\n  ${overwrites.join(", ")}`);
      const ok = await confirm("Continue? [y/N] ");
      if (!ok) process.exit(0);
    }
  }

  // Build plans for all files first
  interface FilePlan {
    file: string;
    plan: ReturnType<typeof buildPlan>;
  }
  const filePlans: FilePlan[] = [];
  let skipped = 0;

  for (const file of files) {
    try {
      const plan = buildPlan(file, format, {
        outputDir,
        formatExplicit,
        defaultMdFormat: config?.defaults?.format,
      });

      // Resolve pandoc args for outbound
      if (plan.direction === "outbound" && config) {
        plan.pandocArgs = buildPandocArgs(
          plan.format, config, templateName ?? undefined, cliPandocArgs
        );
        if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
      }

      filePlans.push({ file, plan });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.log(`⊘ ${file}: ${err.message}`);
        skipped++;
      } else {
        throw err;
      }
    }
  }

  // Process files in parallel batches (concurrency = 4)
  const BATCH_SIZE = 4;
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < filePlans.length; i += BATCH_SIZE) {
    const batch = filePlans.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ file, plan }) => {
        if (plan.direction === "outbound") {
          const result = await convertFile(file, plan.format, {
            outputDir,
            pandocArgs: plan.pandocArgs,
          });
          console.log(`✓ ${file} → ${result.outputPath}`);
        } else {
          let result = await convertFile(file, plan.format, { ocr });
          if (!ocr?.enabled && looksLikeScannedPdf(file, result.content)) {
            console.log(`⚠ ${file}: scanned document detected, retrying with OCR…`);
            result = await convertFile(file, plan.format, { ocr: { enabled: true, force: true } });
          }
          await writeOutput(plan.outputPath, result.formatted);
          const stats = getTokenStats(result.content);
          console.log(`✓ ${file} → ${plan.outputPath} (${formatTokenStats(stats)})`);
          if (result.qualityScore != null && result.qualityScore < 0.5) {
            console.log(`  ⚠ Low quality extraction. Check the output.`);
          }
        }
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === "fulfilled") {
        ok++;
      } else {
        const reason = (results[j] as PromiseRejectedResult).reason;
        console.error(`✗ ${batch[j].file}: ${reason?.message ?? reason}`);
        fail++;
      }
    }
  }

  const parts = [`${ok} converted`, `${fail} failed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  console.log(`\nDone: ${parts.join(", ")}.`);
}

async function convertUrl(url: string, outputDir?: string, force?: boolean, useStdout?: boolean) {
  const { basename: pathBasename } = await import("path");

  try {
    if (!useStdout) console.log(`Fetching ${url}…`);
    const result = await fetchAndConvert(url);

    if (useStdout) {
      process.stdout.write(result.content);
      return;
    }

    // Derive a filename from the URL
    let urlPath = new URL(url).pathname.replace(/\/$/, "");
    let name = pathBasename(urlPath) || "page";
    // Strip extension if it had one, we always output .md
    name = name.replace(/\.[^.]+$/, "");
    const outName = `${name}.md`;
    const outPath = outputDir ? resolve(outputDir, outName) : resolve(outName);

    if (!force && existsSync(outPath)) {
      const ok = await confirm(`Output file already exists: ${outPath}\nOverwrite? [y/N] `);
      if (!ok) process.exit(0);
    }

    await writeOutput(outPath, result.content);
    const stats = getTokenStats(result.content);
    console.log(`✓ ${url} → ${outPath} (${formatTokenStats(stats)})`);
  } catch (err: any) {
    console.error(
      `✗ Failed to fetch '${url}'.\n` +
      `  ${err.message ?? err}\n` +
      `  Tip: check the URL is correct and accessible.`
    );
    process.exit(1);
  }
}

async function convertStdin(
  format: OutputFormat,
  useStdout: boolean,
  outputDir?: string,
  force?: boolean,
  ocr?: OcrOptions,
  chunks?: boolean,
  chunkSize?: number | null,
) {
  const { convertBytes } = await import("./convert");

  // Read all of stdin as bytes
  const inputChunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    inputChunks.push(chunk);
  }
  const totalLength = inputChunks.reduce((sum, c) => sum + c.length, 0);
  const data = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of inputChunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  if (data.length === 0) {
    console.error("✗ No data received on stdin.");
    process.exit(1);
  }

  try {
    // Auto-detect MIME type from magic bytes
    const mime = detectMimeFromBytes(data);
    const result = await convertBytes(data, mime, ocr);

    const content = result.content;

    if (chunks) {
      const { splitToFit } = await import("./tokens");
      const targetSize = chunkSize || 4000;
      const splitResult = splitToFit(content, targetSize);
      const output = splitResult.parts.map((text, i) => ({
        index: i,
        content: text,
        tokens: splitResult.tokensPerPart[i],
      }));
      process.stdout.write(JSON.stringify(output, null, 2));
      return;
    }

    if (useStdout) {
      process.stdout.write(content);
      return;
    }

    // Write to file
    const outPath = outputDir ? resolve(outputDir, "stdin-output.md") : resolve("stdin-output.md");
    if (!force && existsSync(outPath)) {
      const ok = await confirm(`Output file already exists: ${outPath}\nOverwrite? [y/N] `);
      if (!ok) process.exit(0);
    }
    await writeOutput(outPath, content);
    const stats = getTokenStats(content);
    console.log(`✓ stdin → ${outPath} (${formatTokenStats(stats)})`);
  } catch (err: any) {
    console.error(`✗ stdin: ${err.message ?? err}`);
    process.exit(1);
  }
}

function detectMimeFromBytes(data: Uint8Array): string {
  // PDF: %PDF
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "application/pdf";
  }
  // ZIP-based (docx, pptx, xlsx, epub, odt): PK\x03\x04
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    return "application/zip";
  }
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "image/gif";
  }
  // Try as text/HTML
  const head = new TextDecoder().decode(data.slice(0, 256)).trim();
  if (head.startsWith("<!") || head.startsWith("<html") || head.startsWith("<HTML")) {
    return "text/html";
  }
  // Default to plain text
  return "text/plain";
}

main();

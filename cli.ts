#!/usr/bin/env bun

import { resolve } from "path";
import { statSync, mkdirSync } from "fs";
import { convertFile, type OutputFormat } from "./convert";
import { resolveOutputPath, writeOutput } from "./output";
import { runInteractive } from "./interactive";

const VALID_FORMATS = new Set(["md", "json", "yaml", "docx", "pptx", "html"]);

function parseArgs(argv: string[]) {
  // Bun.argv: [bun, script, ...args]
  const args = argv.slice(2);
  let input: string | null = null;
  let format: OutputFormat = "md";
  let output: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-f" || arg === "--format") {
      const val = args[++i];
      if (!val || !VALID_FORMATS.has(val)) {
        console.error(`Invalid format: ${val ?? "(empty)"}. Use: md, json, yaml, docx, pptx, html`);
        process.exit(1);
      }
      format = val as OutputFormat;
    } else if (arg === "-o" || arg === "--output") {
      output = args[++i];
      if (!output) {
        console.error("Missing output path.");
        process.exit(1);
      }
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  return { input, format, output };
}

function printHelp() {
  console.log(`
convert-the-doc — Convert documents to LLM-friendly text

Usage:
  convert-the-doc                          Interactive mode
  convert-the-doc <file>                   Convert a file to .md
  convert-the-doc <folder>                 Convert all files in folder
  convert-the-doc <file> -f json -o ./out  Convert with options

  Outbound (Markdown → documents, requires Pandoc):
  convert-the-doc notes.md -f docx         Convert .md to Word
  convert-the-doc notes.md -f pptx         Convert .md to PowerPoint
  convert-the-doc notes.md -f html         Convert .md to HTML

Options:
  -f, --format <fmt>   Output format (default: md)
                        Inbound:  md, json, yaml
                        Outbound: docx, pptx, html (requires Pandoc)
  -o, --output <path>  Output directory
  -h, --help           Show this help
`);
}

async function main() {
  const { input, format, output } = parseArgs(Bun.argv);

  if (!input) {
    await runInteractive();
    return;
  }

  const resolvedInput = resolve(input);
  let stat;
  try {
    stat = statSync(resolvedInput);
  } catch {
    console.error(`Not found: ${input}`);
    process.exit(1);
  }

  const outputDir = output ? resolve(output) : undefined;
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  if (stat.isFile()) {
    await convertSingleFile(resolvedInput, format, outputDir);
  } else if (stat.isDirectory()) {
    await convertFolder(resolvedInput, format, outputDir);
  } else {
    console.error(`Not a file or folder: ${input}`);
    process.exit(1);
  }
}

async function convertSingleFile(
  filePath: string,
  format: OutputFormat,
  outputDir?: string
) {
  try {
    const result = await convertFile(filePath, format);

    if (result.outputPath) {
      // Outbound: Pandoc already wrote the file
      console.log(`✓ ${filePath} → ${result.outputPath}`);
    } else {
      // Inbound: write the formatted text
      const outPath = resolveOutputPath(filePath, format, outputDir);
      await writeOutput(outPath, result.formatted);
      console.log(`✓ ${filePath} → ${outPath}`);
    }
  } catch (err: any) {
    console.error(`✗ ${filePath}: ${err.message ?? err}`);
    process.exit(1);
  }
}

async function convertFolder(
  dir: string,
  format: OutputFormat,
  outputDir?: string
) {
  const { readdirSync } = await import("fs");
  const { join } = await import("path");

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => join(dir, e.name));

  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const file of files) {
    try {
      const result = await convertFile(file, format);

      if (result.outputPath) {
        console.log(`✓ ${file} → ${result.outputPath}`);
      } else {
        const outPath = resolveOutputPath(file, format, outputDir);
        await writeOutput(outPath, result.formatted);
        console.log(`✓ ${file} → ${outPath}`);
      }
      ok++;
    } catch (err: any) {
      console.error(`✗ ${file}: ${err.message ?? err}`);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} converted, ${fail} failed.`);
}

main();

#!/usr/bin/env bun

import { resolve } from "path";
import { statSync, mkdirSync, existsSync } from "fs";
import { createInterface } from "readline";
import { convertFile, type OutputFormat } from "./convert";
import { writeOutput } from "./output";
import { buildPlan, ValidationError } from "./validate";
import { runInteractive } from "./interactive";

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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      pandocArgs = args.slice(i + 1);
      break;
    } else if (arg === "--force" || arg === "-y") {
      force = true;
    } else if (arg === "-f" || arg === "--format") {
      const val = args[++i];
      if (!val || !VALID_FORMATS.has(val)) {
        console.error(`Invalid format: ${val ?? "(empty)"}. Use: md, json, yaml, docx, pptx, html`);
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
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      input = arg;
    }
  }

  return { input, format, output, formatExplicit, force, pandocArgs };
}

function printHelp() {
  console.log(`
con-the-doc — Convert documents to LLM-friendly text

Usage:
  con-the-doc                          Interactive mode
  con-the-doc <file>                   Convert a file to .md
  con-the-doc <folder>                 Convert all files in folder
  con-the-doc <file> -f json -o ./out  Convert with options

  Outbound (Markdown → documents, requires Pandoc):
  con-the-doc notes.md -f docx         Convert .md to Word
  con-the-doc notes.md -f pptx         Convert .md to PowerPoint
  con-the-doc notes.md -f html         Convert .md to HTML

Options:
  -f, --format <fmt>   Output format (default: md)
                        Inbound:  md, json, yaml
                        Outbound: docx, pptx, html (requires Pandoc)
  -o, --output <path>  Output directory
  -y, --force          Overwrite output files without prompting
  --                   Pass remaining args to Pandoc (outbound only)
  -h, --help           Show this help
`);
}

async function main() {
  const { input, format, output, formatExplicit, force, pandocArgs } = parseArgs(Bun.argv);

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
    await convertSingleFile(resolvedInput, format, outputDir, formatExplicit, force, pandocArgs);
  } else if (stat.isDirectory()) {
    await convertFolder(resolvedInput, format, outputDir, formatExplicit, force, pandocArgs);
  } else {
    console.error(`Not a file or folder: ${input}`);
    process.exit(1);
  }
}

async function convertSingleFile(
  filePath: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  pandocArgs?: string[]
) {
  let plan;
  try {
    plan = buildPlan(filePath, format, { outputDir, formatExplicit, pandocArgs });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (pandocArgs?.length && plan.direction === "inbound") {
    console.log(`⚠ Pandoc args ignored for inbound conversion (${filePath})`);
  }

  if (!force && existsSync(plan.outputPath)) {
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
      const result = await convertFile(filePath, plan.format);
      await writeOutput(plan.outputPath, result.formatted);
      console.log(`✓ ${filePath} → ${plan.outputPath}`);
    }
  } catch (err: any) {
    console.error(`✗ ${filePath}: ${err.message ?? err}`);
    process.exit(1);
  }
}

async function convertFolder(
  dir: string,
  format: OutputFormat,
  outputDir?: string,
  formatExplicit?: boolean,
  force?: boolean,
  pandocArgs?: string[]
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

  if (pandocArgs?.length) {
    // Check if any file would be inbound — warn once
    const hasInbound = files.some((f) => {
      try {
        return buildPlan(f, format, { outputDir, formatExplicit, pandocArgs }).direction === "inbound";
      } catch { return false; }
    });
    if (hasInbound) {
      console.log("⚠ Pandoc args ignored for inbound conversions.");
    }
  }

  // Collect files that would be overwritten
  if (!force) {
    const overwrites: string[] = [];
    for (const file of files) {
      try {
        const plan = buildPlan(file, format, { outputDir, formatExplicit, pandocArgs });
        if (existsSync(plan.outputPath)) {
          overwrites.push(basename(plan.outputPath));
        }
      } catch { /* skip — will be handled during conversion */ }
    }
    if (overwrites.length > 0) {
      console.log(`${overwrites.length} file(s) would be overwritten:\n  ${overwrites.join(", ")}`);
      const ok = await confirm("Continue? [y/N] ");
      if (!ok) process.exit(0);
    }
  }

  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (const file of files) {
    let plan;
    try {
      plan = buildPlan(file, format, { outputDir, formatExplicit, pandocArgs });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.log(`⊘ ${file}: ${err.message}`);
        skipped++;
        continue;
      }
      throw err;
    }

    try {
      if (plan.direction === "outbound") {
        const result = await convertFile(file, plan.format, {
          outputDir,
          pandocArgs: plan.pandocArgs,
        });
        console.log(`✓ ${file} → ${result.outputPath}`);
      } else {
        const result = await convertFile(file, plan.format);
        await writeOutput(plan.outputPath, result.formatted);
        console.log(`✓ ${file} → ${plan.outputPath}`);
      }
      ok++;
    } catch (err: any) {
      console.error(`✗ ${file}: ${err.message ?? err}`);
      fail++;
    }
  }

  const parts = [`${ok} converted`, `${fail} failed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  console.log(`\nDone: ${parts.join(", ")}.`);
}

main();

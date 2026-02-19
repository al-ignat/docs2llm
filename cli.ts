#!/usr/bin/env bun

import { resolve } from "path";
import { statSync, mkdirSync, existsSync } from "fs";
import { createInterface } from "readline";
import { convertFile, type OutputFormat } from "./convert";
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

  // Check for subcommand as first positional arg
  if (args.length > 0 && (args[0] === "init" || args[0] === "config" || args[0] === "paste")) {
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
      return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts };
    }
    return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts: undefined };
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

  return { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts: undefined as PasteOptions | undefined };
}

function printHelp() {
  console.log(`
con-the-doc — Convert documents to LLM-friendly text

Usage:
  con-the-doc                          Interactive mode
  con-the-doc <file>                   Convert a file to .md
  con-the-doc <folder>                 Convert all files in folder
  con-the-doc <file> -f json -o ./out  Convert with options
  con-the-doc <file> -t report         Use a named template

  Outbound (Markdown → documents, requires Pandoc):
  con-the-doc notes.md -f docx         Convert .md to Word
  con-the-doc notes.md -f pptx         Convert .md to PowerPoint
  con-the-doc notes.md -f html         Convert .md to HTML

  Clipboard:
  con-the-doc paste                    Clipboard → Markdown (interactive)
  con-the-doc paste --copy             Convert and copy back to clipboard
  con-the-doc paste --stdout           Convert and print to terminal
  con-the-doc paste -o <file>          Convert and save to file

  Config:
  con-the-doc init                     Create local .con-the-doc.yaml
  con-the-doc init --global            Create global config
  con-the-doc config                   View and manage config

Options:
  -f, --format <fmt>      Output format (default: md)
                            Inbound:  md, json, yaml
                            Outbound: docx, pptx, html (requires Pandoc)
  -t, --template <name>   Use a named template from config
  -o, --output <path>     Output directory
  -y, --force             Overwrite output files without prompting
  --                      Pass remaining args to Pandoc (outbound only)
  -h, --help              Show this help
`);
}

async function main() {
  const { input, format, output, formatExplicit, force, pandocArgs, command, template, isGlobal, pasteOpts } =
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

  if (!input) {
    await runInteractive(config);
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

  if (effectiveOutputDir) {
    mkdirSync(effectiveOutputDir, { recursive: true });
  }

  if (stat.isFile()) {
    await convertSingleFile(
      resolvedInput, effectiveFormat, effectiveOutputDir,
      effectiveFormatExplicit, effectiveForce, pandocArgs, config, template
    );
  } else if (stat.isDirectory()) {
    await convertFolder(
      resolvedInput, effectiveFormat, effectiveOutputDir,
      effectiveFormatExplicit, effectiveForce, pandocArgs, config, template
    );
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
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null
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
  cliPandocArgs?: string[],
  config?: Config,
  templateName?: string | null
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

  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (const file of files) {
    let plan;
    try {
      plan = buildPlan(file, format, {
        outputDir,
        formatExplicit,
        defaultMdFormat: config?.defaults?.format,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        console.log(`⊘ ${file}: ${err.message}`);
        skipped++;
        continue;
      }
      throw err;
    }

    // Resolve pandoc args for outbound
    if (plan.direction === "outbound" && config) {
      plan.pandocArgs = buildPandocArgs(
        plan.format, config, templateName ?? undefined, cliPandocArgs
      );
      if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
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

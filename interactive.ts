import * as p from "@clack/prompts";
import { resolve, extname, dirname, join, basename } from "path";
import { statSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { convertFile, looksLikeScannedPdf, type OutputFormat } from "./convert";
import { writeOutput } from "./output";
import { buildPlan, ValidationError } from "./validate";
import { scanForFiles, formatHint, type FileInfo } from "./scan";
import { buildPandocArgs, findLocalConfig, GLOBAL_CONFIG_PATH, type Config } from "./config";
import { writeClipboard } from "./clipboard";
import {
  getTokenStats,
  formatTokenStats,
  checkLLMFit,
  formatLLMFit,
  anyTooLong,
  smallestLimit,
  truncateToFit,
  splitToFit,
  estimateTokens,
} from "./tokens";
import { fetchAndConvert } from "./fetch";

export type FormatChoice =
  | { kind: "format"; format: OutputFormat }
  | { kind: "template"; name: string; format: OutputFormat };

export async function runInteractive(config?: Config) {
  const isFirstRun = !findLocalConfig() && !existsSync(GLOBAL_CONFIG_PATH);

  if (isFirstRun) {
    p.intro("Welcome to docs2llm!");
    p.log.info(
      "Convert any document to LLM-friendly text.\n" +
      "Tip: you can also convert files directly — docs2llm report.pdf\n" +
      "Tip: drag a file from Finder into this terminal."
    );
  } else {
    p.intro("docs2llm");
  }

  const filePath = await pickFile();
  if (!filePath) return;

  // Handle URL conversion
  if (filePath.startsWith("__url__:")) {
    const url = filePath.slice(8);
    await convertUrlInteractive(url, config);
    if (isFirstRun) {
      p.log.info("Tip: run docs2llm init to save your preferences.");
    }
    p.outro("Done!");
    return;
  }

  // Handle batch conversion
  if (filePath.startsWith("__batch__:")) {
    const dir = filePath.slice(10);
    await convertBatchInteractive(dir, config);
    if (isFirstRun) {
      p.log.info("Tip: run docs2llm init to save your preferences.");
    }
    p.outro("Done!");
    return;
  }

  const choice = await pickFormat(filePath, config);
  if (!choice) return;

  const outputDir = await pickOutputDir(filePath, config);
  if (outputDir === null) return;

  const templateName = choice.kind === "template" ? choice.name : undefined;
  await convert(filePath, choice.format, config, templateName, outputDir);

  if (isFirstRun) {
    p.log.info("Tip: run docs2llm init to save your preferences.");
  }

  p.outro("Done!");
}

async function pickFile(): Promise<string | null> {
  const { cwd, downloads } = scanForFiles();
  const hasFiles = cwd.length > 0 || downloads.length > 0;

  if (!hasFiles) {
    p.log.warn(
      "No convertible files found in current folder or ~/Downloads.\n" +
      "Tip: drag a file from Finder into this terminal."
    );
    return await manualInput();
  }

  type PickValue = string | symbol;
  const options: { value: PickValue; label: string; hint?: string }[] = [];

  if (cwd.length > 0) {
    for (const file of cwd) {
      options.push({
        value: file.path,
        label: file.name,
        hint: formatHint(file),
      });
    }
  }

  if (downloads.length > 0) {
    if (cwd.length > 0) {
      options.push({ value: "__sep__", label: "── Downloads ──", hint: "" });
    }
    for (const file of downloads) {
      options.push({
        value: file.path,
        label: file.name,
        hint: formatHint(file),
      });
    }
  } else if (cwd.length > 0) {
    options.push({ value: "__sep__", label: "── Downloads ──", hint: "nothing in the last 24h" });
  }

  // Batch options
  if (cwd.length > 1) {
    options.push({
      value: "__batch_cwd__",
      label: "Convert all files in current folder",
      hint: `${cwd.length} files`,
    });
  }
  if (downloads.length > 1) {
    options.push({
      value: "__batch_dl__",
      label: "Convert all recent downloads",
      hint: `${downloads.length} files`,
    });
  }

  options.push({
    value: "__url__",
    label: "Paste a URL…",
    hint: "",
  });

  options.push({
    value: "__browse__",
    label: "Browse or paste a path…",
    hint: "",
  });

  const picked = await p.select({
    message: "Pick a file to convert:",
    options: options as any,
  });

  if (p.isCancel(picked)) {
    p.cancel("Cancelled.");
    return null;
  }

  if (picked === "__sep__") {
    return await pickFile();
  }

  if (picked === "__url__") {
    return await urlInput();
  }

  if (picked === "__batch_cwd__") {
    return `__batch__:${process.cwd()}`;
  }

  if (picked === "__batch_dl__") {
    const { join } = await import("path");
    const { homedir: getHome } = await import("os");
    return `__batch__:${join(getHome(), "Downloads")}`;
  }

  if (picked === "__browse__") {
    return await manualInput();
  }

  return picked as string;
}

function cleanPath(raw: string): string {
  const trimmed = raw.trim();
  // Try as-is first (handles literal backslashes in filenames)
  try {
    if (statSync(resolve(trimmed)).isFile()) return trimmed;
  } catch {}
  // Strip shell escapes from drag-and-drop (e.g. "Athena\ Framework.docx" → "Athena Framework.docx")
  return trimmed.replace(/\\(.)/g, "$1");
}

async function manualInput(): Promise<string | null> {
  const input = await p.text({
    message: "File path:",
    placeholder: "Drag a file here or type a path",
    validate: (val) => {
      if (!val.trim()) return "Path is required.";
      const cleaned = cleanPath(val);
      try {
        const stat = statSync(resolve(cleaned));
        if (!stat.isFile()) return "Not a file.";
      } catch {
        return "File not found.";
      }
    },
  });

  if (p.isCancel(input)) {
    p.cancel("Cancelled.");
    return null;
  }

  return resolve(cleanPath(input));
}

async function urlInput(): Promise<string | null> {
  const input = await p.text({
    message: "URL:",
    placeholder: "https://example.com/article",
    validate: (val) => {
      if (!val.trim()) return "URL is required.";
      try {
        new URL(val.trim());
      } catch {
        return "Not a valid URL. Include https://";
      }
    },
  });

  if (p.isCancel(input)) {
    p.cancel("Cancelled.");
    return null;
  }

  return `__url__:${input.trim()}`;
}

async function pickFormat(
  filePath: string,
  config?: Config
): Promise<FormatChoice | null> {
  const isMarkdown = extname(filePath).toLowerCase() === ".md";

  // Inbound: skip format picker entirely, always produce markdown
  if (!isMarkdown) {
    return { kind: "format", format: "md" };
  }

  // Outbound: templates first (if any), then raw formats
  const templates = config?.templates;
  const hasTemplates = templates && Object.keys(templates).length > 0;

  type OptionValue = string;
  const options: { value: OptionValue; label: string; hint?: string }[] = [];

  if (hasTemplates) {
    options.push({ value: "__sep_tpl__", label: "── Templates ──", hint: "" });
    for (const [name, tpl] of Object.entries(templates)) {
      options.push({
        value: `tpl:${name}`,
        label: name,
        hint: tpl.description ?? `.${tpl.format}`,
      });
    }
    options.push({ value: "__sep_fmt__", label: "── Formats ──", hint: "" });
  }

  options.push(
    { value: "fmt:docx", label: "Word", hint: ".docx" },
    { value: "fmt:pptx", label: "PowerPoint", hint: ".pptx" },
    { value: "fmt:html", label: "HTML", hint: ".html" },
  );

  const picked = await p.select({
    message: "Output format:",
    options: options as any,
  });

  if (p.isCancel(picked)) {
    p.cancel("Cancelled.");
    return null;
  }

  if (picked === "__sep_tpl__" || picked === "__sep_fmt__") {
    return await pickFormat(filePath, config);
  }

  const val = picked as string;

  if (val.startsWith("tpl:")) {
    const name = val.slice(4);
    const tpl = templates![name];
    return { kind: "template", name, format: tpl.format };
  }

  const format = val.slice(4) as OutputFormat;
  return { kind: "format", format };
}

async function pickOutputDir(
  filePath: string,
  config?: Config
): Promise<string | undefined | null> {
  const fileDir = dirname(resolve(filePath));
  const cwd = process.cwd();

  // File is in cwd → skip, save next to input (current behavior)
  if (fileDir === cwd) return undefined;

  const configDefault = config?.defaults?.outputDir;

  type PickValue = string;
  const options: { value: PickValue; label: string; hint?: string }[] = [
    { value: "cwd", label: "Current directory", hint: cwd.replace(homedir(), "~") },
    { value: "input", label: "Same as input file", hint: fileDir.replace(homedir(), "~") },
    { value: "custom", label: "Custom path…" },
  ];

  // If config has a default outputDir, make it the first option
  if (configDefault) {
    const resolvedDefault = resolve(configDefault);
    // Only add if it's different from cwd and input dir
    if (resolvedDefault !== cwd && resolvedDefault !== fileDir) {
      options.unshift({
        value: "config",
        label: "Configured default",
        hint: resolvedDefault.replace(homedir(), "~"),
      });
    }
  }

  const picked = await p.select({
    message: "Save to:",
    options: options as any,
  });

  if (p.isCancel(picked)) {
    p.cancel("Cancelled.");
    return null;
  }

  switch (picked) {
    case "cwd":
      return cwd;
    case "input":
      return undefined; // undefined = next to input (default behavior)
    case "config":
      return resolve(configDefault!);
    case "custom": {
      const dir = await p.text({
        message: "Output directory:",
        placeholder: "./out",
        validate: (val) => {
          if (!val.trim()) return "Path is required.";
        },
      });
      if (p.isCancel(dir)) {
        p.cancel("Cancelled.");
        return null;
      }
      return resolve(dir);
    }
    default:
      return undefined;
  }
}

async function convert(
  filePath: string,
  format: OutputFormat,
  config?: Config,
  templateName?: string,
  outputDir?: string
) {
  const s = p.spinner();

  let plan;
  try {
    plan = buildPlan(filePath, format, {
      outputDir,
      formatExplicit: true,
      defaultMdFormat: config?.defaults?.format,
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      p.log.error(err.message);
      return;
    }
    throw err;
  }

  // Resolve pandoc args for outbound
  if (plan.direction === "outbound" && config) {
    plan.pandocArgs = buildPandocArgs(plan.format, config, templateName);
    if (!plan.pandocArgs.length) plan.pandocArgs = undefined;
  }

  if (outputDir && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  if (existsSync(plan.outputPath)) {
    const overwrite = await p.confirm({
      message: `Output file already exists: ${plan.outputPath}\nOverwrite?`,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Cancelled.");
      return;
    }
  }

  s.start("Converting…");

  let outputContent: string | null = null;
  let finalOutputPath: string = plan.outputPath;

  try {
    if (plan.direction === "outbound") {
      const result = await convertFile(filePath, plan.format, {
        outputDir,
        pandocArgs: plan.pandocArgs,
      });
      finalOutputPath = result.outputPath ?? plan.outputPath;
      s.stop(`${result.sourcePath} → ${finalOutputPath}`);
    } else {
      let result = await convertFile(filePath, plan.format);

      // Auto-detect scanned PDFs and offer OCR
      if (looksLikeScannedPdf(filePath, result.content)) {
        s.stop("Scanned document detected");
        const useOcr = await p.confirm({
          message: "This looks like a scanned document. Extract text with OCR?",
          initialValue: true,
        });
        if (!p.isCancel(useOcr) && useOcr) {
          s.start("Running OCR…");
          result = await convertFile(filePath, plan.format, { ocr: { enabled: true, force: true } });
        }
      }

      outputContent = result.formatted;
      await writeOutput(plan.outputPath, result.formatted);

      // Token stats (always-on for inbound)
      const stats = getTokenStats(result.content);
      const fits = checkLLMFit(stats.tokens);
      s.stop(`${result.sourcePath} → ${plan.outputPath} (${formatTokenStats(stats)})`);

      // Quality warning
      if (result.qualityScore != null && result.qualityScore < 0.5) {
        p.log.warn("Some text may not have been extracted correctly. Check the output.");
      }

      // LLM fit indicator (show when output is substantial)
      if (stats.tokens > 1000) {
        p.log.info(`Fits in: ${formatLLMFit(fits)}`);
      }

      // Offer to shorten or split if too long for any model
      if (anyTooLong(fits)) {
        const target = smallestLimit(fits)!;
        const { splitToFit: doSplit } = await import("./tokens");
        const splitResult = doSplit(result.content, target.limit);
        const numParts = splitResult.parts.length;

        const action = await p.select({
          message: `This is ~${stats.tokens.toLocaleString()} tokens, too long for ${target.name}. What to do?`,
          options: [
            { value: "shorten", label: "Shorten (truncate)", hint: `trim to ~${target.limit.toLocaleString()} tokens` },
            { value: "split", label: `Split into ${numParts} parts`, hint: `each ~${Math.round(stats.tokens / numParts).toLocaleString()} tokens` },
            { value: "skip", label: "Keep as-is" },
          ] as any,
        });

        if (!p.isCancel(action) && action === "shorten") {
          const shortened = truncateToFit(result.content, target.limit);
          outputContent = shortened;
          await writeOutput(plan.outputPath, shortened);
          const newStats = getTokenStats(shortened);
          p.log.success(`Shortened to ~${newStats.tokens.toLocaleString()} tokens`);
        } else if (!p.isCancel(action) && action === "split") {
          const { dirname: pathDirname, basename: pathBasename, extname: pathExtname } = await import("path");
          const dir = pathDirname(plan.outputPath);
          const base = pathBasename(plan.outputPath, pathExtname(plan.outputPath));
          const ext = pathExtname(plan.outputPath);

          for (let i = 0; i < splitResult.parts.length; i++) {
            const partPath = join(dir, `${base}-part-${i + 1}${ext}`);
            await writeOutput(partPath, splitResult.parts[i]);
          }
          p.log.success(
            `Split into ${splitResult.parts.length} parts: ` +
            splitResult.tokensPerPart.map((t, i) => `part-${i + 1} (~${t.toLocaleString()} tokens)`).join(", ")
          );
        }
      }
    }
  } catch (err: any) {
    s.stop("Conversion failed.");
    p.log.error(err.message ?? String(err));
    return;
  }

  // Post-conversion menu
  await postConversionMenu(finalOutputPath, outputContent);
}

async function convertUrlInteractive(url: string, config?: Config) {
  const { basename: pathBasename } = await import("path");
  const { resolve: pathResolve } = await import("path");

  const s = p.spinner();
  s.start(`Fetching ${url}…`);

  try {
    const result = await fetchAndConvert(url);

    // Derive output filename from URL
    let urlPath = new URL(url).pathname.replace(/\/$/, "");
    let name = pathBasename(urlPath) || "page";
    name = name.replace(/\.[^.]+$/, "");
    const outPath = pathResolve(`${name}.md`);

    await writeOutput(outPath, result.content);
    const stats = getTokenStats(result.content);
    s.stop(`${url} → ${outPath} (${formatTokenStats(stats)})`);

    await postConversionMenu(outPath, result.content);
  } catch (err: any) {
    s.stop("Fetch failed.");
    p.log.error(err.message ?? String(err));
  }
}

async function convertBatchInteractive(dir: string, config?: Config) {
  const { readdirSync, statSync: fStatSync } = await import("fs");
  const { join, extname: pathExtname } = await import("path");

  const CONVERTIBLE_EXTS = new Set([
    ".docx", ".doc", ".pdf", ".pptx", ".ppt",
    ".xlsx", ".xls", ".odt", ".odp", ".ods",
    ".rtf", ".epub", ".mobi", ".eml", ".msg",
    ".csv", ".tsv", ".html", ".xml", ".txt",
    ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp",
  ]);

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith(".") && CONVERTIBLE_EXTS.has(pathExtname(e.name).toLowerCase()))
    .map((e) => join(dir, e.name));

  if (files.length === 0) {
    p.log.warn("No convertible files found.");
    return;
  }

  p.log.info(`Found ${files.length} file(s) to convert.`);

  let ok = 0;
  let fail = 0;
  for (const file of files) {
    try {
      const result = await convertFile(file, "md");
      const { basename: pathBasename } = await import("path");
      const outName = pathBasename(file).replace(/\.[^.]+$/, "") + ".md";
      const outPath = join(dirname(file), outName);
      await writeOutput(outPath, result.formatted);
      const stats = getTokenStats(result.content);
      p.log.success(`${pathBasename(file)} → ${outName} (${formatTokenStats(stats)})`);
      ok++;
    } catch (err: any) {
      const { basename: pathBasename } = await import("path");
      p.log.error(`${pathBasename(file)}: ${err.message ?? err}`);
      fail++;
    }
  }

  const parts = [`${ok} converted`];
  if (fail > 0) parts.push(`${fail} failed`);
  p.log.info(parts.join(", "));
}

async function postConversionMenu(
  outputPath: string,
  content: string | null
): Promise<void> {
  const options: { value: string; label: string }[] = [];

  if (content) {
    options.push({ value: "clipboard", label: "Copy to clipboard" });
  }
  options.push(
    { value: "open", label: "Open file" },
    { value: "finder", label: "Open in Finder" },
    { value: "done", label: "Done" },
  );

  const action = await p.select({
    message: "What next?",
    options: options as any,
  });

  if (p.isCancel(action) || action === "done") return;

  if (action === "clipboard" && content) {
    try {
      await writeClipboard(content);
      p.log.success("Copied to clipboard");
    } catch (err: any) {
      p.log.error(`Clipboard failed: ${err.message}`);
    }
  } else if (action === "open") {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([cmd, outputPath], { stdout: "ignore", stderr: "ignore" });
  } else if (action === "finder") {
    if (process.platform === "darwin") {
      Bun.spawn(["open", "-R", outputPath], { stdout: "ignore", stderr: "ignore" });
    } else {
      const dir = dirname(outputPath);
      const cmd = process.platform === "win32" ? "explorer" : "xdg-open";
      Bun.spawn([cmd, dir], { stdout: "ignore", stderr: "ignore" });
    }
  }
}

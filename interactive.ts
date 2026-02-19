import * as p from "@clack/prompts";
import { resolve, extname, dirname } from "path";
import { statSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { convertFile, type OutputFormat } from "./convert";
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
} from "./tokens";

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
      const result = await convertFile(filePath, plan.format);
      outputContent = result.formatted;
      await writeOutput(plan.outputPath, result.formatted);

      // Token stats (always-on for inbound)
      const stats = getTokenStats(result.content);
      const fits = checkLLMFit(stats.tokens);
      s.stop(`${result.sourcePath} → ${plan.outputPath} (${formatTokenStats(stats)})`);

      // LLM fit indicator (show when output is substantial)
      if (stats.tokens > 1000) {
        p.log.info(`Fits in: ${formatLLMFit(fits)}`);
      }

      // Offer to shorten if too long for any model
      if (anyTooLong(fits)) {
        const target = smallestLimit(fits)!;
        const shorten = await p.confirm({
          message: `This is ~${stats.tokens.toLocaleString()} tokens. Shorten to fit ${target.name}?`,
          initialValue: false,
        });
        if (!p.isCancel(shorten) && shorten) {
          const shortened = truncateToFit(result.content, target.limit);
          outputContent = shortened;
          await writeOutput(plan.outputPath, shortened);
          const newStats = getTokenStats(shortened);
          p.log.success(`Shortened to ~${newStats.tokens.toLocaleString()} tokens`);
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

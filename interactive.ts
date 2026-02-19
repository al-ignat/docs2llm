import * as p from "@clack/prompts";
import { resolve, extname } from "path";
import { statSync, existsSync } from "fs";
import { convertFile, type OutputFormat } from "./convert";
import { writeOutput } from "./output";
import { buildPlan, ValidationError } from "./validate";
import { scanForFiles, formatHint, type FileInfo } from "./scan";

export async function runInteractive() {
  p.intro("con-the-doc");

  const filePath = await pickFile();
  if (!filePath) return;

  const format = await pickFormat(filePath);
  if (!format) return;

  await convert(filePath, format);

  p.outro("Done!");
}

async function pickFile(): Promise<string | null> {
  const { cwd, downloads } = scanForFiles();
  const hasFiles = cwd.length > 0 || downloads.length > 0;

  if (!hasFiles) {
    p.log.warn("No convertible files found in current folder or ~/Downloads.");
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
    // User landed on separator, re-run (shouldn't happen with arrow nav)
    return await pickFile();
  }

  if (picked === "__browse__") {
    return await manualInput();
  }

  return picked as string;
}

async function manualInput(): Promise<string | null> {
  const input = await p.text({
    message: "File path:",
    placeholder: "Drag a file here or type a path",
    validate: (val) => {
      if (!val.trim()) return "Path is required.";
      try {
        const stat = statSync(resolve(val));
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

  return resolve(input);
}

async function pickFormat(filePath: string): Promise<OutputFormat | null> {
  const isMarkdown = extname(filePath).toLowerCase() === ".md";

  const options: { value: OutputFormat; label: string; hint?: string }[] = isMarkdown
    ? [
        { value: "docx", label: "Word", hint: ".docx" },
        { value: "pptx", label: "PowerPoint", hint: ".pptx" },
        { value: "html", label: "HTML", hint: ".html" },
        { value: "json", label: "JSON", hint: ".json" },
        { value: "yaml", label: "YAML", hint: ".yaml" },
      ]
    : [
        { value: "md", label: "Markdown", hint: ".md" },
        { value: "json", label: "JSON", hint: ".json" },
        { value: "yaml", label: "YAML", hint: ".yaml" },
      ];

  const format = await p.select<OutputFormat>({
    message: "Output format:",
    options,
  });

  if (p.isCancel(format)) {
    p.cancel("Cancelled.");
    return null;
  }

  return format;
}

async function convert(filePath: string, format: OutputFormat) {
  const s = p.spinner();

  let plan;
  try {
    // Interactive mode always has explicit format (user picked it)
    plan = buildPlan(filePath, format, { formatExplicit: true });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      p.log.error(err.message);
      return;
    }
    throw err;
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

  try {
    if (plan.direction === "outbound") {
      const result = await convertFile(filePath, plan.format, {
        pandocArgs: plan.pandocArgs,
      });
      s.stop(`${result.sourcePath} → ${result.outputPath}`);
    } else {
      const result = await convertFile(filePath, plan.format);
      await writeOutput(plan.outputPath, result.formatted);
      s.stop(`${result.sourcePath} → ${plan.outputPath}`);
    }
  } catch (err: any) {
    s.stop("Conversion failed.");
    p.log.error(err.message ?? String(err));
  }
}

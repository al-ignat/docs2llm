import * as p from "@clack/prompts";
import { readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { convertFile, type OutputFormat } from "./convert";
import { resolveOutputPath, writeOutput } from "./output";

export async function runInteractive() {
  p.intro("convert-the-doc");

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "file", label: "Convert a file" },
      { value: "folder", label: "Convert a folder" },
    ],
  });
  if (p.isCancel(action)) return p.cancel("Cancelled.");

  const inputPath = await p.text({
    message: action === "file" ? "File path:" : "Folder path:",
    placeholder: action === "file" ? "./report.docx" : "./docs/",
    validate: (val) => {
      if (!val.trim()) return "Path is required.";
      try {
        const stat = statSync(resolve(val));
        if (action === "file" && !stat.isFile()) return "Not a file.";
        if (action === "folder" && !stat.isDirectory()) return "Not a folder.";
      } catch {
        return "Path not found.";
      }
    },
  });
  if (p.isCancel(inputPath)) return p.cancel("Cancelled.");

  const format = await p.select<OutputFormat>({
    message: "Output format:",
    options: [
      { value: "md", label: "Markdown (.md)" },
      { value: "json", label: "JSON (.json)" },
      { value: "yaml", label: "YAML (.yaml)" },
    ],
  });
  if (p.isCancel(format)) return p.cancel("Cancelled.");

  const outputChoice = await p.select({
    message: "Output location:",
    options: [
      { value: "same", label: "Same folder as source" },
      { value: "custom", label: "Custom path" },
    ],
  });
  if (p.isCancel(outputChoice)) return p.cancel("Cancelled.");

  let outputDir: string | undefined;
  if (outputChoice === "custom") {
    const customPath = await p.text({
      message: "Output folder:",
      placeholder: "./output/",
      validate: (val) => {
        if (!val.trim()) return "Path is required.";
      },
    });
    if (p.isCancel(customPath)) return p.cancel("Cancelled.");
    outputDir = resolve(customPath);
  }

  const resolvedInput = resolve(inputPath);

  if (action === "file") {
    const s = p.spinner();
    s.start("Converting...");
    try {
      const result = await convertFile(resolvedInput, format);
      const outPath = resolveOutputPath(resolvedInput, format, outputDir);
      await writeOutput(outPath, result.formatted);
      s.stop(`${inputPath} → ${outPath}`);
    } catch (err: any) {
      s.stop("Conversion failed.");
      p.log.error(err.message ?? String(err));
    }
  } else {
    const files = collectFiles(resolvedInput);
    if (files.length === 0) {
      p.log.warn("No files found in folder.");
      return p.outro("Done.");
    }

    const s = p.spinner();
    s.start(`Converting ${files.length} file(s)...`);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      try {
        const result = await convertFile(file, format);
        const outPath = resolveOutputPath(file, format, outputDir);
        await writeOutput(outPath, result.formatted);
        ok++;
      } catch {
        fail++;
      }
    }
    s.stop(`Done: ${ok} converted, ${fail} failed.`);
  }

  p.outro("Done!");
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isFile() && !entry.name.startsWith(".")) {
      files.push(full);
    }
  }
  return files;
}

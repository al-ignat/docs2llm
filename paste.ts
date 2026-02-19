import * as p from "@clack/prompts";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";
import { readClipboard, writeClipboard } from "./clipboard";
import { convertHtmlToMarkdown } from "./convert";
import { writeOutput } from "./output";

export interface PasteOptions {
  copy?: boolean;
  stdout?: boolean;
  output?: string;
}

export async function runPaste(options: PasteOptions): Promise<void> {
  const hasFlag = options.copy || options.stdout || options.output;

  if (!hasFlag) {
    p.intro("con-the-doc paste");
  }

  // 1. Read clipboard
  let clip;
  try {
    clip = await readClipboard();
  } catch (err: any) {
    if (hasFlag) {
      console.error(`✗ ${err.message}`);
    } else {
      p.log.error(err.message);
    }
    process.exit(1);
  }

  if (!clip.html && !clip.text) {
    if (hasFlag) {
      console.error("✗ Clipboard is empty.");
    } else {
      p.log.error("Clipboard is empty.");
    }
    process.exit(1);
  }

  // 2. Convert
  let markdown: string;
  if (clip.html) {
    const s = hasFlag ? null : p.spinner();
    s?.start("Converting clipboard HTML…");
    try {
      markdown = await convertHtmlToMarkdown(clip.html);
    } catch (err: any) {
      if (s) {
        s.stop("Conversion failed.");
        p.log.error(err.message ?? String(err));
      } else {
        console.error(`✗ ${err.message ?? err}`);
      }
      process.exit(1);
    }
    s?.stop("Clipboard → Markdown");
  } else {
    markdown = clip.text!;
    if (!hasFlag) {
      p.log.info("No HTML in clipboard — using plain text as-is.");
    }
  }

  // 3. Output
  if (options.stdout) {
    process.stdout.write(markdown);
    return;
  }

  if (options.copy) {
    await writeClipboard(markdown);
    console.log("✓ Copied to clipboard");
    return;
  }

  if (options.output) {
    const outPath = resolve(options.output);
    const dir = dirname(outPath);
    mkdirSync(dir, { recursive: true });
    await writeOutput(outPath, markdown);
    console.log(`✓ Saved to ${outPath}`);
    return;
  }

  // Interactive prompt
  const dest = await p.select({
    message: "Output:",
    options: [
      { value: "clipboard", label: "Copy to clipboard" },
      { value: "stdout", label: "Print to terminal" },
      { value: "file", label: "Save to file…" },
    ],
  });

  if (p.isCancel(dest)) {
    p.cancel("Cancelled.");
    return;
  }

  if (dest === "clipboard") {
    await writeClipboard(markdown);
    p.outro("Copied to clipboard ✓");
    return;
  }

  if (dest === "stdout") {
    p.outro("");
    process.stdout.write(markdown);
    return;
  }

  // File
  const filePath = await p.text({
    message: "Output file:",
    placeholder: "snippet.md",
    validate: (val) => {
      if (!val.trim()) return "Path is required.";
    },
  });

  if (p.isCancel(filePath)) {
    p.cancel("Cancelled.");
    return;
  }

  const outPath = resolve(filePath);
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  await writeOutput(outPath, markdown);
  p.outro(`Saved to ${outPath}`);
}

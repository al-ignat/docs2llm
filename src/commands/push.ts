import * as p from "@clack/prompts";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";
import { readClipboard, writeClipboardHtml } from "../core/clipboard";
import { pandocMarkdownToHtml } from "../core/outbound";
import { writeOutput } from "../core/output";
import { guard } from "../shared/wizard-utils";
import { errorMessage } from "../shared/errors";

export interface PushOptions {
  stdout?: boolean;
  output?: string;
}

export async function runPush(options: PushOptions): Promise<void> {
  const hasFlag = options.stdout || options.output;

  if (!hasFlag) {
    p.intro("docs2llm push");
  }

  // 1. Read clipboard
  let clip;
  try {
    clip = await readClipboard();
  } catch (err) {
    if (hasFlag) {
      console.error(`✗ ${errorMessage(err)}`);
    } else {
      p.log.error(errorMessage(err));
    }
    process.exit(1);
  }

  if (!clip.text) {
    if (hasFlag) {
      console.error("✗ Clipboard is empty.");
    } else {
      p.log.error("Clipboard is empty. Copy some Markdown first, then run docs2llm push.");
    }
    process.exit(1);
  }

  // 2. Convert Markdown → HTML
  let html: string;
  const s = hasFlag ? null : p.spinner();
  s?.start("Converting Markdown → HTML…");
  try {
    html = await pandocMarkdownToHtml(clip.text);
  } catch (err) {
    if (s) {
      s.error("Conversion failed.");
      p.log.error(errorMessage(err));
    } else {
      console.error(`✗ ${errorMessage(err)}`);
    }
    process.exit(1);
  }
  s?.stop("Markdown → HTML");

  // 3. Output
  if (options.stdout) {
    process.stdout.write(html);
    return;
  }

  if (options.output) {
    const outPath = resolve(options.output);
    const dir = dirname(outPath);
    mkdirSync(dir, { recursive: true });
    await writeOutput(outPath, html);
    console.log(`✓ Saved to ${outPath}`);
    return;
  }

  // Preview
  const lines = html.split("\n");
  const preview = lines.slice(0, 3).join("\n");
  const chars = html.length;
  p.box(
    `${preview}${lines.length > 3 ? "\n…" : ""}\n` +
    `${chars} chars of HTML`,
    "Converted"
  );

  // Interactive prompt
  const dest = guard(await p.select({
    message: "Output:",
    options: [
      { value: "clipboard", label: "Write rich HTML to clipboard" },
      { value: "stdout", label: "Print to terminal" },
      { value: "file", label: "Save to file…" },
    ],
  }));

  if (dest === "clipboard") {
    await writeClipboardHtml(html, clip.text);
    p.outro("Rich HTML written to clipboard. Paste into Outlook, Google Docs, or any rich text editor.");
    return;
  }

  if (dest === "stdout") {
    p.outro("");
    process.stdout.write(html);
    return;
  }

  // File
  const filePath = guard(await p.path({
    message: "Output file:",
    directory: false,
    validate: (val) => {
      if (!val?.trim()) return "Path is required.";
    },
  }));

  const outPath = resolve(filePath);
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  await writeOutput(outPath, html);
  p.outro(`Saved to ${outPath}`);
}

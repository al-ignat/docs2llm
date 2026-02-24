import {
  Clipboard,
  getPreferenceValues,
  showHUD,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { readFileSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  convertFile,
  convertUrl,
  convertToHtmlFromText,
  exportMarkdown,
  isInstalled,
} from "./lib/docs2llm";
import { detectClipboard } from "./lib/clipboard-detect";
import {
  looksLikeMarkdown,
  getFinderFolder,
  isFinderFrontmost,
} from "./lib/smart-detect";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  const clip = await detectClipboard();

  if (clip.kind === "empty") {
    await showHUD("Clipboard is empty");
    return;
  }

  const finderFront = await isFinderFrontmost();

  // Determine direction
  let direction: "inbound" | "outbound" | "none";
  if (clip.kind === "html" || clip.kind === "url") {
    direction = "inbound";
  } else if (clip.kind === "filepath") {
    direction =
      clip.path.endsWith(".md") || clip.path.endsWith(".markdown")
        ? "outbound"
        : "inbound";
  } else if (clip.kind === "text") {
    direction = looksLikeMarkdown(clip.text) ? "outbound" : "none";
  } else {
    direction = "none";
  }

  // --- Paste into Finder (save as file) ---
  if (finderFront) {
    const folder = await getFinderFolder();
    if (!folder) {
      await showHUD("Could not determine Finder folder");
      return;
    }

    await pasteToFinder(clip, direction, folder);
    return;
  }

  // --- Paste into text app ---
  await pasteToApp(clip, direction);
}

async function pasteToApp(
  clip: Exclude<Awaited<ReturnType<typeof detectClipboard>>, { kind: "empty" }>,
  direction: "inbound" | "outbound" | "none",
) {
  if (direction === "none") {
    // Plain text — just paste as-is
    if (clip.kind === "text") {
      await Clipboard.paste(clip.text);
    }
    return;
  }

  if (direction === "inbound") {
    // Convert to Markdown and paste
    const md = await convertToMarkdown(clip);
    if (md) {
      await Clipboard.paste(md);
      await showHUD("Pasted as Markdown");
    }
    return;
  }

  // direction === "outbound" — Markdown to rich HTML and paste
  let mdText: string;
  if (clip.kind === "text") {
    mdText = clip.text;
  } else if (clip.kind === "filepath") {
    mdText = readFileSync(clip.path, "utf-8");
  } else {
    return;
  }

  await showToast({
    style: Toast.Style.Animated,
    title: "Converting Markdown...",
  });
  const result = await convertToHtmlFromText(mdText);
  if (result.error) {
    await showToast(failToast(result.error));
    return;
  }
  if (!result.html) {
    await showHUD("Conversion produced no output");
    return;
  }
  await Clipboard.paste({ html: result.html, text: mdText });
  await showHUD("Pasted as rich text");
}

async function pasteToFinder(
  clip: Exclude<Awaited<ReturnType<typeof detectClipboard>>, { kind: "empty" }>,
  direction: "inbound" | "outbound" | "none",
  folder: string,
) {
  const timestamp = Date.now();

  if (direction === "inbound" || direction === "none") {
    // Convert to Markdown (or save plain text as .md) and write file
    const md =
      direction === "inbound" ? await convertToMarkdown(clip) : undefined;
    const content = md || (clip.kind === "text" ? clip.text : undefined);

    if (!content) {
      await showHUD("Nothing to save");
      return;
    }

    const name = makeFilename(clip, "md", timestamp);
    const outPath = join(folder, name);
    writeFileSync(outPath, content, "utf-8");
    await showHUD(`Saved ${name}`);
    await showInFinder(outPath);
    return;
  }

  // direction === "outbound" — export Markdown via Pandoc
  let mdText: string;
  if (clip.kind === "text") {
    mdText = clip.text;
  } else if (clip.kind === "filepath") {
    mdText = readFileSync(clip.path, "utf-8");
  } else {
    return;
  }

  const prefs = getPreferenceValues<{ defaultExportFormat?: string }>();
  const fmt = prefs.defaultExportFormat || "docx";

  const tmpMd = join(tmpdir(), `docs2llm-smartpaste-${timestamp}.md`);
  try {
    writeFileSync(tmpMd, mdText, "utf-8");
    await showToast({
      style: Toast.Style.Animated,
      title: `Exporting to ${fmt}...`,
    });

    const result = await exportMarkdown(tmpMd, fmt);
    if (result.error) {
      await showToast(failToast(result.error));
      return;
    }

    if (result.outputPath) {
      // exportMarkdown writes to getOutputDir() — move to Finder folder if different
      const finalName = basename(result.outputPath);
      const finalPath = join(folder, finalName);
      try {
        renameSync(result.outputPath, finalPath);
        await showHUD(`Saved ${finalName}`);
        await showInFinder(finalPath);
      } catch {
        // If rename fails (cross-device), the file is in outputDir
        await showHUD(`Saved ${finalName}`);
        await showInFinder(result.outputPath);
      }
    }
  } finally {
    try {
      unlinkSync(tmpMd);
    } catch {
      /* ignore */
    }
  }
}

/** Convert clipboard content to Markdown text. */
async function convertToMarkdown(
  clip: Exclude<Awaited<ReturnType<typeof detectClipboard>>, { kind: "empty" }>,
): Promise<string | undefined> {
  if (clip.kind === "html") {
    const tmpPath = join(tmpdir(), `docs2llm-smartpaste-${Date.now()}.html`);
    try {
      writeFileSync(tmpPath, clip.html, "utf-8");
      await showToast({
        style: Toast.Style.Animated,
        title: "Converting HTML...",
      });
      const result = await convertFile(tmpPath, "md");
      if (result.error) {
        await showToast(failToast(result.error));
        return undefined;
      }
      return result.content;
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }

  if (clip.kind === "url") {
    await showToast({
      style: Toast.Style.Animated,
      title: "Fetching URL...",
    });
    const result = await convertUrl(clip.url);
    if (result.error) {
      await showToast(failToast(result.error));
      return undefined;
    }
    return result.content;
  }

  if (clip.kind === "filepath") {
    const fileName = basename(clip.path);
    await showToast({
      style: Toast.Style.Animated,
      title: `Converting ${fileName}...`,
    });
    const result = await convertFile(clip.path);
    if (result.error) {
      await showToast(failToast(result.error));
      return undefined;
    }
    return result.content;
  }

  return undefined;
}

function makeFilename(
  clip: Exclude<Awaited<ReturnType<typeof detectClipboard>>, { kind: "empty" }>,
  ext: string,
  timestamp: number,
): string {
  if (clip.kind === "url") {
    try {
      return `${new URL(clip.url).hostname.replace(/\./g, "-")}.${ext}`;
    } catch {
      /* fall through */
    }
  }
  if (clip.kind === "filepath") {
    return `${basename(clip.path).replace(/\.[^.]+$/, "")}.${ext}`;
  }
  return `clipboard-${timestamp}.${ext}`;
}

function failToast(message: string): Toast.Options {
  const isPandocError = message.toLowerCase().includes("pandoc");
  return {
    style: Toast.Style.Failure,
    title: isPandocError ? "Pandoc required" : "Conversion failed",
    message: isPandocError ? "brew install pandoc" : message,
  };
}

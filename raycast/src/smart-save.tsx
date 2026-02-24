import {
  getPreferenceValues,
  showHUD,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  convertFile,
  convertUrl,
  exportMarkdown,
  getOutputDir,
  isInstalled,
} from "./lib/docs2llm";
import { detectSource, SmartSource } from "./lib/smart-detect";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  const source = await detectSource();

  if (source.origin === "empty") {
    await showHUD("Nothing to save");
    return;
  }

  const prefs = getPreferenceValues<{
    defaultFormat: string;
    defaultExportFormat: string;
    enableOcr: boolean;
  }>();
  const fmt = prefs.defaultFormat || "md";
  const exportFmt = prefs.defaultExportFormat || "docx";
  const ocr = prefs.enableOcr ?? false;

  let outDir: string;
  try {
    outDir = getOutputDir();
  } catch (err) {
    await showHUD(String(err instanceof Error ? err.message : err));
    return;
  }

  const direction = source.direction;

  if (direction === "outbound") {
    await saveOutbound(source, outDir, exportFmt);
  } else {
    await saveInbound(source, fmt, outDir, ocr);
  }
}

export function generateFilename(source: SmartSource, ext: string): string {
  if (source.origin === "finder") {
    return `${basename(source.path).replace(/\.[^.]+$/, "")}.${ext}`;
  }
  if (source.origin === "clipboard") {
    const clip = source.clip;
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
  }
  return `converted-${Date.now()}.${ext}`;
}

async function saveInbound(
  source: SmartSource,
  fmt: string,
  outDir: string,
  ocr: boolean,
) {
  let content: string | undefined;
  const filename = generateFilename(source, fmt);
  const outPath = join(outDir, filename);

  if (source.origin === "finder") {
    await showToast({
      style: Toast.Style.Animated,
      title: `Converting ${basename(source.path)}...`,
    });
    const result = await convertFile(source.path, fmt, ocr);
    if (result.error) {
      await showToast(failToast(result.error));
      return;
    }
    content = result.content;
  } else if (source.origin === "selection") {
    if (source.richHtml) {
      const tmpPath = join(tmpdir(), `docs2llm-smartsave-${Date.now()}.html`);
      try {
        writeFileSync(tmpPath, source.richHtml, "utf-8");
        await showToast({
          style: Toast.Style.Animated,
          title: "Converting HTML...",
        });
        const result = await convertFile(tmpPath, fmt, ocr);
        if (result.error) {
          await showToast(failToast(result.error));
          return;
        }
        content = result.content;
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    } else {
      content = source.text;
    }
  } else if (source.origin === "clipboard") {
    const clip = source.clip;
    if (clip.kind === "url") {
      await showToast({
        style: Toast.Style.Animated,
        title: "Fetching URL...",
      });
      const result = await convertUrl(clip.url, fmt);
      if (result.error) {
        await showToast(failToast(result.error));
        return;
      }
      content = result.content;
    } else if (clip.kind === "filepath") {
      await showToast({
        style: Toast.Style.Animated,
        title: `Converting ${basename(clip.path)}...`,
      });
      const result = await convertFile(clip.path, fmt, ocr);
      if (result.error) {
        await showToast(failToast(result.error));
        return;
      }
      content = result.content;
    } else if (clip.kind === "html") {
      const tmpPath = join(tmpdir(), `docs2llm-smartsave-${Date.now()}.html`);
      try {
        writeFileSync(tmpPath, clip.html, "utf-8");
        await showToast({
          style: Toast.Style.Animated,
          title: "Converting HTML...",
        });
        const result = await convertFile(tmpPath, fmt, ocr);
        if (result.error) {
          await showToast(failToast(result.error));
          return;
        }
        content = result.content;
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    } else if (clip.kind === "text") {
      content = clip.text;
    }
  }

  if (!content) {
    await showHUD("Nothing to save");
    return;
  }

  writeFileSync(outPath, content, "utf-8");
  await showHUD(`Saved ${filename}`);
  await showInFinder(outPath);
}

async function saveOutbound(source: SmartSource, outDir: string, fmt: string) {
  let mdText: string;

  if (source.origin === "finder") {
    mdText = readFileSync(source.path, "utf-8");
  } else if (source.origin === "selection") {
    mdText = source.text;
  } else if (source.origin === "clipboard") {
    const clip = source.clip;
    if (clip.kind === "text") {
      mdText = clip.text;
    } else if (clip.kind === "filepath") {
      mdText = readFileSync(clip.path, "utf-8");
    } else {
      await showHUD("Nothing to export");
      return;
    }
  } else {
    await showHUD("Nothing to export");
    return;
  }

  const tmpMd = join(tmpdir(), `docs2llm-smartsave-${Date.now()}.md`);
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
      await showHUD(`Saved ${basename(result.outputPath)}`);
      await showInFinder(result.outputPath);
    }
  } finally {
    try {
      unlinkSync(tmpMd);
    } catch {
      /* ignore */
    }
  }
}

function failToast(message: string): Toast.Options {
  const isPandocError = message.toLowerCase().includes("pandoc");
  return {
    style: Toast.Style.Failure,
    title: isPandocError ? "Pandoc required" : "Conversion failed",
    message: isPandocError ? "brew install pandoc" : message,
  };
}

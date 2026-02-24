import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { convertFile, convertUrl, isInstalled } from "./lib/docs2llm";
import { detectClipboard } from "./lib/clipboard-detect";

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

  if (clip.kind === "text") {
    await showHUD("Clipboard already contains plain text");
    return;
  }

  if (clip.kind === "url") {
    await showToast({
      style: Toast.Style.Animated,
      title: "Converting URL...",
    });
    const result = await convertUrl(clip.url);

    if (result.error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Conversion failed",
        message: result.error,
      });
      return;
    }

    await Clipboard.copy(result.content);
    let host: string;
    try {
      host = new URL(clip.url).hostname;
    } catch {
      host = "URL";
    }
    await showHUD(`Converted ${host} to Markdown`);
    return;
  }

  if (clip.kind === "filepath") {
    const fileName = basename(clip.path);
    await showToast({
      style: Toast.Style.Animated,
      title: `Converting ${fileName}...`,
    });
    const result = await convertFile(clip.path);

    if (result.error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Conversion failed",
        message: result.error,
      });
      return;
    }

    await Clipboard.copy(result.content);
    await showHUD(`Converted ${fileName} to Markdown`);
    return;
  }

  // clip.kind === "html"
  const tmpPath = join(tmpdir(), `docs2llm-clip-${Date.now()}.html`);
  try {
    writeFileSync(tmpPath, clip.html, "utf-8");
    await showToast({
      style: Toast.Style.Animated,
      title: "Converting HTML...",
    });
    const result = await convertFile(tmpPath, "md");

    if (result.error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Conversion failed",
        message: result.error,
      });
      return;
    }

    await Clipboard.copy(result.content);
    await showHUD("Converted HTML to Markdown");
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

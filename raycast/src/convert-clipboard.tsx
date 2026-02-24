import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertFile, isInstalled } from "./lib/docs2llm";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  const clipboardText = await Clipboard.readText();
  if (!clipboardText || clipboardText.trim().length === 0) {
    await showHUD("Clipboard is empty");
    return;
  }

  // If clipboard already looks like plain text / markdown, just note it
  const looksLikeHtml = clipboardText.trimStart().startsWith("<");
  if (!looksLikeHtml) {
    await Clipboard.copy(clipboardText);
    await showHUD("Clipboard already contains plain text");
    return;
  }

  // Write HTML to temp file and convert
  const tmpPath = join(tmpdir(), `docs2llm-clip-${Date.now()}.html`);
  try {
    writeFileSync(tmpPath, clipboardText, "utf-8");

    await showToast({
      style: Toast.Style.Animated,
      title: "Converting clipboard...",
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
    await showHUD("Converted to Markdown");
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

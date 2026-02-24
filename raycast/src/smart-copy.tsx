import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  convertFile,
  convertUrl,
  convertToHtmlFromText,
  exportToHtml,
  isInstalled,
} from "./lib/docs2llm";
import { detectSource } from "./lib/smart-detect";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  const source = await detectSource();

  if (source.origin === "empty") {
    await showHUD("Nothing to convert");
    return;
  }

  // --- Finder file ---
  if (source.origin === "finder") {
    const fileName = basename(source.path);
    await showToast({
      style: Toast.Style.Animated,
      title: `Converting ${fileName}...`,
    });

    if (source.direction === "outbound") {
      // .md file → rich HTML on clipboard
      const result = await exportToHtml(source.path);
      if (result.error) {
        await showToast(failToast(result.error));
        return;
      }
      if (!result.html) {
        await showHUD("Conversion produced no output");
        return;
      }
      const mdText = readFileSync(source.path, "utf-8");
      await Clipboard.copy({ html: result.html, text: mdText });
      await showHUD(`Copied ${fileName} as rich text`);
    } else {
      // Other file → Markdown on clipboard
      const result = await convertFile(source.path);
      if (result.error) {
        await showToast(failToast(result.error));
        return;
      }
      await Clipboard.copy(result.content);
      await showHUD(
        `Copied ${result.words} words (~${result.tokens} tokens) from ${fileName}`,
      );
    }
    return;
  }

  // --- Text selection ---
  if (source.origin === "selection") {
    if (source.direction === "inbound" && source.richHtml) {
      // Selection has richer HTML on clipboard → convert HTML to MD
      const tmpPath = join(tmpdir(), `docs2llm-smart-${Date.now()}.html`);
      try {
        writeFileSync(tmpPath, source.richHtml, "utf-8");
        await showToast({
          style: Toast.Style.Animated,
          title: "Converting HTML...",
        });
        const result = await convertFile(tmpPath, "md");
        if (result.error) {
          await showToast(failToast(result.error));
          return;
        }
        await Clipboard.copy(result.content);
        await showHUD("Converted selection to Markdown");
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (source.direction === "outbound") {
      // Markdown text → rich HTML
      await showToast({
        style: Toast.Style.Animated,
        title: "Converting Markdown...",
      });
      const result = await convertToHtmlFromText(source.text);
      if (result.error) {
        await showToast(failToast(result.error));
        return;
      }
      if (!result.html) {
        await showHUD("Conversion produced no output");
        return;
      }
      await Clipboard.copy({ html: result.html, text: source.text });
      await showHUD("Copied as rich text");
      return;
    }

    // direction === "none" — plain text selection, just copy it
    await Clipboard.copy(source.text);
    await showHUD("Copied");
    return;
  }

  // --- Clipboard fallback ---
  if (source.origin === "clipboard") {
    const clip = source.clip;

    if (source.direction === "none") {
      await showHUD("Already plain text");
      return;
    }

    if (source.direction === "inbound") {
      if (clip.kind === "html") {
        const tmpPath = join(tmpdir(), `docs2llm-smart-${Date.now()}.html`);
        try {
          writeFileSync(tmpPath, clip.html, "utf-8");
          await showToast({
            style: Toast.Style.Animated,
            title: "Converting HTML...",
          });
          const result = await convertFile(tmpPath, "md");
          if (result.error) {
            await showToast(failToast(result.error));
            return;
          }
          await Clipboard.copy(result.content);
          await showHUD("Converted HTML to Markdown");
        } finally {
          try {
            unlinkSync(tmpPath);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (clip.kind === "url") {
        await showToast({
          style: Toast.Style.Animated,
          title: "Fetching URL...",
        });
        const result = await convertUrl(clip.url);
        if (result.error) {
          await showToast(failToast(result.error));
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
          await showToast(failToast(result.error));
          return;
        }
        await Clipboard.copy(result.content);
        await showHUD(`Copied ${result.words} words from ${fileName}`);
        return;
      }
    }

    if (source.direction === "outbound") {
      // Clipboard text that looks like Markdown → rich HTML
      if (clip.kind === "text") {
        await showToast({
          style: Toast.Style.Animated,
          title: "Converting Markdown...",
        });
        const result = await convertToHtmlFromText(clip.text);
        if (result.error) {
          await showToast(failToast(result.error));
          return;
        }
        if (!result.html) {
          await showHUD("Conversion produced no output");
          return;
        }
        await Clipboard.copy({ html: result.html, text: clip.text });
        await showHUD("Converted Markdown to rich text");
        return;
      }

      // Clipboard filepath .md → rich HTML
      if (clip.kind === "filepath") {
        const fileName = basename(clip.path);
        await showToast({
          style: Toast.Style.Animated,
          title: `Converting ${fileName}...`,
        });
        const result = await exportToHtml(clip.path);
        if (result.error) {
          await showToast(failToast(result.error));
          return;
        }
        if (!result.html) {
          await showHUD("Conversion produced no output");
          return;
        }
        const mdText = (await import("node:fs")).readFileSync(
          clip.path,
          "utf-8",
        );
        await Clipboard.copy({ html: result.html, text: mdText });
        await showHUD(`Copied ${fileName} as rich text`);
        return;
      }
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

import { Clipboard, showHUD, showToast, Toast } from "@raycast/api";
import { convertToHtmlFromText, isInstalled } from "./lib/docs2llm";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  const clipText = await Clipboard.readText();
  if (!clipText || clipText.trim().length === 0) {
    await showHUD("Clipboard is empty");
    return;
  }

  await showToast({
    style: Toast.Style.Animated,
    title: "Converting to rich text...",
  });

  const result = await convertToHtmlFromText(clipText);

  if (result.error) {
    const isPandocError = result.error.toLowerCase().includes("pandoc");

    await showHUD(
      isPandocError
        ? "Pandoc required: brew install pandoc"
        : "Conversion failed",
    );
    return;
  }

  if (!result.html) {
    await showHUD("Conversion produced no output");
    return;
  }

  await Clipboard.copy({ html: result.html, text: clipText });
  await showHUD("Rich text ready — paste anywhere");
}

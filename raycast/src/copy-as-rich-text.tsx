import {
  Clipboard,
  getSelectedFinderItems,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { readFileSync } from "node:fs";
import { exportToHtml, isInstalled } from "./lib/docs2llm";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  let items: { path: string }[];
  try {
    items = await getSelectedFinderItems();
  } catch {
    await showHUD("No Finder selection — select a .md file in Finder first");
    return;
  }

  if (items.length === 0) {
    await showHUD("No files selected in Finder");
    return;
  }

  const filePath = items[0].path;
  const fileName = filePath.split("/").pop() || "file";

  if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
    await showHUD(`Not a Markdown file: ${fileName}`);
    return;
  }

  await showToast({
    style: Toast.Style.Animated,
    title: `Converting ${fileName}...`,
  });

  const result = await exportToHtml(filePath);

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

  const mdText = readFileSync(filePath, "utf-8");
  await Clipboard.copy({ html: result.html, text: mdText });
  await showHUD(`Rich text copied from ${fileName}`);
}

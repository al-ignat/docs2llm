import {
  Clipboard,
  getSelectedFinderItems,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { convertFile, isInstalled } from "./lib/docs2llm";

export default async function Command() {
  if (!isInstalled()) {
    await showHUD("docs2llm not found — set binary path in preferences");
    return;
  }

  let items: { path: string }[];
  try {
    items = await getSelectedFinderItems();
  } catch {
    await showHUD("No Finder selection — select a file in Finder first");
    return;
  }

  if (items.length === 0) {
    await showHUD("No files selected in Finder");
    return;
  }

  const filePath = items[0].path;
  const fileName = filePath.split("/").pop() || "file";

  await showToast({
    style: Toast.Style.Animated,
    title: `Converting ${fileName}...`,
  });
  const result = await convertFile(filePath);

  if (result.error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Conversion failed",
      message: result.error,
    });
    return;
  }

  await Clipboard.copy(result.content);

  const words = result.content.split(/\s+/).length;
  await showHUD(`Copied ${words} words from ${fileName}`);
}

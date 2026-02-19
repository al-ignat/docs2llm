import { watch as fsWatch } from "fs";
import { join, extname, basename } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import { convertFile } from "./convert";
import { writeOutput } from "./output";
import { getTokenStats, formatTokenStats } from "./tokens";

const CONVERTIBLE_EXTS = new Set([
  ".docx", ".doc", ".pdf", ".pptx", ".ppt",
  ".xlsx", ".xls", ".odt", ".odp", ".ods",
  ".rtf", ".epub", ".mobi", ".eml", ".msg",
  ".csv", ".tsv", ".html", ".xml", ".txt",
  ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp",
]);

export function startWatcher(inputDir: string, outputDir: string): void {
  if (!existsSync(inputDir)) {
    throw new Error(`Watch directory not found: ${inputDir}`);
  }

  mkdirSync(outputDir, { recursive: true });

  const processed = new Set<string>();

  console.log(`Watching ${inputDir} → ${outputDir}`);
  console.log("Drop files into the folder to auto-convert. Press Ctrl+C to stop.\n");

  fsWatch(inputDir, async (eventType, filename) => {
    if (!filename || filename.startsWith(".")) return;
    const ext = extname(filename).toLowerCase();
    if (!CONVERTIBLE_EXTS.has(ext)) return;

    const filePath = join(inputDir, filename);

    // Debounce: skip if we already processed this file recently
    if (processed.has(filePath)) return;
    processed.add(filePath);
    setTimeout(() => processed.delete(filePath), 2000);

    // Wait a moment for file write to complete
    await new Promise((r) => setTimeout(r, 500));

    try {
      if (!existsSync(filePath) || !statSync(filePath).isFile()) return;
    } catch {
      return;
    }

    try {
      const result = await convertFile(filePath, "md");
      const outName = basename(filename, ext) + ".md";
      const outPath = join(outputDir, outName);
      await writeOutput(outPath, result.formatted);
      const stats = getTokenStats(result.content);
      console.log(`✓ ${filename} → ${outName} (${formatTokenStats(stats)})`);
    } catch (err: any) {
      console.error(`✗ ${filename}: ${err.message ?? err}`);
    }
  });
}

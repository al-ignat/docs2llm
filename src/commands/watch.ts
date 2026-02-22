import { watch as fsWatch } from "fs";
import { join, extname, basename, dirname } from "path";
import { existsSync, mkdirSync, statSync } from "fs";
import { convertFile } from "../core/convert";
import { writeOutput } from "../core/output";
import { getTokenStats, formatTokenStats } from "../core/tokens";

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

  const inflight = new Map<string, Promise<void>>();

  console.log(`Watching ${inputDir} → ${outputDir}`);
  console.log("Drop files into the folder to auto-convert. Press Ctrl+C to stop.\n");

  fsWatch(inputDir, { recursive: true }, async (eventType, filename) => {
    if (!filename || filename.startsWith(".")) return;
    const ext = extname(filename).toLowerCase();
    if (!CONVERTIBLE_EXTS.has(ext)) return;

    const filePath = join(inputDir, filename);

    // Skip if a conversion is already in-flight for this file
    if (inflight.has(filePath)) return;

    const task = (async () => {
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
        // Preserve subdirectory structure from recursive watch
        const relDir = dirname(filename);
        const outDir = relDir === "." ? outputDir : join(outputDir, relDir);
        if (outDir !== outputDir) mkdirSync(outDir, { recursive: true });
        const outPath = join(outDir, outName);
        await writeOutput(outPath, result.formatted);
        const stats = getTokenStats(result.content);
        console.log(`✓ ${filename} → ${outName} (${formatTokenStats(stats)})`);
      } catch (err: any) {
        console.error(`✗ ${filename}: ${err.message ?? err}`);
      }
    })();

    inflight.set(filePath, task);
    task.finally(() => inflight.delete(filePath));
  });
}

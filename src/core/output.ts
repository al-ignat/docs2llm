import { basename, dirname, join, extname, resolve } from "path";
import type { OutputFormat } from "./convert";

const EXT_MAP: Record<OutputFormat, string> = {
  md: ".md",
  json: ".json",
  yaml: ".yaml",
  docx: ".docx",
  pptx: ".pptx",
  html: ".html",
};

export function resolveOutputPath(
  sourcePath: string,
  format: OutputFormat,
  outputDir?: string
): string {
  const name = basename(sourcePath, extname(sourcePath));
  const dir = resolve(outputDir ?? dirname(sourcePath));
  const outPath = resolve(dir, name + EXT_MAP[format]);

  // Ensure output stays within the target directory
  if (!outPath.startsWith(dir + "/") && outPath !== dir) {
    throw new Error(
      `Output path escapes target directory "${dir}". Aborting.`
    );
  }

  return outPath;
}

export async function writeOutput(
  outputPath: string,
  content: string
): Promise<void> {
  await Bun.write(outputPath, content);
}

import { basename, dirname, join, extname } from "path";
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
  const dir = outputDir ?? dirname(sourcePath);
  return join(dir, name + EXT_MAP[format]);
}

export async function writeOutput(
  outputPath: string,
  content: string
): Promise<void> {
  await Bun.write(outputPath, content);
}

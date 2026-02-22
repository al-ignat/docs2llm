import { resolve, extname } from "path";
import { resolveOutputPath } from "./output";
import type { OutputFormat } from "./convert";

export type ConversionDirection = "inbound" | "outbound";

const OUTBOUND_FORMATS = new Set<string>(["docx", "pptx", "html"]);

export interface ConversionPlan {
  direction: ConversionDirection;
  inputPath: string;
  outputPath: string;
  format: OutputFormat;
  pandocArgs?: string[];
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function buildPlan(
  inputPath: string,
  format: OutputFormat,
  options?: {
    outputDir?: string;
    formatExplicit?: boolean;
    pandocArgs?: string[];
    defaultMdFormat?: OutputFormat;
  }
): ConversionPlan {
  const ext = extname(inputPath).toLowerCase();
  const isMarkdownInput = ext === ".md";
  const isOutboundFormat = OUTBOUND_FORMATS.has(format);

  // Smart default: .md input with no explicit -f → config default or docx
  if (isMarkdownInput && !options?.formatExplicit && format === "md") {
    format = options?.defaultMdFormat ?? "docx";
  }

  // Re-check after smart default
  const direction: ConversionDirection =
    isMarkdownInput && OUTBOUND_FORMATS.has(format) ? "outbound" : "inbound";

  // Non-.md input + outbound format → error
  if (!isMarkdownInput && isOutboundFormat) {
    throw new ValidationError(
      `Outbound formats (docx/pptx/html) only work with .md input. Got: ${ext || "(no extension)"}`
    );
  }

  // Resolve output path
  const outputPath = resolveOutputPath(inputPath, format, options?.outputDir);

  // Check input/output collision
  if (resolve(outputPath) === resolve(inputPath)) {
    throw new ValidationError(
      "Output would overwrite input file. Use -o to specify a different directory."
    );
  }

  return {
    direction,
    inputPath,
    outputPath,
    format,
    pandocArgs: options?.pandocArgs?.length ? options.pandocArgs : undefined,
  };
}

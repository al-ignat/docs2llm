export type Direction = "inbound" | "outbound";

export const INBOUND_FORMATS = ["md", "json", "yaml"] as const;
export const OUTBOUND_FORMATS = ["docx", "pptx", "html"] as const;

export function detectDirection(filePath: string): Direction {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown")
    ? "outbound"
    : "inbound";
}

export function formatTitle(f: string): string {
  switch (f) {
    case "md":
      return "Markdown";
    case "json":
      return "JSON";
    case "yaml":
      return "YAML";
    case "docx":
      return "Word (.docx)";
    case "pptx":
      return "PowerPoint (.pptx)";
    case "html":
      return "HTML (.html)";
    default:
      return f;
  }
}

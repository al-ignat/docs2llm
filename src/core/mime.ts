export const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
  xls: "application/vnd.ms-excel",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  html: "text/html",
  xml: "application/xml",
  txt: "text/plain",
  eml: "message/rfc822",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tiff: "image/tiff",
  bmp: "image/bmp",
  gif: "image/gif",
  webp: "image/webp",
};

export function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export function detectMimeFromBytes(data: Uint8Array): string {
  // PDF: %PDF
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "application/pdf";
  }
  // ZIP-based (docx, pptx, xlsx, epub, odt): PK\x03\x04
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
    // Scan ZIP local file headers for characteristic paths to identify the format
    const text = new TextDecoder("ascii", { fatal: false }).decode(data.subarray(0, Math.min(data.length, 8192)));
    if (text.includes("word/document.xml")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (text.includes("ppt/presentation.xml")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (text.includes("xl/workbook.xml")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (text.includes("META-INF/container.xml")) return "application/epub+zip";
    if (text.includes("mimetype")) return "application/zip"; // ODF — let Kreuzberg refine
    return "application/zip";
  }
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return "image/gif";
  }
  // Try as text/HTML
  const head = new TextDecoder().decode(data.slice(0, 256)).trim();
  if (head.startsWith("<!") || head.startsWith("<html") || head.startsWith("<HTML")) {
    return "text/html";
  }
  // Default to plain text
  return "text/plain";
}

import { convertHtmlToMarkdown, convertBytes } from "./convert";
import { safeFetchBytes } from "./url-safe";

export async function fetchAndConvert(url: string): Promise<{ content: string; mimeType: string }> {
  const { bytes, contentType } = await safeFetchBytes(url);

  const mime = contentType.split(";")[0].trim();

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    const html = new TextDecoder().decode(bytes);
    const content = await convertHtmlToMarkdown(html);
    return { content, mimeType: "text/html" };
  }

  const result = await convertBytes(bytes, mime || "application/octet-stream");
  return { content: result.content, mimeType: result.mimeType };
}

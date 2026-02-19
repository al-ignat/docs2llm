import { convertHtmlToMarkdown, convertBytes } from "./convert";

export async function fetchAndConvert(url: string): Promise<{ content: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const mime = contentType.split(";")[0].trim();
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (mime === "text/html" || mime === "application/xhtml+xml") {
    const html = new TextDecoder().decode(bytes);
    const content = await convertHtmlToMarkdown(html);
    return { content, mimeType: "text/html" };
  }

  const result = await convertBytes(bytes, mime || "application/octet-stream");
  return { content: result.content, mimeType: result.mimeType };
}

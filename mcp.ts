import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convertFile, convertBytes, type OcrOptions } from "./convert";
import { fetchAndConvert } from "./fetch";
import { getTokenStats } from "./tokens";

export async function startMcpServer() {
  const server = new McpServer({
    name: "docs2llm",
    version: "1.0.0",
  });

  server.tool(
    "convert_file",
    "Convert a document file to LLM-friendly markdown text. Supports PDF, DOCX, PPTX, XLSX, HTML, images, and many more formats.",
    {
      filePath: z.string().describe("Absolute path to the file to convert"),
      ocr: z.boolean().optional().describe("Enable OCR for scanned documents"),
      ocrLanguage: z.string().optional().describe("OCR language code (e.g., deu, fra, jpn)"),
    },
    async ({ filePath, ocr: ocrEnabled, ocrLanguage }) => {
      try {
        const ocrOpts: OcrOptions | undefined = ocrEnabled
          ? { enabled: true, force: true, language: ocrLanguage }
          : undefined;

        const result = await convertFile(filePath, "md", { ocr: ocrOpts });
        const stats = getTokenStats(result.content);

        const metadata = [
          `Source: ${result.sourcePath}`,
          `MIME: ${result.mimeType}`,
          `Words: ${stats.words}`,
          `Tokens: ~${stats.tokens}`,
        ];
        if (result.qualityScore != null) {
          metadata.push(`Quality: ${(result.qualityScore * 100).toFixed(0)}%`);
        }

        return {
          content: [
            { type: "text", text: `---\n${metadata.join("\n")}\n---\n\n${result.content}` },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error converting file: ${err.message ?? err}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "convert_url",
    "Fetch a web page or remote document and convert it to markdown text.",
    {
      url: z.string().url().describe("URL to fetch and convert"),
    },
    async ({ url }) => {
      try {
        const result = await fetchAndConvert(url);
        const stats = getTokenStats(result.content);

        return {
          content: [
            {
              type: "text",
              text: `---\nSource: ${url}\nMIME: ${result.mimeType}\nWords: ${stats.words}\nTokens: ~${stats.tokens}\n---\n\n${result.content}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error fetching URL: ${err.message ?? err}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_formats",
    "List all document formats supported by docs2llm.",
    {},
    async () => {
      const formats = [
        "Documents: .docx .doc .pptx .ppt .xlsx .xls .odt .odp .ods .rtf .pdf",
        "Text & Data: .txt .csv .tsv .html .xml .md",
        "Email: .eml .msg",
        "eBooks: .epub .mobi",
        "Images (via OCR): .png .jpg .jpeg .tiff .bmp .gif .webp",
      ];
      return {
        content: [{ type: "text", text: formats.join("\n") }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

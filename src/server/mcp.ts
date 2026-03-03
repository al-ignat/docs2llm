import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readdirSync } from "fs";
import { join, extname } from "path";
import { convertFile, convertHtmlToMarkdown, isTesseractError, TESSERACT_INSTALL_HINT, type OcrOptions, type OutputFormat } from "../core/convert";
import { convertMarkdownTo, type OutboundFormat } from "../core/outbound";
import { fetchAndConvert } from "../core/fetch";
import { getTokenStats } from "../core/tokens";
import { loadConfig, buildPandocArgs, serializeConfig } from "../core/config";
import { INBOUND_ONLY_EXTS } from "../core/scan";
import { errorMessage } from "../shared/errors";

/** Create the MCP server with all tools registered (without connecting a transport). */
export function createMcpServer(): McpServer {
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
      } catch (err) {
        const msg = isTesseractError(err)
          ? `Error converting file: ${errorMessage(err)}\n\n${TESSERACT_INSTALL_HINT}`
          : `Error converting file: ${errorMessage(err)}`;
        return {
          content: [{ type: "text", text: msg }],
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
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error fetching URL: ${errorMessage(err)}` }],
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

  // --- New tools for feature parity ---

  server.tool(
    "convert_to_document",
    "Convert a Markdown file to DOCX, PPTX, or HTML via Pandoc. Returns the output file path.",
    {
      inputPath: z.string().describe("Absolute path to the .md file to convert"),
      format: z.enum(["docx", "pptx", "html"]).describe("Output format"),
      outputDir: z.string().optional().describe("Directory for the output file (defaults to same as input)"),
      templateName: z.string().optional().describe("Named template from config to use"),
    },
    async ({ inputPath, format, outputDir, templateName }) => {
      try {
        let pandocArgs: string[] | undefined;
        if (templateName) {
          const config = loadConfig();
          pandocArgs = buildPandocArgs(format as OutboundFormat, config, templateName);
        }

        const outPath = await convertMarkdownTo(
          inputPath,
          format as OutboundFormat,
          outputDir,
          pandocArgs,
        );

        return {
          content: [{ type: "text", text: `Converted: ${inputPath} → ${outPath}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${errorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "convert_folder",
    "Convert all documents in a directory to markdown. Returns a summary of results.",
    {
      dirPath: z.string().describe("Absolute path to the directory to convert"),
      format: z.enum(["md", "json", "yaml"]).optional().describe("Output format (default: md)"),
    },
    async ({ dirPath, format: fmt }) => {
      try {
        const outFormat = fmt ?? "md";
        const entries = readdirSync(dirPath, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile() && !e.name.startsWith(".") && INBOUND_ONLY_EXTS.has(extname(e.name).toLowerCase()))
          .map((e) => join(dirPath, e.name));

        if (files.length === 0) {
          return { content: [{ type: "text", text: "No convertible files found in directory." }] };
        }
        if (files.length > 100) {
          return {
            content: [{ type: "text", text: `Too many files (${files.length}). Maximum is 100 files per batch.` }],
            isError: true,
          };
        }

        const BATCH_SIZE = 4;
        const results: string[] = [];
        let ok = 0;
        let fail = 0;

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          const settled = await Promise.allSettled(
            batch.map(async (file) => {
              const result = await convertFile(file, outFormat as OutputFormat);
              const stats = getTokenStats(result.content);
              return `✓ ${file} (~${stats.tokens} tokens)`;
            })
          );

          for (let j = 0; j < settled.length; j++) {
            if (settled[j].status === "fulfilled") {
              results.push((settled[j] as PromiseFulfilledResult<string>).value);
              ok++;
            } else {
              results.push(`✗ ${batch[j]}: ${errorMessage((settled[j] as PromiseRejectedResult).reason)}`);
              fail++;
            }
          }
        }

        const summary = `Converted ${ok}/${files.length} files (${fail} failed).\n\n${results.join("\n")}`;
        return { content: [{ type: "text", text: summary }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${errorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "convert_html",
    "Convert an HTML string to clean Markdown text.",
    {
      html: z.string().describe("HTML content to convert to Markdown"),
    },
    async ({ html }) => {
      try {
        const content = await convertHtmlToMarkdown(html);
        const stats = getTokenStats(content);

        return {
          content: [
            { type: "text", text: `---\nWords: ${stats.words}\nTokens: ~${stats.tokens}\n---\n\n${content}` },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error converting HTML: ${errorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_templates",
    "List available named templates from docs2llm config.",
    {},
    async () => {
      try {
        const config = loadConfig();
        const templates = config.templates;

        if (!templates || Object.keys(templates).length === 0) {
          return { content: [{ type: "text", text: "No templates configured." }] };
        }

        const lines = Object.entries(templates).map(([name, tpl]) => {
          const parts = [`${name}: format=${tpl.format}`];
          if (tpl.description) parts.push(tpl.description);
          if (tpl.pandocArgs?.length) parts.push(`args: ${tpl.pandocArgs.join(" ")}`);
          return parts.join(" — ");
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error loading templates: ${errorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_config",
    "Get the current docs2llm configuration (merged global + local).",
    {},
    async () => {
      try {
        const config = loadConfig();
        const yaml = serializeConfig(config);

        if (!yaml.trim() || yaml.trim() === "{}") {
          return { content: [{ type: "text", text: "No configuration found. Run `docs2llm init` to create one." }] };
        }

        return { content: [{ type: "text", text: yaml }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error loading config: ${errorMessage(err)}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

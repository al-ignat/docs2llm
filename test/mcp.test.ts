import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/server/mcp";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let client: Client;
let tmpDir: string;

beforeAll(async () => {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // Create temp directory with test fixtures
  tmpDir = mkdtempSync(join(tmpdir(), "mcp-test-"));
  writeFileSync(join(tmpDir, "hello.txt"), "Hello world from MCP test.");
  writeFileSync(join(tmpDir, "sample.md"), "# Heading\n\nSome **bold** text.");
  writeFileSync(join(tmpDir, "ignore.bin"), "binary data");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- list_tools ---

describe("listTools", () => {
  test("returns all 8 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "convert_file",
      "convert_folder",
      "convert_html",
      "convert_to_document",
      "convert_url",
      "get_config",
      "list_formats",
      "list_templates",
    ]);
  });
});

// --- convert_file ---

describe("convert_file", () => {
  test("converts a text file to markdown", async () => {
    const result = await client.callTool({
      name: "convert_file",
      arguments: { filePath: join(tmpDir, "hello.txt") },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Hello world from MCP test.");
    expect(text).toContain("Words:");
    expect(text).toContain("Tokens:");
  });

  test("returns error for non-existent file", async () => {
    const result = await client.callTool({
      name: "convert_file",
      arguments: { filePath: "/tmp/does-not-exist-mcp-test.xyz" },
    });
    expect(result.isError).toBe(true);
  });
});

// --- convert_html ---

describe("convert_html", () => {
  test("converts HTML string to markdown", async () => {
    const result = await client.callTool({
      name: "convert_html",
      arguments: { html: "<p>Hello <strong>bold</strong> world</p>" },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("bold");
    expect(text).toContain("Words:");
  });
});

// --- convert_folder ---

describe("convert_folder", () => {
  test("converts all eligible files in directory", async () => {
    const result = await client.callTool({
      name: "convert_folder",
      arguments: { dirPath: tmpDir },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    // hello.txt should be converted; .bin files are not in INBOUND_ONLY_EXTS
    expect(text).toContain("hello.txt");
  });

  test("returns error for non-existent directory", async () => {
    const result = await client.callTool({
      name: "convert_folder",
      arguments: { dirPath: "/tmp/does-not-exist-mcp-dir" },
    });
    expect(result.isError).toBe(true);
  });

  test("reports empty directory when no convertible files", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "mcp-empty-"));
    const result = await client.callTool({
      name: "convert_folder",
      arguments: { dirPath: emptyDir },
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("No convertible files");
    rmSync(emptyDir, { recursive: true, force: true });
  });
});

// --- list_formats ---

describe("list_formats", () => {
  test("returns format listing", async () => {
    const result = await client.callTool({
      name: "list_formats",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain(".pdf");
    expect(text).toContain(".docx");
    expect(text).toContain(".html");
  });
});

// --- list_templates ---

describe("list_templates", () => {
  test("returns templates or empty message", async () => {
    const result = await client.callTool({
      name: "list_templates",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    // Either lists templates or says none configured
    expect(text.length).toBeGreaterThan(0);
  });
});

// --- get_config ---

describe("get_config", () => {
  test("returns config or empty message", async () => {
    const result = await client.callTool({
      name: "get_config",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text.length).toBeGreaterThan(0);
  });
});

// --- convert_to_document ---

describe("convert_to_document", () => {
  test("returns error for non-existent input file", async () => {
    const result = await client.callTool({
      name: "convert_to_document",
      arguments: {
        inputPath: "/tmp/does-not-exist.md",
        format: "html",
      },
    });
    expect(result.isError).toBe(true);
  });
});

// --- convert_url ---

describe("convert_url", () => {
  test("returns error for invalid URL", async () => {
    const result = await client.callTool({
      name: "convert_url",
      arguments: { url: "http://localhost:1/nonexistent" },
    });
    expect(result.isError).toBe(true);
  });
});

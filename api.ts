import { convertBytes, convertHtmlToMarkdown, isImageMime } from "./convert";
import { getTokenStats, checkLLMFit, formatLLMFit } from "./tokens";
import { safeFetchBytes } from "./url-safe";
import { convertMarkdownTo, type OutboundFormat } from "./outbound";
import {
  loadConfig,
  buildPandocArgs,
  serializeConfig,
  parseConfigFile,
  findLocalConfig,
  LOCAL_CONFIG_NAME,
  GLOBAL_CONFIG_PATH,
  type Config,
  type TemplateConfig,
} from "./config";
import { tmpdir, homedir } from "os";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { HTML } from "./ui";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

const MIME_MAP: Record<string, string> = {
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

const SUPPORTED_FORMATS = Object.entries(MIME_MAP).map(([ext, mime]) => ({ ext, mime }));

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

async function handleConvert(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid request. Send multipart/form-data with a 'file' field." }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  if (!file) {
    return Response.json({ error: "No file uploaded. Send a 'file' field." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rawMime = file.type || guessMime(file.name);
  const mime = rawMime.split(";")[0].trim();

  // Check for OCR options in form data
  const ocrEnabled = formData.get("ocr") === "true" || formData.get("ocr") === "1";
  const ocrForce = formData.get("ocr") === "force";
  const ocrLang = formData.get("ocr_lang") as string | null;
  // Auto-enable OCR for images
  const isImage = isImageMime(mime);
  const ocrOpts = (ocrEnabled || ocrForce || ocrLang)
    ? { enabled: true, force: ocrForce, language: ocrLang ?? undefined }
    : isImage
      ? { enabled: true, force: true }
      : undefined;

  try {
    const result = await convertBytes(bytes, mime, ocrOpts);
    const stats = getTokenStats(result.content);
    const fits = checkLLMFit(stats.tokens);
    return Response.json({
      content: result.content,
      filename: file.name,
      mimeType: result.mimeType,
      metadata: result.metadata,
      qualityScore: result.qualityScore ?? null,
      words: stats.words,
      tokens: stats.tokens,
      fits: fits.map((f) => ({ name: f.name, limit: f.limit, fits: f.fits })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

async function handleConvertUrl(req: Request): Promise<Response> {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body. Send {\"url\": \"...\"}." }, { status: 400 });
  }

  const url = body.url;
  if (!url) {
    return Response.json({ error: "Missing 'url' field." }, { status: 400 });
  }

  let bytes: Uint8Array;
  let contentType: string;
  try {
    const result = await safeFetchBytes(url);
    bytes = result.bytes;
    contentType = result.contentType;
  } catch (err: any) {
    const msg = err.message ?? String(err);
    // SSRF validation errors → 400, upstream fetch failures → 502
    if (msg.includes("Blocked") || msg.includes("Invalid URL") || msg.includes("Blocked URL scheme")) {
      return Response.json({ error: msg }, { status: 400 });
    }
    return Response.json({ error: msg }, { status: 502 });
  }

  try {
    let content: string;
    let mime = contentType.split(";")[0].trim();

    if (mime === "text/html" || mime === "application/xhtml+xml") {
      const html = new TextDecoder().decode(bytes);
      content = await convertHtmlToMarkdown(html);
      mime = "text/html";
    } else {
      const result = await convertBytes(bytes, mime || "application/octet-stream");
      content = result.content;
      mime = result.mimeType;
    }

    const stats = getTokenStats(content);
    const fits = checkLLMFit(stats.tokens);
    return Response.json({
      content,
      url,
      mimeType: mime,
      words: stats.words,
      tokens: stats.tokens,
      fits: fits.map((f) => ({ name: f.name, limit: f.limit, fits: f.fits })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

async function handleConvertClipboard(req: Request): Promise<Response> {
  let body: { html?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body. Send {"html": "...", "text": "..."}.' }, { status: 400 });
  }

  const html = body.html?.trim();
  const text = body.text?.trim();

  if (!html && !text) {
    return Response.json({ error: "Provide at least 'html' or 'text'." }, { status: 400 });
  }

  try {
    const content = html ? await convertHtmlToMarkdown(html) : text!;
    const stats = getTokenStats(content);
    const fits = checkLLMFit(stats.tokens);
    return Response.json({
      content,
      words: stats.words,
      tokens: stats.tokens,
      fits: fits.map((f) => ({ name: f.name, limit: f.limit, fits: f.fits })),
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

function handleFormats(): Response {
  return Response.json({ formats: SUPPORTED_FORMATS });
}

// --- Outbound conversion ---

const OUTBOUND_MIMES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html",
};

async function handleConvertOutbound(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid request. Send multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const format = formData.get("format") as string | null;
  const templateName = (formData.get("template") as string | null) || undefined;

  if (!file) return Response.json({ error: "No file uploaded." }, { status: 400 });
  if (!format || !["docx", "pptx", "html"].includes(format)) {
    return Response.json({ error: "Invalid format. Use docx, pptx, or html." }, { status: 400 });
  }

  const outFormat = format as OutboundFormat;
  const tmpIn = join(tmpdir(), `docs2llm-in-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.md`);
  let outPath: string | undefined;

  try {
    await Bun.write(tmpIn, new Uint8Array(await file.arrayBuffer()));

    const config = loadConfig();
    const pandocArgs = buildPandocArgs(outFormat, config, templateName);
    outPath = await convertMarkdownTo(tmpIn, outFormat, tmpdir(), pandocArgs);

    const outBytes = await Bun.file(outPath).arrayBuffer();
    const rawName = file.name.replace(/\.[^.]+$/, "") || "output";
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(outBytes, {
      headers: {
        "Content-Type": OUTBOUND_MIMES[outFormat] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}.${outFormat}"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? String(err) }, { status: 500 });
  } finally {
    try { unlinkSync(tmpIn); } catch {}
    if (outPath) try { unlinkSync(outPath); } catch {}
  }
}

function handleGetTemplates(): Response {
  const config = loadConfig();
  return Response.json({ templates: config.templates ?? {} });
}

// --- Config ---

function handleGetConfig(): Response {
  const config = loadConfig();
  return Response.json({ config, configPath: GLOBAL_CONFIG_PATH });
}

async function handlePutConfig(req: Request): Promise<Response> {
  let body: Partial<Config>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetPath = GLOBAL_CONFIG_PATH;
  const existing = parseConfigFile(targetPath);

  const merged: Config = {
    defaults: { ...existing.defaults, ...body.defaults },
    pandoc: body.pandoc !== undefined ? { ...existing.pandoc, ...body.pandoc } : existing.pandoc,
    templates: existing.templates,
  };

  // Clean up undefined values in defaults
  if (merged.defaults) {
    for (const [k, v] of Object.entries(merged.defaults)) {
      if (v === undefined || v === null || v === "") delete (merged.defaults as any)[k];
    }
    if (Object.keys(merged.defaults).length === 0) delete merged.defaults;
  }
  // Clean up empty pandoc entries
  if (merged.pandoc) {
    for (const [k, v] of Object.entries(merged.pandoc)) {
      if (!v || (Array.isArray(v) && v.length === 0)) delete merged.pandoc[k];
    }
    if (Object.keys(merged.pandoc).length === 0) delete merged.pandoc;
  }

  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await Bun.write(targetPath, serializeConfig(merged));

  return Response.json({ ok: true, configPath: targetPath });
}

// --- Template CRUD ---

async function handleCreateTemplate(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid request. Send multipart/form-data." }, { status: 400 });
  }

  const name = (formData.get("name") as string)?.trim();
  const format = formData.get("format") as string;
  const description = (formData.get("description") as string)?.trim() || undefined;
  const featuresRaw = formData.get("features") as string | null;
  const referenceFile = formData.get("referenceFile") as File | null;

  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name)) {
    return Response.json({ error: "Invalid template name. Use alphanumeric and hyphens, starting with a letter or number." }, { status: 400 });
  }
  if (!format || !["docx", "pptx", "html"].includes(format)) {
    return Response.json({ error: "Invalid format." }, { status: 400 });
  }

  const parsed = featuresRaw ? JSON.parse(featuresRaw) : [];
  const features: string[] = Array.isArray(parsed) ? parsed.filter((f: unknown) => typeof f === "string") : [];
  const pandocArgs: string[] = [];

  if (features.includes("toc")) pandocArgs.push("--toc");
  if (features.includes("standalone")) pandocArgs.push("--standalone");

  // Handle reference file upload
  if (referenceFile && referenceFile.size > 0) {
    const templateDir = join(homedir(), ".config", "docs2llm", "templates");
    if (!existsSync(templateDir)) mkdirSync(templateDir, { recursive: true });
    const ext = referenceFile.name.split(".").pop() ?? format;
    const refPath = join(templateDir, `${name}.${ext}`);
    await Bun.write(refPath, new Uint8Array(await referenceFile.arrayBuffer()));
    pandocArgs.push(`--reference-doc=${refPath}`);
  }

  const targetPath = findLocalConfig() ?? LOCAL_CONFIG_NAME;
  const existing = parseConfigFile(targetPath);

  const tplConfig: TemplateConfig = {
    format: format as any,
    ...(pandocArgs.length ? { pandocArgs } : {}),
    ...(description ? { description } : {}),
  };

  existing.templates = { ...existing.templates, [name]: tplConfig };

  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await Bun.write(targetPath, serializeConfig(existing));

  return Response.json({ ok: true, name, template: tplConfig });
}

async function handleDeleteTemplate(name: string): Promise<Response> {
  if (!name) return Response.json({ error: "Template name required." }, { status: 400 });

  const targetPath = findLocalConfig() ?? LOCAL_CONFIG_NAME;
  const existing = parseConfigFile(targetPath);

  if (!existing.templates?.[name]) {
    return Response.json({ error: `Template "${name}" not found.` }, { status: 404 });
  }

  // Clean up reference files — only delete if within the expected template directory
  const tpl = existing.templates[name];
  const templateDir = join(homedir(), ".config", "docs2llm", "templates");
  if (tpl.pandocArgs) {
    for (const arg of tpl.pandocArgs) {
      if (arg.startsWith("--reference-doc=")) {
        const refPath = arg.slice("--reference-doc=".length);
        const resolved = resolve(refPath);
        if (resolved.startsWith(templateDir + "/")) {
          try { unlinkSync(resolved); } catch {}
        }
      }
    }
  }

  delete existing.templates[name];
  if (existing.templates && Object.keys(existing.templates).length === 0) {
    delete existing.templates;
  }

  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await Bun.write(targetPath, serializeConfig(existing));

  return Response.json({ ok: true });
}

export function startServer(port = 3000): { port: number; stop: () => void } {
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    maxRequestBodySize: MAX_UPLOAD_BYTES,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/" && req.method === "GET") {
        return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      if (url.pathname === "/convert" && req.method === "POST") {
        return await handleConvert(req);
      }

      if (url.pathname === "/convert/url" && req.method === "POST") {
        return await handleConvertUrl(req);
      }

      if (url.pathname === "/convert/clipboard" && req.method === "POST") {
        return await handleConvertClipboard(req);
      }

      if (url.pathname === "/formats" && req.method === "GET") {
        return handleFormats();
      }

      // Outbound conversion
      if (url.pathname === "/convert/outbound" && req.method === "POST") {
        return await handleConvertOutbound(req);
      }

      // Template list
      if (url.pathname === "/config/templates" && req.method === "GET") {
        return handleGetTemplates();
      }

      // Template CRUD
      if (url.pathname === "/config/templates" && req.method === "POST") {
        return await handleCreateTemplate(req);
      }

      if (url.pathname.startsWith("/config/templates/") && req.method === "DELETE") {
        const tplName = decodeURIComponent(url.pathname.slice("/config/templates/".length));
        return await handleDeleteTemplate(tplName);
      }

      // Config
      if (url.pathname === "/config" && req.method === "GET") {
        return handleGetConfig();
      }

      if (url.pathname === "/config" && req.method === "PUT") {
        return await handlePutConfig(req);
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  const actualPort = server.port;
  console.log(`docs2llm server running at http://localhost:${actualPort}`);
  return { port: actualPort, stop: () => server.stop() };
}


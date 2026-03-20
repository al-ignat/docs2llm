import { convertBytes, convertHtmlToMarkdown, isImageMime, isTesseractError, TESSERACT_INSTALL_HINT } from "../core/convert";
import { errorMessage, safeErrorMessage } from "../shared/errors";
import { getTokenStats, checkLLMFit, formatLLMFit } from "../core/tokens";
import { safeFetchBytes, MAX_INPUT_BYTES } from "../core/url-safe";
import { convertMarkdownTo, sanitizePandocArgs, type OutboundFormat } from "../core/outbound";
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
} from "../core/config";
import { tmpdir, homedir } from "os";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { HTML } from "./ui";
import { MIME_MAP, guessMime } from "../core/mime";

const SUPPORTED_FORMATS = Object.entries(MIME_MAP).map(([ext, mime]) => ({ ext, mime }));

const MAX_CONCURRENT_CONVERSIONS = 3;

function createConversionLimiter(maxConcurrent = MAX_CONCURRENT_CONVERSIONS) {
  let activeConversions = 0;

  return async function withConversionLimit<T>(fn: () => Promise<T>): Promise<T | Response> {
    if (activeConversions >= maxConcurrent) {
      return Response.json(
        { error: "Server busy. Too many concurrent conversions." },
        { status: 429 }
      );
    }
    activeConversions++;
    try {
      return await fn();
    } finally {
      activeConversions--;
    }
  };
}

async function handleConvert(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid request. Send multipart/form-data with a 'file' field." }, { status: 400 });
  }
  const fileField = formData.get("file");
  const file = fileField instanceof File ? fileField : null;
  if (!file) {
    return Response.json({ error: "No file uploaded. Send a 'file' field." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rawMime = file.type || guessMime(file.name);
  const mime = rawMime.split(";")[0].trim();

  // Check for OCR options in form data
  const ocrRaw = formData.get("ocr");
  const ocrEnabled = ocrRaw === "true" || ocrRaw === "1";
  const ocrForce = ocrRaw === "force";
  const ocrLangRaw = formData.get("ocr_lang");
  const ocrLang = typeof ocrLangRaw === "string" ? ocrLangRaw : null;
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
  } catch (err) {
    // Auto-triggered OCR (images): fall back to non-OCR and include warning
    if (isTesseractError(err) && isImage && !ocrEnabled && !ocrForce) {
      try {
        const result = await convertBytes(bytes, mime);
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
          warning: "OCR unavailable (Tesseract not installed). Result may be incomplete for images.",
        });
      } catch (fallbackErr) {
        return Response.json({ error: safeErrorMessage(fallbackErr) }, { status: 500 });
      }
    }
    // Explicit OCR requested by user: fail with install instructions
    if (isTesseractError(err)) {
      return Response.json({ error: TESSERACT_INSTALL_HINT }, { status: 500 });
    }
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
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
  } catch (err) {
    const msg = errorMessage(err);
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
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
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
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
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

  const fileField2 = formData.get("file");
  const file = fileField2 instanceof File ? fileField2 : null;
  const formatRaw = formData.get("format");
  const format = typeof formatRaw === "string" ? formatRaw : null;
  const templateRaw = formData.get("template");
  const templateName = (typeof templateRaw === "string" ? templateRaw : null) || undefined;

  if (!file) return Response.json({ error: "No file uploaded." }, { status: 400 });
  if (!format || !["docx", "pptx", "html"].includes(format)) {
    return Response.json({ error: "Invalid format. Use docx, pptx, or html." }, { status: 400 });
  }

  const outFormat = format as OutboundFormat;
  const tmpIn = join(tmpdir(), `docs2llm-in-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.md`);
  let outPath: string | undefined;

  try {
    await Bun.write(tmpIn, file);

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
  } catch (err) {
    return Response.json({ error: safeErrorMessage(err) }, { status: 500 });
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

  // Validate Pandoc args at write time
  if (body.pandoc) {
    try {
      for (const args of Object.values(body.pandoc)) {
        if (Array.isArray(args)) sanitizePandocArgs(args);
      }
    } catch (err) {
      return Response.json({ error: errorMessage(err) }, { status: 400 });
    }
  }

  // Validate outputDir — reject dangerous paths
  if (body.defaults?.outputDir) {
    const dir = body.defaults.outputDir;
    if (dir.includes("\0") || /^\/(etc|proc|sys|dev)\//.test(dir)) {
      return Response.json({ error: "Invalid output directory path." }, { status: 400 });
    }
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
      if (v === undefined || v === null || v === "") Reflect.deleteProperty(merged.defaults, k);
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

  const nameRaw = formData.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const formatRaw2 = formData.get("format");
  const format = typeof formatRaw2 === "string" ? formatRaw2 : "";
  const descRaw = formData.get("description");
  const description = (typeof descRaw === "string" ? descRaw.trim() : "") || undefined;
  const featuresField = formData.get("features");
  const featuresRaw = typeof featuresField === "string" ? featuresField : null;
  const refField = formData.get("referenceFile");
  const referenceFile = refField instanceof File ? refField : null;

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

  // Validate Pandoc args at write time
  if (pandocArgs.length) {
    try {
      sanitizePandocArgs(pandocArgs);
    } catch (err) {
      return Response.json({ error: safeErrorMessage(err) }, { status: 400 });
    }
  }

  const tplConfig: TemplateConfig = {
    format: format as OutboundFormat,
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

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
};

// Additional headers for the HTML page (CSP, frame protection)
// 'unsafe-inline' is necessary because ui.ts embeds all JS/CSS inline in a single HTML string.
// Extracting to served files would require a static file server — overkill for a localhost-only dev tool.
// The CSP still blocks eval, external scripts, framing, and object embeds.
const HTML_SECURITY_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
};

function withSecurityHeaders(response: Response, extra?: Record<string, string>): Response {
  const headers = extra ?? SECURITY_HEADERS;
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export function createApiFetchHandler(): (req: Request) => Promise<Response> {
  const withConversionLimit = createConversionLimiter();

  return async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/" && req.method === "GET") {
      return withSecurityHeaders(
        new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
        HTML_SECURITY_HEADERS,
      );
    }

    // Route to handler
    let response: Response | undefined;

    if (url.pathname === "/convert" && req.method === "POST") {
      response = await withConversionLimit(() => handleConvert(req));
    } else if (url.pathname === "/convert/url" && req.method === "POST") {
      response = await withConversionLimit(() => handleConvertUrl(req));
    } else if (url.pathname === "/convert/clipboard" && req.method === "POST") {
      response = await handleConvertClipboard(req);
    } else if (url.pathname === "/formats" && req.method === "GET") {
      response = handleFormats();
    } else if (url.pathname === "/convert/outbound" && req.method === "POST") {
      response = await withConversionLimit(() => handleConvertOutbound(req));
    } else if (url.pathname === "/config/templates" && req.method === "GET") {
      response = handleGetTemplates();
    } else if (url.pathname === "/config/templates" && req.method === "POST") {
      response = await handleCreateTemplate(req);
    } else if (url.pathname.startsWith("/config/templates/") && req.method === "DELETE") {
      const tplName = decodeURIComponent(url.pathname.slice("/config/templates/".length));
      response = await handleDeleteTemplate(tplName);
    } else if (url.pathname === "/config" && req.method === "GET") {
      response = handleGetConfig();
    } else if (url.pathname === "/config" && req.method === "PUT") {
      response = await handlePutConfig(req);
    }

    if (!response) {
      response = Response.json({ error: "Not found" }, { status: 404 });
    }

    return withSecurityHeaders(response);
  };
}

export function startServer(port = 3000): { port: number; stop: () => void } {
  const fetchHandler = createApiFetchHandler();
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    maxRequestBodySize: MAX_INPUT_BYTES,
    fetch: fetchHandler,
  });

  const actualPort = server.port;
  console.log(`docs2llm server running at http://localhost:${actualPort}`);
  return { port: actualPort ?? port, stop: () => server.stop() };
}

import { convertBytes, convertHtmlToMarkdown } from "./convert";
import { getTokenStats, checkLLMFit, formatLLMFit } from "./tokens";

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

  try {
    const result = await convertBytes(bytes, mime);
    const stats = getTokenStats(result.content);
    const fits = checkLLMFit(stats.tokens);
    return Response.json({
      content: result.content,
      filename: file.name,
      mimeType: result.mimeType,
      metadata: result.metadata,
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

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return Response.json({ error: `Fetch failed: ${res.status} ${res.statusText}` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());

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

function handleFormats(): Response {
  return Response.json({ formats: SUPPORTED_FORMATS });
}

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function startServer(port = 3000): { stop: () => void } {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return cors(new Response(null, { status: 204 }));
      }

      if (url.pathname === "/" && req.method === "GET") {
        return cors(new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      }

      if (url.pathname === "/convert" && req.method === "POST") {
        return cors(await handleConvert(req));
      }

      if (url.pathname === "/convert/url" && req.method === "POST") {
        return cors(await handleConvertUrl(req));
      }

      if (url.pathname === "/formats" && req.method === "GET") {
        return cors(handleFormats());
      }

      return cors(Response.json({ error: "Not found" }, { status: 404 }));
    },
  });

  console.log(`docs2llm server running at http://localhost:${port}`);
  return { stop: () => server.stop() };
}

// --- Inlined Web UI ---

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>docs2llm</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; flex-direction: column; }
  header { padding: 1.5rem 2rem; border-bottom: 1px solid #262626; display: flex; align-items: center; gap: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header span { color: #737373; font-size: 0.875rem; }
  main { flex: 1; display: flex; gap: 1px; background: #262626; }
  .panel { background: #0a0a0a; flex: 1; display: flex; flex-direction: column; }
  .panel-header { padding: 1rem 1.5rem; border-bottom: 1px solid #262626; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #737373; }

  /* Drop zone */
  .drop-zone { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 2rem; cursor: pointer; transition: background 0.15s; }
  .drop-zone.over { background: #171717; }
  .drop-zone.has-result { justify-content: flex-start; cursor: default; }
  .drop-icon { font-size: 3rem; opacity: 0.3; }
  .drop-text { color: #737373; text-align: center; line-height: 1.6; }
  .drop-text a { color: #a3a3a3; text-decoration: underline; cursor: pointer; }

  /* URL bar */
  .url-bar { display: flex; gap: 0.5rem; padding: 1rem 1.5rem; border-bottom: 1px solid #262626; }
  .url-bar input { flex: 1; background: #171717; border: 1px solid #262626; border-radius: 6px; padding: 0.5rem 0.75rem; color: #e5e5e5; font-size: 0.875rem; outline: none; }
  .url-bar input:focus { border-color: #525252; }
  .url-bar button { background: #262626; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 1rem; color: #e5e5e5; font-size: 0.875rem; cursor: pointer; white-space: nowrap; }
  .url-bar button:hover { background: #333; }

  /* Stats */
  .stats { padding: 0.75rem 1.5rem; border-bottom: 1px solid #262626; font-size: 0.8rem; color: #a3a3a3; display: none; }
  .stats.visible { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
  .stat-pill { background: #171717; padding: 0.25rem 0.625rem; border-radius: 99px; }
  .fit-yes { color: #4ade80; }
  .fit-no { color: #f87171; }

  /* Output */
  .output { flex: 1; overflow: auto; padding: 1.5rem; display: none; }
  .output.visible { display: block; }
  .output pre { white-space: pre-wrap; word-wrap: break-word; font-family: "SF Mono", "Fira Code", monospace; font-size: 0.8125rem; line-height: 1.7; color: #d4d4d4; }

  /* Actions */
  .actions { padding: 1rem 1.5rem; border-top: 1px solid #262626; display: none; gap: 0.5rem; }
  .actions.visible { display: flex; }
  .actions button { background: #262626; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 1rem; color: #e5e5e5; font-size: 0.8125rem; cursor: pointer; }
  .actions button:hover { background: #333; }
  .actions button.primary { background: #e5e5e5; color: #0a0a0a; border-color: #e5e5e5; }
  .actions button.primary:hover { background: #d4d4d4; }

  /* Spinner */
  .spinner { display: none; }
  .spinner.visible { display: flex; align-items: center; gap: 0.5rem; color: #737373; font-size: 0.875rem; }
  .spinner::before { content: ""; width: 1rem; height: 1rem; border: 2px solid #404040; border-top-color: #e5e5e5; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #262626; border: 1px solid #404040; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.8125rem; color: #e5e5e5; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
  .toast.show { opacity: 1; }

  /* File info */
  .file-info { padding: 0.75rem 1.5rem; border-bottom: 1px solid #262626; font-size: 0.8125rem; color: #a3a3a3; display: none; align-items: center; gap: 0.5rem; }
  .file-info.visible { display: flex; }
  .file-info .name { color: #e5e5e5; }
  .file-info button { background: none; border: none; color: #737373; cursor: pointer; font-size: 0.75rem; margin-left: auto; }
  .file-info button:hover { color: #e5e5e5; }

  input[type=file] { display: none; }
</style>
</head>
<body>

<header>
  <h1>docs2llm</h1>
  <span>Convert documents to LLM-friendly text</span>
</header>

<main>
  <div class="panel">
    <div class="url-bar">
      <input type="text" id="urlInput" placeholder="Paste a URL to convert…">
      <button onclick="convertUrl()">Convert URL</button>
    </div>

    <div class="file-info" id="fileInfo">
      <span class="name" id="fileName"></span>
      <span id="fileSize"></span>
      <button onclick="reset()">Clear</button>
    </div>

    <div class="drop-zone" id="dropZone" onclick="fileInput.click()">
      <div class="drop-icon">↓</div>
      <div class="drop-text">
        Drop a file here or <a>browse</a><br>
        PDF, DOCX, PPTX, XLSX, images, and 70+ more formats
      </div>
      <div class="spinner" id="spinner">Converting…</div>
    </div>

    <input type="file" id="fileInput">
  </div>

  <div class="panel">
    <div class="panel-header">Output</div>
    <div class="stats" id="stats"></div>
    <div class="output" id="output"><pre id="outputText"></pre></div>
    <div class="actions" id="actions">
      <button class="primary" onclick="copyToClipboard()">Copy to clipboard</button>
      <button onclick="downloadMd()">Download .md</button>
    </div>
  </div>
</main>

<div class="toast" id="toast"></div>

<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const spinner = document.getElementById('spinner');
const output = document.getElementById('output');
const outputText = document.getElementById('outputText');
const stats = document.getElementById('stats');
const actions = document.getElementById('actions');
const fileInfo = document.getElementById('fileInfo');
const toast = document.getElementById('toast');

let currentContent = '';
let currentFilename = 'output';

// Drag and drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
});

async function uploadFile(file) {
  showLoading(file.name, formatBytes(file.size));
  const form = new FormData();
  form.append('file', file);
  try {
    const res = await fetch('/convert', { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    currentFilename = file.name.replace(/\\.[^.]+$/, '');
    showResult(data);
  } catch (err) {
    showError(err.message);
  }
}

async function convertUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  showLoading(url, '');
  try {
    const res = await fetch('/convert/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    currentFilename = new URL(url).hostname;
    showResult(data);
  } catch (err) {
    showError(err.message);
  }
}

function showLoading(name, size) {
  fileInfo.querySelector('.name').textContent = name;
  document.getElementById('fileSize').textContent = size;
  fileInfo.classList.add('visible');
  spinner.classList.add('visible');
  dropZone.querySelector('.drop-icon').style.display = 'none';
  dropZone.querySelector('.drop-text').style.display = 'none';
  output.classList.remove('visible');
  stats.classList.remove('visible');
  actions.classList.remove('visible');
}

function showResult(data) {
  spinner.classList.remove('visible');
  currentContent = data.content;

  // Stats
  let html = '<span class="stat-pill">' + data.words.toLocaleString() + ' words</span>';
  html += '<span class="stat-pill">~' + data.tokens.toLocaleString() + ' tokens</span>';
  if (data.fits) {
    html += data.fits.map(f =>
      '<span class="' + (f.fits ? 'fit-yes' : 'fit-no') + '">' + f.name + ' ' + (f.fits ? '✓' : '✗') + '</span>'
    ).join('  ');
  }
  stats.innerHTML = html;
  stats.classList.add('visible');

  outputText.textContent = data.content;
  output.classList.add('visible');
  actions.classList.add('visible');
}

function showError(msg) {
  spinner.classList.remove('visible');
  outputText.textContent = 'Error: ' + msg;
  output.classList.add('visible');
}

function reset() {
  fileInfo.classList.remove('visible');
  stats.classList.remove('visible');
  output.classList.remove('visible');
  actions.classList.remove('visible');
  spinner.classList.remove('visible');
  dropZone.querySelector('.drop-icon').style.display = '';
  dropZone.querySelector('.drop-text').style.display = '';
  document.getElementById('urlInput').value = '';
  fileInput.value = '';
  currentContent = '';
}

async function copyToClipboard() {
  await navigator.clipboard.writeText(currentContent);
  showToast('Copied to clipboard');
}

function downloadMd() {
  const blob = new Blob([currentContent], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = currentFilename + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Downloaded ' + a.download);
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
</script>
</body>
</html>`;

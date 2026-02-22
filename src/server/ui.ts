// Web UI HTML — extracted from api.ts to keep the server file focused on routing.

export const HTML = `<!DOCTYPE html>
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
  header span { color: #737373; font-size: 0.875rem; flex: 1; }
  .header-actions { display: flex; gap: 0.5rem; }
  .gear-btn { background: none; border: 1px solid #404040; border-radius: 6px; padding: 0.4rem 0.6rem; color: #a3a3a3; cursor: pointer; font-size: 1rem; line-height: 1; }
  .gear-btn:hover { background: #262626; color: #e5e5e5; }
  .gear-btn.active { background: #262626; color: #e5e5e5; border-color: #525252; }

  /* Toolbar */
  .toolbar { display: flex; gap: 0.5rem; padding: 0.75rem 2rem; border-bottom: 1px solid #262626; align-items: center; }
  .toolbar .spacer { flex: 1; }
  .toolbar button { background: #262626; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 1rem; color: #e5e5e5; font-size: 0.8125rem; cursor: pointer; white-space: nowrap; }
  .toolbar button:hover:not(:disabled) { background: #333; }
  .toolbar button:disabled { opacity: 0.35; cursor: default; }
  .toolbar button.primary { background: #e5e5e5; color: #0a0a0a; border-color: #e5e5e5; }
  .toolbar button.primary:hover:not(:disabled) { background: #d4d4d4; }
  .toolbar button.primary:disabled { background: #e5e5e5; }

  /* Stats */
  .stats { padding: 0.75rem 2rem; border-bottom: 1px solid #262626; font-size: 0.8rem; color: #a3a3a3; display: none; }
  .stats.visible { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
  .stat-pill { background: #171717; padding: 0.25rem 0.625rem; border-radius: 99px; }
  .fit-yes { color: #4ade80; }
  .fit-no { color: #f87171; }

  /* Content area */
  main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .content { flex: 1; overflow: auto; }

  /* Input view */
  .input-view { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; padding: 2rem; }
  .drop-zone { width: 100%; max-width: 600px; border: 2px dashed #262626; border-radius: 12px; padding: 3rem 2rem; display: flex; flex-direction: column; align-items: center; gap: 1rem; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
  .drop-zone:hover { border-color: #404040; }
  .drop-zone.over { background: #171717; border-color: #525252; }
  .drop-icon { font-size: 3rem; opacity: 0.3; }
  .drop-text { color: #737373; text-align: center; line-height: 1.6; }
  .drop-text a { color: #a3a3a3; text-decoration: underline; cursor: pointer; }

  .separator { display: flex; align-items: center; gap: 1rem; width: 100%; max-width: 600px; margin: 1.5rem 0; color: #525252; font-size: 0.8rem; }
  .separator::before, .separator::after { content: ""; flex: 1; border-top: 1px solid #262626; }

  .url-bar { display: flex; gap: 0.5rem; width: 100%; max-width: 600px; }
  .url-bar input { flex: 1; background: #171717; border: 1px solid #262626; border-radius: 6px; padding: 0.5rem 0.75rem; color: #e5e5e5; font-size: 0.875rem; outline: none; }
  .url-bar input:focus { border-color: #525252; }
  .url-bar button { background: #262626; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 1rem; color: #e5e5e5; font-size: 0.875rem; cursor: pointer; white-space: nowrap; }
  .url-bar button:hover { background: #333; }

  /* Output view */
  .output-view { display: none; padding: 2rem; }
  .output-view.visible { display: block; }
  .output-view pre { white-space: pre-wrap; word-wrap: break-word; font-family: "SF Mono", "Fira Code", monospace; font-size: 0.8125rem; line-height: 1.7; color: #d4d4d4; }

  /* Spinner */
  .spinner { display: none; }
  .spinner.visible { display: flex; align-items: center; gap: 0.5rem; color: #737373; font-size: 0.875rem; }
  .spinner::before { content: ""; width: 1rem; height: 1rem; border: 2px solid #404040; border-top-color: #e5e5e5; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast */
  .toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #262626; border: 1px solid #404040; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.8125rem; color: #e5e5e5; opacity: 0; transition: opacity 0.2s; pointer-events: none; z-index: 10; }
  .toast.show { opacity: 1; }

  /* Source label */
  .source-label { padding: 0.5rem 2rem; border-bottom: 1px solid #262626; font-size: 0.8125rem; color: #a3a3a3; display: none; align-items: center; gap: 0.5rem; }
  .source-label.visible { display: flex; }
  .source-label .name { color: #e5e5e5; }
  .source-label .size { color: #737373; }

  input[type=file] { display: none; }

  /* Outbound panel */
  .outbound-panel { display: none; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; padding: 2rem; gap: 1.5rem; }
  .outbound-panel.visible { display: flex; }
  .outbound-panel h2 { font-size: 1rem; font-weight: 500; color: #a3a3a3; }
  .format-btns { display: flex; gap: 0.5rem; }
  .format-btns button { background: #171717; border: 1px solid #404040; border-radius: 8px; padding: 0.75rem 1.5rem; color: #e5e5e5; font-size: 0.875rem; cursor: pointer; transition: all 0.15s; }
  .format-btns button:hover { background: #262626; border-color: #525252; }
  .format-btns button.selected { background: #262626; border-color: #e5e5e5; }
  .outbound-row { display: flex; gap: 0.75rem; align-items: center; }
  .outbound-row select { background: #171717; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 0.75rem; color: #e5e5e5; font-size: 0.8125rem; outline: none; }
  .outbound-row select:focus { border-color: #525252; }
  .convert-btn { background: #e5e5e5; color: #0a0a0a; border: none; border-radius: 8px; padding: 0.75rem 2rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  .convert-btn:hover { background: #d4d4d4; }
  .convert-btn:disabled { opacity: 0.35; cursor: default; }

  /* Settings panel */
  .settings-panel { display: none; padding: 2rem; overflow: auto; }
  .settings-panel.visible { display: block; flex: 1; }
  .settings-inner { max-width: 640px; margin: 0 auto; }
  .settings-inner h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 1.5rem; }
  .settings-section { margin-bottom: 2rem; }
  .settings-section h3 { font-size: 0.875rem; font-weight: 600; color: #a3a3a3; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .field { margin-bottom: 1rem; }
  .field label { display: block; font-size: 0.8125rem; color: #a3a3a3; margin-bottom: 0.375rem; }
  .field select, .field input[type=text] { width: 100%; background: #171717; border: 1px solid #404040; border-radius: 6px; padding: 0.5rem 0.75rem; color: #e5e5e5; font-size: 0.8125rem; outline: none; }
  .field select:focus, .field input[type=text]:focus { border-color: #525252; }
  .field-check { display: flex; align-items: center; gap: 0.5rem; }
  .field-check input[type=checkbox] { accent-color: #e5e5e5; }
  .field-check label { font-size: 0.8125rem; color: #e5e5e5; margin: 0; }
  .config-path { font-size: 0.75rem; color: #525252; margin-top: 1rem; font-family: "SF Mono", "Fira Code", monospace; }
  .save-btn { background: #e5e5e5; color: #0a0a0a; border: none; border-radius: 6px; padding: 0.5rem 1.5rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
  .save-btn:hover { background: #d4d4d4; }

  /* Template list in settings */
  .tpl-list { margin-bottom: 1rem; }
  .tpl-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; background: #171717; border: 1px solid #262626; border-radius: 6px; margin-bottom: 0.5rem; }
  .tpl-row .tpl-name { font-weight: 500; font-size: 0.8125rem; }
  .tpl-row .tpl-badge { font-size: 0.6875rem; background: #262626; border: 1px solid #404040; border-radius: 4px; padding: 0.125rem 0.375rem; color: #a3a3a3; text-transform: uppercase; }
  .tpl-row .tpl-desc { flex: 1; font-size: 0.75rem; color: #737373; }
  .tpl-row .tpl-del { background: none; border: 1px solid #404040; border-radius: 4px; padding: 0.25rem 0.5rem; color: #f87171; cursor: pointer; font-size: 0.75rem; }
  .tpl-row .tpl-del:hover { background: #262626; }

  /* Add template form */
  .tpl-form { background: #171717; border: 1px solid #262626; border-radius: 8px; padding: 1rem; margin-top: 0.75rem; }
  .tpl-form .field { margin-bottom: 0.75rem; }
  .tpl-form-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .tpl-form-actions button { border-radius: 6px; padding: 0.4rem 1rem; font-size: 0.8125rem; cursor: pointer; }
  .tpl-form-actions .save-btn { background: #e5e5e5; color: #0a0a0a; border: none; font-weight: 600; }
  .tpl-form-actions .cancel-btn { background: #262626; color: #e5e5e5; border: 1px solid #404040; }
  .tpl-features { display: flex; gap: 1rem; flex-wrap: wrap; }
  .tpl-ref-zone { border: 1px dashed #404040; border-radius: 6px; padding: 0.75rem; text-align: center; color: #737373; font-size: 0.75rem; cursor: pointer; }
  .tpl-ref-zone:hover { border-color: #525252; }
  .tpl-ref-zone.has-file { color: #4ade80; border-color: #4ade80; border-style: solid; }
  .add-tpl-btn { background: #262626; border: 1px solid #404040; border-radius: 6px; padding: 0.4rem 0.75rem; color: #e5e5e5; font-size: 0.8125rem; cursor: pointer; }
  .add-tpl-btn:hover { background: #333; }
</style>
</head>
<body>

<header>
  <h1>docs2llm</h1>
  <span>Convert documents to LLM-friendly text</span>
  <div class="header-actions">
    <button class="gear-btn" id="btnSettings" onclick="toggleSettings()" title="Settings">&#9881;</button>
  </div>
</header>

<div class="toolbar" id="toolbar">
  <button class="primary" id="btnCopy" disabled onclick="copyToClipboard()">Copy</button>
  <button id="btnDownload" disabled onclick="downloadMd()">Download .md</button>
  <button id="btnPaste" onclick="pasteFromClipboard()">Paste</button>
  <div class="spacer"></div>
  <button id="btnClear" disabled onclick="reset()">Clear</button>
</div>

<div class="source-label" id="sourceLabel">
  <span class="name" id="sourceName"></span>
  <span class="size" id="sourceSize"></span>
</div>

<div class="stats" id="stats"></div>

<main>
  <div class="content" id="mainContent">
    <div class="input-view" id="inputView">
      <div class="drop-zone" id="dropZone" onclick="fileInput.click()">
        <div class="drop-icon">&#8595;</div>
        <div class="drop-text">
          Drop a file here or <a>browse</a><br>
          PDF, DOCX, PPTX, XLSX, images, and 70+ more formats
        </div>
        <div class="spinner" id="spinner">Converting&hellip;</div>
      </div>

      <div class="separator">or paste a URL</div>

      <div class="url-bar">
        <input type="text" id="urlInput" placeholder="https://example.com/page">
        <button onclick="convertUrl()">Convert URL</button>
      </div>
    </div>

    <!-- Outbound conversion panel -->
    <div class="outbound-panel" id="outboundPanel">
      <h2 id="outboundFileName"></h2>
      <div class="format-btns" id="formatBtns">
        <button onclick="selectOutFormat('docx')" id="fmtDocx">Word (.docx)</button>
        <button onclick="selectOutFormat('pptx')" id="fmtPptx">PowerPoint (.pptx)</button>
        <button onclick="selectOutFormat('html')" id="fmtHtml">HTML (.html)</button>
      </div>
      <div class="outbound-row">
        <select id="tplSelect"><option value="">No template</option></select>
        <button class="convert-btn" id="btnConvertOut" onclick="convertOutbound()" disabled>Convert</button>
      </div>
      <div class="spinner" id="outSpinner">Converting&hellip;</div>
    </div>

    <div class="output-view" id="outputView">
      <pre id="outputText"></pre>
    </div>

    <!-- Settings panel -->
    <div class="settings-panel" id="settingsPanel">
      <div class="settings-inner">
        <h2>Settings</h2>

        <div class="settings-section">
          <h3>Defaults</h3>
          <div class="field">
            <label for="cfgFormat">Default output format</label>
            <select id="cfgFormat">
              <option value="">(none)</option>
              <option value="docx">Word (.docx)</option>
              <option value="pptx">PowerPoint (.pptx)</option>
              <option value="html">HTML (.html)</option>
            </select>
          </div>
          <div class="field">
            <label for="cfgOutputDir">Output directory</label>
            <input type="text" id="cfgOutputDir" placeholder="(same as input file)">
          </div>
          <div class="field">
            <div class="field-check">
              <input type="checkbox" id="cfgForce">
              <label for="cfgForce">Force overwrite existing files</label>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h3>Pandoc args per format</h3>
          <div class="field">
            <label for="cfgPandocDocx">docx</label>
            <input type="text" id="cfgPandocDocx" placeholder="e.g. --toc --shift-heading-level-by=-1">
          </div>
          <div class="field">
            <label for="cfgPandocPptx">pptx</label>
            <input type="text" id="cfgPandocPptx" placeholder="e.g. --slide-level=2">
          </div>
          <div class="field">
            <label for="cfgPandocHtml">html</label>
            <input type="text" id="cfgPandocHtml" placeholder="e.g. --standalone --toc">
          </div>
        </div>

        <div class="settings-section">
          <h3>Templates</h3>
          <div class="tpl-list" id="tplList"></div>
          <button class="add-tpl-btn" id="btnAddTpl" onclick="showTplForm()">+ Add template</button>
          <div class="tpl-form" id="tplForm" style="display:none">
            <div class="field">
              <label for="tplName">Name</label>
              <input type="text" id="tplName" placeholder="report">
            </div>
            <div class="field">
              <label for="tplFormat">Format</label>
              <select id="tplFormat">
                <option value="docx">Word (.docx)</option>
                <option value="pptx">PowerPoint (.pptx)</option>
                <option value="html">HTML (.html)</option>
              </select>
            </div>
            <div class="field">
              <label for="tplDesc">Description</label>
              <input type="text" id="tplDesc" placeholder="Company report with TOC">
            </div>
            <div class="field">
              <label>Features</label>
              <div class="tpl-features">
                <div class="field-check"><input type="checkbox" id="tplFeatToc"><label for="tplFeatToc">TOC</label></div>
                <div class="field-check"><input type="checkbox" id="tplFeatStandalone"><label for="tplFeatStandalone">Standalone</label></div>
              </div>
            </div>
            <div class="field">
              <label>Reference document (optional)</label>
              <div class="tpl-ref-zone" id="tplRefZone" onclick="tplRefInput.click()">Drop or click to upload .docx/.pptx</div>
              <input type="file" id="tplRefInput" accept=".docx,.pptx">
            </div>
            <div class="tpl-form-actions">
              <button class="save-btn" onclick="saveTpl()">Add template</button>
              <button class="cancel-btn" onclick="hideTplForm()">Cancel</button>
            </div>
          </div>
        </div>

        <button class="save-btn" onclick="saveConfig()">Save settings</button>
        <div class="config-path" id="configPath"></div>
      </div>
    </div>
  </div>
</main>

<input type="file" id="fileInput">
<div class="toast" id="toast"></div>

<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const spinner = document.getElementById('spinner');
const inputView = document.getElementById('inputView');
const outputView = document.getElementById('outputView');
const outputText = document.getElementById('outputText');
const stats = document.getElementById('stats');
const sourceLabel = document.getElementById('sourceLabel');
const btnCopy = document.getElementById('btnCopy');
const btnDownload = document.getElementById('btnDownload');
const btnClear = document.getElementById('btnClear');
const toast = document.getElementById('toast');
const outboundPanel = document.getElementById('outboundPanel');
const settingsPanel = document.getElementById('settingsPanel');
const toolbar = document.getElementById('toolbar');

let currentContent = '';
let currentFilename = 'output';
let pendingMdFile = null;
let selectedOutFormat = '';
let settingsOpen = false;

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

// Paste via Cmd+V / Ctrl+V
document.addEventListener('paste', async (e) => {
  // Don't intercept paste in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (settingsOpen) return;
  e.preventDefault();
  const items = e.clipboardData;
  // 1. Check for files first
  if (items.files.length > 0) {
    uploadFile(items.files[0]);
    return;
  }
  // 2. Check for HTML
  const html = items.getData('text/html');
  if (html) {
    convertClipboard(html, null);
    return;
  }
  // 3. Fall back to plain text
  const text = items.getData('text/plain');
  if (text) {
    convertClipboard(null, text);
  }
});

async function pasteFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    // Check for files (image blobs)
    for (const item of items) {
      const fileType = item.types.find(t => t.startsWith('image/') || t === 'application/pdf');
      if (fileType) {
        const blob = await item.getType(fileType);
        uploadFile(new File([blob], 'clipboard-file', { type: blob.type }));
        return;
      }
    }
    // Check for HTML
    if (items[0] && items[0].types.includes('text/html')) {
      const blob = await items[0].getType('text/html');
      const html = await blob.text();
      convertClipboard(html, null);
      return;
    }
    // Fall back to plain text
    const text = await navigator.clipboard.readText();
    if (text) convertClipboard(null, text);
  } catch (err) {
    showToast('Clipboard access denied');
  }
}

async function convertClipboard(html, text) {
  showLoading('Clipboard', '');
  currentFilename = 'clipboard';
  try {
    const res = await fetch('/convert/clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    showResult(data);
  } catch (err) {
    showError(err.message);
  }
}

function isMdFile(name) {
  return /\\.md$/i.test(name) || /\\.markdown$/i.test(name);
}

async function uploadFile(file) {
  if (isMdFile(file.name)) {
    showOutboundPanel(file);
    return;
  }
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

// --- Outbound conversion ---

async function showOutboundPanel(file) {
  pendingMdFile = file;
  selectedOutFormat = '';
  document.getElementById('outboundFileName').textContent = file.name;
  document.getElementById('sourceName').textContent = file.name;
  document.getElementById('sourceSize').textContent = formatBytes(file.size);
  sourceLabel.classList.add('visible');

  // Reset format buttons
  document.querySelectorAll('.format-btns button').forEach(b => b.classList.remove('selected'));
  document.getElementById('btnConvertOut').disabled = true;
  document.getElementById('outSpinner').classList.remove('visible');

  // Load config for default format + templates
  try {
    const [cfgRes, tplRes] = await Promise.all([fetch('/config'), fetch('/config/templates')]);
    const cfgData = await cfgRes.json();
    const tplData = await tplRes.json();

    // Pre-select default format if configured
    var defaultFmt = cfgData.config && cfgData.config.defaults && cfgData.config.defaults.format;
    if (defaultFmt && ['docx', 'pptx', 'html'].includes(defaultFmt)) {
      selectOutFormat(defaultFmt);
    }

    // Populate template dropdown
    const sel = document.getElementById('tplSelect');
    sel.textContent = '';
    var tplNames = tplData.templates ? Object.keys(tplData.templates) : [];
    if (tplNames.length === 0) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No template';
      sel.appendChild(none);
    } else {
      for (var tname of tplNames) {
        var opt = document.createElement('option');
        opt.value = tname;
        opt.textContent = tname + (tplData.templates[tname].description ? ' - ' + tplData.templates[tname].description : '');
        sel.appendChild(opt);
      }
      // Pre-select first template
      sel.value = tplNames[0];
    }
  } catch {}

  inputView.style.display = 'none';
  outputView.classList.remove('visible');
  stats.classList.remove('visible');
  outboundPanel.classList.add('visible');
  setToolbarEnabled(false);
  btnClear.disabled = false;
}

function selectOutFormat(fmt) {
  selectedOutFormat = fmt;
  document.querySelectorAll('.format-btns button').forEach(b => b.classList.remove('selected'));
  document.getElementById('fmt' + fmt.charAt(0).toUpperCase() + fmt.slice(1)).classList.add('selected');
  document.getElementById('btnConvertOut').disabled = false;
}

async function convertOutbound() {
  if (!pendingMdFile || !selectedOutFormat) return;
  var btn = document.getElementById('btnConvertOut');
  btn.disabled = true;
  document.getElementById('outSpinner').classList.add('visible');

  var form = new FormData();
  form.append('file', pendingMdFile);
  form.append('format', selectedOutFormat);
  var tpl = document.getElementById('tplSelect').value;
  if (tpl) form.append('template', tpl);

  try {
    var res = await fetch('/convert/outbound', { method: 'POST', body: form });
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Conversion failed');
    }
    var blob = await res.blob();
    var baseName = pendingMdFile.name.replace(/\\.[^.]+$/, '') || 'output';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = baseName + '.' + selectedOutFormat;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Downloaded ' + a.download);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    document.getElementById('outSpinner').classList.remove('visible');
    btn.disabled = false;
  }
}

// --- Settings panel ---

function toggleSettings() {
  settingsOpen = !settingsOpen;
  var btn = document.getElementById('btnSettings');

  if (settingsOpen) {
    btn.classList.add('active');
    toolbar.style.display = 'none';
    sourceLabel.classList.remove('visible');
    stats.classList.remove('visible');
    inputView.style.display = 'none';
    outputView.classList.remove('visible');
    outboundPanel.classList.remove('visible');
    settingsPanel.classList.add('visible');
    loadSettings();
  } else {
    btn.classList.remove('active');
    toolbar.style.display = '';
    settingsPanel.classList.remove('visible');
    // Restore previous view
    if (currentContent) {
      outputView.classList.add('visible');
      stats.classList.add('visible');
      sourceLabel.classList.add('visible');
      setToolbarEnabled(true);
    } else {
      inputView.style.display = '';
      dropZone.querySelector('.drop-icon').style.display = '';
      dropZone.querySelector('.drop-text').style.display = '';
    }
  }
}

async function loadSettings() {
  try {
    var res = await fetch('/config');
    var data = await res.json();
    var cfg = data.config || {};
    document.getElementById('cfgFormat').value = (cfg.defaults && cfg.defaults.format) || '';
    document.getElementById('cfgOutputDir').value = (cfg.defaults && cfg.defaults.outputDir) || '';
    document.getElementById('cfgForce').checked = !!(cfg.defaults && cfg.defaults.force);
    document.getElementById('cfgPandocDocx').value = (cfg.pandoc && cfg.pandoc.docx) ? cfg.pandoc.docx.join(' ') : '';
    document.getElementById('cfgPandocPptx').value = (cfg.pandoc && cfg.pandoc.pptx) ? cfg.pandoc.pptx.join(' ') : '';
    document.getElementById('cfgPandocHtml').value = (cfg.pandoc && cfg.pandoc.html) ? cfg.pandoc.html.join(' ') : '';
    document.getElementById('configPath').textContent = data.configPath || '';
    renderTemplateList(cfg.templates || {});
  } catch (err) {
    showToast('Failed to load settings');
  }
}

async function saveConfig() {
  var fmt = document.getElementById('cfgFormat').value;
  var outDir = document.getElementById('cfgOutputDir').value.trim();
  var force = document.getElementById('cfgForce').checked;

  var pandoc = {};
  var docxArgs = document.getElementById('cfgPandocDocx').value.trim();
  var pptxArgs = document.getElementById('cfgPandocPptx').value.trim();
  var htmlArgs = document.getElementById('cfgPandocHtml').value.trim();
  if (docxArgs) pandoc.docx = docxArgs.split(/\\s+/);
  if (pptxArgs) pandoc.pptx = pptxArgs.split(/\\s+/);
  if (htmlArgs) pandoc.html = htmlArgs.split(/\\s+/);

  var body = {
    defaults: {},
    pandoc: Object.keys(pandoc).length ? pandoc : undefined
  };
  if (fmt) body.defaults.format = fmt;
  if (outDir) body.defaults.outputDir = outDir;
  if (force) body.defaults.force = true;

  try {
    var res = await fetch('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    document.getElementById('configPath').textContent = data.configPath || '';
    showToast('Settings saved');
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// --- Template management ---

function renderTemplateList(templates) {
  var list = document.getElementById('tplList');
  list.textContent = '';
  var names = Object.keys(templates);
  if (names.length === 0) {
    var empty = document.createElement('div');
    empty.style.cssText = 'font-size:0.8125rem;color:#525252;padding:0.5rem 0';
    empty.textContent = 'No templates configured.';
    list.appendChild(empty);
    return;
  }
  for (var n of names) {
    var t = templates[n];
    var row = document.createElement('div');
    row.className = 'tpl-row';
    var nm = document.createElement('span');
    nm.className = 'tpl-name';
    nm.textContent = n;
    row.appendChild(nm);
    var badge = document.createElement('span');
    badge.className = 'tpl-badge';
    badge.textContent = t.format;
    row.appendChild(badge);
    var desc = document.createElement('span');
    desc.className = 'tpl-desc';
    desc.textContent = t.description || '';
    row.appendChild(desc);
    var del = document.createElement('button');
    del.className = 'tpl-del';
    del.textContent = 'Delete';
    del.dataset.name = n;
    del.addEventListener('click', function() { deleteTpl(this.dataset.name); });
    row.appendChild(del);
    list.appendChild(row);
  }
}

function showTplForm() {
  document.getElementById('tplForm').style.display = '';
  document.getElementById('btnAddTpl').style.display = 'none';
  document.getElementById('tplName').value = '';
  document.getElementById('tplDesc').value = '';
  document.getElementById('tplFeatToc').checked = false;
  document.getElementById('tplFeatStandalone').checked = false;
  tplRefFile = null;
  document.getElementById('tplRefZone').textContent = 'Drop or click to upload .docx/.pptx';
  document.getElementById('tplRefZone').classList.remove('has-file');
}

function hideTplForm() {
  document.getElementById('tplForm').style.display = 'none';
  document.getElementById('btnAddTpl').style.display = '';
}

var tplRefFile = null;
document.getElementById('tplRefInput').addEventListener('change', function() {
  if (this.files[0]) {
    tplRefFile = this.files[0];
    document.getElementById('tplRefZone').textContent = tplRefFile.name;
    document.getElementById('tplRefZone').classList.add('has-file');
  }
});

async function saveTpl() {
  var name = document.getElementById('tplName').value.trim();
  var format = document.getElementById('tplFormat').value;
  var desc = document.getElementById('tplDesc').value.trim();
  if (!name) { showToast('Template name is required'); return; }

  var features = [];
  if (document.getElementById('tplFeatToc').checked) features.push('toc');
  if (document.getElementById('tplFeatStandalone').checked) features.push('standalone');

  var form = new FormData();
  form.append('name', name);
  form.append('format', format);
  if (desc) form.append('description', desc);
  form.append('features', JSON.stringify(features));
  if (tplRefFile) form.append('referenceFile', tplRefFile);

  try {
    var res = await fetch('/config/templates', { method: 'POST', body: form });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Template "' + name + '" added');
    hideTplForm();
    loadSettings();
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

async function deleteTpl(name) {
  try {
    var res = await fetch('/config/templates/' + encodeURIComponent(name), { method: 'DELETE' });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    showToast('Template "' + name + '" deleted');
    loadSettings();
  } catch (err) {
    showToast('Error: ' + err.message);
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
  document.getElementById('sourceName').textContent = name;
  document.getElementById('sourceSize').textContent = size;
  sourceLabel.classList.add('visible');
  spinner.classList.add('visible');
  dropZone.querySelector('.drop-icon').style.display = 'none';
  dropZone.querySelector('.drop-text').style.display = 'none';
  outboundPanel.classList.remove('visible');
  outputView.classList.remove('visible');
  stats.classList.remove('visible');
  setToolbarEnabled(false);
}

function showResult(data) {
  spinner.classList.remove('visible');
  currentContent = data.content;

  // Stats — DOM methods instead of innerHTML to avoid XSS
  stats.textContent = '';
  var wp = document.createElement('span');
  wp.className = 'stat-pill';
  wp.textContent = data.words.toLocaleString() + ' words';
  stats.appendChild(wp);
  var tp = document.createElement('span');
  tp.className = 'stat-pill';
  tp.textContent = '~' + data.tokens.toLocaleString() + ' tokens';
  stats.appendChild(tp);
  if (data.fits) {
    data.fits.forEach(function(f) {
      var s = document.createElement('span');
      s.className = f.fits ? 'fit-yes' : 'fit-no';
      s.textContent = f.name + ' ' + (f.fits ? '\\u2713' : '\\u2717');
      stats.appendChild(s);
    });
  }
  stats.classList.add('visible');

  outputText.textContent = data.content;
  inputView.style.display = 'none';
  outboundPanel.classList.remove('visible');
  outputView.classList.add('visible');
  setToolbarEnabled(true);
}

function showError(msg) {
  spinner.classList.remove('visible');
  outputText.textContent = 'Error: ' + msg;
  inputView.style.display = 'none';
  outboundPanel.classList.remove('visible');
  outputView.classList.add('visible');
  btnClear.disabled = false;
}

function reset() {
  sourceLabel.classList.remove('visible');
  stats.classList.remove('visible');
  outputView.classList.remove('visible');
  outboundPanel.classList.remove('visible');
  spinner.classList.remove('visible');
  inputView.style.display = '';
  dropZone.querySelector('.drop-icon').style.display = '';
  dropZone.querySelector('.drop-text').style.display = '';
  document.getElementById('urlInput').value = '';
  fileInput.value = '';
  currentContent = '';
  pendingMdFile = null;
  selectedOutFormat = '';
  setToolbarEnabled(false);
}

function setToolbarEnabled(enabled) {
  btnCopy.disabled = !enabled;
  btnDownload.disabled = !enabled;
  btnClear.disabled = !enabled;
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

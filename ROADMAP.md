# docs2llm Roadmap

## Next Up: Distribution

Standalone binary is built. Next step is getting it into users' hands.

- [ ] Homebrew formula or direct download
- [ ] Test on clean machine (no Bun installed)

## macOS App

Native desktop app wrapping the web UI. Thin Swift shell using `WKWebView` — no Electron, no bundled Chromium. Starts the Bun server in the background, opens the UI in a native macOS window.

- [ ] Swift wrapper with WKWebView pointing at localhost
- [ ] Bundle the compiled CLI binary inside the .app
- [ ] App icon, proper Info.plist
- [ ] Menu bar integration (convert from Finder right-click?)
- [ ] DMG or Homebrew cask distribution

## Web UI Gaps

- [ ] Update README web UI section (outbound, clipboard, settings, templates)
- [ ] Show conversion progress for large files
- [ ] Drag-and-drop reference doc directly in outbound panel (skip settings)

---

## Changelog

### 2026-02-24 — Smart Raycast Commands

Three context-aware commands that auto-detect the source (Finder file, text selection, clipboard) and conversion direction (inbound/outbound):

- Smart Copy, Smart Paste, Smart Save with `smart-detect.ts` cascade (PR #42)
- Fix: expanded PATH in Raycast child process so Pandoc is reachable
- Fix: CLI JSON key mismatch (`output` vs `outputPath`) in outbound response parsing
- Fix: narrowed Pandoc error detection to avoid false positives
- 81 vitest tests for smart commands, `bunfig.toml` to isolate from `bun test`

### 2026-02-23 — Raycast Extension

Full Raycast extension for docs2llm (PRs #38, #40, #41):

- Convert File, Convert Clipboard, Copy as Rich Text, Markdown to Rich Text
- Save Clipboard to File, Export Markdown (docx/pptx/html)
- Full inbound/outbound conversion matrix
- Token metadata, shared ResultView, preference-driven output directory

### 2026-02-23 — Standalone Binary

Ship the CLI as a single native executable via `bun build --compile`. No Bun, Node, or npm required at runtime. Only external dependency: Pandoc (outbound conversion only).

- Standalone binary via `bun build --compile` (PR #37)
- Graceful OCR fallback when Tesseract is not installed

### 2026-02-23 — CLI Extraction

- Extracted conversion logic from `cli.ts` into `run.ts` (PR #36)

### 2026-02-23 — CLI Wizard Redesign

Full interactive mode rewrite using @clack/prompts v1.0 (PRs #26-35):

- Autocomplete file picker, progress bars, step trackers, `p.path()` auto-suggest
- `p.box()` displays, config diff preview, improved error messages
- `--yes`, `--json`, `--quiet` flags, non-TTY detection

### 2026-02-22 — Codebase Restructure

- Restructured into `src/` with `core/`, `commands/`, `server/`, `shared/` layers (PR #25)
- Added test suite for 5 core modules (91 tests)
- Web UI extraction — `api.ts` split into `api.ts` + `ui.ts`

### 2026-02-20 — Security Hardening

Full security audit (v1 + v2) and remediation. All findings addressed. See [docs/SECURITY_AUDIT_V2.md](docs/SECURITY_AUDIT_V2.md) for details.

- SSRF protection via `url-safe.ts` (URL validation, private IP blocking, DNS pre-resolution)
- Pandoc flag allowlist (replaced blocklist)
- Server bound to localhost only
- Fetch timeouts, upload size limits, stdin size limits
- Path traversal protection, filename sanitization, temp file collision fix
- DOM-safe rendering (textContent instead of innerHTML)
- Config traversal boundary, template deletion path validation
- Input validation (chunk-size, JSON.parse, ZIP MIME detection)
- Watch mode fixes (recursive, subdirectory structure, race conditions)
- Format flag fixes for stdin and URL conversion

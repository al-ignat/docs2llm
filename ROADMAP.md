# docs2llm Roadmap

## Quality & Extraction

- [ ] Improve scanned PDF detection for image-only PDFs (Kreuzberg reports high quality on image refs)
- [ ] Improve email HTML noise filtering (unsubscribe links, footers)
- [ ] Add more eval fixtures for scanned PDFs and mixed text/image docs

## Raycast Extension

- [ ] Config management + template management (view/create/edit templates)
- [ ] Batch/folder conversion
- [ ] History / recent conversions

## Web UI

- [ ] Show conversion progress for large files
- [ ] Drag-and-drop reference doc directly in outbound panel

## Future

- [ ] Linux binary distribution (GitHub Releases)
- [ ] macOS native app (Swift/WKWebView wrapper)
- [ ] Expanded MCP tool surface

---

## Changelog

### v0.1.0 — Initial Public Release

Quality foundation, extraction pipeline, and distribution infrastructure.

**Extraction Quality**
- Evaluation harness with 24 fixtures across 8 document classes (overall score: 0.95)
- Quality-aware PDF content classifier (replaces simple character-count heuristic)
- Kreuzberg 4.5.1 with MIME-aware config tuning, table injection, PPTX post-processing
- Defuddle integration for web/article HTML extraction
- Swapped HTML pipeline from Pandoc to Kreuzberg (eliminates escaping artifacts)

**Surfaces**
- Unified JSON envelope (`--stdout --json`) for Raycast-CLI integration
- Engine/quality metadata visible in Raycast ResultView
- Engine name shown in CLI normal mode output
- Tesseract error detection in Raycast

**Distribution**
- GitHub Releases with macOS binaries (arm64 + x64)
- Homebrew formula
- npm package

**Earlier Work**
- Standalone binary via `bun build --compile`
- Raycast extension (6 commands with smart auto-detection)
- Web UI with drag-and-drop, URL conversion, clipboard
- MCP server for Claude Desktop / Cursor
- Interactive CLI wizard with @clack/prompts
- Security hardening (SSRF protection, Pandoc allowlist, input validation)
- Config system with templates and per-format Pandoc args

# docs2llm Reference

Full CLI reference, detailed usage, and configuration guide. For a quick overview, see [README.md](../README.md).

## Architecture

```
                   ┌──────────────────────┐
  .pdf .docx       │                      │    Markdown
  .pptx .xlsx ───► │      docs2llm        │ ──► + token count
  .html .eml       │                      │    + LLM fit check
  .png .jpg   ───► │  Kreuzberg (inbound) │ ──► clipboard / file / stdout
  URLs        ───► │  Pandoc (outbound)   │
                   │                      │    .docx .pptx .html
  .md         ───► │                      │ ──► via Pandoc
                   └──────────────────────┘
```

Powered by [Kreuzberg](https://kreuzberg.dev) for document extraction and [Pandoc](https://pandoc.org) for outbound conversion.

## All Commands and Options

```
docs2llm                              Interactive mode
docs2llm <file>                       Convert a file to .md
docs2llm <folder>                     Convert all files in folder (parallel)
docs2llm <url>                        Fetch and convert a web page
docs2llm paste                        Clipboard → Markdown
docs2llm push                         Markdown → rich HTML on clipboard
docs2llm watch <dir> --to <dir>       Auto-convert new files
docs2llm open                         Launch web UI at localhost:3000
docs2llm serve                        Start MCP server (stdio)
docs2llm formats                      List supported formats
docs2llm init [--global]              Create config file
docs2llm config                       View and manage config

Options:
  -f, --format <fmt>        md, json, yaml (inbound) | docx, pptx, html (outbound)
  -t, --template <name>     Use a named template from config
  -o, --output <path>       Output directory
  -y, --force               Overwrite without prompting
  --ocr                     Enable OCR for scanned documents
  --ocr=force               Force OCR even if text is available
  --ocr-lang <code>         OCR language (e.g., deu, fra, jpn)
  --stdin                   Read input from stdin
  --stdout                  Write output to stdout
  --json                    Machine-readable JSON output
  --chunks                  Split output into JSON chunks
  --chunk-size <tokens>     Tokens per chunk (default: 4000)
  --quiet                   Suppress non-essential output
  --                        Pass remaining args to Pandoc
  -h, --help                Show help
```

## Convert Files

```bash
docs2llm report.pdf                    # → report.md
docs2llm report.pdf -f json            # → report.json (with metadata + token count)
docs2llm report.pdf -f yaml            # → report.yaml
docs2llm report.pdf -o ./output/       # save to specific directory
docs2llm ./docs/                       # convert all files in a folder (parallel)
docs2llm report.pdf -y                 # overwrite without prompting
```

## Convert Web Pages

```bash
docs2llm https://example.com/article        # → article.md
docs2llm https://example.com --stdout        # print to terminal
docs2llm https://example.com -o ./research/  # save to directory
```

## OCR for Scanned Documents

Scanned PDFs and images are automatically detected. In interactive mode, you get a prompt:

```
This looks like a scanned document. Extract text with OCR? [Yes / No]
```

In CLI mode, scanned PDFs are retried automatically with OCR. You can also force it:

```bash
docs2llm scan.pdf --ocr               # enable OCR
docs2llm scan.pdf --ocr=force         # force OCR even when text exists
docs2llm scan.pdf --ocr-lang deu      # OCR with German language model
```

OCR requires [Tesseract](https://github.com/tesseract-ocr/tesseract). Install with `brew install tesseract` (macOS).

## Outbound: Markdown → Documents

Convert Markdown files back into rich documents (requires Pandoc):

```bash
docs2llm notes.md -f docx             # → Word document
docs2llm notes.md -f pptx             # → PowerPoint (slides split on headings)
docs2llm notes.md -f html             # → standalone HTML page
docs2llm notes.md -t report           # use a named template from config
docs2llm notes.md -f docx -- --toc --reference-doc=template.docx
```

## Clipboard Workflows

```bash
docs2llm paste                         # interactive: clipboard / stdout / file
docs2llm paste --copy                  # convert and copy clean markdown back
docs2llm paste --stdout                # pipe-friendly output
docs2llm paste -o snippet.md           # save to file

docs2llm push                          # Markdown clipboard → rich HTML clipboard
docs2llm push -f docx -o ./out/        # Markdown clipboard → Word file
```

Works on macOS, Linux (requires `xclip` or `xsel`), and Windows.

## Interactive Mode

Running `docs2llm` with no arguments launches a guided wizard:

1. **File picker** — scans your current directory and `~/Downloads` (last 24h), sorted by recency. Also offers URL input, batch conversion, and manual path entry.
2. **Format picker** — for Markdown files, choose output format (Word, PowerPoint, HTML) or a named template.
3. **Output directory** — choose where to save (current dir, same as input, config default, or custom path).
4. **Conversion** — with progress spinner, token count, and LLM fit indicator.
5. **Post-conversion** — copy to clipboard, open file, or reveal in Finder.
6. **Large document handling** — if output exceeds an LLM's context window, choose to truncate, split into parts, or keep as-is.

## Piping (stdin/stdout)

For shell scripts and automation:

```bash
cat report.pdf | docs2llm --stdin --stdout           # PDF → markdown on stdout
cat report.pdf | docs2llm --stdin --stdout --chunks   # PDF → JSON chunks on stdout
curl -s https://example.com | docs2llm --stdin --stdout  # HTML → markdown
```

Combine `--stdout --json` for a JSON envelope with content + metadata:

```bash
docs2llm report.pdf --stdout --json
# {"success":true,"content":"...","words":928,"tokens":1234,"engine":"kreuzberg","qualityScore":0.85,...}
```

## Watch Mode

Auto-convert files as they appear in a folder:

```bash
docs2llm watch ~/inbox --to ~/converted
# Watching ~/inbox → ~/converted
# Drop files into the folder to auto-convert. Press Ctrl+C to stop.
#
# ✓ report.pdf → report.md (2,340 words, ~3,100 tokens, kreuzberg)
```

## Chunking (for RAG Pipelines)

Split output into chunks sized for embedding models or retrieval:

```bash
docs2llm report.pdf --chunks                    # default: 4000 tokens per chunk
docs2llm report.pdf --chunks --chunk-size=2000  # custom chunk size
docs2llm report.pdf --chunks --stdout           # JSON array to stdout
```

Output format:

```json
[
  { "index": 0, "content": "...", "tokens": 3850 },
  { "index": 1, "content": "...", "tokens": 3920 },
  { "index": 2, "content": "...", "tokens": 2100 }
]
```

## MCP Server (Claude Desktop / Cursor)

Expose docs2llm as an MCP tool server so LLMs can convert documents directly:

```bash
docs2llm serve
```

Starts a stdio-based [Model Context Protocol](https://modelcontextprotocol.io) server with four tools:
- `convert_file` — convert a file to Markdown (with OCR support)
- `convert_url` — fetch and convert a web page
- `convert_to_document` — convert Markdown to Word/PowerPoint/HTML
- `list_formats` — list supported formats

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "docs2llm": {
      "command": "bunx",
      "args": ["docs2llm", "serve"]
    }
  }
}
```

## Web UI

```bash
docs2llm open
```

Opens in your browser (port 3000, or next available). Features:

- **Inbound**: drag and drop any file, paste a URL, or Cmd+V from clipboard
- **Outbound**: convert Markdown to Word, PowerPoint, or HTML with template support
- **Settings**: gear icon opens a config panel — set default format, Pandoc args, manage templates
- Copy to clipboard, download `.md`, token count and LLM fit indicator
- Dark theme

## Config & Templates

Create a config file to set defaults, per-format Pandoc args, and named templates:

```bash
docs2llm init              # creates .docs2llm.yaml in current directory
docs2llm init --global     # creates ~/.config/docs2llm/config.yaml
docs2llm config            # view and manage config interactively
```

Local config overrides global (field-by-field merge). Example `.docs2llm.yaml`:

```yaml
defaults:
  format: docx          # default format for .md smart default
  outputDir: ./out      # null = same dir as input
  force: false          # skip overwrite prompts

pandoc:                 # per-format pandoc args
  html:
    - --toc
  docx:
    - --reference-doc=./templates/report.docx

templates:
  report:
    format: docx
    pandocArgs:
      - --reference-doc=./templates/report.docx
      - --toc
    description: Company report with TOC
  slides:
    format: pptx
    pandocArgs:
      - --slide-level=2
    description: Presentation slides
```

Templates appear in the interactive mode format picker and can be used with `-t`:

```bash
docs2llm notes.md -t report          # uses template's format + pandoc args
docs2llm notes.md -t report -f html  # explicit -f overrides template format
```

## Output Formats

**Markdown** (default) — clean text with tables, headings, and lists.

**JSON** (`-f json`) — structured output with metadata, token stats, and quality score:

```json
{
  "source": "report.docx",
  "mimeType": "application/...",
  "words": 1250,
  "tokens": 1663,
  "metadata": { "page_count": 1, "format_type": "docx" },
  "content": "# Test Report\n\n...",
  "qualityScore": 0.95
}
```

**YAML** (`-f yaml`) — same structure as JSON, in YAML format.

## Supported Formats

Run `docs2llm formats` for the full list.

| Category | Formats |
|----------|---------|
| **Documents** | .docx .doc .pptx .ppt .xlsx .xls .odt .odp .ods .rtf .pdf |
| **Text & Data** | .txt .csv .tsv .html .xml .md |
| **Email** | .eml .msg |
| **eBooks** | .epub .mobi |
| **Images** (via OCR) | .png .jpg .jpeg .tiff .bmp .gif .webp |
| **Code** | Most source code files |
| **Web** | Any URL (HTML pages, remote documents) |

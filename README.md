# convert-the-doc

CLI tool that converts documents (DOCX, PPTX, XLSX, PDF, images, and 75+ other formats) into LLM-friendly text. Runs instantly via `bunx`, with both interactive guided mode and quick one-liner usage.

Powered by [Kreuzberg](https://kreuzberg.dev) (Rust core, native JS bindings).

## Quick Start

```bash
# Convert a file (outputs markdown by default)
bunx convert-the-doc report.docx

# Interactive mode — auto-discovers files to convert
bunx convert-the-doc

# With options
bunx convert-the-doc report.docx -f json -o ./output/

# Convert a whole folder
bunx convert-the-doc ./docs/ -f yaml
```

## Install

Requires [Bun](https://bun.sh).

```bash
# Use directly — no install needed
bunx convert-the-doc

# Or install globally
bun install -g convert-the-doc
```

## Usage

```
convert-the-doc                          Interactive mode
convert-the-doc <file>                   Convert a file to .md
convert-the-doc <folder>                 Convert all files in folder
convert-the-doc <file> -f json -o ./out  Convert with options

Options:
  -f, --format <md|json|yaml>   Output format (default: md)
  -o, --output <path>           Output directory
  -h, --help                    Show this help
```

## Interactive Mode

Running `convert-the-doc` with no arguments launches a smart file picker:

- Scans your current directory for convertible files
- Scans `~/Downloads` for recently modified documents (last 24h)
- Shows results sorted by recency — pick with arrow keys
- Falls back to manual path input (supports drag-and-drop from Finder)

## Output Formats

**Markdown** (default) — extracted text with tables rendered as markdown:

```markdown
# Test Report

This is paragraph one.

| Name  | Value |
| ----- | ----- |
| Alpha | 100   |
```

**JSON** — text + metadata in a structured object:

```json
{
  "source": "report.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "metadata": { "page_count": 1, "format_type": "docx", ... },
  "content": "# Test Report\n\n..."
}
```

**YAML** — same structure as JSON, in YAML format.

## Supported Formats

Kreuzberg supports 75+ formats including:

- **Office**: DOCX, PPTX, XLSX, DOC, PPT, XLS, ODP, ODS, ODT
- **PDF**: with optional OCR support
- **Images**: PNG, JPG, TIFF, BMP, GIF, WebP (via OCR)
- **Text**: TXT, CSV, TSV, HTML, XML, Markdown, RTF
- **Email**: EML, MSG
- **eBooks**: EPUB, MOBI
- **Code**: most source code files

## License

MIT

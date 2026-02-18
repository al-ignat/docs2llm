# convert-the-doc

CLI tool that converts documents (DOCX, PPTX, XLSX, PDF, images, and 75+ other formats) into LLM-friendly text — and converts Markdown back into DOCX, PPTX, or HTML. Runs instantly via `bunx`, with both interactive guided mode and quick one-liner usage.

Powered by [Kreuzberg](https://kreuzberg.dev) for inbound extraction and [Pandoc](https://pandoc.org) for outbound conversion.

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

# Outbound: Markdown → documents (requires Pandoc)
bunx convert-the-doc notes.md -f docx
bunx convert-the-doc notes.md -f pptx
bunx convert-the-doc notes.md -f html
```

## Install

Requires [Bun](https://bun.sh). Outbound conversion (md → docx/pptx/html) also requires [Pandoc](https://pandoc.org):

```bash
brew install pandoc
```

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
convert-the-doc notes.md -f docx         Markdown → Word (outbound)

Options:
  -f, --format <fmt>   Output format (default: md)
                        Inbound:  md, json, yaml
                        Outbound: docx, pptx, html (requires Pandoc)
  -o, --output <path>  Output directory
  -h, --help           Show this help
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

## Outbound Conversion (Markdown → Documents)

When the input is a `.md` file, you can convert it to:

- **DOCX** — Word document via Pandoc
- **PPTX** — PowerPoint presentation via Pandoc (slides split on `---` or headings)
- **HTML** — standalone HTML page via Pandoc

Requires [Pandoc](https://pandoc.org) installed (`brew install pandoc`).

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

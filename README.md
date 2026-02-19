# docs2llm

CLI tool that converts documents (DOCX, PPTX, XLSX, PDF, images, and 75+ other formats) into LLM-friendly text — and converts Markdown back into DOCX, PPTX, or HTML. Runs instantly via `bunx`, with both interactive guided mode and quick one-liner usage.

Powered by [Kreuzberg](https://kreuzberg.dev) for inbound extraction and [Pandoc](https://pandoc.org) for outbound conversion.

## Quick Start

```bash
# Convert a file (outputs markdown by default)
bunx docs2llm report.docx

# Interactive mode — auto-discovers files to convert
bunx docs2llm

# With options
bunx docs2llm report.docx -f json -o ./output/

# Convert a whole folder
bunx docs2llm ./docs/ -f yaml

# Clipboard → Markdown (macOS)
bunx docs2llm paste              # interactive: choose clipboard/stdout/file
bunx docs2llm paste --copy       # convert and copy back to clipboard
bunx docs2llm paste --stdout     # print to terminal
bunx docs2llm paste -o snippet.md

# Outbound: Markdown → documents (requires Pandoc)
bunx docs2llm notes.md -f docx
bunx docs2llm notes.md -f pptx
bunx docs2llm notes.md -f html

# Use a named template from config
bunx docs2llm notes.md -t report

# Pass extra args to Pandoc
bunx docs2llm notes.md -f docx -- --toc --reference-doc=template.docx
```

## Install

Requires [Bun](https://bun.sh). Outbound conversion (md → docx/pptx/html) also requires [Pandoc](https://pandoc.org):

```bash
brew install pandoc
```

```bash
# Use directly — no install needed
bunx docs2llm

# Or install globally
bun install -g docs2llm
```

## Usage

```
docs2llm                          Interactive mode
docs2llm <file>                   Convert a file to .md
docs2llm <folder>                 Convert all files in folder
docs2llm <file> -f json -o ./out  Convert with options
docs2llm notes.md -f docx         Markdown → Word (outbound)
docs2llm notes.md -t report       Use a named template
docs2llm paste                    Clipboard → Markdown (macOS)
docs2llm paste --copy             Convert and copy back to clipboard
docs2llm init                     Create local config
docs2llm init --global            Create global config

Options:
  -f, --format <fmt>      Output format (default: md)
                            Inbound:  md, json, yaml
                            Outbound: docx, pptx, html (requires Pandoc)
  -t, --template <name>   Use a named template from config
  -o, --output <path>     Output directory
  -y, --force             Overwrite output files without prompting
  --                      Pass remaining args to Pandoc (outbound only)
  -h, --help              Show this help
```

## Interactive Mode

Running `docs2llm` with no arguments launches a smart file picker:

- Scans your current directory for convertible files
- Scans `~/Downloads` for recently modified documents (last 24h)
- Shows results sorted by recency — pick with arrow keys
- Falls back to manual path input (supports drag-and-drop from Finder)

## Clipboard → Markdown (macOS)

Copy a chunk of a webpage, then:

```bash
docs2llm paste           # interactive prompt: clipboard / stdout / file
docs2llm paste --copy    # convert HTML and copy clean markdown back
docs2llm paste --stdout  # pipe-friendly output
docs2llm paste -o note.md
```

Prefers the HTML clipboard flavor (preserves headings, links, lists, code blocks). Falls back to plain text if no HTML is present.

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

## Config

Create a config file to set defaults, per-format Pandoc args, and named templates. Run the init wizard:

```bash
docs2llm init            # creates .docs2llm.yaml in current directory
docs2llm init --global   # creates ~/.config/docs2llm/config.yaml
```

Local config overrides global (field-by-field merge). Example `.docs2llm.yaml`:

```yaml
defaults:
  format: docx        # default format for .md smart default
  outputDir: ./out    # null = same dir as input
  force: false        # skip overwrite prompts

pandoc:               # per-format pandoc args
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

Use a template with `-t`:

```bash
docs2llm notes.md -t report    # uses template's format + pandoc args
docs2llm notes.md -t report -f html  # explicit -f overrides template format
```

Templates also appear in the interactive mode format picker.

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

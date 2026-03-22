# Docs2llm

Convert documents to and from LLM-friendly formats. PDF, DOCX, PPTX, XLSX, images, URLs — to clean Markdown. Export Markdown back to Word, PowerPoint, or HTML.

## Prerequisites

Install the [docs2llm](https://github.com/al-ignat/docs2llm) CLI:

```bash
brew install al-ignat/tap/docs2llm
```

Or via Bun: `bun install -g docs2llm`

For outbound conversion (Markdown → Word/PowerPoint/HTML), also install [Pandoc](https://pandoc.org): `brew install pandoc`

## Commands

### View Commands (interactive form UI)

| Command | Description |
|---------|-------------|
| **Convert File** | Pick a file and convert — auto-detects inbound (to Markdown) or outbound (to Word/PowerPoint/HTML) |
| **Convert Clipboard** | Detect clipboard content (HTML, URL, file path, text) and convert bidirectionally |
| **Quick Convert** | Convert the selected Finder file with a pre-filled form |

### Smart Commands (no-view, keyboard-driven)

| Command | Description |
|---------|-------------|
| **Smart Copy** | Auto-detect source (Finder file, text selection, clipboard) and copy converted Markdown |
| **Smart Paste** | Convert clipboard content and paste into the active app, or save to a Finder folder |
| **Smart Save** | Auto-detect source and save the converted file to your output directory |

Smart commands auto-detect the conversion direction: if the source is Markdown, they export to your default format (Word/PowerPoint/HTML). Otherwise, they convert to Markdown.

## Preferences

### Global Preferences

| Preference | Description |
|------------|-------------|
| **Output Directory** | Where saved files and exports go (required) |
| **Binary Path** | Custom path to docs2llm binary. Leave empty to auto-detect. |
| **Pandoc Path** | Custom path to Pandoc binary. Leave empty to auto-detect. |
| **Enable OCR** | Use OCR when converting images and scanned PDFs (requires Tesseract) |
| **Default Template** | Template name for outbound conversions (from `~/.config/docs2llm/config.yaml`) |

### Per-Command Preferences

Each command has its own **Default Inbound Format** (Markdown, JSON, YAML) and **Default Export Format** (Word, PowerPoint, HTML).

## Supported Formats

**Inbound** (to Markdown): PDF, DOCX, PPTX, XLSX, ODT, RTF, HTML, EML, MSG, EPUB, MOBI, CSV, TSV, PNG, JPG, TIFF (OCR), and 60+ more.

**Outbound** (from Markdown): DOCX, PPTX, HTML — with template support via Pandoc.

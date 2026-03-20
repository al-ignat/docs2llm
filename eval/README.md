# Evaluation Harness

Automated quality measurement for docs2llm document extraction.

## Quick Start

```bash
# 1. Drop test documents into class directories
cp invoice.pdf eval/fixtures/pdf-digital/
cp newsletter.html eval/fixtures/article-html/

# 2. Run evaluation
bun run eval:run

# 3. Filter by class or fixture
bun run eval:run --class=pdf-digital
bun run eval:run --fixture=invoice.pdf

# 4. Verbose per-fixture details
bun run eval:run --verbose

# 5. JSON output (for scripting)
bun run eval:run --json
```

## Fixture Structure

```
eval/fixtures/
  article-html/       # Blog posts, news articles
  webpage-html/       # General web pages
  email-html/         # Email exports (Outlook, Gmail)
  pdf-digital/        # Born-digital PDFs
  pdf-scanned/        # Scanned/image PDFs (OCR)
  pptx/               # PowerPoint presentations
  docx/               # Word documents
  xlsx/               # Excel spreadsheets
```

Drop files into the matching directory. All fixture files are **gitignored** — they contain real work artifacts and should not be committed.

## Sidecar Metadata

Optional `{filename}.meta.yaml` alongside any fixture:

```yaml
description: "Q3 financial report with merged table cells"
expect:
  minHeadings: 5
  minTables: 3
  minLinks: 10
  mustContain:
    - "Revenue"
    - "Operating Expenses"
  mustNotContain:
    - "<div>"
    - "class=\"Mso"
  requiresOcr: false
knownIssues:
  - "Merged cells in table 2 collapse into single column"
skip: false  # Set to true to exclude from eval
```

All fields are optional. Without a sidecar, the harness uses sensible defaults based on the document class.

## Scoring Dimensions

| Dimension | What it checks | When applicable |
|-----------|---------------|-----------------|
| **structure** | Heading markers, paragraph separation, heading hierarchy, mustContain strings | Always |
| **tables** | Pipe table syntax, count vs minTables | xlsx always; others if meta specifies |
| **headings** | Heading count vs minHeadings, hierarchy monotonicity | Always |
| **noise** | Residual HTML tags, MSO artifacts, style attributes, mustNotContain strings | Always |
| **ocr** | Non-empty content, alphanumeric ratio > 60%, word count > 20 | pdf-scanned or requiresOcr |
| **links** | Markdown link syntax, count vs minLinks | HTML-source classes only |

**Overall score** = arithmetic mean of applicable dimensions (0–1 scale).

## Output

- **Raw conversions** → `eval/results/{class}/{filename}.md`
- **JSON reports** → `eval/reports/YYYY-MM-DD-HHMMSS.json`
- **CLI table** → stdout with color coding (green >= 0.8, yellow >= 0.5, red < 0.5)

## CI Note

The eval harness is **not** part of `bun run verify` or CI — it requires gitignored fixture documents that won't exist in a clean clone. Run it locally when investigating extraction quality.

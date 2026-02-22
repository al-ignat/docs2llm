# CLI Wizard Mockups — @clack/prompts v1.0 Upgrade

> ASCII mockups for all five main wizard flows after upgrading to `@clack/prompts v1.0`.
> Each mockup shows the full screen state at key moments, using the Clack visual language
> (vertical bar, filled/empty dots, cursor indicators, dimmed hints).
>
> **Reading guide:**
> - `[dim]...[/dim]` — dimmed/gray text
> - `[green]...[/green]` — green/success text
> - `[yellow]...[/yellow]` — yellow/warning text
> - `[red]...[/red]` — red/error text
> - `[inverse]...[/inverse]` — highlighted/selected item (inverted colors)
> - `[cyan]...[/cyan]` — cyan/info accent
> - `>` at line start — cursor/selected item
> - `[NEW]` — element that is new in v1.0, not present in current v0.10

---

## Table of Contents

1. [Mockup 1 — Main Interactive Wizard](#mockup-1--main-interactive-wizard)
2. [Mockup 2 — Batch Conversion Flow](#mockup-2--batch-conversion-flow)
3. [Mockup 3 — Init Wizard](#mockup-3--init-wizard)
4. [Mockup 4 — Config Wizard](#mockup-4--config-wizard)
5. [Mockup 5 — Paste Wizard](#mockup-5--paste-wizard)
6. [Before/After Comparison](#beforeafter-comparison)

---

## Mockup 1 — Main Interactive Wizard

The primary flow: pick a file, choose a format, select output location, convert.
Covers phases 2, 3, 4, and 8 from the upgrade plan.

### Screen 1.1 — Welcome (First Run)

```
┌  Welcome to docs2llm!
│
│  Convert any document to LLM-friendly text.
│  Tip: you can also convert files directly — docs2llm report.pdf
│  Tip: drag a file from Finder into this terminal.
│
│  [NEW] ● Select file   ○ Format   ○ Output   ○ Convert
│
◆  Pick a file to convert:
│  [dim]Start typing to filter files…[/dim]                          [NEW]
│
│  ── Actions ──────────────────────────────────────────────  [NEW]
│    Paste a URL…
│    Browse or enter a path…
│
│  ── Current directory ────────────────────────────────────  [NEW]
│ >  quarterly-report.pdf              [dim]2.3 MB · PDF[/dim]
│    meeting-notes.docx                [dim]45 KB · Word[/dim]
│    slides-draft.pptx                 [dim]1.1 MB · PowerPoint[/dim]
│    README.md                         [dim]8.2 KB · Markdown[/dim]
│    architecture.md                   [dim]12 KB · Markdown[/dim]
│    Convert all files in current folder  [dim]5 files[/dim]
│
│  ── Downloads (last 24h) ────────────────────────────────  [NEW]
│    invoice-march.pdf                 [dim]890 KB · PDF[/dim]
│    screenshot.png                    [dim]340 KB · Image[/dim]
│    onboarding.docx                   [dim]1.4 MB · Word[/dim]
│    Convert all recent downloads      [dim]3 files[/dim]
│
└  [dim]↑/↓ navigate · type to filter · enter to select · ctrl+c to cancel[/dim]
```

**What changed vs. current (v0.10):**
- `[NEW]` Step tracker line shows 4 steps, current step filled
- `[NEW]` Autocomplete: "Start typing to filter files…" placeholder — user can immediately type to narrow the list (Phase 2.1)
- `[NEW]` Native selectable groups with `selectableGroups: false` replace `__sep__` hack — "Current directory" and "Downloads" are non-selectable headers (Phase 2.1, 2.2)
- `[NEW]` "Actions" group separates meta-actions (URL, browse) from file list
- Removed: recursive depth workaround for accidental separator selection

### Screen 1.2 — File Picker with Type-Ahead Filtering

User has typed `rep` to filter:

```
┌  Welcome to docs2llm!
│
│  [NEW] ● Select file   ○ Format   ○ Output   ○ Convert
│
◆  Pick a file to convert:
│  rep█                                                       [NEW]
│
│  ── Current directory ────────────────────────────────────
│ >  quarterly-report.pdf              [dim]2.3 MB · PDF[/dim]
│
│  [dim]1 result · clear to show all[/dim]                             [NEW]
│
└  [dim]↑/↓ navigate · enter to select · ctrl+c to cancel[/dim]
```

**What changed:** Autocomplete filters in real-time. Only matching files shown. Non-matching groups and their headers auto-hide. (Phase 2.1)

### Screen 1.3 — Path Prompt (Browse or enter a path)

User selected "Browse or enter a path…":

```
┌  docs2llm
│
│  [NEW] ● Select file   ○ Format   ○ Output   ○ Convert
│
◇  Pick a file to convert:
│  [dim]Browse or enter a path…[/dim]
│
◆  File path:                                                 [NEW]
│  ~/Documents/█
│  [dim]┌────────────────────────────────────────────┐[/dim]
│  [dim]│[/dim]  projects/                                  [dim]│[/dim]
│  [dim]│[/dim]  reports/                                    [dim]│[/dim]
│  [dim]│[/dim]  taxes-2025.pdf                              [dim]│[/dim]
│  [dim]│[/dim]  notes.md                                    [dim]│[/dim]
│  [dim]└────────────────────────────────────────────┘[/dim]
│
└  [dim]tab to complete · enter to confirm · ctrl+c to cancel[/dim]
```

**What changed:** `p.path()` replaces `p.text()` — provides real filesystem auto-suggest dropdown as user types. Tab-completion for directories. Inline validation if path doesn't exist. (Phase 2.3)

### Screen 1.4 — Format Picker (Outbound: .md → format)

File is a .md file, so format picker appears. User has 2 saved templates:

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ● Format   ○ Output   ○ Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.md[/green]
│
◆  Output format:
│
│  ── Templates ───────────────────────────────────────────  [NEW]
│ >  report                            [dim]docx · Company report with TOC[/dim]
│    slides                            [dim]pptx · Presentation deck[/dim]
│
│  ── Formats ─────────────────────────────────────────────  [NEW]
│    Word                              [dim].docx[/dim]
│    PowerPoint                        [dim].pptx[/dim]
│    HTML                              [dim].html[/dim]
│
└  [dim]↑/↓ navigate · enter to select · ctrl+c to cancel[/dim]
```

**What changed:**
- `[NEW]` Step tracker updated — step 1 shows checkmark, step 2 is active
- `[NEW]` Native selectable groups replace `__sep_tpl__` / `__sep_fmt__` separators — group headers cannot be accidentally selected (Phase 2.4)
- Template descriptions shown inline as hints
- Short list (< 8 items) stays as `p.select()` — no autocomplete needed

### Screen 1.5 — Format Picker (Inbound: .pdf → markdown)

File is a non-.md file — format is auto-detected, picker is skipped entirely:

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ● Output   ○ Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.pdf[/green]
│
◇  Output format:                                            [NEW]
│  [green]Markdown[/green] [dim](auto-detected from .pdf input)[/dim]
│
◆  Save to:
│ >  Current directory                 [dim]~/projects/acme[/dim]
│    Same as input file                [dim]~/Downloads[/dim]
│    Custom path…
│
└  [dim]↑/↓ navigate · enter to select · ctrl+c to cancel[/dim]
```

**What changed:**
- `[NEW]` Auto-detected format now shows as a completed step with explanation text instead of silently skipping — user sees what happened (Phase 4.2)
- `[NEW]` Step tracker shows steps 1-2 complete, step 3 active

### Screen 1.6 — Output Directory with Path Prompt

User selected "Custom path…":

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ● Output   ○ Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.pdf[/green]
│
◇  Output format:
│  [green]Markdown[/green]
│
◇  Save to:
│  [dim]Custom path…[/dim]
│
◆  Output directory:                                          [NEW]
│  ./converted/█
│  [dim]┌────────────────────────────────────────────┐[/dim]
│  [dim]│[/dim]  converted/                                 [dim]│[/dim]
│  [dim]│[/dim]  output/                                    [dim]│[/dim]
│  [dim]│[/dim]  docs/                                      [dim]│[/dim]
│  [dim]└────────────────────────────────────────────┘[/dim]
│
└  [dim]tab to complete · enter to confirm[/dim]
```

**What changed:** `p.path({ type: "directory" })` with auto-suggest replaces `p.text()`. (Phase 5.2)

### Screen 1.7 — Overwrite Confirmation (Enhanced)

Output file already exists:

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ✔ Output   ● Convert
│
│  [yellow]▲[/yellow]  File already exists                                  [NEW]
│  [yellow]│[/yellow]  Path:      ./converted/quarterly-report.md
│  [yellow]│[/yellow]  Size:      245 KB
│  [yellow]│[/yellow]  Modified:  2 hours ago
│
◆  Overwrite this file?
│  [inverse] Yes [/inverse] / No
│
└  [dim]enter to confirm · ctrl+c to cancel[/dim]
```

**What changed:** Overwrite confirmation now shows file metadata (size, modification time) so user understands what will be lost. (Phase 4.3)

### Screen 1.8 — Conversion with taskLog

Long conversion in progress:

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ✔ Output   ● Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.pdf[/green]
│
◇  Output format:
│  [green]Markdown[/green]
│
◇  Save to:
│  [green]./converted/[/green]
│
◓  Converting…                                                [NEW]
│  ┌─────────────────────────────────────────────────────┐
│  │  Extracting text from PDF…                          │
│  │  Processing page 3 of 12…                           │
│  │  Running OCR on scanned page 4…                     │
│  └─────────────────────────────────────────────────────┘
│
└  [dim]ctrl+c to cancel[/dim]
```

**What changed:** `p.taskLog()` replaces `p.spinner()` for long conversions — shows real-time subprocess output (extraction progress, OCR status) that clears on completion. (Phase 3.2)

### Screen 1.9 — Conversion Complete with Token Stats

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ✔ Output   ✔ Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.pdf[/green]
│
◇  Output format:
│  [green]Markdown[/green]
│
◇  Save to:
│  [green]./converted/[/green]
│
│  [green]●[/green]  quarterly-report.pdf → quarterly-report.md [dim](4,523 tokens)[/dim]
│
│  Fits in: [green]Claude 3.5 Sonnet[/green], [green]GPT-4[/green], [green]Gemini Pro[/green]
│
◆  What next?
│ >  Copy to clipboard
│    Open file
│    Open in Finder
│    Done
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

**What changed:**
- `[NEW]` Step tracker — all 4 steps complete with checkmarks
- taskLog output cleared, replaced with clean one-line success message
- Token stats and LLM fit shown inline (unchanged from current)
- Post-conversion menu (unchanged from current)

### Screen 1.10 — Scanned Document Detection + OCR

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ✔ Output   ● Convert
│
│  [yellow]▲[/yellow]  Scanned document detected
│  [yellow]│[/yellow]  Only 23 characters extracted — this PDF likely contains
│  [yellow]│[/yellow]  scanned images rather than selectable text.            [NEW]
│
◆  Extract text with OCR?
│  [inverse] Yes (recommended) [/inverse] / No
│
└  [dim]enter to confirm[/dim]
```

**What changed:** Warning message now explains *why* the document was detected as scanned (character count), helping users understand the suggestion. (Phase 4.2)

### Screen 1.11 — Token Limit Action

Content exceeds model context window:

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Format   ✔ Output   ● Convert
│
│  [green]●[/green]  quarterly-report.pdf → quarterly-report.md [dim](128,450 tokens)[/dim]
│
│  [yellow]▲[/yellow]  This is ~128,450 tokens — too long for Claude 3.5 Sonnet.
│
◆  What to do?
│ >  Shorten (truncate)                [dim]trim to ~100,000 tokens[/dim]
│    Split into 2 parts                [dim]each ~64,225 tokens[/dim]
│    Keep as-is
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

### Screen 1.12 — Graceful Cancellation

User pressed Ctrl+C at any point:

```
┌  docs2llm
│
│  ✔ Select file   ✔ Format   ○ Output   ○ Convert
│
◇  Pick a file to convert:
│  [green]quarterly-report.pdf[/green]
│
◇  Output format:
│  [green]Markdown[/green]
│
◆  Save to:
│
└  Operation cancelled.                                       [NEW]
```

**What changed:** Consistent cancellation message via shared `guard()` helper. Step tracker shows exactly how far the user got. (Phase 4.1)

---

## Mockup 2 — Batch Conversion Flow

Converting all files in a directory. Covers phases 3 and 8.

### Screen 2.1 — Batch Summary Before Action

User selected "Convert all files in current folder":

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ● Confirm   ○ Convert
│
│  [cyan]■[/cyan]  Batch Conversion                                      [NEW]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  Files:      12 documents
│  [cyan]│[/cyan]  Formats:    7 PDF, 3 DOCX, 1 PPTX, 1 HTML
│  [cyan]│[/cyan]  Output:     Markdown (next to each input file)
│  [cyan]│[/cyan]  OCR:        Auto-detect (will prompt if scanned)
│
◆  Start conversion?
│  [inverse] Yes [/inverse] / No
│
└  [dim]enter to start · ctrl+c to cancel[/dim]
```

**What changed:** Summary screen shows what will happen *before* committing. User can review file count, formats detected, output location, and OCR policy. (Phase 3.4)

### Screen 2.2 — Batch Conversion In Progress

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Confirm   ● Convert
│
│  Converting 5 of 12 files…                                  [NEW]
│  ████████████████████░░░░░░░░░░░░░░░░░░░░  42%
│
│  [green]✔[/green]  quarterly-report.pdf → quarterly-report.md [dim](4,523 tokens)[/dim]
│  [green]✔[/green]  meeting-notes.docx → meeting-notes.md [dim](892 tokens)[/dim]
│  [green]✔[/green]  slides.pptx → slides.md [dim](1,204 tokens)[/dim]
│  [green]✔[/green]  index.html → index.md [dim](356 tokens)[/dim]
│  ◓  invoice.pdf…
│  [dim]·[/dim]  contract.pdf
│  [dim]·[/dim]  proposal.docx
│  [dim]·[/dim]  handbook.pdf
│  [dim]·[/dim]  onboarding.pdf
│  [dim]·[/dim]  policy.pdf
│  [dim]·[/dim]  readme.html
│
└  [dim]ctrl+c to cancel[/dim]
```

**What changed:**
- `[NEW]` Progress bar with percentage replaces spinner — user sees exactly how far along the batch is (Phase 3.1)
- `[NEW]` Per-file status: checkmark for done, spinner for active, dot for pending
- `[NEW]` Token counts shown per file as they complete
- Files processed in parallel (up to 4), but displayed sequentially for clarity

### Screen 2.3 — Batch Conversion with OCR Auto-Retry

```
┌  docs2llm
│
│  Converting 8 of 12 files…
│  ██████████████████████████████░░░░░░░░░░  67%
│
│  [green]✔[/green]  quarterly-report.pdf → quarterly-report.md [dim](4,523 tokens)[/dim]
│  [green]✔[/green]  meeting-notes.docx → meeting-notes.md [dim](892 tokens)[/dim]
│  [green]✔[/green]  slides.pptx → slides.md [dim](1,204 tokens)[/dim]
│  [green]✔[/green]  index.html → index.md [dim](356 tokens)[/dim]
│  [green]✔[/green]  invoice.pdf → invoice.md [dim](712 tokens)[/dim]
│  [green]✔[/green]  contract.pdf → contract.md [dim](3,891 tokens)[/dim]
│  [red]✘[/red]  proposal.docx [dim]— Pandoc not found[/dim]
│  [yellow]↻[/yellow]  handbook.pdf [dim]— scanned, retrying with OCR…[/dim]          [NEW]
│  ◓  onboarding.pdf…
│  [dim]·[/dim]  policy.pdf
│  [dim]·[/dim]  readme.html
│
└  [dim]ctrl+c to cancel[/dim]
```

**What changed:**
- `[NEW]` OCR auto-retry shown inline with yellow retry icon — no interrupting prompt
- Failed files show red X with reason
- Batch continues despite individual failures

### Screen 2.4 — Batch Conversion Complete

```
┌  docs2llm
│
│  [NEW] ✔ Select file   ✔ Confirm   ✔ Convert
│
│  Converting 12 of 12 files…
│  ████████████████████████████████████████  100%              [NEW]
│
│  [green]✔[/green]  quarterly-report.pdf → quarterly-report.md [dim](4,523 tokens)[/dim]
│  [green]✔[/green]  meeting-notes.docx → meeting-notes.md [dim](892 tokens)[/dim]
│  [green]✔[/green]  slides.pptx → slides.md [dim](1,204 tokens)[/dim]
│  [green]✔[/green]  index.html → index.md [dim](356 tokens)[/dim]
│  [green]✔[/green]  invoice.pdf → invoice.md [dim](712 tokens)[/dim]
│  [green]✔[/green]  contract.pdf → contract.md [dim](3,891 tokens)[/dim]
│  [red]✘[/red]  proposal.docx [dim]— Pandoc not found[/dim]
│  [green]✔[/green]  handbook.pdf → handbook.md [dim](8,102 tokens · OCR)[/dim]
│  [green]✔[/green]  onboarding.pdf → onboarding.md [dim](2,456 tokens)[/dim]
│  [green]✔[/green]  policy.pdf → policy.md [dim](1,890 tokens)[/dim]
│  [green]✔[/green]  readme.html → readme.md [dim](445 tokens)[/dim]
│  [green]✔[/green]  screenshot.png → screenshot.md [dim](12 tokens · OCR)[/dim]
│
│  [green]■[/green]  Results                                               [NEW]
│  [green]│[/green]  Converted:   11 files [dim](29,483 total tokens)[/dim]
│  [green]│[/green]  Failed:      1 file
│  [green]│[/green]  OCR used:    2 files
│
└  Done!
```

**What changed:**
- `[NEW]` Progress bar reaches 100%
- `[NEW]` Results summary box: total converted, failures, OCR count, aggregate token count (Phase 3.4)
- Each file shows its individual outcome — user can scan for failures
- OCR-processed files marked with `· OCR` hint

---

## Mockup 3 — Init Wizard

First-time setup: configure defaults and create templates.
Covers phases 5 and 8.

### Screen 3.1 — Init Welcome + Defaults

```
┌  docs2llm init
│
│  [NEW] ● Defaults   ○ Templates   ○ Save
│
◆  Default output format for Markdown files:
│ >  Word                              [dim].docx[/dim]
│    PowerPoint                        [dim].pptx[/dim]
│    HTML                              [dim].html[/dim]
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

**What changed:**
- `[NEW]` Step tracker shows 3-step flow (Defaults → Templates → Save)

### Screen 3.2 — Output Directory with Path Prompt

```
┌  docs2llm init
│
│  [NEW] ● Defaults   ○ Templates   ○ Save
│
◇  Default output format:
│  [green]Word (.docx)[/green]
│
◆  Output directory:
│ >  Same as input file                [dim]files saved next to source[/dim]
│    Custom path                       [dim]always save to a fixed directory[/dim]
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

### Screen 3.3 — Custom Output Directory (Path Prompt)

User selected "Custom path":

```
┌  docs2llm init
│
│  [NEW] ● Defaults   ○ Templates   ○ Save
│
◇  Default output format:
│  [green]Word (.docx)[/green]
│
◇  Output directory:
│  [dim]Custom path[/dim]
│
◆  Output directory path:                                     [NEW]
│  ~/Documents/converted/█
│  [dim]┌────────────────────────────────────────────┐[/dim]
│  [dim]│[/dim]  converted/                                 [dim]│[/dim]
│  [dim]│[/dim]  exports/                                   [dim]│[/dim]
│  [dim]│[/dim]  output/                                    [dim]│[/dim]
│  [dim]└────────────────────────────────────────────┘[/dim]
│
└  [dim]tab to complete · enter to confirm[/dim]
```

**What changed:** `p.path({ type: "directory" })` with filesystem auto-suggest replaces `p.text()`. (Phase 5.2)

### Screen 3.4 — Template Creation Prompt

```
┌  docs2llm init
│
│  [NEW] ✔ Defaults   ● Templates   ○ Save
│
◇  Default output format:
│  [green]Word (.docx)[/green]
│
◇  Output directory:
│  [green]~/Documents/converted/[/green]
│
◆  Create a named template?
│  Yes / [inverse] No [/inverse]
│  [dim]Templates let you save format + Pandoc settings for reuse.[/dim]  [NEW]
│
└  [dim]enter to confirm[/dim]
```

**What changed:**
- `[NEW]` Step tracker updated — Defaults complete, Templates active
- `[NEW]` Hint text explains what templates are for (first-time users may not know)

### Screen 3.5 — Template Name + Format + Description

User chose to create a template:

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
◆  Template name:
│  report█
│  [dim]e.g. "report", "slides", "memo" — no spaces[/dim]
│
└  [dim]enter to confirm[/dim]
```

Then format and description:

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
◇  Template name:
│  [green]report[/green]
│
◇  Template output format:
│  [green]Word (.docx)[/green]
│
◆  Description (optional):
│  Company report with TOC and branding█
│  [dim]Shown in the format picker to help you remember this template[/dim]  [NEW]
│
└  [dim]enter to confirm · enter empty to skip[/dim]
```

**What changed:**
- `[NEW]` Hint on description field explains where the description appears (in the format picker) — gives context for what to write

### Screen 3.6 — Template Features (Multiselect)

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
◇  Template name:
│  [green]report[/green]
│
◇  Template output format:
│  [green]Word (.docx)[/green]
│
◇  Description:
│  [green]Company report with TOC and branding[/green]
│
◆  What should this template include?
│  [green]◼[/green]  Table of contents
│  ◻  Use a reference document (company .docx template)
│
│  [dim]space to toggle · enter to confirm · enter empty to skip[/dim]
│
└
```

### Screen 3.7 — Reference Document Path (Path Prompt)

User toggled "Use a reference document":

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
◇  What should this template include?
│  [green]Table of contents, Reference document[/green]
│
◆  Path to reference document:                                [NEW]
│  ./templates/█
│  [dim]┌────────────────────────────────────────────┐[/dim]
│  [dim]│[/dim]  templates/                                 [dim]│[/dim]
│  [dim]│[/dim]  company-template.docx                      [dim]│[/dim]
│  [dim]│[/dim]  brand-guide.docx                           [dim]│[/dim]
│  [dim]└────────────────────────────────────────────┘[/dim]
│
└  [dim]tab to complete · enter to confirm[/dim]
```

**What changed:** `p.path({ type: "file" })` replaces `p.text()` — filesystem auto-suggest for .docx templates. (Phase 5.1)

### Screen 3.8 — Advanced Pandoc Args

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
◇  Path to reference document:
│  [green]./templates/company-template.docx[/green]
│
◆  Advanced: additional Pandoc args?
│  Yes / [inverse] No [/inverse]
│
└  [dim]enter to confirm[/dim]
```

If yes:

```
◆  Pandoc args:                                               [NEW]
│  --shift-heading-level-by=-1█
│  [dim]Space-separated. Use = syntax for values (--key=value).[/dim]
│
└  [dim]enter to confirm[/dim]
```

**What changed:** `[NEW]` Improved hint warns about quoting limitation and suggests `=` syntax. (Phase 5.3)

### Screen 3.9 — Template Loop + Save

```
┌  docs2llm init
│
│  ✔ Defaults   ● Templates   ○ Save
│
│  [green]●[/green]  Template "report" added.
│
◆  Create another template?
│  Yes / [inverse] No [/inverse]
│
└  [dim]enter to confirm[/dim]
```

User says no → config preview and save:

```
┌  docs2llm init
│
│  [NEW] ✔ Defaults   ✔ Templates   ● Save
│
│  Config to write to .docs2llm.yaml:                         [NEW]
│  ┌─────────────────────────────────────────────────────┐
│  │  defaults:                                          │
│  │    format: docx                                     │
│  │    outputDir: ~/Documents/converted/                │
│  │                                                     │
│  │  templates:                                         │
│  │    report:                                          │
│  │      format: docx                                   │
│  │      description: Company report with TOC and ...   │
│  │      pandocArgs:                                    │
│  │        - --toc                                      │
│  │        - --reference-doc=./templates/company-te...  │
│  │        - --shift-heading-level-by=-1                │
│  └─────────────────────────────────────────────────────┘
│
└  Config saved to .docs2llm.yaml
```

**What changed:**
- `[NEW]` Step tracker shows all 3 steps complete
- Config preview shown in a visual box (uses `p.note()` or styled `p.log.info()`)

---

## Mockup 4 — Config Wizard

View and edit existing configuration.
Covers phases 5 and 8.

### Screen 4.1 — Config Sources + Active Summary

```
┌  docs2llm config
│
│  [cyan]■[/cyan]  Config sources
│  [cyan]│[/cyan]  Local:   .docs2llm.yaml [dim](active)[/dim]
│  [cyan]│[/cyan]  Global:  ~/.config/docs2llm/config.yaml
│
│  [cyan]■[/cyan]  Active configuration
│  [cyan]│[/cyan]  Format:      docx
│  [cyan]│[/cyan]  Output dir:  ~/Documents/converted/
│  [cyan]│[/cyan]  Force:       no
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  Templates:
│  [cyan]│[/cyan]    report     [dim]docx · Company report with TOC and branding[/dim]
│  [cyan]│[/cyan]    slides     [dim]pptx · Presentation deck[/dim]
│
◆  What would you like to do?
│ >  Add a template
│    Edit defaults
│    Open config file                  [dim].docs2llm.yaml[/dim]
│    Done
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

### Screen 4.2 — Edit Defaults

User selected "Edit defaults":

```
┌  docs2llm config
│
◇  What would you like to do?
│  [dim]Edit defaults[/dim]
│
◆  Default output format for Markdown files:
│    Word                              [dim].docx[/dim]
│ >  PowerPoint                        [dim].pptx[/dim]  [dim](changing from docx)[/dim]
│    HTML                              [dim].html[/dim]
│
└  [dim]↑/↓ navigate · enter to select · current: docx[/dim]       [NEW]
```

**What changed:**
- `[NEW]` Current/existing value shown as context — "current: docx" in the footer and "(changing from docx)" hint on non-current selections. User always knows what they're changing *from*.

### Screen 4.3 — Config Diff Preview Before Save

User changed format from docx to pptx:

```
┌  docs2llm config
│
│  [cyan]■[/cyan]  Changes                                                [NEW]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  defaults.format:   [red]docx[/red] → [green]pptx[/green]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  [dim]1 change · templates unchanged[/dim]
│
◆  Save to .docs2llm.yaml?
│  [inverse] Yes [/inverse] / No
│
└  [dim]enter to confirm[/dim]
```

**What changed:** `[NEW]` Config diff preview shows exactly what changed before saving, instead of dumping the entire YAML. Follows "summary before final action" best practice. (Phase 5.4)

### Screen 4.4 — Config Diff with New Template

User added a template:

```
┌  docs2llm config
│
│  [cyan]■[/cyan]  Changes                                                [NEW]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  templates.memo:    [green](new)[/green]
│  [cyan]│[/cyan]    format:          docx
│  [cyan]│[/cyan]    description:     Quick internal memo
│  [cyan]│[/cyan]    pandocArgs:      --toc
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  [dim]1 addition · defaults unchanged[/dim]
│
◆  Save to .docs2llm.yaml?
│  [inverse] Yes [/inverse] / No
│
└  [dim]enter to confirm[/dim]
```

### Screen 4.5 — No Config Exists (First Run)

```
┌  docs2llm config
│
│  [yellow]▲[/yellow]  No config files found.
│
◆  Create one now?
│  [inverse] Yes [/inverse] / No
│  [dim]This will create .docs2llm.yaml in the current directory.[/dim]  [NEW]
│
└  [dim]enter to confirm[/dim]
```

**What changed:**
- `[NEW]` Hint explains exactly what file will be created and where — no surprise side effects

### Screen 4.6 — Open Config File (Improved)

User selected "Open config file":

```
┌  docs2llm config
│
◇  What would you like to do?
│  [dim]Open config file[/dim]
│
│  Config file: .docs2llm.yaml
│  [dim]Open with your editor:[/dim]
│  [dim]  $EDITOR .docs2llm.yaml[/dim]
│  [dim]  code .docs2llm.yaml[/dim]
│  [dim]  nano .docs2llm.yaml[/dim]
│
└  [dim]Edit the YAML directly for full control over all settings.[/dim]
```

---

## Mockup 5 — Paste Wizard

Convert clipboard HTML to Markdown.
Covers phase 6.

### Screen 5.1 — Clipboard Conversion with Preview

```
┌  docs2llm paste
│
│  ◓  Converting clipboard HTML…
│
```

Then, after conversion:

```
┌  docs2llm paste
│
│  [green]●[/green]  Clipboard → Markdown
│
│  [cyan]■[/cyan]  Preview                                                [NEW]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  # Q1 2026 Planning Meeting
│  [cyan]│[/cyan]  ## Attendees
│  [cyan]│[/cyan]  Alice Chen, Bob Martinez, Charlie Kim
│  [cyan]│[/cyan]  …
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  [dim]247 words · 1,523 characters[/dim]
│
◆  Output:
│ >  Copy to clipboard
│    Print to terminal
│    Save to file…
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

**What changed:**
- `[NEW]` Content preview shows first 3 lines of converted markdown + word/character count — user sees the conversion result before choosing an action (Phase 6.3)
- Gives confidence that the conversion worked correctly

### Screen 5.2 — Save to File (Path Prompt)

User selected "Save to file…":

```
┌  docs2llm paste
│
│  [green]●[/green]  Clipboard → Markdown
│
◇  Output:
│  [dim]Save to file…[/dim]
│
◆  Output file:                                               [NEW]
│  ./meeting-notes█.md
│  [dim]┌────────────────────────────────────────────┐[/dim]
│  [dim]│[/dim]  meeting-notes.md                           [dim]│[/dim]
│  [dim]│[/dim]  meeting-notes-v2.md                        [dim]│[/dim]
│  [dim]│[/dim]  notes/                                     [dim]│[/dim]
│  [dim]└────────────────────────────────────────────┘[/dim]
│
└  [dim]tab to complete · enter to save[/dim]
```

**What changed:** `p.path()` replaces `p.text()` for the save path — filesystem auto-suggest helps find existing files or navigate to the right directory. (Phase 6.2)

### Screen 5.3 — Save Complete

```
┌  docs2llm paste
│
│  [green]●[/green]  Clipboard → Markdown
│
◇  Output:
│  [dim]Save to file…[/dim]
│
◇  Output file:
│  [green]./meeting-notes.md[/green]
│
└  Saved to ./meeting-notes.md
```

### Screen 5.4 — Copy to Clipboard Complete

```
┌  docs2llm paste
│
│  [green]●[/green]  Clipboard → Markdown
│
│  [green]●[/green]  Copied to clipboard
│
└  Paste into your editor or LLM chat.                        [NEW]
```

**What changed:**
- `[NEW]` Outro message suggests a next action — helps first-time users know what to do with the result

### Screen 5.5 — No HTML in Clipboard

```
┌  docs2llm paste
│
│  [yellow]▲[/yellow]  No HTML in clipboard — using plain text as-is.
│
│  [cyan]■[/cyan]  Preview                                                [NEW]
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  Just some plain text that was copied
│  [cyan]│[/cyan]  from a terminal or text editor.
│  [cyan]│[/cyan]  …
│  [cyan]│[/cyan]
│  [cyan]│[/cyan]  [dim]12 words · 78 characters[/dim]
│
◆  Output:
│ >  Copy to clipboard
│    Print to terminal
│    Save to file…
│
└  [dim]↑/↓ navigate · enter to select[/dim]
```

### Screen 5.6 — Empty Clipboard

```
┌  docs2llm paste
│
│  [red]■[/red]  Clipboard is empty.                                    [NEW]
│  [red]│[/red]  Copy some text or HTML first, then run docs2llm paste.
│
└
```

**What changed:**
- `[NEW]` Error message now includes a recovery suggestion — tells user what to do next (Phase 4, "smart error messages")

### Screen 5.7 — Non-Interactive Flags (--copy, --stdout, -o)

These bypass the wizard entirely. No Clack UI is shown:

```bash
$ docs2llm paste --copy
✓ Copied to clipboard

$ docs2llm paste --stdout
# Q1 2026 Planning Meeting
## Attendees
Alice Chen, Bob Martinez, Charlie Kim
...

$ docs2llm paste -o notes.md
✓ Saved to notes.md

$ docs2llm paste --copy --json                                [NEW]
{"success":true,"format":"md","words":247,"characters":1523}
```

**What changed:**
- `[NEW]` `--json` flag outputs machine-readable JSON instead of human-readable text (Phase 7.2)

---

## Before/After Comparison

Summary of every visual change across all 5 mockups, mapped to upgrade plan phases:

| Element | Before (v0.10) | After (v1.0) | Plan Phase |
|---------|----------------|--------------|------------|
| **Step tracker** | Not present | `● Step  ○ Step  ○ Step` line at top | Phase 8 |
| **File picker** | `p.select()` with flat list | `p.autocomplete()` with type-ahead filtering | Phase 2.1 |
| **Group headers** | `__sep__` magic values (selectable, causes bugs) | Native `selectableGroups: false` headers | Phase 2.2 |
| **Path input** | `p.text()` with manual typing | `p.path()` with filesystem auto-suggest | Phase 2.3, 5.1, 5.2, 6.2 |
| **Batch progress** | Spinner only | Progress bar with percentage + per-file status | Phase 3.1 |
| **Long conversion** | Spinner with no detail | `p.taskLog()` showing real-time subprocess output | Phase 3.2 |
| **Batch start** | Starts immediately | Summary screen with confirm before starting | Phase 3.4 |
| **Batch results** | "N converted, M failed" one-liner | Results box with totals, OCR count, aggregate tokens | Phase 3.4 |
| **Cancellation** | Inconsistent messages per wizard | Shared `guard()` helper, consistent message | Phase 4.1 |
| **Spinner messages** | Inconsistent formats | Standardized: `"Verb…"` → `"input → output (stats)"` | Phase 4.2 |
| **Auto-detect notice** | Silent skip | Shows completed step with `(auto-detected)` text | Phase 4.2 |
| **Overwrite confirm** | "Overwrite?" yes/no | Shows file size + modification time before asking | Phase 4.3 |
| **OCR detection** | "Scanned document detected" | Explains why (character count) + "(recommended)" label | Phase 4.2 |
| **Reference doc path** | `p.text()` | `p.path({ type: "file" })` with auto-suggest | Phase 5.1 |
| **Pandoc args hint** | No guidance | Warns about space limitation, suggests `=` syntax | Phase 5.3 |
| **Config save** | Dumps full YAML | Shows diff of what changed, then confirms | Phase 5.4 |
| **Paste preview** | No preview | First 3 lines + word/character count | Phase 6.3 |
| **Paste save path** | `p.text()` | `p.path()` with auto-suggest | Phase 6.2 |
| **Error messages** | Statement only | Statement + recovery suggestion | Phase 4 |
| **Confirm hints** | No extra context | Explains what will happen (file path, consequences) | Phase 4.3 |
| **Description hints** | No guidance | Explains where the value will be shown | Phase 5 |
| **`--json` output** | Not available | Machine-readable JSON for all commands | Phase 7.2 |

### Unchanged Elements (Already Good)

These elements remain the same — they already follow best practices:

- `p.intro()` / `p.outro()` framing
- `p.log.info/warn/error/success()` status messages
- `p.confirm()` for yes/no decisions
- `p.multiselect()` for template features
- Smart defaults (pre-selecting existing config values)
- File size + type hints on file picker options
- Token stats + LLM fit display after conversion
- Post-conversion menu (copy/open/finder/done)
- Sequential one-question-at-a-time flow
- Config precedence (flags > config > defaults)

# con-the-doc — Wizard Wireframes

All interactive flows as currently implemented. Entry points: `con-the-doc`, `con-the-doc init`, `con-the-doc config`.

---

## 1. Launch Wizard (`con-the-doc`)

The main conversion flow. Entry: `interactive.ts → runInteractive()`.

### Step 1: Pick a file

Scans cwd (up to 5 files) and ~/Downloads (up to 3 files, last 24h only).

```
┌  con-the-doc
│
◆  Pick a file to convert:
│  ● report.docx              3 min ago · ./
│  ○ notes.md                 1 hr ago · ./
│  ○ data.xlsx                2 hr ago · ./
│  ── Downloads ──             nothing in the last 24h
│  ○ Browse or paste a path…
```

If both cwd and downloads are empty:

```
┌  con-the-doc
│
▲  No convertible files found in current folder or ~/Downloads.
│
▲  File path:
│  Drag a file here or type a path
```

Drag-and-drop paths are cleaned: shell escapes (`Athena\ Framework.docx`) are handled automatically.

### Step 2: Pick format

Depends on input file type.

**Inbound** (non-.md file → text): Skipped entirely. Auto-selects Markdown.

**Outbound** (.md file → document, with templates):

```
◆  Output format:
│  ── Templates ──
│  ○ report     Company report with TOC (.docx)
│  ○ slides     Presentation (.pptx)
│  ── Formats ──
│  ○ Word        .docx
│  ○ PowerPoint  .pptx
│  ○ HTML        .html
```

**Outbound** (.md file → document, no templates):

```
◆  Output format:
│  ● Word        .docx
│  ○ PowerPoint  .pptx
│  ○ HTML        .html
```

### Step 3: Save to (conditional)

Only shown when the picked file is **outside cwd**. Skipped entirely if file is in cwd.

```
◆  Save to:
│  ● Current directory     ~/Projects/my-project
│  ○ Same as input file    ~/Downloads
│  ○ Custom path…
```

If config has `defaults.outputDir` set (and it differs from cwd and input dir), it appears first:

```
◆  Save to:
│  ● Configured default    ~/Projects/my-project/out
│  ○ Current directory     ~/Projects/my-project
│  ○ Same as input file    ~/Downloads
│  ○ Custom path…
```

Choosing "Custom path…":

```
▲  Output directory:
│  ./out
```

### Step 4: Convert

If output file already exists:

```
◆  Output file already exists: ./report.md
│  Overwrite?
│  ● Yes / ○ No
```

Then:

```
◇  Converting…
│  ~/Downloads/report.docx → ./report.md
```

### Step 5: First-run hint (conditional)

Only shown when **no config file exists** (neither local `.con-the-doc.yaml` nor global `~/.config/con-the-doc/config.yaml`).

```
ℹ  Tip: run con-the-doc init to save your preferences.
│
└  Done!
```

With config present, just:

```
└  Done!
```

---

## 2. Init Wizard (`con-the-doc init`)

Creates or updates config. Entry: `init.ts → runInit()`.
Use `--global` for `~/.config/con-the-doc/config.yaml`, otherwise `.con-the-doc.yaml`.

### Branch A: Config already exists

```
┌  con-the-doc init
│
◆  Config found at .con-the-doc.yaml. What would you like to do?
│  ● Add a template
│  ○ Edit defaults
│  ○ Start fresh (overwrite)
```

**"Add a template"** → jumps to [Template creation loop](#template-creation-loop)

**"Edit defaults"** → jumps to [Defaults wizard](#defaults-wizard), then merges into existing config

**"Start fresh"** → falls through to Branch B (full wizard)

### Branch B: No config (or "Start fresh")

#### Defaults wizard

```
┌  con-the-doc init
│
◆  Default output format for Markdown files:
│  ● Word        .docx
│  ○ PowerPoint  .pptx
│  ○ HTML        .html
│
◆  Output directory:
│  ● Same as input file
│  ○ Custom path
```

If "Custom path":

```
▲  Output directory path:
│  ./out
```

#### Template prompt

```
◆  Create a named template?
│  ● No / ○ Yes
```

If yes → [Template creation loop](#template-creation-loop)

#### Save

```
ℹ  Config to write to .con-the-doc.yaml:
│  defaults:
│    format: docx
│
│
└  Config saved to .con-the-doc.yaml
```

---

### Template creation loop

Used by both init and config wizards.

```
▲  Template name:
│  report

◆  Template output format:
│  ● Word        .docx
│  ○ PowerPoint  .pptx
│  ○ HTML        .html

▲  Description (optional):
│  Company report with TOC
```

Then format-specific feature checkboxes:

**For docx:**

```
◆  What should this template include?
│  ☐ Table of contents
│  ☐ Use a reference document (company .docx template)
```

**For pptx:**

```
◆  What should this template include?
│  ☐ Use a reference document (company .pptx template)
```

**For html:**

```
◆  What should this template include?
│  ☐ Standalone HTML (full page with head/body)
│  ☐ Table of contents
│  ☐ Use a custom CSS stylesheet
```

Conditional follow-ups if reference-doc or CSS selected:

```
▲  Path to reference document:
│  ./template.docx

▲  Path to CSS stylesheet:
│  ./style.css
```

Then an advanced escape hatch:

```
◆  Advanced: additional Pandoc args?
│  ● No / ○ Yes
```

If yes:

```
▲  Pandoc args (space-separated):
│  --shift-heading-level-by=-1
```

Then:

```
✔  Template "report" added.

◆  Create another template?
│  ● No / ○ Yes
```

If yes → loops back to "Template name:". Duplicate names are rejected inline.

---

## 3. Config Wizard (`con-the-doc config`)

View and manage config. Entry: `config-wizard.ts → runConfigWizard()`.

### No config found

```
┌  con-the-doc config
│
▲  No config files found.
│
◆  Create one now?
│  ● Yes / ○ No
```

If yes:

```
◆  Which config to edit?
│  ● Local   .con-the-doc.yaml
│  ○ Global  ~/.config/con-the-doc/config.yaml
```

Then runs the full [Defaults wizard](#defaults-wizard) + [Template creation loop](#template-creation-loop) inline, same as `init`.

### Config exists

```
┌  con-the-doc config
│
ℹ  Global: ~/.config/con-the-doc/config.yaml
│  Local:  ./.con-the-doc.yaml

ℹ  Default format: docx
│  Output dir: ./out
│  Overwrite existing files: ask first
│
│  Templates:
│    report — Company report with TOC (docx)
│    slides — Presentation slides (pptx)
│
◆  Which config to edit?
│  ● Local   .con-the-doc.yaml
│  ○ Global  ~/.config/con-the-doc/config.yaml
│
◆  What would you like to do?
│  ● Add a template
│  ○ Edit defaults
│  ○ Open config file
│  ○ Done
```

**"Add a template"** → [Template creation loop](#template-creation-loop), merges into config file

**"Edit defaults"** → [Defaults wizard](#defaults-wizard), merges into config file

**"Open config file"**:

```
ℹ  Config file: .con-the-doc.yaml
│
└  Open it with your editor: $EDITOR ~/.con-the-doc.yaml
```

**"Done"** → exits

---

## 4. Paste Wizard (`con-the-doc paste`)

Clipboard → Markdown conversion. Entry: `paste.ts → runPaste()`.

### Interactive mode (no flags)

```
┌  con-the-doc paste
│
◇  Clipboard → Markdown
│
◆  Output:
│  ● Copy to clipboard
│  ○ Print to terminal
│  ○ Save to file…
│
└  Copied to clipboard ✓
```

If "Save to file…":

```
▲  Output file:
│  snippet.md
│
└  Saved to /path/to/snippet.md
```

Plain text fallback (no HTML in clipboard):

```
┌  con-the-doc paste
│
ℹ  No HTML in clipboard — using plain text as-is.
│
◆  Output:
│  ...
```

Empty clipboard:

```
┌  con-the-doc paste
│
✗  Clipboard is empty.
```

### CLI mode (with flags)

```
$ con-the-doc paste --copy
✓ Copied to clipboard

$ con-the-doc paste --stdout
# Markdown output printed to terminal…

$ con-the-doc paste -o snippet.md
✓ Saved to /path/to/snippet.md
```

---

## 5. CLI Mode (non-interactive)

No wizard — direct conversion via flags. Entry: `cli.ts → main()`.

```
$ con-the-doc report.docx
✓ report.docx → report.md

$ con-the-doc report.docx -f json -o ./out
✓ report.docx → ./out/report.json

$ con-the-doc notes.md -t report
✓ notes.md → notes.docx

$ con-the-doc ./docs/
✓ docs/a.docx → docs/a.md
✗ docs/b.pdf: extraction failed
⊘ docs/c.md: Output would overwrite input file.

Done: 1 converted, 1 failed, 1 skipped.
```

Overwrite prompt (unless `-y`):

```
Output file already exists: ./report.md
Overwrite? [y/N]
```

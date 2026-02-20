# Implementation Plan: Upgrade to @clack/prompts v1.0

> Detailed step-by-step plan for upgrading docs2llm from `@clack/prompts ^0.10` to `v1.0`, addressing UX best practices identified in the [Terminal Wizard UI Research](./research-terminal-wizard-ui.md).

---

## Table of Contents

1. [Goals & Non-Goals](#goals--non-goals)
2. [Phase 1: Dependency Upgrade & Smoke Test](#phase-1-dependency-upgrade--smoke-test)
3. [Phase 2: File Selection Overhaul](#phase-2-file-selection-overhaul)
4. [Phase 3: Conversion Progress & Output](#phase-3-conversion-progress--output)
5. [Phase 4: Wizard Flow Improvements](#phase-4-wizard-flow-improvements)
6. [Phase 5: Init & Config Wizard Enhancements](#phase-5-init--config-wizard-enhancements)
7. [Phase 6: Paste Wizard Cleanup](#phase-6-paste-wizard-cleanup)
8. [Phase 7: Non-Interactive & Accessibility](#phase-7-non-interactive--accessibility)
9. [Phase 8: Custom Step Tracker Wrapper](#phase-8-custom-step-tracker-wrapper)
10. [Migration Risk Assessment](#migration-risk-assessment)
11. [File-by-File Change Summary](#file-by-file-change-summary)

---

## Goals & Non-Goals

### Goals

- Upgrade `@clack/prompts` from `^0.10` to `^1.0` with zero breaking changes to existing flows
- Replace the `__sep__` separator hack with native selectable groups
- Add fuzzy-searchable file selection via autocomplete prompt
- Add progress bar for batch conversions and long single-file conversions
- Add path prompt for file/directory inputs with auto-suggest
- Add real-time conversion output via `taskLog` / `stream`
- Add step indicators to multi-step wizard flows
- Improve cancellation handling throughout
- Add non-interactive completeness (`--yes`, `--json`, `NO_COLOR`)
- Follow the 15 UX best practices identified in the research document

### Non-Goals

- Switching to a different library (Ink, Inquirer, etc.)
- Adding dashboard-style persistent TUI features
- Adding back-navigation between wizard steps (deferred to a future phase — would require significant architectural changes to store and replay prompt state)
- Full theming system
- Rewriting the CLI argument parser

---

## Phase 1: Dependency Upgrade & Smoke Test

**Effort:** Low | **Risk:** Low | **Impact:** Foundation for everything else

### 1.1 Bump the dependency

Update `package.json`:
```
"@clack/prompts": "^0.10" → "^1.0"
```

Run `bun install` and verify no type errors. The v1.0 API is backward-compatible with v0.10 — all existing `p.intro()`, `p.outro()`, `p.select()`, `p.multiselect()`, `p.confirm()`, `p.text()`, `p.spinner()`, `p.log.*`, `p.cancel()`, `p.isCancel()` calls should work unchanged.

### 1.2 Verify all four wizard flows

Manually test each wizard to confirm no regressions:
- `docs2llm` (interactive wizard)
- `docs2llm init` / `docs2llm init --global`
- `docs2llm config`
- `docs2llm paste`

### 1.3 Add a smoke test

If not already present, add a basic test that imports `@clack/prompts` and verifies the new v1.0 exports are available: `autocomplete`, `path`, `progress`, `stream`, `taskLog`.

---

## Phase 2: File Selection Overhaul

**Effort:** Medium | **Risk:** Low | **Impact:** High — addresses the single biggest UX pain point

### Problem

`interactive.ts:pickFile()` currently uses `p.select()` to show a flat list of recent files. For projects with many files, users must scroll through a long list. The `__sep__` hack creates fake separator entries that can be accidentally selected, requiring a recursive re-prompt workaround (max depth 3).

### 2.1 Replace file picker with autocomplete

**File:** `interactive.ts` — `pickFile()`

Replace `p.select()` with `p.autocomplete()` (new in v1.0). This gives users type-ahead filtering to quickly narrow down files.

**Behavior:**
- Show all recent files (current directory + Downloads) as autocomplete options
- User can immediately start typing to filter by filename
- Special actions ("Paste a URL", "Enter path manually", "Convert all files") remain as static options at the top, above the filterable file list
- Remove the `__sep__` magic values entirely — use `selectableGroups: false` for group headers ("Current directory", "Recent downloads")

**Autocomplete configuration:**
- `placeholder`: `"Start typing to filter files…"`
- Options grouped using v1.0's native `group` property with `selectableGroups: false`
- Each option's `hint` continues to show file size and type info

### 2.2 Remove the recursive separator workaround

Delete the `depth` parameter and recursive `pickFile(depth + 1)` logic. With native selectable groups, group headers are non-interactive and cannot be selected.

### 2.3 Add path prompt for "Enter path manually"

**File:** `interactive.ts` — the `__browse__` branch

Replace the current `p.text()` path input with `p.path()` (new in v1.0). This provides filesystem auto-suggest as the user types a path.

**Configuration:**
- `type: "file"` — restrict to files, not directories
- Show validation error inline if the path doesn't exist
- `placeholder`: `"/path/to/document"`

### 2.4 Apply autocomplete to format picker

**File:** `interactive.ts` — `pickFormat()`

Replace the `__sep_tpl__` / `__sep_fmt__` separator pattern with native selectable groups. The template and format sections become proper groups:

```
── Templates ──────────────
  report     docx  Company report template
  slides     pptx  Presentation template
── Formats ────────────────
  docx       Microsoft Word
  pptx       PowerPoint
  html       Web page
```

If the list grows beyond ~8 entries (many templates), switch to `p.autocomplete()` instead of `p.select()` to allow filtering. Otherwise, keep `p.select()` with groups — autocomplete is overkill for short lists.

---

## Phase 3: Conversion Progress & Output

**Effort:** Medium | **Risk:** Low | **Impact:** High — batch conversion UX dramatically improved

### Problem

Single-file conversions use a spinner, which is fine. But batch conversions (`convertBatchInteractive()`) process up to N files in parallel with only a spinner — no indication of how many files are done, how many remain, or which files succeeded/failed.

### 3.1 Add progress bar for batch conversions

**File:** `interactive.ts` — `convertBatchInteractive()`

Replace the spinner with `p.progress()` (new in v1.0).

**Behavior:**
- Initialize: `p.progress({ total: files.length })`
- On each file completion: increment progress
- Show: `Converting 3/12 files ████████░░░░░░ 25%`
- On completion: show summary of successes and failures

### 3.2 Add taskLog for single-file conversions

**File:** `interactive.ts` — `convert()`

For longer conversions (PDFs, large documents), replace the spinner with `p.taskLog()` (new in v1.0). This shows real-time output from the conversion process (Pandoc output, OCR progress) and clears it on success — leaving only a clean success message.

**When to use taskLog vs spinner:**
- **Spinner**: For fast operations (< 2 seconds) — format detection, clipboard copy, config save
- **taskLog**: For operations that produce output — Pandoc conversion, OCR processing
- **Progress bar**: For batch operations with known count

### 3.3 Add stream for token counting output

**File:** `interactive.ts` — token stats display

When showing LLM model fit information (token counts, model compatibility), use `p.stream()` (new in v1.0) for a cleaner async output experience if the stats require async computation.

### 3.4 Summary screen before batch conversion

**UX Best Practice:** "Summary before final action"

Before starting a batch conversion, show a summary of what will happen:

```
┌ Batch Conversion
│
│  Files:     12 documents
│  Format:    Markdown
│  Output:    ./converted/
│  OCR:       Enabled (auto-detect)
│
└  Press Enter to start, or Ctrl+C to cancel.
```

Use `p.confirm()` with the summary rendered via `p.log.info()` or `p.note()`. This gives the user a chance to review before committing to a potentially long operation.

---

## Phase 4: Wizard Flow Improvements

**Effort:** Medium | **Risk:** Low | **Impact:** Medium — polish and consistency

### 4.1 Improve cancellation handling

**UX Best Practice:** "Graceful CTRL+C with a polite goodbye message"

v1.0 adds spinner cancel detection. Update all spinner usages to handle cancellation gracefully:

```typescript
const s = p.spinner();
s.start("Converting…");
// If user presses Ctrl+C during spinner:
// s.stop() is called automatically, then p.cancel() fires
```

Additionally, standardize the cancellation pattern across all four wizards. Currently some use:
```typescript
if (p.isCancel(value)) { p.cancel("Cancelled."); process.exit(0); }
```

Create a shared helper:
```typescript
// shared/wizard-utils.ts
function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }
  return value;
}
```

This eliminates the repeated `if (p.isCancel(...))` blocks that appear dozens of times across the wizard files.

### 4.2 Standardize spinner stop messages

Currently, spinner stop messages are inconsistent:
- `"Converting…"` → `"source.md → output.docx"` (shows paths)
- `"Converting clipboard HTML…"` → `"Clipboard → Markdown"` (shows abstract description)
- `"Scanned document detected"` (completely different pattern)

Standardize to a consistent format:
- **Action spinners**: `start("Verb…")` → `stop("Done — brief result")`
- **Conversion spinners**: `start("Converting…")` → `stop("input → output (size/tokens)")`

### 4.3 Add confirmation before destructive overwrite

**File:** `interactive.ts` — `convert()`

Currently the overwrite prompt is a simple `p.confirm()`. Enhance it to show what will be lost:

```
┌ File already exists
│
│  Path:     ./output/report.docx
│  Size:     245 KB
│  Modified: 2 hours ago
│
└  Overwrite this file?
```

This follows the UX best practice of showing consequences before destructive actions.

---

## Phase 5: Init & Config Wizard Enhancements

**Effort:** Medium | **Risk:** Low | **Impact:** Medium

### 5.1 Replace template path inputs with path prompt

**File:** `init.ts` — `promptTemplateFeatures()`

When prompting for reference document paths or CSS stylesheet paths, replace `p.text()` with `p.path()`:

```typescript
// Before (v0.10):
const refDoc = await p.text({
  message: "Path to reference document:",
  placeholder: "/path/to/template.docx"
});

// After (v1.0):
const refDoc = await p.path({
  message: "Path to reference document:",
  type: "file",
  // Auto-suggests as user types
});
```

This applies to:
- Reference document paths (docx, pptx templates)
- CSS stylesheet paths
- Custom output directory paths

### 5.2 Replace output directory text input with path prompt

**File:** `init.ts` — `promptDefaults()`
**File:** `interactive.ts` — `pickOutputDir()`

When the user selects "Custom path…", replace `p.text()` with `p.path({ type: "directory" })` for directory auto-suggest.

### 5.3 Improve Pandoc args input

**File:** `init.ts` — `promptTemplateFeatures()`

The current "Advanced: additional Pandoc args?" text input splits by whitespace, which cannot handle arguments with spaces (e.g., `--metadata title="My Document"`).

Improve the hint text to warn about this limitation:

```typescript
const extra = await p.text({
  message: "Additional Pandoc arguments:",
  placeholder: "--toc-depth=2 --shift-heading-level-by=1",
  hint: "Space-separated. Quoted values not supported — use = syntax (--key=value)."
});
```

### 5.4 Config preview with diff

**File:** `config-wizard.ts` — when editing defaults or adding templates

After the user finishes editing, show what changed (not just the full config):

```
┌ Changes
│
│  defaults.format:    docx → pptx
│  templates.slides:   (new)
│
└  Save to .docs2llm.yaml?
```

Use `p.log.info()` for the diff display, then `p.confirm()` for the save action.

---

## Phase 6: Paste Wizard Cleanup

**Effort:** Low | **Risk:** Low | **Impact:** Low-Medium

### 6.1 Unify interactive and non-interactive code paths

**File:** `paste.ts`

Currently, the code branches on `hasFlag` to decide whether to show spinners and log messages. Refactor to use a single code path with conditional UI:

```typescript
const ui = isInteractive
  ? { spinner: p.spinner(), log: p.log }
  : { spinner: null, log: { info: () => {}, error: console.error, ... } };
```

This eliminates the scattered `s?.start()` / `s?.stop()` null checks and makes the flow easier to follow.

### 6.2 Add path auto-suggest to "Save to file" option

Replace the `p.text()` prompt for save path with `p.path()`.

### 6.3 Add clipboard content preview

Before showing the action menu, show a preview of the converted content (first 3 lines, truncated):

```
┌ Converted
│
│  # Meeting Notes
│  ## Attendees
│  Alice, Bob, Charlie…
│
│  (247 words, 1,523 characters)
│
└  What would you like to do?
```

This gives the user confidence that the conversion worked before choosing an action.

---

## Phase 7: Non-Interactive & Accessibility

**Effort:** Medium | **Risk:** Low | **Impact:** High for CI/CD and automation users

### UX Best Practices Addressed

- "Never require a prompt — always provide flag equivalents"
- "Support `--yes`/`--force`"
- "Honor `NO_COLOR` and `TERM=dumb`"
- "Offer `--json` output for programmatic consumption"
- "Adapt for CI environments"

### 7.1 Add `--yes` flag

**File:** `cli.ts`

Add a `--yes` / `-Y` flag that accepts all defaults without prompting. This is distinct from the existing `--force` / `-y` flag which only skips overwrite confirmations.

Behavior of `--yes`:
- File format: Use config default, or `md` for inbound / `docx` for outbound
- Output directory: Use config default, or same as input
- OCR: Auto-detect (enable if scanned PDF detected)
- Overwrite: Yes (implies `--force`)
- Post-conversion menu: Skip (just convert and exit)

### 7.2 Add `--json` flag

**File:** `cli.ts`

Add a `--json` flag that outputs machine-readable JSON instead of human-readable terminal UI. Suppresses all interactive prompts and Clack output.

**Output schema:**
```json
{
  "success": true,
  "input": "/path/to/input.pdf",
  "output": "/path/to/output.md",
  "format": "md",
  "tokens": 4523,
  "words": 2100,
  "duration_ms": 1234,
  "ocr_used": false,
  "quality_score": 0.92
}
```

For batch conversions:
```json
{
  "success": true,
  "results": [
    { "input": "...", "output": "...", "success": true },
    { "input": "...", "error": "Pandoc not found", "success": false }
  ],
  "total": 12,
  "succeeded": 11,
  "failed": 1,
  "duration_ms": 8500
}
```

### 7.3 Honor `NO_COLOR` environment variable

**File:** A new shared utility, or at the top of `cli.ts`

Check for `NO_COLOR` environment variable (any value, including empty string) and `TERM=dumb`. When detected:
- Disable colored output in Clack prompts
- Remove ANSI escape codes from log messages
- Use plain text spinners (or disable animation entirely)

`@clack/prompts` v1.0 may already respect `NO_COLOR` — verify this. If not, wrap the Clack API to strip colors.

### 7.4 Detect non-interactive terminal

**File:** `cli.ts`

When `process.stdin.isTTY` is `false` (piped input, CI environment), automatically:
- Skip all interactive prompts
- Require necessary flags (`-f`, `-o`) or fail with a clear error: `"Non-interactive terminal detected. Use --format and --output flags, or run with --yes for defaults."`
- Fall back to `--json` output style if `--json` is set

### 7.5 Add `--quiet` / `-q` flag

Suppress all non-essential output. Only show errors and the final result path. Useful for scripting:
```bash
OUTPUT=$(docs2llm report.pdf -f md -q)
```

---

## Phase 8: Custom Step Tracker Wrapper

**Effort:** Medium | **Risk:** Low | **Impact:** Medium — visual polish for multi-step flows

### UX Best Practice Addressed

- "Progress indicators — show which step the user is on"
- "Keep wizards to 3-5 steps"

### 8.1 Build a step tracker utility

**File:** New file `src/shared/wizard-steps.ts`

Create a lightweight wrapper around Clack's `group()` API that adds step indicators:

```
┌ docs2llm — Interactive Conversion
│
│  Step 1 of 4 — Select File
│
│  ● Select file   ○ Format   ○ Output   ○ Convert
```

**API design:**

```typescript
interface WizardStep<T> {
  label: string;
  run: () => Promise<T>;
}

async function runWizard<T extends Record<string, unknown>>(
  title: string,
  steps: WizardStep<T[keyof T]>[]
): Promise<T>
```

The wrapper:
1. Prints the step indicator line before each step
2. Tracks completed steps (filled dot) vs pending steps (empty dot)
3. Updates the indicator as the user progresses
4. Handles cancellation at any step

### 8.2 Retrofit interactive.ts with step tracker

Wrap the four main steps of the interactive wizard:

| Step | Label | Function |
|------|-------|----------|
| 1 | Select file | `pickFile()` |
| 2 | Choose format | `pickFormat()` |
| 3 | Output location | `pickOutputDir()` |
| 4 | Convert | `convert()` |

### 8.3 Retrofit init.ts with step tracker

| Step | Label | Function |
|------|-------|----------|
| 1 | Set defaults | `promptDefaults()` |
| 2 | Add templates | `promptTemplateLoop()` |
| 3 | Save config | `saveConfig()` |

### 8.4 Retrofit config-wizard.ts with step tracker

The config wizard is more dynamic (menu-driven), so the step tracker is optional here. Consider using it only when the user selects a multi-step action like "Add a template."

---

## Migration Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| v1.0 API breaks existing prompts | Very low | High | v1.0 is backward-compatible. Test all four wizards after upgrade. |
| `p.autocomplete()` behavior differs from `p.select()` | Low | Medium | Keep `p.select()` for short lists (< 8 items). Only use autocomplete for file picker and long template lists. |
| `p.path()` unavailable on Windows | Low | Medium | Test on Windows. Fall back to `p.text()` if `p.path()` is not available or behaves incorrectly. |
| `p.progress()` redraws break piped output | Low | Low | Disable progress bar when `!process.stdout.isTTY`. |
| `taskLog` output is too verbose | Low | Low | Only use for conversions that produce significant output. Keep spinner for quick operations. |
| Step tracker adds visual noise | Low | Low | Keep it minimal — one line, dots or numbers. Don't add ASCII art boxes. |

---

## File-by-File Change Summary

| File | Phase | Changes |
|------|-------|---------|
| `package.json` | 1 | Bump `@clack/prompts` to `^1.0` |
| `src/interactive.ts` | 2, 3, 4, 8 | Autocomplete file picker, selectable groups for format picker, path prompt for manual entry, progress bar for batch, taskLog for conversions, summary screen, step tracker |
| `src/init.ts` | 5, 8 | Path prompts for reference docs / CSS / output dir, improved Pandoc args hint, step tracker |
| `src/config-wizard.ts` | 5 | Config diff preview before save |
| `src/paste.ts` | 6 | Unified code paths, path prompt for save, content preview |
| `src/cli.ts` | 7 | `--yes`, `--json`, `--quiet` flags, `NO_COLOR` handling, non-interactive TTY detection |
| `src/shared/wizard-utils.ts` | 4 | New: cancellation guard helper |
| `src/shared/wizard-steps.ts` | 8 | New: step tracker wrapper |

---

## Recommended Implementation Order

Each phase can be merged independently. The recommended order maximizes value delivered per phase:

```
Phase 1 (Upgrade)           ← Do first, unblocks everything
  ↓
Phase 2 (File selection)    ← Highest user-facing impact
  ↓
Phase 3 (Progress & output) ← Second-highest impact, especially batch
  ↓
Phase 7 (Non-interactive)   ← Unblocks CI/CD and scripting users
  ↓
Phase 4 (Flow improvements) ← Polish & consistency
  ↓
Phase 5 (Init & config)     ← Targets setup experience
  ↓
Phase 6 (Paste)             ← Smallest scope
  ↓
Phase 8 (Step tracker)      ← Visual polish, can be done anytime after Phase 1
```

**Estimated scope:** Phases 1-3 deliver ~80% of the value. Phases 4-8 are incremental polish that can be deferred based on priority.

---

## UX Best Practices Checklist

Cross-reference with the 15 best practices from the research document:

| # | Best Practice | Addressed In |
|---|---|---|
| 1 | Keep wizards to 3-5 steps | Phase 8 — step tracker makes step count visible |
| 2 | Smart defaults with escape hatches | Phase 7 — `--yes` flag accepts all defaults |
| 3 | Each step should be self-contained | Already true in current implementation |
| 4 | Summary before final action | Phase 3 — batch summary screen |
| 5 | Allow back-navigation | Deferred — requires architectural changes |
| 6 | Inline validation | Phase 5 — path prompt validates in real-time |
| 7 | Progress indicators | Phase 8 — step tracker |
| 8 | Informative error recovery | Phase 4 — standardized error messages |
| 9 | Idempotent retries | Already true — re-running conversion is safe |
| 10 | Config file output | Already true — init wizard writes `.docs2llm.yaml` |
| 11 | Never require a prompt | Phase 7 — non-interactive TTY detection + flag fallback |
| 12 | Support `--yes`/`--force` | Phase 7 — `--yes` flag |
| 13 | Respect config precedence | Already true — flags > config > defaults |
| 14 | Provide shell completions | Not addressed — low priority, consider in future |
| 15 | Smart error messages | Phase 4 — standardized error formatting |

| # | Accessibility Practice | Addressed In |
|---|---|---|
| A1 | Honor `NO_COLOR` | Phase 7 |
| A2 | Detect non-interactive TTY | Phase 7 |
| A3 | `--json` output | Phase 7 |
| A4 | `--quiet` flag | Phase 7 |
| A5 | Don't rely solely on color | Phase 4 — symbols alongside colors (already partially done) |
| A6 | Respect terminal width | Not addressed — Clack handles this internally |

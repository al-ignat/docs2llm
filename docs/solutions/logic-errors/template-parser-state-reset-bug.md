---
title: Template parser double-flush bug and docs2llm.ts test coverage
date: 2026-03-03
category: logic-errors
severity: medium
components:
  - raycast/src/lib/docs2llm.ts
  - raycast/src/__tests__/docs2llm.test.ts
  - raycast/src/__tests__/mocks/raycast-api.ts
tags:
  - test-coverage
  - parser-bug
  - yaml
  - raycast-extension
  - template-loading
  - state-management
symptoms:
  - loadTemplates() returned duplicate template entries when config had content after templates section
  - Zero test coverage on the most critical Raycast extension file (514 lines)
root_cause: >
  loadTemplates() YAML parser flushed the last template in the break handler
  but did not reset currentName, so the post-loop guard pushed it again.
resolution: >
  Added currentName = null after flush in break handler. Added 37 tests
  covering binary resolution, CLI invocation, file operations, and template loading.
related:
  - docs/solutions/logic-errors/p1-code-review-findings.md
  - docs/solutions/code-quality/2026-03-02-p2-code-quality-refactor-sweep.md
---

# Template Parser Double-Flush Bug & docs2llm.ts Test Coverage

## Problem

`raycast/src/lib/docs2llm.ts` (514 lines) is the most critical file in the Raycast extension — it handles binary resolution, CLI invocation, template loading, and all conversion functions. It had **zero test coverage** while the rest of the extension had 136 tests.

Writing tests revealed a hidden bug: `loadTemplates()` duplicated the last template when the `templates:` YAML section was followed by another top-level key.

## Root Cause

The custom YAML parser in `loadTemplates()` had two flush points for accumulated template state:

1. **Break handler** (line 428): Flushes when detecting a new top-level key, then `break`s
2. **Post-loop guard** (line 465): Flushes any remaining state after the loop ends

The break handler pushed the template but never reset `currentName`. After `break`, the post-loop guard found `currentName` still set and pushed the same template again.

```yaml
# This config triggered the bug:
templates:
  report:
    format: docx
defaults:           # ← top-level key triggers break handler
  format: md
```

Result: `[{ name: "report", format: "docx" }, { name: "report", format: "docx" }]` — duplicated.

## Fix

One line added after the flush inside the break handler:

```typescript
// Another top-level key → stop
if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("\t")) {
  if (currentName && currentFormat) {
    templates.push({ name: currentName, format: currentFormat, description: currentDesc });
    currentName = null;  // ← prevents post-loop double-flush
  }
  break;
}
```

## Test Coverage Added

Created `raycast/src/__tests__/docs2llm.test.ts` with 37 tests in 4 groups:

| Group | Tests | What it covers |
|-------|-------|----------------|
| Binary resolution | 10 | 4-tier fallback: preference → compiled binary → bun-global symlink → project-local |
| CLI invocation | 10 | Arg construction, OCR flag, custom formats, version, install check, stats |
| File operations | 11 | getOutputDir, saveToFile, exportMarkdown, exportToHtml, convertToHtmlFromText, convertWithTemplate |
| Template loading | 6 | Valid configs, descriptions, missing files, malformed YAML, section boundaries |

### Mock Strategy

Follows existing pattern (`smart-copy.test.ts`): `vi.hoisted()` + `vi.mock()`.

Modules mocked: `node:fs`, `node:child_process`, `node:os`, `@raycast/api`.

Key helper — `mockPaths()` makes each test's filesystem assumptions explicit:

```typescript
function mockPaths(...paths: string[]) {
  const set = new Set(paths);
  mocks.existsSync.mockImplementation((p: string) => set.has(p));
}

// Usage: only these paths "exist" for this test
mockPaths("/usr/local/bin/docs2llm", "/mock/output");
```

### TDZ Gotcha

`vi.hoisted()` moves its factory above all `const` declarations. Referencing a `const` defined later causes a `ReferenceError` (temporal dead zone). Use literal values inside the hoisted block:

```typescript
// BAD: MOCK_HOME not yet initialized
const mocks = vi.hoisted(() => ({
  homedir: vi.fn(() => MOCK_HOME),  // ReferenceError
}));
const MOCK_HOME = "/mock/home";

// GOOD: inline the value
const mocks = vi.hoisted(() => ({
  homedir: vi.fn(() => "/mock/home"),
}));
const MOCK_HOME = "/mock/home";  // for use in tests below
```

## Prevention

### For Parser State Bugs

1. **Single flush function with reset guard** — consolidate all flush logic into one function that resets state after pushing:
   ```typescript
   function flush() {
     if (!currentName) return;
     templates.push({ name: currentName, format: currentFormat });
     currentName = null;  // always reset
   }
   ```

2. **Test all exit paths** — for any loop with accumulated state, test:
   - Empty input
   - Single item (only post-loop flush)
   - Multiple items (in-loop flush + post-loop flush)
   - Item followed by non-item content (break path)

3. **Prefer libraries** — `js-yaml` or `yaml` would avoid hand-rolled parsing bugs entirely. The custom parser exists to avoid a dependency, but the tradeoff is fragility.

### For Testing Gaps

1. **Prioritize integration layers** — files that orchestrate CLI invocation, config loading, or external process management need tests first, before UI helpers.

2. **Mock I/O, test logic** — the `mockPaths` pattern makes filesystem-dependent code testable without touching disk. Mock the slow/external things; let logic run for real.

3. **Watch for false confidence** — 136 passing tests felt like good coverage, but the most critical file was untested. Coverage per-file matters more than total count.

## Verification

```bash
cd raycast && npm test    # 173 tests (136 existing + 37 new)
bun test                  # 123 core tests still pass
```

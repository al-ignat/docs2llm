---
title: "P2 Code Quality Cleanup Sweep"
date: 2026-03-02
category: code-quality
tags: [refactoring, architecture, constants, validation, concurrency, mcp, layer-boundaries, options-objects]
components: [core, commands, server]
severity: medium
status: resolved
pr: "#48"
related_prs: ["#47"]
todos: ["005", "006", "007", "008", "009", "010"]
---

# P2 Code Quality Cleanup Sweep

Six-phase refactoring sweep that resolved all P2 findings from a comprehensive code review. Covered constant deduplication, layer violation fixes, parameter refactoring, input validation, MCP expansion, and server concurrency limits.

## Problem

After PR #47 fixed all P1 items (error handling, race conditions, OCR dedup, SSRF), 6 P2 items remained:

1. Constants defined in 3+ places (adding a format meant editing 3 files)
2. Layer violation: `server/mcp.ts` imported from `commands/fetch.ts`
3. 12-parameter positional functions in `run.ts`
4. Config writes accepted without validation (Pandoc args, formData casts)
5. MCP server at 20% feature parity (3 of ~15 CLI capabilities)
6. No server concurrency limits (3 concurrent uploads = 600MB+ memory)

## Execution Order

```
Phase 1 (parallel):  006 Constants + 009 Fetch to core
Phase 2 (parallel):  007 Options objects + 008 Config validation
Phase 3:             005 MCP parity (needs core/ imports from Phase 1B)
Phase 4:             010 Concurrency limits (wraps all endpoints including Phase 3)
```

Phases 1A+1B go first because they stabilize import paths — later phases would otherwise cause merge conflicts.

## Solutions

### Phase 1A: Deduplicate Constants

**Root cause**: `OUTBOUND_FORMATS` in both `validate.ts` and `convert.ts`. `CONVERTIBLE_EXTS` in `scan.ts`, `watch.ts`, and `interactive.ts`. Byte limits under 3 different names.

**Fix**: Single source of truth in `core/` modules. Split extensions into two constants because watch/batch excludes `.md` but scanning includes it:

```typescript
// core/scan.ts
export const INBOUND_ONLY_EXTS = new Set([".docx", ".pdf", ".pptx", /* ... */]);
export const CONVERTIBLE_EXTS = new Set([...INBOUND_ONLY_EXTS, ".md"]);
```

Renamed `MAX_RESPONSE_BYTES` / `MAX_STDIN_BYTES` / `MAX_UPLOAD_BYTES` → single `MAX_INPUT_BYTES` in `core/url-safe.ts`.

### Phase 1B: Move Fetch to Core

**Root cause**: `server/mcp.ts` imported `fetchAndConvert` from `commands/fetch.ts` — server layer depending on command layer.

**Fix**: Created `core/fetch.ts` and `core/mime.ts`. Deleted `commands/fetch.ts` entirely (no re-export shim). Updated all 4 consumers.

**Key decision**: Clean break over backwards compatibility. A re-export shim would hide the layer violation instead of fixing it.

### Phase 2A: Options Object Refactor

**Root cause**: `convertSingleFile(filePath, format, outputDir, formatExplicit, force, cliPandocArgs, config, templateName, ocr, useStdout, chunks, chunkSize)` — 12 positional params.

**Fix**: Typed interfaces with destructuring:

```typescript
export interface ConvertFileOptions {
  format: OutputFormat;
  outputDir?: string;
  formatExplicit?: boolean;
  force?: boolean;
  cliPandocArgs?: string[];
  config?: Config;
  templateName?: string | null;
  ocr?: OcrOptions;
  useStdout?: boolean;
  chunks?: boolean;
  chunkSize?: number | null;
}

export async function convertSingleFile(filePath: string, options: ConvertFileOptions) {
  const { format, outputDir, formatExplicit, force, ... } = options;
```

Same pattern for `convertFolder`, `convertUrl`, `convertStdin`. Call sites become self-documenting.

### Phase 2B: Validate Config Writes

**Root cause**: API accepted arbitrary Pandoc flags at config write time. `formData.get()` results cast with `as File` without runtime checks.

**Fix**:
- Exported `sanitizePandocArgs` from `outbound.ts`, called it in `handlePutConfig` and `handleCreateTemplate` before writing (returns 400 on invalid flags)
- Replaced `formData.get("file") as File` with `instanceof File` checks
- Replaced string casts with `typeof === "string"` guards
- Added `outputDir` validation (reject null bytes, `/etc`, `/proc`, `/sys`)

### Phase 3: MCP Feature Parity (3 → 8 tools)

**Root cause**: MCP server only exposed `convert_file`, `convert_url`, `list_formats`.

**Fix**: Added 5 new tools, all following the established pattern:

| Tool | What it does |
|------|-------------|
| `convert_to_document` | Markdown → DOCX/PPTX/HTML via Pandoc, returns file path |
| `convert_folder` | Batch conversion with `Promise.allSettled`, max 100 files, batch size 4 |
| `convert_html` | HTML string → Markdown |
| `list_templates` | Template names/descriptions from config |
| `get_config` | Resolved config as YAML |

**Key decision**: `convert_folder` implements a lightweight batch loop directly in `mcp.ts` (readdirSync + filter + allSettled) rather than reusing the CLI's `convertFolder` which has console output, JSON mode, etc. MCP tools should be thin wrappers around `core/` functions.

### Phase 4: Server Concurrency Limits

**Root cause**: No limit on concurrent conversions via the HTTP API.

**Fix**: Counter-based semaphore — reject immediately with 429, don't queue:

```typescript
let activeConversions = 0;
const MAX_CONCURRENT_CONVERSIONS = 3;

async function withConversionLimit<T>(fn: () => Promise<T>): Promise<T | Response> {
  if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
    return Response.json(
      { error: "Server busy. Too many concurrent conversions." },
      { status: 429 }
    );
  }
  activeConversions++;
  try { return await fn(); } finally { activeConversions--; }
}
```

Gated: `/convert`, `/convert/url`, `/convert/outbound`. Left ungated: `/convert/clipboard` (lightweight string processing). Verified with concurrent load test: 5 requests → `429, 429, 200, 200, 200`.

## Prevention Rules

1. **Constants**: Define once in `core/`, import everywhere. If you see a value in 2+ files, consolidate.
2. **Imports**: `server/` and `commands/` import from `core/`, never from each other. If you need shared logic, move it to `core/` first.
3. **Parameters**: Max 3-4 positional params per exported function. Beyond that, use a typed options interface.
4. **Validation**: Validate at write time, not just execution time. Use `instanceof`/`typeof` guards on form data, never bare casts.
5. **MCP parity**: When adding a CLI feature, add the corresponding MCP tool in the same PR.
6. **Concurrency**: New heavy endpoints must be wrapped in `withConversionLimit()`.

## Detection Patterns

```bash
# Find duplicate constants
rg "docx.*pptx.*html" src/ --type ts -l

# Find layer violations
rg 'from.*"\.\./(commands|server)' src/server/ --type ts
rg 'from.*"\.\./(commands|server)' src/commands/ --type ts

# Find functions with too many parameters
rg "export.*function.*\(.*,.*,.*,.*,.*," src/ --type ts
```

## Files Changed

13 files across 6 commits (+420 −175 lines):

| Layer | Files |
|-------|-------|
| `core/` (new) | `fetch.ts`, `mime.ts` |
| `core/` (modified) | `convert.ts`, `outbound.ts`, `scan.ts`, `url-safe.ts`, `validate.ts` |
| `commands/` (modified) | `cli.ts`, `interactive.ts`, `run.ts`, `watch.ts` |
| `commands/` (deleted) | `fetch.ts` |
| `server/` (modified) | `api.ts`, `mcp.ts` |

## Related

- [P1 Code Review Findings](../logic-errors/p1-code-review-findings.md) — PR #47, predecessor to this sweep
- [SSRF Bypass Fix](../security-issues/ipv6-ssrf-bypass-p1.md) — Related P1 security fix
- [P2 Cleanup Sweep Plan](../../plans/2026-03-02-refactor-p2-cleanup-sweep-plan.md) — Execution plan with dependency graph
- Todos: `005` through `010` in `todos/`

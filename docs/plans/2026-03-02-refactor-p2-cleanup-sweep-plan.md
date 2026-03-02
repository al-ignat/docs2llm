---
title: "refactor: P2 code quality cleanup sweep"
type: refactor
status: completed
date: 2026-03-02
---

# refactor: P2 code quality cleanup sweep

## Overview

Batch the 6 remaining P2 todos into a single sweep: deduplicate constants, fix layer violations, refactor function signatures, validate config writes, expand MCP server, and add server concurrency limits. All P1 items were completed in PR #47. This sweep cleans up the code quality debt before adding new features.

## Problem Statement

The codebase has accumulated 6 P2 issues from a comprehensive code review:

1. **Constants defined in 3+ places** — adding a new format requires editing 3 files
2. **Layer violation** — `server/mcp.ts` imports from `commands/fetch.ts`
3. **12-parameter functions** — `convertSingleFile` is impossible to extend
4. **Config writes unvalidated** — Pandoc args accepted without allowlist at write time
5. **MCP at 20% parity** — 3 of 15 capabilities exposed to AI agents
6. **No server concurrency limits** — 3 concurrent 100MB uploads = 600MB+ memory

## Execution Order

```
Phase 1 (parallel, 1 PR each):
  006 — Deduplicate constants
  009 — Move fetch to core/

Phase 2 (parallel, 1 PR each):
  007 — Options object refactor (depends on 006, 009 for stable run.ts)
  008 — Validate config writes (depends on 009 for MIME_MAP location)

Phase 3 (1 PR):
  005 — MCP feature parity (depends on 009 for core/ imports)

Phase 4 (1 PR):
  010 — Server concurrency limits (after all endpoints finalized)
```

**Rationale**: 006 and 009 are pure reorganization — they stabilize import paths so later phases don't cause merge conflicts. 005 must follow 009 (new MCP tools should import from `core/`, not `commands/`). 010 goes last because it wraps all endpoints including new ones from 005.

---

## Phase 1A: Deduplicate Constants (006)

**Goal**: Each constant defined in exactly one place.

### Changes

**OUTBOUND_FORMATS** — export from `core/validate.ts`, import in `core/convert.ts`:
- `src/core/validate.ts:7` — add `export` to existing `const OUTBOUND_FORMATS`
- `src/core/convert.ts:8` — delete local definition, add `import { OUTBOUND_FORMATS } from "./validate"`

**CONVERTIBLE_EXTS** — export two variants from `core/scan.ts`:
- `src/core/scan.ts:5-12` — rename to `CONVERTIBLE_EXTS` (with `.md`, for file scanning)
- `src/core/scan.ts` — add `export const INBOUND_ONLY_EXTS` (without `.md`, for watch/batch)
- `src/commands/watch.ts:9-15` — delete local definition, `import { INBOUND_ONLY_EXTS } from "../core/scan"`
- `src/commands/interactive.ts:549-555` — delete local definition, `import { INBOUND_ONLY_EXTS } from "../core/scan"`

**MAX_INPUT_BYTES** — export from `core/url-safe.ts`, import everywhere:
- `src/core/url-safe.ts:8` — rename `MAX_RESPONSE_BYTES` → `MAX_INPUT_BYTES` (or alias), ensure exported
- `src/commands/run.ts:386` — delete `MAX_STDIN_BYTES`, `import { MAX_INPUT_BYTES } from "../core/url-safe"`
- `src/server/api.ts:22` — delete `MAX_UPLOAD_BYTES`, `import { MAX_INPUT_BYTES } from "../core/url-safe"`

### Acceptance Criteria
- [x] Each constant defined in exactly one place
- [x] `CONVERTIBLE_EXTS` (with `.md`) and `INBOUND_ONLY_EXTS` (without `.md`) as two named exports
- [x] All tests pass (`bun test`)

### Effort: ~1 hour

---

## Phase 1B: Move Fetch to Core (009)

**Goal**: No imports from `commands/` in `server/` layer.

### Changes

**fetchAndConvert** — move to `src/core/fetch.ts`:
- Create `src/core/fetch.ts` with `fetchAndConvert()` (17 lines, currently in `src/commands/fetch.ts`)
- Delete `src/commands/fetch.ts` entirely (no re-export — clean break)
- Update imports in 3 files:
  - `src/server/mcp.ts:5` — `import { fetchAndConvert } from "../core/fetch"`
  - `src/commands/run.ts:9` — `import { fetchAndConvert } from "../core/fetch"`
  - `src/commands/interactive.ts:24` — `import { fetchAndConvert } from "../core/fetch"` (missed in original todo)

**detectMimeFromBytes** — move to `src/core/mime.ts`:
- Extract from `src/commands/run.ts:467-502` into new `src/core/mime.ts`
- Update import in `run.ts`

**MIME_MAP** — move to `src/core/mime.ts`:
- Extract from `src/server/api.ts:24-50` into `src/core/mime.ts`
- Update import in `api.ts`

### Acceptance Criteria
- [x] Zero imports from `commands/` in `server/` layer
- [x] `fetchAndConvert`, `detectMimeFromBytes`, `MIME_MAP` all live in `core/`
- [x] `commands/fetch.ts` deleted (not re-exported)
- [x] All 3 consumers of `fetchAndConvert` updated (run.ts, interactive.ts, mcp.ts)
- [x] All tests pass

### Effort: ~1 hour

---

## Phase 2A: Options Object Refactor (007)

**Goal**: Replace positional parameter lists with typed options objects in `run.ts`.

### Changes

Define interfaces in `src/commands/run.ts` (top of file):

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

export interface ConvertFolderOptions {
  format: OutputFormat;
  outputDir?: string;
  formatExplicit?: boolean;
  force?: boolean;
  cliPandocArgs?: string[];
  config?: Config;
  templateName?: string | null;
  ocr?: OcrOptions;
}

export interface ConvertStdinOptions {
  format: OutputFormat;
  useStdout: boolean;
  outputDir?: string;
  force?: boolean;
  ocr?: OcrOptions;
  chunks?: boolean;
  chunkSize?: number | null;
}

export interface ConvertUrlOptions {
  format: OutputFormat;
  outputDir?: string;
  force?: boolean;
  useStdout?: boolean;
}
```

Refactor 4 functions:
- `convertSingleFile(filePath: string, options: ConvertFileOptions)` — 12 params → 2
- `convertFolder(dir: string, options: ConvertFolderOptions)` — 9 params → 2
- `convertStdin(options: ConvertStdinOptions)` — 7 params → 1
- `convertUrl(url: string, options: ConvertUrlOptions)` — 5 params → 2

Update call sites in `src/commands/cli.ts` (lines 384, 419-428).

**Scope note**: The `parseArgs` discriminated union mentioned in the original todo is deferred — it's a separate concern from parameter bundling and would expand scope significantly.

### Acceptance Criteria
- [x] All 4 conversion functions in `run.ts` use typed options objects
- [x] All call sites in `cli.ts` updated
- [x] No change in behavior
- [x] All tests pass

### Effort: ~1-2 hours

---

## Phase 2B: Validate Config Writes (008)

**Goal**: Validate inputs at write time, not just execution time.

### Changes

**Export `sanitizePandocArgs`**:
- `src/core/outbound.ts:51` — add `export` to `function sanitizePandocArgs`

**Validate Pandoc args at write time**:
- `src/server/api.ts` `handlePutConfig` (~line 288) — call `sanitizePandocArgs()` on each format's args before writing. Return 400 if invalid.
- `src/server/api.ts` `handleCreateTemplate` (~line 329) — call `sanitizePandocArgs()` on assembled args before writing. Return 400 if invalid.

**Fix unsafe casts**:
- `api.ts:66` — replace `formData.get("file") as File | null` with:
  ```typescript
  const fileField = formData.get("file");
  const file = fileField instanceof File ? fileField : null;
  ```
- `api.ts:238` — same pattern for `handleConvertOutbound`
- `api.ts:341` — same pattern for `handleCreateTemplate` referenceFile
- All `formData.get("format")`, `formData.get("name")` etc. — add `typeof x === "string"` checks

**Fix `as any` cast**:
- `api.ts:371` — change `format as any` to `format as OutboundFormat` (validation already happens at line 346)

**outputDir validation**: Light touch — reject null bytes and paths starting with `/etc`, `/proc`, `/sys`. Don't over-restrict (users legitimately use `~/Documents/output`).

### Acceptance Criteria
- [x] Pandoc args validated at config write time (400 on invalid args)
- [x] No `as any` casts remain in `api.ts` (one legitimate `as any` for property deletion retained)
- [x] All `formData.get()` results checked with `instanceof File` or `typeof === "string"`
- [x] `sanitizePandocArgs` exported from `outbound.ts`
- [x] All tests pass

### Effort: ~1-2 hours

---

## Phase 3: MCP Feature Parity (005)

**Goal**: Expand MCP server from 3 tools to 8 (20% → ~55% parity).

### Design Decisions

**Q: How does `convert_to_document` return binary output?**
A: Return the output file path as text. The MCP client (Claude Desktop, Cursor) can then read the file. This matches how `convertFile` works in the core layer — it writes to disk and returns a path. The MCP tool accepts an optional `outputPath` parameter; if omitted, writes to a temp directory.

**Q: How does `convert_folder` work without a core-layer batch function?**
A: Implement a lightweight batch loop directly in `mcp.ts` — `readdirSync` + filter by extension + `Promise.allSettled` with `convertFile` from core. Cap at 100 files with clear error. No need for the full CLI `convertFolder` (which has console output, JSON mode, etc.).

**Q: What input does `convert_html` accept?**
A: `{ html: string }` — matches the existing `convertHtmlToMarkdown(html)` function in `core/convert.ts`.

### New Tools (5)

All follow the existing pattern in `mcp.ts`:

```typescript
server.tool("tool_name", "Description.", { ...zodSchema }, async ({ params }) => {
  try {
    // ... call core/ functions ...
    return { content: [{ type: "text", text: result }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
  }
});
```

**1. `convert_to_document`** — Markdown → DOCX/PPTX/HTML
- Params: `{ inputPath: string, format: "docx" | "pptx" | "html", outputPath?: string, templateName?: string }`
- Calls: `convertMarkdownTo()` from `core/outbound.ts`
- Returns: output file path as text
- Error: Pandoc not installed → clear message

**2. `convert_folder`** — Batch directory conversion
- Params: `{ dirPath: string, format?: string }`
- Implementation: `readdirSync` → filter by `INBOUND_ONLY_EXTS` → `Promise.allSettled` with `convertFile` (batch size 4)
- Returns: summary text (N files converted, errors listed)
- Limit: max 100 files, error if exceeded
- Error: Non-existent directory → clear message

**3. `convert_html`** — HTML string → Markdown
- Params: `{ html: string }`
- Calls: `convertHtmlToMarkdown()` from `core/convert.ts`
- Returns: Markdown text

**4. `list_templates`** — List available templates
- Params: none
- Calls: `loadConfig()` from `core/config.ts`, reads `config.templates`
- Returns: JSON array of template names + descriptions (or "No templates configured")

**5. `get_config`** — Read current config
- Params: none
- Calls: `loadConfig()` from `core/config.ts`
- Returns: YAML-formatted config string (or "No config file found")

### Acceptance Criteria
- [x] All 5 new tools follow the existing error handling pattern (`try/catch` + `errorMessage`)
- [x] `convert_to_document` works for docx, pptx, html — returns output file path
- [x] `convert_folder` converts up to 100 files, returns summary
- [x] `convert_html` accepts HTML string, returns Markdown
- [x] `list_templates` returns template names/descriptions from config
- [x] `get_config` returns resolved config
- [x] All tools import from `core/` only (not `commands/`)
- [x] Pandoc-not-installed error handled gracefully in `convert_to_document`

### Effort: ~3-4 hours

---

## Phase 4: Server Concurrency Limits (010)

**Goal**: Prevent resource exhaustion from concurrent heavy conversions.

### Design Decisions

**Q: Which endpoints are gated?**
A: Only the 3 heavy endpoints: `POST /convert`, `POST /convert/url`, `POST /convert/outbound`. Exclude `/convert/clipboard` (lightweight string processing).

**Q: What's the 429 response format?**
A: `{ error: "Server busy. Too many concurrent conversions." }` with status 429. No `Retry-After` header (local server, not a public API).

**Q: Hardcoded or configurable limit?**
A: Hardcoded `MAX_CONCURRENT_CONVERSIONS = 3`. This is a local tool, not a production API. Can be made configurable later if needed.

### Changes

**Add semaphore to `src/server/api.ts`**:

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
  try {
    return await fn();
  } finally {
    activeConversions--;
  }
}
```

Wrap `handleConvert`, `handleConvertUrl`, `handleConvertOutbound` with `withConversionLimit`.

**Reduce memory copies** (outbound only):
- `handleConvertOutbound` line 252: change `await Bun.write(tmpIn, new Uint8Array(await file.arrayBuffer()))` to `await Bun.write(tmpIn, file)`
- `handleConvert` (inbound): leave as-is — `convertBytes()` requires `Uint8Array`, no optimization without rearchitecting the flow

### Acceptance Criteria
- [x] `MAX_CONCURRENT_CONVERSIONS = 3` enforced on heavy endpoints
- [x] 429 JSON response when limit exceeded
- [x] `/convert/clipboard` not gated by semaphore
- [x] `handleConvertOutbound` avoids intermediate Uint8Array copy (done in Phase 2B)
- [x] All tests pass

### Effort: ~1 hour

---

## Summary

| Phase | Item | Files Changed | Effort | Risk |
|-------|------|---------------|--------|------|
| 1A | 006 Constants | 8 files | ~1h | Low |
| 1B | 009 Fetch to core | 6 files + 1 new + 1 deleted | ~1h | Low |
| 2A | 007 Options objects | 2 files (run.ts, cli.ts) | ~1-2h | Low |
| 2B | 008 Config validation | 2 files (api.ts, outbound.ts) | ~1-2h | Low |
| 3 | 005 MCP parity | 1 file (mcp.ts) + imports | ~3-4h | Low |
| 4 | 010 Concurrency | 1 file (api.ts) | ~1h | Low |
| **Total** | | ~15 files across 6 PRs | **~8-12h** | **Low** |

All items are behavior-preserving refactors or additive features. Existing 91 core tests + 136 Raycast tests serve as regression safety net. Run `bun test` after each phase.

## Sources

- Todo files: `todos/005-010` (P2 items from code review)
- Prior art: PR #47 fixed all P1 items using patterns now established in codebase
- Existing patterns: `core/convert.ts` options objects, `shared/errors.ts` error handling, MCP tool structure in `mcp.ts`

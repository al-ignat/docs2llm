---
title: "P1 Code Review Findings: Type Safety, Race Condition, OCR Deduplication"
date: "2026-03-02"
category: logic-errors
tags: [type-safety, concurrency, code-duplication, error-handling, lazy-loading, ocr]
severity: critical
components: [src/core/convert.ts, src/commands/run.ts, src/commands/interactive.ts, src/server/api.ts, src/shared/errors.ts]
pr: "#47"
symptoms:
  - "catch blocks used catch(err: any) across 8 files, losing type information"
  - "Kreuzberg lazy-load singleton could trigger concurrent initWasm() calls"
  - "OCR retry logic duplicated in 5 places across 3 files (~30-40 lines each)"
root_cause: "Loose error typing, async-unsafe singleton pattern, and copy-pasted business logic"
resolution: "errorMessage() utility, promise-based singleton, convertFileWithSmartOcr() extraction"
---

# P1 Code Review Findings: Type Safety, Race Condition, OCR Deduplication

Three non-security P1 findings from the first comprehensive code review of docs2llm.

---

## 1. Replace catch(err: any) with Type-Safe Error Handling

### Problem

21 catch blocks across 8 files used `catch (err: any)` with direct `.message` access. TypeScript's `any` on catch variables defeats type checking — a thrown string, number, or null would crash at `err.message`.

### Solution

Created `errorMessage()` utility in `src/shared/errors.ts`:

```typescript
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

Replaced all `catch (err: any)` → `catch (err)` + `errorMessage(err)`.

**Special cases preserved:**
- `err instanceof Error && err.name === "AbortError"` — property access requires narrowing
- `if (err instanceof ValidationError)` — TypeScript narrows within the branch, `.message` is safe

**Files**: api.ts, run.ts, interactive.ts, cli.ts, watch.ts, paste.ts, mcp.ts, url-safe.ts

### Prevention

- **Rule**: Never use `catch (err: any)`. Use `catch (err)` + `errorMessage()` from `src/shared/errors.ts`.
- **Detection**: `grep -r "catch.*: any" src/` as a pre-commit check.
- **Note**: `isTesseractError()` in `convert.ts` already handled `unknown` correctly — use it as a reference pattern.

---

## 2. Kreuzberg Lazy-Load Race Condition

### Problem

Two functions (`getExtractFile` and `getExtractBytes`) independently checked a null variable, then did async work:

```typescript
// UNSAFE: race window between null-check and assignment
let extractFileFn = null;
async function getExtractFile() {
  if (extractFileFn) return extractFileFn;
  extractFileFn = (await import("@kreuzberg/node")).extractFile;
  return extractFileFn;
}
```

Concurrent calls (e.g., batch mode with `BATCH_SIZE = 4`) both see `null` before either assignment completes → double `initWasm()`, wasted work, potential corruption.

### Solution

Promise-based singleton — store the Promise synchronously (atomic), so all callers await the same in-flight promise:

```typescript
interface KreuzbergModule {
  extractFile: ExtractFileFn;
  extractBytes: ExtractBytesFn;
  isWasm: boolean;
}

let kreuzbergPromise: Promise<KreuzbergModule> | null = null;

function getKreuzberg(): Promise<KreuzbergModule> {
  if (!kreuzbergPromise) {
    kreuzbergPromise = loadKreuzberg(); // synchronous assignment of Promise
  }
  return kreuzbergPromise;
}
```

Also consolidated duplicated module loading (two separate functions → one) and replaced `usingWasm` global with `isWasm` on the returned module.

### Prevention

- **Rule**: For lazy-loaded async singletons, cache the Promise, not the result.
- **Pattern**: `if (!promise) promise = load(); return promise;` (synchronous null-check + promise assignment).
- **Detection**: Grep for `if (!varName) varName = await` — this is the unsafe pattern.

---

## 3. OCR Retry Logic Extraction

### Problem

The "try conversion → detect image/scanned PDF → retry with OCR → handle Tesseract missing" logic was duplicated in 5 places across 3 files, ~30-40 lines per copy. Each copy had identical business logic with slightly different logging.

**Call sites before:**
1. `run.ts` `convertSingleFile` — inbound path (~40 lines)
2. `run.ts` `convertFolder` batch — inside `Promise.allSettled` (~35 lines)
3. `interactive.ts` `convert` — with spinner UI (~30 lines)
4. `interactive.ts` `convertBatchInteractive` — with progress bar (~30 lines)
5. `api.ts` `handleConvert` — HTTP response format (~25 lines)

### Solution

Extracted `convertFileWithSmartOcr()` in `src/core/convert.ts`:

```typescript
export type SmartOcrWarning =
  | "image_auto_ocr"
  | "tesseract_missing_image"
  | "tesseract_missing_scanned"
  | "scanned_pdf_detected";

export interface SmartOcrResult extends ConversionResult {
  usedOcr: boolean;
  warnings: SmartOcrWarning[];
}

export async function convertFileWithSmartOcr(
  filePath: string,
  format: OutputFormat,
  options?: ConvertOptions,
): Promise<SmartOcrResult> { ... }
```

**Key design choice**: The `warnings` array lets callers customize logging for their UI context (CLI, spinner, HTTP) without coupling the core function to presentation.

**Updated 3 of 5 sites** to use the new function:
- `run.ts` `convertSingleFile` and `convertFolder` — automatic mode
- `interactive.ts` `convertBatchInteractive` — automatic mode

**Left as-is (2 sites):**
- `interactive.ts` `convert()` — has interactive prompt for scanned PDF ("Extract text with OCR?")
- `api.ts` `handleConvert` — uses `convertBytes()` not `convertFile()` (operates on uploaded buffers)

### Prevention

- **Rule**: OCR fallback logic belongs in `core/convert.ts`, not in command/server layers.
- **Detection**: Grep for `ocr: { enabled: true, force: true }` in `src/commands/` or `src/server/` — this pattern should only appear in `core/`.
- **Architecture**: `src/core/` owns business logic, `src/commands/` owns UI/UX, `src/server/` owns HTTP transport.

---

## Summary

| Fix | Lines Changed | Net Effect |
|-----|--------------|------------|
| errorMessage() | 8 files, +65 -57 | Type-safe error handling everywhere |
| Promise singleton | 1 file, +25 -35 | No double initWasm(), consolidated loading |
| Smart OCR | 3 files, +91 -115 | -24 lines, single source of truth for OCR retry |

All 101 tests pass (was 97 + 2 todo).

## References

- [Todo #001](../../todos/001-pending-p1-catch-err-any-pattern.md) — catch(err: any)
- [Todo #002](../../todos/002-pending-p1-extract-ocr-retry-logic.md) — OCR retry
- [Todo #003](../../todos/003-pending-p1-kreuzberg-lazy-load-race-condition.md) — Kreuzberg race
- PR: #47

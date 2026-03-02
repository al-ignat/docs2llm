---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, concurrency, typescript]
dependencies: []
---

# Fix Kreuzberg lazy-loading race condition

## Problem Statement
The lazy-loading pattern for Kreuzberg's `extractFile`/`extractBytes` functions uses module-level mutable state without a concurrency guard. If two conversions start concurrently before `getExtractFile()` resolves (which happens in `convertFolder` batch mode), both will attempt the dynamic import simultaneously. For `@kreuzberg/wasm`, `initWasm()` could be called twice.

## Findings
- **TypeScript Reviewer**: P1 — race condition in module-level mutable state
- **Performance Oracle**: P3 — Kreuzberg import race for concurrent calls
- **Architecture Strategist**: P2 — module-level mutable state in long-running MCP context

## Proposed Solutions

### Option A: Promise-based singleton (Recommended)
Replace the null-check-and-assign pattern with a cached promise:
```typescript
let extractFilePromise: Promise<ExtractFileFn> | null = null;
function getExtractFile() {
  if (!extractFilePromise) {
    extractFilePromise = (async () => { /* import logic */ })();
  }
  return extractFilePromise;
}
```
- **Pros**: Standard pattern, guarantees single initialization, zero overhead after first call
- **Cons**: Slightly different error handling (promise rejection is cached)
- **Effort**: Small (30 min)
- **Risk**: Low

## Recommended Action
Option A

## Technical Details
**Affected files:** src/core/convert.ts (lines 38-72, both getExtractFile and getExtractBytes)

## Acceptance Criteria
- [ ] `getExtractFile()` and `getExtractBytes()` use promise-based singleton
- [ ] Concurrent calls during initialization share the same promise
- [ ] `initWasm()` is called at most once
- [ ] Batch conversion with 4+ files works correctly

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Both TypeScript and Performance agents flagged this |

## Resources
- [Current implementation](src/core/convert.ts:38-72)
- [Batch parallelism](src/commands/run.ts:328) — BATCH_SIZE = 4 triggers this

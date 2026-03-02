---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, typescript, quality]
dependencies: []
---

# Replace `catch (err: any)` with type-safe error handling

## Problem Statement
Every `catch` block in the codebase (23 occurrences) uses `catch (err: any)`, bypassing TypeScript's strict mode. Error message extraction uses three inconsistent patterns: `err.message ?? String(err)`, `err.message ?? err`, and bare `err.message`. The `err.message ?? err` form produces `[object Object]` for non-string throws. With strict mode, `catch` gives `unknown` by default — casting to `any` defeats this safety.

## Findings
- **TypeScript Reviewer**: P1 — pervasive type escape hatch across all layers
- **Pattern Recognition**: 3 different error stringification patterns, sometimes in the same file (paste.ts lines 28, 54, 56)
- **Architecture**: `isTesseractError()` in convert.ts already demonstrates the correct pattern using `instanceof Error`

## Proposed Solutions

### Option A: `errorMessage()` utility (Recommended)
Create `src/shared/errors.ts` with `errorMessage(err: unknown): string`. Replace all `catch (err: any)` + message access with `catch (err)` + `errorMessage(err)`.
- **Pros**: Mechanical fix, single source of truth, type-safe
- **Cons**: Touches 23 catch blocks across many files
- **Effort**: Small (1-2 hours)
- **Risk**: Low — behavior-preserving refactor

### Option B: Per-site `instanceof Error` checks
Add `instanceof Error` check at each catch site individually.
- **Pros**: No new utility needed
- **Cons**: More code per site, still 23 changes, pattern could drift again
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Option A

## Technical Details
**Affected files:** run.ts (9), interactive.ts (6), api.ts (5), cli.ts (1), url-safe.ts (1), watch.ts (1), paste.ts (3), mcp.ts (2)

## Acceptance Criteria
- [ ] No `catch (err: any)` patterns remain in `src/`
- [ ] Single `errorMessage()` utility used everywhere
- [ ] Existing error behavior preserved (same messages shown to users)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Pattern recognition found 3 divergent styles |

## Resources
- [isTesseractError example](src/core/convert.ts:188-192) — correct pattern already in codebase

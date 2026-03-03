---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, duplication, architecture]
dependencies: []
---

# Deduplicate shared constants (OUTBOUND_FORMATS, CONVERTIBLE_EXTS, MAX_BYTES)

## Problem Statement
Three sets of constants are independently defined in multiple files:
- `OUTBOUND_FORMATS`: defined in convert.ts AND validate.ts (identical)
- `CONVERTIBLE_EXTS`: defined in scan.ts, watch.ts, AND interactive.ts (scan.ts includes .md, others don't)
- `100 * 1024 * 1024` (100MB limit): defined in run.ts, url-safe.ts, AND api.ts

## Findings
- **Pattern Recognition**: CONVERTIBLE_EXTS ×3, OUTBOUND_FORMATS ×2, MAX_BYTES ×3
- **Architecture Strategist**: P2 — adding a new format requires updating 3+ files

## Proposed Solutions

### Option A: Consolidate into core/ modules (Recommended)
- Export `OUTBOUND_FORMATS` from `core/validate.ts` (or new `core/formats.ts`), import in `core/convert.ts`
- Export `INBOUND_EXTS` and `ALL_CONVERTIBLE_EXTS` from `core/scan.ts`, import in watch.ts and interactive.ts
- Export `MAX_INPUT_BYTES` from `core/url-safe.ts`, import in run.ts and api.ts
- **Effort**: Small (1 hour)
- **Risk**: Low

## Technical Details
**Affected files:** core/convert.ts, core/validate.ts, core/scan.ts, core/url-safe.ts, commands/watch.ts, commands/interactive.ts, commands/run.ts, server/api.ts

## Acceptance Criteria
- [ ] Each constant defined in exactly one place
- [ ] All consumers import from the canonical source
- [ ] `CONVERTIBLE_EXTS` with/without .md is handled via two named exports
- [ ] All tests still pass

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Pattern recognition found 3 sets of duplicated constants |

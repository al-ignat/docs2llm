---
status: complete
priority: p2
issue_id: "009"
tags: [code-review, architecture]
dependencies: []
---

# Fix layer violation: move fetchAndConvert to core/

## Problem Statement
`server/mcp.ts` imports `fetchAndConvert` from `commands/fetch.ts` — a layer violation where the server layer depends on the commands layer. Both should depend on core/ only. The function itself is pure logic (17 lines, calls `safeFetchBytes` and `convertBytes`/`convertHtmlToMarkdown`).

Additionally, `detectMimeFromBytes` (pure logic) lives in `commands/run.ts` and `MIME_MAP` lives in `server/api.ts`. Both are pure data/logic that belong in core/.

## Findings
- **Architecture Strategist**: P1 — server/mcp.ts imports from commands/fetch.ts
- **Architecture Strategist**: P2 — MIME detection logic stranded outside core/
- **Pattern Recognition**: Confirmed — these are pure functions with no UI dependencies

## Proposed Solutions

### Option A: Move to core/ (Recommended)
- Move `fetchAndConvert` to `src/core/fetch.ts` (or `src/core/url-safe.ts`)
- Move `detectMimeFromBytes` to `src/core/mime.ts`
- Move `MIME_MAP` to `src/core/mime.ts`
- Update imports in mcp.ts, run.ts, api.ts
- **Effort**: Small (30-60 min)
- **Risk**: Low — just moving code

## Technical Details
**Affected files:** src/commands/fetch.ts → src/core/fetch.ts, src/commands/run.ts (extract detectMimeFromBytes), src/server/api.ts (extract MIME_MAP)

## Acceptance Criteria
- [ ] No imports from commands/ in server/ layer
- [ ] `fetchAndConvert`, `detectMimeFromBytes`, `MIME_MAP` all live in core/
- [ ] All existing functionality preserved

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Only true architectural violation found |

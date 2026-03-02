---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, architecture, duplication, performance]
dependencies: []
---

# Extract OCR retry logic into single core function

## Problem Statement
The "try conversion → detect scanned PDF → retry with OCR → handle Tesseract missing" logic is copy-pasted in 5 places across 3 files (~80 lines each copy). Each copy has slightly different logging but identical business logic. This also causes a performance issue: scanned PDFs are converted up to 3 times (first without OCR, then detection, then retry with OCR).

## Findings
- **TypeScript Reviewer**: P2 — OCR retry logic duplicated 4 times
- **Architecture Strategist**: P2 — run.ts doing too much (563 lines), OCR retry is the main contributor
- **Performance Oracle**: P1 — triple conversion for scanned PDFs, 2-3x the work per file
- **Pattern Recognition**: P2 — largest duplicated business logic in the codebase (5 copies across run.ts, interactive.ts, api.ts)

## Proposed Solutions

### Option A: `convertFileWithSmartOcr()` in core/convert.ts (Recommended)
Extract into a higher-level function: `convertFileWithSmartOcr(filePath, format, ocr?)` that handles auto-detect + retry internally, returns `{ result, usedOcr }`.
- **Pros**: Single source of truth, all 5 call sites simplified, core/ owns the business logic
- **Cons**: Need to handle the different logging needs (CLI vs interactive vs API)
- **Effort**: Medium (2-3 hours)
- **Risk**: Low — well-understood logic, just consolidating

### Option B: Lightweight pre-check before full extraction
Check if PDF has text layers via metadata-only extraction before doing full Kreuzberg extraction.
- **Pros**: Eliminates wasted double-extraction for scanned PDFs
- **Cons**: Depends on Kreuzberg API supporting metadata-only mode
- **Effort**: Medium
- **Risk**: Medium — Kreuzberg API may not support this

## Recommended Action
Option A

## Technical Details
**Affected files:** src/commands/run.ts (lines 121-163, 341-374), src/commands/interactive.ts (lines 397-436, 587-614), src/server/api.ts (lines 86-127)
**New file:** Logic added to src/core/convert.ts

## Acceptance Criteria
- [ ] Single `convertFileWithSmartOcr()` function in core/convert.ts
- [ ] All 5 OCR retry sites use the new function
- [ ] Scanned PDF detection and retry happens exactly once per file
- [ ] Existing OCR behavior preserved (auto-detect, Tesseract fallback, manual override)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Found by 4 different review agents independently |

## Resources
- [isTesseractError](src/core/convert.ts:188) — already in core, ready to use
- [looksLikeScannedPdf](src/core/convert.ts:194) — already in core, ready to use

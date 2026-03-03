---
status: complete
priority: p3
issue_id: "013"
tags: [code-review, performance, accuracy]
dependencies: []
---

# Improve token counting accuracy and reduce redundant calls

## Problem Statement
Token estimation uses `Math.ceil(countWords(text) * 1.33)` which can be off by 30-50% for code, structured content, or non-English text. The LLM fit feature uses this estimate for truncation/splitting decisions. Additionally, `countWords` is called redundantly 3-4 times on the same text (in formatOutput, estimateTokens, getTokenStats).

## Findings
- **Performance Oracle**: P1 — heuristic token counting, P1 — redundant countWords calls
- **Architecture Strategist**: P2 — token estimation duplicated in Raycast extension

## Proposed Solutions

### Option A: Use tiktoken for decisions, heuristic for display
Use `js-tiktoken` for truncation/splitting decisions. Keep the fast heuristic for progress display. Consolidate `getTokenStats` as single entry point to avoid redundant word counting.
- **Effort**: Medium (2-3 hours)
- **Risk**: Low-Medium — new dependency, need to lazy-load tokenizer

### Option B: Just fix the redundant calls (Minimum)
Make `estimateTokens` accept precomputed word count. Have `getTokenStats` be the single caller.
- **Effort**: Small (30 min)
- **Risk**: Low

## Technical Details
**Affected files:** src/core/tokens.ts, src/core/convert.ts (formatOutput), src/commands/run.ts (getTokenStats calls)

## Acceptance Criteria
- [ ] `countWords` called at most once per text string
- [ ] Token estimates clearly labeled as estimates where used for display
- [ ] (Optional) tiktoken used for truncation/splitting decisions

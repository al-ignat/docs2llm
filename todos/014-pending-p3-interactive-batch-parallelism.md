---
status: complete
priority: p3
issue_id: "014"
tags: [code-review, performance]
dependencies: ["002"]
---

# Parallelize interactive batch conversion

## Problem Statement
`convertBatchInteractive` in interactive.ts processes files sequentially in a for loop, while `convertFolder` in run.ts uses `Promise.allSettled` with `BATCH_SIZE = 4`. Interactive batch of 20 files takes 4x longer than necessary.

## Findings
- **Performance Oracle**: P2 — interactive batch is sequential, CLI batch is parallel

## Proposed Solutions
Apply the same batched `Promise.allSettled` pattern from `convertFolder`. BATCH_SIZE = 4 is a reasonable default.
- **Effort**: Small (1 hour)
- **Risk**: Low — pattern already proven in run.ts

## Technical Details
**Affected files:** src/commands/interactive.ts (convertBatchInteractive)

## Acceptance Criteria
- [ ] Interactive batch uses parallel conversion with BATCH_SIZE = 4
- [ ] Progress reporting still works correctly with parallel conversion
- [ ] Error handling per-file (don't fail entire batch on one error)

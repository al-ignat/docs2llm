---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, typescript, api-design]
dependencies: []
---

# Refactor long positional parameter lists to options objects

## Problem Statement
`convertSingleFile` has 12 positional parameters, `convertFolder` has 9, `convertStdin` has 7. Callers must count positions carefully. Adding new options requires updating every call site. The core layer already uses options objects correctly (`convertFile` in convert.ts, `buildPlan` in validate.ts) — the commands layer doesn't follow the same pattern.

## Findings
- **TypeScript Reviewer**: P2 — `convertSingleFile` has 12 params, impossible to extend
- **Pattern Recognition**: Core functions use options objects, command functions use positional — inconsistent

## Proposed Solutions

### Option A: Options interface per function (Recommended)
Create `ConvertSingleFileOptions`, `ConvertFolderOptions`, `ConvertStdinOptions` interfaces. Keep `filePath` as the first positional arg, bundle the rest into options.
- **Effort**: Medium (1-2 hours)
- **Risk**: Low — mechanical refactor

## Technical Details
**Affected files:** src/commands/run.ts (function signatures + call sites), src/commands/cli.ts (call sites)

## Acceptance Criteria
- [ ] `convertSingleFile(filePath, options)` with typed options object
- [ ] `convertFolder(dir, options)` with typed options object
- [ ] `convertStdin(options)` with typed options object
- [ ] All call sites updated
- [ ] `parseArgs` returns a typed `ParsedArgs` discriminated union

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Core layer already uses this pattern correctly |

---
status: complete
priority: p3
issue_id: "012"
tags: [code-review, typescript, cleanup]
dependencies: []
---

# Remove unnecessary dynamic imports

## Problem Statement
Several files dynamically import modules that are already statically imported at the top of the file:
- run.ts: dynamically imports `path`, `fs`, `splitToFit`, `convertBytes` despite having static imports from same modules
- interactive.ts: dynamically imports `basename`, `resolve`, `dirname` despite static imports from `path`

Also, `cliWarn` and `cliLog` in run.ts are functionally identical (both use console.log with same guard).

## Findings
- **Pattern Recognition**: Unnecessary dynamic imports of already-imported modules
- **Pattern Recognition**: cliWarn === cliLog (both use console.log)

## Proposed Solutions
Remove dynamic imports and use the existing static imports. Fix cliWarn to use console.warn.
- **Effort**: Small (30 min)
- **Risk**: Low

## Technical Details
**Affected files:** src/commands/run.ts, src/commands/interactive.ts

## Acceptance Criteria
- [ ] No dynamic imports of already statically imported modules
- [ ] `cliWarn` uses `console.warn` or has visual differentiation from `cliLog`

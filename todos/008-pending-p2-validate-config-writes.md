---
status: complete
priority: p2
issue_id: "008"
tags: [code-review, security, validation]
dependencies: []
---

# Validate config writes (Pandoc args, outputDir, formData)

## Problem Statement
Multiple input validation gaps in the HTTP API:
1. `PUT /config` accepts arbitrary Pandoc args without allowlist validation at write time (validated only at execution time via sanitizePandocArgs)
2. `PUT /config` accepts arbitrary `defaults.outputDir` without path validation
3. `POST /config/templates` has `format as any` cast instead of proper type checking
4. `formData.get("file") as File` is an unsafe cast — could be a string

## Findings
- **Security Sentinel**: P2 — config stores unsanitized Pandoc args as persistent payload
- **TypeScript Reviewer**: P1 — `as any` cast in template creation, P2 — no runtime validation on config PUT
- **Architecture Strategist**: API bypasses ConversionPlan for some operations

## Proposed Solutions

### Option A: Validate at write time using existing functions (Recommended)
- Call `sanitizePandocArgs()` in `handlePutConfig` and `handleCreateTemplate` before writing to disk
- Validate `outputDir` is a reasonable path
- Replace `format as any` with `format as OutputFormat` after validation
- Add `instanceof File` check for formData file fields
- **Effort**: Small (1-2 hours)
- **Risk**: Low

## Technical Details
**Affected files:** src/server/api.ts (handlePutConfig, handleCreateTemplate, handleConvert, handleConvertOutbound)

## Acceptance Criteria
- [ ] Pandoc args validated at config write time, not just execution time
- [ ] Invalid Pandoc flags rejected with 400 response when saving config
- [ ] `formData.get("file")` checked with `instanceof File` before use
- [ ] No `as any` casts remain in api.ts

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Security + TypeScript agents converged on this |

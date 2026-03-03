---
status: complete
priority: p2
issue_id: "010"
tags: [code-review, performance, security]
dependencies: []
---

# Add server concurrency limits and reduce memory copies

## Problem Statement
The HTTP server has no rate limiting or concurrent request limiting. Each `/convert` request can trigger a heavy Kreuzberg extraction. With 100MB upload limit and no concurrency cap, 3 concurrent uploads = 600MB+ peak memory. Additionally, file uploads create unnecessary intermediate copies (File → ArrayBuffer → Uint8Array).

## Findings
- **Performance Oracle**: P2 — no concurrency limits, triple memory copies for uploads
- **Security Sentinel**: Noted as defense-in-depth concern

## Proposed Solutions

### Option A: Simple semaphore + direct Bun.write (Recommended)
- Add a semaphore limiting concurrent conversions (e.g., max 3)
- Use `Bun.write(tmpIn, file)` directly instead of creating intermediate Uint8Array
- Return 429 Too Many Requests when semaphore is full
- **Effort**: Small (1-2 hours)
- **Risk**: Low

## Technical Details
**Affected files:** src/server/api.ts

## Acceptance Criteria
- [ ] Concurrent conversion operations limited (e.g., max 3)
- [ ] 429 response when limit exceeded
- [ ] File uploads written directly without intermediate Uint8Array copy
- [ ] Existing functionality preserved

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Performance + Security agents both flagged this |

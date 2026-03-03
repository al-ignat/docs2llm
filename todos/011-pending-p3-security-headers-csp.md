---
status: complete
priority: p3
issue_id: "011"
tags: [code-review, security]
dependencies: []
---

# Add security headers and CSP to web UI

## Problem Statement
The web UI response lacks security headers: no Content-Security-Policy, no X-Content-Type-Options, no X-Frame-Options. Also, error messages in API responses leak internal file paths. The Pandoc allowlist includes `--resource-path` and `--embed-resources` which can enable file reads.

## Findings
- **Security Sentinel**: P3 — missing CSP header, error message path leakage, Pandoc allowlist has file-read flags

## Proposed Solutions
Add security headers to HTML response. Sanitize error messages to strip absolute paths. Audit Pandoc allowlist for `--resource-path` and `--embed-resources` necessity.
- **Effort**: Small (1 hour)
- **Risk**: Low

## Technical Details
**Affected files:** src/server/api.ts (response headers, error handlers), src/core/outbound.ts (allowlist review)

## Acceptance Criteria
- [ ] X-Content-Type-Options: nosniff header on all responses
- [ ] X-Frame-Options: DENY on HTML responses
- [ ] Error messages sanitized to remove absolute paths
- [ ] Pandoc allowlist reviewed for file-read flags

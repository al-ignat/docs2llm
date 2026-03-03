---
status: complete
priority: p3
issue_id: "015"
tags: [code-review, testing]
dependencies: []
---

# Expand test coverage to commands/ and server/ layers

## Problem Statement
Tests exist only for core/ modules (91 tests). The commands/ layer (2,348 lines) and server/ layer (1,431 lines) have zero tests — that's ~75% of the codebase untested. API endpoints are pure request-in/response-out functions that are straightforward to test.

## Findings
- **Architecture Strategist**: P3 — no integration tests for API, MCP, or CLI
- **Learnings Researcher**: v2 audit noted absence of test suite as informational

## Proposed Solutions
Start with API endpoint tests (highest ROI — pure functions, no mocking needed). Then MCP tool tests. CLI tests are lower priority (tested through usage).
- **Effort**: Large (ongoing)
- **Risk**: Low

## Technical Details
**Priority test targets:**
1. API endpoints: POST /convert, POST /convert/url, POST /convert/clipboard, POST /convert/outbound
2. MCP tools: convert_file, convert_url, list_formats
3. CLI: parseArgs edge cases

## Acceptance Criteria
- [ ] API endpoint tests for core conversion routes
- [ ] MCP tool tests for all exposed tools
- [ ] CI runs both core and API tests

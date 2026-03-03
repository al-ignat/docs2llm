---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, architecture, agent-native]
dependencies: []
---

# Expand MCP server to reach feature parity

## Problem Statement
The MCP server exposes only 3 of 15 non-interactive capabilities (20% parity): `convert_file`, `convert_url`, `list_formats`. Critical gaps: no outbound conversion (md→docx/pptx/html), no batch/folder conversion, no clipboard/HTML conversion, no config/template access, no chunking support.

## Findings
- **Agent-Native Reviewer**: MCP parity at 20%, API parity at 53%
- **Architecture Strategist**: Core modules are well-factored — closing the gap is a wiring exercise
- mcp.ts is only 106 lines; adding 4-5 tools following existing patterns brings coverage to 70-80%

## Proposed Solutions

### Option A: Add 5 priority MCP tools (Recommended)
1. `convert_to_document` — outbound (md → docx/pptx/html)
2. `convert_folder` — batch directory conversion
3. `convert_html` — HTML string → Markdown (covers clipboard use case)
4. `list_templates` + `get_config` — read-only config access
- **Effort**: Medium (3-4 hours)
- **Risk**: Low — all core functions already exist

## Technical Details
**Affected files:** src/server/mcp.ts (add tools), src/core/ (import existing functions)

## Acceptance Criteria
- [ ] `convert_to_document` tool works for docx, pptx, html output
- [ ] `convert_folder` tool converts all files in a directory, returns summary
- [ ] `convert_html` tool accepts HTML string, returns Markdown
- [ ] `list_templates` tool returns available template names and configs
- [ ] `get_config` tool returns current resolved configuration

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Agent-native reviewer scored 20% MCP parity |

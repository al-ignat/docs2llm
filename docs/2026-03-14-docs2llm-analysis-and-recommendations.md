# docs2llm Analysis, Findings, and Recommendations

Date: 2026-03-14
Author: Codex

## Executive Summary

`docs2llm` is already a strong personal product. It is not just a converter. It is a local-first document intake tool for an AI-heavy knowledge workflow:

- turn work artifacts into prompt-ready Markdown quickly
- preserve enough structure for LLM use
- keep the tool close to where daily work happens: terminal, clipboard, browser, Raycast, MCP
- optionally round-trip Markdown back into DOCX, PPTX, and HTML

The repo also clearly serves a second purpose: it is a public artifact that demonstrates product taste, technical initiative, and AI-first working habits. In that sense it already succeeds. It has a coherent story, visible iteration, and non-trivial functionality.

The main problem is not ambition. The main problem is that the product foundation is still too dependent on one parser path and too weakly instrumented to improve conversion quality systematically. The codebase has grown into multiple surfaces before building a quality evaluation loop. That is why the tool feels useful but not trustworthy enough yet.

My main recommendation is:

- keep the current repo and product spirit
- stop treating Kreuzberg as the full product foundation
- evolve `docs2llm` into an orchestration layer over multiple extraction engines
- build a real evaluation corpus from your daily work artifacts
- make quality, not more surfaces, the next release theme

## What The Repo Does Today

At the product level, `docs2llm` currently offers:

- CLI conversion of files, folders, URLs, stdin, and clipboard content
- interactive terminal wizard for common PM-like workflows
- local web UI for drag-drop and URL conversion
- Raycast extension for keyboard-first usage on macOS
- MCP server so AI tools can invoke document conversion
- outbound conversion from Markdown into DOCX, PPTX, and HTML via Pandoc
- token estimation, LLM fit hints, chunking, OCR support, config/templates

At the architecture level, the repo is organized sensibly:

- `src/core/` holds the business logic
- `src/commands/` holds CLI and wizard flows
- `src/server/` holds the web UI and MCP transport
- `raycast/` is a separate integration layer for daily local usage

That structure is good enough to keep. The repo does not need a framework rewrite. It needs a stronger extraction strategy and a stronger release discipline.

## Why You Probably Created It In The First Place

The git history makes the intent unusually clear.

The project started as `convert-the-doc`, a minimal CLI that converted documents into LLM-friendly text. Then it added:

- smart file picking
- outbound conversion
- config and templates
- clipboard flows
- token stats
- a web UI
- standalone binary output
- Raycast integration
- MCP support

This sequence strongly suggests a personal workflow origin, not a market-first origin.

The likely original motivation was:

- you work with messy source material all day: exported PDFs, decks, docs, copied HTML, email content, spreadsheets, and browser pages
- you want clean text fast, without opening multiple apps or manually reformatting
- you want something that fits an AI-assisted PM workflow rather than a generic “document parsing platform”
- you wanted a real maker artifact that signals technical range, curiosity, and speed

That product thesis still holds. It is worth preserving.

## What Is Strong Already

### Product strengths

- The scope matches a real daily workflow rather than a fake demo problem.
- The interfaces are pragmatic: CLI, Raycast, web UI, and MCP all map to real usage moments.
- The outbound side is genuinely useful for PM work because it closes the loop from AI draft back to deliverable format.
- The repo feels intentional rather than generic. It has a voice and a clear “mini-tool” identity.

### Engineering strengths

- The code is organized into reasonable layers.
- The security work is serious for a solo utility project.
- There is meaningful test coverage across core logic and Raycast.
- The compiled binary path is a strong distribution asset.
- The HTML route was already improved with a Pandoc-first path for merged table cells, which is exactly the right kind of quality-focused iteration.

### Positioning strengths

- The repo is legible enough for a public GitHub audience.
- It demonstrates AI-assisted shipping without looking fake or low-effort.
- It is small enough to feel personal and believable.

## Main Findings

## 1. The core product problem is quality trust, not missing features

You already have more surfaces than most tools in this category need.

The real unresolved question is:

“When I run this on the kinds of documents I actually deal with at work, how often is the output good enough without manual cleanup?”

Right now the repo cannot answer that well because there is no evaluation harness based on realistic fixtures and expected outputs.

That means every quality discussion is still anecdotal.

## 2. The current extraction foundation is too single-engine

For most inbound formats, the tool effectively means:

- send the file to Kreuzberg
- accept the Markdown
- add a few heuristics around OCR and formatting

That is fine for a first version. It is not enough for a tool whose value is perceived output quality.

This matters because different document classes need different strengths:

- exported article/web HTML needs main-content extraction
- Outlook-style HTML needs cleanup and structure rescue
- scanned PDFs need OCR confidence and page-level handling
- PowerPoint needs slide-aware extraction
- spreadsheets need table-aware rendering
- ugly enterprise PDFs often need a stronger parser than “best effort Markdown”

One parser can be part of the product. It should not be the product.

## 3. The project expanded breadth before establishing a measurement loop

The roadmap and commit history show a common solo-builder pattern:

- first solve the personal pain
- then add more entry points to make it easier to use
- then harden around issues discovered along the way

That pattern is reasonable, but it creates a trap:

- the product feels rich
- the usage becomes real
- but the core output quality is still only loosely understood

This is exactly where `docs2llm` is now.

## 4. The repo’s public story is slightly broader than its actual differentiator

The README currently tells a very broad story:

- 75+ formats
- multiple interfaces
- inbound and outbound
- OCR
- chunking
- local web UI
- MCP

That is all true, but it dilutes what is distinctive.

The distinctive story is narrower and stronger:

“A local-first tool for turning real work artifacts into prompt-ready Markdown fast, with interfaces that fit how a power user actually works.”

That is a better public identity.

## 5. There are still release-discipline gaps

The repo looks more mature than it really is in a few places:

- the documented typecheck command is not wired correctly in this checkout
- `bun test` failed locally because the API test server bootstrap is brittle on the current runtime
- some behavior is duplicated in Raycast rather than strictly consumed through a stable internal contract

These are not catastrophic issues. They do mean the repo is not yet in “publish confidently and forget about it” shape.

## 6. Raycast is probably your highest-value interface

For your stated daily usage, Raycast is likely the real product center of gravity.

Why:

- it fits a PM’s fast context switching
- it makes the tool feel native to your daily machine
- it is visible and impressive in a way a CLI is not
- it reinforces the “AI-first but practical” identity

The CLI should remain the canonical engine surface.
The Raycast extension should be treated as the flagship user experience.

## Where Quality Likely Breaks Today

Based on the code, current design, and the kind of documents this tool targets, the most likely conversion weaknesses are:

- PDFs with complex layout, sidebars, forms, and mixed text/image pages
- enterprise HTML and Outlook email HTML
- spreadsheets where cell relationships matter more than plain text export
- slide decks where speaker flow, notes, and slide boundaries matter
- content where the “main article” must be extracted from cluttered webpages
- scanned or partially scanned PDFs where OCR should be selective rather than global

The recent Pandoc-first HTML path is a strong sign that you are already hitting this exact class of issue in practice.

## Comparison Of Possible Foundations

## Option A: Keep Kreuzberg as the only parser

Pros:

- lowest engineering effort
- preserves your current architecture almost entirely
- local-first and simple
- no large ecosystem or deployment shift

Cons:

- limited control over quality improvements
- weak answer to “why is this output bad?”
- hard to optimize by document type
- you remain vulnerable to upstream parser ceilings

Verdict:

- not enough if conversion quality is your main dissatisfaction

## Option B: Make docs2llm a multi-engine orchestrator

Pros:

- keeps the current product and repo identity
- lets you route by document class
- gives you a path to measurable improvement
- avoids betting the whole tool on a single parser philosophy

Cons:

- more engineering complexity
- requires evaluation fixtures and routing logic
- requires stronger contracts between extraction and formatting layers

Verdict:

- best next move

## Option C: Rebuild around Docling

Docling is the strongest candidate if you want a more modern extraction core without abandoning the spirit of the tool.

Why it is attractive:

- built around document understanding, not just format conversion
- well suited to structured outputs and downstream AI workflows
- local-first friendly
- increasingly credible in document AI workflows

What this would mean:

- use Docling as a primary or optional backend for hard document classes
- keep Bun/TypeScript as the product shell
- call into Python as a subprocess backend if needed

Verdict:

- very promising
- worth prototyping as a candidate engine, not necessarily as a full rewrite

## Option D: Rebuild around Marker

Marker is compelling for hard PDFs and visually messy extraction tasks.

Pros:

- strong reputation for PDF-to-Markdown quality
- more focused on the exact “good markdown from ugly docs” problem

Cons:

- more specialized
- licensing and packaging need care
- better as a targeted backend than a universal foundation

Verdict:

- excellent benchmark and possible PDF specialist backend
- not my first choice for the whole product foundation

## Option E: Use managed parsers like LlamaParse or Mistral OCR

Pros:

- potentially better quality on difficult documents
- fast access to strong OCR / document AI

Cons:

- less local-first
- cost, privacy, latency, and dependency tradeoffs
- weakens the “personal fast local tool” story

Verdict:

- useful as optional premium fallbacks
- not a good core identity for this tool

## Option F: Add Defuddle for webpage/article extraction

`defuddle` is interesting and relevant, but it is not a replacement foundation for `docs2llm`.

Based on its public README, Defuddle is designed to:

- extract the main content from web pages
- remove clutter and non-essential elements
- produce cleaner, more standardized HTML
- optionally output Markdown
- serve as a better input for downstream HTML-to-Markdown conversion

That makes it a strong fit for one specific subproblem:

- web article extraction
- web clipping
- HTML cleanup before Markdown conversion

It does not solve your broader problem set:

- PDFs
- Office documents
- scanned docs
- spreadsheets
- local file conversion generally

Defuddle is therefore best thought of as:

- an upstream enhancement for the URL and clipboard-HTML path
- possibly a better “article mode” than generic HTML parsing
- not a repo-wide foundation swap

Best use of Defuddle:

- add an optional `webMode: article` or auto-detect route for web pages
- run `defuddle` first on fetched HTML
- then convert its standardized HTML to Markdown
- benchmark against current `convertHtmlToMarkdown` on a corpus of real pages

This is worth trying. It is probably the fastest high-upside quality experiment in the whole repo.

## Recommended Product Direction

## The spirit to preserve

Keep these traits:

- small, sharp, personal
- local-first by default
- works where you already work
- optimized for AI workflows, not archival purity
- pragmatic over platform-heavy

## The direction to change

Change these:

- from “one parser wrapped in many interfaces”
- to “one product wrapped around multiple extraction strategies”

That is the real next maturity step.

## Recommended Technical Strategy

## 1. Introduce an extraction adapter layer

Create a core abstraction like:

- `extract(file|bytes|html|url, strategy, options) -> normalized document result`

Supported strategies initially:

- `kreuzberg`
- `pandoc_html`
- `defuddle_html`
- `docling`
- optionally `marker_pdf`

This is the most important architectural move.

## 2. Define a normalized intermediate document contract

Do not let every backend return arbitrary final Markdown only.

At minimum define a result shape containing:

- extracted markdown
- extracted plain text
- metadata
- structural hints
- tables count
- image/OCR flags
- quality/confidence indicators
- engine used
- warnings

That gives you a stable product surface while changing parsers behind it.

## 3. Build a real evaluation corpus

Use your actual work artifacts, anonymized where needed.

Suggested fixture groups:

- article webpages
- ugly internal-web HTML copies
- Outlook-exported HTML email
- digital PDFs
- scanned PDFs
- slide decks
- spreadsheets
- DOCX policy/spec documents

For each fixture, define:

- source file
- expected “good enough” markdown
- pass/fail rubric
- known failure modes

Without this, you will keep optimizing based on memory.

## 4. Add document-type routing

Examples:

- fetched article HTML -> Defuddle first
- generic HTML / Outlook HTML -> Pandoc-first cleanup path
- hard PDFs -> benchmark Kreuzberg vs Docling vs Marker
- scanned docs -> OCR-aware backend with stronger confidence signals

## 5. Treat quality as a release gate

Before any publish push, require:

- eval corpus score did not regress
- tests pass
- typecheck passes
- binary build passes
- Raycast tests and build pass

## Recommendations By Priority

## Highest priority

- stop feature expansion for a cycle
- fix repo release discipline
- build quality evaluation corpus
- add extraction adapter layer
- prototype Defuddle for URL/article workflows
- prototype Docling on the hardest real documents

## Medium priority

- reduce duplication between core and Raycast
- tighten typecheck/build/test CI
- improve OCR routing and confidence logic
- improve MIME detection and document sniffing
- rewrite the public positioning around the true use case

## Lower priority

- macOS wrapper app
- broader distribution polish
- more web UI feature work
- more MCP surface area

## Publish Recommendation

You should publish this, but not as “the universal best document parser.”

You should publish it as:

- your personal AI document workflow tool
- local-first, practical, and fast
- honest about strengths and limitations
- visibly evolving through real usage

That story is credible and attractive.

A repo like this becomes more impressive, not less, when it includes:

- a benchmark corpus
- a short “where it works best / where it struggles” section
- visible design decisions about local-first tradeoffs

That makes the project look serious rather than inflated.

## Final Recommendation

If I were optimizing for your stated goals, I would do this:

- keep `docs2llm` as the product shell
- keep Bun/TypeScript for CLI, Raycast, server, and overall developer ergonomics
- keep Pandoc for outbound conversion
- keep the current HTML cleanup path as a fallback
- add Defuddle specifically for article/webpage cleanup
- prototype Docling as the main next-gen extraction backend
- benchmark Marker only for hard PDF cases
- do not rewrite the entire product around a managed cloud parser

That keeps the spirit intact while giving the repo a much stronger technical future.

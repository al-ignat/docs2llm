# docs2llm Execution Roadmap

Date: 2026-03-14
Author: Codex

## Goal

Turn `docs2llm` from a promising personal utility into a trustworthy, publishable, daily-use tool with measurable conversion quality and a sharper public story.

This roadmap assumes one strategic decision:

- no full rewrite yet
- keep the current repo
- prioritize quality foundation over new surfaces

## North Star Outcomes

By the end of this roadmap, `docs2llm` should be able to say:

- it has a measurable quality benchmark on realistic documents
- it routes different document classes through the best available extraction path
- it has a reliable release pipeline
- it has a clearer public positioning
- it is strong enough for you to use daily with confidence

## Success Metrics

Define these before execution starts.

### Quality metrics

- benchmark corpus exists with at least 40 representative fixtures
- every fixture has a document class label and expected output notes
- overall “good enough without manual cleanup” score is tracked by engine
- table preservation score is tracked separately
- webpage/article extraction score is tracked separately
- OCR success score is tracked separately

### Engineering metrics

- `typecheck`, tests, binary build, and Raycast tests/build all pass in CI
- no red default branch
- extraction backends use a shared normalized result contract

### Product metrics

- you actually use the tool daily for at least 2 consecutive work weeks
- at least 80% of your own real conversions use the primary supported flow without fallback to manual cleanup
- README and screenshots tell a focused story in under 2 minutes of reading

## Execution Principles

- optimize for your real work artifacts first
- do not chase “all document types equally”
- benchmark before rewriting
- add one backend at a time
- treat Raycast as the highest-value user surface
- keep the product small and opinionated

## Phase 0: Stabilize The Repo

Target duration: 2 to 4 days

Objective:

- make the repo trustworthy enough to change safely

Tasks:

- add proper TypeScript dependency and a real `typecheck` script
- fix the failing API test bootstrap behavior on the current Bun runtime
- run root tests and Raycast tests in CI
- make the build workflow reflect actual publishable artifacts
- verify binary build on a clean machine or containerized environment

Deliverables:

- green CI on main
- reproducible local verification checklist
- updated contributor/developer commands in README or `CLAUDE.md`

Exit criteria:

- no known broken verification command remains in docs or CI

## Phase 1: Build The Evaluation Harness

Target duration: 4 to 7 days

Objective:

- stop judging quality by feel

Tasks:

- create a `fixtures/` or `eval/` directory structure
- collect 40 to 50 anonymized real-world documents
- define fixture categories:
  - article HTML
  - generic webpage HTML
  - Outlook/email HTML
  - digital PDF
  - scanned PDF
  - PPTX
  - DOCX
  - XLSX
- create an evaluation schema per fixture:
  - source path
  - document class
  - expected output notes
  - known weak points
  - pass/fail rubric
- build a script that runs extraction and writes comparable outputs by engine
- define simple scoring:
  - structure preserved
  - tables preserved
  - headings preserved
  - noise removed
  - OCR readable
  - link fidelity acceptable

Deliverables:

- benchmark harness
- first baseline run using the current stack
- documented top 10 failure patterns

Exit criteria:

- you can answer “what exactly is bad today?” with examples and counts

## Phase 2: Introduce The Extraction Adapter Layer

Target duration: 4 to 6 days

Objective:

- decouple the product from one parser

Tasks:

- define a normalized extraction result interface
- separate “extract” from “format/write/present”
- create backend adapters for:
  - current Kreuzberg flow
  - current Pandoc-first HTML flow
- refactor CLI, server, MCP, and Raycast to depend on the shared extraction contract
- include engine identity and warnings in the result payload

Suggested contract fields:

- `engine`
- `sourceType`
- `contentMarkdown`
- `contentText`
- `metadata`
- `qualitySignals`
- `warnings`
- `timings`

Deliverables:

- shared extraction contract in `src/core/`
- no UI layer directly tied to a specific parser implementation

Exit criteria:

- swapping or adding a backend is possible without UI-layer rewrites

## Phase 3: Improve Web And HTML Quality First

Target duration: 3 to 5 days

Objective:

- get the fastest high-upside quality gains

Why this phase first:

- HTML and copied web content are likely frequent PM inputs
- Defuddle is easy to prototype compared to heavier document backends
- you already discovered value in Pandoc-first HTML handling

Tasks:

- add a Defuddle prototype path for fetched article-like pages
- benchmark current HTML path vs Defuddle-first path
- test on:
  - long-form articles
  - cluttered marketing pages
  - copied web selections
  - email/newsletter HTML
- decide routing rules:
  - article-like HTML -> Defuddle first
  - Outlook/email HTML -> Pandoc cleanup path
  - fallback -> current HTML extraction path
- expose engine info in debug or verbose output

Deliverables:

- measured Defuddle experiment
- documented routing decision

Exit criteria:

- HTML/article extraction quality clearly improves or Defuddle is rejected with evidence

## Phase 4: Prototype Next-Gen Document Backends

Target duration: 1 to 2 weeks

Objective:

- determine whether Docling or another backend should become primary for difficult docs

Priority order:

1. Docling
2. Marker for hard PDFs only
3. optional managed fallback later

Tasks for Docling:

- build a narrow prototype wrapper
- run it only on benchmark fixtures first
- compare against Kreuzberg on:
  - PDFs
  - DOCX
  - PPTX
  - tables
  - structure retention

Tasks for Marker:

- test only on the hardest PDF subset
- measure quality gain vs complexity and licensing constraints

Decision questions:

- which backend wins on your real documents
- which backend is operationally acceptable
- which backend fits the local-first product story

Deliverables:

- benchmark report: Kreuzberg vs Docling vs optional Marker subset
- primary backend recommendation

Exit criteria:

- choose one of:
  - keep Kreuzberg primary
  - move to Docling primary
  - hybrid routing by document class

## Phase 5: Fix OCR And Document Routing

Target duration: 3 to 5 days

Objective:

- remove brittle heuristics that harm trust

Tasks:

- replace the current “content length < 50” scanned-PDF heuristic
- add stronger page-level or confidence-aware OCR routing where possible
- improve MIME and file sniffing
- distinguish:
  - image-only docs
  - mixed text/image docs
  - digital docs with sparse text
- improve warnings so users know what happened:
  - OCR forced
  - OCR skipped
  - mixed-content fallback
  - low-confidence output

Deliverables:

- more reliable OCR logic
- better user-visible quality signals

Exit criteria:

- no more obviously wrong OCR retries on sparse but valid documents

## Phase 6: Consolidate Product Surface And Daily Workflow

Target duration: 4 to 6 days

Objective:

- make the best interface excellent instead of every interface merely available

Priority:

1. Raycast
2. CLI
3. web UI
4. MCP

Tasks:

- reduce duplicate logic between Raycast and core
- make Raycast rely on more stable machine-readable core outputs
- define the canonical fast paths:
  - convert file to Markdown
  - convert clipboard/web content to Markdown
  - export Markdown to DOCX/PPTX
- simplify or hide lower-value options from the main UX if needed
- add lightweight conversion history only if it helps your own usage

Deliverables:

- a sharper “daily driver” experience
- less drift between interfaces

Exit criteria:

- your own primary workflows feel fast and predictable through one or two preferred entry points

## Phase 7: Reposition For Publish

Target duration: 2 to 4 days

Objective:

- present the repo honestly and strongly

Tasks:

- rewrite README around the true use case
- lead with:
  - what problem it solves
  - who it is for
  - how it fits AI-heavy work
- add benchmark summary section
- add “best for / not best for” section
- add screenshots or GIFs for Raycast and CLI flows
- tighten roadmap around quality and core workflows, not surface sprawl

Suggested positioning:

- local-first document prep for AI workflows
- practical converter for PMs, researchers, and operators
- built around real work artifacts, not toy examples

Deliverables:

- stronger README
- stronger launch narrative
- better credibility for public readers

Exit criteria:

- a new visitor can understand the tool and trust its scope in under 2 minutes

## Phase 8: Publish Carefully

Target duration: 2 to 5 days

Objective:

- release with confidence, not just availability

Tasks:

- verify install path for standalone binary
- verify Homebrew or direct-download packaging
- test on a machine without Bun
- confirm Pandoc dependency story is clear
- publish with a changelog framed around quality improvements
- optionally post a short writeup on why you built it and what it is good at

Deliverables:

- tagged release
- clean install instructions
- proof that the tool works outside the dev machine

Exit criteria:

- you would recommend it to another power user without caveats you cannot explain

## Suggested Work Breakdown For The Next 3 Weeks

## Week 1

- Phase 0: repo stabilization
- Phase 1: evaluation harness and fixture collection
- produce baseline benchmark report

## Week 2

- Phase 2: extraction adapter layer
- Phase 3: Defuddle experiment for web/article HTML
- begin Phase 4: Docling prototype

## Week 3

- finish Phase 4 backend comparison
- Phase 5 OCR/routing improvements
- Phase 6 surface consolidation
- begin README and publish prep

## Concrete Backlog To Start With

Start with these 12 tasks in order:

1. Add proper `typecheck` support and fix CI commands.
2. Fix `bun test` API bootstrap instability.
3. Create `eval/fixtures/` and fixture metadata schema.
4. Add 10 real HTML/web fixtures and 10 real PDF fixtures.
5. Add baseline benchmark runner for current extraction stack.
6. Define normalized extraction result interface in `src/core/`.
7. Refactor current Kreuzberg and HTML paths behind adapters.
8. Prototype Defuddle for URL/article HTML.
9. Compare current HTML path vs Defuddle-first path on benchmark fixtures.
10. Prototype Docling on the hardest 10 to 15 document fixtures.
11. Decide routing policy by document class.
12. Rewrite README around the narrower, stronger product story.

## Things To Explicitly Defer

Defer these until the quality foundation is stronger:

- macOS wrapper app
- more Raycast commands
- web UI polishing beyond essential fixes
- larger MCP tool surface
- advanced history/state features
- broad “works for everything” marketing language

## Risks And Mitigations

### Risk: backend experimentation turns into rewrite churn

Mitigation:

- force all experiments through the adapter layer
- benchmark first
- do not replace the core shell until evidence supports it

### Risk: fixture creation is tedious and gets skipped

Mitigation:

- use your own recurring work artifacts
- start small
- accept “good enough anonymization”
- prioritize representative pain over completeness

### Risk: surface complexity keeps growing

Mitigation:

- freeze new UX surfaces until quality metrics improve
- require that new work either improves benchmark score or release reliability

### Risk: cloud APIs tempt a shortcut

Mitigation:

- keep them optional and last
- preserve the local-first product identity

## Final Recommendation

The best execution path is:

- stabilize the repo
- measure quality
- add a backend abstraction
- experiment with Defuddle for web/article extraction
- experiment with Docling for difficult structured documents
- keep Raycast and CLI as the primary user-facing surfaces
- publish only after the benchmark and release pipeline are credible

That path preserves everything that makes the repo interesting while directly addressing the reason you are not fully happy with it yet.

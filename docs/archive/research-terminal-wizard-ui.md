# Terminal CLI Wizard UI/UX: Research & Alternatives Analysis

> Research conducted February 2026. Evaluates the current `docs2llm` wizard implementation and compares it against the full landscape of terminal interactive UI libraries.

---

## Table of Contents

1. [Current Implementation Analysis](#current-implementation-analysis)
2. [Library-by-Library Comparison](#library-by-library-comparison)
3. [Non-JS Libraries (For Inspiration)](#non-js-libraries-for-inspiration)
4. [Modern CLI Wizard UX Patterns](#modern-cli-wizard-ux-patterns)
5. [Feature Comparison Matrix](#feature-comparison-matrix)
6. [Recommendations](#recommendations)

---

## Current Implementation Analysis

### Library Used: `@clack/prompts` (v0.10)

docs2llm uses `@clack/prompts` across four wizard files:

| File | Purpose |
|------|---------|
| `interactive.ts` | Main conversion wizard (file picker, format picker, output dir, post-conversion menu) |
| `init.ts` | Setup/configuration wizard (defaults, named templates) |
| `config-wizard.ts` | View/edit configuration files |
| `paste.ts` | Clipboard conversion wizard |

### UI Components Currently Used

| Component | Usage |
|-----------|-------|
| `p.intro()` / `p.outro()` | Welcome/closing messages |
| `p.select()` | Single choice from list (format, template, directory) |
| `p.multiselect()` | Multiple choices (template features like TOC, standalone, CSS) |
| `p.confirm()` | Yes/No (overwrite, OCR, "add another template?") |
| `p.text()` | Text input with validation (file paths, template names) |
| `p.spinner()` | Loading indicator during conversion/OCR |
| `p.log.info/warn/error/success()` | Status messages |
| `p.cancel()` / `p.isCancel()` | Cancellation handling |

### Current UX Patterns

- **Sequential prompt flow** with conditional branching
- **Loop pattern** for repeated sections (e.g., adding multiple templates)
- **Smart defaults** (pre-selects existing config, shows configured defaults first)
- **Hints** on options (file sizes, types, counts)
- **Separators** using special `"__sep__"` values to group options
- **Validation** on text inputs (no spaces in template names, required fields)
- **Progressive disclosure** (basic options first, advanced Pandoc args available)

### Current Limitations

1. **No searchable/filterable lists** — When many files exist, user must scroll through all options
2. **No autocomplete** — File path input is plain text with no tab-completion
3. **No grouped selections with headers** — Separators are a workaround, not true grouped options
4. **No progress bar** — Only spinner (no percentage-based progress for large conversions)
5. **No breadcrumbs/step indicators** — User doesn't know where they are in the wizard flow
6. **No undo/back navigation** — Can't go back to a previous step
7. **No keyboard shortcuts** — No quick-jump to options (e.g., pressing 'w' for Word)
8. **No theme customization** — Locked to Clack's default visual style
9. **No streaming output** — Can't show real-time conversion output during long operations

---

## Library-by-Library Comparison

### 1. @clack/prompts v1.0 (Current — Upgraded)

**What's new in v1.0 (released Feb 2025):**

| New Feature | Description |
|-------------|-------------|
| **Autocomplete** | Type-ahead search with filterable option list |
| **Autocomplete Multiselect** | Combined type-ahead + multi-select in one UI |
| **Progress bar** | Visual progress indicator with percentage |
| **Path prompt** | File/directory path selection with auto-suggest |
| **taskLog** | Real-time output from sub-processes, cleared on success |
| **Stream** | Log messages from async iterables (useful for LLM streaming) |
| **Spinner cancel detection** | Graceful CTRL+C handling with custom messages |
| **Selectable groups** | `selectableGroups: false` for group headers without selection |

**Verdict:** Upgrading from v0.10 to v1.0 would address several current limitations (autocomplete, progress bar, path prompt, streaming) with zero migration cost since it's the same library. This is the lowest-friction improvement path.

- **Stars:** ~4k GitHub
- **npm downloads:** ~2.5M/week
- **TypeScript:** First-class
- **Maintenance:** Active (v1.0.1 released Feb 2025)

---

### 2. @inquirer/prompts (v8.2+)

The modernized, modular rewrite of the classic Inquirer.js.

**Architecture:** Each prompt is an independent function taking a config object. Built on `@inquirer/core` which implements a React hooks-like system (without JSX).

**Built-in prompts:**
- Input, Number, Confirm, Select, Checkbox, Password, Editor
- Community: Checkbox Plus Plus (searchable multiselect with highlighting)

**Key differentiators:**
- `AbortController` / `AbortSignal` cancellation support (including timeouts)
- Hooks system (`useState`, `useKeypress`) for building custom prompts
- Progressive migration from legacy `inquirer` to `@inquirer/prompts`
- CLI-mode: prompts usable directly via `npx`

**Pros:**
- Massive ecosystem and community
- Most mature interactive prompt library in Node.js
- Custom prompt creation via hooks is powerful and familiar to React devs
- Each prompt is a separate npm package (tree-shakeable)

**Cons:**
- Heavier than Clack (more dependencies)
- Visual style is more utilitarian / less polished than Clack
- No built-in spinner, progress bar, or logging utilities (prompt-focused only)
- Requires composing with other libraries for complete wizard UX

- **Stars:** ~21k GitHub
- **npm downloads:** ~35M/week (legacy `inquirer`)
- **TypeScript:** Full support
- **Maintenance:** Very active

---

### 3. Enquirer

**Author:** Jon Schlinkert. Used by ESLint, Webpack, Yarn, Salesforce, Cypress, AWS Amplify, etc.

**Unique prompt types not found elsewhere:**
- **Form** — Multiple inputs rendered as a form
- **Survey** / **Scale** — Likert-scale and survey-style prompts
- **Snippet** — Template-based input with placeholders
- **Sort** — Drag-to-reorder list items
- **Quiz** — Multiple choice quiz mode
- **BasicAuth** — Username + password combined prompt
- **AutoComplete** — Type-ahead filtering

**Key differentiators:**
- Loads in ~4ms (extremely fast startup)
- Only 1 dependency (`ansi-colors`)
- Keypress recording/playback (useful for demos/tutorials)
- Custom prompt types via extendable base `Prompt` class

**Pros:**
- Richest set of built-in prompt types
- Very lightweight despite the feature set
- Excellent for complex data-entry wizard flows (Form, Survey, Snippet)

**Cons:**
- Maintenance has slowed significantly (169 open issues, 37 open PRs)
- No TypeScript types shipped (community `@types` available)
- API is slightly older-style compared to Clack/Inquirer modern versions
- No built-in progress/spinner/logging

- **Stars:** ~7.9k GitHub
- **npm downloads:** ~15M/week
- **TypeScript:** Via `@types/enquirer`
- **Maintenance:** Slowing

---

### 4. Prompts (by terkelg)

**Philosophy:** Lightweight, minimal, zero-config.

**Prompt types:** Text, Password, Number, Confirm, Select, Multiselect, Autocomplete, Date, Toggle

**Key differentiators:**
- Only 2 dependencies (`kleur`, `sisteransi`)
- Unified API — all prompts follow the same pattern
- `onSubmit` / `onRender` / `onState` callbacks for each prompt
- Programmatic answer injection for testing

**Pros:**
- Extremely lightweight (~37M weekly downloads)
- Simple, clean API
- Built-in Date prompt (unique among competitors)

**Cons:**
- No ESM support (CJS only — open issue #358)
- Last release over 2 years ago (v2.4.2)
- No TypeScript natively (needs `@types/prompts`)
- No spinner, progress, logging, or advanced UI components
- Limited customization options

- **Stars:** ~8.8k GitHub
- **npm downloads:** ~37M/week
- **TypeScript:** Via `@types/prompts`
- **Maintenance:** Effectively unmaintained

---

### 5. Ink + Ink UI (React for CLIs)

**Architecture:** Full React renderer for the terminal. Uses Yoga for Flexbox layouts. Components render to terminal output just like React renders to DOM.

**Ink UI Components (`@inkjs/ui`):**
- TextInput, EmailInput, PasswordInput
- Select (scrollable list), MultiSelect
- ConfirmInput (Y/n)
- Spinner, ProgressBar, Badge, StatusMessage
- Full theming via `ThemeProvider` + `extendTheme`

**Key differentiators:**
- **Flexbox layout** — CSS-like positioning in terminal (side-by-side panels, grids)
- **React Devtools integration** — inspect/modify components live
- **Routing** — React Router `MemoryRouter` for multi-screen navigation
- **Screen reader support** — Basic ARIA implementation
- **CI adaptation** — Auto-detects CI environments, renders appropriately
- **Companion framework: Pastel** — File-based routing, PropTypes-based option parsing

**Pros:**
- Most powerful layout system available (Flexbox)
- Familiar React paradigm — components, hooks, state, effects
- Build arbitrarily complex UIs (dashboards, split panels, real-time updates)
- Used by Gatsby, GitHub Copilot, Prisma, Shopify
- Excellent for "living" UIs that update in real-time

**Cons:**
- Significant overhead vs. simple prompt libraries (React runtime + Yoga)
- Slower startup time and higher memory usage
- Overkill for simple sequential wizard flows
- Steeper learning curve if building custom components
- Testing requires `ink-testing-library`

- **Stars:** ~27k GitHub (Ink), ~700 (Ink UI)
- **npm downloads:** ~7M/week
- **TypeScript:** Full support
- **Maintenance:** Active

---

### 6. Terminal-Kit

**Philosophy:** "The absolute terminal lib for Node.js." Full terminal control without ncurses dependency.

**Features:**
- 256 colors + true color support
- Key and mouse event handling
- Input fields with auto-completion (including file path completion)
- Single-line menus, single-column menus, grid menus
- Progress bars, spinners
- Screen buffer with 32-bit composition and image loading
- Text buffer with copy/paste and selection
- Document model widgets: Button, Text, TextInput, Form, DropDownMenu, EditableTextBox, Border

**Key differentiators:**
- Direct terminal control (screen positioning, cursor movement)
- Image rendering in terminal (via screen buffer)
- Full document model with widgets and event bubbling
- Built-in file path auto-completion

**Pros:**
- Most comprehensive low-level terminal control in Node.js
- No ncurses dependency
- Rich widget set for complex TUIs
- Image support

**Cons:**
- Lower-level API — more code to achieve simple wizard flows
- Less polished default aesthetics compared to Clack/Ink
- Smaller community and ecosystem
- Documentation can be sparse for advanced features

- **Stars:** ~3.1k GitHub
- **npm downloads:** ~750k/week
- **TypeScript:** Types available
- **Maintenance:** Active (v3.1.2)

---

### 7. Blessed / Neo-Blessed

**What it is:** A full ncurses reimplementation in pure JavaScript with a widget API. 16,000+ lines of code.

**Features:**
- Screen damage buffer (only draws changes)
- CSR/BCE rendering optimizations
- Transparency/opacity support
- Hover and focus styles
- Event bubbling in widget tree
- Blessed-contrib: graphs, ASCII art, dashboards

**Status:** The original `blessed` is unmaintained. `neo-blessed` (embarklabs) and `neo-neo-blessed` are community forks with bug fixes.

**Verdict:** Best for full-screen TUI applications (like htop clones or dashboards), but massive overkill for wizard flows. The maintenance story is concerning.

---

### 8. Oclif (Salesforce)

**What it is:** A CLI *framework* (not just prompts). Designed for building large CLI tools with many commands.

**Interactive features (via `@oclif/core`):**
- Basic text prompt, masked input, hidden input
- Yes/No confirmation, "press any key"
- Spinners (`cli.action`)
- Table output with built-in formatting flags
- Hyperlink support in terminals

**Key differentiators:**
- Command/plugin architecture for large CLIs
- Automatic `--help` documentation generation
- Test scaffolding included
- MCP (Model Context Protocol) plugin available (2025)
- Only 17 dependencies for minimal setup

**Verdict:** Oclif is for structuring large CLI applications, not for wizard UI. Its interactive prompts are basic. Typically paired with Inquirer for richer interactions.

---

### 9. Commander.js (v14)

**Not interactive by itself, but the most downloaded CLI library on npm (~160M/week, ~27.8k stars).**

Commander.js is strictly an argument parser and command router. However, two patterns make it relevant:

- **`interactive-commander`** — A community extension that auto-generates interactive prompts for missing CLI options. When a flag isn't provided, it prompts the user interactively.
- **v14 features** — Help groups (`.helpGroup()`, `.optionsGroup()`, `.commandsGroup()`) for organizing complex CLIs.

**Verdict:** Use Commander for argument parsing alongside a prompt library. The `interactive-commander` pattern (auto-prompting for missing flags) is a UX pattern worth considering — it bridges the gap between flag-based and wizard-based CLI usage.

---

### 10. Cliffy (Deno/Node/Bun)

**TypeScript-first, runtime-agnostic CLI toolkit.**

| Metric | Value |
|---|---|
| Runtime support | Deno, Node.js, Bun |
| TypeScript | Native (TypeScript-first) |
| Maintenance | Active (2025) |
| Distribution | jsr.io |

Cliffy provides a comprehensive CLI toolkit: command framework (type-safe, auto-generated help, shell completions), flags/argument parser, ANSI utilities, interactive prompts, tables, keycode/keypress handling, and testing helpers. Can compile to native binaries via `deno compile`.

**Verdict:** Worth watching as the Deno/Bun ecosystem matures. The most complete CLI toolkit for non-Node runtimes, and increasingly viable for Node.js as well.

---

## Non-JS Libraries (For Inspiration)

### Charm Bubbletea (Go)

The gold standard for terminal UI frameworks. 10,000+ apps built with it.

**Architecture:** Elm Architecture (Model-Update-View)
- `Model` struct holds state
- `Init()` returns initial command
- `Update()` receives messages (keypresses, etc.), returns new model + command
- `View()` returns string to render

**Ecosystem:**
- **Bubbles** — Component library (spinners, text inputs, checkboxes, lists, paginator, timer, help, etc.)
- **Lip Gloss** — CSS-like declarative styling (colors, borders, padding, alignment)
- **Glow** — Markdown reader built with Bubbletea
- **Huh** — High-level form library built on Bubbletea (accessible, themed, grouped fields)

**What makes it special:**
- Framerate-based renderer (efficient, no flickering)
- Mouse support, focus reporting
- Clean functional architecture eliminates shared mutable state bugs
- `Huh` library provides Clack-like convenience while retaining Bubbletea's power

**Inspiration for docs2llm:** Bubbletea's `Huh` library demonstrates how a high-level "wizard" API can be built atop a powerful lower-level framework. The concept of **field groups** (rendering multiple form fields at once rather than one prompt at a time) is particularly interesting for configuration wizards.

---

### Python Rich + Textual

**Rich:** Library for rich text formatting (tables, progress bars, syntax highlighting, tracebacks, markdown rendering, panels, trees). Not interactive — output only.

**Textual:** Full TUI framework built on Rich's rendering engine.
- React-inspired component hierarchy
- CSS Grid/Flexbox layouts (yes, real CSS in the terminal)
- Command palette (fuzzy search, Ctrl+P)
- Widget library: buttons, trees, data tables, inputs, text areas, tabs
- 120 FPS rendering via delta-update dirty regions
- Runs in both terminal AND web browser (same codebase)
- Async worker pool for IO-bound operations

**Inspiration for docs2llm:** Textual's **command palette** concept could enhance the interactive wizard — instead of scrolling through long lists, users could press a hotkey to fuzzy-search for any action or file.

---

### Rust: dialoguer + indicatif

**dialoguer:** Prompts library with Confirm, Input, Password, Select, MultiSelect, **FuzzySelect**, Sort, Editor. Features include:
- Input history tracking
- Tab-completion trait
- Input validation traits
- Theming via `Theme` trait

**indicatif:** Progress bars and spinners (~90M downloads). Thread-safe (`Sync + Send`), supports multi-progress bars for parallel operations, Rayon parallel iterator integration, smart terminal detection (hides bars when piped), customizable styles, human-readable ETA formatting.

**cliclack:** A Rust port of `@clack/prompts`, providing the same beautiful wizard-style prompts in Rust. This demonstrates Clack's design influence across language ecosystems.

**Inspiration for docs2llm:** `FuzzySelect` (fuzzy search within a select prompt) is a pattern worth adopting. The trait-based theming in dialoguer is more composable than most JS libraries. The Rust ecosystem's clean separation of prompts (dialoguer) from progress (indicatif) is a good architectural pattern — don't try to build one library that does everything.

---

## Modern CLI Wizard UX Patterns

### Patterns Used by Top CLI Tools (Astro, Next.js, T3, Vite)

| Pattern | Description | Who Uses It |
|---------|-------------|-------------|
| **Sequential focused prompts** | One question at a time, 3-5 steps total | All |
| **Recommended defaults** | "(recommended)" labels on default options | Astro, Next.js |
| **Flag-based bypass** | `--typescript --tailwind` to skip wizard entirely | All |
| **Modular tech selection** | Opt-in/out of individual stack components | T3, Astro |
| **Progress + success message** | Spinner during scaffolding, then "next steps" | All |
| **Beautiful minimal output** | Clack-style branded prompts | Astro (uses @clack/prompts) |

### Best Practices from UX Research

1. **Keep wizards to 3-5 steps** — 2 feels pointless, 10 feels overwhelming
2. **Smart defaults with escape hatches** — Novices succeed on first try, power users skip with flags
3. **Each step should be self-contained** — Don't require remembering previous step's information
4. **Summary before final action** — Show what will happen before committing
5. **Allow back-navigation** — Users should be able to correct earlier choices
6. **Inline validation** — Validate as the user types, not after submission
7. **Progress indicators** — Show which step the user is on (e.g., "Step 2 of 4")
8. **Informative error recovery** — On failure, explain what happened and suggest fixes
9. **Idempotent retries** — If something fails, retrying should be safe
10. **Config file output** — First-run wizard writes a config that users can edit later

### Additional Best Practices

11. **Never require a prompt** — Always provide flag/argument equivalents. If stdin is not an interactive terminal, skip prompting and require flags/args. Critical for CI/CD and automation.
12. **Support `--yes`/`--force`** — Default to safe actions, but let users opt into accepting all defaults.
13. **Respect config precedence** — flags > environment variables > config file > defaults.
14. **Provide shell completions** — bash/zsh/fish/powershell completions reduce the need for interactive prompts entirely.
15. **Smart error messages** — Include "did-you-mean" suggestions, proper exit codes, and actionable next steps.

### Accessibility Considerations

- **Screen readers struggle with terminal output** — Man pages, tables, and long outputs are extremely difficult to navigate linearly. Spinners and cursor-moving animations can cause speech output loops.
- **Support screen readers** — Ink has basic ARIA support; most others don't. GitHub CLI is leading the way with `gh a11y` for accessibility-optimized prompting.
- **Ensure keyboard-only navigation works well**
- **Don't rely solely on color** to convey information — use symbols/text too (checkmarks, X marks, arrows alongside colors)
- **Respect terminal width** — Don't overflow narrow terminals
- **Honor `NO_COLOR` and `TERM=dumb`** environment variables
- **Provide `--no-animation` / `--simple` flags** to disable spinners, ASCII art, and redraw-based UIs
- **Offer `--json` output** for programmatic consumption and screen reader compatibility
- **Use box-drawing characters** (not ASCII art) for borders — accessible terminal emulators can interpret these
- **Adapt for CI environments** — No interactive prompts, structured output

---

## Feature Comparison Matrix

| Feature | @clack v0.10 (current) | @clack v1.0 | @inquirer/prompts | Enquirer | Ink + Ink UI | terminal-kit |
|---------|----------------------|-------------|-------------------|----------|-------------|--------------|
| **Select** | Yes | Yes | Yes | Yes | Yes | Yes (menu) |
| **Multi-select** | Yes | Yes | Yes (checkbox) | Yes | Yes | No |
| **Text input** | Yes | Yes | Yes | Yes | Yes | Yes |
| **Confirm (Y/N)** | Yes | Yes | Yes | Yes | Yes | No (manual) |
| **Password input** | No | No | Yes | Yes | Yes | Yes (hidden) |
| **Autocomplete / Fuzzy search** | No | **Yes** | Via community | Yes | No built-in | Yes |
| **File path picker** | No | **Yes** (path prompt) | No | No | No | Yes |
| **Searchable multiselect** | No | **Yes** | Via community | No | No | No |
| **Spinner** | Yes | Yes (improved) | No | No | Yes | Yes |
| **Progress bar** | No | **Yes** | No | No | Yes | Yes |
| **Streaming output** | No | **Yes** (stream) | No | No | Yes (React) | Yes |
| **Task runner** | No | **Yes** (tasks) | No | No | No | No |
| **Grouped options** | Workaround | **Yes** (selectableGroups) | Yes (separator) | Yes | Custom | Yes |
| **Form (multi-field)** | No | No | No | **Yes** | Custom | Yes |
| **Survey / Scale** | No | No | No | **Yes** | No | No |
| **Sort / Reorder** | No | No | No | **Yes** | No | No |
| **Date picker** | No | No | No | No | No | No |
| **Flexbox layout** | No | No | No | No | **Yes** | Screen buffer |
| **Theming** | No | No | Hooks-based | Class-based | **React context** | Terminal control |
| **Back navigation** | No | No | No | No | **Yes** (routing) | Custom |
| **Step indicators** | No | No | No | No | Custom | Custom |
| **TypeScript** | Native | Native | Native | @types | Native | @types |
| **Bundle size** | Tiny | Small | Medium | Small | Large (React) | Medium |
| **Weekly npm DL** | ~2.5M | ~2.5M | ~35M | ~15M | ~7M | ~750k |

---

## Recommendations

### Option A: Upgrade @clack/prompts to v1.0 (Lowest effort, high impact)

**What it addresses:**
- Autocomplete for file selection (no more scrolling through long lists)
- Path prompt for file/directory picking with auto-suggest
- Progress bar for long conversions
- Stream for real-time output display
- taskLog for subprocess output
- Better spinner with cancellation handling
- True grouped options with `selectableGroups`

**Migration effort:** Minimal — same API, same library, just new features available.

**What it doesn't address:**
- No back-navigation between wizard steps
- No step progress indicators ("Step 2 of 4")
- No form-style multi-field input
- No theming/visual customization
- No Flexbox layout capabilities

### Option B: Hybrid — @clack/prompts v1.0 + Custom Step Tracker

Same as Option A, plus build a thin wrapper that:
- Tracks the current step number and total steps
- Renders a step indicator line (e.g., `━━━━━━━━━ Step 2 of 4 ━━━━━━━━━`)
- Stores previous answers to enable "back" functionality (re-run previous prompt with stored answer as default)

**Migration effort:** Low-medium — requires wrapping existing wizard flows in a step-tracking utility.

### Option C: Switch to Ink + Ink UI (Highest effort, highest ceiling)

**When this makes sense:**
- If the wizard needs to show real-time updating content (e.g., live conversion progress with output preview)
- If multi-pane layouts are needed (e.g., file browser on left, preview on right)
- If the tool evolves toward a "dashboard" or persistent TUI
- If the development team is comfortable with React

**What it enables:**
- Full Flexbox layouts for side-by-side panels
- React Router for wizard step navigation (built-in back/forward)
- Real-time updating UI (streaming conversion output)
- Theming via React context
- Component reuse and composition
- Screen reader support

**Trade-offs:**
- React runtime overhead (~100ms startup penalty)
- Significantly more code for simple prompt flows
- Testing requires `ink-testing-library`
- Overkill if the wizard stays as sequential prompts

### Option D: Inquirer.js @inquirer/prompts (Considered but not recommended)

While Inquirer has the largest ecosystem, it lacks the visual polish and integrated utilities (spinner, progress, logging) that Clack provides. You'd need to compose multiple packages to match what Clack v1.0 offers in one package. The hooks system is powerful for custom prompts but adds complexity.

### Option E: Enquirer (Considered for specific features)

Enquirer's Form, Survey, and Snippet prompts are unique and could enhance the template creation flow. However, its declining maintenance and lack of native TypeScript make it risky for long-term adoption. Consider borrowing UX patterns from Enquirer rather than adopting the library.

---

### Summary Recommendation

**Start with Option A (upgrade to @clack/prompts v1.0)** for immediate, low-risk improvements. The new autocomplete, path prompt, progress bar, and streaming features directly address the most impactful current limitations.

**Consider Option B** if user feedback indicates confusion about wizard flow position or desire for back-navigation.

**Reserve Option C (Ink)** for a future where docs2llm needs a persistent TUI experience beyond sequential wizard prompts.

Key UX improvements to prioritize regardless of library choice:
1. **Fuzzy-searchable file selection** (autocomplete prompt)
2. **Progress bar for conversions** (replace spinner with progress)
3. **File path auto-completion** (path prompt)
4. **Real-time conversion output** (stream/taskLog)
5. **Step indicators** in multi-step wizards
6. **Summary screen** before executing conversion

---

## Sources

### Libraries
- [@clack/prompts on npm](https://www.npmjs.com/package/@clack/prompts)
- [Clack releases / changelog](https://github.com/bombshell-dev/clack/releases)
- [Clack docs at bomb.sh](https://bomb.sh/docs/clack/packages/prompts/)
- [@inquirer/prompts on npm](https://www.npmjs.com/package/@inquirer/prompts)
- [Inquirer.js on GitHub](https://github.com/SBoudrias/Inquirer.js)
- [Enquirer on GitHub](https://github.com/enquirer/enquirer)
- [Prompts by terkelg on GitHub](https://github.com/terkelg/prompts)
- [Ink on GitHub](https://github.com/vadimdemedes/ink)
- [Ink UI on GitHub](https://github.com/vadimdemedes/ink-ui)
- [terminal-kit on GitHub](https://github.com/cronvel/terminal-kit)
- [Blessed on GitHub](https://github.com/chjj/blessed)
- [Commander.js on GitHub](https://github.com/tj/commander.js)
- [Cliffy on GitHub](https://github.com/c4spar/cliffy)
- [oclif on GitHub](https://github.com/oclif/oclif)

### Non-JS Inspiration
- [Charm Bubbletea on GitHub](https://github.com/charmbracelet/bubbletea)
- [Charm.sh ecosystem](https://charm.sh/)
- [Rich on GitHub](https://github.com/Textualize/rich)
- [Textual on GitHub](https://github.com/Textualize/textual)
- [dialoguer on docs.rs](https://docs.rs/dialoguer/latest/dialoguer/)
- [indicatif on docs.rs](https://docs.rs/indicatif/latest/indicatif/)
- [cliclack (Rust port of Clack)](https://github.com/fadeevab/cliclack)
- [Rust CLI prompts comparison](https://fadeevab.com/comparison-of-rust-cli-prompts/)

### UX Research & Best Practices
- [Top 8 CLI UX Patterns (Medium)](https://medium.com/@kaushalsinh73/top-8-cli-ux-patterns-users-will-brag-about-4427adb548b7)
- [Wizard Design Pattern (UX Planet)](https://uxplanet.org/wizard-design-pattern-8c86e14f2a38)
- [NN/g Wizards Definition](https://www.nngroup.com/articles/wizards/)
- [CLI Guidelines (clig.dev)](https://clig.dev/)
- [CLI UX Best Practices — Progress Displays (Evil Martians)](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)
- [10 Design Principles for Delightful CLIs (Atlassian)](https://www.atlassian.com/blog/it-teams/10-design-principles-for-delightful-clis)
- [CLI Best Practices for Accessibility (Seirdy)](https://seirdy.one/posts/2022/06/10/cli-best-practices/)
- [ACM CLI Accessibility Study](https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445544)

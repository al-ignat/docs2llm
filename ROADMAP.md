# docs2llm Roadmap

## Recommended Next: Standalone Binary (CLI)

Highest leverage item. Ship the CLI as a single native executable via `bun build --compile`. No Bun, Node, or npm required at runtime. Only external dependency: Pandoc (outbound conversion only). This unblocks Homebrew distribution and the macOS app (which needs a binary to bundle).

- [ ] Build script (`bun build --compile cli.ts --outfile docs2llm`)
- [ ] Test on clean machine (no Bun installed)
- [ ] Homebrew formula or direct download
- [ ] Graceful error when Pandoc is missing (inbound still works)

## macOS App

Native desktop app wrapping the web UI. Thin Swift shell using `WKWebView` — no Electron, no bundled Chromium. Starts the Bun server in the background, opens the UI in a native macOS window. Blocked by standalone binary (needs something to bundle inside the .app).

- [ ] Swift wrapper with WKWebView pointing at localhost
- [ ] Bundle the compiled CLI binary inside the .app
- [ ] App icon, proper Info.plist
- [ ] Menu bar integration (convert from Finder right-click?)
- [ ] DMG or Homebrew cask distribution

## CLI Housekeeping

- [ ] `cli.ts` is 927 lines — extract `convertSingleFile()`, `convertFolder()`, `convertUrl()`, `convertStdin()` into `src/commands/run.ts`, leaving `cli.ts` as arg parsing + dispatch only
- [ ] CLAUDE.md architecture table lists 7 files, actual count is 21 — update to reflect `commands/`, `core/`, `server/`, `shared/` structure

## Web UI Gaps

- [ ] Update README web UI section (outbound, clipboard, settings, templates)
- [ ] Show conversion progress for large files
- [ ] Drag-and-drop reference doc directly in outbound panel (skip settings)

## Done

- [x] CLI Wizard Redesign — completed via @clack/prompts v1.0 upgrade (PRs #26-35)
  - Autocomplete file picker, progress bars, step trackers, p.path() auto-suggest
  - p.box() displays, config diff preview, improved error messages
  - `--yes`, `--json`, `--quiet` flags, non-TTY detection
- [x] Web UI extraction — `api.ts` split into `api.ts` (461 lines) + `ui.ts`

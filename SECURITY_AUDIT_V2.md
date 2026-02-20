# docs2llm — Security Audit v2

**Date:** 2026-02-20
**Scope:** Full codebase review (19 TypeScript source files, ~4,557 LOC)
**Auditor:** Automated security review (Claude)
**Baseline:** SECURITY_AUDIT.md (v1, same date)

---

## Executive Summary

This is the second-pass security audit of docs2llm. The v1 audit identified 10 security issues and 8 bugs. Since then, significant remediation work has been done: **12 of 18 v1 findings have been addressed** through the addition of `url-safe.ts` (SSRF protection), Pandoc flag blocklisting, size limits, fetch timeouts, DOM-safe rendering, and several bug fixes.

This v2 audit identifies **7 new security vulnerabilities** and **5 new bugs** not covered by v1, and tracks the status of all v1 findings. The most critical new finding is that the web server binds to all network interfaces (`0.0.0.0`) without authentication, exposing all conversion and config-write endpoints to the local network.

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| New Security Issues | 1 | 1 | 2 | 3 | — |
| New Bugs | — | — | 2 | 3 | — |
| V1 Residual (unfixed) | — | — | — | 3 | 5 |

---

## V1 Audit — Remediation Status

The following v1 findings have been reviewed against the current codebase.

### Fixed (12 of 18)

| V1 ID | Title | Status | How Fixed |
|-------|-------|--------|-----------|
| SEC-1 | SSRF via URL conversion | **FIXED** | New `url-safe.ts` module validates URLs, blocks private IPs (IPv4/IPv6), enforces http/https only, manual redirect validation (max 5 hops) |
| SEC-2 | Arbitrary code execution via Pandoc args | **FIXED** | `outbound.ts:5-16` blocks `--filter`, `-F`, `--lua-filter`; `sanitizePandocArgs()` called before every Pandoc invocation |
| SEC-3 | Overly permissive CORS | **FIXED** | No CORS headers in current code — same-origin policy enforced by browsers |
| SEC-4 | Unbounded request sizes | **FIXED** | `MAX_UPLOAD_BYTES` (100 MB) on server (`api.ts:21,393`), `MAX_RESPONSE_BYTES` (100 MB) on fetch (`url-safe.ts:5`), `MAX_STDIN_BYTES` (100 MB) on stdin (`cli.ts:707`) |
| SEC-5 | Path traversal in output paths | **FIXED** | `output.ts:22-27` validates output path stays within target directory |
| SEC-6 | innerHTML usage in web UI | **FIXED** | `ui.ts:752-772` now uses `textContent` and DOM creation methods exclusively |
| SEC-7 | No fetch timeout | **FIXED** | `FETCH_TIMEOUT_MS = 30_000` with `AbortController` in `url-safe.ts:99-116` |
| BUG-1 | `convertStdin` ignores `-f` format flag | **FIXED** | `cli.ts:749` now calls `formatOutput()` with the format parameter; `cli.ts:770` uses correct file extension |
| BUG-2 | `convertUrl` ignores `-f` format flag | **FIXED** | `cli.ts:668` now accepts `format` parameter; `cli.ts:674` calls `formatOutput()` with format; `cli.ts:685` uses correct extension |
| BUG-3 | URL interactive overwrites without confirmation | **FIXED** | `interactive.ts:538-548` now checks `existsSync(outPath)` and prompts for overwrite |
| BUG-4 | Batch interactive mode skips OCR detection | **FIXED** | `interactive.ts:589-597` now has `isImageFile()` auto-OCR and `looksLikeScannedPdf()` retry |
| BUG-5 | Pandoc arg deduplication broken | **FIXED** | `config.ts:114-123` now uses key-based dedup (`arg.slice(0, eqIdx)`) with reverse iteration so later entries win |
| BUG-7 | Watch mode is non-recursive | **FIXED** | `watch.ts:28` now uses `{ recursive: true }` option |
| BUG-8 | Watch mode race condition | **FIXED** | `watch.ts:23,36,60-61` now uses `inflight` Map with Promise tracking and automatic cleanup via `.finally()` |

### Still Open (3 of 18)

| V1 ID | Title | Severity | Current Status |
|-------|-------|----------|----------------|
| SEC-8 | `require()` in ESM module | LOW | `convert.ts:199` still uses `require("./tokens")` — inconsistent with ESM but functional in Bun |
| SEC-9 | Empty catch blocks swallow errors | LOW | Still present in `clipboard.ts:67,90,101`, `scan.ts:41,47`, `cli.ts:555,574` |
| SEC-10 | MCP path input not validated | LOW | `mcp.ts:22` still accepts arbitrary file paths without existence/scope checks |

### Mitigated but Not Fully Resolved (1 of 18)

| V1 ID | Title | Severity | Notes |
|-------|-------|----------|-------|
| BUG-6 | Separator options selectable in interactive UI | LOW | Recursion now has depth limit of 3 (`interactive.ts:83-87,250-253`), preventing stack overflow. UX issue remains — separators should be non-selectable |

---

## New Security Vulnerabilities

### SEC-N1: Web server binds to all network interfaces [CRITICAL]

**File:** `api.ts:391-392`

```typescript
const server = Bun.serve({
  port,
  // No hostname specified — Bun defaults to 0.0.0.0
  ...
});
```

The Bun HTTP server does not specify a `hostname` parameter, so it defaults to binding on `0.0.0.0` (all interfaces). This means the web server is accessible from the entire local network, not just localhost.

Combined with the absence of any authentication, any device on the same network can:

1. Upload files for conversion via `POST /convert`
2. Trigger SSRF-protected but still-functional URL fetches via `POST /convert/url`
3. Read the user's config via `GET /config` (including output directory paths)
4. **Write to the user's global config file** via `PUT /config` (`api.ts:261-298`)
5. **Create and delete templates** that include Pandoc args via `POST /config/templates`
6. Convert clipboard content via `POST /convert/clipboard`
7. Trigger outbound Pandoc conversions via `POST /convert/outbound`

The config write endpoints (items 4 and 5) are the most concerning: an attacker on the local network could inject Pandoc arguments into the config. While `sanitizePandocArgs` blocks `--filter` and `--lua-filter`, other potentially dangerous args exist (e.g., `--pdf-engine`, `--include-in-header`, `--include-before-body`).

**Recommendation:**
- Add `hostname: "127.0.0.1"` to the `Bun.serve()` configuration
- This is a one-line fix that eliminates the entire attack surface from remote network access

```typescript
const server = Bun.serve({
  port,
  hostname: "127.0.0.1",  // Bind to localhost only
  maxRequestBodySize: MAX_UPLOAD_BYTES,
  ...
});
```

---

### SEC-N2: DNS rebinding bypasses SSRF IP validation [HIGH]

**File:** `url-safe.ts:12-48`, `url-safe.ts:93-133`

The SSRF protection validates the hostname against private IP ranges *before* the actual HTTP request. However, `validateUrl()` only checks the string form of the hostname — it does not resolve DNS. The actual DNS resolution happens inside `fetch()`, which is called separately.

**Attack scenario (DNS rebinding):**

1. Attacker controls `evil.example.com` with TTL=0
2. First DNS lookup: `evil.example.com` → `1.2.3.4` (public IP, passes `validateUrl`)
3. `fetch("http://evil.example.com/...")` triggers a second DNS lookup
4. Second DNS lookup: `evil.example.com` → `169.254.169.254` (cloud metadata)
5. Request reaches the internal service

This also applies to redirect validation: each hop calls `validateUrl(currentUrl)` on the URL string, but the hostname may resolve differently between validation and fetch time.

**Recommendation:**
- Resolve DNS explicitly before fetching and validate the resolved IP address
- Use Bun's `Bun.dns.lookup()` or Node's `dns.resolve()` to get the IP, validate it, then fetch using the IP directly (with the Host header set to the original hostname)
- Alternatively, use a connect-level callback if the runtime supports it

---

### SEC-N3: Pandoc blocklist is incomplete — additional code execution vectors [MEDIUM]

**File:** `outbound.ts:5`

```typescript
const BLOCKED_PANDOC_FLAGS = new Set(["--filter", "-F", "--lua-filter"]);
```

The blocklist only covers three flags. Pandoc has additional flags that can execute arbitrary code or read/write arbitrary files:

| Flag | Risk |
|------|------|
| `--pdf-engine=<cmd>` | Executes an arbitrary command as the PDF engine |
| `--pdf-engine-opt=<opt>` | Passes options to the PDF engine command |
| `--include-in-header=<file>` | Reads arbitrary files and includes them in output |
| `--include-before-body=<file>` | Reads arbitrary files |
| `--include-after-body=<file>` | Reads arbitrary files |
| `--reference-doc=<file>` | Reads arbitrary files (though this is intentionally used by templates) |
| `--template=<file>` | Reads arbitrary template files; Pandoc templates support `$if$` logic |
| `--metadata-file=<file>` | Reads arbitrary YAML/JSON files |
| `--defaults=<file>` | Reads a Pandoc defaults file that can specify filters |
| `--extract-media=<dir>` | Writes to arbitrary directory |
| `--data-dir=<dir>` | Overrides Pandoc's data directory |
| `--syntax-definition=<file>` | Reads arbitrary XML files |
| `--abbreviations=<file>` | Reads arbitrary files |

The most dangerous are `--pdf-engine` (arbitrary command execution), `--defaults` (can re-enable filters), and `--include-*` (arbitrary file read).

**Recommendation:**
- Switch from a blocklist to an allowlist approach
- Only permit known-safe flags: `--toc`, `--standalone`, `--reference-doc`, `--css`, `--slide-level`, `--shift-heading-level-by`, `--columns`, `--wrap`, `--number-sections`, `--highlight-style`, `-V`/`--variable`
- Block everything else by default

---

### SEC-N4: Content-Disposition header injection via filename [MEDIUM]

**File:** `api.ts:238`

```typescript
const baseName = file.name.replace(/\.[^.]+$/, "") || "output";

return new Response(outBytes, {
  headers: {
    "Content-Type": OUTBOUND_MIMES[outFormat] ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${baseName}.${outFormat}"`,
  },
});
```

The `baseName` is derived from the uploaded file's name with only the extension stripped. If the filename contains double quotes, backslashes, or newline characters (e.g., `foo"onload=alert(1).md`), the `Content-Disposition` header value becomes malformed.

While modern browsers handle malformed `Content-Disposition` headers gracefully, this could lead to:
- Downloaded files with unexpected names
- Header injection if the value contains `\r\n` (CRLF)

**Recommendation:**
- Sanitize the filename: strip or replace characters outside `[a-zA-Z0-9._-]`
- Use RFC 6266 compliant encoding: `filename*=UTF-8''<percent-encoded-name>`

```typescript
const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_") || "output";
```

---

### SEC-N5: Template reference file deletion follows stored paths [LOW]

**File:** `api.ts:367-376`

```typescript
if (tpl.pandocArgs) {
  for (const arg of tpl.pandocArgs) {
    if (arg.startsWith("--reference-doc=")) {
      const refPath = arg.slice("--reference-doc=".length);
      try { unlinkSync(refPath); } catch {}
    }
  }
}
```

When a template is deleted, the code extracts the `--reference-doc` path from the stored Pandoc args and attempts to delete it. The path is trusted without validation.

If an attacker can modify the config file (possible via SEC-N1 on LAN, or via a malicious shared config), they could set `--reference-doc=/path/to/important/file`, and when the template is deleted through the web UI, the target file would be deleted.

**Precondition:** Requires ability to write to the config file (network access via SEC-N1, or malicious shared config).

**Recommendation:**
- Validate that the reference file is within the expected template directory (`~/.config/docs2llm/templates/`) before deleting
- Don't delete files based on stored paths — only delete files that match the expected naming pattern

---

### SEC-N6: `JSON.parse` on unsanitized form data [LOW]

**File:** `api.ts:323`

```typescript
const featuresRaw = formData.get("features") as string | null;
const features: string[] = featuresRaw ? JSON.parse(featuresRaw) : [];
```

The `features` field is parsed with `JSON.parse` without type validation. While the try/catch around the entire handler would catch a JSON syntax error, valid-but-unexpected JSON (e.g., `{"__proto__": {"polluted": true}}`) could cause unexpected behavior in downstream code. In the current code, only `.includes("toc")` and `.includes("standalone")` are called on the result, and `Array.prototype.includes` on a non-array would throw or return undefined, which is handled.

**Current risk is low**, but the pattern is fragile.

**Recommendation:**
- Validate the parsed result is a string array:
```typescript
const parsed = featuresRaw ? JSON.parse(featuresRaw) : [];
const features = Array.isArray(parsed) ? parsed.filter(f => typeof f === "string") : [];
```

---

### SEC-N7: Config directory traversal via `findLocalConfig` [LOW]

**File:** `config.ts:31-43`

```typescript
export function findLocalConfig(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  while (true) {
    const candidate = join(dir, LOCAL_CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
```

The config resolution walks up the entire directory tree from cwd to the filesystem root. A `.docs2llm.yaml` file placed in a shared parent directory (e.g., `/tmp/.docs2llm.yaml`, `/home/.docs2llm.yaml`) would be picked up by any user running docs2llm in a subdirectory.

On shared systems or CI environments, this could allow a malicious config (with Pandoc args) to be injected by placing a config file in a common ancestor directory.

**Recommendation:**
- Limit upward traversal to a defined boundary (e.g., stop at the home directory or a git root)
- Log which config files are loaded so users can verify

---

## New Bugs

### BUG-N1: Pandoc subprocess has no execution timeout [MEDIUM]

**File:** `outbound.ts:56-61`

```typescript
const args = ["pandoc", inputPath, ...extraArgs ?? [], "-o", outPath];
const proc = Bun.spawn(args, {
  stdout: "pipe",
  stderr: "pipe",
});
const code = await proc.exited;
```

The Pandoc subprocess is spawned without any timeout. A malformed or adversarial document could cause Pandoc to hang indefinitely, blocking the event loop.

In the web API path (`api.ts:230`), this would cause the HTTP request to hang forever since there's no server-side request timeout either.

**Recommendation:**
- Add a timeout using `setTimeout` + `proc.kill()`:
```typescript
const timeout = setTimeout(() => proc.kill(), 60_000);
const code = await proc.exited;
clearTimeout(timeout);
```

---

### BUG-N2: Watch mode flattens subdirectory structure [MEDIUM]

**File:** `watch.ts:28-54`

```typescript
fsWatch(inputDir, { recursive: true }, async (eventType, filename) => {
  // filename may include subdirectory path like "subdir/report.pdf"
  const filePath = join(inputDir, filename);
  // ...
  const outName = basename(filename, ext) + ".md";
  const outPath = join(outputDir, outName);
});
```

With `{ recursive: true }`, the `filename` parameter can include subdirectory components (e.g., `"subdir/report.pdf"`). The output path uses `basename(filename)` which strips the directory, causing all output files to be written flat into `outputDir`.

**Impact:**
- Files with the same name in different subdirectories will overwrite each other
- Example: `reports/summary.pdf` and `invoices/summary.pdf` would both produce `summary.md`

**Recommendation:**
- Preserve the relative directory structure in the output:
```typescript
const relDir = dirname(filename);
const outDir = join(outputDir, relDir);
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, outName);
```

---

### BUG-N3: Concurrent outbound requests may collide on temp files [LOW]

**File:** `api.ts:222`

```typescript
const tmpIn = join(tmpdir(), `docs2llm-in-${Date.now()}.md`);
```

The temporary file name uses `Date.now()` which has millisecond resolution. Two concurrent outbound conversion requests arriving within the same millisecond would produce the same temp file path, causing data corruption.

**Recommendation:**
- Add a random suffix: `` `docs2llm-in-${Date.now()}-${Math.random().toString(36).slice(2)}.md` ``
- Or use `crypto.randomUUID()`

---

### BUG-N4: `detectMimeFromBytes` returns generic type for ZIP-based formats [LOW]

**File:** `cli.ts:791-793`

```typescript
// ZIP-based (docx, pptx, xlsx, epub, odt): PK\x03\x04
if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) {
  return "application/zip";
}
```

All Office XML formats (DOCX, PPTX, XLSX), EPUB, and OpenDocument formats share the same ZIP magic bytes. The function returns `"application/zip"` for all of them. While the downstream Kreuzberg library may handle this correctly by inspecting the ZIP contents, a more specific MIME type would improve reliability.

**Recommendation:**
- Inspect the ZIP directory for characteristic files:
  - `word/document.xml` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `ppt/presentation.xml` → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
  - `xl/workbook.xml` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `META-INF/container.xml` → `application/epub+zip`
  - `mimetype` file → read contents for ODF formats

---

### BUG-N5: `--chunk-size` accepts NaN without validation [LOW]

**File:** `cli.ts:149-154`

```typescript
} else if (arg.startsWith("--chunk-size=")) {
  chunkSize = parseInt(arg.split("=")[1], 10);
  chunks = true;
} else if (arg === "--chunk-size") {
  chunkSize = parseInt(args[++i], 10);
  chunks = true;
}
```

If the user provides a non-numeric value (e.g., `--chunk-size=abc`), `parseInt` returns `NaN`. This `NaN` propagates to `splitToFit()` in `tokens.ts:82-83`:

```typescript
const numParts = Math.ceil(totalTokens / (targetTokens * 0.95)); // NaN
```

`Math.ceil(NaN)` returns `NaN`, and `NaN <= 1` is false, so the function would attempt to split with `NaN` as the target, producing undefined behavior in the paragraph accumulation loop.

**Recommendation:**
- Validate the parsed value:
```typescript
chunkSize = parseInt(arg.split("=")[1], 10);
if (isNaN(chunkSize) || chunkSize <= 0) {
  console.error("--chunk-size must be a positive number.");
  process.exit(1);
}
```

---

## Informational Notes

These are observations that are not vulnerabilities or bugs but are worth noting for code quality and maintainability.

### INFO-1: HTTP-only web server (carried from v1)

**File:** `api.ts:391`

The server runs on plain HTTP. This is acceptable for localhost-only usage but must be restricted to localhost (see SEC-N1) to prevent network eavesdropping.

### INFO-2: `as any` type assertions

Multiple files contain `as any` casts (~10 instances), mostly to satisfy `@clack/prompts` type requirements. These reduce TypeScript's type safety but are not directly dangerous.

### INFO-3: `process.exit()` in non-entry-point functions

**Files:** `cli.ts`, `paste.ts`

Hard exits in library-style functions prevent cleanup (temp files, open connections) and make the code harder to test. Consider throwing errors and handling them in the `main()` function.

### INFO-4: Token estimation heuristic (carried from v1)

**File:** `tokens.ts:24`

The 1.33 tokens/word ratio is a reasonable English-text heuristic but can be significantly off for:
- Source code (~2-3 tokens per "word")
- CJK text (~1.5-2 tokens per character, but the word splitter produces different results)
- Heavily formatted Markdown (syntax characters count as tokens)
- Mixed-language documents

### INFO-5: No test suite

The repository contains no test files. The absence of tests increases the risk of regressions when fixing the issues identified in this audit.

---

## Remediation Priority

### Immediate (should be fixed before any public/team deployment)

| ID | Title | Effort |
|----|-------|--------|
| SEC-N1 | Server binds to 0.0.0.0 | One-line fix: add `hostname: "127.0.0.1"` |
| SEC-N3 | Pandoc blocklist incomplete | Replace blocklist with allowlist |

### Short-term (fix in next release)

| ID | Title | Effort |
|----|-------|--------|
| SEC-N2 | DNS rebinding | Moderate — requires DNS pre-resolution |
| SEC-N4 | Content-Disposition injection | Small — sanitize filename |
| BUG-N1 | Pandoc has no timeout | Small — add setTimeout + kill |
| BUG-N3 | Temp file collision | Small — add random suffix |
| BUG-N5 | --chunk-size NaN | Small — add parseInt validation |

### Medium-term (address when convenient)

| ID | Title | Effort |
|----|-------|--------|
| SEC-N5 | Template ref file deletion | Small — validate path prefix |
| SEC-N7 | Config directory traversal | Moderate — add traversal boundary |
| BUG-N2 | Watch mode flattens subdirs | Small — preserve relative paths |
| SEC-8 (v1) | require() in ESM | Small — change to import |
| SEC-9 (v1) | Empty catch blocks | Small — add stderr logging |
| SEC-10 (v1) | MCP path validation | Small — add existence check |

### Low priority (nice to have)

| ID | Title | Effort |
|----|-------|--------|
| SEC-N6 | JSON.parse unsanitized | Small — add type check |
| BUG-N4 | ZIP MIME detection | Moderate — read ZIP directory |
| BUG-6 (v1) | Separator selectable | Small — use non-selectable items |

---

## Methodology

This audit was conducted through manual static analysis of all 19 TypeScript source files. Analysis covered:

1. **Input validation** — CLI arguments, URL inputs, file paths, form data, JSON bodies
2. **Network security** — SSRF protections, server binding, CORS, timeouts, size limits
3. **Process security** — Subprocess spawning (Pandoc, clipboard tools), argument injection
4. **File system security** — Path traversal, temp file handling, config file trust
5. **Web security** — XSS (innerHTML vs textContent), header injection, authentication
6. **Error handling** — Silent failures, error information leakage
7. **Concurrency** — Race conditions in watch mode and web server
8. **Cross-reference with v1 audit** — Verified all 18 v1 findings against current code

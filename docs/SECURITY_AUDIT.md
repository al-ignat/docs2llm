# docs2llm — Security Audit & Bug Report

> **Status: Archived.** All items addressed. Superseded by [Security Audit v2](./SECURITY_AUDIT_V2.md).

**Date:** 2026-02-20
**Scope:** Full codebase review (19 TypeScript source files, ~3,400 LOC)

---

## Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 1 | 2 | 4 | 3 |
| Bugs     | — | 2 | 3 | 3 |

---

## Security Vulnerabilities

### SEC-1: Server-Side Request Forgery (SSRF) via URL conversion [CRITICAL]

**Files:** `fetch.ts:4`, `api.ts:96`

User-supplied URLs are passed directly to `fetch()` with no validation. The web server endpoint `POST /convert/url` is network-accessible and can be used to:

- Access internal services (e.g., `http://169.254.169.254/latest/meta-data/` on cloud providers)
- Scan internal network ports
- Access `file://` or other non-HTTP schemes (depending on runtime behavior)
- Exfiltrate internal data through the conversion response

```typescript
// fetch.ts:4 — no validation at all
const res = await fetch(url);

// api.ts:96 — same pattern in the web API
const res = await fetch(url);
```

The CLI (`cli.ts:357`) at least checks for `http://` or `https://` prefix, but the web API endpoint performs no scheme validation.

**Recommendation:**
- Validate URL scheme (allow only `http:` and `https:`)
- Block private/reserved IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, fc00::/7, ::1)
- Add a configurable timeout (e.g., 30 seconds)
- Add a response size limit (e.g., 50MB)

---

### SEC-2: Arbitrary code execution via Pandoc arguments [HIGH]

**Files:** `outbound.ts:40`, `config.ts:92-117`, `init.ts:254-262`

Pandoc arguments from three sources are passed directly to `Bun.spawn()`:

1. CLI args after `--` separator (`cli.ts:98-100`)
2. Config file `pandocArgs` arrays (`config.ts:100-102`)
3. Interactive wizard free-text input (`init.ts:255-261`)

Pandoc supports filters that execute arbitrary code:
- `--filter <program>` — runs an external program as a filter
- `--lua-filter <script>` — executes a Lua script
- `-M <key>=<value>` with certain templates can trigger shell commands

```typescript
// outbound.ts:40 — extraArgs passed directly to spawn
const args = ["pandoc", inputPath, ...(extraArgs ?? []), "-o", outPath];
const proc = Bun.spawn(args, { ... });
```

While the CLI `--` args are intentional user input (acceptable risk), config files could be shared between users (e.g., committed to a repo), and a malicious `.docs2llm.yaml` could execute arbitrary code when anyone runs `docs2llm notes.md -t malicious-template`.

**Recommendation:**
- Warn users when loading config files from untrusted sources
- Consider a blocklist for dangerous Pandoc flags (`--filter`, `--lua-filter`)
- Document the risk in README

---

### SEC-3: Overly permissive CORS on web server [HIGH]

**File:** `api.ts:136-141`

```typescript
function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
```

The wildcard `*` CORS policy allows any website to make requests to the local docs2llm server. Combined with SEC-1 (SSRF), a malicious webpage could:

1. Use the local docs2llm server as an SSRF proxy to scan internal networks
2. Upload files for conversion and read the response
3. Trigger resource-intensive conversions (DoS)

**Recommendation:**
- Restrict `Access-Control-Allow-Origin` to `http://localhost:3000` (or the actual serving origin)
- Alternatively, remove CORS headers entirely since the UI is served from the same origin

---

### SEC-4: Unbounded request sizes (Denial of Service) [MEDIUM]

**Files:** `api.ts:51`, `api.ts:102`, `cli.ts:703-713`

No size limits exist on:
- File uploads via the web API (`api.ts:51` — `file.arrayBuffer()` loads entire file into memory)
- URL fetches (`api.ts:102` — `res.arrayBuffer()` loads entire response into memory)
- Stdin input (`cli.ts:703-713` — all chunks accumulated in memory)

A multi-gigabyte upload or a URL pointing to an infinite stream could exhaust memory.

**Recommendation:**
- Add `maxRequestBodySize` to the Bun server config
- Add a Content-Length check before reading response bodies from fetched URLs
- Add a cumulative size limit for stdin reading

---

### SEC-5: Path traversal in output path resolution [MEDIUM]

**Files:** `output.ts:13-20`, `validate.ts:54-61`

The output path is constructed by joining user-supplied `outputDir` with the input filename:

```typescript
// output.ts:18-20
const dir = outputDir ?? dirname(sourcePath);
return join(dir, name + EXT_MAP[format]);
```

While `path.join()` normalizes `..` sequences, there is no check to ensure the resolved output path stays within an intended directory. The `-o` flag, config `outputDir`, and interactive mode all feed into this.

The only existing check (`validate.ts:57-61`) prevents input/output collision but doesn't restrict the output location.

**Recommendation:**
- For the web API: resolve the output path and verify it's within the expected output directory using `path.relative()` and checking for `..` prefix
- For CLI: this is lower risk since the user controls the `-o` flag directly

---

### SEC-6: innerHTML usage in web UI [MEDIUM]

**File:** `api.ts:373-380`

```typescript
function showResult(data) {
  // ...
  let html = '<span class="stat-pill">' + data.words.toLocaleString() + ' words</span>';
  // ...
  html += data.fits.map(f =>
    '<span class="' + (f.fits ? 'fit-yes' : 'fit-no') + '">' + f.name + ' ...'
  ).join('  ');
  stats.innerHTML = html;
}
```

While the current data sources are numeric values and hardcoded model names from the server, this pattern is fragile. If the server response were ever tampered with (e.g., via a man-in-the-middle on HTTP), the model names or other string fields could contain malicious HTML/JavaScript.

**Recommendation:**
- Use `textContent` for text values and DOM creation methods instead of `innerHTML`
- Or at minimum, escape HTML entities in string values before insertion

---

### SEC-7: No fetch timeout [MEDIUM]

**Files:** `fetch.ts:4`, `api.ts:96`

HTTP requests to user-supplied URLs have no timeout. A slow or non-responsive server could cause the process to hang indefinitely, blocking the event loop.

**Recommendation:**
- Use `AbortController` with a timeout:
  ```typescript
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  ```

---

### SEC-8: `require()` in ESM module [LOW]

**File:** `convert.ts:177`

```typescript
const { countWords, estimateTokens } = require("./tokens");
```

Uses CommonJS `require()` in a project declared as ESM (`"type": "module"` in package.json). While Bun supports this, it's inconsistent with the rest of the codebase which uses `import`. If the project is ever run on Node.js or bundled with a strict ESM bundler, this will break.

**Recommendation:**
- Replace with `import { countWords, estimateTokens } from "./tokens"` at the top of the file (it's already used synchronously in a synchronous function, so a top-level import works fine)

---

### SEC-9: Empty catch blocks swallow errors silently [LOW]

**Files:** `clipboard.ts:67,90,102`, `cli.ts:543,562`

```typescript
// clipboard.ts:67
} catch {}
```

Silent error suppression makes debugging impossible and can mask security-relevant failures (e.g., a clipboard tool behaving unexpectedly).

**Recommendation:**
- At minimum, log errors to stderr in debug mode

---

### SEC-10: MCP server path input not validated [LOW]

**File:** `mcp.ts:22`

The `convert_file` MCP tool accepts an arbitrary `filePath` string. While the MCP protocol implies trusted clients, there's no validation that the path:
- Actually exists before attempting conversion
- Doesn't point to sensitive files (e.g., `/etc/shadow`)
- Is within a reasonable scope

**Recommendation:**
- Add basic path validation (existence check, optional sandboxing)

---

## Bugs

### BUG-1: `convertStdin` ignores the `-f` format flag [HIGH]

**File:** `cli.ts:691-758`

The `convertStdin` function accepts a `format` parameter but completely ignores it for non-chunked output:

```typescript
async function convertStdin(format: OutputFormat, ...) {
  // ...
  const result = await convertBytes(data, mime, ocr);
  const content = result.content;  // Always raw text

  if (useStdout) {
    process.stdout.write(content);  // Ignores format — always raw text
    return;
  }

  // Always writes .md regardless of format
  const outPath = outputDir
    ? resolve(outputDir, "stdin-output.md")
    : resolve("stdin-output.md");
  await writeOutput(outPath, content);  // Writes raw text, not JSON/YAML
}
```

**Impact:** `cat file.pdf | docs2llm --stdin -f json` produces a `.md` file with raw text instead of a `.json` file with structured output (words, tokens, metadata).

**Fix:** Use the `formatOutput()` function (from `convert.ts`) to apply the format, and use the correct file extension.

---

### BUG-2: `convertUrl` ignores the `-f` format flag [HIGH]

**File:** `cli.ts:653-689`

Similar to BUG-1, the `convertUrl` function always outputs raw markdown regardless of the `--format` flag. The function doesn't even accept a `format` parameter:

```typescript
async function convertUrl(url: string, outputDir?: string, force?: boolean, useStdout?: boolean) {
  // ...
  const outName = `${name}.md`;  // Always .md
  await writeOutput(outPath, result.content);  // Always raw content
}
```

**Impact:** `docs2llm https://example.com -f json` produces a `.md` file instead of structured JSON.

---

### BUG-3: `convertUrlInteractive` overwrites files without confirmation [MEDIUM]

**File:** `interactive.ts:528`

```typescript
async function convertUrlInteractive(url: string, config?: Config) {
  // ...
  await writeOutput(outPath, result.content);  // No existence check
}
```

Every other conversion path checks `existsSync(plan.outputPath)` and prompts before overwriting. The URL interactive conversion skips this check entirely.

---

### BUG-4: Batch interactive mode skips OCR detection [MEDIUM]

**File:** `interactive.ts:564-578`

The `convertBatchInteractive` function doesn't check for scanned PDFs or offer OCR:

```typescript
for (const file of files) {
  try {
    const result = await convertFile(file, "md");
    // No looksLikeScannedPdf() check
    // No OCR retry
```

Compare with `convertFolder` in `cli.ts:622-626` which does perform scanned PDF detection.

**Impact:** Scanned PDFs converted in interactive batch mode will produce empty or near-empty output without OCR being triggered.

---

### BUG-5: Pandoc arg deduplication doesn't handle value flags correctly [MEDIUM]

**File:** `config.ts:106-116`

```typescript
// Comment says: "later entries win for flags with values, simple flags dedupe"
const seen = new Set<string>();
const result: string[] = [];

for (const arg of [...builtIn, ...configArgs, ...cli]) {
  if (seen.has(arg)) continue;  // Only dedupes exact string matches
  seen.add(arg);
  result.push(arg);
}
```

The implementation only checks for exact string matches. This means:
- `--toc` correctly deduplicates
- `--reference-doc=a.docx` and `--reference-doc=b.docx` are treated as different args and both pass through (Pandoc uses only the last one, so the first is wasted)
- `--css=a.css` and `--css=b.css` both pass through (Pandoc does accept multiple CSS files, so this might be intended)

The comment describes behavior that isn't implemented.

---

### BUG-6: Separator options in `pickFile` and `pickFormat` are selectable [LOW]

**Files:** `interactive.ts:110,261,269`

Separator items (`__sep__`, `__sep_tpl__`, `__sep_fmt__`) are added as regular selectable options:

```typescript
options.push({ value: "__sep__", label: "── Downloads ──", hint: "" });
```

When selected, the function recursively calls itself. While this works, it's a UX issue — separators shouldn't be selectable. With enough repeated selections, this could theoretically cause a stack overflow.

---

### BUG-7: Watch mode is non-recursive [LOW]

**File:** `watch.ts:28`

```typescript
fsWatch(inputDir, async (eventType, filename) => { ... });
```

`fs.watch()` without `{ recursive: true }` only monitors the top-level directory. Files in subdirectories won't trigger conversion. The `recursive` option is only supported on macOS and Windows (not Linux with older kernels).

**Impact:** Users who drop files into subdirectories of the watched folder won't get automatic conversion.

---

### BUG-8: Watch mode race condition [LOW]

**File:** `watch.ts:28-59`

The debounce mechanism (`processed` Set) and the async callback create a potential race condition:

1. File event fires → `processed.add(filePath)` → 500ms delay starts
2. Same file event fires again within the 500ms → correctly debounced
3. But if a *different* async conversion is still in progress when the 2-second timeout fires and deletes from `processed`, a new event could trigger a second concurrent conversion of the same file

This is unlikely in practice but could cause corrupted output files if two writes happen simultaneously.

---

## Informational Notes

These are not bugs or vulnerabilities but are worth noting:

1. **HTTP-only web server** (`api.ts:173`): The server runs on plain HTTP. Acceptable for localhost-only usage but should be documented as not suitable for network exposure.

2. **`as any` type assertions** (multiple files): ~10 instances of `as any` bypass TypeScript's type safety. These are mostly used to satisfy @clack/prompts type requirements and are not dangerous, but reduce type safety.

3. **`process.exit()` in library-style functions** (multiple files): Hard exits prevent cleanup and make the code harder to test. Consider throwing errors and handling them at the top level.

4. **No input validation on MCP tool parameters beyond Zod schema** (`mcp.ts`): While Zod validates types, there are no business-logic validations (e.g., file existence, path restrictions).

5. **Token estimation heuristic** (`tokens.ts:24`): The 1.33 tokens/word ratio is a reasonable English-text heuristic but can be significantly off for code, CJK text, or heavily formatted documents.

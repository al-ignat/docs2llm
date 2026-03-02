---
title: "IPv6 SSRF Bypass in DNS Resolution and URL Validation"
date: "2026-03-02"
category: security-issues
tags: [ssrf, ipv6, dns, url-validation, security]
severity: critical
components: [src/core/url-safe.ts, test/url-safe.test.ts]
pr: "#47"
symptoms:
  - "DNS validation only checked A (IPv4) records, missing AAAA (IPv6)"
  - "URL parsers normalize ::ffff:127.0.0.1 to hex form ::ffff:7f00:1, bypassing dotted-quad check"
root_cause: "Incomplete IP family coverage in DNS pre-resolution and IPv6 address parsing"
resolution: "Added dns.resolve6() alongside dns.resolve4(), extended isPrivateIPv6() for hex-form IPv4-mapped addresses"
---

# IPv6 SSRF Bypass in DNS Resolution and URL Validation

## Problem

The SSRF protection in `validateResolvedIPs()` only resolved IPv4 A records via `dns.resolve()`. Two bypass vectors existed:

1. **AAAA-only domains**: An attacker controlling a domain with no A records but an AAAA record pointing to `::1` or `fe80::1` bypasses the DNS check entirely, and `fetch()` connects over IPv6 to a private address.

2. **Hex-form IPv4-mapped addresses**: URL parsers (including Bun's `new URL()`) normalize `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]` (hex form). The existing `isPrivateIPv6()` only checked dotted-quad form (`::ffff:127.0.0.1`), so the hex form slipped through.

## Prior Art

This is the third SSRF fix in docs2llm:
- **v1 audit SEC-1** (2026-02-20): Original SSRF protection — URL validation, private IPv4 blocking, manual redirect following
- **v2 audit SEC-N2** (2026-02-20): DNS rebinding bypass — added DNS pre-resolution before fetch
- **This fix** (2026-03-02): IPv6 gap — added AAAA resolution and hex-form IPv4-mapped parsing

## Root Cause

1. Node's `dns.resolve()` defaults to A record type only. AAAA records were never queried.
2. `isPrivateIPv6()` checked `::ffff:` prefix + dotted-quad, but not hex-encoded embedded IPv4.

## Solution

### AAAA Record Resolution

Replace single `dns.resolve()` with parallel A + AAAA resolution:

```typescript
import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from "dns/promises";

const [v4Result, v6Result] = await Promise.allSettled([
  dnsResolve4(hostname),
  dnsResolve6(hostname),
]);

if (v4Result.status === "fulfilled") {
  for (const addr of v4Result.value) {
    if (isPrivateIPv4(addr)) {
      throw new Error(`Blocked request: ${hostname} resolves to private IP ${addr}`);
    }
  }
}

if (v6Result.status === "fulfilled") {
  for (const addr of v6Result.value) {
    if (isPrivateIPv6(addr)) {
      throw new Error(`Blocked request: ${hostname} resolves to private IP ${addr}`);
    }
  }
}
```

### Hex-Form IPv4-Mapped Parsing

Extend `isPrivateIPv6()` to decode hex-encoded embedded IPv4:

```typescript
// Hex form: ::ffff:7f00:1 (URL parsers normalize dotted-quad to this)
if (lower.startsWith("::ffff:")) {
  const mapped = lower.slice(7);
  if (mapped.includes(".")) {
    return isPrivateIPv4(mapped); // dotted-quad
  }
  const hexParts = mapped.split(":");
  if (hexParts.length === 2) {
    const hi = parseInt(hexParts[0], 16);
    const lo = parseInt(hexParts[1], 16);
    if (!isNaN(hi) && !isNaN(lo) && hi <= 0xffff && lo <= 0xffff) {
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }
}
```

Key insight: `::ffff:7f00:1` → `7f00` = `(127 << 8) | 0`, `0001` = `(0 << 8) | 1` → `127.0.0.1`.

## Tests

Converted 2 `test.todo` items to passing tests, added 2 new tests:

```typescript
test("blocks IPv4-mapped IPv6 with private address (hex form)", () => {
  expect(() => validateUrl("http://[::ffff:127.0.0.1]")).toThrow("private IP");
});
test("blocks IPv4-mapped IPv6 with 10.x address (hex form)", () => {
  expect(() => validateUrl("http://[::ffff:10.0.0.1]")).toThrow("private IP");
});
test("blocks IPv4-mapped IPv6 with 192.168.x address (hex form)", () => {
  expect(() => validateUrl("http://[::ffff:192.168.1.1]")).toThrow("private IP");
});
test("allows IPv4-mapped IPv6 with public address", () => {
  const url = validateUrl("http://[::ffff:8.8.8.8]");
  expect(url.hostname).toBe("[::ffff:808:808]");
});
```

## Prevention

- **Rule**: Always resolve both A and AAAA records when validating DNS for SSRF protection.
- **Rule**: Test with URL-parser-normalized forms, not just human-readable forms.
- **Detection**: Grep for `dns.resolve(` without corresponding `dns.resolve6(` calls.
- **Testing**: Include IPv4-mapped IPv6 in both dotted-quad and hex form in SSRF test suites.

## References

- [Todo #004](../../todos/004-pending-p1-ipv6-ssrf-bypass.md)
- [Security Audit v1](../../docs/archive/SECURITY_AUDIT.md) — SEC-1
- [Security Audit v2](../../docs/archive/SECURITY_AUDIT_V2.md) — SEC-N2
- PR: #47

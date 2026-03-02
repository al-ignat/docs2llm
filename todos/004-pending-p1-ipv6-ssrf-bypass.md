---
status: complete
priority: p1
issue_id: "004"
tags: [code-review, security]
dependencies: []
---

# Fix IPv6 SSRF bypass in DNS resolution

## Problem Statement
The SSRF protection in `validateResolvedIPs()` only resolves IPv4 A records via `dns.resolve()`. It does not check AAAA (IPv6) records. An attacker controlling a domain with no A records but an AAAA record pointing to `::1` or `fe80::1` bypasses the DNS check entirely, and `fetch()` connects over IPv6 to a private address.

## Findings
- **Security Sentinel**: P2 — DNS resolution only checks IPv4, misses AAAA records
- **Learnings Researcher**: Prior audits (v1 SEC-1, v2 SEC-N2) fixed IPv4 SSRF and DNS rebinding, but IPv6 was not addressed

## Proposed Solutions

### Option A: Resolve both A and AAAA records (Recommended)
Use `Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)])` and validate both result sets. Add `isPrivateIPv6()` function to check against `::1`, `fe80::/10`, `fc00::/7`, `::ffff:0:0/96` (mapped IPv4).
- **Pros**: Complete fix, consistent with existing IPv4 protection
- **Cons**: Slightly more complex DNS resolution
- **Effort**: Small (1 hour)
- **Risk**: Low

## Recommended Action
Option A

## Technical Details
**Affected files:** src/core/url-safe.ts (lines 97-122, validateResolvedIPs function)

## Acceptance Criteria
- [ ] AAAA records are resolved and validated alongside A records
- [ ] Private IPv6 ranges blocked: `::1`, `fe80::/10`, `fc00::/7`, `::ffff:10.x.x.x` (mapped private IPv4)
- [ ] Tests cover IPv6 SSRF scenarios
- [ ] Existing IPv4 SSRF protection unchanged

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review v3 | Prior v1/v2 audits fixed IPv4 but missed IPv6 |

## Resources
- [Current implementation](src/core/url-safe.ts:97-122)
- [Prior SSRF fix](docs/archive/SECURITY_AUDIT.md) — SEC-1
- [DNS rebinding fix](docs/archive/SECURITY_AUDIT_V2.md) — SEC-N2

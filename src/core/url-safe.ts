/**
 * URL validation, SSRF protection, and safe fetch with timeout + size limits.
 */

import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from "dns/promises";
import { errorMessage } from "../shared/errors";

export const MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100 MB
export const FETCH_TIMEOUT_MS = 30_000; // 30 seconds
export const MAX_REDIRECTS = 5;

/**
 * Parse and validate a URL. Enforces http/https only and blocks private/reserved IPs.
 */
export function validateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${parsed.protocol} (only http and https allowed)`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block reserved hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "[::1]"
  ) {
    throw new Error(`Blocked request to reserved hostname: ${hostname}`);
  }

  // Block private/reserved IPv4
  if (isPrivateIPv4(hostname)) {
    throw new Error(`Blocked request to private IP: ${hostname}`);
  }

  // Block private/reserved IPv6 (may appear as [::1], [fe80::1], etc.)
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ipv6 = hostname.slice(1, -1);
    if (isPrivateIPv6(ipv6)) {
      throw new Error(`Blocked request to private IP: ${hostname}`);
    }
  }

  return parsed;
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => n < 0 || n > 255)) return false;

  const [a, b] = nums;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0
  if (nums.every((n) => n === 0)) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Loopback
  if (lower === "::1") return true;
  // Link-local
  if (lower.startsWith("fe80:") || lower.startsWith("fe80%")) return true;
  // Unique local address (fc00::/7)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:x.x.x.x or ::ffff:XXYY:ZZWW hex form)
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    // Dotted-quad form: ::ffff:127.0.0.1
    if (mapped.includes(".")) {
      return isPrivateIPv4(mapped);
    }
    // Hex form: ::ffff:7f00:1 (URL parsers normalize dotted-quad to this)
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
  return false;
}

/**
 * Resolve a hostname via DNS and validate that none of the resolved IPs are private.
 * This prevents DNS rebinding attacks where a hostname resolves to a public IP during
 * URL validation but a private IP when fetch() actually connects.
 */
async function validateResolvedIPs(hostname: string): Promise<void> {
  // Skip if the hostname is already an IP literal
  if (isPrivateIPv4(hostname)) {
    throw new Error(`Blocked request to private IP: ${hostname}`);
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return; // IPv6 literals are already checked in validateUrl
  }
  // Skip DNS resolution for IP-address hostnames (already validated above)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return;
  }

  try {
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
  } catch (err) {
    // Re-throw our own validation errors
    if (errorMessage(err).startsWith("Blocked")) throw err;
    // DNS resolution failures will be caught by fetch() itself
  }
}

/**
 * Fetch a URL with SSRF validation, timeout, and redirect validation.
 */
export async function safeFetch(url: string): Promise<Response> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = validateUrl(currentUrl);
    await validateResolvedIPs(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${currentUrl}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Follow redirects manually so we can validate each target
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect ${res.status} with no Location header`);
      }
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return res;
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

/**
 * Fetch a URL safely, streaming the body with a cumulative size limit.
 */
export async function safeFetchBytes(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string; response: Response }> {
  const response = await safeFetch(url);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  // Check Content-Length header as early rejection
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && parseInt(declaredLength, 10) > MAX_INPUT_BYTES) {
    throw new Error(
      `Response too large: ${declaredLength} bytes (max ${MAX_INPUT_BYTES})`,
    );
  }

  // Stream body with cumulative size limit
  const reader = response.body?.getReader();
  if (!reader) {
    return { bytes: new Uint8Array(0), contentType, response };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_INPUT_BYTES) {
      reader.cancel();
      throw new Error(
        `Response exceeded size limit: >${MAX_INPUT_BYTES} bytes`,
      );
    }
    chunks.push(value);
  }

  // Assemble into a single Uint8Array
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, contentType, response };
}

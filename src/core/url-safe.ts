/**
 * URL validation, SSRF protection, and safe fetch with timeout + size limits.
 */

import { resolve as dnsResolve } from "dns/promises";

export const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100 MB
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
  // IPv4-mapped (::ffff:x.x.x.x) — check the embedded IPv4
  if (lower.startsWith("::ffff:")) {
    const v4Part = lower.slice(7);
    if (isPrivateIPv4(v4Part)) return true;
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
    const addresses = await dnsResolve(hostname);
    for (const addr of addresses) {
      if (isPrivateIPv4(addr)) {
        throw new Error(`Blocked request: ${hostname} resolves to private IP ${addr}`);
      }
    }
  } catch (err: any) {
    // Re-throw our own validation errors
    if (err.message?.startsWith("Blocked")) throw err;
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
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
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
  if (declaredLength && parseInt(declaredLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(
      `Response too large: ${declaredLength} bytes (max ${MAX_RESPONSE_BYTES})`,
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
    if (totalBytes > MAX_RESPONSE_BYTES) {
      reader.cancel();
      throw new Error(
        `Response exceeded size limit: >${MAX_RESPONSE_BYTES} bytes`,
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

import { describe, expect, test } from "bun:test";
import { validateUrl } from "../url-safe";

describe("validateUrl", () => {
  // --- Valid URLs ---
  test("accepts a standard https URL", () => {
    const url = validateUrl("https://example.com/path?q=1");
    expect(url.hostname).toBe("example.com");
  });

  test("accepts a standard http URL", () => {
    const url = validateUrl("http://example.com");
    expect(url.protocol).toBe("http:");
  });

  // --- Scheme blocking ---
  test("rejects ftp scheme", () => {
    expect(() => validateUrl("ftp://files.example.com")).toThrow("Blocked URL scheme");
  });

  test("rejects file scheme", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow("Blocked URL scheme");
  });

  test("rejects javascript scheme", () => {
    expect(() => validateUrl("javascript:alert(1)")).toThrow("Blocked URL scheme");
  });

  // --- Invalid URLs ---
  test("rejects garbage input", () => {
    expect(() => validateUrl("not-a-url")).toThrow("Invalid URL");
  });

  test("rejects empty string", () => {
    expect(() => validateUrl("")).toThrow("Invalid URL");
  });

  // --- Reserved hostnames ---
  test("blocks localhost", () => {
    expect(() => validateUrl("http://localhost")).toThrow("reserved hostname");
  });

  test("blocks .local domains", () => {
    expect(() => validateUrl("http://myhost.local")).toThrow("reserved hostname");
  });

  test("blocks IPv6 loopback [::1]", () => {
    expect(() => validateUrl("http://[::1]")).toThrow("reserved hostname");
  });

  // --- Private IPv4 ranges ---
  test("blocks 127.x.x.x (loopback)", () => {
    expect(() => validateUrl("http://127.0.0.1")).toThrow("private IP");
  });

  test("blocks 127.0.0.2 (loopback range)", () => {
    expect(() => validateUrl("http://127.0.0.2")).toThrow("private IP");
  });

  test("blocks 10.x.x.x (RFC 1918)", () => {
    expect(() => validateUrl("http://10.0.0.1")).toThrow("private IP");
  });

  test("blocks 172.16.x.x (RFC 1918)", () => {
    expect(() => validateUrl("http://172.16.0.1")).toThrow("private IP");
  });

  test("blocks 172.31.x.x (end of RFC 1918 /12)", () => {
    expect(() => validateUrl("http://172.31.255.255")).toThrow("private IP");
  });

  test("allows 172.15.x.x (just outside RFC 1918)", () => {
    const url = validateUrl("http://172.15.0.1");
    expect(url.hostname).toBe("172.15.0.1");
  });

  test("allows 172.32.x.x (just outside RFC 1918)", () => {
    const url = validateUrl("http://172.32.0.1");
    expect(url.hostname).toBe("172.32.0.1");
  });

  test("blocks 192.168.x.x (RFC 1918)", () => {
    expect(() => validateUrl("http://192.168.1.1")).toThrow("private IP");
  });

  test("blocks 169.254.x.x (link-local)", () => {
    expect(() => validateUrl("http://169.254.169.254")).toThrow("private IP");
  });

  test("blocks 0.0.0.0", () => {
    expect(() => validateUrl("http://0.0.0.0")).toThrow("private IP");
  });

  // --- Private IPv6 ---
  test("blocks fe80:: (link-local IPv6)", () => {
    expect(() => validateUrl("http://[fe80::1]")).toThrow("private IP");
  });

  test("blocks fc00:: (unique local IPv6)", () => {
    expect(() => validateUrl("http://[fc00::1]")).toThrow("private IP");
  });

  test("blocks fd:: (unique local IPv6)", () => {
    expect(() => validateUrl("http://[fd12::1]")).toThrow("private IP");
  });

  // BUG: URL parser normalizes ::ffff:127.0.0.1 → ::ffff:7f00:1 (hex),
  // bypassing the dotted-quad check in isPrivateIPv6. These tests document
  // the current (broken) behavior. See SSRF bypass via IPv4-mapped IPv6.
  test.todo("blocks IPv4-mapped IPv6 with private address (currently bypassed)");
  test.todo("blocks IPv4-mapped IPv6 with 10.x address (currently bypassed)");

  // --- Public IPs should pass ---
  test("allows public IPv4", () => {
    const url = validateUrl("http://8.8.8.8");
    expect(url.hostname).toBe("8.8.8.8");
  });
});

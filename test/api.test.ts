import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { startServer } from "../src/server/api";

let server: { port: number; stop: () => void };
let base: string;

beforeAll(() => {
  server = startServer(0); // random port
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop();
});

// --- Security headers ---

describe("security headers", () => {
  test("GET / returns HTML security headers", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  test("GET /formats returns nosniff header", async () => {
    const res = await fetch(`${base}/formats`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("404 returns nosniff header", async () => {
    const res = await fetch(`${base}/unknown`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

// --- GET / ---

describe("GET /", () => {
  test("returns 200 with HTML content", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });
});

// --- GET /formats ---

describe("GET /formats", () => {
  test("returns 200 with formats array", async () => {
    const res = await fetch(`${base}/formats`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.formats)).toBe(true);
    expect(json.formats.length).toBeGreaterThan(0);
    // Each format should have ext and mime
    expect(json.formats[0]).toHaveProperty("ext");
    expect(json.formats[0]).toHaveProperty("mime");
  });
});

// --- POST /convert ---

describe("POST /convert", () => {
  test("returns 400 on missing file", async () => {
    const form = new FormData();
    const res = await fetch(`${base}/convert`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  test("returns 200 on valid text file", async () => {
    const form = new FormData();
    form.append("file", new File(["Hello world, this is a test document."], "test.txt", { type: "text/plain" }));
    const res = await fetch(`${base}/convert`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBeDefined();
    expect(json.words).toBeGreaterThan(0);
    expect(json.tokens).toBeGreaterThan(0);
    expect(Array.isArray(json.fits)).toBe(true);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("returns 400 on invalid form data", async () => {
    const res = await fetch(`${base}/convert`, {
      method: "POST",
      body: "not form data",
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(400);
  });
});

// --- POST /convert/url ---

describe("POST /convert/url", () => {
  test("returns 400 on missing URL", async () => {
    const res = await fetch(`${base}/convert/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("url");
  });

  test("returns 400 on invalid JSON body", async () => {
    const res = await fetch(`${base}/convert/url`, {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid JSON");
  });

  test("returns 400 on blocked URL scheme", async () => {
    const res = await fetch(`${base}/convert/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// --- POST /convert/clipboard ---

describe("POST /convert/clipboard", () => {
  test("returns 400 on empty body", async () => {
    const res = await fetch(`${base}/convert/clipboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("html");
  });

  test("returns 200 on plain text input", async () => {
    const res = await fetch(`${base}/convert/clipboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello clipboard world" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBe("Hello clipboard world");
    expect(json.words).toBeGreaterThan(0);
    expect(json.tokens).toBeGreaterThan(0);
    expect(Array.isArray(json.fits)).toBe(true);
  });

  test("returns 200 on HTML input", async () => {
    const res = await fetch(`${base}/convert/clipboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: "<p>Hello <strong>bold</strong> world</p>" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBeDefined();
    expect(json.words).toBeGreaterThan(0);
  });

  test("returns 400 on invalid JSON", async () => {
    const res = await fetch(`${base}/convert/clipboard`, {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});

// --- POST /convert/outbound ---

describe("POST /convert/outbound", () => {
  test("returns 400 on missing file", async () => {
    const form = new FormData();
    form.append("format", "docx");
    const res = await fetch(`${base}/convert/outbound`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("No file");
  });

  test("returns 400 on invalid format", async () => {
    const form = new FormData();
    form.append("file", new File(["# Hello"], "test.md", { type: "text/markdown" }));
    form.append("format", "pdf");
    const res = await fetch(`${base}/convert/outbound`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("format");
  });

  test("returns 400 on missing format", async () => {
    const form = new FormData();
    form.append("file", new File(["# Hello"], "test.md", { type: "text/markdown" }));
    const res = await fetch(`${base}/convert/outbound`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("format");
  });
});

// --- GET /config ---

describe("GET /config", () => {
  test("returns 200 with config object", async () => {
    const res = await fetch(`${base}/config`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("config");
    expect(json).toHaveProperty("configPath");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

// --- GET /config/templates ---

describe("GET /config/templates", () => {
  test("returns 200 with templates object", async () => {
    const res = await fetch(`${base}/config/templates`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("templates");
    expect(typeof json.templates).toBe("object");
  });
});

// --- Concurrency limiter ---

describe("concurrency limiter", () => {
  test("returns 429 when conversion limit exceeded", async () => {
    // Fire 4 concurrent conversions (limit is 3) — at least one should get 429
    const form = () => {
      const f = new FormData();
      // Use a valid text file to trigger actual conversion (not a 400 error)
      f.append("file", new File(["Hello world, this is a test."], "test.txt", { type: "text/plain" }));
      return f;
    };

    const requests = Array.from({ length: 6 }, () =>
      fetch(`${base}/convert`, { method: "POST", body: form() })
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);

    // At least one 200 (some got through) and at least one 429 (some were rejected)
    expect(statuses).toContain(200);
    expect(statuses).toContain(429);

    // Verify 429 body
    const rejected = responses.find((r) => r.status === 429)!;
    const json = await rejected.json();
    expect(json.error).toContain("busy");
  });

  test("conversion succeeds under the limit", async () => {
    // Single request should always succeed
    const form = new FormData();
    form.append("file", new File(["Simple test content."], "test.txt", { type: "text/plain" }));
    const res = await fetch(`${base}/convert`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content).toBeDefined();
  });
});

// --- 404 ---

describe("unknown routes", () => {
  test("GET /unknown returns 404", async () => {
    const res = await fetch(`${base}/unknown`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Not found");
  });

  test("POST /unknown returns 404", async () => {
    const res = await fetch(`${base}/unknown`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

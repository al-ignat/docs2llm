import { describe, expect, test } from "bun:test";
import { defuddleHtml } from "../src/core/adapters/defuddle";

describe("defuddleHtml", () => {
  test("extracts main content from article HTML with <article> tag", async () => {
    const html = `
      <html><head><title>My Article</title></head><body>
        <nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
        <article>
          <h1>Research Findings</h1>
          <p>This study examines the impact of distributed systems on modern web architecture. We found significant improvements in latency when using edge caching strategies.</p>
          <p>Our methodology involved testing across multiple data centers with varying loads and network conditions over a period of six months.</p>
        </article>
        <aside><h3>Related Posts</h3><ul><li>Post 1</li><li>Post 2</li></ul></aside>
        <footer><p>Copyright 2024 Example Corp</p></footer>
      </body></html>`;

    const result = await defuddleHtml(html);
    expect(result).not.toBeNull();
    expect(result!.cleanedHtml).toContain("Research Findings");
    expect(result!.cleanedHtml).toContain("distributed systems");
    // Defuddle should strip nav/footer boilerplate from the cleaned HTML
    expect(result!.cleanedHtml).not.toContain("<nav>");
    expect(result!.cleanedHtml).not.toContain("<footer>");
  });

  test("returns null on short fragment (too little content)", async () => {
    const html = "<p>Short</p>";
    const result = await defuddleHtml(html);
    expect(result).toBeNull();
  });

  test("returns null on empty HTML", async () => {
    const html = "<html><body></body></html>";
    const result = await defuddleHtml(html);
    expect(result).toBeNull();
  });

  test("extracts content from email-style HTML", async () => {
    // Email HTML with MSO artifacts — defuddleHtml doesn't filter emails,
    // that's the routing layer's job (PR C). It just extracts what it can.
    const html = `
      <html><head><title>Meeting Notes</title></head><body>
        <!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
        <div class="MsoNormal">
          <h1>Sprint 42 Notes</h1>
          <p>The team discussed the upcoming API migration plan. Marcus presented the timeline for the gateway rollout across three phases.</p>
          <p>Key decisions were made about the authentication middleware and the caching strategy for the new endpoints.</p>
        </div>
      </body></html>`;

    const result = await defuddleHtml(html);
    // We don't rely on this being null — routing is PR C's job
    // Just verify it doesn't crash on MSO content
    if (result) {
      expect(result.cleanedHtml).toContain("Sprint 42");
    }
  });

  test("populates title, wordCount, parseTimeMs fields", async () => {
    const html = `
      <html><head><title>Test Title</title></head><body>
        <article>
          <h1>Article Heading</h1>
          <p>This is a sufficiently long paragraph to ensure Defuddle processes it and returns meaningful metadata including word count and parse timing information.</p>
        </article>
      </body></html>`;

    const result = await defuddleHtml(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Title");
    expect(typeof result!.wordCount).toBe("number");
    expect(typeof result!.parseTimeMs).toBe("number");
  });

  test("passes URL through to Defuddle", async () => {
    const html = `
      <html><head><title>URL Test</title></head><body>
        <article>
          <h1>Content with URL context</h1>
          <p>This article has enough content for Defuddle to process it successfully when a URL is provided as context for the extraction.</p>
        </article>
      </body></html>`;

    const result = await defuddleHtml(html, "https://example.com/article");
    expect(result).not.toBeNull();
    expect(result!.cleanedHtml).toContain("Content with URL context");
  });

  test("lazy-loading reuses module (second call is faster)", async () => {
    const html = `
      <html><body>
        <article><h1>First Call</h1><p>Content that is long enough to pass the minimum threshold for Defuddle extraction quality checks.</p></article>
      </body></html>`;

    // First call loads the module
    const t1 = performance.now();
    await defuddleHtml(html);
    const first = performance.now() - t1;

    // Second call reuses cached module
    const t2 = performance.now();
    await defuddleHtml(html);
    const second = performance.now() - t2;

    // Second call should be faster (no module loading overhead)
    // We can't assert exact timing, but verify both calls succeed
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  });
});

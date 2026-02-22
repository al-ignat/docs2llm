import { describe, expect, test } from "bun:test";
import {
  countWords,
  estimateTokens,
  getTokenStats,
  checkLLMFit,
  formatTokenStats,
  formatLLMFit,
  anyTooLong,
  smallestLimit,
  truncateToFit,
  splitToFit,
} from "../tokens";

describe("countWords", () => {
  test("counts words in a simple sentence", () => {
    expect(countWords("hello world")).toBe(2);
  });

  test("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  test("returns 0 for whitespace-only", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  test("handles multiple spaces and newlines", () => {
    expect(countWords("one  two\n\nthree\tfour")).toBe(4);
  });
});

describe("estimateTokens", () => {
  test("estimates ~1.33 tokens per word", () => {
    // 10 words → ceil(10 * 1.33) = 14
    const text = "one two three four five six seven eight nine ten";
    expect(estimateTokens(text)).toBe(14);
  });

  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("getTokenStats", () => {
  test("returns both words and tokens", () => {
    const stats = getTokenStats("hello world foo");
    expect(stats.words).toBe(3);
    expect(stats.tokens).toBe(Math.ceil(3 * 1.33));
  });
});

describe("checkLLMFit", () => {
  test("all models fit for small token count", () => {
    const fits = checkLLMFit(100);
    expect(fits.every((f) => f.fits)).toBe(true);
  });

  test("only Gemini fits for 500k tokens", () => {
    const fits = checkLLMFit(500_000);
    const fitting = fits.filter((f) => f.fits);
    expect(fitting.length).toBe(1);
    expect(fitting[0].name).toBe("Gemini");
  });

  test("no models fit for 2M tokens", () => {
    const fits = checkLLMFit(2_000_000);
    expect(fits.every((f) => !f.fits)).toBe(true);
  });
});

describe("formatTokenStats", () => {
  test("formats with locale separators", () => {
    const result = formatTokenStats({ words: 1000, tokens: 1330 });
    expect(result).toContain("1,000 words");
    expect(result).toContain("1,330 tokens");
  });
});

describe("formatLLMFit", () => {
  test("uses check and cross marks", () => {
    const result = formatLLMFit([
      { name: "ModelA", limit: 100, fits: true },
      { name: "ModelB", limit: 50, fits: false },
    ]);
    expect(result).toContain("ModelA \u2713");
    expect(result).toContain("ModelB \u2717");
  });
});

describe("anyTooLong", () => {
  test("returns false when all fit", () => {
    expect(anyTooLong([{ name: "A", limit: 100, fits: true }])).toBe(false);
  });

  test("returns true when one does not fit", () => {
    expect(
      anyTooLong([
        { name: "A", limit: 100, fits: true },
        { name: "B", limit: 50, fits: false },
      ])
    ).toBe(true);
  });
});

describe("smallestLimit", () => {
  test("returns undefined when all fit", () => {
    expect(smallestLimit([{ name: "A", limit: 100, fits: true }])).toBeUndefined();
  });

  test("returns the model with the smallest limit that does not fit", () => {
    const result = smallestLimit([
      { name: "A", limit: 200, fits: false },
      { name: "B", limit: 100, fits: false },
      { name: "C", limit: 500, fits: true },
    ]);
    expect(result?.name).toBe("B");
    expect(result?.limit).toBe(100);
  });
});

describe("truncateToFit", () => {
  test("returns text unchanged when it fits", () => {
    expect(truncateToFit("hello world", 100_000)).toBe("hello world");
  });

  test("truncates and appends suffix when text is too long", () => {
    // 10 words, target 5 tokens → floor(5 * 0.99 / 1.33) ≈ 3 words
    const text = "one two three four five six seven eight nine ten";
    const result = truncateToFit(text, 5);
    expect(result).toContain("[Truncated to fit context window]");
    // Should have fewer words than the original
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThan(10);
  });
});

describe("splitToFit", () => {
  test("returns single part when text fits", () => {
    const result = splitToFit("hello world", 100_000);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toBe("hello world");
  });

  test("splits into multiple parts for large text", () => {
    // Build text with 100 paragraphs
    const paragraphs = Array.from({ length: 100 }, (_, i) =>
      `Paragraph ${i} with some extra words to bulk it up a bit more.`
    );
    const text = paragraphs.join("\n\n");
    // Use a small target to force splitting
    const result = splitToFit(text, 50);
    expect(result.parts.length).toBeGreaterThan(1);
    expect(result.tokensPerPart.length).toBe(result.parts.length);
  });
});

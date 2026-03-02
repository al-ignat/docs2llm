export interface TokenStats {
  words: number;
  tokens: number;
}

export interface LLMFit {
  name: string;
  limit: number;
  fits: boolean;
}

const LLM_MODELS = [
  { name: "GPT-4o mini", limit: 128_000 },
  { name: "GPT-4o", limit: 128_000 },
  { name: "Claude", limit: 200_000 },
  { name: "Gemini", limit: 1_000_000 },
];

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateTokens(text: string, precomputedWords?: number): number {
  // ~1.33 tokens per word is a common heuristic for English text
  const words = precomputedWords ?? countWords(text);
  return Math.ceil(words * 1.33);
}

export function getTokenStats(text: string): TokenStats {
  const words = countWords(text);
  return {
    words,
    tokens: estimateTokens(text, words),
  };
}

export function checkLLMFit(tokens: number): LLMFit[] {
  return LLM_MODELS.map((m) => ({
    name: m.name,
    limit: m.limit,
    fits: tokens <= m.limit,
  }));
}

export function formatTokenStats(stats: TokenStats): string {
  return `${stats.words.toLocaleString()} words, ~${stats.tokens.toLocaleString()} tokens`;
}

export function formatLLMFit(fits: LLMFit[]): string {
  return fits
    .map((f) => `${f.name} ${f.fits ? "✓" : "✗"}`)
    .join("  ");
}

export function anyTooLong(fits: LLMFit[]): boolean {
  return fits.some((f) => !f.fits);
}

export function smallestLimit(fits: LLMFit[]): LLMFit | undefined {
  const tooLong = fits.filter((f) => !f.fits);
  if (tooLong.length === 0) return undefined;
  return tooLong.reduce((a, b) => (a.limit < b.limit ? a : b));
}

export function truncateToFit(text: string, targetTokens: number): string {
  const wordCount = countWords(text);
  // Leave 1% margin for the suffix and rounding errors
  const safeTarget = Math.floor(targetTokens * 0.99);
  const targetWords = Math.floor(safeTarget / 1.33);
  if (wordCount <= targetWords) return text;
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, targetWords).join(" ") + "\n\n[Truncated to fit context window]";
}

export interface SplitResult {
  parts: string[];
  tokensPerPart: number[];
}

/**
 * Split text into roughly equal parts that each fit within targetTokens.
 * Splits at paragraph boundaries when possible.
 */
export function splitToFit(text: string, targetTokens: number): SplitResult {
  const totalWords = countWords(text);
  const totalTokens = estimateTokens(text, totalWords);
  const numParts = Math.ceil(totalTokens / (targetTokens * 0.95)); // 5% margin

  if (numParts <= 1) {
    return { parts: [text], tokensPerPart: [totalTokens] };
  }

  const paragraphs = text.split(/\n{2,}/);
  const targetWordsPerPart = Math.floor((targetTokens * 0.95) / 1.33);

  const parts: string[] = [];
  const wordsPerPart: number[] = [];
  let currentParagraphs: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (currentWords + paraWords > targetWordsPerPart && currentParagraphs.length > 0) {
      parts.push(currentParagraphs.join("\n\n"));
      wordsPerPart.push(currentWords);
      currentParagraphs = [];
      currentWords = 0;
    }

    currentParagraphs.push(para);
    currentWords += paraWords;
  }

  if (currentParagraphs.length > 0) {
    parts.push(currentParagraphs.join("\n\n"));
    wordsPerPart.push(currentWords);
  }

  const tokensPerPart = wordsPerPart.map((w) => estimateTokens("", w));
  return { parts, tokensPerPart };
}

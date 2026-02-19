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

export function estimateTokens(text: string): number {
  // ~1.33 tokens per word is a common heuristic for English text
  return Math.ceil(countWords(text) * 1.33);
}

export function getTokenStats(text: string): TokenStats {
  return {
    words: countWords(text),
    tokens: estimateTokens(text),
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
  const words = text.split(/\s+/).filter(Boolean);
  // Leave 1% margin for the suffix and rounding errors
  const safeTarget = Math.floor(targetTokens * 0.99);
  const targetWords = Math.floor(safeTarget / 1.33);
  if (words.length <= targetWords) return text;
  return words.slice(0, targetWords).join(" ") + "\n\n[Truncated to fit context window]";
}

import * as p from "@clack/prompts";

/**
 * Cancellation guard — if the value is a cancel symbol, exits cleanly.
 * Otherwise returns the value with narrowed type.
 */
export function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

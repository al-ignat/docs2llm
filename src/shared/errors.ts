/** Extract a human-readable message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Strip filesystem paths from error messages to avoid leaking directory structure. */
export function sanitizeError(msg: string): string {
  return msg.replace(/\/(?:[\w.-]+\/){2,}([\w.-]+)/g, "$1");
}

/** Safe error message for user-facing responses — strips filesystem paths. */
export function safeErrorMessage(err: unknown): string {
  return sanitizeError(errorMessage(err));
}

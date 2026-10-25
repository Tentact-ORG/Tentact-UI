/** An error that maps directly to an HTTP response (`{"detail": ...}` body). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(detail);
    this.name = "HttpError";
  }
}

/**
 * Raised when a query is blocked by security review or deterministic policy.
 * Equivalent of the Python `PermissionError` usage; surfaced as HTTP 403.
 */
export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyViolationError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

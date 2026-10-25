/** Fixed-window request counter per key, bounded in size. */
export class RequestLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts a request; returns the seconds to wait when `key` is over the limit, otherwise 0. */
  hit(key: string, now = Date.now()): number {
    let entry = this.windows.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      entry = { start: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, entry);
      while (this.windows.size > this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest === undefined) break;
        this.windows.delete(oldest);
      }
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.start + this.windowMs - now) / 1000) : 0;
  }

  reset(): void {
    this.windows.clear();
  }
}

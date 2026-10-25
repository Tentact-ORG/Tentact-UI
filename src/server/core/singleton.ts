/**
 * Process-wide singletons.
 *
 * Next.js compiles route handlers and `instrumentation.ts` into separate bundles, so
 * plain module-level state is not shared between them (and is reset by dev-mode HMR).
 * Services that hold in-memory caches (schema, values, approved joins) or long-lived
 * clients register themselves here so every bundle sees the same instance.
 */
export function singleton<T>(key: string, factory: () => T): T {
  const registry = globalThis as unknown as Record<symbol, T | undefined>;
  const symbol = Symbol.for(`leadgen.${key}`);
  const existing = registry[symbol];
  if (existing !== undefined) {
    return existing;
  }
  const created = factory();
  registry[symbol] = created;
  return created;
}

/** Removes a registered singleton so the next `singleton()` call recreates it. */
export function resetSingleton(key: string): void {
  const registry = globalThis as unknown as Record<symbol, unknown>;
  delete registry[Symbol.for(`leadgen.${key}`)];
}

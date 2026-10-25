import path from "node:path";

/**
 * Resolves a runtime path (database file, export storage, seed data) against the
 * server's working directory. The annotation stops the bundler from treating the
 * working directory as a build-time dependency and tracing the whole project tree.
 */
export function resolveFromCwd(...segments: string[]): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), ...segments);
}

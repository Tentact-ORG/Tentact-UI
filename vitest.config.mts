import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
      "server-only": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Each file gets its own process and SQLite database.
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

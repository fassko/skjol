import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 60_000 },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // Mirrors the "@/*" alias in tsconfig.json, so tests import modules exactly
    // the way the app does rather than by relative path.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});

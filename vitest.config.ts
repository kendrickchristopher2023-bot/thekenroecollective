import { fileURLToPath } from "node:url";

// Unit tests only. Playwright specs under tests/e2e are run by `playwright test`.
// Kept dependency-free so it loads even when vitest is executed via bunx.
export default {
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    // The events-store tests import a large module graph and exercise debounced
    // sync timers; 5s is not enough once the whole suite runs in parallel, and
    // the resulting flakes hide real failures.
    testTimeout: 30000,
    hookTimeout: 30000,
    environmentMatchGlobs: [["tests/unit/**/*.test.tsx", "jsdom"]],
  },
};


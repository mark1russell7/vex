import { defineConfig } from "vitest/config";

// This configuration reads only the property of the budget flip, with the fast-check setup of the test runs.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["budget.flip.ts"],
    setupFiles: ["../../src/fc-setup.ts"],
    passWithNoTests: false,
    testTimeout: 30_000,
  },
});

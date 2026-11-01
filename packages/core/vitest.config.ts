import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}", "bench/**/*.test.ts"],
    // Each package has tests, so a run that finds none is an error (a broken pattern), not a pass.
    passWithNoTests: false,
  },
});

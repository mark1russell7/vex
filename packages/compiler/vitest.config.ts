import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["../testkit/src/fc-setup.ts"],
    // Each package has tests, so a run that finds none is an error (a broken pattern), not a pass.
    passWithNoTests: false,
    // The nightly run sets FC_NUM_RUNS to 10000, so a property test takes longer than the default limit.
    testTimeout: process.env["FC_NUM_RUNS"] === undefined ? 30_000 : 900_000,
  },
});

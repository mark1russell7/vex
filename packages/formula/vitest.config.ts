import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["../testkit/src/fc-setup.ts"],
    passWithNoTests: true,
    // The nightly run sets FC_NUM_RUNS to 10000, so a property test takes longer than the default limit. On
    // 2026-10-21, the property FORMULA.SHEET took 4.9 to 5.3 seconds there, against the default limit of 5 seconds.
    testTimeout: process.env["FC_NUM_RUNS"] === undefined ? 30_000 : 900_000,
  },
});

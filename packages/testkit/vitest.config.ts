import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/fc-setup.ts"],
    passWithNoTests: true,
    // The nightly run sets FC_NUM_RUNS to 10000, so a property test takes longer than the default limit.
    testTimeout: process.env["FC_NUM_RUNS"] === undefined ? 5000 : 900_000,
  },
});

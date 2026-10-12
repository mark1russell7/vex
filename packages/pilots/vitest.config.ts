import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["../testkit/src/fc-setup.ts"],
    passWithNoTests: true,
    // The nightly run sets FC_NUM_RUNS to 10000, so a property test takes longer than the default limit. The pilots
    // compare three paths on each input, and a busy machine (the coverage run of `pnpm check`) can make 200 runs take
    // more than 5 seconds. Thus the limit is 60 seconds without FC_NUM_RUNS.
    testTimeout: process.env["FC_NUM_RUNS"] === undefined ? 60_000 : 900_000,
  },
});

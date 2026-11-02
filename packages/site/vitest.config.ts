import { defineConfig } from "vitest/config";
import { propertyTimeout } from "../testkit/src/fc-timeout.ts";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The seed and the number of runs of fast-check come from FC_SEED and FC_NUM_RUNS, as in the test kit.
    setupFiles: ["../testkit/src/fc-setup.ts"],
    // Each package has tests, so a run that finds none is an error (a broken pattern), not a pass.
    passWithNoTests: false,
    testTimeout: propertyTimeout(5000),
  },
});

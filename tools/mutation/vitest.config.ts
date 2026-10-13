import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const work = (p: string): string => fileURLToPath(new URL(`./work/${p}`, import.meta.url));

// The tests of the four packages in work/, run by Vitest 4.1. The aliases make "vitest" the Vitest of this
// lane, and "@mark1russell7/vex" the copy that Stryker mutates.
export default defineConfig({
  resolve: {
    alias: {
      vitest: fileURLToPath(import.meta.resolve("vitest")),
      "@mark1russell7/vex": work("core/index.ts"),
      "@mark1russell7/vex-domains": work("domains/index.ts"),
      "@mark1russell7/vex-testkit": work("testkit/index.ts"),
    },
  },
  test: {
    include: ["work/**/*.test.ts"],
    // The spec coverage test reads the spec by a path from packages/core, so it does not run here.
    exclude: ["work/core/spec-coverage.test.ts"],
    setupFiles: [work("testkit/fc-setup.ts")],
  },
});

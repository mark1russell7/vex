import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const work = (p: string): string => fileURLToPath(new URL(`./work/${p}`, import.meta.url));

// The tests of the four packages in work/, run by Vitest 4.1. The aliases make "vitest" the Vitest of this
// lane, and "@mark1russell7/vex" the copy that Stryker mutates.
export default defineConfig({
  plugins: [
    {
      // This plugin gives "@mark1russell7/vex-domains" to each test. A standalone module copies the text of each op
      // function, so the tests of the modules (module.test.ts, module-sheet-lists.test.ts) get the copy that Stryker does
      // not mutate (prepare.mjs).
      name: "vex-domains",
      enforce: "pre",
      resolveId(source, importer) {
        if (source !== "@mark1russell7/vex-domains") return null;
        return /\/work\/compiler\/module(-[a-z]+)*\.test\.ts$/.test((importer ?? "").replaceAll("\\", "/")) ? work("domains-plain/index.ts") : work("domains/index.ts");
      },
    },
  ],
  resolve: {
    alias: {
      vitest: fileURLToPath(import.meta.resolve("vitest")),
      "@mark1russell7/vex": work("core/index.ts"),
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

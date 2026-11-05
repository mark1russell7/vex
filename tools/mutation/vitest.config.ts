import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { printsModule, SETUP_FILES } from "./layout.ts";

const work = (p: string): string => fileURLToPath(new URL(`./work/${p}`, import.meta.url));
// Stryker runs this folder in a copy (.stryker-tmp/sandbox-*), so the paths come from the folder of this file.
const pilots = fileURLToPath(new URL("./pilots/src/", import.meta.url)).replaceAll("\\", "/");

// The tests of the four packages in work/, run by Vitest 4.1. The aliases make "vitest" the Vitest of this
// lane, and "@mark1russell7/vex" the copy that Stryker mutates.
export default defineConfig({
  plugins: [
    {
      // This plugin gives "@mark1russell7/vex-domains" to each test. A standalone module copies the text of each op
      // function, so each test of the compiler that prints a module (printsModule of layout.ts) gets the copy that
      // Stryker does not mutate (prepare.mjs). The copy of the pilots gives its domains to those tests (SHAPE_DOMAINS of
      // module-fuse.test.ts), so it gets that copy too.
      name: "vex-domains",
      enforce: "pre",
      resolveId(source, importer) {
        // steps.test.ts mocks the constructs of the core by a path of the repository. The compiler in work/ reads
        // work/core/constructs.ts, so the mock must go to that file.
        if (source === "../../core/src/constructs.ts") return work("core/constructs.ts");
        if (source !== "@mark1russell7/vex-domains") return null;
        const from = (importer ?? "").replaceAll("\\", "/");
        const plain = from.startsWith(pilots) || (/\/work\/compiler\/[^/]*\.test\.ts$/u.test(from) && printsModule(readFileSync(from, "utf8")));
        return plain ? work("domains-plain/index.ts") : work("domains/index.ts");
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
    // The spec coverage test reads the spec by a path from packages/core, so it does not run here. The test of the gate
    // of the names reads work/test, and Stryker does not mutate that folder. So that test stops no mutant.
    exclude: ["work/core/spec-coverage.test.ts", "work/compiler/names-gate.test.ts"],
    setupFiles: SETUP_FILES.map((file) => work(file)),
    // The counters of Stryker make a property test slower. The P17 tests of 1500 runs passed the limit of 5 s on 11-04.
    testTimeout: 60_000,
  },
});

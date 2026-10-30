// The configuration of Stryker for the lane. The variable VEX_MUTATE names the packages to mutate, for example
// "compiler" or "core,domains". Without it, the lane mutates the four published packages. The nightly job runs one
// package on each runner, so that each run stays in its time limit. The core has two parts for two runners:
// "core.kernel" (the modules of the kernel of coeval) and "core.base" (the other modules). "core" is the two parts.
// The compiler also has two parts: "compiler.module" (module.ts, the printer of the standalone modules) and
// "compiler.rest" (the other modules). On 2026-10-29 the whole compiler took more than 150 minutes on one runner.
import { readdirSync } from "node:fs";

const ALL = ["core", "domains", "testkit", "compiler"];
const PARTS = ["core.kernel", "core.base", "compiler.module", "compiler.rest"];
const packages = process.env.VEX_MUTATE?.split(",").filter((p) => p !== "") ?? ALL;
const unknown = packages.filter((p) => !ALL.includes(p) && !PARTS.includes(p));
if (unknown.length > 0) throw new Error(`VEX_MUTATE names a package that the lane does not have: ${unknown.join(", ")}`);

// The modules of the kernel of coeval in the core (docs/REVIEW.md, decision D13). prepare.mjs copied the core to work/.
const KERNEL = new Set(["kernel.ts", "plan.ts", "same.ts", "document.ts", "deps.ts", "write.ts"]);
/** @type {() => string[]} */
const compilerFiles = () =>
  readdirSync(new URL("./work/compiler/", import.meta.url), { recursive: true })
    .map((f) => String(f).replaceAll("\\", "/"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `work/compiler/${f}`);
/** @type {(kernel: boolean) => string[]} */
const coreFiles = (kernel) =>
  readdirSync(new URL("./work/core/", import.meta.url))
    .filter((f) => f.endsWith(".ts") && KERNEL.has(f) === kernel)
    .map((f) => `work/core/${f}`);
/** @type {(p: string) => string[]} */
const filesOf = (p) => {
  if (p === "core.kernel" || p === "core.base") return coreFiles(p === "core.kernel");
  if (p === "compiler.module") return ["work/compiler/module.ts"];
  // A pattern with "!" removes files from all the patterns before it, so this part names its files one by one.
  if (p === "compiler.rest") return compilerFiles().filter((f) => f !== "work/compiler/module.ts");
  return [`work/${p}/**/*.ts`];
};

export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: [
    ...packages.flatMap(filesOf),
    "!work/**/*.test.ts",
    "!work/core/test-support.ts",
    "!work/*/index.ts",
    "!work/testkit/fc-setup.ts",
    "!work/testkit/arbitraries.ts",
    "!work/testkit/builder-model-arbitraries.ts",
    "!work/testkit/sheet-arbitraries.ts",
  ],
  coverageAnalysis: "perTest",
  disableTypeChecks: false,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "../../reports/mutation/index.html" },
  jsonReporter: { fileName: "../../reports/mutation/mutation.json" },
  thresholds: { high: 98, low: 95, break: null },
  concurrency: 4,
};

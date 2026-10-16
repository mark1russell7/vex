// The configuration of Stryker for the lane. The variable VEX_MUTATE names the packages to mutate, for example
// "compiler" or "core,domains". Without it, the lane mutates the four published packages. The nightly job runs one
// package on each runner, so that each run stays in its time limit.
const ALL = ["core", "domains", "testkit", "compiler"];
const packages = process.env.VEX_MUTATE?.split(",").filter((p) => p !== "") ?? ALL;
const unknown = packages.filter((p) => !ALL.includes(p));
if (unknown.length > 0) throw new Error(`VEX_MUTATE names a package that the lane does not have: ${unknown.join(", ")}`);

export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: [
    ...packages.map((p) => `work/${p}/**/*.ts`),
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

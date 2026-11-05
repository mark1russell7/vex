// The configuration of Stryker for the lane. The variable VEX_MUTATE names the packages or the parts to mutate, for
// example "compiler" or "core.base.2". Without it, the lane mutates the four published packages. Each job of the lane has
// one part, so that each job stays in its time limit (layout.ts has the parts, tools/mutation/README.md has the reason).
// The variable VEX_CHANGED names the paths of the lane to read, with commas. A night reads only the changed files.
import { fileURLToPath } from "node:url";
import { entriesIn, mutateOf, PACKAGES } from "./layout.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const parts = process.env.VEX_MUTATE?.split(",").filter((p) => p !== "") ?? PACKAGES;
const changed = process.env.VEX_CHANGED?.split(",").filter((p) => p !== "") ?? [];
const entries = parts.flatMap((p) => mutateOf(root, p));

export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: changed.length === 0 ? entries : entriesIn(entries, changed),
  coverageAnalysis: "perTest",
  disableTypeChecks: false,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "../../reports/mutation/index.html" },
  jsonReporter: { fileName: "../../reports/mutation/mutation.json" },
  thresholds: { high: 98, low: 95, break: null },
  concurrency: 4,
  // The clock limit of one mutant is the net time of the first run, times 1.5, plus this value. A static mutant loads each
  // module again, and the net time leaves that out. At 5 s, the clock stopped 266 static mutants of the domains and hid
  // survivors (2026-11-05), so this value is 120 s. A dispatch can set VEX_TIMEOUT_MS to read another value.
  timeoutMS: Number(process.env.VEX_TIMEOUT_MS || 120000),
};

/**
 * The gate of the time of a print of each module of ireko against a fixed base commit (COMPILE.MODULE.COST).
 *
 *   node bench/module-cost.ts <the folder of a checkout of the base, with `module-cost-child.ts` in its bench folder>
 *
 * Each arm starts a fresh process for each print, and the order of the arms turns at each round. The base is fixed, so
 * the gate also finds a cost that grows over many pull requests. A new module has no time on the base, so the base
 * moves with that module, and the pull request states the reason.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { placesRead } from "../../compiler/src/unshared.ts";
import { envLine, measureIsolated } from "../../core/bench/measure.ts";
import { IREKO_MODULES, irekoExprs } from "../src/ireko-modules.ts";
import { limitOf, moduleCostFaults, readingOf, type ModuleTimes } from "./module-cost-limits.ts";

/** The fresh processes of each arm on each module. */
const ROUNDS = 7;

const [baseFolder] = process.argv.slice(2);
if (baseFolder === undefined) throw new Error("module-cost: give the folder of a checkout of the base.");

console.info(envLine("fresh"));
const report = await measureIsolated({
  arms: [
    { id: "base", command: [process.execPath, join(baseFolder, "packages/pilots/bench/module-cost-child.ts")] },
    { id: "branch", command: [process.execPath, fileURLToPath(new URL("module-cost-child.ts", import.meta.url))] },
  ],
  inputs: IREKO_MODULES.map((id) => ({ id })),
  repeats: ROUNDS,
  warmup: 0,
  mode: "fresh",
});

for (const [at, module] of IREKO_MODULES.entries()) {
  const ms = report.inputs[at]?.ms ?? {};
  const row: ModuleTimes = { module, shares: placesRead(irekoExprs(module)).shares, base: ms["base"] ?? [], branch: ms["branch"] ?? [], aa: ms["base~aa"] ?? [] };
  const faults = moduleCostFaults(row);
  const limit = limitOf(module, row.shares);
  const r = readingOf(row);
  console.info(
    `${faults.length === 0 ? "ok" : "FAIL"} module ${module} shares=${String(row.shares)} base=${r.baseMs.toFixed(2)} branch=${r.branchMs.toFixed(2)} ratio=${r.ratio.toFixed(2)} aa=${r.aa.toFixed(2)} worstPair=${r.worstPair.toFixed(2)} limit=${limit.median.toFixed(2)}/${limit.worst.toFixed(2)}`,
  );
  for (const fault of faults) console.error(`FAIL ${fault}`);
  if (faults.length > 0) process.exitCode = 1;
}

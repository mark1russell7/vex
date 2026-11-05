/**
 * The gate of the time of a print of each module of ireko against a fixed base commit (COMPILE.MODULE.COST).
 *
 *   node bench/module-cost.ts <the folder of a checkout of the base, with `module-cost-child.ts` in its bench folder>
 *
 * Each arm starts a fresh process for each print, and the order of the arms turns at each round. The base is fixed, so
 * the gate also finds a cost that grows over many pull requests. A new module has no time on the base, so the base
 * moves with that module, and the pull request states the reason.
 *
 * The row `build` prints all the modules with a shared object in one process, in the order of the table. Each ratio
 * has three decimals, so that no row rounds on to its line.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { placesRead } from "../../compiler/src/unshared.ts";
import { envLine, measureIsolated } from "../../core/bench/measure.ts";
import { IREKO_MODULES, irekoExprs } from "../src/ireko-modules.ts";
import { BUILD_ROW, limitOf, moduleCostFaults, readingOf, runAaWorst, worstIsNoise, type ModuleTimes } from "./module-cost-limits.ts";

/** The fresh processes of each arm on each module. */
const ROUNDS = 7;

const [baseFolder] = process.argv.slice(2);
if (baseFolder === undefined) throw new Error("module-cost: give the folder of a checkout of the base.");

/** Each row of the gate: its name, its input to the child, and the result of `placesRead` on its program. */
const moduleRows = IREKO_MODULES.map((module) => ({ module, input: module as string, shares: placesRead(irekoExprs(module)).shares }));
const rows = [...moduleRows, { module: BUILD_ROW as string, input: moduleRows.filter((r) => r.shares).map((r) => r.module).join(","), shares: true }];

console.info(envLine("fresh"));
const report = await measureIsolated({
  arms: [
    { id: "base", command: [process.execPath, join(baseFolder, "packages/pilots/bench/module-cost-child.ts")] },
    { id: "branch", command: [process.execPath, fileURLToPath(new URL("module-cost-child.ts", import.meta.url))] },
  ],
  inputs: rows.map((r) => ({ id: r.input })),
  repeats: ROUNDS,
  warmup: 0,
  mode: "fresh",
});

const times: readonly ModuleTimes[] = rows.map(({ module, shares }, at) => {
  const ms = report.inputs[at]?.ms ?? {};
  return { module, shares, base: ms["base"] ?? [], branch: ms["branch"] ?? [], aa: ms["base~aa"] ?? [] };
});
const runWorst = runAaWorst(times);

for (const row of times) {
  const { module, shares } = row;
  const faults = moduleCostFaults(row, runWorst);
  const limit = limitOf(module, shares);
  const r = readingOf(row);
  console.info(`times module=${module} base=${row.base.map((v) => v.toFixed(2)).join(",")} branch=${row.branch.map((v) => v.toFixed(2)).join(",")} aa=${row.aa.map((v) => v.toFixed(2)).join(",")}`);
  console.info(
    `${faults.length === 0 ? "ok" : "FAIL"} module ${module} shares=${String(shares)} base=${r.baseMs.toFixed(2)} branch=${r.branchMs.toFixed(2)} ratio=${r.ratio.toFixed(3)} aa=${r.aa.toFixed(3)} worstPair=${r.worstPair.toFixed(3)} secondPair=${r.secondPair.toFixed(3)} aaWorst=${r.aaWorst.toFixed(3)} runAaWorst=${runWorst.toFixed(3)} worstNoise=${String(worstIsNoise(r, limit, runWorst))} limit=${limit.median.toFixed(3)}/${limit.worst.toFixed(3)}`,
  );
  for (const fault of faults) console.error(`FAIL ${fault}`);
  if (faults.length > 0) process.exitCode = 1;
}

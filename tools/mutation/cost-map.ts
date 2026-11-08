// The cost map of module.ts (LANE.COST). The plan of a dry run gives the planned net time of each line of each part. This
// script adds the plans of the parts of compiler.module into one map of the segments of module.ts, and it writes the map
// into costs.json. The parts then end near their share of the cost, not of the lines. Start it from the root of the
// repository with the run of the dry run and the folder of each artifact `mutation-report-compiler.module.<n>`:
//
//   node tools/mutation/cost-map.ts <run> <folder>...
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { clockMinutes, type FilePlan, PLAN_FILE, TARGET_MINUTES } from "./lane-cost.ts";
import { type CostMap, costMapOf, COSTS_FILE, laneParts, lineWeights, mutateOf } from "./layout.ts";

/** The file that the lane cuts by lines, as a path of the lane. */
const MODULE = "work/compiler/module.ts";

/** This function gives the plan of each line of module.ts from the plans of the parts. */
function planLines(folders: readonly string[]): [number, number, number, number][] {
  return folders.flatMap((folder) => {
    const plan = JSON.parse(readFileSync(join(folder, PLAN_FILE), "utf8")) as { readonly files: Readonly<Record<string, FilePlan>> };
    return (plan.files[MODULE]?.lines ?? []).map((line) => [...line] as [number, number, number, number]);
  });
}

/** This function gives the estimate of the clock of each part of compiler.module, in minutes, under a cost map. */
export function partMinutes(root: string, parts: readonly string[], map: CostMap): number[] {
  const text = readFileSync(join(root, "packages", "compiler", "src", "module.ts"), "utf8");
  const weights = lineWeights(text, map);
  return parts.map((part) => {
    const [, from, to] = /:(\d+)-(\d+)$/u.exec(mutateOf(root, part)[0] ?? "") ?? [];
    const sum = weights.slice(Number(from) - 1, Number(to)).reduce((total, w) => total + w, 0);
    return clockMinutes(sum);
  });
}

/** This function writes the cost map of module.ts, and it gives 1 when the plans have no line of module.ts. */
function main(run: string | undefined, folders: readonly string[]): number {
  const lines = planLines(folders);
  if (run === undefined || lines.length === 0) {
    console.error("The plans give no line of module.ts. Name the run and the folder of each artifact of compiler.module.");
    return 1;
  }
  const root = process.cwd();
  const text = readFileSync(join(root, "packages", "compiler", "src", "module.ts"), "utf8");
  const map = costMapOf(text, run, lines);
  const total = Object.values(map.segments).reduce((sum, ms) => sum + ms, 0);
  writeFileSync(join(root, "tools", "mutation", COSTS_FILE), `${JSON.stringify({ [MODULE]: map }, null, 2)}\n`);
  const minutes = clockMinutes(total);
  console.log(`The cost map of module.ts from run ${run}: ${lines.length} lines with a plan, an estimate of ${Math.round(minutes)} minutes of the clock in all.`);
  console.log(`At ${TARGET_MINUTES} minutes a part, compiler.module needs ${Math.ceil(minutes / TARGET_MINUTES)} parts or more.`);
  const parts = laneParts().filter((part) => part.startsWith("compiler.module."));
  partMinutes(root, parts, map).forEach((m, i) => console.log(`${parts[i]}: an estimate of ${Math.round(m)} minutes.`));
  return 0;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv[2], process.argv.slice(3));

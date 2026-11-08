// The cost maps of the lane (LANE.COST). The plan of a dry run gives the planned net time of each line of each file of a
// part. This script adds the plans of the parts into one map of the segments of each file, and it writes the maps into
// costs.json. A plan names only the files with a mutant, so a file of the lane that no plan and no old map names gets a map
// with no cost. Each other file that the plans do not name keeps its old map. The parts of each group then cut by cost,
// not by lines. Start it from the root of the repository with the run of the dry run and the folder of the artifact
// `mutation-report-<part>` of each part of that run. The plan is at the top of the folder of an artifact:
//
//   node tools/mutation/cost-map.ts <run> <folder>...
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { clockMinutes, type FilePlan, type LinePlan, PLAN_FILE, TARGET_MINUTES } from "./lane-cost.ts";
import { type CostMap, costMapOf, costMaps, COSTS_FILE, laneParts, mutateOf, PACKAGES, plannedMs } from "./layout.ts";

/** This function gives the plan of each line of each file from the plans of the parts, by the path of the lane of the file. */
function planLines(folders: readonly string[]): Map<string, LinePlan[]> {
  const out = new Map<string, LinePlan[]>();
  for (const folder of folders) {
    const plan = JSON.parse(readFileSync(join(folder, basename(PLAN_FILE)), "utf8")) as { readonly files: Readonly<Record<string, FilePlan>> };
    for (const [file, row] of Object.entries(plan.files)) out.set(file, [...(out.get(file) ?? []), ...row.lines]);
  }
  return out;
}

/** This function gives the estimate of the clock of each part, in minutes, under the cost maps. */
export function partMinutes(root: string, parts: readonly string[], maps: Readonly<Record<string, CostMap>> = costMaps(root)): number[] {
  return parts.map((part) => clockMinutes(plannedMs(root, part, maps)));
}

/** This function gives the path in the repository of a path of the lane: `work/core/a.ts` is `packages/core/src/a.ts`. */
const repoPath = (file: string): string => file.replace(/^work\/([^/]+)\//u, "packages/$1/src/");

/** This function writes the cost maps, and it gives 1 when the plans have no line. */
function main(run: string | undefined, folders: readonly string[]): number {
  const lines = planLines(folders);
  if (run === undefined || lines.size === 0) {
    console.error("The plans give no line. Name the run and the folder of each artifact of the parts.");
    return 1;
  }
  const root = process.cwd();
  const maps: Record<string, CostMap> = { ...costMaps(root) };
  for (const [file, plan] of lines) maps[file] = costMapOf(readFileSync(join(root, repoPath(file)), "utf8"), run, plan);
  for (const file of PACKAGES.flatMap((name) => mutateOf(root, name))) maps[file] ??= costMapOf(readFileSync(join(root, repoPath(file)), "utf8"), run, []);
  const sorted = Object.fromEntries(Object.entries(maps).toSorted(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(root, "tools", "mutation", COSTS_FILE), `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`The cost maps from run ${run}: ${String(lines.size)} files with a plan.`);
  const parts = laneParts();
  partMinutes(root, parts, sorted).forEach((m, i) => console.log(`${parts[i] ?? ""}: an estimate of ${m.toFixed(0)} minutes${m > TARGET_MINUTES ? ", OVER THE TARGET" : ""}.`));
  return 0;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv[2], process.argv.slice(3));

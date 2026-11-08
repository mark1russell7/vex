// The cost maps of the lane (LANE.COST). The plan of a dry run gives the planned net time of each line of each file of a
// part. This script adds the plans of the parts into one map of the segments of each file, and it writes the maps into
// costs.json. A plan names only the files with a mutant, so a file of the lane that no plan and no old map names gets a map
// with no cost. Each other file that the plans do not name keeps its old map. The parts of each group then cut by cost,
// not by lines. Start it from the root of the repository with the run of the dry run and the folder of the artifact
// `mutation-report-<part>` of each part of that run. The plan is at the top of the folder of an artifact.
//
// Each part runs on its own runner, and the speed of the runners differs by a factor of up to 1.8. So the script divides
// the net time of each part by the speed of its runner (`speedFactors`) before it adds the plans (LANE.SPEED).
//
//
//   node tools/mutation/cost-map.ts <run> <folder>...
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { median } from "@mark1russell7/rigor-statistics";
import { basename, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { clockMinutes, type FilePlan, type LinePlan, PLAN_FILE, TARGET_MINUTES, type TestPlan } from "./lane-cost.ts";
import { type CostMap, costMapOf, costMaps, COSTS_FILE, laneParts, mutateOf, PACKAGES, plannedMs } from "./layout.ts";

/** The plan of a dry run of one part. */
export interface PartPlan {
  readonly part: string;
  readonly files: Readonly<Record<string, FilePlan>>;
  readonly tests: readonly TestPlan[];
}

/** A test of a plan counts for the speed of a runner only from this time in milliseconds. A short time is mostly noise. */
export const SPEED_MIN_MS = 200;

/** This function gives the group of a part: `core.base.3` is in `core.base`. */
const groupOf = (part: string): string => part.replace(/\.\d+$/u, "");

/**
 * This function gives the speed of the runner of each part, relative to the other parts of its group (LANE.SPEED). The
 * parts of a group run the same tests, so a test of the plans of several parts gives a ratio of its time in a part to the
 * median of its times in the group. The factor of a part is the median of its ratios. A test counts if it takes
 * `SPEED_MIN_MS` or more, and if the plans of at least half of the parts of the group name it, with at least 2 parts. A part
 * with no such test, or the only part of its group, has the factor 1. A factor over 1 is a slow runner.
 */
export function speedFactors(plans: readonly PartPlan[]): Map<string, number> {
  const times = new Map(plans.map((p) => [p.part, new Map(p.tests.filter((t) => t[2] >= SPEED_MIN_MS).map((t) => [`${t[1]}|${t[0]}`, t[2]]))]));
  const out = new Map<string, number>();
  for (const group of new Set(plans.map((p) => groupOf(p.part)))) {
    const parts = plans.filter((p) => groupOf(p.part) === group).map((p) => times.get(p.part) ?? new Map<string, number>());
    const need = Math.max(2, Math.ceil(parts.length / 2));
    const names = [...new Set(parts.flatMap((m) => [...m.keys()]))].filter((name) => parts.filter((m) => m.has(name)).length >= need);
    for (const p of plans.filter((q) => groupOf(q.part) === group)) {
      const own = times.get(p.part) ?? new Map<string, number>();
      const ratios = names.flatMap((name) => {
        const ms = own.get(name);
        return ms === undefined ? [] : [ms / median(parts.flatMap((m) => m.get(name) ?? []))];
      });
      out.set(p.part, ratios.length === 0 ? 1 : median(ratios));
    }
  }
  return out;
}

/** This function reads the plan of each folder of an artifact `mutation-report-<part>`. */
function readPlans(folders: readonly string[]): PartPlan[] {
  return folders.map((folder) => {
    const plan = JSON.parse(readFileSync(join(folder, basename(PLAN_FILE)), "utf8")) as Omit<PartPlan, "part">;
    return { part: basename(folder).replace(/^mutation-report-/u, ""), files: plan.files, tests: plan.tests };
  });
}

/**
 * This function gives the plan of each line of each file from the plans of the parts, by the path of the lane of the file.
 * It divides the net time of each line by the speed factor of the runner of its part.
 */
export function planLines(plans: readonly PartPlan[]): Map<string, LinePlan[]> {
  const factors = speedFactors(plans);
  const out = new Map<string, LinePlan[]>();
  for (const plan of plans) {
    const factor = factors.get(plan.part) ?? 1;
    for (const [file, row] of Object.entries(plan.files)) {
      const scaled = row.lines.map(([line, runs, staticRuns, netMs]): LinePlan => [line, runs, staticRuns, netMs / factor]);
      out.set(file, [...(out.get(file) ?? []), ...scaled]);
    }
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
  const plans = readPlans(folders);
  const lines = planLines(plans);
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
  const factors = [...speedFactors(plans)].map(([part, factor]) => `${part} ${factor.toFixed(2)}`);
  console.log(`The speed factors of the runners: ${factors.join(", ")}.`);
  const parts = laneParts();
  partMinutes(root, parts, sorted).forEach((m, i) => console.log(`${parts[i] ?? ""}: an estimate of ${m.toFixed(0)} minutes${m > TARGET_MINUTES ? ", OVER THE TARGET" : ""}.`));
  return 0;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv[2], process.argv.slice(3));

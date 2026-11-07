// The reporter of the cost of each mutant (LANE.COST). The parts of the lane are cut by the size of their files, and a size
// does not give the time of a part: on 2026-11-06, three parts of the core reached the limit of 150 minutes of a job. This
// reporter writes the plan of a part when Stryker makes it, and one line for each mutant when it ends. So a part that its
// job stops still gives the cost of each mutant that ended.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The file of the plan of a part, as a path of the repository. */
export const PLAN_FILE = "reports/mutation/lane-plan.json";

/** The file of the cost of each mutant that ended, one JSON line for each mutant, as a path of the repository. */
export const COST_FILE = "reports/mutation/lane-costs.jsonl";

/** The fields of a plan of Stryker that this reporter reads. */
export interface PlanOfMutant {
  readonly plan: string;
  readonly mutant: { readonly id: string; readonly fileName: string; readonly static?: boolean; readonly status?: string };
  readonly netTime?: number;
  readonly runOptions?: { readonly timeout?: number };
}

/** The fields of a result of Stryker that this reporter reads. */
export interface ResultOfMutant {
  readonly id: string;
  readonly fileName: string;
  readonly status: string;
  readonly static?: boolean;
}

/** The planned times of one mutant that Stryker runs. */
export interface PlannedRun {
  readonly file: string;
  readonly static: boolean;
  readonly netMs: number;
  readonly limitMs: number;
}

/** The plan of one file of a part. */
export interface FilePlan {
  readonly mutants: number;
  readonly runs: number;
  readonly static: number;
  readonly netMs: number;
  readonly limitMs: number;
}

/** One line of the cost file: one mutant that ended. */
export interface CostLine {
  readonly file: string;
  readonly status: string;
  readonly static: boolean;
  readonly netMs: number | null;
  readonly limitMs: number | null;
  readonly costMs: number | null;
  readonly atMs: number;
}

/** This function gives the path of the lane of a file of Stryker: `work/core/steps.ts`. */
export function laneFile(fileName: string): string {
  const path = fileName.replaceAll("\\", "/");
  const at = path.lastIndexOf("/work/");
  return at === -1 ? path : path.slice(at + 1);
}

/** This function gives the planned times of each mutant that Stryker runs, by the id of the mutant. */
export function plannedRuns(plans: readonly PlanOfMutant[]): Map<string, PlannedRun> {
  const runs = new Map<string, PlannedRun>();
  for (const { plan, mutant, netTime, runOptions } of plans) {
    if (plan !== "Run") continue;
    runs.set(mutant.id, { file: laneFile(mutant.fileName), static: mutant.static === true, netMs: Math.round(netTime ?? 0), limitMs: Math.round(runOptions?.timeout ?? 0) });
  }
  return runs;
}

/** This function gives the plan of each file of a part: its mutants, the mutants that Stryker runs, and their planned times. */
export function filePlans(plans: readonly PlanOfMutant[]): Record<string, FilePlan> {
  const runs = plannedRuns(plans);
  const files: Record<string, { mutants: number; runs: number; static: number; netMs: number; limitMs: number }> = {};
  for (const { mutant } of plans) {
    const file = laneFile(mutant.fileName);
    const row = (files[file] ??= { mutants: 0, runs: 0, static: 0, netMs: 0, limitMs: 0 });
    row.mutants += 1;
    const run = runs.get(mutant.id);
    if (run === undefined) continue;
    row.runs += 1;
    row.static += run.static ? 1 : 0;
    row.netMs += run.netMs;
    row.limitMs += run.limitMs;
  }
  return Object.fromEntries(Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b)));
}

/**
 * This function gives the cost of a mutant that ended. A mutant that the clock stops costs its limit. Another mutant that
 * Stryker runs costs at most its planned net time. A mutant with an early result costs no run, so its cost is null.
 */
export function costOf(run: PlannedRun | undefined, status: string): number | null {
  if (run === undefined) return null;
  return status === "Timeout" ? run.limitMs : run.netMs;
}

/** This function gives the line of the cost file for a mutant that ended `atMs` after the plan. */
export function costLine(run: PlannedRun | undefined, result: ResultOfMutant, atMs: number): CostLine {
  return {
    file: laneFile(result.fileName),
    status: result.status,
    static: result.static === true,
    netMs: run?.netMs ?? null,
    limitMs: run?.limitMs ?? null,
    costMs: costOf(run, result.status),
    atMs: Math.round(atMs),
  };
}

/** This function gives a reporter of Stryker that writes the plan and the costs into the folder `root`. */
export function costReporter(root: string, now: () => number = () => performance.now()) {
  let runs = new Map<string, PlannedRun>();
  let start = now();
  const write = (file: string, text: string, append: boolean): void => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    if (append) appendFileSync(path, text);
    else writeFileSync(path, text);
  };
  return {
    onMutationTestingPlanReady(event: { readonly mutantPlans: readonly PlanOfMutant[] }): void {
      start = now();
      runs = plannedRuns(event.mutantPlans);
      write(PLAN_FILE, `${JSON.stringify({ files: filePlans(event.mutantPlans) }, null, 2)}\n`, false);
      write(COST_FILE, "", false);
    },
    onMutantTested(result: ResultOfMutant): void {
      write(COST_FILE, `${JSON.stringify(costLine(runs.get(result.id), result, now() - start))}\n`, true);
    },
  };
}

/** The plugins of this module for Stryker: the reporter `lane-cost`, which writes into the root of the repository. */
export const strykerPlugins = [{ kind: "Reporter", name: "lane-cost", value: costReporter(fileURLToPath(new URL("../../", import.meta.url))) }];

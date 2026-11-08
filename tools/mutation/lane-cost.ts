// The reporter of the cost of each mutant (LANE.COST). The parts of the lane are cut by the size of their files, and a size
// does not give the time of a part: on 2026-11-06, three parts of the core reached the limit of 150 minutes of a job. This
// reporter writes the plan of a part when Stryker makes it, and one line for each mutant when it ends. So a part that its
// job stops still gives the cost of each mutant that ended. The plan has the planned time of each line, so the cut of a
// part can follow the cost of its lines (LANE.COST). In a dry run, the reporter stops Stryker after the plan, and the plan of
// the part is the output of the dry run.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The file of the plan of a part, as a path of the repository. */
export const PLAN_FILE = "reports/mutation/lane-plan.json";

/** The file of the cost of each mutant that ended, one JSON line for each mutant, as a path of the repository. */
export const COST_FILE = "reports/mutation/lane-costs.jsonl";

/** The minutes after which a part of a full run stops itself, 10 minutes under the limit of its job. */
export const STOP_MINUTES = 140;

/** The minutes that the plan of a part can take at most, so that a slow runner also ends the part before its stop. */
export const TARGET_MINUTES = 100;

/**
 * The planned net time of one minute of the clock of a part. In Nightly 42443362759, the mutants that ended in the two
 * stopped parts of `compiler.module` had 11.7 and 9.8 times the planned time of their clock. The lower value gives the
 * longer estimate. A killed mutant stops at its first failed test, so its run takes less than its plan.
 */
export const PLAN_PER_CLOCK = 9.8;

/** This function gives the estimate of the minutes of the clock of a planned net time. */
export function clockMinutes(netMs: number): number {
  return netMs / PLAN_PER_CLOCK / 60_000;
}

/** The fields of a plan of Stryker that this reporter reads. */
export interface PlanOfMutant {
  readonly plan: string;
  readonly mutant: { readonly id: string; readonly fileName: string; readonly static?: boolean; readonly status?: string; readonly location?: Place };
  readonly netTime?: number;
  /** The tests that Stryker runs for the mutant. With no filter, Stryker runs all tests, as for a static mutant. */
  readonly runOptions?: { readonly timeout?: number; readonly testFilter?: readonly string[] };
}

/** The fields of a test of the dry run of Stryker that this reporter reads. */
export interface TestOfDryRun {
  readonly id: string;
  readonly name: string;
  readonly fileName?: string;
  readonly timeSpentMs: number;
}

/** The plan of one test: its name, its file, its time in the dry run, the runs of mutants that start it, and their product. */
export type TestPlan = readonly [name: string, file: string, ms: number, runs: number, costMs: number];

/** The count of the tests of the largest cost that the plan keeps. */
export const TOP_TESTS = 40;

/** The start of a mutant. In a plan, Stryker counts the lines from 0. In a result, it counts them from 1. */
export interface Place {
  readonly start: { readonly line: number };
}

/** The fields of a result of Stryker that this reporter reads. */
export interface ResultOfMutant {
  readonly id: string;
  readonly fileName: string;
  readonly status: string;
  readonly static?: boolean;
  readonly statusReason?: string;
  readonly location?: Place;
}

/** The planned times of one mutant that Stryker runs. */
export interface PlannedRun {
  readonly file: string;
  /** The line of the start of the mutant, counted from 1. The value 0 is a mutant with no location. */
  readonly line: number;
  readonly static: boolean;
  readonly netMs: number;
  readonly limitMs: number;
}

/** The plan of one line of a file: the line, the runs that start on it, the static runs of them, and their planned net time. */
export type LinePlan = readonly [line: number, runs: number, staticRuns: number, netMs: number];

/** The plan of one file of a part. */
export interface FilePlan {
  readonly mutants: number;
  readonly runs: number;
  readonly static: number;
  readonly netMs: number;
  readonly limitMs: number;
  /** The plan of each line with a run, in the order of the lines. */
  readonly lines: readonly LinePlan[];
}

/** One line of the cost file: one mutant that ended. */
export interface CostLine {
  readonly file: string;
  /** The line of the start of the mutant, counted from 1, or null for a mutant with no location. */
  readonly line: number | null;
  readonly status: string;
  /** The reason of a time-out. It tells a hit limit from the clock. Other statuses have null. */
  readonly reason: string | null;
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
    const line = mutant.location === undefined ? 0 : mutant.location.start.line + 1;
    runs.set(mutant.id, { file: laneFile(mutant.fileName), line, static: mutant.static === true, netMs: Math.round(netTime ?? 0), limitMs: Math.round(runOptions?.timeout ?? 0) });
  }
  return runs;
}

/** This function gives the plan of each file of a part: its mutants, the mutants that Stryker runs, and their planned times. */
export function filePlans(plans: readonly PlanOfMutant[]): Record<string, FilePlan> {
  const runs = plannedRuns(plans);
  const files: Record<string, { mutants: number; runs: number; static: number; netMs: number; limitMs: number; byLine: Map<number, [number, number, number, number]> }> = {};
  for (const { mutant } of plans) {
    const file = laneFile(mutant.fileName);
    const row = (files[file] ??= { mutants: 0, runs: 0, static: 0, netMs: 0, limitMs: 0, byLine: new Map() });
    row.mutants += 1;
    const run = runs.get(mutant.id);
    if (run === undefined) continue;
    row.runs += 1;
    row.static += run.static ? 1 : 0;
    row.netMs += run.netMs;
    row.limitMs += run.limitMs;
    const line = row.byLine.get(run.line) ?? [run.line, 0, 0, 0];
    line[1] += 1;
    line[2] += run.static ? 1 : 0;
    line[3] += run.netMs;
    row.byLine.set(run.line, line);
  }
  const plan = ({ byLine, ...row }: (typeof files)[string]): FilePlan => ({ ...row, lines: [...byLine.values()].toSorted((a, b) => a[0] - b[0]) });
  return Object.fromEntries(Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b)).map(([file, row]) => [file, plan(row)]));
}

/**
 * This function gives the tests of the largest planned cost, the largest first. The cost of a test is its time in the dry
 * run, times the runs of the mutants that start it. A test with a large cost is the first place to make the lane faster.
 */
export function testPlans(plans: readonly PlanOfMutant[], tests: readonly TestOfDryRun[], top: number = TOP_TESTS): TestPlan[] {
  const runs = new Map<string, number>(tests.map((test) => [test.id, 0]));
  let all = 0;
  for (const { plan, runOptions } of plans) {
    if (plan !== "Run") continue;
    if (runOptions?.testFilter === undefined) all += 1;
    else for (const id of runOptions.testFilter) runs.set(id, (runs.get(id) ?? 0) + 1);
  }
  const rows = tests.map((test): TestPlan => {
    const count = (runs.get(test.id) ?? 0) + all;
    return [test.name, laneFile(test.fileName ?? ""), Math.round(test.timeSpentMs), count, Math.round(count * test.timeSpentMs)];
  });
  return rows.toSorted((a, b) => b[4] - a[4] || a[0].localeCompare(b[0])).slice(0, top);
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
    line: result.location?.start.line ?? null,
    status: result.status,
    reason: result.status === "Timeout" ? (result.statusReason ?? null) : null,
    static: result.static === true,
    netMs: run?.netMs ?? null,
    limitMs: run?.limitMs ?? null,
    costMs: costOf(run, result.status),
    atMs: Math.round(atMs),
  };
}

/**
 * This function gives a reporter of Stryker that writes the plan and the costs into the folder `root`. The function
 * `afterPlan` starts after the plan is on the disk. A dry run gives a function that stops Stryker there.
 */
export function costReporter(root: string, now: () => number = () => performance.now(), afterPlan?: () => void) {
  let runs = new Map<string, PlannedRun>();
  let tests: readonly TestOfDryRun[] = [];
  let start = now();
  const write = (file: string, text: string, append: boolean): void => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    if (append) appendFileSync(path, text);
    else writeFileSync(path, text);
  };
  return {
    onDryRunCompleted(event: { readonly result: { readonly tests: readonly TestOfDryRun[] } }): void {
      tests = event.result.tests;
    },
    onMutationTestingPlanReady(event: { readonly mutantPlans: readonly PlanOfMutant[] }): void {
      start = now();
      runs = plannedRuns(event.mutantPlans);
      write(PLAN_FILE, `${JSON.stringify({ files: filePlans(event.mutantPlans), tests: testPlans(event.mutantPlans, tests) }, null, 2)}\n`, false);
      write(COST_FILE, "", false);
      afterPlan?.();
    },
    onMutantTested(result: ResultOfMutant): void {
      write(COST_FILE, `${JSON.stringify(costLine(runs.get(result.id), result, now() - start))}\n`, true);
    },
  };
}

/**
 * The most static runs of a file in the plan of one part. A static run starts each test of the lane, so it costs the time of
 * all tests (LANE.STATIC). The dry run 42474174486 read 471 static runs in `module.ts`, 465 of them in one part.
 */
export const STATIC_LIMITS: Readonly<Record<string, number>> = { "work/compiler/module.ts": 600 };

/** This function gives one line for each file of a plan with more static runs than its limit (LANE.STATIC). */
export function staticFaults(files: Readonly<Record<string, FilePlan>>): string[] {
  return Object.entries(STATIC_LIMITS).flatMap(([file, limit]) => {
    const count = files[file]?.static ?? 0;
    if (count <= limit) return [];
    return [`The plan has ${String(count)} static runs in ${file}, and the limit is ${String(limit)}. Code outside a test gives a static mutant, which starts each test. Move that code into a test, a beforeEach or a function (LANE.STATIC).`];
  });
}

/**
 * This function gives the line of the plan of a part, with the estimate of its clock. The line has a mark when the
 * estimate is over the target.
 */
export function planLine(part: string, files: Readonly<Record<string, FilePlan>>): string {
  const rows = Object.values(files);
  const sum = (key: "runs" | "static" | "netMs"): number => rows.reduce((n, row) => n + row[key], 0);
  const minutes = clockMinutes(sum("netMs"));
  const head = `The plan of ${part}: ${String(sum("runs"))} runs, ${String(sum("static"))} of them static, with a planned net time of ${(sum("netMs") / 3_600_000).toFixed(1)} h.`;
  const estimate = ` Its estimate is ${minutes.toFixed(0)} minutes of the clock, against the target of ${String(TARGET_MINUTES)} and the stop of ${String(STOP_MINUTES)}.`;
  return `${head}${estimate}${minutes > TARGET_MINUTES ? " OVER THE TARGET: cut this part (LANE.COST)." : ""}`;
}

/** This function stops a dry run after its plan. The test runners of Stryker stop with the job. */
const stopAfterPlan = (): never => process.exit(0);

/**
 * The plugins of this module for Stryker: the reporter `lane-cost`, which writes into the root of the repository. With
 * the variable `VEX_DRY_RUN` at 1, the reporter stops Stryker after the plan (LANE.DRYRUN).
 */
export const strykerPlugins = [
  { kind: "Reporter", name: "lane-cost", value: costReporter(fileURLToPath(new URL("../../", import.meta.url)), undefined, process.env["VEX_DRY_RUN"] === "1" ? stopAfterPlan : undefined) },
];

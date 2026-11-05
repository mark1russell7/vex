/**
 * The limits of the time of a print of each module of ireko (COMPILE.MODULE.COST), and the rule of the gate.
 *
 * The limits are a decision on the cost that the project accepts. The rows of the branch came first, so the limits are
 * not a test that the branch passed. They do not prove that a module costs 1.10 or less. A limit from the cost of
 * today holds the cost of today. The gate reads each module alone, with no average over the modules, because one fast
 * module can hide a slow module.
 *
 * A fresh process charges the first run of new code to each module, and that charge is largest on a small module. The
 * row `build` prints all the modules with a shared object in one process, as a real build does.
 */
import { median } from "../../core/bench/measure.ts";

/** The limits of one module against the base commit, as ratios of times in one run. Lower is faster. */
export interface ModuleLimit {
  /** The most that the median time of the branch can be, as a share of the median time of the base. */
  readonly median: number;
  /** The most that the time of the branch can be, as a share of the time of the base in one round. */
  readonly worst: number;
  /** The reason of the limit. */
  readonly why: string;
}

/** The limit of a new module with an object at more than one place. The value 1.10 is the target of each module. */
export const SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  worst: 1.2,
  why: "A module with a shared object pays for the walk of its places and for the new key. The cost is 2 to 8 ms for each module, a build pays it, and it makes the results correct.",
};

/** The limit of a new module with no shared object. */
export const NOT_SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  worst: 1.2,
  why: "A module with no shared object pays for the walk of its places, the new key and the checks of the tidy step. The frames of direction and label show no time in the copy of shared objects.",
};

/** The name of the row that prints all the modules with a shared object in one process. */
export const BUILD_ROW = "build";

/** The source of each median limit: the standing rule of a limit. The item BOUNDSCOST brings a module with a median over 1.10 under that target. */
const FROM_READS = "The worst median of 6 reads of tree 03d5a25 against 8ae233b, plus the spread of those reads, rounded up. The gate holds the cost of today.";

/** This function gives the line of a module from its limit of the median. */
function lineOf(limit: number): ModuleLimit {
  return { median: limit, worst: 1.2, why: FROM_READS };
}

/** The limit of each row. Each line states its reason. A limit over 1.25 needs a ruling, and a test holds this cap. */
export const MODULE_LINES: Readonly<Record<string, ModuleLimit>> = {
  grid: lineOf(1.12),
  radial: lineOf(1.12),
  layers: lineOf(1.08),
  tree: lineOf(1.13),
  shape: lineOf(1.11),
  place: lineOf(1.12),
  measure: lineOf(1.16),
  straight: lineOf(1.11),
  orthogonal: lineOf(1.16),
  avoid: lineOf(0.91),
  direction: lineOf(1.07),
  label: lineOf(1.11),
  obstacles: lineOf(1.14),
  overlap: lineOf(1.14),
  between: lineOf(1.13),
  bounds: {
    median: 1.2,
    worst: 1.25,
    why: "bounds has a median of 1.148 and a worst pair of 1.247 in 6 reads of tree 03d5a25. The worst pair limit is the cap of 1.25. The item BOUNDSCOST brings it under 1.10 by 2026-11-12 and removes this line.",
  },
  [BUILD_ROW]: {
    median: 0.98,
    worst: 1.2,
    why: "This row is the cost that a build pays: one process, with the first run of new code once. Its pass line is 1.10. The 6 reads give 0.899 to 0.936, so the gate holds that gain.",
  },
};

/** The raw times of one module in one run, in ms, with one time for each round. */
export interface ModuleTimes {
  readonly module: string;
  /** The result of `placesRead` on the expressions of the module. */
  readonly shares: boolean;
  readonly base: readonly number[];
  readonly branch: readonly number[];
  /** The times of the second copy of the base. */
  readonly aa: readonly number[];
}

/** The values of one row of the gate. */
export interface ModuleReading {
  readonly baseMs: number;
  readonly branchMs: number;
  /** The median time of the branch over the median time of the base. */
  readonly ratio: number;
  /** The median time of the second copy of the base over the median time of the base. */
  readonly aa: number;
  /** The largest ratio of one round. */
  readonly worstPair: number;
  /** The second largest ratio of one round. One slow process cannot move it. This value is a record, and it does not fail a row. */
  readonly secondPair: number;
  /** The largest ratio of one round of the second copy of the base on this row. */
  readonly aaWorst: number;
}

/** This function gives the limit of a module. A line of the module comes first, and then the class that its program gives. */
export function limitOf(module: string, shares: boolean): ModuleLimit {
  return Object.hasOwn(MODULE_LINES, module) ? (MODULE_LINES[module] ?? SHARED_LIMIT) : shares ? SHARED_LIMIT : NOT_SHARED_LIMIT;
}

/** This function gives the values of one row from the times of its rounds. */
export function readingOf(row: ModuleTimes): ModuleReading {
  const baseMs = median(row.base);
  const branchMs = median(row.branch);
  const pairs = row.branch.map((ms, round) => ms / (row.base[round] ?? Number.NaN)).toSorted((a, b) => b - a);
  return {
    baseMs,
    branchMs,
    ratio: branchMs / baseMs,
    aa: median(row.aa) / baseMs,
    worstPair: pairs[0] ?? Number.NaN,
    secondPair: pairs[1] ?? pairs[0] ?? Number.NaN,
    aaWorst: Math.max(...row.aa.map((ms, round) => ms / (row.base[round] ?? Number.NaN))),
  };
}

/** This function gives the worst pair of the A/A arm over all the rows of one run. That value is the noise of a worst pair. */
export function runAaWorst(rows: readonly ModuleTimes[]): number {
  return Math.max(...rows.map((row) => readingOf(row).aaWorst));
}

/** This function tells if a worst pair over its limit is inside the worst pair of the A/A arm of the run. */
export function worstIsNoise(reading: ModuleReading, limit: ModuleLimit, runWorst: number): boolean {
  return reading.worstPair > limit.worst && reading.worstPair <= runWorst;
}

/**
 * This function gives the faults of one row. A module with no times, or with arms of different rounds, is a fault. A
 * worst pair is a fault only over its limit and over the worst pair of the A/A arm.
 */
export function moduleCostFaults(row: ModuleTimes, runWorst: number): readonly string[] {
  if (row.base.length === 0 || row.branch.length !== row.base.length) return [`${row.module}: the arms have ${String(row.base.length)} and ${String(row.branch.length)} rounds`];
  const limit = limitOf(row.module, row.shares);
  const reading = readingOf(row);
  return [
    ...(reading.ratio > limit.median ? [`${row.module}: the median ratio ${reading.ratio.toFixed(3)} is over the limit ${limit.median.toFixed(3)}`] : []),
    ...(reading.worstPair > limit.worst && !worstIsNoise(reading, limit, runWorst) ? [`${row.module}: the worst pair ${reading.worstPair.toFixed(3)} is over the limit ${limit.worst.toFixed(3)} and over the worst pair ${runWorst.toFixed(3)} of the A/A arm of the run`] : []),
  ];
}

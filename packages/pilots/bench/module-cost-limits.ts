/**
 * The limits of the time of a print of each module of ireko (COMPILE.MODULE.COST), and the rule of the gate.
 *
 * The limits are a decision on the cost that the project accepts. The rows of the branch came first, so the limits are
 * not a test that the branch passed. The gate holds them after the merge. It reads each module alone, with no average
 * over the modules, because one fast module can hide a slow module.
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

/** The limit of a module with an object at more than one place. */
export const SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  worst: 1.2,
  why: "A module with a shared object pays for the walk of its places and for the new key. The cost is 2 to 8 ms for each module, a build pays it, and it makes the results correct.",
};

/** The limit of a module with no shared object. */
export const NOT_SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  worst: 1.2,
  why: "A module with no shared object pays for the walk of its places, the new key and the checks of the tidy step. The frames of direction and label show no time in the copy of shared objects.",
};

/** The name of the row that prints all the modules with a shared object in one process. */
export const BUILD_ROW = "build";

/** The limits of one row that replace the limit of its class. Each line states its reason, and the line of a module states the item that removes it. */
export const MODULE_LINES: Readonly<Record<string, ModuleLimit>> = {
  [BUILD_ROW]: {
    median: 1.1,
    worst: 1.2,
    why: "This row is the cost that a build pays: one process, with the first run of new code once. The value 1.10 is the pass line of this total.",
  },
  bounds: {
    median: 1.2,
    worst: 1.2,
    why: "bounds read 1.16 on tree 03d5a25, over the limit of 1.10. The item BOUNDSCOST brings it under 1.10 by 2026-11-12 and removes this line. Its first reads are #constKey and formOf.",
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
  /** The largest ratio of one round of the second copy of the base: the noise of the worst pair. */
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
  return {
    baseMs,
    branchMs,
    ratio: branchMs / baseMs,
    aa: median(row.aa) / baseMs,
    worstPair: Math.max(...row.branch.map((ms, round) => ms / (row.base[round] ?? Number.NaN))),
    aaWorst: Math.max(...row.aa.map((ms, round) => ms / (row.base[round] ?? Number.NaN))),
  };
}

/** This function tells if a worst pair over its limit is inside the worst pair of the A/A arm. */
export function worstIsNoise(reading: ModuleReading, limit: ModuleLimit): boolean {
  return reading.worstPair > limit.worst && reading.worstPair <= reading.aaWorst;
}

/**
 * This function gives the faults of one row. A module with no times, or with arms of different rounds, is a fault. A
 * worst pair is a fault only if it is over its limit and over the worst pair of the A/A arm.
 */
export function moduleCostFaults(row: ModuleTimes): readonly string[] {
  if (row.base.length === 0 || row.branch.length !== row.base.length) return [`${row.module}: the arms have ${String(row.base.length)} and ${String(row.branch.length)} rounds`];
  const limit = limitOf(row.module, row.shares);
  const reading = readingOf(row);
  return [
    ...(reading.ratio > limit.median ? [`${row.module}: the median ratio ${reading.ratio.toFixed(3)} is over the limit ${limit.median.toFixed(3)}`] : []),
    ...(reading.worstPair > limit.worst && !worstIsNoise(reading, limit) ? [`${row.module}: the worst pair ${reading.worstPair.toFixed(3)} is over the limit ${limit.worst.toFixed(3)} and over the worst pair ${reading.aaWorst.toFixed(3)} of the A/A arm`] : []),
  ];
}

/**
 * The limits of the time of a print of each module of ireko (COMPILE.MODULE.COST), and the rule of the gate.
 *
 * The limits are a decision on the cost that the project accepts. The rows of the branch came first, so the limits are
 * not a test that the branch passed. They do not prove that a module costs 1.10 or less. A limit from the cost of
 * today holds the cost of today. The gate reads each module alone, with no average over the modules, because one fast
 * module can hide a slow module.
 *
 * A fresh process charges the first run of new code to each module, and that charge is largest on a small module. The
 * row `build` prints all the modules with a shared object in one process, as a real build does. The row
 * `build-no-avoid` leaves out the module `avoid`, because the total of `build` does not show that each module is cheap.
 *
 * A second pair is the second largest ratio of one round of a row. One slow process cannot move it. The rule reads it on
 * both sides: the second pair of a row, against the worst second pair of the A/A arm of the run. A real cost in 1 round
 * of 7 cannot be told from noise at 7 rounds. The worst pair is a record, and it does not fail a row.
 *
 * A gain limit reads against the fixed commit `GAIN_BASE`, so a merge does not move it. Only a pull request moves that
 * commit. That pull request has a ruling, new limits and the ratio of the new base to the old base on the row `build`.
 *
 * A limit under 1 holds a gain. It holds that gain only on a model of `GAIN_MODELS`. On each other model the row reads its
 * ceiling, and it prints that it does not read the gain. A pass on such a model does not show that the gain holds.
 */
import { median } from "../../core/bench/measure.ts";

/** The limits of one module against the base commit, as ratios of times in one run. Lower is faster. */
export interface ModuleLimit {
  /** The most that the median time of the branch can be, as a share of the median time of the base. */
  readonly median: number;
  /** The most that the second pair of the row can be. With no value, the row prints its second pair and that pair fails nothing. */
  readonly second?: number;
  /** The median limit on a model outside `GAIN_MODELS`. With no value, the row has one median limit on each model. */
  readonly ceiling?: number;
  /** The reason of the limit. */
  readonly why: string;
}

/** The limit of a new module with an object at more than one place. The value 1.10 is the target of each module. */
export const SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  second: 1.2,
  why: "A module with a shared object pays for the walk of its places and for the new key. The cost is 2 to 8 ms for each module, a build pays it, and it makes the results correct.",
};

/** The limit of a new module with no shared object. */
export const NOT_SHARED_LIMIT: ModuleLimit = {
  median: 1.1,
  second: 1.2,
  why: "A module with no shared object pays for the walk of its places, the new key and the checks of the tidy step. The frames of direction and label show no time in the copy of shared objects.",
};

/** The name of the row that prints all the modules with a shared object in one process. */
export const BUILD_ROW = "build";

/** The name of the row `build` with the module `avoid` left out. */
export const BUILD_NO_AVOID_ROW = "build-no-avoid";

/**
 * The largest second pair of the A/A arm of a run that a read can have. Over this value any row under that pair passes,
 * so the read has no power. That read is undecided, and it does not count. The value is the third quartile plus 3 times
 * the interquartile range of the 26 reads, 1.175, rounded up. This formula came after those reads: the rule of the worst
 * read plus the spread gave 1.577, and that value took in the loud read. It is a choice from the data, and the reads of the
 * next head test it.
 */
export const AA_CAP = 1.18;

/** The fixed commit of each ratio of this gate. The job `modules` of `speed-gate.yml` checks out this commit, and a test holds the two equal. */
export const GAIN_BASE = "8ae233be3bd54744ae558020e5584975b4dfefee";

/**
 * The models where the reads show the gain of the rows with a limit under 1. The model 9V45 is not here. The median of its
 * 5 reads is 0.946 on `build` and 0.916 on `avoid`. The median of each other model is at most 0.928 on `build` and 0.840 on
 * `avoid`. Those reads do not give a cause.
 */
export const GAIN_MODELS: ReadonlySet<string> = new Set([
  "AMD EPYC 7763 64-Core Processor",
  "AMD EPYC 9V74 80-Core Processor",
  "Intel(R) Xeon(R) 6973P-C",
  "Intel(R) Xeon(R) 6975P-C",
  "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz",
  "INTEL(R) XEON(R) PLATINUM 8573C",
]);

/** The words of a row that reads its ceiling. */
export const CEILING_ONLY = "gain not read on this model, ceiling only";

/** The source of each limit: the standing rule of a limit. The item BOUNDSCOST brings a module with a median over 1.10 under that target. */
const FROM_READS = "The worst value of 26 reads of tree 03d5a25 against 8ae233b, plus the spread of those reads, rounded up. The gate holds the cost of today.";

/** This function gives the line of a module from its limits. The third value is the median limit of the 6 reads alone: the 26 reads decide, and each figure stays in the record. */
function lineOf(limit: number, second: number, fromSix: number): ModuleLimit {
  return { median: limit, second, why: `${FROM_READS} The 6 reads alone give a median limit of ${fromSix.toFixed(2)}.` };
}

/** The limit of each row. Each line states its reason. A limit over 1.25 needs a ruling, and a test holds this cap. */
export const MODULE_LINES: Readonly<Record<string, ModuleLimit>> = {
  grid: lineOf(1.18, 1.22, 1.12),
  radial: lineOf(1.18, 1.21, 1.16),
  layers: lineOf(1.1, 1.15, 1.09),
  tree: lineOf(1.15, 1.2, 1.11),
  shape: lineOf(1.19, 1.24, 1.15),
  place: lineOf(1.23, 1.22, 1.14),
  measure: lineOf(1.22, 1.22, 1.19),
  straight: lineOf(1.16, 1.21, 1.13),
  orthogonal: lineOf(1.22, 1.23, 1.14),
  avoid: {
    median: 0.89,
    ceiling: 1.03,
    second: 1.09,
    why: "The limit 0.89 holds the gain against 8ae233b on the models of GAIN_MODELS. The ceiling 1.03 comes from 5 reads and no cause, so it holds no gain.",
  },
  direction: lineOf(1.14, 1.16, 1.08),
  label: { median: 1.13, second: 1.25, why: "The second pair sits on the cap of 1.25. The rule gives 1.376 with the loud read of 26 reads and 1.211 without it. The 6 reads alone give a median limit of 1.12." },
  obstacles: { median: 1.18, second: 1.25, why: "The second pair sits on the cap of 1.25, and the rule gives 1.247. The 6 reads alone give a median limit of 1.11." },
  overlap: lineOf(1.19, 1.24, 1.18),
  between: lineOf(1.19, 1.22, 1.13),
  bounds: {
    median: 1.25,
    why: "The median limit is the cap of 1.25, and it ends under the item BOUNDSCOST, due 2026-11-12. The second pair of this row only prints, because a margin of 0.001 under the cap fails by chance. BOUNDSCOST ends that too.",
  },
  [BUILD_ROW]: {
    median: 0.98,
    ceiling: 1.04,
    second: 1.19,
    why: "This row is the cost that a build pays: one process, with the first run of new code once. The limit 0.98 holds the gain against 8ae233b on the models of GAIN_MODELS. The ceiling 1.04 comes from 5 reads and no cause, so it holds no gain.",
  },
  [BUILD_NO_AVOID_ROW]: {
    median: 1.16,
    second: 1.25,
    why: "This row is the row build with the module avoid left out. Its second pair sits on the cap of 1.25, and the rule gives 1.356. The 6 reads alone give a median limit of 1.13.",
  },
};

/** The share of added work of each module in the read that tests the gate. With this share `radial` reads under its limit, and that states what a limit lets through. */
export const CATCH_ADD: Readonly<Record<string, number>> = { grid: 0.2, radial: 0.11, shape: 0.2 };

/** The modules that the gate must fail in the read that tests it. */
export const CATCH_MUST_FAIL: readonly string[] = ["grid", "shape"];

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
  /** The second largest ratio of one round. */
  readonly secondPair: number;
  /** The largest ratio of one round of the second copy of the base on this row. */
  readonly aaWorst: number;
  /** The second largest ratio of one round of the second copy of the base on this row. */
  readonly aaSecond: number;
}

/** This function gives the limit of a module. A line of the module comes first, and then the class that its program gives. */
export function limitOf(module: string, shares: boolean): ModuleLimit {
  return Object.hasOwn(MODULE_LINES, module) ? (MODULE_LINES[module] ?? SHARED_LIMIT) : shares ? SHARED_LIMIT : NOT_SHARED_LIMIT;
}

/** This function tells if a row reads its ceiling on this model, and so does not read the gain. */
export function ceilingOnly(limit: ModuleLimit, model: string): boolean {
  return limit.ceiling !== undefined && !GAIN_MODELS.has(model);
}

/** This function gives the median limit of a row on this model. */
export function medianLimit(limit: ModuleLimit, model: string): number {
  return ceilingOnly(limit, model) ? (limit.ceiling ?? limit.median) : limit.median;
}

/** This function gives the ratios of one arm to the base, one for each round, with the largest first. */
function pairsOf(arm: readonly number[], base: readonly number[]): readonly number[] {
  const pairs = arm.map((ms, round) => ms / (base[round] ?? Number.NaN));
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  // oxlint-disable-next-line unicorn/no-array-sort
  pairs.sort((x, y) => y - x);
  return pairs;
}

/** This function gives the values of one row from the times of its rounds. A row of one round has its one pair as its second pair. */
export function readingOf(row: ModuleTimes): ModuleReading {
  const baseMs = median(row.base);
  const branchMs = median(row.branch);
  const pairs = pairsOf(row.branch, row.base);
  const aaPairs = pairsOf(row.aa, row.base);
  return {
    baseMs,
    branchMs,
    ratio: branchMs / baseMs,
    aa: median(row.aa) / baseMs,
    worstPair: pairs[0] ?? Number.NaN,
    secondPair: pairs[1] ?? pairs[0] ?? Number.NaN,
    aaWorst: aaPairs[0] ?? Number.NaN,
    aaSecond: aaPairs[1] ?? aaPairs[0] ?? Number.NaN,
  };
}

/** This function gives the worst second pair of the A/A arm over all the rows of one run. That value is the noise of a second pair. */
export function runAaSecond(rows: readonly ModuleTimes[]): number {
  return Math.max(...rows.map((row) => readingOf(row).aaSecond));
}

/** This function tells if the A/A arm of a run is over the cap, so that the read has no power. */
export function isLoud(rows: readonly ModuleTimes[]): boolean {
  return runAaSecond(rows) > AA_CAP;
}

/**
 * This function gives the faults of one row. A module with no times, or with arms of different rounds, is a fault. A
 * second pair is a fault only over its limit and over the worst second pair of the A/A arm of the run.
 */
export function moduleCostFaults(row: ModuleTimes, runSecond: number, model: string): readonly string[] {
  if (row.base.length === 0 || row.branch.length !== row.base.length) return [`${row.module}: the arms have ${String(row.base.length)} and ${String(row.branch.length)} rounds`];
  const limit = limitOf(row.module, row.shares);
  const reading = readingOf(row);
  const line = medianLimit(limit, model);
  const second = limit.second ?? Number.POSITIVE_INFINITY;
  return [
    ...(reading.ratio > line ? [`${row.module}: the median ratio ${reading.ratio.toFixed(3)} is over the limit ${line.toFixed(3)}`] : []),
    ...(reading.secondPair > second && reading.secondPair > runSecond
      ? [`${row.module}: the second pair ${reading.secondPair.toFixed(3)} is over the limit ${second.toFixed(3)} and over the second pair ${runSecond.toFixed(3)} of the A/A arm of the run`]
      : []),
  ];
}

/**
 * This function applies the rule to each A/A arm as if it were a branch, and gives the rows that fail. Each row reads the
 * A/A arms of the other rows, because a row cannot be the noise of itself. A row with a limit under 1 fails here by its limit.
 */
export function falseFails(rows: readonly ModuleTimes[], model: string): readonly string[] {
  return rows
    .filter((row) => moduleCostFaults({ ...row, branch: row.aa }, runAaSecond(rows.filter((other) => other !== row)), model).length > 0)
    .map((row) => row.module);
}

/** This function gives a fault for each module that the gate must fail in the read that tests it, if the gate passes that module. */
export function catchFaults(rows: readonly ModuleTimes[], runSecond: number, model: string): readonly string[] {
  return CATCH_MUST_FAIL.filter((module) => {
    const row = rows.find((r) => r.module === module);
    return row === undefined || moduleCostFaults(row, runSecond, model).length === 0;
  }).map((module) => `${module}: the gate passes a module with an added cost`);
}

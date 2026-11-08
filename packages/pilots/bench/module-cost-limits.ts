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
 * The rule is `tailLimitVerdict` of `@mark1russell7/rigor-bench`, and this file has only the limits and the words of a row.
 * The median of a row is the median of the ratios of its rounds. A second pair is the second largest ratio of one round of
 * a row. One slow process cannot move it. The rule reads it on both sides: the second pair of a row, against the worst
 * second pair of the A/A arm of the run. A real cost in 1 round of 7 cannot be told from noise at 7 rounds. The worst pair
 * is a record, and it does not fail a row.
 *
 * A gain limit reads against the fixed commit `GAIN_BASE`, so a merge does not move it. Only a pull request moves that
 * commit. That pull request has a ruling, new limits and the ratio of the new base to the old base on the row `build`.
 *
 * A limit under 1 holds a gain. It holds that gain only on a model of `GAIN_MODELS`. On each other model the row reads its
 * ceiling, and it prints that it does not read the gain. A pass on such a model does not show that the gain holds.
 */
import { armOrder, type CaseTailLimit, caseRatios, caseTails, type PairedTime, tailFalseFails, type TailFalseFails, type TailLimit, tailLimitVerdict, type TailLimitVerdict } from "@mark1russell7/rigor-bench";
import { median } from "../../core/bench/measure.ts";

/** The limits of one module against the base commit, as ratios of times in one run. Lower is faster. */
export interface ModuleLimit {
  /** The most that the median of the ratios of the rounds of the branch to the base can be. */
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

/**
 * The added work of each module in the read that tests the second pair clause. The cost goes in the first
 * `ROUND_ADD_STARTS` rounds of a read only. So the median stays under its limit, and the clause must fail alone.
 */
export const ROUND_ADD: Readonly<Record<string, number>> = { grid: 0.4, shape: 0.4 };

/** The count of rounds with the added work in the read that tests the second pair clause. */
export const ROUND_ADD_STARTS = 2;

/** The arms of a read, in the order that `measureIsolated` gives them. The order of a round comes from `armOrder`, and a test holds the two equal. */
export const ARMS: readonly string[] = ["base", "branch", "base~aa"];

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

/** The version of the form of a line of the record. A read refuses a line with another version. */
export const RECORD_FORMAT = 1;

/**
 * The kinds of a row. A row of the kind `fault` comes from a step that tests the gate. Its branch arm does added work, so
 * it states no cost of the code. The log of a job shows all rows, so a read of a cost uses the record and not the log.
 */
export const ROW_KINDS = ["gate", "fault"] as const;

/** The kind of one row. */
export type RowKind = (typeof ROW_KINDS)[number];

/** The step of the gate that gives a read. */
export type ReadStep = "gate" | "catch" | "rounds";

/** One line of the record of the gate: the times of one module in one read. */
export interface ModuleRecord extends ModuleTimes {
  readonly format: typeof RECORD_FORMAT;
  readonly kind: RowKind;
  readonly step: ReadStep;
  /** The number of the read in its step, from 0. */
  readonly read: number;
  /** This value is true when the home rule decided this read. A read that did not decide does not count. */
  readonly decided: boolean;
  readonly cpu: string;
  /** The facts of the processor that its model name does not state. Two jobs on one model can have different speeds. */
  readonly cpuFacts: Readonly<Record<string, string>>;
  readonly node: string;
  /** The commit that the job checked out. */
  readonly commit: string;
  /** The commit of the base arm. */
  readonly baseCommit: string;
}

/** The values of one row of the gate. */
export interface ModuleReading {
  readonly baseMs: number;
  readonly branchMs: number;
  /** The median of the ratios of the rounds of the branch to the base. */
  readonly ratio: number;
  /** The median of the ratios of the rounds of the second copy of the base to the base. */
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

/** The fields of `/proc/cpuinfo` that a record keeps. */
const CPU_FACTS = ["cpu family", "model", "stepping", "microcode", "cpu MHz", "cache size", "bogomips"] as const;

/** This function gives the facts of the first processor from the text of `/proc/cpuinfo`, and if its flags name a hypervisor. An empty text gives no facts. */
export function cpuFacts(text: string): Readonly<Record<string, string>> {
  const first = text.split(/\r?\n\r?\n/u)[0] ?? "";
  const fields = new Map(first.split(/\r?\n/u).map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()] as const));
  const flags = fields.get("flags");
  const facts = CPU_FACTS.flatMap((name) => {
    const value = fields.get(name);
    return value === undefined ? [] : [[name, value] as const];
  });
  return Object.fromEntries(flags === undefined ? facts : [...facts, ["hypervisor", String(flags.split(" ").includes("hypervisor"))] as const]);
}

/** This function gives the step of a read from the flags of the gate. */
export function readStep(flags: { readonly catch: boolean; readonly rounds: boolean }): ReadStep {
  if (flags.rounds) return "rounds";
  return flags.catch ? "catch" : "gate";
}

/** This function gives the lines of the record for one read, with one line for each row and a new line after each. The step gives the kind of each row. */
export function recordLines(read: Omit<ModuleRecord, keyof ModuleTimes | "format" | "kind">, rows: readonly ModuleTimes[]): string {
  const kind: RowKind = read.step === "gate" ? "gate" : "fault";
  return rows.map((row) => `${JSON.stringify({ format: RECORD_FORMAT, kind, ...read, ...row })}\n`).join("");
}

/** This function gives one line of a record. A line with another version or no known kind is a fault, so a change of the form cannot pass as a read. */
function parseRecord(line: string): ModuleRecord {
  const record = JSON.parse(line) as ModuleRecord;
  if (record.format !== RECORD_FORMAT) throw new Error(`module-cost: a record has another format: ${line}`);
  if (!ROW_KINDS.includes(record.kind)) throw new Error(`module-cost: a record has no known kind: ${line}`);
  return record;
}

/** This function gives the rows of the gate in the text of a record: only the kind `gate`, and only a read that decided. */
export function gateRecords(text: string): readonly ModuleRecord[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => parseRecord(line))
    .filter((record) => record.kind === "gate" && record.decided);
}

/** This function gives the limit of a module. A line of the module comes first, and then the class that its program gives. */
export function limitOf(module: string, shares: boolean): ModuleLimit {
  return Object.hasOwn(MODULE_LINES, module) ? (MODULE_LINES[module] ?? SHARED_LIMIT) : shares ? SHARED_LIMIT : NOT_SHARED_LIMIT;
}

/** This function tells if a row reads its ceiling on this model, and so does not read the gain. */
export function ceilingOnly(limit: ModuleLimit, model: string): boolean {
  return limit.ceiling !== undefined && !GAIN_MODELS.has(model);
}

/**
 * This function gives the line of the rows that do not read their gain on this model, or `undefined` when each row reads it.
 * The gate holds only the ceiling of such a row. Thus the check shows this line as a warning, because a no read is not a pass.
 */
export function unreadGains(rows: readonly { readonly module: string; readonly shares: boolean }[], model: string): string | undefined {
  const unread = rows.filter((row) => ceilingOnly(limitOf(row.module, row.shares), model)).map((row) => row.module);
  if (unread.length === 0) return undefined;
  return `no read of the gain of ${String(unread.length)} of ${String(rows.length)} rows on ${model}: ${unread.join(", ")}. The gate holds only their ceiling.`;
}

/** This function gives the median limit of a row on this model. */
export function medianLimit(limit: ModuleLimit, model: string): number {
  return ceilingOnly(limit, model) ? (limit.ceiling ?? limit.median) : limit.median;
}

/** This function gives the limits of a row for the home rule. A row with no second limit only prints its second pair, so its limit is the largest number. */
export function tailLimitOf(module: string, shares: boolean, model: string): TailLimit {
  const limit = limitOf(module, shares);
  return { median: medianLimit(limit, model), tail: limit.second ?? Number.MAX_VALUE };
}

/**
 * This function gives the paired records of one side of a read, with the order that the arms started in. A module with no
 * times, or with arms of different rounds, has no read, so the function throws and the gate fails.
 */
export function recordsOf(rows: readonly ModuleTimes[], side: "branch" | "aa"): readonly PairedTime[] {
  const arm = side === "branch" ? "branch" : "base~aa";
  return rows.flatMap((row) => {
    const times = row[side];
    if (row.base.length === 0 || times.length !== row.base.length) throw new RangeError(`${row.module}: the arms have ${String(row.base.length)} and ${String(times.length)} rounds`);
    return row.base.map((a, round): PairedTime => {
      const order = armOrder(ARMS, round);
      return { case: row.module, round, first: order.indexOf("base") < order.indexOf(arm) ? "a" : "b", a, b: times[round] ?? Number.NaN };
    });
  });
}

/**
 * This function gives the count of the rounds of one side of a row for each order, as base first and then arm first. An odd
 * count of rounds cannot give equal counts, so the gate prints them beside each verdict.
 */
export function orderCount(row: ModuleTimes, side: "branch" | "aa"): string {
  const records = recordsOf([row], side);
  const baseFirst = records.filter((r) => r.first === "a").length;
  return `${String(baseFirst)}:${String(records.length - baseFirst)}`;
}

/** This function gives the value at one rank of the ratios of the only case of the records. */
function tailOf(records: readonly PairedTime[], rank: number): number {
  return caseTails(records, rank)[0]?.tail ?? Number.NaN;
}

/** This function gives the values of one row from the times of its rounds. The rule of the second pair needs 5 rounds or more. */
export function readingOf(row: ModuleTimes): ModuleReading {
  const pairs = recordsOf([row], "branch");
  const aaPairs = recordsOf([row], "aa");
  return {
    baseMs: median(row.base),
    branchMs: median(row.branch),
    ratio: caseRatios(pairs)[0]?.ratio ?? Number.NaN,
    aa: caseRatios(aaPairs)[0]?.ratio ?? Number.NaN,
    worstPair: tailOf(pairs, 1),
    secondPair: tailOf(pairs, 2),
    aaWorst: tailOf(aaPairs, 1),
    aaSecond: tailOf(aaPairs, 2),
  };
}

/**
 * This function gives the verdict of the home rule on one read. A row is `beyond` if its median is over its limit. A row is
 * also `beyond` if its second pair is over its limit and over the worst A/A second pair of the run. A read with
 * the A/A pair over `AA_CAP` does not decide. The read that tests the gate has 3 rows, so the smallest count of A/A rows comes from the read.
 */
export function moduleVerdict(rows: readonly ModuleTimes[], model: string): TailLimitVerdict {
  return tailLimitVerdict(recordsOf(rows, "branch"), recordsOf(rows, "aa"), {
    limit: (module) => tailLimitOf(module, rows.find((row) => row.module === module)?.shares ?? true, model),
    aaCap: AA_CAP,
    minimum: Math.min(5, rows.length),
    expected: rows.map((row) => row.module),
  });
}

/** This function gives the words of each fault of one row of a verdict. Each ratio has three decimals, so that no row rounds on to its line. */
export function moduleCostFaults(row: CaseTailLimit, aaTail: number | undefined): readonly string[] {
  return [
    ...(row.overMedian ? [`${row.case}: the median ratio ${(row.ratio ?? Number.NaN).toFixed(3)} is over the limit ${row.limit.median.toFixed(3)}`] : []),
    ...(row.overTail ? [`${row.case}: the second pair ${(row.tail ?? Number.NaN).toFixed(3)} is over the limit ${row.limit.tail.toFixed(3)} and over the second pair ${(aaTail ?? Number.NaN).toFixed(3)} of the A/A arm of the run`] : []),
  ];
}

/** This function applies the home rule to each A/A arm as if it were a branch. A row with a limit under 1 has no read there, and it goes in `gains`. */
export function falseFails(rows: readonly ModuleTimes[], model: string): TailFalseFails {
  return tailFalseFails(recordsOf(rows, "aa"), { limit: (module) => tailLimitOf(module, rows.find((row) => row.module === module)?.shares ?? true, model) });
}

/** This function gives a line for each module where the second pair clause did not fail alone in the read that tests that clause. */
export function roundFaults(verdict: TailLimitVerdict): readonly string[] {
  return Object.keys(ROUND_ADD).flatMap((module) => {
    const row = verdict.cases.find((read) => read.case === module);
    return row?.outcome === "beyond" && row.overTail && !row.overMedian ? [] : [`${module}: the second pair clause did not fail alone with a cost in ${String(ROUND_ADD_STARTS)} rounds: ${row?.outcome ?? "no row"}, median ${(row?.ratio ?? Number.NaN).toFixed(3)}, second pair ${(row?.tail ?? Number.NaN).toFixed(3)}`];
  });
}

/** This function gives a line for each module that the gate must fail and passes in the read that tests the median clause. */
export function catchFaults(verdict: TailLimitVerdict): readonly string[] {
  return CATCH_MUST_FAIL.filter((module) => verdict.cases.find((row) => row.case === module)?.outcome !== "beyond").map((module) => `${module}: the gate passes a module with an added cost`);
}

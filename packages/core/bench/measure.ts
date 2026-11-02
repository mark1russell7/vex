/**
 * The measure helper of the benches of Vex, with the interface `paired-time/1` of the fleet (MEASURE-ISOLATE of
 * highways and packing). The rule of the fleet of 2026-10-30: a measurement isolates what it measures. The arms of a
 * comparison alternate on each input, and a copy of the base (the A/A arm) gives the noise floor.
 *
 * - Mode `process`: one process. In each round, the arms run in turn on each input, and odd rounds reverse the order.
 * - Mode `fresh`: a new process for each arm in each round, and the order turns by one place at each round.
 *
 * Each copy of the helper keeps this interface until it moves to the gates package of rigor. No copy imports a type
 * of its repository.
 */
import { spawn } from "node:child_process";
import { arch, cpus, platform } from "node:os";
import process from "node:process";

/** The mode of a measurement: one process, or a new process for each arm in each round. */
export type Mode = "process" | "fresh";

/** One arm of a comparison. Mode `process` calls `run`. Mode `fresh` starts `command`, an argv. */
export interface Arm<I> {
  readonly id: string;
  readonly run?: (input: I) => unknown;
  readonly command?: readonly string[];
}

/** One input of a comparison. The group collects inputs of one family. */
export interface Input<I> {
  readonly id: string;
  readonly group?: string;
  readonly value?: I;
}

/** The options of `measureIsolated`. The first arm is the base. */
export interface PairedOptions<I> {
  readonly arms: readonly Arm<I>[];
  readonly inputs: readonly Input<I>[];
  /** The number of timed rounds of each arm on each input. */
  readonly repeats: number;
  /** The number of runs of each arm before its timed run. The helper does not time them. The default is 1. */
  readonly warmup?: number;
  readonly mode: Mode;
  /** With `true` (the default), a second copy of the base with the id `<base>~aa` gives the noise floor. */
  readonly aa?: boolean;
  /** For tests, mode `process`: the clock in ms. The default is `performance.now`. */
  readonly clock?: () => number;
  /** For tests, mode `fresh`: the start of one child. The default starts the command as a process. */
  readonly startChild?: (command: readonly string[], input: string, warmup: number) => Promise<ChildResult>;
  /** The machine of the run. The default is the machine of this process. */
  readonly env?: Env;
  /** The context of the run. The default is `context()`. */
  readonly context?: string;
}

/** The line of JSON of one child of mode `fresh`: its time in ms, and its memory peak in bytes. */
export interface ChildResult {
  readonly ms: number;
  readonly peakRss?: number;
}

/** The machine of a run. `cpu` is the model of the first CPU. */
export interface Env {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly runner?: string;
}

/** The statistics of the ratios of one arm over the inputs. */
export interface ArmRatios {
  /** The number of the inputs with a ratio. */
  readonly inputs: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  /** The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. Without the A/A arm, it is null. */
  readonly moved: number | null;
  /** The median ratio of the inputs of each group, with the groups in sorted order. An input with no group is in the group `all`. */
  readonly groups: Readonly<Record<string, number>>;
  readonly groupMean: number;
  readonly groupSD: number;
}

/** The records of one input: the raw times in ms, one for each round, and their medians and ratios. */
export interface InputReport {
  readonly id: string;
  readonly group?: string;
  readonly ms: Readonly<Record<string, readonly number[]>>;
  readonly median: Readonly<Record<string, number>>;
  /** The median time of the arm divided by the median time of the base, on this input. Lower tells faster. The base has no ratio, and a base median of 0 gives no ratio. */
  readonly ratio: Readonly<Record<string, number>>;
  /** The largest memory peak of each arm over its rounds, in bytes. Only mode `fresh` has it, and only for an arm with a peak. */
  readonly peakRss?: Readonly<Record<string, number>>;
}

/** The report of a measurement, with the schema `paired-time/1`. */
export interface PairedReport {
  readonly schema: "paired-time/1";
  readonly mode: Mode;
  /** The context of the run: `BENCH_MODE`, else `ci` or `local`, and the flags of Node.js. */
  readonly context?: string;
  readonly env: Env;
  readonly base: string;
  /** The ids of the arms. The A/A arm is the last. */
  readonly arms: readonly string[];
  readonly inputs: readonly InputReport[];
  /** The statistics of each arm that is not the base, with the A/A arm. */
  readonly ratios: Readonly<Record<string, ArmRatios>>;
  /** The ratios of the A/A arm. Without the A/A arm, it is null. */
  readonly noiseFloor: { readonly median: number; readonly p10: number; readonly p90: number } | null;
}

/** This function gives the machine of this run. `BENCH_RUNNER` names the runner, if it is set. */
export function env(): Env {
  const list = cpus();
  // An empty value counts as no value, so "||" and not "??".
  const name = process.env["BENCH_RUNNER"] || process.env["RUNNER_NAME"];
  return {
    cpu: list[0]?.model.trim() || "unknown",
    cores: list.length,
    os: platform(),
    arch: arch(),
    node: process.version,
    ...(name === undefined || name === "" ? {} : { runner: name }),
  };
}

/** This function gives the context of a run: `BENCH_MODE`, else `ci` or `local`, and the flags of Node.js. */
export function context(): string {
  return [process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local"), ...process.execArgv].join(" ");
}

/** This function gives the line that a bench prints before its records: the machine, the mode and the context. */
export function envLine(mode: Mode, e: Env = env()): string {
  return `runner: ${e.cpu} (${String(e.cores)} cores), Node.js ${e.node}, ${e.os}/${e.arch}, mode ${mode}, ${context()}`;
}

/** This function gives the quantile `q` of a list of numbers, with linear interpolation, or NaN for an empty list. */
export function quantile(xs: readonly number[], q: number): number {
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  const sorted = [...xs];
  // oxlint-disable-next-line unicorn/no-array-sort
  sorted.sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const lo = sorted[low] ?? Number.NaN;
  const hi = sorted[Math.min(low + 1, sorted.length - 1)] ?? Number.NaN;
  return lo + (hi - lo) * (at - low);
}

/** This function gives the median of a list of numbers, or NaN for an empty list. */
export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/** This function checks the options, and gives the arms with the A/A arm last when `aa` is not `false`. A bad option throws a `RangeError`. */
function armsOf<I>(options: PairedOptions<I>): readonly Arm<I>[] {
  if (options.mode !== "process" && options.mode !== "fresh") throw new RangeError(`measureIsolated: there is no mode "${String(options.mode)}".`);
  if (!Number.isInteger(options.repeats) || options.repeats < 1) throw new RangeError("measureIsolated: the repeats are a whole number of 1 or more.");
  const warmup = options.warmup ?? 1;
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("measureIsolated: the warm-up runs are a whole number of 0 or more.");
  const base = options.arms[0];
  if (base === undefined) throw new RangeError("measureIsolated: no arm. The first arm is the base.");
  const arms = options.aa === false ? [...options.arms] : [...options.arms, { ...base, id: `${base.id}~aa` }];
  if (arms.length < 2) throw new RangeError("measureIsolated: a comparison needs 2 arms or more, with the A/A arm.");
  if (new Set(arms.map((a) => a.id)).size !== arms.length) throw new RangeError("measureIsolated: the ids of the arms are not unique.");
  for (const a of arms) {
    if (options.mode === "process" && a.run === undefined) throw new RangeError(`measureIsolated: the arm ${a.id} of mode process needs run.`);
    if (options.mode === "fresh" && (a.command === undefined || a.command.length === 0)) throw new RangeError(`measureIsolated: the arm ${a.id} of mode fresh needs a command.`);
  }
  if (options.inputs.length === 0) throw new RangeError("measureIsolated: a comparison needs 1 input or more.");
  if (new Set(options.inputs.map((i) => i.id)).size !== options.inputs.length) throw new RangeError("measureIsolated: the ids of the inputs are not unique.");
  return arms;
}

/** This function gives the statistics of the ratios of one arm. The band is [p10, p90] of the A/A arm. */
function ratiosOf(rows: readonly { readonly group?: string; readonly ratio: number }[], band: { readonly p10: number; readonly p90: number } | undefined): ArmRatios {
  const rs = rows.map((r) => r.ratio);
  const byGroup = new Map<string, number[]>();
  for (const r of rows) byGroup.set(r.group ?? "all", [...(byGroup.get(r.group ?? "all") ?? []), r.ratio]);
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  const keys = [...byGroup.keys()];
  // oxlint-disable-next-line unicorn/no-array-sort
  keys.sort();
  const groups = Object.fromEntries(keys.map((g) => [g, median(byGroup.get(g) ?? [])]));
  const gs = Object.values(groups);
  const groupMean = gs.length === 0 ? Number.NaN : gs.reduce((s, x) => s + x, 0) / gs.length;
  const groupSD = gs.length < 2 ? 0 : Math.sqrt(gs.reduce((s, x) => s + (x - groupMean) ** 2, 0) / (gs.length - 1));
  const moved = band === undefined ? null : rs.length === 0 ? 0 : rs.filter((x) => x < band.p10 || x > band.p90).length / rs.length;
  return { inputs: rs.length, median: median(rs), p10: quantile(rs, 0.1), p90: quantile(rs, 0.9), moved, groups, groupMean, groupSD };
}

/** This function gives the report from the raw times of each input. */
function reportOf<I>(options: PairedOptions<I>, arms: readonly Arm<I>[], times: readonly Map<string, number[]>[], rss: readonly Map<string, number[]>[] | undefined): PairedReport {
  const base = arms[0]?.id ?? "";
  const aaId = `${base}~aa`;
  const others = arms.slice(1);
  const inputs: InputReport[] = options.inputs.map((input, i) => {
    const ms = Object.fromEntries(arms.map((a) => [a.id, times[i]?.get(a.id) ?? []]));
    // An arm with no times has no median, and an arm with no median has no ratio.
    const med = Object.fromEntries(arms.filter((a) => (ms[a.id] ?? []).length > 0).map((a) => [a.id, median(ms[a.id] ?? [])]));
    const b = med[base];
    const ratio = b === undefined || !(b > 0) ? {} : Object.fromEntries(others.filter((a) => med[a.id] !== undefined).map((a) => [a.id, (med[a.id] ?? Number.NaN) / b]));
    const peaks = [...(rss?.[i] ?? new Map<string, number[]>())].filter(([, xs]) => xs.length > 0).map(([id, xs]) => [id, Math.max(...xs)] as const);
    return {
      id: input.id,
      ...(input.group === undefined ? {} : { group: input.group }),
      ms,
      median: med,
      ratio,
      ...(peaks.length === 0 ? {} : { peakRss: Object.fromEntries(peaks) }),
    };
  });
  const rowsOf = (id: string): { group?: string; ratio: number }[] =>
    inputs.flatMap((r) => {
      const ratio = r.ratio[id];
      return ratio === undefined ? [] : [{ ...(r.group === undefined ? {} : { group: r.group }), ratio }];
    });
  const floor = arms.some((a) => a.id === aaId) ? ratiosOf(rowsOf(aaId), undefined) : undefined;
  const band = floor === undefined ? undefined : { p10: floor.p10, p90: floor.p90 };
  const ratios = Object.fromEntries(others.map((a) => [a.id, ratiosOf(rowsOf(a.id), band)]));
  const noiseFloor = floor === undefined ? null : { median: floor.median, p10: floor.p10, p90: floor.p90 };
  return { schema: "paired-time/1", mode: options.mode, context: options.context ?? context(), env: options.env ?? env(), base, arms: arms.map((a) => a.id), inputs, ratios, noiseFloor };
}

/** This function starts one child of mode `fresh` and gives its line of JSON. The time of the start does not count. */
async function child(command: readonly string[], input: string, warmup: number): Promise<ChildResult> {
  const [file, ...args] = command;
  if (file === undefined) throw new RangeError("measureIsolated: an arm of mode fresh needs a command.");
  return new Promise((resolve, reject) => {
    const p = spawn(file, [...args, "--input", input, "--warmup", String(warmup)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    p.on("error", reject);
    p.on("close", (code) => {
      const line = out.trim().split("\n").at(-1) ?? "";
      try {
        const r = JSON.parse(line) as { readonly ms?: unknown; readonly peakRss?: unknown };
        if (code !== 0 || typeof r.ms !== "number") throw new Error(`exit ${String(code)}`);
        resolve(typeof r.peakRss === "number" ? { ms: r.ms, peakRss: r.peakRss } : { ms: r.ms });
      } catch (error) {
        reject(new Error(`measureIsolated: the child ${command.join(" ")} --input ${input} gave no line {"ms": n}: ${String(error)}`));
      }
    });
  });
}

/** This function measures in one process. Each round runs the arms in turn on each input, reversed in odd rounds. */
function inProcess<I>(options: PairedOptions<I>, arms: readonly Arm<I>[]): PairedReport {
  const warmup = options.warmup ?? 1;
  const clock = options.clock ?? (() => performance.now());
  const times = options.inputs.map(() => new Map<string, number[]>(arms.map((a) => [a.id, []])));
  for (let round = 0; round < options.repeats; round++) {
    // The type-aware lint does not have Array#toReversed, and reverse() changes only the copy.
    // oxlint-disable-next-line unicorn/no-array-reverse
    const order = round % 2 === 0 ? arms : [...arms].reverse();
    options.inputs.forEach((input, i) => {
      for (const arm of order) {
        const run = arm.run;
        if (run === undefined) throw new RangeError(`measureIsolated: the arm ${arm.id} of mode process needs run.`);
        const value = input.value as I;
        for (let w = 0; w < warmup; w++) run(value);
        const t0 = clock();
        const out = run(value);
        times[i]?.get(arm.id)?.push(clock() - t0);
        // A memory peak counts only in mode fresh: in one process, the heap holds the data of each arm.
        if (typeof out === "object" && out !== null && typeof (out as { readonly peakRss?: unknown }).peakRss === "number")
          throw new RangeError(`measureIsolated: the arm ${arm.id} gave a peakRss in mode process. A memory peak counts only in mode fresh.`);
      }
    });
  }
  return reportOf(options, arms, times, undefined);
}

/** This function measures with a new process for each arm in each round. The order turns by one place at each round. */
async function inFresh<I>(options: PairedOptions<I>, arms: readonly Arm<I>[]): Promise<PairedReport> {
  const warmup = options.warmup ?? 1;
  const start = options.startChild ?? child;
  const times = options.inputs.map(() => new Map<string, number[]>(arms.map((a) => [a.id, []])));
  const rss = options.inputs.map(() => new Map<string, number[]>(arms.map((a) => [a.id, []])));
  for (let round = 0; round < options.repeats; round++) {
    const order = arms.map((_a, k) => arms[(k + round) % arms.length]).filter((a) => a !== undefined);
    // Each input takes all of its arms before the next input, so no whole pass lies between two arms of one input.
    for (const [i, input] of options.inputs.entries()) {
      for (const arm of order) {
        // The children run one at a time: two children at one time change the times of each other.
        // oxlint-disable-next-line no-await-in-loop
        const r = await start(arm.command ?? [], input.id, warmup);
        times[i]?.get(arm.id)?.push(r.ms);
        if (r.peakRss !== undefined) rss[i]?.get(arm.id)?.push(r.peakRss);
      }
    }
  }
  return reportOf(options, arms, times, rss);
}

/** This function measures the arms on the inputs in one process. */
export function measureIsolated<I>(options: PairedOptions<I> & { readonly mode: "process" }): PairedReport;
/** This function measures the arms on the inputs, with a new process for each arm in each round. */
export function measureIsolated<I>(options: PairedOptions<I> & { readonly mode: "fresh" }): Promise<PairedReport>;
export function measureIsolated<I>(options: PairedOptions<I>): PairedReport | Promise<PairedReport> {
  // In mode fresh, a bad option rejects the promise.
  if (options.mode === "fresh") return Promise.resolve().then(async () => inFresh(options, armsOf(options)));
  return inProcess(options, armsOf(options));
}

/**
 * This function gives an arm that calls `f` a number of times in each timed run, so one run is long enough for the
 * clock. Give both arms of a comparison the same count, so the ratio of the runs is the ratio of the calls.
 */
export function batch(id: string, f: () => void, calls: number): Arm<undefined> {
  // GATENOISE diagnostic: with GATE_FRESH_BATCH, each arm gets a loop of its own source, so no two arms share its feedback.
  if (process.env["GATE_FRESH_BATCH"] === "1") {
    // oxlint-disable-next-line no-new-func, typescript/no-unsafe-type-assertion, typescript/no-unsafe-call
    const run = new Function("f", "calls", `return () => { for (let c = 0; c < calls; c++) f(); }; // ${id}`)(f, calls) as () => void;
    return { id, run };
  }
  return {
    id,
    run: () => {
      for (let c = 0; c < calls; c++) f();
    },
  };
}

/** This function gives a count of calls of the slower of the functions that fills about `ms` milliseconds. */
export function callsFor(fs: readonly (() => void)[], ms: number): number {
  let slowest = 0;
  for (const f of fs) {
    for (let i = 0; i < 20; i++) f();
    let calls = 0;
    const start = performance.now();
    while (performance.now() - start < ms) {
      f();
      calls++;
    }
    slowest = Math.max(slowest, (performance.now() - start) / calls);
  }
  return Math.max(1, Math.ceil(ms / slowest));
}

/** The result of a comparison of two functions: the median ratio of `a` over `b`, and the time of one call in µs. */
export interface Paired {
  readonly ratio: number;
  readonly a: number;
  readonly b: number;
  readonly noise: { readonly p10: number; readonly p90: number };
  readonly report: PairedReport;
}

/**
 * This function compares `a` with the base `b` in mode `process`, with the A/A arm. Each timed run calls a function
 * enough times for about `ms` milliseconds. The ratio is the time of `a` divided by the time of `b`: lower is faster.
 */
export function paired(a: () => void, b: () => void, options: { readonly repeats?: number; readonly ms?: number } = {}): Paired {
  const { repeats = 16, ms = 30 } = options;
  const calls = callsFor([a, b], ms);
  const report = measureIsolated({ arms: [batch("b", b, calls), batch("a", a, calls)], inputs: [{ id: "one" }], repeats, mode: "process" });
  const one = report.inputs[0];
  const perCall = (id: string): number => ((one?.median[id] ?? Number.NaN) * 1000) / calls;
  // The ratio of each round, with the base of the same round, keeps a change of the speed of the machine out.
  const rounds = (one?.ms["a"] ?? []).map((x, k) => x / (one?.ms["b"]?.[k] ?? Number.NaN));
  const aa = (one?.ms["b~aa"] ?? []).map((x, k) => x / (one?.ms["b"]?.[k] ?? Number.NaN));
  return { ratio: median(rounds), a: perCall("a"), b: perCall("b"), noise: { p10: quantile(aa, 0.1), p90: quantile(aa, 0.9) }, report };
}

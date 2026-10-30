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
  readonly inputs: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  /** The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. Without the A/A arm, it is null. */
  readonly moved: number | null;
  /** The median ratio of the inputs of each group. */
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
  /** The median time of the arm divided by the median time of the base, on this input. Lower tells faster. */
  readonly ratio: Readonly<Record<string, number>>;
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
  readonly arms: readonly string[];
  readonly inputs: readonly InputReport[];
  readonly ratios: Readonly<Record<string, ArmRatios>>;
  /** The ratios of the A/A arm. Without the A/A arm, it is null. */
  readonly noiseFloor: { readonly median: number; readonly p10: number; readonly p90: number } | null;
}

/** This function gives the machine of this run. `BENCH_RUNNER` names the runner, if it is set. */
export function env(): Env {
  const list = cpus();
  const name = process.env["BENCH_RUNNER"] ?? process.env["RUNNER_NAME"];
  return {
    cpu: list[0]?.model.trim() ?? "unknown",
    cores: list.length,
    os: platform(),
    arch: arch(),
    node: process.version,
    ...(name === undefined || name === "" ? {} : { runner: name }),
  };
}

/** This function gives the context of a run: `BENCH_MODE`, else `ci` or `local`, and the flags of Node.js. */
export function context(): string {
  return [process.env["BENCH_MODE"] ?? (process.env["CI"] === "true" ? "ci" : "local"), ...process.execArgv].join(" ");
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

/** This function gives the arms of a measurement, with the A/A arm after the base when `aa` is not `false`. */
function armsOf<I>(options: PairedOptions<I>): readonly Arm<I>[] {
  const [base, ...rest] = options.arms;
  if (base === undefined) throw new RangeError("measureIsolated: no arm. The first arm is the base.");
  return options.aa === false ? options.arms : [base, { ...base, id: `${base.id}~aa` }, ...rest];
}

/** This function gives the report from the raw times of each input. */
function reportOf<I>(options: PairedOptions<I>, arms: readonly Arm<I>[], times: readonly Map<string, number[]>[], rss: readonly Map<string, number[]>[] | undefined): PairedReport {
  const base = arms[0]?.id ?? "";
  const aaId = `${base}~aa`;
  const inputs: InputReport[] = options.inputs.map((input, i) => {
    const ms = Object.fromEntries(arms.map((a) => [a.id, times[i]?.get(a.id) ?? []]));
    const med = Object.fromEntries(arms.map((a) => [a.id, median(ms[a.id] ?? [])]));
    const ratio = Object.fromEntries(arms.map((a) => [a.id, (med[a.id] ?? Number.NaN) / (med[base] ?? Number.NaN)]));
    const peaks = rss?.[i];
    return {
      id: input.id,
      ...(input.group === undefined ? {} : { group: input.group }),
      ms,
      median: med,
      ratio,
      ...(peaks === undefined ? {} : { peakRss: Object.fromEntries(arms.map((a) => [a.id, Math.max(...(peaks.get(a.id) ?? [Number.NaN]))])) }),
    };
  });
  const ratiosOf = (id: string): number[] => inputs.map((r) => r.ratio[id] ?? Number.NaN);
  const aa = arms.some((a) => a.id === aaId) ? ratiosOf(aaId) : [];
  const noiseFloor = aa.length === 0 ? null : { median: median(aa), p10: quantile(aa, 0.1), p90: quantile(aa, 0.9) };
  const ratios = Object.fromEntries(
    arms.map((a) => {
      const rs = ratiosOf(a.id);
      const byGroup = new Map<string, number[]>();
      inputs.forEach((r, k) => {
        const g = r.group ?? "all";
        byGroup.set(g, [...(byGroup.get(g) ?? []), rs[k] ?? Number.NaN]);
      });
      const groups = Object.fromEntries([...byGroup].map(([g, xs]) => [g, median(xs)]));
      const gs = Object.values(groups);
      const groupMean = gs.reduce((s, x) => s + x, 0) / gs.length;
      const groupSD = gs.length < 2 ? 0 : Math.sqrt(gs.reduce((s, x) => s + (x - groupMean) ** 2, 0) / (gs.length - 1));
      const moved = noiseFloor === null ? null : rs.filter((x) => x < noiseFloor.p10 || x > noiseFloor.p90).length / rs.length;
      return [a.id, { inputs: rs.length, median: median(rs), p10: quantile(rs, 0.1), p90: quantile(rs, 0.9), moved, groups, groupMean, groupSD }];
    }),
  );
  return { schema: "paired-time/1", mode: options.mode, context: context(), env: env(), base, arms: arms.map((a) => a.id), inputs, ratios, noiseFloor };
}

/** This function starts one child of mode `fresh` and gives its line of JSON. The time of the start does not count. */
async function child(command: readonly string[], input: string, warmup: number): Promise<{ readonly ms: number; readonly peakRss?: number }> {
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
        const t0 = performance.now();
        run(value);
        times[i]?.get(arm.id)?.push(performance.now() - t0);
      }
    });
  }
  return reportOf(options, arms, times, undefined);
}

/** This function measures with a new process for each arm in each round. The order turns by one place at each round. */
async function inFresh<I>(options: PairedOptions<I>, arms: readonly Arm<I>[]): Promise<PairedReport> {
  const warmup = options.warmup ?? 1;
  const times = options.inputs.map(() => new Map<string, number[]>(arms.map((a) => [a.id, []])));
  const rss = options.inputs.map(() => new Map<string, number[]>(arms.map((a) => [a.id, []])));
  for (let round = 0; round < options.repeats; round++) {
    const order = arms.map((_a, k) => arms[(k + round) % arms.length]).filter((a) => a !== undefined);
    for (const [i, input] of options.inputs.entries()) {
      for (const arm of order) {
        // The children run one at a time: two children at one time change the times of each other.
        // oxlint-disable-next-line no-await-in-loop
        const r = await child(arm.command ?? [], input.id, warmup);
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
  const arms = armsOf(options);
  return options.mode === "process" ? inProcess(options, arms) : inFresh(options, arms);
}

/**
 * This function gives an arm that calls `f` a number of times in each timed run, so one run is long enough for the
 * clock. Give both arms of a comparison the same count, so the ratio of the runs is the ratio of the calls.
 */
export function batch(id: string, f: () => void, calls: number): Arm<undefined> {
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

/**
 * The GC instrument of the speed gate of the compiler (GATEGC). The shapes case has a large spread of its process
 * ratios. This instrument measures if the garbage collector causes it. With `GATE_GC=1`, `gate.ts` counts the garbage
 * collections in the timed runs of each arm, with a `PerformanceObserver` of the entry type `gc`. `gate-processes.ts`
 * gives the medians of each case over its processes. Without `GATE_GC=1`, the gate makes no observer, so no time changes.
 *
 * This instrument is a part of the bench harness, and it moves with the harness to rigor.
 */
import { PerformanceObserver, constants, type PerformanceEntry } from "node:perf_hooks";
import { setImmediate as tick } from "node:timers/promises";
import { median, type PairedReport } from "../../core/bench/measure.ts";

/** This value is true when `GATE_GC=1` is set. */
export const GC_ON = process.env["GATE_GC"] === "1";

/** The garbage collections in the timed runs of one arm in one process. The times are in ms. */
export interface ArmGc {
  readonly arm: string;
  readonly minor: number;
  readonly minorMs: number;
  readonly major: number;
  readonly majorMs: number;
  /** This count holds the incremental marking steps and the weak callbacks. */
  readonly other: number;
  readonly otherMs: number;
  /** This value is the sum of the timed runs of the arm. */
  readonly timedMs: number;
}

/** A record of the garbage collections of one measurement. Give `clock` to `paired`, then call `done` with its report. */
export interface GcRecorder {
  readonly clock: () => number;
  readonly done: (report: PairedReport, names: Readonly<Record<string, string>>) => Promise<readonly string[]>;
}

/** This function starts an observer of the entry type `gc`, and gives a clock that records each timed run. */
export function gcRecorder(): GcRecorder {
  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => {
    entries.push(...list.getEntries());
  });
  observer.observe({ entryTypes: ["gc"] });
  const marks: number[] = [];
  const clock = (): number => {
    const t = performance.now();
    marks.push(t);
    return t;
  };
  const done = async (report: PairedReport, names: Readonly<Record<string, string>>): Promise<readonly string[]> => {
    // Node.js gives each gc entry to the observer later, from the event loop. The loop runs until no entry comes.
    for (let turn = 0, last = -1; turn < 50 && (turn < 3 || last !== entries.length); turn++) {
      last = entries.length;
      // oxlint-disable-next-line no-await-in-loop -- each turn of the event loop gives the entries of the turn before it.
      await tick();
    }
    entries.push(...observer.takeRecords());
    observer.disconnect();
    // The lines come in the order of the names, and an arm with no name comes last.
    const rank = (arm: string): number => (Object.hasOwn(names, arm) ? Object.keys(names).indexOf(arm) : Number.MAX_SAFE_INTEGER);
    const gs = [...armsOf(report, marks, entries)];
    // oxlint-disable-next-line unicorn/no-array-sort -- sort() changes only the copy.
    gs.sort((x, y) => rank(x.arm) - rank(y.arm));
    return gs.map((g) => gcLine(g, names[g.arm] ?? g.arm));
  };
  return { clock, done };
}

/** This function gives the kind of a gc entry: minor (a scavenge), major (a mark-compact) or other. */
function kindOf(e: PerformanceEntry): "minor" | "major" | "other" {
  // The types of Node.js in this repository do not have `detail` on a `PerformanceEntry`.
  const kind = (e as { readonly detail?: { readonly kind?: number } | null }).detail?.kind;
  return kind === constants.NODE_PERFORMANCE_GC_MINOR ? "minor" : kind === constants.NODE_PERFORMANCE_GC_MAJOR ? "major" : "other";
}

/**
 * This function gives the garbage collections of each arm. A pair of marks is the start and the end of one timed run.
 * The runs come in the order of `measureIsolated`: the arms in turn, reversed in odd rounds. Each run must have the
 * time of the report, or the function throws.
 */
function armsOf(report: PairedReport, marks: readonly number[], entries: readonly PerformanceEntry[]): readonly ArmGc[] {
  const ms = report.inputs[0]?.ms ?? {};
  const n = report.arms.length;
  const runs = marks.length / 2;
  if (report.inputs.length !== 1 || !Number.isInteger(runs) || runs !== n * (ms[report.arms[0] ?? ""]?.length ?? 0)) throw new Error("gc: the timed runs do not agree with the report.");
  const sums = new Map(report.arms.map((a) => [a, { minor: 0, minorMs: 0, major: 0, majorMs: 0, other: 0, otherMs: 0, timedMs: 0 }]));
  for (let j = 0; j < runs; j++) {
    const round = Math.floor(j / n);
    // The type-aware lint does not have Array#toReversed, and reverse() changes only the copy.
    // oxlint-disable-next-line unicorn/no-array-reverse
    const order = round % 2 === 0 ? report.arms : [...report.arms].reverse();
    const arm = order[j % n] ?? "";
    const t0 = marks[2 * j] ?? Number.NaN;
    const t1 = marks[2 * j + 1] ?? Number.NaN;
    const s = sums.get(arm);
    if (s === undefined || ms[arm]?.[round] !== t1 - t0) throw new Error(`gc: the timed run ${String(j)} does not agree with the report.`);
    s.timedMs += t1 - t0;
    for (const e of entries) {
      if (e.startTime < t0 || e.startTime > t1) continue;
      const k = kindOf(e);
      s[k] += 1;
      s[`${k}Ms` as const] += e.duration;
    }
  }
  return [...sums].map(([arm, s]) => ({ arm, ...s }));
}

/** This function gives the line of the garbage collections of one arm, in the form that `parseGc` reads. */
export function gcLine(g: ArmGc, name: string): string {
  const total = g.minorMs + g.majorMs + g.otherMs;
  return `gc ${name}: ${String(g.minor)} minor ${g.minorMs.toFixed(2)} ms, ${String(g.major)} major ${g.majorMs.toFixed(2)} ms, ${String(g.other)} other ${g.otherMs.toFixed(2)} ms, GC ${total.toFixed(2)} ms of ${g.timedMs.toFixed(1)} ms timed`;
}

const GC_LINE = /^gc (\S+): (\d+) minor ([\d.]+) ms, (\d+) major ([\d.]+) ms, (\d+) other ([\d.]+) ms, GC [\d.]+ ms of ([\d.]+) ms timed$/u;

/** This function reads the gc lines of the output of one process. */
export function parseGc(stdout: string): readonly ArmGc[] {
  return stdout.split("\n").flatMap((line) => {
    const m = GC_LINE.exec(line.trim());
    if (m === null) return [];
    const [, arm = "", minor, minorMs, major, majorMs, other, otherMs, timedMs] = m;
    return [{ arm, minor: Number(minor), minorMs: Number(minorMs), major: Number(major), majorMs: Number(majorMs), other: Number(other), otherMs: Number(otherMs), timedMs: Number(timedMs) }];
  });
}

/** This function gives the share of the timed runs of an arm that the garbage collector used, in percent. */
const shareOf = (g: ArmGc | undefined): number => (g === undefined || !(g.timedMs > 0) ? Number.NaN : (100 * (g.minorMs + g.majorMs + g.otherMs)) / g.timedMs);

/**
 * This function gives the gc summary lines of one case: the median counts and times of each arm over the processes,
 * then the ratio and the GC share of each arm in each process, in the order of the ratios.
 */
export function gcSummary(label: string, processes: readonly { readonly ratio: number; readonly gc: readonly ArmGc[] }[]): readonly string[] {
  const arms = [...new Set(processes.flatMap((p) => p.gc.map((g) => g.arm)))];
  const of = (arm: string): readonly ArmGc[] => processes.flatMap((p) => p.gc.filter((g) => g.arm === arm));
  const mid = (gs: readonly ArmGc[], f: (g: ArmGc) => number): number => median(gs.map((g) => f(g)));
  const parts = arms.map((arm) => {
    const gs = of(arm);
    return `${arm} ${mid(gs, (g) => g.minor).toFixed(0)} minor ${mid(gs, (g) => g.minorMs).toFixed(2)} ms, ${mid(gs, (g) => g.major).toFixed(0)} major ${mid(gs, (g) => g.majorMs).toFixed(2)} ms, ${mid(gs, (g) => g.other).toFixed(0)} other ${mid(gs, (g) => g.otherMs).toFixed(2)} ms, GC share ${mid(gs, shareOf).toFixed(1)} %`;
  });
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  const sorted = [...processes];
  // oxlint-disable-next-line unicorn/no-array-sort
  sorted.sort((x, y) => x.ratio - y.ratio);
  const rows = sorted.map((p) => `${p.ratio.toFixed(2)} ${arms.map((arm) => shareOf(p.gc.find((g) => g.arm === arm)).toFixed(1)).join("/")}`);
  return [
    `gc ${label}: the medians of ${String(processes.length)} processes: ${parts.join("; ")}`,
    `gc ${label}: each process as its ratio and the GC share in % of ${arms.join("/")}, by ratio: ${rows.join(", ")}`,
  ];
}

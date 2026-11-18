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
import type { ArmRounds } from "@mark1russell7/rigor-bench";
import { median } from "@mark1russell7/rigor-statistics";

/** This value is true when `GATE_GC=1` is set. */
export const GC_ON = process.env["GATE_GC"] === "1";

/** The garbage collections in the timed batches of one arm in one process. The times are in ms. */
export interface ArmGc {
  readonly arm: string;
  readonly minor: number;
  readonly minorMs: number;
  readonly major: number;
  readonly majorMs: number;
  /** This count holds the incremental marking steps and the weak callbacks. */
  readonly other: number;
  readonly otherMs: number;
  /** This value is the sum of the timed batches of the arm. */
  readonly timedMs: number;
}

/**
 * A record of the garbage collections of one measurement. Start it before `paired`, then give the rounds of `paired` to `done`.
 * The spans of the rounds and the gc entries use the one clock `performance.now`.
 */
export interface GcRecorder {
  readonly done: (rounds: ArmRounds, names: Readonly<Record<string, string>>) => Promise<readonly string[]>;
}

/** This function starts an observer of the entry type `gc`. */
export function gcRecorder(): GcRecorder {
  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => {
    entries.push(...list.getEntries());
  });
  observer.observe({ entryTypes: ["gc"] });
  const done = async (rounds: ArmRounds, names: Readonly<Record<string, string>>): Promise<readonly string[]> => {
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
    const gs = [...armsOf(rounds, entries)];
    // oxlint-disable-next-line unicorn/no-array-sort -- sort() changes only the copy.
    gs.sort((x, y) => rank(x.arm) - rank(y.arm));
    return gs.map((g) => gcLine(g, names[g.arm] ?? g.arm));
  };
  return { done };
}

/** This function gives the kind of a gc entry: minor (a scavenge), major (a mark-compact) or other. */
function kindOf(e: PerformanceEntry): "minor" | "major" | "other" {
  // The types of Node.js in this repository do not have `detail` on a `PerformanceEntry`.
  const kind = (e as { readonly detail?: { readonly kind?: number } | null }).detail?.kind;
  return kind === constants.NODE_PERFORMANCE_GC_MINOR ? "minor" : kind === constants.NODE_PERFORMANCE_GC_MAJOR ? "major" : "other";
}

/**
 * This function gives the garbage collections of each arm. The spans of the rounds are the timed batches, in the order
 * of the batches. The time of each span must be the time of its batch in the pairs, or the function throws.
 */
export function armsOf(rounds: ArmRounds, entries: readonly PerformanceEntry[]): readonly ArmGc[] {
  const pairIds = Object.keys(rounds.pairs);
  const arms = rounds.orders[0] ?? [];
  const base = arms.find((arm) => !pairIds.includes(arm));
  if (base === undefined || rounds.orders.length !== rounds.spans.length) throw new Error("gc: the spans do not agree with the rounds.");
  const sums = new Map(arms.map((a) => [a, { minor: 0, minorMs: 0, major: 0, majorMs: 0, other: 0, otherMs: 0, timedMs: 0 }]));
  for (const [round, order] of rounds.orders.entries()) {
    const spans = rounds.spans[round] ?? [];
    if (order.length !== arms.length || spans.length !== order.length) throw new Error(`gc: round ${String(round)} does not agree with the rounds.`);
    for (const [place, arm] of order.entries()) {
      const span = spans[place];
      const s = sums.get(arm);
      // Arm `a` of each record is the base, and arm `b` is the arm of the pair.
      const record = arm === base ? rounds.pairs[pairIds[0] ?? ""]?.[round] : rounds.pairs[arm]?.[round];
      const time = arm === base ? record?.a : record?.b;
      if (span === undefined || s === undefined || time !== span.end - span.start) throw new Error(`gc: the batch of ${arm} in round ${String(round)} does not agree with the rounds.`);
      s.timedMs += time;
      for (const e of entries) {
        if (e.startTime < span.start || e.startTime > span.end) continue;
        const k = kindOf(e);
        s[k] += 1;
        s[`${k}Ms` as const] += e.duration;
      }
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
  // A process with no timed runs has no GC share, so the median uses only the known shares.
  const share = (gs: readonly ArmGc[]): string => {
    const known = gs.map(shareOf).filter((s) => !Number.isNaN(s));
    return known.length === 0 ? "no read" : `${median(known).toFixed(1)} %`;
  };
  const parts = arms.map((arm) => {
    const gs = of(arm);
    return `${arm} ${mid(gs, (g) => g.minor).toFixed(0)} minor ${mid(gs, (g) => g.minorMs).toFixed(2)} ms, ${mid(gs, (g) => g.major).toFixed(0)} major ${mid(gs, (g) => g.majorMs).toFixed(2)} ms, ${mid(gs, (g) => g.other).toFixed(0)} other ${mid(gs, (g) => g.otherMs).toFixed(2)} ms, GC share ${share(gs)}`;
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

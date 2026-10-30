/**
 * The parts that each bench of Vex shares, for the rule of the fleet of 2026-10-30: a measurement isolates what it
 * measures. A comparison runs its two arms in one process and alternates them, with the order swapped at each pair.
 * Each record names the CPU of the runner and the mode of the run.
 */
import { cpus } from "node:os";
import process from "node:process";

/** The machine and the mode of a run, for each record of a bench. */
export interface Runner {
  readonly cpu: string;
  readonly cores: number;
  readonly node: string;
  readonly platform: string;
  /** The mode: `BENCH_MODE`, else `ci` on a CI runner, else `local`. The flags of Node follow it. */
  readonly mode: string;
}

/** This function gives the machine and the mode of this run. */
export function runner(): Runner {
  const list = cpus();
  const flags = process.execArgv.join(" ");
  const base = process.env["BENCH_MODE"] ?? (process.env["CI"] === "true" ? "ci" : "local");
  return {
    cpu: list[0]?.model.trim() ?? "unknown",
    cores: list.length,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    mode: flags === "" ? base : `${base} ${flags}`,
  };
}

/** This function gives the line that a bench prints before its records. */
export function runnerLine(r: Runner = runner()): string {
  return `runner: ${r.cpu} (${String(r.cores)} cores), Node.js ${r.node}, ${r.platform}, mode ${r.mode}`;
}

/** This function gives the median of a list of numbers, or NaN for an empty list. */
export function median(xs: readonly number[]): number {
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  const sorted = [...xs];
  // oxlint-disable-next-line unicorn/no-array-sort
  sorted.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 === 1 ? (sorted[mid] ?? Number.NaN) : ((sorted[mid - 1] ?? Number.NaN) + (sorted[mid] ?? Number.NaN)) / 2;
}

/** This function gives the time of one call of `f` in one sample of `ms` milliseconds, in microseconds. */
export function sample(f: () => void, ms: number): number {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    f();
    calls++;
  }
  return ((performance.now() - start) * 1000) / calls;
}

/** The result of a comparison: the median of the ratios of the pairs, and the median time of each arm in µs. */
export interface Paired {
  readonly ratio: number;
  readonly a: number;
  readonly b: number;
  readonly pairs: number;
}

/**
 * This function compares the arms `a` and `b` in this process. It calls each arm 20 times first, and does not count
 * these calls. Then each pair takes one sample of each arm: `a` first in the even pairs and `b` first in the odd
 * pairs. The ratio is the time of `a` divided by the time of `b`, so a lower ratio tells that `a` is faster.
 */
export function paired(a: () => void, b: () => void, options: { readonly pairs?: number; readonly ms?: number } = {}): Paired {
  const { pairs = 16, ms = 30 } = options;
  for (let i = 0; i < 20; i++) {
    a();
    b();
  }
  const ta: number[] = [];
  const tb: number[] = [];
  const ratios: number[] = [];
  for (let p = 0; p < pairs; p++) {
    let x: number;
    let y: number;
    if (p % 2 === 0) {
      x = sample(a, ms);
      y = sample(b, ms);
    } else {
      y = sample(b, ms);
      x = sample(a, ms);
    }
    ta.push(x);
    tb.push(y);
    ratios.push(x / y);
  }
  return { ratio: median(ratios), a: median(ta), b: median(tb), pairs };
}

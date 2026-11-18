/**
 * The machine and the context of a bench of Vex, and the quantiles of its times. The bench harness is in
 * `@mark1russell7/rigor-bench`: `paired.ts` uses `timeArmRounds`, and the module-cost bench uses `freshRun`.
 */
import { arch, cpus, platform } from "node:os";
import process from "node:process";

/** The mode of a measurement: one process, or a new process for each arm in each round. */
export type Mode = "process" | "fresh";

/** The machine of a run. `cpu` is the model of the first CPU. */
export interface Env {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly runner?: string;
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

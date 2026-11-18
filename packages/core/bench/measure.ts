/**
 * The first line of a bench of Vex: the machine, the mode and the context of the run. The machine comes from `benchEnv`
 * of `@mark1russell7/rigor-bench/fresh`. The medians and the quantiles of the times come from `@mark1russell7/rigor-statistics`.
 */
import { benchEnv, type BenchEnv } from "@mark1russell7/rigor-bench/fresh";
import process from "node:process";

/** The mode of a measurement: one process, or a new process for each arm in each round. */
export type Mode = "process" | "fresh";

/** This function gives the context of a run: `BENCH_MODE`, else `ci` or `local`, and the flags of Node.js. */
export function context(): string {
  return [process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local"), ...process.execArgv].join(" ");
}

/** This function gives the line that a bench prints before its records: the machine, the mode and the context. */
export function envLine(mode: Mode, e: BenchEnv = benchEnv()): string {
  return `runner: ${e.cpu} (${String(e.cores)} cores), Node.js ${e.node}, ${e.os}/${e.arch}, mode ${mode}, ${context()}`;
}

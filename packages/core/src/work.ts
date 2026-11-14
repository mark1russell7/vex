/**
 * The work limit of one evaluation (WORK.LIMIT). The option `maxWork` sets the most points that one run can spend. Each
 * tier spends one point for each application of a closure: a call of a function of a `let`, the body of `each` at one
 * target, the test of `where` at one target, one step of `fold` and of `iterate`, and one row of one round of `fix`.
 * `fill` spends one point for each item of its list. The count is a count of the language. Thus a tier that keeps the
 * value of a part from an earlier run spends the points of that part again (WORK.TIERS).
 */
import { Failure } from "@mark1russell7/coeval";
import { vexError, type VexError } from "./errors.ts";
import type { Result } from "./result.ts";

/** A result with the work of its run. The field `work` is there only when the run had the option `maxWork`. */
export type WorkResult<T> = Result<T> & { readonly work?: number };

/** The count of the work of one run, and its limit. */
interface Meter {
  spent: number;
  readonly limit: number;
}

/** The meter of the run that spends now, or `undefined` when the run has no limit. */
let current: Meter | undefined;

/** This function gives the reason of the error `#WORK!`. It is the reason of the kernel of coeval, word for word. */
const workReason = (limit: number): string => `The work of one evaluation is more than ${String(limit)} points. The field maxWork of the machine sets the limit.`;

/**
 * This function gives the error of a run that spends more than `maxWork` points (WORK.LIMIT). The error has the
 * position of the origin, because the limit is for the full run.
 *
 * @param limit - The option `maxWork` of the run.
 * @param origin - The origin of the run.
 * @returns The error `#WORK!`.
 */
export const workError = (limit: number, origin: string): VexError => vexError("work", workReason(limit), { origin, focus: origin });

/**
 * This function spends points of the run that evaluates now (WORK.LIMIT). A run without the option `maxWork` has no
 * meter, and the function does nothing.
 *
 * @param points - The points.
 * @throws {Failure} The error `#WORK!`, when the count is more than the limit of the run.
 */
export function spendWork(points: number): void {
  const meter = current;
  if (meter === undefined) return;
  meter.spent += points;
  // The kernel of coeval catches a `Failure` as its own error, so the plan tier gives `#WORK!` too.
  if (meter.spent > meter.limit) throw new Failure({ code: "#WORK!", reason: workReason(meter.limit) });
}

/**
 * This function gives the points that the run spent so far, or 0 for a run without a limit. A tier that keeps a value
 * reads the count before and after the value, and keeps the difference with it.
 *
 * @returns The points.
 */
export const spentWork = (): number => current?.spent ?? 0;

/**
 * This function tells if a run with the option `maxWork` evaluates now. A host function that starts a run without a
 * limit inside such a run uses `countWork`, so the inner run spends no points of the outer run.
 *
 * @returns True when a meter counts now.
 */
export const isCounting = (): boolean => current !== undefined;

/**
 * The outcome of a count: the result and its points, or the stop at the point past the limit. A stop has the work of
 * the first whole number above the limit, so each tier gives the same count for it.
 */
export type Counted<R> = { readonly over: false; readonly result: R; readonly work: number } | { readonly over: true; readonly work: number; readonly limit: number };

/**
 * This function runs `run` with a new meter (WORK.LIMIT). The run is over the limit when its count is more than
 * `limit` at its end. Then no rule of the program can hide the stop: an error value of `#WORK!` that `ifError` or a
 * list op skips does not change the outcome. A run without a limit has no meter. Thus a run inside the host code of
 * an outer run does not spend the points of the outer run.
 *
 * @param limit - The option `maxWork`, or `undefined` for no limit.
 * @param run - The run.
 * @returns The outcome of the run, with its points when it has a limit.
 */
export function countWork<R>(limit: number | undefined, run: () => R): Counted<R> {
  const outer = current;
  const meter: Meter | undefined = limit === undefined ? undefined : { spent: 0, limit };
  current = meter;
  try {
    const result = run();
    return meter !== undefined && meter.spent > meter.limit ? stopped(meter.limit) : { over: false, result, work: meter?.spent ?? 0 };
  } catch (error) {
    if (meter !== undefined && meter.spent > meter.limit) return stopped(meter.limit);
    throw error;
  } finally {
    current = outer;
  }
}

/** This function gives the outcome of a stop. The count is the first whole number above the limit, and 0 or more. */
const stopped = (limit: number): Counted<never> => ({ over: true, work: Math.max(0, Math.floor(limit) + 1), limit });

/**
 * This function runs `run` with the option `maxWork` (WORK.RESULT). Without the option, it gives the result of the
 * run. With the option, the result has the field `work`, and a run over the limit gives `#WORK!` at the origin.
 *
 * @param maxWork - The option `maxWork`, or `undefined`.
 * @param origin - The origin of the run.
 * @param run - The run. It does not throw.
 * @returns The result.
 */
export function withWork<T>(maxWork: number | undefined, origin: string, run: () => Result<T>): WorkResult<T> {
  const counted = countWork(maxWork, run);
  if (counted.over) return { ok: false, error: workError(counted.limit, origin), work: counted.work };
  return maxWork === undefined ? counted.result : { ...counted.result, work: counted.work };
}

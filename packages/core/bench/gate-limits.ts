/**
 * The limits of the speed gate of the core (`gate.ts`), and its read line. This module has no side effects, so a test can
 * read the limits.
 */
import type { CaseAaStat, CaseLimit } from "@mark1russell7/rigor-bench";

/** The limits of one case of the core gate. */
export interface CoreLimits {
  /** The largest ratio of the time of Vex to the time of the hand-written loops. */
  readonly limit: number;
  /**
   * The largest A/A spread of the rounds of the case, on a log scale, as `aaStats` of rigor-bench gives it. The cap also
   * limits the A/A median to `[-noiseCap, noiseCap]`. A run above the cap cannot decide. Without it, the gate has no cap.
   */
  readonly noiseCap?: number;
}

/**
 * The limits of each case. Each limit is the worst ratio of 5 CI runs times 1.1 (a rule of 2026-10-30), rounded up. The
 * runs are run 41022173204 of speed-gate.yml (2026-10-30): AMD EPYC 7763 in runs 2 to 4, AMD EPYC 9V45 in runs 1 and 5.
 * - `nearest`: 17.4, 21.0, 20.9, 21.2 and 16.6. The worst is 21.2, so the limit is 23.4. The 9V45 gives 17.
 * - `life`: 38.6, 38.0, 26.8, 38.4 and 40.6. The worst is 40.6, so the limit is 44.7. Run 3 had an A/A band of 0.71
 *   to 0.99, so its 26.8 is noise.
 */
export const CORE_LIMITS = {
  nearest: { limit: 23.4 },
  life: { limit: 44.7 },
} as const satisfies Readonly<Record<string, CoreLimits>>;

/** The name of a case of the core gate. */
export type CoreCase = keyof typeof CORE_LIMITS;

/** The read of one case of the core gate: the facts of its decision at full precision. */
export interface CoreRead {
  readonly case: CoreCase;
  /** The median ratio of the rounds: the time of Vex divided by the time of the loops. Lower is better. */
  readonly ratio: number;
  /** The A/A statistics of the rounds, as `aaStats` gives them, or `null` when the run has no A/A rounds. */
  readonly aa: CaseAaStat | null;
  /** The bound of `limitVerdict` with the A/A noise of the rounds, or `null` when the verdict has no case. It is a record. */
  readonly bound: number | null;
  readonly limits: CoreLimits;
}

/**
 * This function gives the reason that a case cannot decide, or `undefined` when the case can decide. `c` is the case of
 * `limitVerdict` with the option `noiseCap` of `limits`. A case without a noise cap can always decide.
 */
export function noiseReason(c: CaseLimit | undefined, limits: CoreLimits): string | undefined {
  if (c === undefined) return "the limit verdict has no case";
  const check = c.noiseCheck;
  if (limits.noiseCap === undefined || check === undefined) return undefined;
  if (check.spread === undefined) return "the run has no A/A rounds";
  if (!check.noisy && !check.biased) return undefined;
  return `the A/A rounds are out of the noise cap ${String(limits.noiseCap)}: spread ${check.spread.toFixed(4)}, median ratio ${check.aaMedian?.toFixed(4) ?? "none"}`;
}

/** This function gives the read line of one read: `read ` and the read as JSON. */
export function coreReadLine(read: CoreRead): string {
  return `read ${JSON.stringify(read)}`;
}

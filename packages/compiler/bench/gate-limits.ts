/**
 * The limits of the speed gate of the compiler (`gate.ts`). This module has no side effects, so a test can read the limits.
 *
 * The limits come from the CI jobs of `gate-processes.ts` in `limit-jobs.json`. These are 20 jobs of 2026-11-18 on
 * Node.js 26.13.1, all with the fresh process of each case (vex#409). `gate-limits.test.ts` gives the table again from
 * these jobs with `processNoiseCap` and `processLimits` of rigor-bench. Thus the table and its jobs stay the same.
 *
 * - A CPU model with 5 jobs or more has its own limits: the AMD EPYC 7763, 9V45 and 9V74. `other` has the limits of all
 *   20 jobs, so it also serves the Intel Xeon 6975P-C, 8370C and 8573C.
 * - The noise cap is the cap of `processNoiseCap` when its decide rate is 0.95 or more. Else the entry has no cap.
 * - (a) The limit is the worst job median plus the spread of the job medians, rounded up to 2 decimals.
 * - (b) `maxSlow` is the smallest count L with P(Binomial(11, p) > L) under 1 %. Here p is the upper Wilson end (95 %) of
 *   the rate of reads above the limit.
 * - `walk` has the limit 1 and no jobs: the fix must not cost time. Its check (b) is a record only.
 *
 * The 12 jobs from 15:10 have read lines at full precision. The 8 earlier jobs have text lines with 2 decimals. With 5
 * or 6 jobs for each model, some values of `maxSlow` are 5 or more, so their check (b) adds nothing to check (a). More
 * jobs make the Wilson interval narrower. To add jobs, add their reads to `limit-jobs.json` and change the table until
 * the test passes. A PR that makes a ratio better adds its jobs in the same PR.
 */
import type { ProcessLimits } from "@mark1russell7/rigor-bench";

/** The limits of each case for each CPU model. The entry `other` serves each CPU model with no entry of its own. */
export const LIMITS = {
  nearest: {
    "7763": { limit: 1.67, slow: 1.67, maxSlow: 5 },
    "9V45": { limit: 1.52, slow: 1.52, maxSlow: 4, noiseCap: 0.0559 },
    "9V74": { limit: 1.64, slow: 1.64, maxSlow: 5, noiseCap: 0.0462 },
    other: { limit: 1.94, slow: 1.94, maxSlow: 2, noiseCap: 0.0513 },
  },
  life: {
    "7763": { limit: 1.25, slow: 1.25, maxSlow: 3 },
    "9V45": { limit: 1.29, slow: 1.29, maxSlow: 3, noiseCap: 0.061 },
    "9V74": { limit: 1.2, slow: 1.2, maxSlow: 4, noiseCap: 0.0508 },
    other: { limit: 1.37, slow: 1.37, maxSlow: 2, noiseCap: 0.0579 },
  },
  linked: {
    "7763": { limit: 1.75, slow: 1.75, maxSlow: 4, noiseCap: 0.0733 },
    "9V45": { limit: 1.73, slow: 1.73, maxSlow: 3, noiseCap: 0.0835 },
    "9V74": { limit: 1.88, slow: 1.88, maxSlow: 3 },
    other: { limit: 1.91, slow: 1.91, maxSlow: 2, noiseCap: 0.0944 },
  },
  nested: {
    "7763": { limit: 1.79, slow: 1.79, maxSlow: 7, noiseCap: 0.0929 },
    "9V45": { limit: 1.75, slow: 1.75, maxSlow: 4, noiseCap: 0.147 },
    "9V74": { limit: 1.85, slow: 1.85, maxSlow: 4, noiseCap: 0.1288 },
    other: { limit: 1.99, slow: 1.99, maxSlow: 2, noiseCap: 0.1061 },
  },
  tree: {
    "7763": { limit: 0.58, slow: 0.58, maxSlow: 4, noiseCap: 0.1166 },
    "9V45": { limit: 0.61, slow: 0.61, maxSlow: 3, noiseCap: 0.1138 },
    "9V74": { limit: 0.6, slow: 0.6, maxSlow: 3, noiseCap: 0.105 },
    other: { limit: 0.68, slow: 0.68, maxSlow: 2, noiseCap: 0.1054 },
  },
  shapes: {
    "7763": { limit: 1.67, slow: 1.67, maxSlow: 7, noiseCap: 0.6529 },
    "9V45": { limit: 1.68, slow: 1.68, maxSlow: 5, noiseCap: 0.2605 },
    "9V74": { limit: 1.92, slow: 1.92, maxSlow: 3 },
    other: { limit: 1.92, slow: 1.92, maxSlow: 2, noiseCap: 0.5378 },
  },
  share: {
    "7763": { limit: 2.02, slow: 2.02, maxSlow: 6 },
    "9V45": { limit: 2.03, slow: 2.03, maxSlow: 5, noiseCap: 0.1113 },
    "9V74": { limit: 2.01, slow: 2.01, maxSlow: 5, noiseCap: 0.0431 },
    other: { limit: 2.11, slow: 2.11, maxSlow: 3, noiseCap: 0.0409 },
  },
  walk: { other: { limit: 1, slow: 1 } },
} as const satisfies Readonly<Record<string, Readonly<Record<string, ProcessLimits>> & { readonly other: ProcessLimits }>>;

/** The name of a case of the limits. */
export type LimitCase = keyof typeof LIMITS;

/** The cases with no jobs. Their limits are a rule, not a derivation. */
export const RULE_CASES: readonly LimitCase[] = ["walk"];

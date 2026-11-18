/**
 * The paired time of two functions in one process, on `timeArmRounds` of `@mark1russell7/rigor-bench`, the home of the
 * bench harness. In each round, the base `b`, the candidate `a` and a copy of the base (the A/A pair) take turns in the
 * order of `armOrder`. The A/A pair gives the noise floor.
 */
import { timeArmRounds, type ArmRounds, type PairedTime, type ProcessArm } from "@mark1russell7/rigor-bench";
import { median, quantile } from "@mark1russell7/rigor-statistics";

/** The result of a comparison of two functions: the median ratio of `a` over `b`, and the time of one call in µs. */
export interface Paired {
  readonly ratio: number;
  readonly a: number;
  readonly b: number;
  /** The 10th and the 90th percentile of the A/A ratios of the rounds. */
  readonly noise: { readonly p10: number; readonly p90: number };
  /** The records of the rounds: arm `a` of each record is the base `b`, and arm `b` is the candidate `a`. */
  readonly pairs: readonly PairedTime[];
  /** The A/A records of the rounds: the base against its copy. */
  readonly aa: readonly PairedTime[];
  /** The records of `timeArmRounds`: the pairs `a` and `b~aa`, and the order and span of each timed batch. They also keep the count of calls in one batch. */
  readonly rounds: ArmRounds;
}

/** The options of `paired`. */
export interface PairedOptions {
  /** The count of the rounds. The default is 16. */
  readonly repeats?: number;
  /** The least time in ms of one batch of the base `b`. The count of calls in a batch is a power of 2. The default is 10. */
  readonly targetMs?: number;
  /** The time in ms of the warm-up of the arms, before the count of calls grows. The default is 2 times `targetMs`. */
  readonly warmMs?: number;
  /** The clock in ms, for tests. The default is `performance.now`. */
  readonly now?: () => number;
}

/**
 * This function gives an arm of `timeArmRounds` for the function `f`. Its number is 0. The functions of the gates give
 * no number, and the old batches kept no result. A number from each result changes the measured work, so it needs new limits.
 */
function arm(id: string, f: () => void): ProcessArm {
  return {
    id,
    run: (): number => {
      f();
      return 0;
    },
  };
}

/**
 * This function gives the least time of one batch of the base for a gate with the limit `limit`. The old harness filled
 * `slowMs` with the slower arm, and `timeArmRounds` fills the target with the base. The limit is the largest expected
 * ratio, so a batch of the slower arm takes about `slowMs` or more, as before.
 */
export function batchMs(slowMs: number, limit: number): number {
  return slowMs / Math.max(1, limit);
}

/**
 * This function compares `a` with the base `b` in one process, with the A/A pair. The ratio is the time of `a` divided
 * by the time of `b`: lower is faster. A batch of `b` takes from `targetMs` to 2 times `targetMs`, and the batch of `a`
 * has the same count of calls. Each arm has one untimed batch right before its timed batch, in each round.
 */
export function paired(a: () => void, b: () => void, options: PairedOptions = {}): Paired {
  const { repeats = 16, targetMs = 10, now } = options;
  const rounds = timeArmRounds({
    case: "one",
    base: arm("b", b),
    candidates: [arm("a", a)],
    rounds: repeats,
    aa: true,
    targetMs,
    warmMs: options.warmMs ?? 2 * targetMs,
    warmBatches: 1,
    ...(now === undefined ? {} : { now }),
  });
  const pairs = rounds.pairs["a"] ?? [];
  const aaPairs = rounds.pairs["b~aa"] ?? [];
  const aa = aaPairs.map((p) => p.b / p.a);
  const perCall = (ms: readonly number[]): number => (median(ms) * 1000) / rounds.count;
  return {
    // The ratio of each round, with the base of the same round, keeps a change of the speed of the machine out.
    ratio: median(pairs.map((p) => p.b / p.a)),
    a: perCall(pairs.map((p) => p.b)),
    b: perCall(pairs.map((p) => p.a)),
    noise: { p10: quantile(aa, 0.1), p90: quantile(aa, 0.9) },
    pairs,
    aa: aaPairs,
    rounds,
  };
}

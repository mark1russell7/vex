/**
 * The speed gate (docs/QUALITY-PLAN.md §8, phase C). For each program, the gate measures the time of Vex and the time
 * of the hand-written loops on the same machine, and checks the ratio against a limit. A ratio does not depend much on
 * the speed of the machine, so the gate works on a shared CI runner. The arms take turns in one process (paired.ts, on
 * `timeArmRounds` of rigor-bench).
 *
 * The limits and the noise caps are in `gate-limits.ts`. A case with a noise cap checks the A/A rounds first, with the
 * option `noiseCap` of `limitVerdict`. A noisy or biased run cannot decide: the gate shows "no read" and fails.
 * A PR that makes a ratio better sets its limit lower in the same PR.
 *
 * Each case also prints one read line as JSON, at full precision. It holds the ratio, the A/A statistics of `aaStats`,
 * the bound of `limitVerdict` and the limits. The limits and the noise caps come from these lines.
 * Start: node packages/core/bench/gate.ts
 */
import { aaStats, limitVerdict } from "@mark1russell7/rigor-bench";
import { withFault } from "./fault.ts";
import { CORE_LIMITS, coreReadLine, noiseReason, type CoreCase, type CoreLimits } from "./gate-limits.ts";
import { envLine } from "./measure.ts";
import { batchMs, paired } from "./paired.ts";
import { LIFE, NEAREST } from "./programs.ts";

const PROGRAMS = { nearest: NEAREST, life: LIFE } as const satisfies Record<CoreCase, unknown>;

/** This function tells if a name is a case of the core gate. */
const isCase = (name: string): name is CoreCase => Object.hasOwn(CORE_LIMITS, name);

console.info(envLine("process"));
let failed = false;
for (const name of Object.keys(CORE_LIMITS).filter(isCase)) {
  const program = PROGRAMS[name];
  const limits: CoreLimits = CORE_LIMITS[name];
  const { limit, noiseCap } = limits;
  // The arms take turns in this process in the order of armOrder, and a copy of the loops gives the noise floor (paired.ts).
  const { ratio, a: v, b: h, noise, pairs, aa } = paired(withFault(program.vex), program.hand, { targetMs: batchMs(60, limit) });
  const c = limitVerdict(pairs, aa, { limit, aaFrom: "rounds", ...(noiseCap === undefined ? {} : { noiseCap }) }).cases[0];
  const stat = aaStats(aa)[0];
  const reason = noiseReason(c, limits);
  const head = reason === undefined ? (ratio <= limit ? "ok  " : "FAIL") : "no read";
  failed ||= head !== "ok  ";
  const cap = noiseCap === undefined ? "no noise cap" : `noise cap ${String(noiseCap)}`;
  const record = `bound ${c?.bound.toFixed(2) ?? "none"}, A/A spread ${stat?.spread.toFixed(3) ?? "none"}`;
  const why = reason === undefined ? "" : `, cannot decide: ${reason}`;
  console.info(
    `${head} ${program.title}: vex ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, Vex/hand time ${ratio.toFixed(1)} (lower is better, limit ${String(limit)}, ${cap}), A/A noise ${noise.p10.toFixed(3)} to ${noise.p90.toFixed(3)}, a record: ${record}${why}`,
  );
  console.info(coreReadLine({ case: name, ratio, aa: stat ?? null, bound: c?.bound ?? null, limits }));
}
process.exit(failed ? 1 : 0);

/**
 * The speed gate (docs/QUALITY-PLAN.md §8, phase C). For each program, the gate measures the time of Vex and the time
 * of the hand-written loops on the same machine, and checks the ratio against a limit. A ratio does not depend much on
 * the speed of the machine, so the gate works on a shared CI runner. The arms take turns in one process (paired.ts, on
 * `timeArmRounds` of rigor-bench).
 *
 * Each limit is the worst ratio of 5 CI runs times 1.1 (a rule of 2026-10-30), rounded up. The runs are
 * run 41022173204 of speed-gate.yml (2026-10-30): AMD EPYC 7763 in runs 2 to 4, AMD EPYC 9V45 in runs 1 and 5.
 * - NEAREST: 17.4, 21.0, 20.9, 21.2 and 16.6. The worst is 21.2, so the limit is 23.4. The 9V45 gives about 17.
 * - LIFE: 38.6, 38.0, 26.8, 38.4 and 40.6. The worst is 40.6, so the limit is 44.7. Run 3 had an A/A band of 0.71
 *   to 0.99, so its 26.8 is noise.
 * A PR that makes a ratio better sets its limit lower in the same PR.
 *
 * Each line also gives a record for the next limits: the bound of `limitVerdict` with the A/A noise of the rounds, and
 * the A/A spread of `aaStats`, both of rigor-bench. The next limits and noise caps come from 5 or more CI runs of these
 * records. Until then, the gate decides with the ratio and the limit, as before.
 * Start: node packages/core/bench/gate.ts
 */
import { aaStats, limitVerdict } from "@mark1russell7/rigor-bench";
import { withFault } from "./fault.ts";
import { envLine } from "./measure.ts";
import { batchMs, paired } from "./paired.ts";
import { LIFE, NEAREST } from "./programs.ts";

const LIMITS = [
  { program: NEAREST, limit: 23.4 },
  { program: LIFE, limit: 44.7 },
] as const;

console.info(envLine("process"));
let failed = false;
for (const { program, limit } of LIMITS) {
  // The arms take turns in this process in the order of armOrder, and a copy of the loops gives the noise floor (paired.ts).
  const { ratio, a: v, b: h, noise, pairs, aa } = paired(withFault(program.vex), program.hand, { targetMs: batchMs(60, limit) });
  const ok = ratio <= limit;
  failed ||= !ok;
  const bound = limitVerdict(pairs, aa, { limit, aaFrom: "rounds" }).cases[0]?.bound;
  const spread = aaStats(aa)[0]?.spread;
  const record = `bound ${bound?.toFixed(2) ?? "none"}, A/A spread ${spread?.toFixed(3) ?? "none"}`;
  console.info(`${ok ? "ok  " : "FAIL"} ${program.title}: vex ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, Vex/hand time ${ratio.toFixed(1)} (lower is better, limit ${limit}), A/A noise ${noise.p10.toFixed(3)} to ${noise.p90.toFixed(3)}, a record: ${record}`);
}
process.exit(failed ? 1 : 0);

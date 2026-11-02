/**
 * The speed gate (docs/QUALITY-PLAN.md §8, phase C). For each program, the gate measures the time of Vex and the time
 * of the hand-written loops on the same machine, and checks the ratio against a limit. A ratio does not depend much on
 * the speed of the machine, so the gate works on a shared CI runner. The arms alternate in one process (measure.ts).
 *
 * Each limit is the worst ratio of 5 CI runs plus their spread (the largest minus the smallest), rounded up. This is
 * the fleet rule of 2026-11-02. The runs are run 41022173204 of speed-gate.yml (2026-10-30): AMD EPYC 7763 in runs 2
 * to 4, AMD EPYC 9V45 in runs 1 and 5.
 * - NEAREST: 17.4, 21.0, 20.9, 21.2 and 16.6. The limit is 21.2 + (21.2 - 16.6) = 25.8. The spread comes from the
 *   CPU: the 9V45 gives about 17 (GATEPERCPU).
 * - LIFE: 38.6, 38.0, 26.8, 38.4 and 40.6. The limit is 40.6 + (40.6 - 26.8) = 54.4. Run 3 had an A/A band of 0.71
 *   to 0.99, so its 26.8 is a fault of the measure, and GATENOISE examines it.
 * A PR that makes a ratio better sets its limit lower in the same PR.
 * Start: node packages/core/bench/gate.ts
 */
import { envLine, paired } from "./measure.ts";
import { LIFE, NEAREST } from "./programs.ts";

const LIMITS = [
  { program: NEAREST, limit: 25.8 },
  { program: LIFE, limit: 54.4 },
] as const;

console.info(envLine("process"));
let failed = false;
for (const { program, limit } of LIMITS) {
  // The arms alternate in this process, with the order reversed in odd rounds, and a copy of the loops gives the noise floor (measure.ts).
  const { ratio, a: v, b: h, noise } = paired(program.vex, program.hand, { ms: 60 });
  const ok = ratio <= limit;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${program.title}: vex ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, Vex/hand time ${ratio.toFixed(1)} (lower is better, limit ${limit}), A/A noise ${noise.p10.toFixed(2)} to ${noise.p90.toFixed(2)}`);
}
process.exit(failed ? 1 : 0);

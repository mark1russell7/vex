/**
 * The speed gate (docs/QUALITY-PLAN.md §8, phase C). For each program, the gate measures the time of Vex and the time
 * of the hand-written loops on the same machine, and checks the ratio against a limit. A ratio does not depend much on
 * the speed of the machine, so the gate works on a shared CI runner. The limits are about twice the ratios that the
 * work measured on 2026-10-08 (17 and 36), so only a real loss of speed fails the gate.
 * The ratios above came from runs with a fixed order of the arms and no record of the CPU. By the rule of the fleet of
 * 2026-10-30, they are void as claims. The limits stay. Since that day, the arms alternate with a swapped order, and
 * each run prints its CPU and its mode (measure.ts).
 * Start: node packages/core/bench/gate.ts
 */
import { paired, runnerLine } from "./measure.ts";
import { LIFE, NEAREST } from "./programs.ts";

const LIMITS = [
  { program: NEAREST, limit: 35 },
  { program: LIFE, limit: 75 },
] as const;

console.info(runnerLine());
let failed = false;
for (const { program, limit } of LIMITS) {
  // The arms alternate in this process, with the order swapped at each pair (measure.ts).
  const { ratio, a: v, b: h } = paired(program.vex, program.hand, { ms: 60 });
  const ok = ratio <= limit;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${program.title}: vex ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, Vex/hand time ${ratio.toFixed(1)} (lower is better, limit ${limit})`);
}
process.exit(failed ? 1 : 0);

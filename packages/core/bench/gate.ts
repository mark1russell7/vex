/**
 * The speed gate (docs/QUALITY-PLAN.md §8, phase C). For each program, the gate measures the time of Vex and the time
 * of the hand-written loops on the same machine, and checks the ratio against a limit. A ratio does not depend much on
 * the speed of the machine, so the gate works on a shared CI runner. The limits are about twice the ratios that the
 * work measured on 2026-10-08 (17 and 36), so only a real loss of speed fails the gate.
 * Start: node packages/core/bench/gate.ts
 */
import { LIFE, NEAREST } from "./programs.ts";

/** This function gives the median time of one call of `f`, in microseconds. */
function time(f: () => void): number {
  for (let i = 0; i < 20; i++) f();
  const samples: number[] = [];
  for (let s = 0; s < 9; s++) {
    let calls = 0;
    const start = performance.now();
    while (performance.now() - start < 60) {
      f();
      calls++;
    }
    samples.push(((performance.now() - start) * 1000) / calls);
  }
  samples.sort((a, b) => a - b);
  return samples[4] ?? Number.NaN;
}

const LIMITS = [
  { program: NEAREST, limit: 35 },
  { program: LIFE, limit: 75 },
] as const;

let failed = false;
for (const { program, limit } of LIMITS) {
  const v = time(program.vex);
  const h = time(program.hand);
  const ratio = v / h;
  const ok = ratio <= limit;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${program.title}: vex ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, ratio ${ratio.toFixed(1)} (limit ${limit})`);
}
process.exit(failed ? 1 : 0);

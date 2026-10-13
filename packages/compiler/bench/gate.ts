/**
 * The speed gate of the compiler (docs/COMPILER.md §10). For each program of the speed lane of the core, the gate
 * measures the generated code (tier 2) and the hand-written loops on the same machine, and checks the ratio against a
 * limit. The gate also checks that tier 2 gave each result, with no fallback.
 *
 * On 2026-10-13, phase C1 measured the ratios 2.3 (NEAREST) and 1.6 (LIFE). Tier 1 measured 80 and 120. As in the gate
 * of the core, each limit is about twice the measured ratio, so only a real loss of speed fails the gate. Phase C2
 * sets the limit 1.2 (§12).
 * Start: node packages/compiler/bench/gate.ts
 */
import type { Space } from "@mark1russell7/vex";
import { LIFE, NEAREST } from "../../core/bench/programs.ts";
import { PtDomain } from "../../core/src/test-support.ts";
import { tiered } from "../src/index.ts";

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

/** This function gives a run of a program at each key of a space, in tier 2. */
function atEachKey(program: { readonly program: Parameters<typeof tiered>[0] }, space: Space): { readonly run: () => void; readonly tier: 1 | 2; readonly fallbacks: () => number } {
  const p = tiered(program.program, { domains: [PtDomain] });
  return {
    run: (): void => {
      for (const origin of space.keys) p.run({ space, origin });
    },
    tier: p.tier,
    fallbacks: () => p.stats.fallbacks,
  };
}

const CASES = [
  { title: NEAREST.title, compiled: atEachKey(NEAREST.chain, NEAREST.root.space), hand: NEAREST.hand, limit: 5 },
  { title: LIFE.title, compiled: atEachKey(LIFE.chain, LIFE.root.space), hand: LIFE.hand, limit: 3.5 },
] as const;

let failed = false;
for (const { title, compiled, hand, limit } of CASES) {
  const v = time(compiled.run);
  const h = time(hand);
  const ratio = v / h;
  const ok = ratio <= limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, ratio ${ratio.toFixed(2)} (limit ${limit})`);
}
process.exit(failed ? 1 : 0);

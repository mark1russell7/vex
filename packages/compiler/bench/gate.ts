/**
 * The speed gate of the compiler (docs/COMPILER.md §10). For each program of the speed lane of the core, the gate
 * measures the generated code (tier 2) and the hand-written loops on the same machine, and checks the ratio against a
 * limit. The gate also checks that tier 2 gave each result, with no fallback.
 *
 * Phase C2 measured the median ratios 1.1 (NEAREST) and 1.05 (LIFE) on 2026-10-13. Phase C1 measured 2.3 and 1.6, and
 * tier 1 measured 80 and 120. The limit 1.5 keeps a margin for a busy runner, and a loss of the fast paths of the sites
 * fails it.
 * Start: node packages/compiler/bench/gate.ts
 */
import type { Space } from "@mark1russell7/vex";
import { LIFE, NEAREST } from "../../core/bench/programs.ts";
import { PtDomain } from "../../core/src/test-support.ts";
import { tiered } from "../src/index.ts";

/** This function gives the time of one call of `f` in one sample of 30 ms, in microseconds. */
function sample(f: () => void): number {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < 30) {
    f();
    calls++;
  }
  return ((performance.now() - start) * 1000) / calls;
}

/** This function gives the median of a list of numbers. */
function median(xs: readonly number[]): number {
  const mid = Math.floor(xs.length / 2);
  return xs.find((x) => xs.filter((y) => y < x).length <= mid && xs.filter((y) => y <= x).length > mid) ?? Number.NaN;
}

/**
 * This function gives the median ratio of the times of `v` and `h`, and the median times. The samples alternate, so a
 * change of the speed of the machine changes both times of a pair.
 */
function compare(v: () => void, h: () => void): { readonly ratio: number; readonly v: number; readonly h: number } {
  for (let i = 0; i < 20; i++) {
    v();
    h();
  }
  const pairs = Array.from({ length: 15 }, () => {
    const tv = sample(v);
    const th = sample(h);
    return { ratio: tv / th, v: tv, h: th };
  });
  return { ratio: median(pairs.map((p) => p.ratio)), v: median(pairs.map((p) => p.v)), h: median(pairs.map((p) => p.h)) };
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
  { title: NEAREST.title, compiled: atEachKey(NEAREST.chain, NEAREST.root.space), hand: NEAREST.hand, limit: 1.5 },
  { title: LIFE.title, compiled: atEachKey(LIFE.chain, LIFE.root.space), hand: LIFE.hand, limit: 1.5 },
] as const;

let failed = false;
for (const { title, compiled, hand, limit } of CASES) {
  const { ratio, v, h } = compare(compiled.run, hand);
  const ok = ratio <= limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, ratio ${ratio.toFixed(2)} (limit ${limit})`);
}
process.exit(failed ? 1 : 0);

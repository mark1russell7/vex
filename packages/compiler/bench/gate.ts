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
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialArrange, radialRun, type RadialInput } from "../../pilots/src/ireko-radial.ts";
import { app, axes, each, ref, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { emitModule, tiered } from "../src/index.ts";

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
function atEachKey(program: { readonly program: Parameters<typeof tiered>[0] }, s: Space, domains: Parameters<typeof tiered>[1] = { domains: [PtDomain] }): { readonly run: () => void; readonly tier: 1 | 2; readonly fallbacks: () => number } {
  const p = tiered(program.program, domains);
  return {
    run: (): void => {
      for (const origin of s.keys) p.run({ space: s, origin });
    },
    tier: p.tier,
    fallbacks: () => p.stats.fallbacks,
  };
}

// The share of each value in the total (§7.2). The interpreter computes the total at each key, so its cost is O(n²).
// Tier 2 computes the total once for each space, so the run at each of 1000 keys costs twice the run at each of 500.
const share = (n: number): ReturnType<typeof atEachKey> =>
  atEachKey({ program: app("divide", ref("x"), app("sum", each(axes.all, ref("x")))) }, space.array(Array.from({ length: n }, (_, i) => ({ x: (i % 7) + 1 }))), { domains: [NumDomain] });
const [small, large] = [share(500), share(1000)];

// The strategy radial of ireko as a standalone module (§13.3), against the copy of the code of ireko in the pilot. A full
// ring of children of mixed sizes needs the search of the radius, with the test of all pairs at each step. V-054 made
// this module two times slower in the engine benchmark of ireko. The limit 4 catches such a loss of its columns.
const radialModule = ((): ((records: unknown, vars: unknown) => unknown) => {
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const load = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn radial;`) as () => (records: unknown, vars: unknown) => unknown;
  return load();
})();
const ringOf = (n: number, mode: "nested" | "linked"): RadialInput => ({
  mode,
  self: { width: 40, height: 30 },
  gap: 8,
  options: { startAngle: -90, sweep: 360, clockwise: true, distance: 0 },
  children: Array.from({ length: n }, (_, i) => {
    const width = 10 + ((i * 37) % 90);
    const height = 10 + ((i * 53) % 70);
    return { box: { width, height }, extent: { x: 0, y: 0, width, height } };
  }),
});
const radialCase = (n: number, mode: "nested" | "linked"): { readonly title: string; readonly compiled: { readonly run: () => void; readonly tier: 2; readonly fallbacks: () => number }; readonly hand: () => void; readonly limit: number } => {
  const input = ringOf(n, mode);
  const { space: s, vars } = radialRun(input);
  return { title: `the radial module of ireko, a full ring of ${String(n)} children, ${mode}`, compiled: { run: () => radialModule(s.records, vars), tier: 2, fallbacks: () => 0 }, hand: () => radialArrange(input), limit: 4 };
};

const CASES = [
  { title: NEAREST.title, compiled: atEachKey(NEAREST.chain, NEAREST.root.space), hand: NEAREST.hand, limit: 1.5 },
  { title: LIFE.title, compiled: atEachKey(LIFE.chain, LIFE.root.space), hand: LIFE.hand, limit: 1.5 },
  radialCase(12, "linked"),
  radialCase(60, "nested"),
] as const;

let failed = false;
for (const { title, compiled, hand, limit } of CASES) {
  const { ratio, v, h } = compare(compiled.run, hand);
  const ok = ratio <= limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, ratio ${ratio.toFixed(2)} (limit ${limit})`);
}
{
  // The limit 2.6 is between the growth of O(n), 2, and the growth of O(n²), 4.
  const { ratio, v, h } = compare(large.run, small.run);
  const ok = ratio <= 2.6 && large.tier === 2 && large.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} the share of each value in the total: tier ${large.tier}, ${large.fallbacks()} fallbacks, 1000 values ${v.toFixed(1)} µs, 500 values ${h.toFixed(1)} µs, growth ${ratio.toFixed(2)} (limit 2.6)`);
}
process.exit(failed ? 1 : 0);

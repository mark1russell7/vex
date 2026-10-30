/**
 * The speed gate of the compiler (docs/COMPILER.md §10). For each program of the speed lane of the core, the gate
 * measures the generated code (tier 2) and the hand-written loops on the same machine, and checks the ratio against a
 * limit. The gate also checks that tier 2 gave each result, with no fallback.
 *
 * Phase C2 measured the median ratios 1.1 (NEAREST) and 1.05 (LIFE) on 2026-10-13, on a local machine. Phase C1
 * measured 2.3 and 1.6, and tier 1 measured 80 and 120. The runners of CI measure 1.5 to 1.66 (NEAREST) and 1.2 to 1.3
 * (LIFE) since 2026-10-14. The limit 2 for NEAREST and 1.5 for LIFE keep a margin for a busy runner, and a loss of the
 * fast paths of the sites fails them.
 * The ratios above came from runs with a fixed order of the arms and no record of the CPU. By the rule of the fleet of
 * 2026-10-30, they are void as claims. The limits stay. Since that day, the arms alternate with a swapped order, and
 * each run prints its CPU and its mode (measure.ts).
 * Start: node packages/compiler/bench/gate.ts
 */
import type { Space } from "@mark1russell7/vex";
import { LIFE, NEAREST } from "../../core/bench/programs.ts";
import { PtDomain } from "../../core/src/test-support.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialArrange, radialRun, type RadialInput } from "../../pilots/src/ireko-radial.ts";
import { MAX_BANDS, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA, shapesTree, type ShapeRecord } from "../../pilots/src/ireko-shapes.ts";
import { app, axes, each, rec, ref, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { emitModule, emitSheetModule, tiered } from "../src/index.ts";
import { paired, runnerLine } from "../../core/bench/measure.ts";

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

// A tree space as a standalone module (COMPILE.MODULE.TREE), against hand-written loops. At each node, the program gives
// the cost of its team, the sum over its descendants (EXAMPLE.TREE), and its depth, the count of its ancestors.
const TEAM = rec({ team: app("add", ref("w"), app("sum", each(axes.descendants, ref("w")))), depth: app("count", each(axes.ancestors, ref("w"))) });
type TreeRun = (records: unknown, vars: unknown, parents: unknown) => unknown;
const teamModule = ((): TreeRun => {
  const m = emitModule(TEAM, { domains: [NumDomain], schema: { fields: { w: "number" } }, space: "tree", name: "team" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const load = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn team;`) as () => TreeRun;
  return load();
})();

/** This function gives the cost of the team and the depth of each node, with loops: a walk with a stack, and a walk up. */
function teamHand(records: readonly { readonly w: number }[], parents: readonly number[]): readonly { readonly team: number; readonly depth: number }[] {
  const children: number[][] = records.map(() => []);
  parents.forEach((p, i) => children[p]?.push(i));
  return records.map((r, i) => {
    // The descendants depth first, as the axis gives them, so the sum has the bits of the module.
    let sum = 0;
    const none: readonly number[] = [];
    const stack: number[] = [];
    const push = (keys: readonly number[]): void => {
      for (let q = keys.length - 1; q >= 0; q--) stack.push(keys[q] ?? 0);
    };
    push(children[i] ?? none);
    for (let k: number | undefined = stack.pop(); k !== undefined; k = stack.pop()) {
      sum += records[k]?.w ?? 0;
      push(children[k] ?? none);
    }
    let depth = 0;
    for (let p = parents[i] ?? -1; p >= 0; p = parents[p] ?? -1) depth++;
    return { team: r.w + sum, depth };
  });
}

const treeCase = (n: number): { readonly title: string; readonly compiled: { readonly run: () => void; readonly tier: 2; readonly fallbacks: () => number }; readonly hand: () => void; readonly limit: number } => {
  // Each node has at most three children, so the depth is near log3(n).
  const records = Array.from({ length: n }, (_, i) => ({ w: (i * 37) % 11 }));
  const parents = records.map((_r, i) => (i === 0 ? -1 : Math.floor((i - 1) / 3)));
  return { title: `a tree module, the team and the depth of each of ${String(n)} nodes`, compiled: { run: () => teamModule(records, {}, parents), tier: 2, fallbacks: () => 0 }, hand: () => teamHand(records, parents), limit: 3 };
};

// The shapes pass of ireko as a module of a sheet, against the hand code of the pilot (COMPILE-FUSE, COMPILER.md §7.6).
// The module has the option fuse, so each step of the fusion shows its gain in this case.
const shapesModule = ((): TreeRun => {
  const m = emitSheetModule(SHAPE_COLUMNS, { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf", fuse: true });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
  const load = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn shapesOf;`) as () => TreeRun;
  return load();
})();

const shapesCase = (branch: number, depth: number): { readonly title: string; readonly compiled: { readonly run: () => void; readonly tier: 2; readonly fallbacks: () => number }; readonly hand: () => void; readonly limit: number } => {
  // A root and `depth` levels of `branch` children. Each node wants its shape, and each mode is linked.
  const n = Array.from({ length: depth + 1 }, (_, d) => branch ** d).reduce((a, b) => a + b, 0);
  const records = Array.from({ length: n }, (_, i): ShapeRecord => {
    const w = 10 + ((i * 37) % 90);
    const h = 10 + ((i * 53) % 70);
    return { p: i === 0 ? -1 : Math.floor((i - 1) / branch), wants: true, linked: true, w, h, ox: (i % branch) * 12, oy: 20 + (i % 7), ex: 0, ey: 0, ew: w, eh: h };
  });
  const parents = records.map((r) => r.p);
  const vars = { limit: MAX_BANDS };
  return { title: `the shapes module of ireko, a tree of ${String(n)} nodes`, compiled: { run: () => shapesModule(records, vars, parents), tier: 2, fallbacks: () => 0 }, hand: () => shapesTree(records, MAX_BANDS), limit: 6 };
};

const CASES = [
  { title: NEAREST.title, compiled: atEachKey(NEAREST.chain, NEAREST.root.space), hand: NEAREST.hand, limit: 2 },
  { title: LIFE.title, compiled: atEachKey(LIFE.chain, LIFE.root.space), hand: LIFE.hand, limit: 1.5 },
  radialCase(12, "linked"),
  radialCase(60, "nested"),
  treeCase(1000),
  shapesCase(10, 3),
] as const;

console.info(runnerLine());
let failed = false;
for (const { title, compiled, hand, limit } of CASES) {
  // The arms alternate in this process, with the order swapped at each pair (core/bench/measure.ts).
  const { ratio, a: v, b: h } = paired(compiled.run, hand);
  const ok = ratio <= limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, generated/loops time ${ratio.toFixed(2)} (lower is better, limit ${limit})`);
}
{
  // The limit 2.6 is between the growth of O(n), 2, and the growth of O(n²), 4.
  const { ratio, a: v, b: h } = paired(large.run, small.run);
  const ok = ratio <= 2.6 && large.tier === 2 && large.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} the share of each value in the total: tier ${large.tier}, ${large.fallbacks()} fallbacks, 1000 values ${v.toFixed(1)} µs, 500 values ${h.toFixed(1)} µs, growth ${ratio.toFixed(2)} (limit 2.6)`);
}
process.exit(failed ? 1 : 0);

/**
 * The speed gate of the compiler (docs/COMPILER.md §10). For each program of the speed lane of the core, the gate
 * measures the generated code (tier 2) and the hand-written loops on the same machine, and checks the ratio against a
 * limit. The gate also checks that tier 2 gave each result, with no fallback.
 *
 * The arms alternate in one process (core/bench/measure.ts). `gate-processes.ts` starts each case in 11 fresh processes
 * of its own and decides each case on them (core/bench/processes.ts):
 *
 * - (a) The median ratio of the processes is at most the limit.
 * - (b) The count of processes above the slow line (the limit) is at most the largest count.
 *
 * The limits come from 10 CI runs of `gate-processes.ts` (the fleet rule of 2026-11-02): run 41423717761 (reps A1 to A5)
 * and run 41425976485 (reps B1 to B5) of speed-gate.yml. The AMD EPYC 7763 had 5 runs (A1, A3, A5, B3, B5), so it has
 * its own limits. Each other model has the limits of all 10 runs. The 9V74 gave A2 and A4, the 9V45 gave B1 and B2, and
 * the Intel Xeon 8573C gave B4. Each value is the median of the 11 processes of one run.
 *
 * | Case | A1 to A5 | B1 to B5 | 7763 limit | Other limit |
 * |---|---|---|---|---|
 * | NEAREST | 1.65, 1.62, 1.64, 1.62, 1.64 | 1.50, 1.50, 1.64, 1.32, 1.67 | 1.70 | 2.02 |
 * | LIFE | 1.17, 1.15, 1.17, 1.14, 1.17 | 1.23, 1.23, 1.18, 1.14, 1.15 | 1.21 | 1.32 |
 * | radial, 12 children, linked | 3.19, 3.00, 3.14, 2.95, 3.16 | 2.75, 2.75, 3.11, 3.03, 3.29 | 3.34 (C) | 3.34 (C) |
 * | radial, 60 children, nested | 3.90, 3.86, 3.81, 3.84, 3.82 | 3.56, 3.55, 3.83, 3.42, 4.06 | 3.29 (C) | 3.29 (C) |
 * | tree, 1000 nodes | 1.00, 1.06, 0.98, 1.05, 0.99 | 1.05, 1.06, 0.99, 0.99, 1.02 | 1.06 | 1.14 |
 * | shapes, 1111 nodes | 1.63, 1.70, 1.58, 1.63, 1.58 | 1.63, 1.68, 1.61, 1.83, 1.59 | 1.68 | 1.74 (D) |
 * | the growth of the share of each value | 2.00, 2.00, 2.01, 2.00, 2.00 | 2.00, 2.00, 2.00, 2.01, 1.99 | 2.03 | 2.03 |
 *
 * (a) Each limit is the worst run median plus the spread of the run medians, rounded up (STRATEGY.md of the fleet).
 * (D) Run 41773861998 of speed-gate.yml (reps D1 to D5, on main at 62acda4, with the freeze rule of #228) gave the
 * shapes limit of the other models. The medians are 1.63 (9V45), 1.57 (9V74), 1.52, 1.56 and 1.62 (7763). The worst
 * median plus the spread is 1.63 + 0.11, so the limit is 1.74. The limit of the 7763 stays 1.68, because three runs do
 * not make a limit. These runs have no Xeon, and Xeon runners gave 1.83 on two models, so a Xeon keeps the old 2.08.
 * (b) The rate p is the upper Wilson end (95 %) of the rate of processes above the limit in the derivation runs. The
 * largest count L is the smallest count with P(Binomial(11, p) > L) under 1 %. For the 7763, L is 3 or 4, and (b) fails a
 * run with a slow rate of 0.5 in 73 % to 89 % of runs, and 21 % to 43 % at 0.3. For other models, L is 2: 97 % at 0.5, 69 % at 0.3.
 * For shapes and share, (b) is a record only: its power at a slow rate of 0.3 is 2 % or less. The limit (a) and the
 * nightly log protect them.
 *
 * In one process with all cases, the hand loops of the nested radial case were 35 % slower, and its ratio was 2.7, not
 * 3.85 (run 41420168361). Measured cases before a case change its heap and its JIT state (GATENOISE, run 41418095435).
 * (C) The scan of a fold over the targets before the origin (COMPILE.MODULE.SCAN, RADIALGAP) made both radial cases faster.
 * Their limits come from run 41455264352 (reps C1 to C5: 9V45, 9V45, 7763, 9V74, 9V74). Linked gave 2.58, 2.59, 2.90, 2.96
 * and 2.63. Nested gave 2.77, 2.77, 3.03, 2.97 and 2.96. These runs have one 7763 run only, so each model has the same
 * radial limits. L is 3 for both cases: 43 % at a slow rate of 0.3, 89 % at 0.5.
 * A PR that makes a ratio better sets its limit lower in the same PR.
 * With `GATE_GC=1`, each case also prints the garbage collections of each arm in its timed runs (gc.ts, GATEGC).
 * With `GATE_ALLOC`, the process gives the allocations of one arm and no time (alloc.ts, TREEALLOC).
 * With `GATE_LIMIT_WALK=1`, the walk of a data limit gives two more cases (limit-walk.ts, LIMITCOST). Their second arm is
 * the module with a count at each key, not hand-written loops. Their limit is 1: the fix must not cost time. Check (b)
 * is a record only. No pull request starts these cases.
 * Start: node packages/compiler/bench/gate.ts
 */
import type { Space } from "@mark1russell7/vex";
import { LIFE, NEAREST } from "../../core/bench/programs.ts";
import { PtDomain } from "../../core/src/test-support.ts";
import { radialArrange, radialRun } from "../../pilots/src/ireko-radial.ts";
import { handBoth, handPairs, handSum, loadRadial, ringOf } from "./ablation.ts";
import { countAtEachKey, loadWalk, walkRecords } from "./limit-walk.ts";
import { MAX_BANDS, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA, shapesTree, type ShapeRecord } from "../../pilots/src/ireko-shapes.ts";
import { app, axes, each, rec, ref, space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { tiered } from "../src/index.ts";
import { emitModule, emitSheetModule } from "../src/module.ts";
import { cpus } from "node:os";
import { withFault } from "../../core/bench/fault.ts";
import { envLine, paired } from "../../core/bench/measure.ts";
import { limitsFor, limitsText, type CaseLimits, type ModelLimits } from "../../core/bench/processes.ts";
import type { AllocArm, AllocRegime } from "./alloc.ts";
import { GC_ON, gcRecorder } from "./gc.ts";

/** The limits of each case, from the 10 runs in the header. A case with no `maxSlow` has check (b) as a record only. */
const LIMITS = {
  nearest: { "7763": { limit: 1.7, slow: 1.7, maxSlow: 4 }, other: { limit: 2.02, slow: 2.02, maxSlow: 2 } },
  life: { "7763": { limit: 1.21, slow: 1.21, maxSlow: 4 }, other: { limit: 1.32, slow: 1.32, maxSlow: 2 } },
  linked: { "7763": { limit: 3.34, slow: 3.34, maxSlow: 3 }, other: { limit: 3.34, slow: 3.34, maxSlow: 3 } },
  nested: { "7763": { limit: 3.29, slow: 3.29, maxSlow: 3 }, other: { limit: 3.29, slow: 3.29, maxSlow: 3 } },
  tree: { "7763": { limit: 1.06, slow: 1.06, maxSlow: 4 }, other: { limit: 1.14, slow: 1.14, maxSlow: 2 } },
  shapes: { "7763": { limit: 1.68, slow: 1.68 }, Xeon: { limit: 2.08, slow: 2.08 }, other: { limit: 1.74, slow: 1.74 } },
  share: { "7763": { limit: 2.03, slow: 2.03 }, other: { limit: 2.03, slow: 2.03 } },
  walk: { "7763": { limit: 1, slow: 1 }, other: { limit: 1, slow: 1 } },
} as const satisfies Readonly<Record<string, ModelLimits>>;
const CPU = cpus()[0]?.model ?? "";
/** This function gives the limits of a case for the CPU model of this runner. */
const limitsOf = (c: keyof typeof LIMITS): CaseLimits => limitsFor(LIMITS[c], CPU);
const SHARE = limitsOf("share");

/** This function gives a function that makes its value at the first call only, so a process makes only what its case needs. */
const once = <T>(make: () => T): (() => T) => {
  let made: { readonly value: T } | undefined;
  return () => (made ??= { value: make() }).value;
};

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
const shares = once(() => [share(500), share(1000)] as const);

// The strategy radial of ireko as a standalone module (§13.3), against the copy of the code of ireko in the pilot. A full
// ring of children of mixed sizes needs the search of the radius, with the test of all pairs at each step. V-054 made
// this module two times slower in the engine benchmark of ireko. The limits in the header catch such a loss.
const radialModule = once(() => loadRadial((source) => source));
const radialCase = (n: number, mode: "nested" | "linked"): { readonly title: string; readonly compiled: { readonly run: () => void; readonly tier: 2; readonly fallbacks: () => number }; readonly hand: () => void; readonly limits: CaseLimits } => {
  const input = ringOf(n, mode);
  const { space: s, vars } = radialRun(input);
  const radial = radialModule();
  return { title: `the radial module of ireko, a full ring of ${String(n)} children, ${mode}`, compiled: { run: () => radial(s.records, vars), tier: 2, fallbacks: () => 0 }, hand: () => radialArrange(input), limits: limitsOf(mode) };
};

// A tree space as a standalone module (COMPILE.MODULE.TREE), against hand-written loops. At each node, the program gives
// the cost of its team, the sum over its descendants (EXAMPLE.TREE), and its depth, the count of its ancestors.
const TEAM = rec({ team: app("add", ref("w"), app("sum", each(axes.descendants, ref("w")))), depth: app("count", each(axes.ancestors, ref("w"))) });
type TreeRun = (records: unknown, vars: unknown, parents: unknown) => unknown;
const teamModule = once((): TreeRun => {
  const m = emitModule(TEAM, { domains: [NumDomain], schema: { fields: { w: "number" } }, space: "tree", name: "team" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const load = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn team;`) as () => TreeRun;
  return load();
});

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

/** This function gives a run of the program of the tree case at each key, in tier 2. */
function teamTier2(records: readonly { readonly w: number }[], parents: readonly number[]): () => void {
  const tree = space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.map((p, i) => [String(i), p < 0 ? null : String(p)])));
  const p = atEachKey({ program: TEAM }, tree, { domains: [NumDomain] });
  if (p.tier !== 2) throw new Error("gate: the program of the tree case is not in tier 2.");
  return p.run;
}

const treeCase = (n: number): Case => {
  // Each node has at most three children, so the depth is near log3(n).
  const records = Array.from({ length: n }, (_, i) => ({ w: (i * 37) % 11 }));
  const parents = records.map((_r, i) => (i === 0 ? -1 : Math.floor((i - 1) / 3)));
  const team = teamModule();
  return { title: `a tree module, the team and the depth of each of ${String(n)} nodes`, compiled: { run: () => team(records, {}, parents), tier: 2, fallbacks: () => 0 }, hand: () => teamHand(records, parents), limits: limitsOf("tree"), nodes: n, tier2: () => teamTier2(records, parents) };
};

// The shapes pass of ireko as a module of a sheet, against the hand code of the pilot (COMPILE-FUSE, COMPILER.md §7.6).
// The module has the option fuse, so each step of the fusion shows its gain in this case.
const shapesModule = once((): TreeRun => {
  const m = emitSheetModule(SHAPE_COLUMNS, { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf", fuse: true });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
  const load = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn shapesOf;`) as () => TreeRun;
  return load();
});

const shapesCase = (branch: number, depth: number): Case => {
  // A root and `depth` levels of `branch` children. Each node wants its shape, and each mode is linked.
  const n = Array.from({ length: depth + 1 }, (_, d) => branch ** d).reduce((a, b) => a + b, 0);
  const records = Array.from({ length: n }, (_, i): ShapeRecord => {
    const w = 10 + ((i * 37) % 90);
    const h = 10 + ((i * 53) % 70);
    return { p: i === 0 ? -1 : Math.floor((i - 1) / branch), wants: true, linked: true, w, h, ox: (i % branch) * 12, oy: 20 + (i % 7), ex: 0, ey: 0, ew: w, eh: h };
  });
  const parents = records.map((r) => r.p);
  const vars = { limit: MAX_BANDS };
  const shapes = shapesModule();
  return { title: `the shapes module of ireko, a tree of ${String(n)} nodes`, compiled: { run: () => shapes(records, vars, parents), tier: 2, fallbacks: () => 0 }, hand: () => shapesTree(records, MAX_BANDS), limits: limitsOf("shapes"), nodes: n };
};

// The ablation of RADIALGAP (step 3, predictions vex-radialgap-ablation-1102, -2 and -3 of the fleet): with GATE_ABLATE=1,
// variants of the nested radial module are more cases. `ablation.ts` makes them. A variant must give the result of the
// module on the case input, or the gate stops.
const ablationCase = (name: string, edit: (source: string) => string): ReturnType<typeof radialCase> => {
  const input = ringOf(60, "nested");
  const { space: s, vars } = radialRun(input);
  const variant = loadRadial(edit);
  if (JSON.stringify(variant(s.records, vars)) !== JSON.stringify(radialModule()(s.records, vars))) throw new Error(`gate: the ablation variant ${name} gives another result.`);
  return { title: `the radial module of ireko, a full ring of 60 children, nested, ablation ${name}`, compiled: { run: () => variant(s.records, vars), tier: 2, fallbacks: () => 0 }, hand: () => radialArrange(input), limits: limitsOf("nested") };
};

// The walk of a between program with a data limit (LIMITCOST). The tree has one edge for each node, so a count at each key
// costs the square of the nodes. The variant must give the result of the module on the case input, or the gate stops.
const walkCase = (branch: number, depth: number): Case => {
  const records = walkRecords(branch, depth);
  const after = loadWalk((source) => source);
  const before = loadWalk(countAtEachKey);
  if (JSON.stringify(before(records, {})) !== JSON.stringify(after(records, {}))) throw new Error("gate: the variant of the walk gives another result.");
  return { title: `the walk of a data limit, a tree of ${String(records.length)} nodes, against a count at each key`, compiled: { run: () => after(records, {}), tier: 2, fallbacks: () => 0 }, hand: () => before(records, {}), limits: limitsOf("walk") };
};

// Each case is a function that makes the case, so a process makes only its own case (MODELLIMITS). When each process made
// all cases, the three ablation variants ran in the process of the shapes case too. Its ratio on the 7763 went from 1.58
// to 1.66 (7 runs) to 1.67 to 1.77 (6 runs with GATE_ABLATE=1).
interface Case {
  readonly title: string;
  readonly compiled: { readonly run: () => void; readonly tier: 1 | 2; readonly fallbacks: () => number };
  readonly hand: () => void;
  readonly limits: CaseLimits;
  /** This value is the count of nodes of a tree case, for the allocation measure (alloc.ts). */
  readonly nodes?: number;
  /** This function makes the run of the case in tier 2, for the allocation measure. The speed gate does not call it. */
  readonly tier2?: () => () => void;
}
const CASES_BASE: readonly (() => Case)[] = [
  () => ({ title: NEAREST.title, compiled: atEachKey(NEAREST.chain, NEAREST.root.space), hand: NEAREST.hand, limits: limitsOf("nearest") }),
  () => ({ title: LIFE.title, compiled: atEachKey(LIFE.chain, LIFE.root.space), hand: LIFE.hand, limits: limitsOf("life") }),
  () => radialCase(12, "linked"),
  () => radialCase(60, "nested"),
  () => treeCase(1000),
  () => shapesCase(10, 3),
];
const CASES_ABLATE: readonly (() => Case)[] = process.env["GATE_ABLATE"] === "1" ? [() => ablationCase("hand sum", handSum), () => ablationCase("hand pairs", handPairs), () => ablationCase("hand both", handBoth)] : [];
const CASES_WALK: readonly (() => Case)[] = process.env["GATE_LIMIT_WALK"] === "1" ? [() => walkCase(10, 3), () => walkCase(10, 4)] : [];
const CASES: readonly (() => Case)[] = [...CASES_BASE, ...CASES_ABLATE, ...CASES_WALK];

// With GATE_CASE=n, the process measures only case n (from 0, and CASES.length is the growth case), so no other case
// changes its heap. Measured cases before the tree case made V8 tenure an allocation site in 9 of 40 processes (run
// 41418095435), and that arm was slow for the whole process. With GATE_CASE=count, the process gives the count of cases.
const only = process.env["GATE_CASE"];
if (only === "count") {
  console.info(`cases ${String(CASES.length + 1)}`);
  process.exit(0);
}
const chosen = only === undefined ? undefined : Number(only);
if (chosen !== undefined && !(Number.isInteger(chosen) && chosen >= 0 && chosen <= CASES.length)) throw new RangeError(`gate: GATE_CASE is "${String(only)}", not "count" or a case from 0 to ${String(CASES.length)}.`);
// With GATE_ALLOC, the process gives the allocation record of one arm of its case, and no time (alloc.ts).
const allocArm = process.env["GATE_ALLOC"] as AllocArm | undefined;
if (allocArm !== undefined) {
  const made = CASES[chosen ?? -1]?.();
  if (made === undefined) throw new RangeError(`gate: GATE_ALLOC needs a GATE_CASE of a program, not "${String(only)}".`);
  const run = { vex: made.compiled.run, hand: made.hand, tier2: made.tier2?.() }[allocArm];
  const { allocRecord } = await import("./alloc-arm.ts");
  console.info(run === undefined ? "alloc none" : `alloc ${JSON.stringify(await allocRecord(made.title, allocArm, process.env["GATE_ALLOC_REGIME"] as AllocRegime, made.nodes ?? 1, run))}`);
  process.exit(0);
}
console.info(envLine("process"));
let failed = false;
for (const make of CASES.filter((_, i) => chosen === undefined || chosen === i)) {
  const { title, compiled, hand, limits } = make();
  // The arms alternate in this process, with the order reversed in odd rounds, and a copy of the base gives the noise floor (core/bench/measure.ts).
  // With GATE_GC=1, a clock records each timed run, and an observer counts the garbage collections in it (gc.ts).
  const gc = GC_ON ? gcRecorder() : undefined;
  const { ratio, a: v, b: h, noise, report } = paired(withFault(compiled.run), hand, gc === undefined ? {} : { clock: gc.clock });
  const ok = ratio <= limits.limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, generated/loops time ${ratio.toFixed(2)} (lower is better, ${limitsText(limits)}), A/A noise ${noise.p10.toFixed(2)} to ${noise.p90.toFixed(2)}`);
  // oxlint-disable-next-line no-await-in-loop -- the cases run one after the other, and the gc entries of a case come from the event loop.
  if (gc !== undefined) for (const line of await gc.done(report, { a: "vex", b: "hand", "b~aa": "hand~aa" })) console.info(line);
}
if (chosen === undefined || chosen === CASES.length) {
  // The growth of O(n) is 2, and the growth of O(n²) is 4. Its limit comes from the runs in the header.
  const [small, large] = shares();
  const gc = GC_ON ? gcRecorder() : undefined;
  const { ratio, a: v, b: h, noise, report } = paired(withFault(large.run), small.run, gc === undefined ? {} : { clock: gc.clock });
  const ok = ratio <= SHARE.limit && large.tier === 2 && large.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} the share of each value in the total: tier ${large.tier}, ${large.fallbacks()} fallbacks, 1000 values ${v.toFixed(1)} µs, 500 values ${h.toFixed(1)} µs, growth ${ratio.toFixed(2)} (${limitsText(SHARE)}), A/A noise ${noise.p10.toFixed(2)} to ${noise.p90.toFixed(2)}`);
  if (gc !== undefined) for (const line of await gc.done(report, { a: "1000", b: "500", "b~aa": "500~aa" })) console.info(line);
}
process.exit(failed ? 1 : 0);

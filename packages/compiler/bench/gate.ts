/**
 * The speed gate of the compiler (docs/COMPILER.md §10). For each program of the speed lane of the core, the gate
 * measures the generated code (tier 2) and the hand-written loops on the same machine, and checks the ratio against a
 * limit. The gate also checks that tier 2 gave each result, with no fallback.
 *
 * The arms take turns in one process (core/bench/paired.ts, on `timeArmRounds` of rigor-bench). `gate-processes.ts` starts each case in 11 fresh processes
 * of its own and decides each case on them (core/bench/processes.ts):
 *
 * - (a) The median ratio of the processes is at most the limit.
 * - (b) The count of processes above the slow line (the limit) is at most the largest count.
 *
 * The limits come from the CI jobs of `gate-processes.ts` on Node.js 26.13.1 (LIFEMARGIN, a rule of 2026-11-02):
 * 53 jobs of speed-gate.yml in 36 runs, from 2026-11-12 23:30 to 2026-11-14 23:04 (UTC). The file `limit-runs.json`
 * keeps the job, the run, the CPU model and the ratio of each process of each case. The AMD EPYC 7763 gave 13 jobs, so it
 * has its own limits. The 40 other jobs give the limits of each other model: Intel Xeon 6975P-C, 8573C and 8370C, and AMD
 * EPYC 9V45 and 9V74. Shapes has a limit of its own for the 23 Xeon jobs. Each value is the median of the 11 processes of
 * one job.
 *
 * | Case | 7763 medians | 7763 limit, L | Other medians | Other limit, L |
 * |---|---|---|---|---|
 * | NEAREST | 1.62 to 1.63 | 1.64, 3 | 1.32 to 1.60 | 1.88, 1 |
 * | LIFE | 1.14 to 1.22 | 1.30, 2 | 1.08 to 1.19 | 1.30, 1 |
 * | radial, 12 children, linked | 1.77 to 1.85 | 1.93, 4 | 1.71 to 1.84 | 1.97, 1 |
 * | radial, 60 children, nested | 1.78 to 1.79 | 1.80, 3 | 1.67 to 1.84 | 2.01, 1 |
 * | tree, 1000 nodes | 0.57 to 0.58 | 0.59, 2 | 0.49 to 0.59 | 0.69, 1 |
 * | shapes, 1111 nodes | 1.39 to 1.52 | 1.65 | 1.53 to 1.66, Xeon 1.50 to 1.78 | 1.79, Xeon 2.06 |
 * | the growth of the share of each value | 1.99 to 2.01 | 2.03 | 1.99 to 2.07 | 2.15 |
 *
 * (a) Each limit is the worst job median plus the spread of the job medians, rounded up.
 * (b) The rate p is the upper Wilson end (95 %) of the rate of processes above the limit in the derivation jobs. The
 * largest count L is the smallest count with P(Binomial(11, p) > L) under 1 %. Check (b) fails a job with a slow rate of
 * 0.3 in 89 % of jobs for L 1, 69 % for L 2, 43 % for L 3 and 21 % for L 4. At a slow rate of 0.5, it is 99 %, 97 %, 89 %
 * and 73 %. For shapes and share, (b) stays a record only, as before. The limit (a) and the nightly log protect them.
 *
 * Before LIFEMARGIN, the limits came from 10 runs of 2026-11-02 on Node.js 26.13.0 (runs 41423717761 and 41425976485),
 * with later runs for the radial cases (41455264352) and shapes (41773861998). On Node.js 26.13.1, LIFE on the 7763 went
 * from a mean of 1.135 (30 jobs on 26.13.0) to 1.175 (13 jobs). Two of the 13 jobs failed the old limits (vex#389): one had
 * the median 1.22 and 5 processes above 1.21, and one had the median 1.17 and 5 processes above 1.21. The radial and tree cases got faster after their limits were set,
 * and NEAREST on the 7763 has a smaller spread now, so their new limits are lower. With the new
 * limits, 3 of the 72 jobs on Node.js 26.13.0 fail: shapes at 1.81 on a 7763 and at 2.09 on a Xeon 6973P-C (both failed
 * the old limits too), and linked with 2 slow processes on a 9V74.
 *
 * In one process with all cases, the hand loops of the nested radial case were 35 % slower, and its ratio was 2.7, not
 * 3.85 (run 41420168361). Measured cases before a case change its heap and its JIT state (GATENOISE, run 41418095435).
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
import { envLine } from "../../core/bench/measure.ts";
import { batchMs, paired } from "../../core/bench/paired.ts";
import { limitsFor, limitsText, type CaseLimits, type ModelLimits } from "../../core/bench/processes.ts";
import type { AllocArm, AllocRegime } from "./alloc.ts";
import { GC_ON, gcRecorder } from "./gc.ts";

/** The limits of each case, from the 53 jobs in the header. A case with no `maxSlow` has check (b) as a record only. */
const LIMITS = {
  nearest: { "7763": { limit: 1.64, slow: 1.64, maxSlow: 3 }, other: { limit: 1.88, slow: 1.88, maxSlow: 1 } },
  life: { "7763": { limit: 1.3, slow: 1.3, maxSlow: 2 }, other: { limit: 1.3, slow: 1.3, maxSlow: 1 } },
  linked: { "7763": { limit: 1.93, slow: 1.93, maxSlow: 4 }, other: { limit: 1.97, slow: 1.97, maxSlow: 1 } },
  nested: { "7763": { limit: 1.8, slow: 1.8, maxSlow: 3 }, other: { limit: 2.01, slow: 2.01, maxSlow: 1 } },
  tree: { "7763": { limit: 0.59, slow: 0.59, maxSlow: 2 }, other: { limit: 0.69, slow: 0.69, maxSlow: 1 } },
  shapes: { "7763": { limit: 1.65, slow: 1.65 }, Xeon: { limit: 2.06, slow: 2.06 }, other: { limit: 1.79, slow: 1.79 } },
  share: { "7763": { limit: 2.03, slow: 2.03 }, other: { limit: 2.15, slow: 2.15 } },
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

// The ablation of RADIALGAP (step 3, predictions vex-radialgap-ablation-1102, -2 and -3): with GATE_ABLATE=1,
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
  // The arms take turns in this process in the order of armOrder, and a copy of the base gives the noise floor (core/bench/paired.ts).
  // With GATE_GC=1, an observer counts the garbage collections in each timed batch (gc.ts).
  const gc = GC_ON ? gcRecorder() : undefined;
  const { ratio, a: v, b: h, noise, rounds } = paired(withFault(compiled.run), hand, { targetMs: batchMs(30, limits.limit) });
  const ok = ratio <= limits.limit && compiled.tier === 2 && compiled.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} ${title}: tier ${compiled.tier}, ${compiled.fallbacks()} fallbacks, generated ${v.toFixed(1)} µs, loops ${h.toFixed(1)} µs, generated/loops time ${ratio.toFixed(2)} (lower is better, ${limitsText(limits)}), A/A noise ${noise.p10.toFixed(2)} to ${noise.p90.toFixed(2)}`);
  // oxlint-disable-next-line no-await-in-loop -- the cases run one after the other, and the gc entries of a case come from the event loop.
  if (gc !== undefined) for (const line of await gc.done(rounds, { a: "vex", b: "hand", "b~aa": "hand~aa" })) console.info(line);
}
if (chosen === undefined || chosen === CASES.length) {
  // The growth of O(n) is 2, and the growth of O(n²) is 4. Its limit comes from the runs in the header.
  const [small, large] = shares();
  const gc = GC_ON ? gcRecorder() : undefined;
  const { ratio, a: v, b: h, noise, rounds } = paired(withFault(large.run), small.run, { targetMs: batchMs(30, SHARE.limit) });
  const ok = ratio <= SHARE.limit && large.tier === 2 && large.fallbacks() === 0;
  failed ||= !ok;
  console.info(`${ok ? "ok  " : "FAIL"} the share of each value in the total: tier ${large.tier}, ${large.fallbacks()} fallbacks, 1000 values ${v.toFixed(1)} µs, 500 values ${h.toFixed(1)} µs, growth ${ratio.toFixed(2)} (${limitsText(SHARE)}), A/A noise ${noise.p10.toFixed(2)} to ${noise.p90.toFixed(2)}`);
  if (gc !== undefined) for (const line of await gc.done(rounds, { a: "1000", b: "500", "b~aa": "500~aa" })) console.info(line);
}
process.exit(failed ? 1 : 0);

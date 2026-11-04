/**
 * The allocation measure of a case of the speed gate of the compiler (TREEALLOC). It gives the bytes and the objects
 * for each node of the generated code and of the hand arm. It has no timing and no limit.
 *
 * The script form starts `gate.ts` in a fresh process for each arm, each regime and each repeat, and collects one JSON
 * record from each process. One process runs one arm only, so the other arm cannot change its allocation sites.
 *
 * - The regime `warm` runs the arm until the optimizer has compiled it, as the gate does. `--single-threaded` makes the
 *   compile part of the run, so a repeat gets the same code at the same call. This regime gives the numbers of the arm.
 * - The regime `split` is `warm` with no inlining. The profiler sees only the frames of the machine, so an inlined
 *   function has no frame of its own. Each helper keeps its frame in this regime, and the totals stay near `warm`.
 * - The regime `cold` has no optimizer. Each allocation of the source occurs, so this regime gives the upper bound.
 *
 * Each process gives two independent values. The windows read the heap counters over a fixed count of runs with no
 * garbage collection in them. The sampling heap profiler has an interval of 1 byte and no randomness. Thus it sees each
 * object of a few more runs, with its size and the path of functions that made it.
 *
 * This measure is a part of the bench harness, and it moves with the harness to rigor.
 * Start: GATE_CASE=4 node packages/compiler/bench/alloc.ts
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { envLine, median } from "../../core/bench/measure.ts";

/** The name of an arm of a process: the module, the hand-written loops, or tier 2 where the case has it. */
export type AllocArm = "vex" | "hand" | "tier2";

/** The regime of a process: optimized, optimized with no inlining, or the interpreter only. */
export type AllocRegime = "warm" | "split" | "cold";

/** One object size at one path of functions, with its count over the sampled runs. */
export interface AllocSite {
  /** This value is the path of functions under the run, separated by ` > `. */
  readonly path: string;
  readonly size: number;
  readonly count: number;
}

/** The record of one process. */
export interface AllocRecord {
  readonly title: string;
  readonly arm: AllocArm;
  readonly regime: AllocRegime;
  readonly nodes: number;
  /** This value is the count of runs in each window. */
  readonly windowRuns: number;
  /** These values are the heap bytes of each window, without the cost of the measure. */
  readonly heap: readonly number[];
  /** These values are the bytes outside the heap of each window: the stores of typed arrays. */
  readonly external: readonly number[];
  /** This value is the count of runs that the sampling heap profiler saw. */
  readonly sampledRuns: number;
  readonly sites: readonly AllocSite[];
}

/** A node of the profile of the sampling heap profiler of V8. */
export interface HeapNode {
  readonly id: number;
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  readonly children: readonly HeapNode[];
}

/** One sample of the sampling heap profiler. The size is the size of the object, times its scale. */
export interface HeapSample {
  readonly nodeId: number;
  readonly size: number;
}

/** This function gives the name of a frame: the name of its function, or its line in an anonymous function. */
const frameName = (f: HeapNode["callFrame"]): string => (f.functionName === "" ? `(anonymous):${String(f.lineNumber + 1)}` : f.functionName);

/**
 * This function gives the sites of a heap profile: the samples under the frames of the function `root`, by path and
 * by size. A sample outside `root` is an allocation of the measure.
 */
export function sitesOf(head: HeapNode, samples: readonly HeapSample[], root: string): readonly AllocSite[] {
  const paths = new Map<number, string>();
  const visit = (n: HeapNode, path: string | undefined): void => {
    const name = frameName(n.callFrame);
    const own = path === undefined ? (name === root ? "" : undefined) : path === "" ? name : `${path} > ${name}`;
    if (own !== undefined) paths.set(n.id, own === "" ? root : own);
    for (const c of n.children) visit(c, own);
  };
  visit(head, undefined);
  const counts = new Map<string, AllocSite>();
  for (const s of samples) {
    const path = paths.get(s.nodeId);
    if (path === undefined) continue;
    const key = `${path}\u0000${String(s.size)}`;
    counts.set(key, { path, size: s.size, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()];
}

/** This function gives the sum of a list of numbers. */
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** An object above this size is a store that grows. A row of a summary joins these objects of one path. */
const LARGE = 256;

/** The bytes and the objects of one row of a summary for each node, as the median over the processes. */
export interface SiteRow {
  readonly path: string;
  /** This value is the size of the objects in bytes, or a text for the sizes above `LARGE`. */
  readonly size: string;
  readonly bytes: number;
  readonly objects: number;
}

/** The result of an arm and a regime over its processes. All values are for each node. */
export interface AllocSummary {
  readonly arm: AllocArm;
  readonly regime: AllocRegime;
  readonly processes: number;
  readonly heap: { readonly median: number; readonly min: number; readonly max: number };
  readonly external: number;
  readonly sampledBytes: number;
  readonly objects: { readonly median: number; readonly min: number; readonly max: number };
  readonly sites: readonly SiteRow[];
}

/** This function gives the median of the values, with the lowest and the highest. */
const spread = (xs: readonly number[]): { readonly median: number; readonly min: number; readonly max: number } => ({ median: median(xs), min: Math.min(...xs), max: Math.max(...xs) });

/** This function gives the size text of a row for an object size. */
const sizeText = (size: number): string => (size > LARGE ? `over ${String(LARGE)}` : String(size));

/** This function gives the summary of the records of one arm in one regime. */
export function summarize(records: readonly AllocRecord[]): AllocSummary {
  const first = records[0];
  if (first === undefined) throw new RangeError("alloc: a summary needs at least one record.");
  const { arm, regime } = first;
  const rows = new Map(records.flatMap((r) => r.sites.map((s) => [`${s.path}\u0000${sizeText(s.size)}`, { path: s.path, size: sizeText(s.size) }] as const)));
  const sites = [...rows.values()].map(({ path, size }): SiteRow => {
    const own = (r: AllocRecord): readonly AllocSite[] => r.sites.filter((s) => s.path === path && sizeText(s.size) === size);
    const bytes = median(records.map((r) => sum(own(r).map((s) => s.size * s.count)) / r.sampledRuns / r.nodes));
    const objects = median(records.map((r) => sum(own(r).map((s) => s.count)) / r.sampledRuns / r.nodes));
    return { path, size, bytes, objects };
  });
  // The type-aware lint does not have Array#toSorted, and sort() changes only the fresh list.
  // oxlint-disable-next-line unicorn/no-array-sort
  sites.sort((x, y) => y.bytes - x.bytes);
  return {
    arm,
    regime,
    processes: records.length,
    heap: spread(records.flatMap((r) => r.heap.map((x) => x / r.windowRuns / r.nodes))),
    external: median(records.flatMap((r) => r.external.map((x) => x / r.windowRuns / r.nodes))),
    sampledBytes: median(records.map((r) => sum(r.sites.map((s) => s.size * s.count)) / r.sampledRuns / r.nodes)),
    objects: spread(records.map((r) => sum(r.sites.map((s) => s.count)) / r.sampledRuns / r.nodes)),
    sites,
  };
}

/** This function gives a number of a summary as text. */
const n = (x: number): string => x.toFixed(2);

/** This function gives the lines of a summary, with the rows of at least `floor` bytes for each node. */
export function summaryLines(s: AllocSummary, floor = 0.5): readonly string[] {
  const head = `${s.arm} ${s.regime}: ${n(s.heap.median)} heap bytes for each node (${n(s.heap.min)} to ${n(s.heap.max)}), ${n(s.external)} external bytes, ${n(s.objects.median)} objects (${n(s.objects.min)} to ${n(s.objects.max)}), the profiler saw ${n(s.sampledBytes)} bytes, ${String(s.processes)} processes`;
  return [head, ...s.sites.filter((x) => x.bytes >= floor).map((x) => `  ${n(x.bytes).padStart(9)} B  ${n(x.objects).padStart(7)} objects of ${x.size.padStart(8)} B  ${x.path}`)];
}

/** The flags of each process. The semi-space of 32 MB holds a window, so no garbage collection occurs in it. */
const BASE_FLAGS = ["--expose-gc", "--single-threaded", "--min-semi-space-size=32", "--max-semi-space-size=32", "--sampling-heap-profiler-suppress-randomness"];

/** The flags of each regime. Allocation folding joins objects into one allocation, and then the profiler sees one object. */
const FLAGS: Readonly<Record<AllocRegime, readonly string[]>> = {
  warm: [...BASE_FLAGS, "--no-turbo-allocation-folding"],
  split: [...BASE_FLAGS, "--no-turbo-allocation-folding", "--no-turbo-inlining"],
  cold: [...BASE_FLAGS, "--no-opt", "--no-maglev", "--no-sparkplug"],
};

/** This function starts `gate.ts` for one arm in one regime. It gives the record, or `undefined` if the case has no such arm. */
export function startArm(gate: string, which: string, arm: AllocArm, regime: AllocRegime, flags: readonly string[]): AllocRecord | undefined {
  const out = spawnSync(process.execPath, [...FLAGS[regime], ...flags, gate], { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, GATE_CASE: which, GATE_ALLOC: arm, GATE_ALLOC_REGIME: regime } });
  const line = out.stdout.split("\n").find((l) => l.startsWith("alloc "));
  if (out.status !== 0 || line === undefined) throw new Error(`alloc: the process of ${arm} ${regime} ended with ${String(out.status ?? out.signal)}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  return line === "alloc none" ? undefined : (JSON.parse(line.slice("alloc ".length)) as AllocRecord);
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const which = process.env["GATE_CASE"] ?? "4";
  if (!/^\d+$/u.test(which)) throw new RangeError(`alloc: GATE_CASE is "${which}", not a case number.`);
  const processes = Number(process.env["ALLOC_PROCESSES"] ?? "3");
  if (!Number.isInteger(processes) || processes < 1) throw new RangeError(`alloc: ALLOC_PROCESSES is "${String(process.env["ALLOC_PROCESSES"])}".`);
  const flags = (process.env["ALLOC_NODE_FLAGS"] ?? "").split(" ").filter((f) => f !== "");
  const dir = resolve(process.env["ALLOC_DIR"] ?? "alloc");
  mkdirSync(dir, { recursive: true });
  const gate = fileURLToPath(new URL("gate.ts", import.meta.url));
  console.info(envLine("fresh"));
  for (const regime of ["warm", "split", "cold"] as const) {
    for (const arm of ["vex", "hand", "tier2"] as const) {
      const records = Array.from({ length: processes }, (_, p) => {
        const record = startArm(gate, which, arm, regime, flags);
        if (record !== undefined) writeFileSync(join(dir, `case${which}-${arm}-${regime}-p${String(p + 1)}.json`), `${JSON.stringify(record, null, 2)}\n`);
        return record;
      }).filter((r) => r !== undefined);
      if (records.length > 0) for (const line of summaryLines(summarize(records))) console.info(line);
    }
  }
}

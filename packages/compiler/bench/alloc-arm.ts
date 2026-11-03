/**
 * The part of the allocation measure (TREEALLOC) that runs in the process of an arm. `gate.ts` imports this file only
 * with `GATE_ALLOC`, so the speed gate loads no part of it. The file `alloc.ts` starts the processes.
 */
import { Session } from "node:inspector/promises";
import { sitesOf, type AllocArm, type AllocRecord, type AllocRegime, type HeapNode, type HeapSample } from "./alloc.ts";

/** The counts of runs of a process. A window holds at most this count of runs, and at most `WINDOW_BYTES`. */
const WINDOW_RUNS = 20;
const WINDOW_BYTES = 8 * 1024 * 1024;
const WINDOWS = 8;
const SAMPLED_RUNS = 4;

/** The runs before the first window: the optimizer needs many, and the interpreter needs only the first ones. */
const WARM_RUNS: Readonly<Record<AllocRegime, number>> = { warm: 3000, split: 3000, cold: 20 };

/** This function runs `run` `times` times. Its name marks the root of the sites in a heap profile. */
function allocRoot(run: () => void, times: number): void {
  for (let i = 0; i < times; i++) run();
}

/** This function runs nothing. A window of this function gives the cost of the measure itself. */
const nothing = (): void => undefined;

/** The heap bytes and the external bytes of a window. */
interface Used {
  readonly heap: number;
  readonly external: number;
}

/** This function gives the bytes of `runs` runs. The semi-space holds them, so no garbage collection frees a part. */
function overRuns(run: () => void, runs: number): Used {
  const before = process.memoryUsage();
  allocRoot(run, runs);
  const after = process.memoryUsage();
  return { heap: after.heapUsed - before.heapUsed, external: after.arrayBuffers - before.arrayBuffers };
}

/** This function gives the record of one arm in this process. */
export async function allocRecord(title: string, arm: AllocArm, regime: AllocRegime, nodes: number, run: () => void): Promise<AllocRecord> {
  const { gc } = globalThis as { readonly gc?: () => void };
  if (gc === undefined) throw new Error("alloc: this process needs --expose-gc.");
  allocRoot(run, WARM_RUNS[regime]);
  gc();
  const windowRuns = Math.max(1, Math.min(WINDOW_RUNS, Math.floor(WINDOW_BYTES / Math.max(1, overRuns(run, 1).heap))));
  // The first windows of the null run settle the code of the measure.
  for (let i = 0; i < 16; i++) overRuns(nothing, windowRuns);
  gc();
  const cost = overRuns(nothing, windowRuns);
  const heap: number[] = [];
  const external: number[] = [];
  for (let w = 0; w < WINDOWS; w++) {
    // A collection before each window empties the new space, so the window starts with the same heap.
    gc();
    const u = overRuns(run, windowRuns);
    if (u.heap < 0 || u.external < 0) throw new Error("alloc: a garbage collection occurred in a window.");
    heap.push(u.heap - cost.heap);
    external.push(u.external - cost.external);
  }
  const session = new Session();
  session.connect();
  // With the two options, a sample stays after a collection. The interval of 1 byte gives each object a sample of scale 1.
  await session.post("HeapProfiler.startSampling", { samplingInterval: 1, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  allocRoot(run, SAMPLED_RUNS);
  const { profile } = await session.post("HeapProfiler.stopSampling");
  session.disconnect();
  // The types of Node.js in this repository do not have `samples` on a profile.
  const { head, samples } = profile as unknown as { readonly head: HeapNode; readonly samples: readonly HeapSample[] };
  const sites = sitesOf(head, samples, "allocRoot");
  return { title, arm, regime, nodes, windowRuns, heap, external, sampledRuns: SAMPLED_RUNS, sites };
}

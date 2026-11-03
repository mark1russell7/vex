/**
 * This test limits the allocations of the tree case of the gate (COMPILE.MODULE.TREE.ALLOC). It counts bytes and
 * objects, and it reads no time.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startArm, summarize } from "./alloc.ts";

/**
 * The limits for each node. Three fresh processes on each of Node 22, 24 and 26 gave the numbers. The highest number is
 * 161.8252 heap bytes, and the largest spread between the windows of one version is 0.0412. The external bytes and the
 * objects had no spread in one version, so their limit is their highest number.
 */
const LIMIT = { heap: 161.8252 + 0.0412, external: 21, objects: 2.364 };

/** The time limit of the test. It starts one process, and a shared runner can be slow. */
const PROCESS_MS = 180_000;

describe("COMPILE.MODULE.TREE.ALLOC: the allocations of a module of a tree space", () => {
  it("COMPILE.MODULE.TREE.ALLOC: the tree case keeps its limit of heap bytes, external bytes and objects for each node", { timeout: PROCESS_MS }, () => {
    const record = startArm(fileURLToPath(new URL("gate.ts", import.meta.url)), "4", "vex", "warm", []);
    expect(record).toBeDefined();
    const s = summarize(record === undefined ? [] : [record]);
    expect(s.heap.max).toBeLessThanOrEqual(LIMIT.heap);
    expect(s.external).toBeLessThanOrEqual(LIMIT.external);
    expect(s.objects.max).toBeLessThanOrEqual(LIMIT.objects);
  });
});

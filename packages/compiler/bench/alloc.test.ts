import { describe, expect, it } from "vitest";
import { sitesOf, summarize, summaryLines, type AllocRecord, type HeapNode } from "./alloc.ts";

/** This function gives a node of a heap profile. */
const node = (id: number, functionName: string, children: readonly HeapNode[] = [], lineNumber = 0): HeapNode => ({ id, callFrame: { functionName, url: "", lineNumber }, children });

const record = (over: Partial<AllocRecord>): AllocRecord => ({ title: "t", arm: "vex", regime: "warm", nodes: 10, windowRuns: 2, heap: [400, 400], external: [20, 20], sampledRuns: 2, sites: [], ...over });

describe("the allocation measure (TREEALLOC)", () => {
  it("sitesOf keeps the samples under the root, by path and size", () => {
    const head = node(1, "(root)", [node(2, "session"), node(3, "allocRoot", [node(4, "run", [node(5, "AN"), node(6, "", [], 124)])])]);
    const sites = sitesOf(
      head,
      [
        { nodeId: 2, size: 8000 },
        { nodeId: 3, size: 16 },
        { nodeId: 5, size: 32 },
        { nodeId: 5, size: 32 },
        { nodeId: 5, size: 152 },
        { nodeId: 6, size: 40 },
      ],
      "allocRoot",
    );
    expect(sites).toEqual([
      { path: "allocRoot", size: 16, count: 1 },
      { path: "run > AN", size: 32, count: 2 },
      { path: "run > AN", size: 152, count: 1 },
      { path: "run > (anonymous):125", size: 40, count: 1 },
    ]);
  });

  it("summarize gives the values for each node, and joins the large stores of a path", () => {
    const sites = [
      { path: "run", size: 40, count: 20 },
      { path: "run", size: 300, count: 1 },
      { path: "run", size: 500, count: 1 },
    ];
    const s = summarize([record({ sites }), record({ heap: [800], sites })]);
    expect(s).toMatchObject({ arm: "vex", regime: "warm", processes: 2, external: 1, sampledBytes: 80, heap: { median: 20, min: 20, max: 40 }, objects: { median: 1.1, min: 1.1, max: 1.1 } });
    expect(s.sites).toEqual([
      { path: "run", size: "40", bytes: 40, objects: 1 },
      { path: "run", size: "over 256", bytes: 40, objects: 0.1 },
    ]);
  });

  it("summarize needs a record", () => {
    expect(() => summarize([])).toThrow(RangeError);
  });

  it("summaryLines drops the rows under the floor", () => {
    const lines = summaryLines(summarize([record({ sites: [{ path: "a", size: 40, count: 20 }, { path: "b", size: 8, count: 1 }] })]));
    expect(lines).toHaveLength(2);
    expect(lines.at(0)).toContain("vex warm: 20.00 heap bytes for each node (20.00 to 20.00), 1.00 external bytes, 1.05 objects");
    expect(lines.at(1)).toContain("40.00 B     1.00 objects of       40 B  a");
  });
});

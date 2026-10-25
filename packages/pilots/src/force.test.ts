import { Vec2 } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layoutReference, layoutVex, type ForceNode, type ForceOptions } from "./force.ts";

const node = (id: string, x: number, y: number): ForceNode => ({ id, pos: new Vec2(x, y) });
const ONE: ForceOptions = { steps: 1, repel: 1, spring: 0.5, center: 0 };

const coord = fc.integer({ min: -20, max: 20 });
const graph: fc.Arbitrary<{ readonly nodes: Record<string, ForceNode>; readonly edges: Record<string, readonly string[]> }> = fc
  .array(fc.tuple(coord, coord), { minLength: 1, maxLength: 6 })
  .chain((points) => {
    const keys = points.map((_p, i) => `n${String(i)}`);
    const nodes = Object.fromEntries(points.map(([x, y], i) => [`n${String(i)}`, node(`n${String(i)}`, x, y)]));
    return fc.dictionary(fc.constantFrom(...keys), fc.array(fc.constantFrom(...keys), { maxLength: 3 })).map((edges) => ({ nodes, edges }));
  });
const options: fc.Arbitrary<ForceOptions> = fc.record({
  steps: fc.integer({ min: 0, max: 6 }),
  repel: fc.double({ min: 0, max: 3, noNaN: true }),
  spring: fc.double({ min: 0, max: 0.5, noNaN: true }),
  center: fc.double({ min: 0, max: 0.2, noNaN: true }),
});

describe("the force pilot", () => {
  it("LOOP.LIST LIST.GET: one step of two nodes on an edge, the values checked by hand", () => {
    // The gap a - b is (-2, 0), and |gap|^2 + 1 is 5: the push on a is (-0.4, 0). The spring pulls a by (1, 0).
    const nodes = { a: node("a", 0, 0), b: node("b", 2, 0) };
    expect(layoutVex(nodes, { a: ["b"] }, ONE)).toEqual({ a: new Vec2(0.6, 0), b: new Vec2(1.4, 0) });
    expect(layoutReference(nodes, { a: ["b"] }, ONE)).toEqual(layoutVex(nodes, { a: ["b"] }, ONE));
  });

  it("LOOP.LIST LIST.GET: each step reads the old positions, so the order of the nodes does not change a step", () => {
    // Three nodes on a line, with springs a-b and b-c. Each step moves each node from the positions before the step.
    const nodes = { a: node("a", 0, 0), b: node("b", 1, 0), c: node("c", 3, 0) };
    const edges = { a: ["b"], b: ["c"] };
    const o: ForceOptions = { steps: 20, repel: 1, spring: 0.25, center: 0.05 };
    const got = layoutVex(nodes, edges, o);
    expect(got).toEqual(layoutReference(nodes, edges, o));
    const back = layoutVex({ c: node("c", 3, 0), b: node("b", 1, 0), a: node("a", 0, 0) }, edges, o);
    for (const k of ["a", "b", "c"]) expect((back[k] ?? Vec2.zero).distance(got[k] ?? Vec2.zero)).toBeLessThan(1e-9);
    // The springs and the pushes keep the order of the line.
    expect((got["a"]?.x ?? 0) < (got["b"]?.x ?? 0) && (got["b"]?.x ?? 0) < (got["c"]?.x ?? 0)).toBe(true);
  });

  it("gives the positions of the reference for random graphs and tunings, with the same bits", () => {
    fc.assert(
      fc.property(graph, options, ({ nodes, edges }, o) => {
        expect(layoutVex(nodes, edges, o)).toEqual(layoutReference(nodes, edges, o));
      }),
    );
  });

  it("gives no positions for no nodes", () => {
    expect(layoutVex({}, {}, ONE)).toEqual({});
  });
});

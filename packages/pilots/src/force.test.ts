import { evaluate, space } from "@mark1russell7/vex";
import { emitModule } from "@mark1russell7/vex-compiler";
import { Vec2 } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FORCE_DOMAINS, FORCE_SCHEMA, forceProgram, layoutReference, layoutVex, type ForceNode, type ForceOptions } from "./force.ts";

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

type XY = { readonly x: number; readonly y: number };
type ForceRun = (records: unknown, vars: unknown, edges: unknown) => readonly unknown[];

/** This function gives the function of the standalone module of the layout over a graph space. */
function moduleOf(o: ForceOptions): ForceRun {
  const m = emitModule(forceProgram(o), { domains: FORCE_DOMAINS, schema: FORCE_SCHEMA, space: "graph", name: "force" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return force;`)() as ForceRun;
}

interface Input {
  readonly nodes: Record<string, ForceNode>;
  readonly edges: Record<string, readonly string[]>;
  readonly records: readonly { readonly id: string; readonly pos: XY }[];
  readonly ends: readonly (readonly number[])[];
}

/**
 * This function gives the input of the module: the records in key order, and the positions of the ends of the edges.
 * In a module, the key of a record is the text of its position. Thus the nodes and the edges get these keys too.
 */
function inputOf(nodes: Readonly<Record<string, ForceNode>>, edges: Readonly<Record<string, readonly string[]>>): Input {
  const keys = Object.keys(nodes);
  const at = (k: string): string => String(keys.indexOf(k));
  const points = Object.values(nodes).map((x) => x.pos);
  const records = points.map((p, i) => ({ id: String(i), pos: { x: p.x, y: p.y } }));
  return {
    nodes: Object.fromEntries(points.map((p, i) => [String(i), node(String(i), p.x, p.y)])),
    edges: Object.fromEntries(Object.entries(edges).map(([k, e]) => [at(k), e.map(at)])),
    records,
    ends: keys.map((k) => (edges[k] ?? []).map((j) => keys.indexOf(j))),
  };
}

/** This function gives the positions of a layout as plain data, in key order. */
const plain = (r: Record<string, Vec2>): XY[] => Object.values(r).map((p) => ({ x: p.x, y: p.y }));

describe("the force pilot as a standalone module", () => {

  it("COMPILE.MODULE.GRAPH COMPILE.MODULE.REDUCE: the module gives the positions of the reference, with the same bits", () => {
    fc.assert(
      fc.property(graph, options, ({ nodes, edges }, o) => {
        const i = inputOf(nodes, edges);
        expect(moduleOf(o)(i.records, {}, i.ends)).toEqual(plain(layoutReference(i.nodes, i.edges, o)));
      }),
      { numRuns: 50 },
    );
  });

  it("COMPILE.MODULE.GRAPH: the module gives the values of the interpreter (P17) and of tier 1 at each node", () => {
    const o: ForceOptions = { steps: 4, repel: 1, spring: 0.25, center: 0.05 };
    // The edges have a duplicate, a loop on one node and a cycle.
    const { nodes, edges, records, ends } = inputOf({ a: node("a", 0, 0), b: node("b", 1, 0), c: node("c", 3, 1), d: node("d", -2, 2) }, { a: ["b", "b", "a"], b: ["c"], c: ["a"] });
    const got = moduleOf(o)(records, {}, ends);
    const s = space.graph(Object.fromEntries(records.map((r) => [r.id, r])), edges);
    const want = s.keys.map((origin) => {
      const r = evaluate(forceProgram(o), { space: s, origin, vars: {}, domains: FORCE_DOMAINS });
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    });
    expect(got).toEqual(want);
    expect(got).toEqual(plain(layoutVex(nodes, edges, o)));
  });

  it("COMPILE.MODULE.GRAPH: the module refuses edges that do not go to a record", () => {
    expect(() => moduleOf(ONE)([{ id: "a", pos: { x: 0, y: 0 } }], {}, [[1]])).toThrow("an edge of the record 0 does not go to the position of a record");
  });
});

import { compile, type AnyDomain, type Expr, type Result, type Space } from "@mark1russell7/vex";
import { emitModule, tiered, type Schema } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { auditTree as tree, betweenInput, boundsInput, overlapTree } from "./inputs.ts";
import {
  BETWEEN_DOMAINS,
  BETWEEN_PROGRAM,
  BETWEEN_SCHEMA,
  betweenOutput,
  betweenRun,
  BOUNDS_DOMAINS,
  BOUNDS_PROGRAM,
  BOUNDS_SCHEMA,
  boundsOutput,
  boundsRun,
  ESCAPE_DOMAINS,
  ESCAPE_PROGRAM,
  ESCAPE_SCHEMA,
  escapeRun,
  escapes,
  MAX_OVERLAP_ISSUES,
  OVERLAP_DOMAINS,
  OVERLAP_PROGRAM,
  OVERLAP_SCHEMA,
  overlapOutput,
  overlapRun,
  TOLERANCE,
  type BetweenOutput,
  type BetweenValue,
  type BoundsRect,
  type OverlapNode,
  type OverlapOutput,
  type OverlapValue,
  type PlacedBox,
  type TreeEdge,
} from "./ireko-audit.ts";

/** This function evaluates the program at each node with `run`. */
function valuesOf(run: (r: { readonly space: ReturnType<typeof escapeRun>["space"]; readonly origin: string }) => Result<unknown>, nodes: readonly PlacedBox[]): unknown[] {
  const { space } = escapeRun(nodes);
  return space.keys.map((origin) => {
    const r = run({ space, origin });
    if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.value;
  });
}

describe("the ireko audit pilot", () => {
  const interpreted = compile(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS });
  const generated = tiered(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS });
  const m = emitModule(ESCAPE_PROGRAM, { domains: ESCAPE_DOMAINS, schema: ESCAPE_SCHEMA, name: "escapes" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const module = new Function(`${m.source.replaceAll(/^export /gm, "")}
return escapes;`)() as (records: unknown, vars: unknown) => readonly boolean[];

  it("COMPILE.MODULE: the program gives the findings ESCAPE of ireko in the interpreter, in tier 2 and in the module", () => {
    expect(m.source).not.toContain("import");
    fc.assert(
      fc.property(tree, (nodes) => {
        const expected = escapes(nodes);
        expect(valuesOf((r) => interpreted.run(r), nodes)).toEqual(expected);
        expect(valuesOf((r) => generated.run(r), nodes)).toEqual(expected);
        expect(module(escapeRun(nodes).space.records, {})).toEqual(expected);
      }),
    );
    expect(generated.tier).toBe(2);
    expect(generated.stats.fallbacks).toBe(0);
  });

  it("gives the findings of fixed cases: inside, at the tolerance, outside, and outside a container that clips", () => {
    const root: PlacedBox = { x: 0, y: 0, width: 100, height: 50, container: -1, clip: false };
    const nodes: PlacedBox[] = [
      root,
      { x: -0.5, y: 0, width: 100.5, height: 50.5, container: 0, clip: false },
      { x: 90, y: 10, width: 11, height: 10, container: 0, clip: true },
      { x: 95, y: 10, width: 20, height: 10, container: 2, clip: false },
    ];
    expect(escapes(nodes)).toEqual([false, false, true, false]);
    expect(module(escapeRun(nodes).space.records, {})).toEqual([false, false, true, false]);
    expect(() => escapes([{ ...root, container: 3 }])).toThrow("The container 3 does not exist.");
  });
});

/** The item at an index that exists by construction. */
function at<T>(list: ArrayLike<T>, i: number): T {
  const value = list[i];
  if (value === undefined) throw new RangeError(`No item at the index ${String(i)}.`);
  return value;
}

/** The copy of `overlaps` of ireko. */
function overlapsAt(a: BoundsRect, b: BoundsRect): boolean {
  return a.x < b.x + b.width - TOLERANCE && b.x < a.x + a.width - TOLERANCE && a.y < b.y + b.height - TOLERANCE && b.y < a.y + a.height - TOLERANCE;
}

/** The copy of `densityOf` of ireko. */
function densityOf(entries: readonly { readonly r: BoundsRect }[], axis: "x" | "y"): number {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const { r } of entries) {
    const from = axis === "x" ? r.x : r.y;
    const size = axis === "x" ? r.width : r.height;
    sum += size;
    min = Math.min(min, from);
    max = Math.max(max, from + size);
  }
  return max > min ? sum / (max - min) : 0;
}

/** The copy of `clipRoots` of ireko. */
function clipRootsOf(nodes: readonly OverlapNode[]): number[] {
  const out: number[] = nodes.map(() => -1);
  for (let i = 0; i < nodes.length; i++) {
    const c = at(nodes, i).container;
    if (c < 0) continue;
    out[i] = at(nodes, c).clip ? c : at(out, c);
  }
  return out;
}

/** The copy of `holdsOf` of ireko. The field `last` is the last item of `children`. */
function holdsOf(nodes: readonly OverlapNode[]): (a: number, b: number) => boolean {
  const end = new Int32Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { last } = at(nodes, i);
    end[i] = last < 0 ? i + 1 : at(end, last);
  }
  return (a, b) => b > a && b < at(end, a) && at(nodes, a).nested;
}

/** The copy of `visible` of ireko. */
function visibleOf(nodes: readonly OverlapNode[], i: number, clipRoot: readonly number[]): BoundsRect | undefined {
  const node = at(nodes, i);
  const r = at(clipRoot, i);
  if (r < 0) return node;
  const root = at(nodes, r);
  const x = Math.max(node.x, root.x);
  const y = Math.max(node.y, root.y);
  const width = Math.min(node.x + node.width, root.x + root.width) - x;
  const height = Math.min(node.y + node.height, root.y + root.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/** The copy of `overlapsOf` of ireko. It keeps the two boxes of each issue and the count of the last issue. */
function overlapsOf(nodes: readonly OverlapNode[]): OverlapOutput {
  const clipRoot = clipRootsOf(nodes);
  const holds = holdsOf(nodes);
  const entries = nodes.map((_, i) => ({ r: visibleOf(nodes, i, clipRoot), i })).filter((e): e is { r: BoundsRect; i: number } => e.r !== undefined);
  const alongY = densityOf(entries, "y") < densityOf(entries, "x");
  const start = (r: BoundsRect): number => (alongY ? r.y : r.x);
  const end = (r: BoundsRect): number => (alongY ? r.y + r.height : r.x + r.width);
  const order = entries.toSorted((a, b) => start(a.r) - start(b.r) || a.i - b.i);
  let open: { r: BoundsRect; i: number }[] = [];
  let count = 0;
  const pairs: [number, number][] = [];
  for (const cur of order) {
    open = open.filter((o) => end(o.r) - TOLERANCE > start(cur.r));
    for (const o of open) {
      if (!overlapsAt(o.r, cur.r)) continue;
      if (holds(o.i, cur.i) || holds(cur.i, o.i)) continue;
      count++;
      if (count <= MAX_OVERLAP_ISSUES) pairs.push(o.i < cur.i ? [o.i, cur.i] : [cur.i, o.i]);
    }
    open.push(cur);
  }
  return { pairs, count };
}

/** The copy of `union` of ireko. */
function unionOf(a: BoundsRect, b: BoundsRect): BoundsRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** The copy of `clean` of ireko. */
const cleanOf = (n: number): number => (Math.abs(n) < 1e-9 ? 0 : n);

/** The copy of the final bounds of ireko: `unionAll` and `clean`. */
function finalBounds(nodes: readonly BoundsRect[], points: readonly { readonly x: number; readonly y: number }[]): BoundsRect {
  let out: BoundsRect | undefined;
  for (const r of [...nodes, ...points.map((p) => ({ ...p, width: 0, height: 0 }))]) out = out === undefined ? r : unionOf(out, r);
  const b = out ?? { x: 0, y: 0, width: 0, height: 0 };
  return { x: cleanOf(b.x), y: cleanOf(b.y), width: cleanOf(b.width), height: cleanOf(b.height) };
}

/** The copy of `edgesBetweenChildren` of ireko. The input has the parents of the nodes, and the children come from them. */
function edgesBetween(parents: readonly number[], edges: readonly TreeEdge[]): BetweenOutput {
  const n = parents.length;
  const children: number[][] = Array.from({ length: n }, () => []);
  parents.forEach((p, i) => {
    if (p >= 0) at(children, p).push(i);
  });
  const out: { from: number; to: number }[][] = Array.from({ length: n }, () => []);
  const owner: number[] = edges.map(() => -1);
  if (edges.length === 0) return { between: out, owner };
  const place = new Int32Array(n);
  for (const list of children) list.forEach((c, k) => (place[c] = k));
  edges.forEach((e, index) => {
    const below = new Map<number, number>();
    for (let x = e.source, prev = -1; x >= 0; prev = x, x = at(parents, x)) below.set(x, prev);
    for (let y = e.target, prev = -1; y >= 0; prev = y, y = at(parents, y)) {
      const fromChild = below.get(y);
      if (fromChild === undefined) continue;
      if (fromChild >= 0 && prev >= 0) {
        at(out, y).push({ from: at(place, fromChild), to: at(place, prev) });
        owner[index] = y;
      }
      break;
    }
  });
  return { between: out, owner };
}

/** A run of one tier of a program over a space: the value at each key. */
type Tier<T> = (space: Space) => readonly T[];

/** This function gives the value at each key from the run of the interpreter or of tier 2. An error throws its code. */
function byKey<T>(run: (r: { readonly space: Space; readonly origin: string }) => Result<unknown>): Tier<T> {
  return (space) =>
    space.keys.map((origin) => {
      const r = run({ space, origin });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      return r.value as T;
    });
}

/** This function gives a standalone module of a program, with no imports. */
function moduleOf<T>(program: Expr, domains: readonly AnyDomain[], schema: Schema, name: string): Tier<T> {
  const m = emitModule(program, { domains, schema, name, lists: "plain" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const run = new Function(`${m.source.replaceAll(/^export /gm, "")}
return ${name};`)() as (records: unknown, vars: unknown) => readonly T[];
  return (space) => run(space.records, {});
}

/** This function gives the interpreter, tier 2 and the module of a program. */
function tiersOf<T>(program: Expr, domains: readonly AnyDomain[], schema: Schema, name: string): readonly Tier<T>[] {
  const interpreted = compile(program, { domains });
  const generated = tiered(program, { domains });
  expect(generated.tier).toBe(2);
  return [byKey<T>((r) => interpreted.run(r)), byKey<T>((r) => generated.run(r)), moduleOf<T>(program, domains, schema, name)];
}

/** The test: the interpreter and tier 2 give an error, and the module gives its error at each key. */
function failsAtEach<T>(tiers: readonly Tier<T>[], space: Space): void {
  const [interpreter, second, module] = tiers;
  if (interpreter === undefined || second === undefined || module === undefined) throw new Error("Give three tiers.");
  expect(() => interpreter(space)).toThrow(/#NUM!|#ARGS/);
  expect(() => second(space)).toThrow(/#NUM!|#ARGS/);
  expect(module(space)).toEqual(space.keys.map(() => ({ vexError: true })));
}

/** A box with no children and no container. */
const flat = (x: number, y: number, width: number, height: number, more: Partial<OverlapNode> = {}): OverlapNode => ({ x, y, width, height, container: -1, clip: false, last: -1, nested: false, ...more });

/** This function gives one group of `n` equal boxes at the position `x`, for `n(n - 1) / 2` pairs. */
const pile = (n: number, x: number): OverlapNode[] => Array.from({ length: n }, () => flat(x, 0, 10, 10));

describe("the overlap audit of ireko", () => {
  const tiers = tiersOf<OverlapValue>(OVERLAP_PROGRAM, OVERLAP_DOMAINS, OVERLAP_SCHEMA, "overlapsOf");

  /** The test: each tier gives the findings of ireko at each node. */
  const agrees = (nodes: readonly OverlapNode[]): void => {
    const expected = overlapsOf(nodes);
    for (const tier of tiers) {
      const values = tier(overlapRun(nodes).space);
      expect(values.map((value) => overlapOutput([value]))).toEqual(nodes.map(() => expected));
      expect(overlapOutput(values)).toEqual(expected);
    }
  };

  it("COMPILE.MODULE: the program gives the pairs of ireko, in its order, in the interpreter, in tier 2 and in the module", () => {
    fc.assert(fc.property(overlapTree, agrees));
    expect.hasAssertions();
  });

  it("gives no findings for no nodes", () => {
    expect(overlapOutput([])).toEqual({ pairs: [], count: 0 });
    agrees([]);
  });

  it("finds two boxes only past the tolerance", () => {
    expect(overlapsOf([flat(0, 0, 10, 10), flat(9.5, 0, 10, 10)]).count).toBe(0);
    expect(overlapsOf([flat(0, 0, 10, 10), flat(9.4, 0, 10, 10)]).pairs).toEqual([[0, 1]]);
    agrees([flat(0, 0, 10, 10), flat(9.5, 0, 10, 10)]);
    agrees([flat(0, 0, 10, 10), flat(9.4, 0, 10, 10)]);
    agrees([flat(0, 0, 10, 10), flat(0, 9.5, 10, 10)]);
    agrees([flat(0, 0, 10, 10), flat(0, 9.4, 10, 10)]);
  });

  it("gives the pairs of ireko for each two boxes with ties at the tolerance", () => {
    const boxes = [0, 9.5].flatMap((x) => [0, 9.5].flatMap((y) => [0.5, 10].flatMap((w) => [0.5, 10].map((h) => flat(x, y, w, h)))));
    for (const a of boxes) for (const b of boxes) agrees([a, b]);
    expect.hasAssertions();
  });

  it("sweeps along x when the two densities are equal", () => {
    const nodes = [flat(0, 2, 10, 10), flat(1, 0, 10, 10), flat(2, 1, 10, 10)];
    expect(overlapsOf(nodes).pairs).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    agrees(nodes);
  });

  it("keeps the order of the nodes for equal starts", () => {
    const nodes = [flat(5, 0, 10, 10), flat(0, 0, 10, 10), flat(0, 1, 10, 10), flat(-0, 2, 10, 10)];
    expect(overlapsOf(nodes).pairs).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    agrees(nodes);
  });

  it("finds an overlap in a column of boxes, where the sweep goes along y", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => flat(0, i * 20, 100, i === 7 ? 40 : 10));
    expect(overlapsOf(nodes).pairs).toEqual([[7, 8]]);
    agrees(nodes);
  });

  it("accepts a container over its own children and grandchildren, and finds a linked parent", () => {
    const nested = [flat(0, 0, 100, 100, { last: 1, nested: true }), flat(10, 10, 50, 50, { container: 0, last: 2, nested: true }), flat(20, 20, 10, 10, { container: 1 })];
    expect(overlapsOf(nested).count).toBe(0);
    agrees(nested);
    const linked = [flat(0, 0, 100, 100, { last: 1 }), flat(10, 10, 50, 50)];
    expect(overlapsOf(linked).pairs).toEqual([[0, 1]]);
    agrees(linked);
  });

  it("accepts a child that starts before its container, and finds the node after the subtree", () => {
    const early = [flat(10, 0, 50, 50, { last: 1, nested: true }), flat(0, 0, 20, 20, { container: 0 })];
    expect(overlapsOf(early).count).toBe(0);
    agrees(early);
    const after = [flat(0, 0, 50, 50, { nested: true }), flat(10, 10, 5, 5)];
    expect(overlapsOf(after).pairs).toEqual([[0, 1]]);
    agrees(after);
  });

  it("counts only the visible part of a box in a clipped container", () => {
    const root = flat(0, 0, 100, 100, { last: 2, nested: true, clip: true });
    const hidden = [root, flat(200, 0, 50, 50, { container: 0 }), flat(210, 0, 50, 50, { container: 0 })];
    expect(overlapsOf(hidden).count).toBe(0);
    agrees(hidden);
    const shown = [root, flat(90, 0, 50, 50, { container: 0 }), flat(95, 0, 50, 50, { container: 0 })];
    expect(overlapsOf(shown).pairs).toEqual([[1, 2]]);
    agrees(shown);
  });

  it("drops a box in a clipped container with no visible width or height", () => {
    const root = flat(0, 0, 100, 100, { last: 2, nested: true, clip: true });
    for (const box of [flat(50, 0, 0, 20, { container: 0 }), flat(0, 10, 20, 0, { container: 0 })]) {
      const nodes = [root, box, flat(40, 0, 20, 20, { container: 0 })];
      expect(overlapsOf(nodes).count).toBe(0);
      agrees(nodes);
    }
  });

  it("gives a clip to the nodes below a nested container in the clipped container", () => {
    const nodes = [flat(0, 0, 100, 100, { last: 1, nested: true, clip: true }), flat(0, 0, 300, 300, { container: 0, last: 3, nested: true }), flat(150, 0, 50, 50, { container: 1 }), flat(160, 0, 50, 50, { container: 1 })];
    expect(overlapsOf(nodes).count).toBe(0);
    agrees(nodes);
  });

  it("keeps the first 100 pairs and counts all of them", () => {
    const hundred = [...pile(14, 0), ...pile(4, 100), ...pile(3, 200)];
    expect(overlapsOf(hundred).count).toBe(100);
    agrees(hundred);
    const more = [...pile(14, 0), ...pile(5, 100)];
    const found = overlapsOf(more);
    expect(found.count).toBe(101);
    expect(found.pairs).toHaveLength(100);
    agrees(more);
    const past = [...pile(14, 0), ...pile(6, 100), ...pile(2, 200)];
    expect(overlapsOf(past).count).toBe(107);
    agrees(past);
  });

  it("gives an error at each node for a sum that is not finite, where ireko keeps the infinite number", () => {
    const nodes = [flat(1e308, 0, 1.7e308, 10), flat(0, 0, 10, 10), flat(5, 0, 10, 10)];
    expect(overlapsOf(nodes).pairs).toEqual([[1, 2]]);
    failsAtEach(tiers, overlapRun(nodes).space);
    // A sum of the sizes also overflows, with no box that does.
    const wide = [flat(-1e308, 0, 1.5e308, 10), flat(-5e307, 0, 1.5e308, 10)];
    expect(overlapsOf(wide).pairs).toEqual([[0, 1]]);
    failsAtEach(tiers, overlapRun(wide).space);
  });
});

describe("the final bounds of ireko", () => {
  const tiers = tiersOf<BoundsRect>(BOUNDS_PROGRAM, BOUNDS_DOMAINS, BOUNDS_SCHEMA, "boundsOf");

  /** The test: each tier gives the bounds of ireko at each rectangle, with the same bits. */
  const agrees = (nodes: readonly BoundsRect[], points: readonly { readonly x: number; readonly y: number }[]): void => {
    const expected = finalBounds(nodes, points);
    for (const tier of tiers) {
      const values = tier(boundsRun(nodes, points).space);
      expect(values).toEqual([...nodes, ...points].map(() => expected));
      expect(boundsOutput(values)).toEqual(expected);
    }
  };

  it("COMPILE.MODULE: the program gives the bounds of ireko with the same bits in the interpreter, in tier 2 and in the module", () => {
    fc.assert(fc.property(boundsInput, ({ nodes, points }) => agrees(nodes, points)));
    expect.hasAssertions();
  });

  it("gives the empty rectangle for no rectangles", () => {
    expect(boundsOutput([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    agrees([], []);
  });

  it("keeps the bits of the first rectangle, and a sum of a later rectangle rounds as in ireko", () => {
    const one = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    expect(finalBounds([one], []).width).toBe(0.2);
    agrees([one], []);
    expect(finalBounds([one, one], []).width).toBe(0.1 + 0.2 - 0.1);
    agrees([one, one], []);
  });

  it("cleans a number that is almost 0 and -0", () => {
    const nodes = [{ x: -0, y: 1e-10, width: 5e-10, height: 1e-9 }];
    expect(finalBounds(nodes, [])).toEqual({ x: 0, y: 0, width: 0, height: 1e-9 });
    agrees(nodes, []);
  });

  it("counts a point of an edge as a rectangle with no size", () => {
    const nodes = [{ x: 0, y: 0, width: 10, height: 10 }];
    expect(finalBounds(nodes, [{ x: 20, y: -5 }])).toEqual({ x: 0, y: -5, width: 20, height: 15 });
    agrees(nodes, [{ x: 20, y: -5 }]);
    agrees([], [{ x: 3, y: 4 }]);
  });

  it("gives an error at each rectangle for a sum that is not finite, where ireko keeps the infinite number", () => {
    const nodes = [
      { x: 1e308, y: 0, width: 1.7e308, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 },
    ];
    expect(finalBounds(nodes, []).width).toBe(Infinity);
    failsAtEach(tiers, boundsRun(nodes, []).space);
  });
});

describe("the edges between children of ireko", () => {
  const tiers = tiersOf<BetweenValue>(BETWEEN_PROGRAM, BETWEEN_DOMAINS, BETWEEN_SCHEMA, "betweenOf");

  /** The test: each tier gives the record of ireko. */
  const agrees = (parents: readonly number[], edges: readonly TreeEdge[]): void => {
    const expected = edgesBetween(parents, edges);
    for (const tier of tiers) expect(betweenOutput(parents.length, tier(betweenRun(parents, edges).space))).toEqual(expected);
  };

  //        0
  //     1     4
  //    2 3    5
  const parents = [-1, 0, 1, 1, 0, 4];

  it("COMPILE.MODULE: the program gives the record of ireko in the interpreter, in tier 2 and in the module", () => {
    fc.assert(fc.property(betweenInput, (i) => agrees(i.parents, i.edges)));
    expect.hasAssertions();
  });

  it("gives empty lists for no edges", () => {
    expect(edgesBetween(parents, [])).toEqual({ between: [[], [], [], [], [], []], owner: [] });
    agrees(parents, []);
  });

  it("gives an edge to the lowest common ancestor, with the places of the two children", () => {
    const edges = [
      { source: 2, target: 3 },
      { source: 3, target: 2 },
      { source: 2, target: 5 },
      { source: 5, target: 3 },
    ];
    expect(edgesBetween(parents, edges)).toEqual({
      between: [
        [
          { from: 0, to: 1 },
          { from: 1, to: 0 },
        ],
        [
          { from: 0, to: 1 },
          { from: 1, to: 0 },
        ],
        [],
        [],
        [],
        [],
      ],
      owner: [1, 1, 0, 0],
    });
    agrees(parents, edges);
  });

  it("gives no owner to a self edge and to an edge with an end at the ancestor", () => {
    const edges = [
      { source: 3, target: 3 },
      { source: 1, target: 3 },
      { source: 3, target: 1 },
      { source: 0, target: 5 },
      { source: 5, target: 0 },
    ];
    expect(edgesBetween(parents, edges).owner).toEqual([-1, -1, -1, -1, -1]);
    agrees(parents, edges);
  });

  it("walks a long chain", () => {
    const chain = Array.from({ length: 2000 }, (_, i) => (i === 1000 ? 0 : i - 1));
    expect(edgesBetween(chain, [{ source: 999, target: 1999 }]).owner).toEqual([0]);
    agrees(chain, [{ source: 999, target: 1999 }]);
  });
});

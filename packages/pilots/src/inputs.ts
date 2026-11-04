/**
 * The inputs of the tests of the pilots: the random inputs of fast-check, and the fixed inputs of the tests. The tests
 * give them to the interpreter, to tier 1 or to a `SheetRun`. The tests and the script `bench/fallback-share.ts` read
 * them here. Thus the script uses the inputs of the tests for each program. The package root does not export this module.
 */
import * as fc from "fast-check";
import { Vec2 } from "@mark1russell7/vex-domains";
import type { Part } from "./bom.ts";
import type { ForceNode, ForceOptions } from "./force.ts";
import type { SchoolClass } from "./grades.ts";
import type { HeatGrid } from "./heat.ts";
import type { Field, Invoice } from "./invoice.ts";
import type { Band } from "./ireko-band.ts";
import type { PlacedBox } from "./ireko-audit.ts";
import type { GridInput } from "./ireko-grid.ts";
import type { LayersEdge, LayersInput } from "./ireko-layers.ts";
import type { FitChild, MeasureVars } from "./ireko-measure.ts";
import type { PlaceRecord, PlaceVars } from "./ireko-place.ts";
import { PAIRWISE_LIMIT, type RadialChild, type RadialInput } from "./ireko-radial.ts";
import { boxShape, MAX_BANDS, moveShape, type Shape, type ShapeRecord } from "./ireko-shapes.ts";
import type { LoanMonth, LoanTerms } from "./loan.ts";

// The audit pilot (ireko-audit.test.ts).

/**
 * Random placed trees. The container of a node is an earlier node or -1, as in the pre-order of ireko. A node is near
 * its container, so some nodes are inside, some are outside, and some are at the tolerance.
 */
export const auditTree: fc.Arbitrary<PlacedBox[]> = fc
  .array(
    fc.record({
      parent: fc.nat(),
      orphan: fc.boolean(),
      dx: fc.oneof(fc.constantFrom(-0.5, -0.25, 0, 0.5), fc.double({ min: -20, max: 60, noNaN: true, noDefaultInfinity: true })),
      dy: fc.oneof(fc.constantFrom(-0.5, 0, 0.5), fc.double({ min: -20, max: 60, noNaN: true, noDefaultInfinity: true })),
      width: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      height: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      clip: fc.boolean(),
    }),
    { minLength: 1, maxLength: 24 },
  )
  .map((rows) => {
    const out: PlacedBox[] = [];
    rows.forEach((r, i) => {
      const container = i === 0 || r.orphan ? -1 : r.parent % i;
      const c = out[container];
      out.push({ x: (c?.x ?? 0) + r.dx, y: (c?.y ?? 0) + r.dy, width: r.width, height: r.height, container, clip: r.clip });
    });
    return out;
  });

// The grid pilot (ireko-grid.test.ts).

const gridSize = fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true });
const gridCoord = fc.double({ min: -200, max: 200, noNaN: true, noDefaultInfinity: true });

/** Random inputs of the strategy `grid`. */
export const gridInput: fc.Arbitrary<GridInput> = fc.record({
  mode: fc.constantFrom("nested", "linked"),
  self: fc.record({ width: gridSize, height: gridSize }),
  extents: fc.array(fc.record({ x: gridCoord, y: gridCoord, width: gridSize, height: gridSize }), { minLength: 1, maxLength: 12 }),
  gap: fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
  options: fc.record({
    columns: fc.integer({ min: 0, max: 14 }),
    justify: fc.constantFrom("start", "center", "end"),
    align: fc.constantFrom("auto", "start", "center", "end"),
    uniform: fc.boolean(),
    side: fc.constantFrom("bottom", "top", "left", "right"),
    distance: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true })),
  }),
});

/** The three children of the fixed cases of the grid: two columns 12 and 11 wide, and two rows 5 high. */
export const GRID_THREE: GridInput["extents"] = [0, 1, 2].map((k) => ({ x: 0, y: 0, width: 10 + k, height: 5 }));

/** The options of the fixed cases of the grid. */
export const GRID_FIXED_OPTIONS: GridInput["options"] = { columns: 0, justify: "center", align: "auto", uniform: false, side: "bottom", distance: 0 };

/** The fixed linked case of the grid, which the test gives to the interpreter. */
export const GRID_LINKED: GridInput = { mode: "linked", self: { width: 20, height: 4 }, extents: GRID_THREE, gap: 2, options: GRID_FIXED_OPTIONS };

// The radial pilot (ireko-radial.test.ts).

const radialSize = fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true });
const radialCoord = fc.double({ min: -200, max: 0, noNaN: true, noDefaultInfinity: true });
const radialChild: fc.Arbitrary<RadialChild> = fc.record({ box: fc.record({ width: radialSize, height: radialSize }), extent: fc.record({ x: radialCoord, y: radialCoord, width: radialSize, height: radialSize }) });
const radialBase = {
  mode: fc.constantFrom<"nested" | "linked">("nested", "linked"),
  self: fc.record({ width: radialSize, height: radialSize }),
  gap: fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
};
const radialOptions = (sweep: fc.Arbitrary<number>): fc.Arbitrary<RadialInput["options"]> =>
  fc.record({
    startAngle: fc.oneof(fc.constant(-90), fc.double({ min: -360, max: 360, noNaN: true, noDefaultInfinity: true })),
    sweep,
    clockwise: fc.boolean(),
    distance: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true })),
  });

/** A full ring or a part of a ring, with 1 to `most` children. */
export const radialRing = (most: number): fc.Arbitrary<RadialInput> =>
  fc.record({ ...radialBase, children: fc.array(radialChild, { minLength: 1, maxLength: most }), options: radialOptions(fc.oneof(fc.constant(360), fc.constant(180), fc.double({ min: 1, max: 360, noNaN: true }))) });

/** A full ring with more children than the limit of the search of ireko. */
export const radialLarge: fc.Arbitrary<RadialInput> = fc.record({ ...radialBase, children: fc.array(radialChild, { minLength: PAIRWISE_LIMIT + 1, maxLength: PAIRWISE_LIMIT + 8 }), options: radialOptions(fc.constant(360)) });

const square: RadialChild = { box: { width: 10, height: 10 }, extent: { x: 0, y: 0, width: 10, height: 10 } };
const bigChild: RadialChild = { box: { width: 200, height: 200 }, extent: { x: 0, y: 0, width: 200, height: 200 } };
const tinyChild: RadialChild = { box: { width: 4, height: 4 }, extent: { x: 0, y: 0, width: 4, height: 4 } };
const halfRing = { startAngle: 0, sweep: 180, clockwise: true, distance: 0 };

/** Two children on a half ring: each part is 90 degrees, so the children are at 45 and 135 degrees. */
export const RADIAL_TWO: RadialInput = { mode: "nested", self: { width: 0, height: 0 }, children: [square, square], gap: 0, options: halfRing };

/** A full ring of a large child and small children: the pairs make the search double the radius. */
export const RADIAL_MIXED: RadialInput = { mode: "linked", self: { width: 30, height: 20 }, children: [bigChild, tinyChild, bigChild, tinyChild, tinyChild, bigChild], gap: 6, options: { ...halfRing, sweep: 360 } };

// The measure pilot (ireko-measure.test.ts).

const measureCoord = fc.oneof(fc.integer({ min: -400, max: 400 }), fc.double({ min: -400, max: 400, noNaN: true, noDefaultInfinity: true }));
const measureSize = fc.oneof(fc.integer({ min: 1, max: 400 }), fc.double({ min: 1e-3, max: 400, noNaN: true, noDefaultInfinity: true }));
const measureSpace0 = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 40 }), fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }));

/** A random child of a node of the measure pass: its offset and its extent. */
export const fitChild: fc.Arbitrary<FitChild> = fc.record({ offset: fc.record({ x: measureCoord, y: measureCoord }), extent: fc.record({ x: measureCoord, y: measureCoord, width: measureSize, height: measureSize }) });

/** The random variables of a node of the measure pass. */
export const measureVars: fc.Arbitrary<MeasureVars> = fc
  .record({
    linked: fc.boolean(),
    content: fc.boolean(),
    area: fc.record({ x: measureCoord, y: measureCoord, width: measureSize, height: measureSize }),
    own: fc.record({ width: measureSize, height: measureSize }),
    explicit: fc.record({ width: fc.oneof(fc.constant(0), measureSize), height: fc.oneof(fc.constant(0), measureSize) }),
    node: fc.record({ width: fc.option(fc.oneof(measureSize, fc.constant(1), fc.constant(2))), height: fc.option(fc.oneof(measureSize, fc.constant(1), fc.constant(2))) }),
    padding: measureSpace0,
    header: measureSpace0,
    fit: fc.constantFrom("grow", "scale", "clip"),
  })
  .map((r) => ({
    linked: r.linked,
    content: r.content,
    cx: r.content ? r.area.x : 0,
    cy: r.content ? r.area.y : 0,
    cw: r.content ? r.area.width : 0,
    ch: r.content ? r.area.height : 0,
    ownW: r.own.width,
    ownH: r.own.height,
    expW: r.explicit.width,
    expH: r.explicit.height,
    hasW: r.node.width !== null,
    hasH: r.node.height !== null,
    nodeW: r.node.width ?? 0,
    nodeH: r.node.height ?? 0,
    padding: r.padding,
    header: r.header,
    grow: r.fit === "grow",
    scale: r.fit === "scale",
    clip: r.fit === "clip",
  }));

// The place pilot (ireko-place.test.ts).

const placeCoord = fc.oneof(fc.integer({ min: -400, max: 400 }), fc.double({ min: -400, max: 400, noNaN: true, noDefaultInfinity: true }));
const placeSize = fc.oneof(fc.integer({ min: 1, max: 400 }), fc.double({ min: 1e-3, max: 400, noNaN: true, noDefaultInfinity: true }));
const placeScale = fc.oneof(fc.constant(1), fc.double({ min: 1e-3, max: 1, noNaN: true, noDefaultInfinity: true }));
const placeNode = fc.record({ px: placeCoord, py: placeCoord, ps: placeScale, bw: placeSize, bh: placeSize, nested: fc.boolean() });

/**
 * A tree in the pre-order of ireko, with up to `most` nodes. Each node after the root has a parent before it. A choice
 * of the last nodes as parents makes deep chains, and a choice of the first nodes makes wide trees.
 */
export const placeTreeInput = (most: number): fc.Arbitrary<{ readonly records: PlaceRecord[]; readonly vars: PlaceVars }> =>
  fc
    .record({
      nodes: fc.array(fc.tuple(placeNode, fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), fc.boolean()), { minLength: 1, maxLength: most }),
      vars: fc.record({ ox: placeCoord, oy: placeCoord }),
    })
    .map(({ nodes, vars }) => ({
      records: nodes.map(([r, pick, deep], i) => {
        const p = i === 0 ? -1 : deep ? Math.max(0, i - 1 - Math.floor(pick * 3)) : Math.floor(pick * i);
        // The root has the identity placement, as in ireko.
        return i === 0 ? { ...r, p, px: 0, py: 0, ps: 1 } : { ...r, p };
      }),
      vars,
    }));

// The shapes pilot (ireko-shapes.test.ts).

/** A whole number, a number with a fraction, or a negative zero: the bits of each one count. */
export const shapeCoord: fc.Arbitrary<number> = fc.oneof(fc.integer({ min: -60, max: 60 }), fc.double({ min: -60, max: 60, noNaN: true, noDefaultInfinity: true }), fc.constant(-0));
const shapeSize = fc.oneof(fc.integer({ min: 0, max: 40 }), fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }));
/** An infinite number, as ireko keeps on a band that overflows. */
const infinite = fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);
/** A size, or sometimes `Infinity`: the box of a node that overflows. */
export const shapeExtent: fc.Arbitrary<number> = fc.oneof({ arbitrary: shapeSize, weight: 9 }, { arbitrary: fc.constant(Number.POSITIVE_INFINITY), weight: 1 });
const shapeNode = fc.record({ wants: fc.boolean(), linked: fc.boolean(), w: shapeExtent, h: shapeExtent, ox: shapeCoord, oy: shapeCoord, ex: shapeCoord, ey: shapeCoord, ew: shapeExtent, eh: shapeExtent });

/**
 * A tree in the pre-order of ireko, with up to `most` nodes. Each node after the root has a parent before it. A choice
 * of the last nodes as parents makes deep chains, and a choice of the first nodes makes wide trees.
 */
export const shapeTree = (most: number): fc.Arbitrary<ShapeRecord[]> =>
  fc.array(fc.tuple(shapeNode, fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), fc.boolean()), { minLength: 1, maxLength: most }).map((nodes) =>
    nodes.map(([r, pick, deep], i) => ({ ...r, p: i === 0 ? -1 : deep ? Math.max(0, i - 1 - Math.floor(pick * 3)) : Math.floor(pick * i) })),
  );

/** The limit of the bands: the largest limit, or a small limit from 1 to `most`. */
export const bandLimit = (most: number): fc.Arbitrary<number> => fc.oneof(fc.constant(MAX_BANDS), fc.integer({ min: 1, max: most }));

/** This function gives a leaf of the shapes pilot, with the parent `p` and the changes `more`. */
export const shapeLeaf = (p: number, more: Partial<ShapeRecord> = {}): ShapeRecord => ({ p, wants: false, linked: true, w: 10, h: 10, ox: 0, oy: 0, ex: 0, ey: 0, ew: 10, eh: 10, ...more });

/** The fixed tree with boxes that overflow: the child a1 of the node a has an infinite width, and a2 an infinite height. */
export const SHAPES_INFINITE: readonly ShapeRecord[] = [
  shapeLeaf(-1, { wants: true, w: 100, h: 20 }),
  shapeLeaf(0, { w: 10, h: 10 }),
  shapeLeaf(1, { w: Number.POSITIVE_INFINITY, h: 5, ox: 3, oy: 15 }),
  shapeLeaf(1, { linked: false, w: 4, h: Number.POSITIVE_INFINITY, ox: 0, oy: 30 }),
  shapeLeaf(3, { w: 2, h: 2 }),
];

/** A child of a node for the program of one node: its offset, and its shape as two lists of bands. */
export interface ShapeChild {
  readonly ox: number;
  readonly oy: number;
  readonly shape: Shape;
}

/** This function gives a list of bands as a `vex.list` of plain data. */
export const bandList = (bands: readonly Band[]): object => ({ kind: "vex.list", items: bands.map((b, k) => ({ key: String(k), result: { ok: true, value: b } })) });

/** This function gives the record of a child, as the measure loop of ireko gives it to the program of one node. */
export const childRecord = (c: ShapeChild): object => ({ ox: c.ox, oy: c.oy, rows: bandList(c.shape.rows), cols: bandList(c.shape.columns) });

/**
 * An end of a band. The `Set` of the cuts of ireko turns -0 into 0, and the program keeps -0. A shape of ireko has no
 * end -0: a box starts at 0, and a sum is -0 only for two terms -0. Thus an end here is not -0. An end is sometimes
 * infinite, as on a band that overflows.
 */
const bandEnd = fc.oneof({ arbitrary: shapeCoord.map((x) => (x === 0 ? 0 : x)), weight: 9 }, { arbitrary: infinite, weight: 1 });
const bandAcross = fc.oneof({ arbitrary: shapeCoord, weight: 9 }, { arbitrary: infinite, weight: 1 });
const band = fc.record({ from: bandEnd, to: bandEnd, min: bandAcross, max: bandAcross });

/** A random child of a node, with up to 4 bands on each axis. */
export const shapeChild: fc.Arbitrary<ShapeChild> = fc.record({ ox: shapeCoord, oy: shapeCoord, shape: fc.record({ rows: fc.array(band, { maxLength: 4 }), columns: fc.array(band, { maxLength: 4 }) }) });

/** The children of the fixed node, which the test gives to the interpreter with the variables `w: 100, h: 20, limit: 2`. */
export const NODE_FIXED_KIDS: readonly ShapeChild[] = [
  { ox: 0, oy: 30, shape: boxShape(10, 10) },
  { ox: 20, oy: 15, shape: moveShape(boxShape(30, 5), 2, -0) },
  { ox: 60, oy: 30, shape: { rows: [], columns: [{ from: 0, to: 4, min: 1, max: 2 }] } },
];

const inf = Number.POSITIVE_INFINITY;

/** The fixed nodes with infinite ends: the children, and the width and the height of the box of each node. */
export const NODE_INFINITE: readonly (readonly [readonly ShapeChild[], number, number])[] = [
  // The case of the tracker item SHAPEINF: a band to Infinity and a band with an infinite max.
  [[{ ox: 0, oy: 0, shape: { rows: [{ from: 0, to: inf, min: 0, max: 5 }, { from: 3, to: 8, min: -1, max: inf }], columns: [] } }], 1, 1],
  // A band from -Infinity with a min of -Infinity, a band of all the axis, and a band from Infinity, which has no size.
  [[{ ox: 2, oy: 1, shape: { rows: [{ from: -inf, to: 4, min: -inf, max: 0 }, { from: -inf, to: inf, min: 1, max: 2 }, { from: inf, to: inf, min: 0, max: 1 }], columns: [] } }], 10, 4],
  // A box of the node that overflows on both axes covers the box of its child.
  [[{ ox: 0, oy: 6, shape: boxShape(2, 2) }], inf, inf],
];

// The schema pilot (schema.test.ts).

/** Random JSON values up to the depth 4. The keys collide on purpose: "x.y" next to x: { y }, "", __proto__ and constructor. */
const KEYS = ["a", "b", "x", "y", "x.y", "", "_id", "__proto__", "constructor"] as const;
const arbs = fc.letrec<{ json: unknown; array: unknown[]; object: Record<string, unknown> }>((tie) => ({
  json: fc.oneof({ maxDepth: 4, depthIdentifier: "json" }, fc.constant(null), fc.boolean(), fc.integer({ min: -2, max: 2 }), fc.constantFrom("", "s", "t"), tie("array"), tie("object")),
  array: fc.array(tie("json"), { maxLength: 3, depthIdentifier: "json" }),
  // Object.fromEntries gives an own field also for the key __proto__, as JSON.parse does.
  object: fc.array(fc.tuple(fc.constantFrom(...KEYS), tie("json")), { maxLength: 4, depthIdentifier: "json" }).map((entries) => Object.fromEntries(entries)),
}));

/** Random samples of up to 5 documents: mostly objects, and sometimes other JSON values. */
export const schemaDocs: fc.Arbitrary<unknown[]> = fc.array(fc.oneof({ arbitrary: arbs.object, weight: 4 }, { arbitrary: arbs.json, weight: 1 }), { maxLength: 5 });

/** A small example of the schema pilot: two documents. */
export const SCHEMA_EXAMPLE: readonly unknown[] = [
  { _id: "a", n: 1, tags: ["x"], o: { p: true } },
  { _id: "b", n: "2", o: {} },
];

/** Documents past the depth 3, with null fields and items, nested and empty arrays, and a document that is not an object. */
export const SCHEMA_DEEP: readonly unknown[] = [
  { a: { b: { c: { d: 1 } } }, z: [1, null, "s", [2], {}], e: [] },
  { a: { b: 2 }, z: null },
  "notadoc",
  { a: { b: { c: {} } }, "x.y": 1, x: { y: "t" } },
];

/** Null and array documents, and the keys __proto__, constructor and the empty key. */
export const SCHEMA_ODD_KEYS: readonly unknown[] = [null, [1, 2], JSON.parse('{"__proto__":{"p":1},"":{"q":[null]},"constructor":"c"}') as unknown, 7];

/** This function gives 20 documents of 30 fields, the size of a sample. */
export const schemaSample = (): Record<string, unknown>[] =>
  Array.from({ length: 20 }, (_doc, d) => Object.fromEntries(Array.from({ length: 30 }, (_field, f) => [`f${f}`, f % 3 === 0 ? { a: { b: [d, "x"] } } : f % 3 === 1 ? d : [d, null]])));

// The force pilot (force.test.ts).

/** This function gives a node of the force pilot. */
export const forceNode = (id: string, x: number, y: number): ForceNode => ({ id, pos: new Vec2(x, y) });

/** A graph of the force pilot: its nodes by key, and the successors of each node. */
export interface ForceGraph {
  readonly nodes: Record<string, ForceNode>;
  readonly edges: Record<string, readonly string[]>;
}

const forceCoord = fc.integer({ min: -20, max: 20 });

/** Random graphs of 1 to 6 nodes, with up to 3 edges from a node. */
export const forceGraph: fc.Arbitrary<ForceGraph> = fc
  .array(fc.tuple(forceCoord, forceCoord), { minLength: 1, maxLength: 6 })
  .chain((points) => {
    const keys = points.map((_p, i) => `n${String(i)}`);
    const nodes = Object.fromEntries(points.map(([x, y], i) => [`n${String(i)}`, forceNode(`n${String(i)}`, x, y)]));
    return fc.dictionary(fc.constantFrom(...keys), fc.array(fc.constantFrom(...keys), { maxLength: 3 })).map((edges) => ({ nodes, edges }));
  });

/** Random tunings of the layout. */
export const forceOptions: fc.Arbitrary<ForceOptions> = fc.record({
  steps: fc.integer({ min: 0, max: 6 }),
  repel: fc.double({ min: 0, max: 3, noNaN: true }),
  spring: fc.double({ min: 0, max: 0.5, noNaN: true }),
  center: fc.double({ min: 0, max: 0.2, noNaN: true }),
});

/** The fixed graph of the test of the interpreter: the edges have a duplicate, a loop on one node and a cycle. */
export const FORCE_FIXED: ForceGraph = {
  nodes: { a: forceNode("a", 0, 0), b: forceNode("b", 1, 0), c: forceNode("c", 3, 1), d: forceNode("d", -2, 2) },
  edges: { a: ["b", "b", "a"], b: ["c"], c: ["a"] },
};

/** The input of the program of the force pilot over a graph space. */
export interface ForceInput {
  readonly nodes: Record<string, ForceNode>;
  readonly edges: Record<string, readonly string[]>;
  readonly records: readonly { readonly id: string; readonly pos: { readonly x: number; readonly y: number } }[];
  readonly ends: readonly (readonly number[])[];
}

/**
 * This function gives the input of the program over a graph space. The input has the records in key order, and the
 * positions of the ends of the edges. In a module, the key of a record is the text of its position. Thus the nodes and the edges get
 * these keys too.
 */
export function forceInput(nodes: Readonly<Record<string, ForceNode>>, edges: Readonly<Record<string, readonly string[]>>): ForceInput {
  const keys = Object.keys(nodes);
  const at = (k: string): string => String(keys.indexOf(k));
  const points = Object.values(nodes).map((x) => x.pos);
  const records = points.map((p, i) => ({ id: String(i), pos: { x: p.x, y: p.y } }));
  return {
    nodes: Object.fromEntries(points.map((p, i) => [String(i), forceNode(String(i), p.x, p.y)])),
    edges: Object.fromEntries(Object.entries(edges).map(([k, e]) => [at(k), e.map(at)])),
    records,
    ends: keys.map((k) => (edges[k] ?? []).map((j) => keys.indexOf(j))),
  };
}

// The heat pilot (heat.test.ts).

/** A random grid from 1 by 1 to 6 by 6, with temperatures from -100 to 100. */
export const heatGrid: fc.Arbitrary<number[][]> = fc
  .tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }))
  .chain(([rows, cols]) => fc.array(fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: cols, maxLength: cols }), { minLength: rows, maxLength: rows }));

/** A random value of alpha, up to 1/4. */
export const heatAlpha: fc.Arbitrary<number> = fc.double({ min: 0, max: 0.25, noNaN: true });

/** A random number of steps. */
export const heatSteps: fc.Arbitrary<number> = fc.integer({ min: 0, max: 6 });

/** The grid of the hand-checked case: heat only in the center cell of a 3 by 3 grid. */
export const HEAT_CENTER: HeatGrid = [
  [0, 0, 0],
  [0, 100, 0],
  [0, 0, 0],
];

// The spreadsheet pilots (bom.test.ts, grades.test.ts, invoice.test.ts and loan.test.ts).

/** A random product: each part after the first has an earlier part as its parent, or it is another top assembly. */
export const bomProduct: fc.Arbitrary<Part[]> = fc
  .array(fc.record({ parent: fc.nat(), top: fc.boolean(), qty: fc.integer({ min: 1, max: 6 }), cost: fc.integer({ min: 0, max: 10000 }).map((n) => n / 100) }), { minLength: 1, maxLength: 14 })
  .map((rows) => rows.map((r, i) => ({ id: `p${i}`, qty: r.qty, cost: r.cost, ...(i === 0 || r.top ? {} : { parent: `p${r.parent % i}` }) })));

/**
 * The bike of the hand-checked case: the bike (labor 100) has 2 wheels (20) and 1 seat (15). A wheel has 32 spokes
 * (0.25) and 1 tube (5).
 */
export const BOM_BIKE: readonly Part[] = [
  { id: "bike", qty: 1, cost: 100 },
  { id: "wheel", parent: "bike", qty: 2, cost: 20 },
  { id: "spoke", parent: "wheel", qty: 32, cost: 0.25 },
  { id: "tube", parent: "wheel", qty: 1, cost: 5 },
  { id: "seat", parent: "bike", qty: 1, cost: 15 },
];

/** The bike with a tube that has no quantity. */
export const BOM_BROKEN: readonly Part[] = BOM_BIKE.map((p) => (p.id === "tube" ? ({ id: "tube", parent: "wheel", cost: 5 } as unknown as Part) : p));

/** Random classes with unique names and scores from 0 to 100, so ties are common. */
export const gradeSchool: fc.Arbitrary<SchoolClass[]> = fc
  .array(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 4 })
  .map((classes) => classes.map((scores, i) => ({ name: `class${i}`, students: scores.map((score, j) => ({ name: `s${j}`, score })) })));

/** The classes of the hand-checked case. */
export const GRADE_CLASSES: readonly SchoolClass[] = [
  { name: "maths", students: [{ name: "ada", score: 94 }, { name: "bo", score: 81 }, { name: "cy", score: 81 }] },
  { name: "art", students: [{ name: "di", score: 70 }, { name: "ed", score: 90 }] },
];

/** A field that is mostly a number, sometimes text, and sometimes no value. */
const field = (n: fc.Arbitrary<number>): fc.Arbitrary<Field> => fc.oneof({ weight: 8, arbitrary: n }, { weight: 1, arbitrary: fc.constant("n/a") }, { weight: 1, arbitrary: fc.constant(undefined) });

/** Random invoices with bad fields. */
export const invoiceList: fc.Arbitrary<Invoice[]> = fc
  .array(
    fc.record({
      lines: fc.array(fc.record({ qty: field(fc.integer({ min: -2, max: 20 })), price: field(fc.integer({ min: 0, max: 50000 }).map((c) => c / 100)) }), { maxLength: 6 }),
      discount: field(fc.integer({ min: -20, max: 120 }).map((p) => p / 100)),
      // The total is the amount due, a wrong amount, a text or no value.
      total: fc.oneof(fc.constant("due"), fc.integer({ min: 0, max: 100000 }).map((c) => c / 100), fc.constant("n/a"), fc.constant(undefined)),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((list) =>
    list.map((inv, i) => {
      const due = inv.lines.reduce((s, l) => s + (typeof l.qty === "number" && typeof l.price === "number" ? l.qty * l.price : 0), 0) * (1 - (typeof inv.discount === "number" ? inv.discount : 0));
      return { id: `inv${i}`, lines: inv.lines, discount: inv.discount, total: inv.total === "due" ? due : inv.total };
    }),
  );

/** The invoice that is correct: the lines are 2 x 10 and 4 x 10, and 60 x (1 - 0.1) is the total 54. */
export const INVOICE_GOOD: Invoice = { id: "A", total: 54, discount: 0.1, lines: [{ qty: 2, price: 10 }, { qty: 4, price: 10 }] };

/** The invoice with missing and bad fields. */
export const INVOICE_BAD: Invoice = { id: "B", total: "n/a", discount: 1.5, lines: [{ qty: 2, price: undefined }, { qty: "n/a", price: 3 }, { qty: 0, price: 1 }] };

/** A random month of a loan. */
export const loanMonth: fc.Arbitrary<LoanMonth> = fc.record({ payment: fc.integer({ min: 0, max: 600 }), extra: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 300 })) });

/** Random terms of a loan. */
export const loanTerms: fc.Arbitrary<LoanTerms> = fc.record({ principal: fc.integer({ min: 100, max: 20000 }), rate: fc.integer({ min: 0, max: 200 }).map((n) => n / 10000) });

/** The hand-checked loan: 1000 at 1 % a month, with four payments of 260. */
export const LOAN_FOUR: { readonly months: readonly LoanMonth[]; readonly terms: LoanTerms } = { months: Array.from({ length: 4 }, () => ({ payment: 260, extra: 0 })), terms: { principal: 1000, rate: 0.01 } };

/** A long loan of 600 months, for the depth of the stack. */
export const LOAN_LONG: { readonly months: readonly LoanMonth[]; readonly terms: LoanTerms } = { months: Array.from({ length: 600 }, () => ({ payment: 50, extra: 0 })), terms: { principal: 20000, rate: 0.002 } };

// The layers pilot (ireko-layers.test.ts).

const layersCoord = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true });
const layersSize = fc.double({ min: 0, max: 300, noNaN: true, noDefaultInfinity: true });

/**
 * Random edges between `k` children. A dense list has cycles. ireko ignores some of the edges. These are an edge from
 * a child to itself, and an edge with an end that is not a child.
 */
export const layersEdges = (k: number): fc.Arbitrary<LayersEdge[]> => {
  const end = fc.integer({ min: 0, max: Math.max(0, k - 1) });
  const wild = fc.oneof({ arbitrary: end, weight: 19 }, { arbitrary: fc.constantFrom(-1, k), weight: 1 });
  return fc.array(fc.record({ from: wild, to: wild }), { maxLength: 3 * k });
};

/** Random inputs of the strategy `layers`, with up to `most` children. */
export const layersInput = (most: number): fc.Arbitrary<LayersInput> =>
  fc.integer({ min: 1, max: most }).chain((k) =>
    fc.record({
      mode: fc.constantFrom("nested", "linked"),
      self: fc.record({ width: layersSize, height: layersSize }),
      extents: fc.array(fc.record({ x: layersCoord, y: layersCoord, width: layersSize, height: layersSize }), { minLength: k, maxLength: k }),
      gap: fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
      options: fc.record({
        side: fc.constantFrom("bottom", "top", "left", "right"),
        distance: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true })),
        align: fc.constantFrom("center", "start", "end"),
      }),
      edges: layersEdges(k),
    }),
  );

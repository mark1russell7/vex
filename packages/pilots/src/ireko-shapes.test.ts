import { evaluate, isVexList, SheetRun, space } from "@mark1russell7/vex";
import { emitModule, emitSheetModule } from "@mark1russell7/vex-compiler/module";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BandDomain, type Band } from "./ireko-band.ts";
import { irekoRun } from "./ireko-modules.ts";
import { bandLimit, childRecord, NODE_FIXED_KIDS, NODE_INFINITE, shapeChild as child, shapeExtent as extent, shapeLeaf as leaf, SHAPES_INFINITE, shapeTree as tree, type ShapeChild as Child } from "./inputs.ts";
import { boxShape, joinShapes, MAX_BANDS, mergeBands, moveShape, NODE_SCHEMA, NODE_SHAPE, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA, shapeSpace, shapesTree, type Shape, type ShapeRecord } from "./ireko-shapes.ts";

type Columns = Readonly<Record<string, readonly unknown[]>>;
type Run = (records: unknown, vars: unknown, parents: unknown) => Columns;

/** This function gives the run of the standalone module of the sheet, as the build of ireko writes it. */
function moduleOf(): Run {
  const m = emitSheetModule(SHAPE_COLUMNS, { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // need reads the parent, and the bands read the children, so the module has no search.
  expect(m.source).not.toContain("function SH(");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return shapesOf;`)() as Run;
}

/** This function gives the bands of a list of a cell. */
function bandsOf(value: unknown, where: string): Band[] {
  if (!isVexList(value)) throw new Error(`${where} is not a list.`);
  return value.items.map((item, k) => {
    if (!item.result.ok || !BandDomain.is(item.result.value)) throw new Error(`${where} has no band at the item ${String(k)}.`);
    return item.result.value;
  });
}

/** This function gives the shapes from the columns of a run: a node without a need has `undefined`. */
function shapesOf(columns: Columns, n: number): (Shape | undefined)[] {
  return Array.from({ length: n }, (_, i) => {
    const need = columns["need"]?.[i];
    if (typeof need !== "boolean") throw new Error(`The column need has no boolean at ${String(i)}.`);
    if (!need) {
      expect([bandsOf(columns["rows"]?.[i], "rows"), bandsOf(columns["cols"]?.[i], "cols")]).toStrictEqual([[], []]);
      return undefined;
    }
    return { rows: bandsOf(columns["rows"]?.[i], `rows ${String(i)}`), columns: bandsOf(columns["cols"]?.[i], `cols ${String(i)}`) };
  });
}

/** This function gives the shapes of the sheet in `SheetRun`, the interpreter of the module. */
function sheetShapes(records: readonly ShapeRecord[], limit: number): (Shape | undefined)[] {
  const s = shapeSpace(records);
  const sheet = new SheetRun(SHAPE_COLUMNS, { space: s, domains: SHAPE_DOMAINS, vars: { limit } });
  const columns = Object.fromEntries(
    [...SHAPE_COLUMNS.keys()].map((c) => [
      c,
      s.keys.map((k) => {
        const r = sheet.cell(c, k);
        if (!r.ok) throw new Error(`${c} at ${k}: ${r.error.code}: ${r.error.message}`);
        return r.value;
      }),
    ]),
  );
  return shapesOf(columns, records.length);
}

describe("the ireko shapes pilot", () => {
  const shapes = moduleOf();
  const run = (records: readonly ShapeRecord[], limit: number): (Shape | undefined)[] =>
    shapesOf(
      shapes(
        records,
        { limit },
        records.map((r) => r.p),
      ),
      records.length,
    );

  it("COMPILE.MODULE.SHEET.LIST COMPILE.MODULE.TREE COMPILE.MODULE.LIST.CALL: the module gives the shapes pass of ireko on random trees, with the same bits", () => {
    fc.assert(
      fc.property(tree(12), bandLimit(5), (records, limit) => {
        expect(run(records, limit)).toStrictEqual(shapesTree(records, limit));
      }),
      { numRuns: 60 },
    );
  });

  it("COMPILE.MODULE.SHEET.LIST: the sheet gives the shapes pass of ireko in SheetRun, the interpreter of the module", () => {
    fc.assert(
      fc.property(tree(6), bandLimit(4), (records, limit) => {
        expect(sheetShapes(records, limit)).toStrictEqual(shapesTree(records, limit));
      }),
      { numRuns: 20 },
    );
  });

  it("gives the shapes of fixed trees: a tidy tree, a nested node, a linked chain and a coarse join", () => {
    // The root wants the shapes. Its child a is linked, with a child a1 below it. Its child b is nested.
    const records: ShapeRecord[] = [
      leaf(-1, { wants: true, w: 100, h: 20 }),
      leaf(0, { w: 10, h: 10, ox: 0, oy: 30 }),
      leaf(1, { w: 30, h: 5, ox: 20, oy: 15 }),
      leaf(0, { linked: false, w: 40, h: 40, ox: 60, oy: 30 }),
      leaf(3, { w: 5, h: 5 }),
    ];
    const expected: (Shape | undefined)[] = [
      undefined,
      {
        rows: [
          { from: 0, to: 10, min: 0, max: 10 },
          { from: 15, to: 20, min: 20, max: 50 },
        ],
        columns: [
          { from: 0, to: 10, min: 0, max: 10 },
          { from: 20, to: 50, min: 15, max: 20 },
        ],
      },
      boxShape(30, 5),
      boxShape(40, 40),
      undefined,
    ];
    expect(shapesTree(records)).toStrictEqual(expected);
    expect(run(records, MAX_BANDS)).toStrictEqual(expected);
    // With the limit 1, each axis of a joins into one band.
    expect(run(records, 1)[1]).toStrictEqual({ rows: [{ from: 0, to: 20, min: 0, max: 50 }], columns: [{ from: 0, to: 50, min: 0, max: 20 }] });
    // The merge drops a band of no size: a box of no height has no band on the rows.
    expect(run([leaf(-1, { wants: true }), leaf(0, { h: 0 }), leaf(1, { w: 0, h: 0 })], MAX_BANDS)[1]).toStrictEqual({ rows: [], columns: [{ from: 0, to: 10, min: 0, max: 0 }] });
  });

  it("CALL.RESULT: the sheet keeps the infinite ends of a box that overflows, in the module and in SheetRun, as ireko", () => {
    const inf = Number.POSITIVE_INFINITY;
    // The child a1 of the node a has an infinite width, and the nested child a2 has an infinite height.
    const records = SHAPES_INFINITE;
    const reference = shapesTree(records);
    expect(reference[1]).toStrictEqual({
      rows: [
        { from: 0, to: 10, min: 0, max: 10 },
        { from: 15, to: 20, min: 3, max: inf },
        { from: 30, to: inf, min: 0, max: 4 },
      ],
      columns: [
        { from: 0, to: 4, min: 0, max: inf },
        { from: 4, to: 10, min: 0, max: 20 },
        { from: 10, to: inf, min: 15, max: 20 },
      ],
    });
    expect(run(records, MAX_BANDS)).toStrictEqual(reference);
    expect(sheetShapes(records, MAX_BANDS)).toStrictEqual(reference);
    // With the limit 1, each axis joins into one band, and the infinite ends stay.
    expect(run(records, 1)).toStrictEqual(shapesTree(records, 1));
    expect(run(records, 1)[1]?.columns).toStrictEqual([{ from: 0, to: inf, min: 0, max: inf }]);
  });

  it("gives the shape of a deep linked chain and of a wide row of leaves, past the limit of the bands", () => {
    const chain = [leaf(-1, { wants: true }), ...Array.from({ length: 40 }, (_, i) => leaf(i, { ox: 3, oy: 12 }))];
    expect(run(chain, MAX_BANDS)).toStrictEqual(shapesTree(chain));
    const wide = [leaf(-1, { wants: true }), leaf(0), ...Array.from({ length: 80 }, (_, i) => leaf(1, { w: 2, h: 1 + (i % 3), ox: 3 * i, oy: 20 }))];
    const reference = shapesTree(wide);
    expect(reference[1]?.columns.length).toBeLessThanOrEqual(MAX_BANDS);
    expect(run(wide, MAX_BANDS)).toStrictEqual(reference);
  });

  it("copies the code of ireko: the merge of bands, the limit and the join of two boxes", () => {
    // The cases of shape.test.ts of ireko.
    expect(boxShape(10, 4)).toStrictEqual({ rows: [{ from: 0, to: 4, min: 0, max: 10 }], columns: [{ from: 0, to: 10, min: 0, max: 4 }] });
    expect(moveShape(boxShape(10, 4), 5, 7).rows).toStrictEqual([{ from: 7, to: 11, min: 5, max: 15 }]);
    expect(
      mergeBands([
        { from: 0, to: 10, min: 0, max: 5 },
        { from: 5, to: 15, min: 3, max: 9 },
        { from: 20, to: 30, min: 1, max: 2 },
        { from: 30, to: 40, min: 1, max: 2 },
      ]),
    ).toStrictEqual([
      { from: 0, to: 5, min: 0, max: 5 },
      { from: 5, to: 10, min: 0, max: 9 },
      { from: 10, to: 15, min: 3, max: 9 },
      { from: 20, to: 40, min: 1, max: 2 },
    ]);
    expect(mergeBands([])).toStrictEqual([]);
    expect(mergeBands([{ from: 3, to: 3, min: 0, max: 1 }])).toStrictEqual([]);
    const many = Array.from({ length: 100 }, (_, i) => ({ from: i * 2, to: i * 2 + 1, min: i, max: i + 1 }));
    expect(mergeBands(many, 16)).toHaveLength(13);
    expect(joinShapes([boxShape(10, 10), moveShape(boxShape(10, 10), 20, 5)]).rows).toStrictEqual([
      { from: 0, to: 5, min: 0, max: 10 },
      { from: 5, to: 10, min: 0, max: 30 },
      { from: 10, to: 15, min: 20, max: 30 },
    ]);
  });
});

/** This function gives the shape of a node from the shapes of its children, as the measure pass of ireko. */
const reference = (kids: readonly Child[], w: number, h: number, limit: number): Shape => joinShapes([boxShape(w, h), ...kids.map((c) => moveShape(c.shape, c.ox, c.oy))], limit);

/** This function gives the shape of a node from the value of the module of one node: a list of two lists of bands. */
const nodeShape = (value: unknown): Shape => {
  if (!isVexList(value)) throw new Error("The shape is not a list.");
  const [rows, cols] = value.items.map((x) => (x.result.ok ? x.result.value : undefined));
  return { rows: bandsOf(rows, "rows"), columns: bandsOf(cols, "cols") };
};

describe("the ireko shapes pilot for one node", () => {
  const run = irekoRun("shape") as (records: unknown, vars: unknown) => readonly unknown[];

  it("COMPILE.MODULE.LIST.INPUT: the module of one node reads the shapes of the children as input, and gives the join of ireko with the same bits", () => {
    fc.assert(
      fc.property(fc.array(child, { minLength: 1, maxLength: 6 }), extent, extent, bandLimit(4), (kids, w, h, limit) => {
        const values = run(kids.map(childRecord), { w, h, limit });
        expect(values).toHaveLength(kids.length);
        for (const value of values) expect(nodeShape(value)).toStrictEqual(reference(kids, w, h, limit));
      }),
      { numRuns: 30 },
    );
  });

  it("COMPILE.MODULE.LIST.INPUT: the module of one node gives the value of the interpreter on a fixed node", () => {
    const kids = NODE_FIXED_KIDS;
    const records = kids.map(childRecord);
    const vars = { w: 100, h: 20, limit: 2 };
    const expected = evaluate(NODE_SHAPE, { space: space.array(records), origin: "0", vars, domains: SHAPE_DOMAINS });
    if (!expected.ok) throw new Error(expected.error.message);
    expect(nodeShape(run(records, vars)[0])).toStrictEqual(nodeShape(expected.value));
    expect(nodeShape(expected.value)).toStrictEqual(reference(kids, 100, 20, 2));
    // A child whose list holds no band is against the schema.
    expect(() => run([{ ...records[0], rows: { kind: "vex.list", items: [{ key: "0", result: { ok: true, value: 1 } }] } }], vars)).toThrow("the record 0 does not keep the schema");
  });

  it("COMPILE.MODULE.APPEND.OWN LIST.SORT.BY: the sweep of the module of one node gives the join of ireko for no band, one band, touching bands and equal cuts", () => {
    const empty: Shape = { rows: [], columns: [] };
    const nodes: readonly (readonly [readonly Child[], number, number])[] = [
      // No valid band, and one band.
      [[{ ox: 0, oy: 0, shape: empty }], 0, 0],
      [[{ ox: 0, oy: 0, shape: empty }], 10, 4],
      // Two boxes that touch with the same interval, and two bands with the same cuts.
      [[{ ox: 0, oy: 4, shape: boxShape(10, 4) }], 10, 4],
      [[{ ox: 2, oy: 1, shape: boxShape(3, 2) }, { ox: 2, oy: 1, shape: boxShape(6, 1) }], 10, 4],
      // An end and a start at one cut, and two bands that touch with different intervals.
      [[{ ox: 0, oy: 0, shape: { rows: [{ from: 4, to: 9, min: 1, max: 2 }, { from: 9, to: 12, min: 0, max: 3 }], columns: [] } }], 10, 4],
    ];
    const shapes = nodes.map(([kids, w, h]) => {
      const shape = nodeShape(run(kids.map(childRecord), { w, h, limit: MAX_BANDS })[0]);
      expect(shape).toStrictEqual(reference(kids, w, h, MAX_BANDS));
      return shape;
    });
    expect(shapes[0]).toStrictEqual(empty);
    expect(shapes[2]).toStrictEqual({ rows: [{ from: 0, to: 8, min: 0, max: 10 }], columns: [{ from: 0, to: 10, min: 0, max: 8 }] });
  });

  it("CALL.RESULT: the module of one node and the interpreter keep the bands with infinite ends, as ireko", () => {
    const inf = Number.POSITIVE_INFINITY;
    // The rows of ireko for each node of NODE_INFINITE.
    const rowsOf: readonly (readonly Band[])[] = [
      [
        { from: 0, to: 3, min: 0, max: 5 },
        { from: 3, to: 8, min: -1, max: inf },
        { from: 8, to: inf, min: 0, max: 5 },
      ],
      [
        { from: -inf, to: 0, min: -inf, max: 4 },
        { from: 0, to: 4, min: -inf, max: 10 },
        { from: 4, to: 5, min: -inf, max: 4 },
        { from: 5, to: inf, min: 3, max: 4 },
      ],
      [{ from: 0, to: inf, min: 0, max: inf }],
    ];
    expect(rowsOf).toHaveLength(NODE_INFINITE.length);
    for (const [k, [kids, w, h]] of NODE_INFINITE.entries()) {
      const rows = rowsOf[k];
      const records = kids.map(childRecord);
      const vars = { w, h, limit: MAX_BANDS };
      const interpreted = evaluate(NODE_SHAPE, { space: space.array(records), origin: "0", vars, domains: SHAPE_DOMAINS });
      if (!interpreted.ok) throw new Error(interpreted.error.message);
      const shape = reference(kids, w, h, MAX_BANDS);
      expect(nodeShape(interpreted.value)).toStrictEqual(shape);
      expect(nodeShape(run(records, vars)[0])).toStrictEqual(shape);
      expect(shape.rows).toStrictEqual(rows);
    }
  });
});

/** This function gives the record of a child with plain lists: the arrays of the bands of its shape. */
const plainRecord = (c: Child): object => ({ ox: c.ox, oy: c.oy, rows: c.shape.rows, cols: c.shape.columns });

describe("the ireko shapes pilot for one node with plain lists", () => {
  const m = emitModule(NODE_SHAPE, { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape", lists: "plain" });
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  const loaded = new Function(`${m.source.replaceAll(/^export /gm, "")}
return { nodeShape, VEX_ERROR };`)() as { readonly nodeShape: (records: unknown, vars: unknown) => readonly unknown[]; readonly VEX_ERROR: unknown };
  const run = loaded.nodeShape;

  it("COMPILE.MODULE.LIST.PLAIN: the module of one node reads the arrays of the bands, and gives the two arrays of the interpreter", () => {
    expect(m.source).not.toContain("vex.list");
    fc.assert(
      fc.property(fc.array(child, { minLength: 1, maxLength: 6 }), extent, extent, bandLimit(4), (kids, w, h, limit) => {
        const vars = { w, h, limit };
        const values = run(kids.map(plainRecord), vars);
        const interpreted = evaluate(NODE_SHAPE, { space: space.array(kids.map(childRecord)), origin: "0", vars, domains: SHAPE_DOMAINS });
        if (!interpreted.ok) throw new Error(interpreted.error.message);
        const shape = nodeShape(interpreted.value);
        expect(shape).toStrictEqual(reference(kids, w, h, limit));
        expect(values).toHaveLength(kids.length);
        for (const value of values) expect(value).toStrictEqual([shape.rows, shape.columns]);
      }),
      { numRuns: 30 },
    );
  });

  it("COMPILE.MODULE.LIST.PLAIN: an error item of a child is skipped as in the interpreter, and a list of the wrong shape is against the schema", () => {
    const X = loaded.VEX_ERROR;
    const box: Child = { ox: 2, oy: 1, shape: boxShape(3, 2) };
    const vars = { w: 10, h: 4, limit: MAX_BANDS };
    // The merge of the bands skips an error item, so the error band of a child adds nothing.
    const values = run([{ ...plainRecord(box), rows: [X, ...box.shape.rows] }], vars);
    expect(values).toStrictEqual(run([plainRecord(box)], vars));
    const error = { code: "#VALUE!", kind: "value", message: "no band", path: [] };
    const rows = { kind: "vex.list", items: [{ key: "0", result: { ok: false, error } }, ...box.shape.rows.map((value, k) => ({ key: String(k + 1), result: { ok: true, value } }))] };
    const interpreted = evaluate(NODE_SHAPE, { space: space.array([{ ...childRecord(box), rows }]), origin: "0", vars, domains: SHAPE_DOMAINS });
    if (!interpreted.ok) throw new Error(interpreted.error.message);
    const shape = nodeShape(interpreted.value);
    expect(values).toStrictEqual([[shape.rows, shape.columns]]);
    expect(() => run([{ ...plainRecord(box), rows: childRecord(box) }], vars)).toThrow("the record 0 does not keep the schema");
    expect(() => run([{ ...plainRecord(box), cols: [1] }], vars)).toThrow("the record 0 does not keep the schema");
  });
});

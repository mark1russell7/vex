import { isVexList, SheetRun } from "@mark1russell7/vex";
import { emitSheetModule } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BandDomain, type Band } from "./ireko-band.ts";
import { boxShape, joinShapes, MAX_BANDS, mergeBands, moveShape, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA, shapeSpace, shapesTree, type Shape, type ShapeRecord } from "./ireko-shapes.ts";

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

/** A whole number, a number with a fraction, or a negative zero: the bits of each one count. */
const coord = fc.oneof(fc.integer({ min: -60, max: 60 }), fc.double({ min: -60, max: 60, noNaN: true, noDefaultInfinity: true }), fc.constant(-0));
const size = fc.oneof(fc.integer({ min: 0, max: 40 }), fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }));
const node = fc.record({ wants: fc.boolean(), linked: fc.boolean(), w: size, h: size, ox: coord, oy: coord, ex: coord, ey: coord, ew: size, eh: size });

/**
 * A tree in the pre-order of ireko, with up to `most` nodes. Each node after the root has a parent before it. A choice
 * of the last nodes as parents makes deep chains, and a choice of the first nodes makes wide trees.
 */
const tree = (most: number): fc.Arbitrary<ShapeRecord[]> =>
  fc.array(fc.tuple(node, fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), fc.boolean()), { minLength: 1, maxLength: most }).map((nodes) =>
    nodes.map(([r, pick, deep], i) => ({ ...r, p: i === 0 ? -1 : deep ? Math.max(0, i - 1 - Math.floor(pick * 3)) : Math.floor(pick * i) })),
  );

const leaf = (p: number, more: Partial<ShapeRecord> = {}): ShapeRecord => ({ p, wants: false, linked: true, w: 10, h: 10, ox: 0, oy: 0, ex: 0, ey: 0, ew: 10, eh: 10, ...more });

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

  it("COMPILE.MODULE.SHEET.LIST COMPILE.MODULE.TREE: the module gives the shapes pass of ireko on random trees, with the same bits", () => {
    fc.assert(
      fc.property(tree(12), fc.oneof(fc.constant(MAX_BANDS), fc.integer({ min: 1, max: 5 })), (records, limit) => {
        expect(run(records, limit)).toStrictEqual(shapesTree(records, limit));
      }),
      { numRuns: 60 },
    );
  });

  it("COMPILE.MODULE.SHEET.LIST: the sheet gives the shapes pass of ireko in SheetRun, the interpreter of the module", () => {
    fc.assert(
      fc.property(tree(6), fc.oneof(fc.constant(MAX_BANDS), fc.integer({ min: 1, max: 4 })), (records, limit) => {
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

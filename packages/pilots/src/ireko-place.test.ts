import { SheetRun } from "@mark1russell7/vex";
import { emitSheetModule } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PLACE_COLUMNS, PLACE_DOMAINS, PLACE_KINDS, PLACE_SCHEMA, placeSpace, placeTree, type PlacedRecord, type PlaceRecord, type PlaceVars } from "./ireko-place.ts";

type Columns = Readonly<Record<string, readonly unknown[]>>;
type Run = (records: unknown, vars: unknown, parents: unknown) => Columns;

/** This function gives the run of the standalone module of the sheet, as the build of ireko writes it. */
function moduleOf(): Run {
  const m = emitSheetModule(PLACE_COLUMNS, { domains: PLACE_DOMAINS, schema: PLACE_SCHEMA, kinds: PLACE_KINDS, space: "tree", name: "placeOf" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return placeOf;`)() as Run;
}

/** This function gives the output of the place pass from the columns of a run. */
function placedOf(columns: Columns, n: number): PlacedRecord[] {
  const read = (name: string, i: number): number => {
    const value = columns[name]?.[i];
    if (typeof value !== "number") throw new Error(`The column ${name} has no number at ${String(i)}.`);
    return value;
  };
  return Array.from({ length: n }, (_, i) => ({ x: read("x", i), y: read("y", i), width: read("width", i), height: read("height", i), scale: read("scale", i), container: read("container", i) }));
}

/** The columns of the sheet have the name `as` for the scale. */
const renamed = (columns: Columns): Columns => ({ ...columns, scale: columns["as"] ?? [] });

const coord = fc.oneof(fc.integer({ min: -400, max: 400 }), fc.double({ min: -400, max: 400, noNaN: true, noDefaultInfinity: true }));
const size = fc.oneof(fc.integer({ min: 1, max: 400 }), fc.double({ min: 1e-3, max: 400, noNaN: true, noDefaultInfinity: true }));
const scale = fc.oneof(fc.constant(1), fc.double({ min: 1e-3, max: 1, noNaN: true, noDefaultInfinity: true }));
const node = fc.record({ px: coord, py: coord, ps: scale, bw: size, bh: size, nested: fc.boolean() });

/**
 * A tree in the pre-order of ireko, with up to `most` nodes. Each node after the root has a parent before it. A choice
 * of the last nodes as parents makes deep chains, and a choice of the first nodes makes wide trees.
 */
const tree = (most: number): fc.Arbitrary<{ readonly records: PlaceRecord[]; readonly vars: PlaceVars }> =>
  fc
    .record({
      nodes: fc.array(fc.tuple(node, fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), fc.boolean()), { minLength: 1, maxLength: most }),
      vars: fc.record({ ox: coord, oy: coord }),
    })
    .map(({ nodes, vars }) => ({
      records: nodes.map(([r, pick, deep], i) => {
        const p = i === 0 ? -1 : deep ? Math.max(0, i - 1 - Math.floor(pick * 3)) : Math.floor(pick * i);
        // The root has the identity placement, as in ireko.
        return i === 0 ? { ...r, p, px: 0, py: 0, ps: 1 } : { ...r, p };
      }),
      vars,
    }));

describe("the ireko place pilot", () => {
  const place = moduleOf();
  const run = (records: readonly PlaceRecord[], vars: PlaceVars): PlacedRecord[] =>
    placedOf(
      renamed(
        place(
          records,
          vars,
          records.map((r) => r.p),
        ),
      ),
      records.length,
    );

  it("COMPILE.MODULE.SHEET COMPILE.MODULE.TREE: the module gives the place pass of ireko on random trees, with the same bits", () => {
    fc.assert(
      fc.property(tree(60), ({ records, vars }) => {
        expect(run(records, vars)).toEqual(placeTree(records, vars));
      }),
    );
  });

  it("COMPILE.MODULE.SHEET: the sheet gives the place pass of ireko in SheetRun, the interpreter of the module", () => {
    fc.assert(
      fc.property(tree(12), ({ records, vars }) => {
        const s = placeSpace(records);
        const sheet = new SheetRun(PLACE_COLUMNS, { space: s, domains: PLACE_DOMAINS, vars: { ...vars } });
        const columns = Object.fromEntries(
          [...PLACE_COLUMNS.keys()].map((c) => [
            c,
            s.keys.map((k) => {
              const r = sheet.cell(c, k);
              if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
              return r.value;
            }),
          ]),
        );
        expect(placedOf(renamed(columns), records.length)).toEqual(placeTree(records, vars));
      }),
      { numRuns: 30 },
    );
  });

  it("gives the place of fixed cases: a nested box with a scale, and a chain deeper than the stack of a search", () => {
    // The root at (10, 20). A nested child at (5, 6) with the scale 0.5, and its child at (4, 8) with the scale 0.5.
    const records: PlaceRecord[] = [
      { p: -1, px: 0, py: 0, ps: 1, bw: 100, bh: 80, nested: true },
      { p: 0, px: 5, py: 6, ps: 0.5, bw: 40, bh: 30, nested: false },
      { p: 1, px: 4, py: 8, ps: 0.5, bw: 10, bh: 10, nested: false },
    ];
    expect(run(records, { ox: 10, oy: 20 })).toEqual([
      { x: 10, y: 20, width: 100, height: 80, scale: 1, container: -1 },
      { x: 15, y: 26, width: 20, height: 15, scale: 0.5, container: 0 },
      { x: 17, y: 30, width: 2.5, height: 2.5, scale: 0.25, container: 0 },
    ]);
    // A number that is almost 0 is 0, and -0 is 0.
    const tiny: PlaceRecord[] = [
      { p: -1, px: 0, py: 0, ps: 1, bw: 1, bh: 1, nested: true },
      { p: 0, px: 1e-10, py: -1e-12, ps: 1, bw: 1, bh: 1, nested: false },
    ];
    expect(run(tiny, { ox: -0, oy: 0 }).map((r) => [r.x, r.y])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    // A chain of 20000 nodes: the fill visits the parents first, so no read of a cell starts a search.
    const chain: PlaceRecord[] = Array.from({ length: 20_000 }, (_, i) => ({ p: i - 1, px: i === 0 ? 0 : 3, py: i === 0 ? 0 : 1.5, ps: 1, bw: 2, bh: 2, nested: i % 2 === 0 }));
    expect(run(chain, { ox: 0, oy: 0 })).toEqual(placeTree(chain, { ox: 0, oy: 0 }));
  });
});

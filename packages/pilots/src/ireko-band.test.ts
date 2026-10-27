import { app, axes, each, evaluate, fold, index, let_, lit, rec, ref, space, v, type Expr } from "@mark1russell7/vex";
import { emitModule, type ModuleOptions } from "@mark1russell7/vex-compiler";
import { checkLaws } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BAND_DOMAINS, BandDomain, BandNumDomain, type Band } from "./ireko-band.ts";

interface Loaded {
  readonly run: (records: unknown, vars: unknown) => readonly unknown[];
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new (m: string) => Error;
}

/** A record: a box at (x, y) with the size w by h, an offset d, and a band b. */
interface Row {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly b: Band;
}

const OPTIONS: ModuleOptions = {
  domains: BAND_DOMAINS,
  schema: { fields: { x: "number", y: "number", w: "number", h: "number", d: "number", b: "domain:Band" }, vars: { gap: "number" } },
};

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const [x, y, w, h, d, b] = ["x", "y", "w", "h", "d", "b"].map((f) => ref(f)) as [Expr, Expr, Expr, Expr, Expr, Expr];
const fields = (e: Expr): Expr => rec({ from: op("from", e), to: op("to", e), min: op("min", e), max: op("max", e) });

/** The band of the box of a record on the rows: from y to y + h, and from x to x + w across (ireko `bandsOf`). */
const own = op("band", y, op("add", y, h), x, op("add", x, w));
/** The band of the first record. */
const first = ref("b", [index(0)]);

/** The programs of the test. Each one gives its value at each record. */
const PROGRAMS: Readonly<Record<string, Expr>> = {
  own,
  fields: fields(own),
  along: fields(op("move", own, d, lit(0))),
  across: fields(op("move", b, lit(0), d)),
  flip: fields(op("flip", b)),
  join: op("join", own, b),
  overlaps: op("overlaps", own, first),
  // The test of the packing of the strategy tree: a band that overlaps the band before it goes past its far side.
  pack: op("if", op("overlaps", b, first), op("add", op("subtract", op("max", first), op("min", b)), v("gap")), lit(0)),
  // A fold joins the bands of all records into one band that covers them.
  all: fold(axes.all, { u: first }, { u: op("join", v("u"), b) }, fields(v("u"))),
  // A list of bands, as the rows of a shape: nth reads a band, and reduce joins them.
  nth: let_({ rows: each(axes.all, b) }, fields(op("nth", v("rows"), lit(1)))),
  reduce: op("reduce", each(axes.all, op("move", b, d, lit(0))), lit("join")),
  // A divide by zero and an infinite offset give errors. ifError catches them.
  errors: rec({ caught: op("ifError", op("from", op("move", own, d, lit(0))), lit(-1)), width: op("max", op("band", y, h, x, op("divide", w, d))) }),
  raised: op("to", op("move", b, d, d)),
  // The merge of the bands of a shape sorts the bands by from (COMPILE.MODULE.SORT.BY). An infinite offset gives an error item.
  sorted: let_({ rows: op("sortBy", each(axes.all, b), lit({ by: "from" })) }, fields(op("nth", v("rows"), lit(0)))),
  sortedList: op("sortBy", each(axes.all, op("move", b, d, lit(0))), lit({ by: "from" })),
  sortedStrict: op("ifError", op("from", op("first", op("sortBy", each(axes.all, op("move", b, d, lit(0))), lit({ by: "from", strict: true })))), lit(-1)),
};

const ROWS: readonly Row[] = [
  { x: 0, y: 0, w: 120, h: 40, d: 5, b: { from: 0, to: 40, min: 0, max: 120 } },
  { x: -10, y: 30, w: 15, h: 20, d: 0, b: { from: 30, to: 50, min: -10, max: 5 } },
  { x: 3.5, y: 100, w: 2, h: 0, d: Number.POSITIVE_INFINITY, b: { from: 100, to: 100, min: 3.5, max: 5.5 } },
  { x: -0, y: -5, w: 1, h: 10, d: -2.5, b: { from: 60, to: 80, min: 200, max: 201 } },
];

/** This function gives a copy of the records, so a module that changes its input gives other values. */
const copyOf = (rows: readonly Row[]): Row[] => rows.map((r) => ({ ...r, b: { ...r.b } }));

/** This function gives the run of the standalone module of a program. */
function moduleOf(e: Expr): Loaded {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR, VexContractError };`)() as Loaded;
}

/** This function gives the values of the interpreter at each record, with the sentinel of the module for an error. */
function evaluated(e: Expr, rows: readonly Row[], vars: Readonly<Record<string, unknown>>, error: unknown): unknown[] {
  const s = space.array(rows);
  return s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars, domains: BAND_DOMAINS });
    return r.ok ? r.value : error;
  });
}

const num = fc.oneof(fc.integer({ min: -50, max: 50 }), fc.double({ min: -400, max: 400, noNaN: true, noDefaultInfinity: true }));
const band: fc.Arbitrary<Band> = fc.record({ from: num, to: num, min: num, max: num });
const row: fc.Arbitrary<Row> = fc.record({ x: num, y: num, w: num, h: num, d: fc.oneof(num, fc.constant(0), fc.constant(Number.POSITIVE_INFINITY)), b: band });

describe("the band domain of ireko", () => {
  const modules = new Map(Object.entries(PROGRAMS).map(([name, e]) => [name, moduleOf(e)]));
  const loaded = (name: string): Loaded => {
    const m = modules.get(name);
    if (m === undefined) throw new Error(`no program ${name}`);
    return m;
  };

  it("COMPILE.MODULE.BAND: a module makes bands, reads their fields, moves, flips and joins them, with the values of the interpreter", () => {
    for (const [name, e] of Object.entries(PROGRAMS)) {
      const m = loaded(name);
      // The name of the program is a key, so a failure tells the program.
      expect({ [name]: m.run(copyOf(ROWS), { gap: 4 }) }).toStrictEqual({ [name]: evaluated(e, ROWS, { gap: 4 }, m.VEX_ERROR) });
    }
    // The values themselves, so the test does not only compare two wrong runs.
    const run = (name: string): readonly unknown[] => loaded(name).run(ROWS, { gap: 4 });
    const error = loaded("errors").VEX_ERROR;
    expect(run("own")[1]).toStrictEqual({ from: 30, to: 50, min: -10, max: 5 });
    expect(run("along")[0]).toStrictEqual({ from: 5, to: 45, min: 0, max: 120 });
    expect(run("across")[1]).toStrictEqual({ from: 30, to: 50, min: -10, max: 5 });
    expect(run("across")[3]).toStrictEqual({ from: 60, to: 80, min: 197.5, max: 198.5 });
    expect(run("flip")[1]).toStrictEqual({ from: 30, to: 50, min: -5, max: 10 });
    expect(run("join")[3]).toStrictEqual({ from: -5, to: 80, min: -0, max: 201 });
    expect(run("overlaps")).toStrictEqual([true, true, false, true]);
    // The second band overlaps the first, so it goes to 120 - (-10) + 4. The band of zero height overlaps nothing.
    expect(run("pack")).toStrictEqual([124, 134, 0, 0]);
    expect(run("all")).toStrictEqual(Array.from({ length: 4 }, () => ({ from: 0, to: 100, min: -10, max: 201 })));
    expect(run("nth")).toStrictEqual(Array.from({ length: 4 }, () => ({ from: 30, to: 50, min: -10, max: 5 })));
    // The third offset is infinite, so its moved band is an error. reduce skips that item without the option strict.
    expect(run("reduce")).toStrictEqual(Array.from({ length: 4 }, () => ({ from: 5, to: 77.5, min: -10, max: 201 })));
    // A divide by zero gives an invalid number. An infinite offset gives an invalid band, and ifError catches it.
    expect(run("errors")).toStrictEqual([{ caught: 5, width: 24 }, error, { caught: -1, width: 0 }, { caught: -7.5, width: -0.4 }]);
    expect(run("raised")).toStrictEqual([45, 50, error, 77.5]);
  });

  it("COMPILE.MODULE.BAND: the module gives the values of the interpreter for random records", () => {
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 6 }), num, (rows, gap) => {
        for (const [name, e] of Object.entries(PROGRAMS)) {
          const m = loaded(name);
          expect({ [name]: m.run(copyOf(rows), { gap }) }).toStrictEqual({ [name]: evaluated(e, rows, { gap }, m.VEX_ERROR) });
        }
      }),
      { numRuns: 60 },
    );
  });

  it("COMPILE.MODULE.SORT.BY: a module sorts the bands by from, with the values of the interpreter", () => {
    for (const [name, program] of Object.entries(PROGRAMS).filter(([key]) => key.startsWith("sorted"))) {
      expect({ [name]: loaded(name).run(copyOf(ROWS), { gap: 4 }) }).toStrictEqual({ [name]: evaluated(program, ROWS, { gap: 4 }, loaded(name).VEX_ERROR) });
    }
    expect(loaded("sorted").run(ROWS, { gap: 4 })[2]).toStrictEqual({ from: 0, to: 40, min: 0, max: 120 });
    // The third band moves by an infinite offset, so its item is an error, and the sort skips it.
    const list = loaded("sortedList").run(ROWS, { gap: 4 })[0] as { readonly items: readonly { readonly key: string; readonly result: { readonly value: Band } }[] };
    expect(list.items.map((item) => [item.key, item.result.value.from])).toStrictEqual([
      ["0", 5],
      ["1", 30],
      ["3", 57.5],
    ]);
    expect(loaded("sortedStrict").run(ROWS, { gap: 4 })).toStrictEqual([-1, -1, -1, -1]);
  });

  it("COMPILE.MODULE.BAND: a module checks the kind of a field of bands with a copy of the test of the domain", () => {
    const m = loaded("join");
    for (const bad of [{ from: 0, to: 1, min: 0 }, { from: 0, to: 1, min: 0, max: "1" }, { from: 0, to: 1, min: 0, max: 1, extra: 2 }, [0, 1, 0, 1], null]) {
      expect(() => m.run([{ ...ROWS[0], b: bad }], { gap: 0 })).toThrow(m.VexContractError);
    }
  });

  it("gives the arithmetic of the shapes code of ireko", () => {
    const a: Band = { from: 0, to: 40, min: 10, max: 120 };
    const c: Band = { from: 30, to: 90, min: -20, max: 60 };
    // moveShape of engine/shape.ts moves a row by dy along and by dx across.
    expect(BandDomain.ops.move.fn(a, 7, -3)).toStrictEqual({ from: 7, to: 47, min: 7, max: 117 });
    // coarsen of engine/shape.ts joins two neighbor bands with Math.min and Math.max.
    expect(BandDomain.ops.join.fn(a, c)).toStrictEqual({ from: 0, to: 90, min: -20, max: 120 });
    expect(BandDomain.ops.join.fn(c, a)).toStrictEqual({ from: 0, to: 90, min: -20, max: 120 });
    // flip of strategies/tree.ts mirrors a band across the row.
    expect(BandDomain.ops.flip.fn(a)).toStrictEqual({ from: 0, to: 40, min: -120, max: -10 });
    // pack of strategies/tree.ts compares two bands with p.from < b.to && b.from < p.to: bands that only touch do not overlap.
    expect([c, { ...c, from: 40 }, { ...c, to: 0 }, { ...c, from: -5, to: 50 }].map((q) => BandDomain.ops.overlaps.fn(a, q))).toStrictEqual([true, false, false, true]);
    expect([a, c].map((q) => [BandDomain.ops.from.fn(q), BandDomain.ops.to.fn(q), BandDomain.ops.min.fn(q), BandDomain.ops.max.fn(q)])).toStrictEqual([
      [0, 40, 10, 120],
      [30, 90, -20, 60],
    ]);
    expect(BandNumDomain.ops.band.fn(1, 2, 3, 4)).toStrictEqual({ from: 1, to: 2, min: 3, max: 4 });
  });

  it("accepts only plain bands, checks that the fields are finite and keeps its laws", () => {
    expect([{ from: 0, to: 1, min: 0, max: 1 }, Object.assign(Object.create(null) as object, { from: 0, to: 1, min: 0, max: 1 })].map((u) => BandDomain.is(u))).toStrictEqual([true, true]);
    expect([{ from: 0, to: 1, min: 0 }, { from: 0, to: 1, min: 0, max: 1, x: 0 }, { from: "0", to: 1, min: 0, max: 1 }, { from: 0, to: "1", min: 0, max: 1 }, { from: 0, to: 1, min: "0", max: 1 }, { from: 0, to: 1, min: 0, max: "1" }, [0, 1, 0, 1], null, 1].map((u) => BandDomain.is(u))).toStrictEqual(Array.from({ length: 9 }, () => false));
    expect(["from", "to", "min", "max"].map((k) => BandDomain.valid?.({ from: 0, to: 1, min: 0, max: 1, [k]: Number.NaN }))).toStrictEqual([false, false, false, false]);
    expect(BandDomain.valid?.({ from: 0, to: 1, min: 0, max: 1 })).toBe(true);
    expect(BandDomain.show?.({ from: 0, to: 40, min: -1, max: 2.5 })).toBe("[0, 40] at [-1, 2.5]");
    expect(BandDomain.samples?.()).toHaveLength(4);
    expect([1, -0, Number.NaN, "1", null].map((u) => BandNumDomain.is(u))).toStrictEqual([true, true, true, false, false]);
    const small = fc.integer({ min: -20, max: 20 });
    // fc.record can give an object without a prototype. The ops give plain objects, so the values of the check are plain too.
    expect(checkLaws(BandDomain, { arb: fc.record({ from: small, to: small, min: small, max: small }).map((r) => ({ ...r })) }).filter((r) => !r.ok)).toStrictEqual([]);
    expect(checkLaws(BandNumDomain, { arb: small, domains: [BandDomain] }).filter((r) => !r.ok)).toStrictEqual([]);
  });
});

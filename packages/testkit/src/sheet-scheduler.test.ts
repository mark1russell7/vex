import { app, axes, cell, each, index, lit, offset, ref, SheetRun, space, type Addr, type Expr, type Result } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ReferenceSheetRun } from "./reference-sheet.ts";

const COLUMNS = ["A", "B", "C"] as const;
const ADDRESSES: readonly Addr[] = [[], [offset(-1)], [offset(1)], [offset(-2)], [index(0)]];

/**
 * A formula of a random sheet: numbers, the field v, cell references, add, ifError and a sum over the other rows.
 * With `tables`, a formula can also sum a column over each row of a table (SHEET.TABLES).
 */
const formulaOf = (tables: readonly string[]): fc.Arbitrary<Expr> =>
  fc.letrec<{ e: Expr }>((tie) => ({
    e: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.integer({ min: -5, max: 5 }).map((n): Expr => lit(n)),
      fc.constant(ref("v")),
      fc.tuple(fc.constantFrom(...COLUMNS), fc.constantFrom(...ADDRESSES)).map(([c, at]): Expr => cell(c, at)),
      fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("add", a, b)),
      fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("ifError", a, b)),
      fc.constantFrom(...COLUMNS).map((c): Expr => app("sum", each(axes.others, cell(c)))),
      ...(tables.length === 0 ? [] : [fc.tuple(fc.constantFrom(...tables), fc.constantFrom(...COLUMNS)).map(([t, c]): Expr => app("sum", each(axes.table(t), cell(c))))]),
    ),
  })).e;
const formula = formulaOf([]);

/**
 * A random sheet: a formula for each column, the formulas of some cells, a space of rows, and an order of the reads of
 * the host. A cell formula can be at a key outside the space, and then no read finds it.
 */
const sheet = fc
  .record({
    formulas: fc.tuple(formula, formula, formula),
    own: fc.array(fc.tuple(fc.constantFrom(...COLUMNS), fc.nat(7), formula), { maxLength: 5 }),
    rows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 7 }),
  })
  .chain(({ formulas, own, rows }) =>
    fc.record({
      formulas: fc.constant(formulas),
      own: fc.constant(own),
      rows: fc.constant(rows),
      reads: fc.shuffledSubarray(
        rows.flatMap((_v, i) => COLUMNS.map((c) => [c, String(i)] as const)),
        { minLength: rows.length * COLUMNS.length },
      ),
    }),
  );

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

describe("the scheduler of a sheet run (SHEET.DEEP)", () => {
  it("SHEET.DEEP SHEET.CYCLE SHEET.CELL.FORMULA: SheetRun gives the results of the recursive search, also with a small stack budget", () => {
    fc.assert(
      fc.property(sheet, ({ formulas, own, rows, reads }) => {
        const columns = new Map(COLUMNS.map((c, i) => [c, formulas[i] ?? lit(0)]));
        const cells = new Map<string, Map<string, Expr>>();
        for (const [c, k, f] of own) cells.set(c, new Map([...(cells.get(c) ?? []), [String(k), f]]));
        const opts = { space: space.array(rows.map((v) => ({ v }))), domains: [NumDomain], cells };
        const reference = new ReferenceSheetRun(columns, opts);
        const expected = reads.map(([c, k]) => plain(reference.cell(c, k)));
        // The default budget, and budgets so small that most reads pause.
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(columns, opts) : new SheetRun(columns, opts, budget);
          expect(reads.map(([c, k]) => plain(run.cell(c, k)))).toEqual(expected);
        }
      }),
    );
  });
});

/** This function gives the columns A, B and C with the formulas `fs`. */
const columnsOf = (fs: readonly Expr[]): Map<string, Expr> => new Map(COLUMNS.map((c, i) => [c, fs[i] ?? lit(0)]));
/** This function gives an array space with the field v. */
const rowsOf = (vs: readonly number[]): ReturnType<typeof space.array> => space.array(vs.map((v) => ({ v })));

/** Two tables, "main" and "other": the formulas and the rows of each, and an order of the reads of the host. */
const twoTables = fc
  .record({
    main: fc.tuple(formulaOf(["main", "other"]), formulaOf(["main", "other"]), formulaOf(["main", "other"])),
    other: fc.tuple(formulaOf(["main", "other"]), formulaOf(["main", "other"]), formulaOf(["main", "other"])),
    mainRows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 4 }),
    otherRows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 4 }),
  })
  .chain((t) =>
    fc.record({
      t: fc.constant(t),
      reads: fc.shuffledSubarray(
        [
          ...t.mainRows.flatMap((_v, i) => COLUMNS.map((c) => ["main", c, String(i)] as const)),
          ...t.otherRows.flatMap((_v, i) => COLUMNS.map((c) => ["other", c, String(i)] as const)),
        ],
        { minLength: 1 },
      ),
    }),
  );

describe("the scheduler of a sheet run with two tables (SHEET.TABLES)", () => {
  it("SHEET.TABLES SHEET.CYCLE: SheetRun gives the results of the recursive search over two tables, with each budget", () => {
    fc.assert(
      fc.property(twoTables, ({ t, reads }) => {
        const tables = new Map([["other", { space: rowsOf(t.otherRows), columns: columnsOf(t.other) }]]);
        const opts = { space: rowsOf(t.mainRows), domains: [NumDomain], name: "main", tables };
        const reference = new ReferenceSheetRun(columnsOf(t.main), opts);
        const expected = reads.map(([table, c, k]) => plain(reference.cell(c, k, table)));
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(columnsOf(t.main), opts) : new SheetRun(columnsOf(t.main), opts, budget);
          expect(reads.map(([table, c, k]) => plain(run.cell(c, k, table)))).toEqual(expected);
        }
      }),
    );
  });
});

describe("the reference of a sheet run", () => {
  it("SHEET.CELL.FORMULA: the reference gives the errors of SheetRun for a cell without a formula", () => {
    const columns = new Map([["A", ref("v")]]);
    const opts = { space: space.array([{ v: 1 }, { v: 2 }]), domains: [NumDomain], cells: new Map([["only", new Map([["1", lit(5)]])]]) };
    const reference = new ReferenceSheetRun(columns, opts);
    const run = new SheetRun(columns, opts);
    for (const [c, k] of [["only", "0"], ["only", "1"], ["none", "0"], ["A", "1"]] as const) expect(reference.cell(c, k)).toEqual(run.cell(c, k));
    expect(reference.cell("only", "0")).toMatchObject({ ok: false, error: { code: "#NAME?", message: 'the cell "only" at "0" has no formula' } });
    expect(reference.cell("none", "0")).toMatchObject({ ok: false, error: { code: "#NAME?", message: 'the sheet has no column "none"' } });
  });
});

import { app, axes, cell, each, ext, let_, lit, offset, ref, SheetRun, space, type Expr, type Result, type SheetOptions } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ReferenceSheetRun } from "./reference-sheet.ts";
import { arbSheet, arbTwoTables, sheetCellsOf, sheetColumnsOf, sheetRowsOf } from "./sheet-arbitraries.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** This function reads each cell with the reference and with `SheetRun`, and it compares the whole results. */
function expectSame(columns: ReadonlyMap<string, Expr>, opts: SheetOptions, reads: readonly (readonly [string, string, string?])[]): readonly Result<unknown>[] {
  const reference = new ReferenceSheetRun(columns, opts);
  const run = new SheetRun(columns, opts);
  const got = reads.map(([c, k, t]) => reference.cell(c, k, t));
  expect(got).toEqual(reads.map(([c, k, t]) => run.cell(c, k, t)));
  return got;
}

/** This function gives the code and the message of an error result. */
const problem = (r: Result<unknown> | undefined): readonly [string, string] | undefined => (r === undefined || r.ok ? undefined : [r.error.code, r.error.message]);

describe("the scheduler of a sheet run (SHEET.DEEP)", () => {
  it("SHEET.DEEP SHEET.CYCLE SHEET.CELL.FORMULA SHEET.FILL: SheetRun gives the results of the recursive search, also with a small stack budget and after a fill", () => {
    fc.assert(
      fc.property(arbSheet, ({ formulas, own, rows, reads }) => {
        const columns = sheetColumnsOf(formulas);
        const opts = { space: sheetRowsOf(rows), domains: [NumDomain], cells: sheetCellsOf(own) };
        const reference = new ReferenceSheetRun(columns, opts);
        const expected = reads.map(([c, k]) => plain(reference.cell(c, k)));
        // The default budget, and budgets so small that most reads pause.
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(columns, opts) : new SheetRun(columns, opts, budget);
          expect(reads.map(([c, k]) => plain(run.cell(c, k)))).toEqual(expected);
          // A fill evaluates each cell first. The reads then give the same results.
          const filled = new SheetRun(columns, opts, budget);
          filled.fill();
          expect(reads.map(([c, k]) => plain(filled.cell(c, k)))).toEqual(expected);
        }
      }),
    );
  });
});

describe("the scheduler of a sheet run with two tables (SHEET.TABLES)", () => {
  it("SHEET.TABLES SHEET.CYCLE SHEET.FILL: SheetRun gives the results of the recursive search over two tables, with each budget and after a fill", () => {
    fc.assert(
      fc.property(arbTwoTables, (t) => {
        const tables = new Map([["other", { space: sheetRowsOf(t.otherRows), columns: sheetColumnsOf(t.other) }]]);
        const opts = { space: sheetRowsOf(t.mainRows), domains: [NumDomain], name: "main", tables };
        const reference = new ReferenceSheetRun(sheetColumnsOf(t.main), opts);
        const expected = t.reads.map(([table, c, k]) => plain(reference.cell(c, k, table)));
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(sheetColumnsOf(t.main), opts) : new SheetRun(sheetColumnsOf(t.main), opts, budget);
          expect(t.reads.map(([table, c, k]) => plain(run.cell(c, k, table)))).toEqual(expected);
          // A fill of the other table, then of the main table.
          const filled = new SheetRun(sheetColumnsOf(t.main), opts, budget);
          filled.fill("other");
          filled.fill();
          expect(t.reads.map(([table, c, k]) => plain(filled.cell(c, k, table)))).toEqual(expected);
        }
      }),
    );
  });
});

describe("the reference of a sheet run", () => {
  it("SHEET.CYCLE SHEET.CELL.FORMULA: the reference gives the whole results of SheetRun, with the messages of the errors", () => {
    fc.assert(
      fc.property(arbSheet, ({ formulas, own, rows, reads }) => {
        expectSame(sheetColumnsOf(formulas), { space: sheetRowsOf(rows), domains: [NumDomain], cells: sheetCellsOf(own) }, reads);
      }),
    );
  });

  it("SHEET.CELL: a cell reference without a column name or a valid address gives #VALUE!", () => {
    const bad: readonly unknown[] = [null, "A", { column: 1, at: [] }, { column: "A" }, { column: "A", at: [{ t: "nope" }] }, { at: [] }];
    // Each reference is in the body of a let, so its error has a path that is not empty.
    const columns = new Map<string, Expr>([["ok", lit(1)], ...bad.map((data, i): [string, Expr] => [`bad${i}`, let_({}, ext("vex.cell", data))])]);
    const got = expectSame(columns, { space: sheetRowsOf([1]) }, [["ok", "0"], ...bad.map((_d, i) => [`bad${i}`, "0"] as const)]);
    expect(got.map(problem)).toEqual([undefined, ...bad.map(() => ["#VALUE!", "a cell reference needs a column name and an address"])]);
    expect(got.map((r) => (r.ok ? undefined : r.error.path))).toEqual([undefined, ...bad.map(() => [0])]);
  });

  it("SHEET.TABLES: the first table of a name wins, and a run without a name has no table with an empty name", () => {
    const mainRows = sheetRowsOf([1]);
    const tables = new Map([
      ["main", { space: sheetRowsOf([7]), columns: new Map([["A", lit(2)]]) }],
      ["t2", { space: sheetRowsOf([5]), columns: new Map([["A", ref("v")]]) }],
      // A table with the space of the main table: the cell references in the main table still read the main table.
      ["alias", { space: mainRows, columns: new Map([["A", lit(9)]]) }],
    ]);
    const columns = new Map<string, Expr>([
      ["A", lit(1)],
      ["B", app("count", each(axes.table("undefined"), lit(1)))],
      ["C", app("sum", each(axes.table("t2"), cell("A")))],
      ["D", app("add", cell("A"), lit(1))],
    ]);
    const named = expectSame(columns, { space: mainRows, domains: [NumDomain], name: "main", tables }, [["A", "0", "main"], ["A", "0", "t2"], ["zzz", "0", "t2"], ["A", "0", "nope"], ["C", "0"], ["D", "0"], ["A", "0", "alias"]]);
    expect(named.map(plain)).toEqual([1, 5, "#NAME?", "#REF!", 5, 2, 9]);
    expect(problem(named[2])).toEqual(["#NAME?", 'the table "t2" has no column "zzz"']);
    expect(problem(named[3])).toEqual(["#REF!", 'the run has no table "nope"']);
    const unnamed = expectSame(columns, { space: mainRows, domains: [NumDomain], tables }, [["A", "0", ""], ["A", "0", "undefined"], ["B", "0"], ["zzz", "0"]]);
    expect(unnamed.map(plain)).toEqual(["#REF!", "#REF!", "#REF!", "#NAME?"]);
    expect(problem(unnamed[3])).toEqual(["#NAME?", 'the sheet has no column "zzz"']);
  });

  it("SHEET.CYCLE SHEET.ORDER: ifError does not hide a cycle of two cells, and a finished cell evaluates once", () => {
    const columns = new Map<string, Expr>([
      ["A", app("ifError", cell("B"), lit(1))],
      ["B", cell("A")],
      // Each cell reads the cell above twice. Without the results of the finished cells, the reads take 2 to the 40 steps.
      ["F", app("add", app("ifError", cell("F", [offset(-1)]), lit(1)), app("ifError", cell("F", [offset(-1)]), lit(1)))],
    ]);
    const got = expectSame(columns, { space: sheetRowsOf(Array.from({ length: 40 }, () => 0)), domains: [NumDomain] }, [["A", "0"], ["B", "0"], ["F", "39"]]);
    expect(got.map(plain)).toEqual(["#CYCLE!", "#CYCLE!", 2 ** 40]);
    expect(problem(got[0])).toEqual(["#CYCLE!", 'the cell "A" at "0" is on a cycle of cell references']);
  });

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

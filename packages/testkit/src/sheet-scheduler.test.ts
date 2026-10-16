import { lit, ref, SheetRun, space, type Result } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ReferenceSheetRun } from "./reference-sheet.ts";
import { arbSheet, arbTwoTables, sheetCellsOf, sheetColumnsOf, sheetRowsOf } from "./sheet-arbitraries.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

describe("the scheduler of a sheet run (SHEET.DEEP)", () => {
  it("SHEET.DEEP SHEET.CYCLE SHEET.CELL.FORMULA: SheetRun gives the results of the recursive search, also with a small stack budget", () => {
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
        }
      }),
    );
  });
});

describe("the scheduler of a sheet run with two tables (SHEET.TABLES)", () => {
  it("SHEET.TABLES SHEET.CYCLE: SheetRun gives the results of the recursive search over two tables, with each budget", () => {
    fc.assert(
      fc.property(arbTwoTables, (t) => {
        const tables = new Map([["other", { space: sheetRowsOf(t.otherRows), columns: sheetColumnsOf(t.other) }]]);
        const opts = { space: sheetRowsOf(t.mainRows), domains: [NumDomain], name: "main", tables };
        const reference = new ReferenceSheetRun(sheetColumnsOf(t.main), opts);
        const expected = t.reads.map(([table, c, k]) => plain(reference.cell(c, k, table)));
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(sheetColumnsOf(t.main), opts) : new SheetRun(sheetColumnsOf(t.main), opts, budget);
          expect(t.reads.map(([table, c, k]) => plain(run.cell(c, k, table)))).toEqual(expected);
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

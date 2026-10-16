import type { CompileOptions, Expr } from "@mark1russell7/vex";
import { tiered, type TieredProgram } from "@mark1russell7/vex-compiler";
import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import { describe, expect, it } from "vitest";
import { setCellFormula, type SheetDoc } from "./doc.ts";
import { showTable } from "./book.ts";
import { evaluateBook, evaluateDoc, gridLiteral, gridOf, rowNamesOf, type Compiler } from "./engine.ts";
import { EXAMPLES, exampleBook } from "./examples.ts";
import { formatValue } from "./values.ts";

const compiler: Compiler = { compile: compileFormula, toVexChain, highlight: highlightFormula, functions: FUNCTIONS, domains: FORMULA_DOMAINS };

/** This function gives the text of each cell of a column of an example, in row order. */
function column(id: string, name: string): string[] {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (ex === undefined) throw new Error(id);
  const ev = evaluateDoc(ex.doc, compiler);
  const col = ex.doc.columns.find((c) => c.name === name);
  return ex.doc.rows.map((r) => {
    const res = col === undefined ? undefined : ev.cell(r.id, col.id);
    return res === undefined ? "" : res.ok ? formatValue(res.value) : res.error.code;
  });
}

describe("the examples with the formula language", () => {
  it("each formula of each table of each example compiles, and no cell has an error value", () => {
    for (const ex of EXAMPLES) {
      const book = exampleBook(ex);
      book.tables.forEach((table, i) => {
        const ev = evaluateBook(showTable(book, i), compiler);
        // A column of a grid has no formula of its own, so only a column with a formula must compile.
        expect(table.columns.filter((c) => c.kind === "formula" && c.formula.trim() !== "" && ev.compiled.get(c.id)?.ok !== true).map((c) => c.name)).toEqual([]);
        expect({ id: ex.id, table: table.title, errors: ev.errors }).toEqual({ id: ex.id, table: table.title, errors: 0 });
      });
    }
  });

  it("SHEET.COMPILE: with the compiler of the IR, each cell of each table of each example has the same result", () => {
    const programs: TieredProgram[] = [];
    const compileProgram = (e: Expr, o: CompileOptions): TieredProgram => {
      const p = tiered(e, o);
      programs.push(p);
      return p;
    };
    const fast: Compiler = { ...compiler, compileProgram };
    for (const ex of EXAMPLES) {
      const book = exampleBook(ex);
      book.tables.forEach((table, i) => {
        const shown = showTable(book, i);
        const slow = evaluateBook(shown, compiler);
        const quick = evaluateBook(shown, fast);
        for (const r of table.rows) for (const c of table.columns) expect({ id: ex.id, row: r.id, column: c.name, result: quick.cell(r.id, c.id) }).toEqual({ id: ex.id, row: r.id, column: c.name, result: slow.cell(r.id, c.id) });
      });
    }
    // Most formulas of the examples have generated code, and tier 2 gives most results.
    const runs = programs.reduce((n, p) => n + p.stats.runs, 0);
    const fallbacks = programs.reduce((n, p) => n + p.stats.fallbacks, 0);
    expect(programs.filter((p) => p.tier === 2).length / programs.length).toBeGreaterThan(0.8);
    expect(1 - fallbacks / runs).toBeGreaterThan(0.8);
  });

  it("gives the roll-ups of the budget, the ranks of the grades, the loan balance and the far corners", () => {
    expect(column("budget", "Total").slice(0, 5)).toEqual(["1,350", "1,200", "90", "60", "630"]);
    expect(column("budget", "Share")[0]).toBe("0.642857");
    expect(column("grades", "Rank")).toEqual(["1", "4", "5", "3", "2"]);
    expect(column("grades", "Grade")).toEqual(["A", "B", "C", "B", "A"]);
    expect(column("loan", "Balance")[0]).toBe("9,190");
    expect(column("loan", "Interest").slice(0, 2)).toEqual(["50", "45.95"]);
    expect(column("loan", "Balance")[11]).toBe("8.194478");
    expect(column("shapes", "Far corner")).toEqual(["(12, 2)", "(3, 10)", "(12, 10)"]);
  });

  it("gives a layout: the widths go up the tree, and the positions go down it and across the siblings", () => {
    expect(column("layout", "Width")).toEqual(["17", "3", "10", "5", "4", "2"]);
    expect(column("layout", "X")).toEqual(["0", "0", "4", "4", "10", "15"]);
    expect(column("layout", "Right")).toEqual(["17", "3", "14", "9", "14", "17"]);
    expect(column("layout", "Share of page")[2]).toBe("0.588235");
  });

  it("gives rabbits and foxes: two columns that read each other one row up have no cycle", () => {
    const rabbits = column("prey", "Rabbits");
    const foxes = column("prey", "Foxes");
    expect([rabbits[0], foxes[0], rabbits[1], foxes[1], rabbits[2], foxes[2]]).toEqual(["100", "20", "106", "20", "112.36", "20.12"]);
    // The rabbits grow while the foxes are few, and then the foxes catch up.
    expect(rabbits[17]).toBe("212.588879");
    expect(foxes[29]).toBe("112.732787");
  });

  it("gives a project plan: a task starts at the end of the task before it, and a phase ends with its last task", () => {
    expect(column("plan", "Start")).toEqual(["0", "0", "3", "5", "5", "15", "19"]);
    expect(column("plan", "Finish")).toEqual(["5", "3", "5", "19", "15", "19", "19"]);
    expect(column("plan", "Days to launch")).toEqual(["14", "16", "14", "0", "4", "0", "0"]);
  });

  it("gives a thrown ball: the velocity and the position step with vectors, and Y reads the height", () => {
    expect(column("ball", "Position").slice(0, 3)).toEqual(["(0, 0)", "(1, 3)", "(2, 5.3875)"]);
    expect(column("ball", "Height")[11]).toBe("-0.6875");
    expect(column("ball", "In the air").slice(9)).toEqual(["TRUE", "TRUE", "FALSE"]);
  });

  it("gives test scores: a z-score with an aggregate in an aggregate, and a read of the row with a name", () => {
    expect(column("scores", "Z-score")).toEqual(["1.238117", "-0.270838", "-0.735132", "0.541676", "0.889897", "-1.66372"]);
    expect(column("scores", "Versus Ada")).toEqual(["0", "-13", "-17", "-6", "-3", "-25"]);
    expect(column("scores", "Top half")).toEqual(["TRUE", "FALSE", "FALSE", "TRUE", "TRUE", "FALSE"]);
  });

  it("gives an org chart: the headcount and the cost go up the tree, and the level goes down it", () => {
    expect(column("org", "Headcount")).toEqual(["6", "3", "1", "1", "2", "1"]);
    expect(column("org", "Team cost")).toEqual(["810", "380", "120", "110", "230", "90"]);
    expect(column("org", "Level")).toEqual(["1", "2", "3", "3", "2", "3"]);
    expect(column("org", "Share")[1]).toBe("0.469136");
  });

  it("gives a recipe: the scale goes down the tree from the servings, and the cost goes up it", () => {
    expect(column("recipe", "Scale")).toEqual(Array.from({ length: 8 }, () => "1.5"));
    expect(column("recipe", "Buy")).toEqual(["", "", "300 g", "450 ml", "3 pcs", "", "90 ml", "150 g"]);
    expect(column("recipe", "Cost")).toEqual(["5.94", "1.89", "0.6", "0.54", "0.75", "4.05", "1.8", "2.25"]);
    expect(column("recipe", "Per serving")[0]).toBe("0.99");
  });

  it("SHEET.CELL.FORMULA: the first month of the loan has its own formulas, and the other months take the formulas of the columns", () => {
    const loan = EXAMPLES.find((e) => e.id === "loan")?.doc;
    if (loan === undefined) throw new Error("loan");
    const text = (d: SheetDoc, row: string, col: string): string => {
      const r = evaluateDoc(d, compiler).cell(row, col);
      return r === undefined ? "" : r.ok ? formatValue(r.value) : r.error.code;
    };
    // Without its own formulas, the first month reads a month that does not exist. The interest gives #REF!, and the
    // balance adds two failed values, so it gives #ARGS. Each later month reads the failed month before it.
    const plain: SheetDoc = { ...loan, rows: loan.rows.map(({ formulas: _f, ...r }) => r) };
    expect([text(plain, "r1", "c3"), text(plain, "r1", "c4"), text(plain, "r12", "c4")]).toEqual(["#REF!", "#ARGS", "#ARGS"]);
    // An error in the own formula of a cell is an error of that cell, with the reason. The cells that read it fail too:
    // the balance of month 2 adds the failed balance and the failed interest, so it gives #ARGS.
    const typo = setCellFormula(loan, "r1", "c4", "= 10000 +");
    const ev = evaluateDoc(typo, compiler);
    const bad = ev.cell("r1", "c4");
    expect(bad?.ok === false && bad.error.message).toMatch(/^the formula of this cell of "Balance" has an error: /);
    expect([text(typo, "r1", "c3"), text(typo, "r1", "c4"), text(typo, "r2", "c4")]).toEqual(["50", "#VALUE!", "#ARGS"]);
    expect(ev.compiledCell("r1", "c4")?.ok).toBe(false);
    expect(ev.compiledCell("r2", "c4")?.ok).toBe(true);
    // The trace of a cell shows the steps of its own formula.
    expect(evaluateDoc(loan, compiler).explain("r1", "c3")?.events.length).toBeGreaterThan(0);
    expect(ev.explain("r1", "c4")).toBeUndefined();
    // A column without a formula gives empty cells, and a cell with its own formula gives its value.
    const empty: SheetDoc = { ...loan, columns: loan.columns.map((c) => (c.id === "c3" && c.kind === "formula" ? { ...c, formula: "" } : c)) };
    expect([text(empty, "r1", "c3"), text(empty, "r2", "c3")]).toEqual(["50", ""]);
  });

  it("FORMULA.AGGREGATE.WINDOW: monthly sales: a moving average, a total for the year and the best month, from a window of rows", () => {
    expect(column("sales", "Average of 3")).toEqual(["120", "127.5", "127.666667", "137.666667", "146.666667", "155.666667", "162.333333", "169", "176", "184.333333", "193.666667", "203.333333"]);
    expect(column("sales", "Year to date")).toEqual(["120", "255", "383", "533", "695", "850", "1,020", "1,202", "1,378", "1,573", "1,783", "1,988"]);
    expect(column("sales", "Best so far")).toEqual(["120", "135", "135", "150", "162", "162", "170", "182", "182", "195", "210", "210"]);
    expect(column("sales", "Change")).toEqual(["0", "15", "-7", "22", "12", "-7", "15", "12", "-6", "19", "15", "-5"]);
  });

  it("FORMULA.DATE: invoices: a due date, a weekend that moves to Monday, the days late and the status", () => {
    // The values come from the Date of JavaScript: 2026-10-31 is a Saturday, so the invoice is due on Monday 2026-11-02.
    expect(column("invoices", "Due")).toEqual(["2026-10-01", "2026-10-05", "2026-09-29", "2026-10-31", "2026-11-17"]);
    expect(column("invoices", "Pay by")).toEqual(["2026-10-01", "2026-10-05", "2026-09-29", "2026-11-02", "2026-11-17"]);
    expect(column("invoices", "Days late")).toEqual(["0", "4", "0", "", ""]);
    expect(column("invoices", "Status")).toEqual(["on time", "late", "on time", "open", "open"]);
  });

  it("FORMULA.GRID.ADDRESS FORMULA.GRID.RANGE: a grid with A1 addresses, ranges, labels, empty cells and a date", () => {
    expect(column("grid", "A").slice(0, 9)).toEqual(["Item", "Pens", "Paper", "Ink", "", "Total", "Average price", "Largest line", "Ordered"]);
    expect(column("grid", "B").slice(0, 9)).toEqual(["Price", "1.5", "4", "12.5", "", "", "6", "", "2026-10-13"]);
    expect(column("grid", "D").slice(0, 10)).toEqual(["Total", "15", "12", "25", "", "52", "", "25", "2026-11-12", ""]);
    // The literal of a cell: a number, TRUE or FALSE, a date, or else the text itself.
    expect(["12", " true ", "yes", "2026-10-13", "hello"].map((t) => gridLiteral(t).kind)).toEqual(["number", "boolean", "text", "date", "text"]);
    const ex = EXAMPLES.find((e) => e.id === "grid");
    const g = ex === undefined ? undefined : gridOf(ex.doc);
    expect([g?.columns, g?.cells.get("D2"), g?.cells.get("B2"), g?.cells.get("A1"), g?.cells.get("B9"), g?.cells.get("E1")]).toEqual([["A", "B", "C", "D", "E", "F"], "formula", "number", "text", "date", undefined]);
  });

  it("FORMULA.TABLE.AXIS SHEET.TABLES: orders read the prices of the products, and the products count their units in the orders", () => {
    const ex = EXAMPLES.find((e) => e.id === "orders");
    if (ex === undefined) throw new Error("orders");
    const book = exampleBook(ex);
    expect(exampleBook(ex)).toBe(book);
    const columnOf = (b: typeof book, table: number, name: string): string[] => {
      const shown = showTable(b, table);
      const doc = shown.tables[table];
      const ev = evaluateBook(shown, compiler);
      const col = doc?.columns.find((c) => c.name === name);
      return (doc?.rows ?? []).map((r) => {
        const res = col === undefined ? undefined : ev.cell(r.id, col.id);
        return res === undefined ? "" : res.ok ? formatValue(res.value) : res.error.code;
      });
    };
    expect(columnOf(book, 0, "Price")).toEqual(["1.5", "12", "4", "1.5"]);
    expect(columnOf(book, 0, "Cost")).toEqual(["4.5", "24", "20", "1.5"]);
    expect(columnOf(book, 1, "Sold")).toEqual(["4", "2", "5", "0"]);
    expect(columnOf(book, 1, "Revenue")).toEqual(["6", "24", "20", "0"]);
    // A new name of the table Products breaks the reads of the orders, with the reason.
    const renamed = { ...book, tables: book.tables.map((t, i) => (i === 1 ? { ...t, title: "Goods" } : t)) };
    const price = evaluateBook(renamed, compiler).compiled.get("c3");
    expect(price?.ok === false && price.error.message).toBe('the table "Products" does not exist');
  });

  it("FORMULA.NAV.NAME: the name of a row is the text of the first column, when that column is a text column", () => {
    const ex = EXAMPLES.find((e) => e.id === "org");
    if (ex === undefined) throw new Error("org");
    expect([...rowNamesOf(ex.doc).entries()].slice(0, 2)).toEqual([["Ada", ["r1"]], ["Ben", ["r2"]]]);
    // A duplicate name finds two rows, so the formula that reads it has an error with the reason.
    const twin = { ...ex.doc, rows: ex.doc.rows.map((r) => (r.id === "r2" ? { ...r, cells: { ...r.cells, c1: "Ada" } } : r)) };
    expect(rowNamesOf(twin).get("Ada")).toEqual(["r1", "r2"]);
    const share = evaluateDoc(twin, compiler).compiled.get("c7");
    expect(share?.ok === false && share.error.message).toBe('2 rows have the name "Ada". Give the row a name that no other row has');
    // A first column that is not a text column gives no names.
    const loan = EXAMPLES.find((e) => e.id === "loan");
    expect(loan === undefined ? "none" : rowNamesOf(loan.doc).size).toBe(0);
  });
});

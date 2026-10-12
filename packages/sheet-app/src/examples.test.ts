import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import { describe, expect, it } from "vitest";
import { evaluateDoc, rowNamesOf, type Compiler } from "./engine.ts";
import { EXAMPLES } from "./examples.ts";
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
  it("each formula of each example compiles, and no cell has an error value", () => {
    for (const ex of EXAMPLES) {
      const ev = evaluateDoc(ex.doc, compiler);
      expect([...ev.compiled.values()].filter((c) => !c.ok)).toEqual([]);
      expect({ id: ex.id, errors: ev.errors }).toEqual({ id: ex.id, errors: 0 });
    }
  });

  it("gives the roll-ups of the budget, the ranks of the grades, the loan balance and the far corners", () => {
    expect(column("budget", "Total").slice(0, 5)).toEqual(["1,350", "1,200", "90", "60", "630"]);
    expect(column("budget", "Share")[0]).toBe("0.642857");
    expect(column("grades", "Rank")).toEqual(["1", "4", "5", "3", "2"]);
    expect(column("grades", "Grade")).toEqual(["A", "B", "C", "B", "A"]);
    expect(column("loan", "Balance")[0]).toBe("9,190");
    expect(column("loan", "Interest")[1]).toBe("45.95");
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

import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import { describe, expect, it } from "vitest";
import { evaluateDoc, type Compiler } from "./engine.ts";
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
});

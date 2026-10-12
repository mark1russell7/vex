import { SheetRun, vex, type AnyDomain, type Expr, type Space } from "@mark1russell7/vex";
import { fromCore } from "@mark1russell7/vex-testkit";
import { compileAst, compileFormula, FORMULA_DOMAINS, toVexChain, type FormulaContext } from "@vex/formula";
import { arbAst, arbTable, TABLE_COLUMNS } from "@vex/formula/testing";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseChain, programOf, runChain } from "./chain-parser.ts";

const DOMAINS: readonly AnyDomain[] = FORMULA_DOMAINS;
const VALUES: FormulaContext = { valueColumns: [...TABLE_COLUMNS], formulaColumns: [] };
const WITH_F1: FormulaContext = { valueColumns: [...TABLE_COLUMNS], formulaColumns: ["f1"] };

/** This function reads the chain text of an expression with the Lab reader, over the space of a table. */
const readChain = (text: string, s: Space): Expr => programOf(runChain(parseChain(text), { root: vex(...DOMAINS).over(s) }), text);

/** The Vex view of a formula over the columns cost, qty and name, and the formula column total. */
const chain = (text: string): string => {
  const r = compileFormula(text, { valueColumns: ["cost", "qty", "name"], formulaColumns: ["total"] });
  if (!r.ok) throw new Error(r.error.message);
  return toVexChain(r.expr);
};

describe("the Vex view of a formula", () => {
  it("FORMULA.CHAIN: the Lab reader reads the chain of a formula, and the chain gives the same result at each row", () => {
    fc.assert(
      fc.property(arbTable, arbAst(TABLE_COLUMNS), arbAst([...TABLE_COLUMNS, "f1"]), (t, ast1, ast2) => {
        const f1 = compileAst(ast1, VALUES);
        const f2 = compileAst(ast2, WITH_F1);
        fc.pre(f1.ok && f2.ok);
        if (!f1.ok || !f2.ok) return;
        const text = toVexChain(f2.expr);
        // The Lab reader reads at most 6000 characters.
        fc.pre(text.length <= 6000);
        const run = new SheetRun(new Map([["f1", f1.expr], ["f2", f2.expr], ["chain", readChain(text, t)]]), { space: t, domains: DOMAINS });
        for (const k of t.keys) expect(fromCore(run.cell("chain", k))).toEqual(fromCore(run.cell("f2", k)));
      }),
    );
  });

  it("FORMULA.CHAIN: examples of the Vex view", () => {
    expect(chain("= cost * qty")).toBe('root.from("cost")._.multiply(root.from("qty"))');
    expect(chain("row(-1).total + cost")).toBe('root.start(root.ext("vex.cell", { column: "total", at: [{ t: "offset", d: [-1] }] }))._.add(root.from("cost"))');
    expect(chain("SUM(children.cost)")).toBe('root.start(0).children((c) => root.from("cost")).sum({ strict: true })');
    expect(chain("COUNT(parent.children WHERE cost > this.cost)")).toBe(
      'root.start(0).parent().children((c) => root.start(true), { where: (c) => root.from("cost")._.gt(root.start(0).origin().from("cost")) }).count({ strict: true })',
    );
    expect(chain('IF(cost > 1e-7, name & "!", "say ""hi""")')).toBe('root.from("cost")._.gt(1e-7)._.if(root.from("name")._.concat(root.lit("!")), root.lit("say \\"hi\\""))');
    // String(-0) is "0". The chain keeps the sign of -0.
    expect(chain("-0")).toBe("root.start(-0)");
    expect(chain("RANK(qty)")).toBe('root.start(0).others((c) => root.start(true), { where: (c) => root.from("qty")._.gt(root.start(0).origin().from("qty")) }).count({ strict: true })._.add(1)');
  });
});

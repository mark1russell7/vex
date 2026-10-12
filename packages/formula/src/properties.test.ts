import { SheetRun, type Expr } from "@mark1russell7/vex";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileAst, compileFormula, FORMULA_DOMAINS, highlightFormula, type FormulaContext } from "./index.ts";
import { arbAst, arbTable, printAst, TABLE_COLUMNS } from "./testing.ts";

const VALUE_COLUMNS = TABLE_COLUMNS;

const outcome = (r: ReturnType<typeof compileAst>): unknown => (r.ok ? { expr: r.expr, reads: r.reads } : { error: r.error.message });

describe("properties of the formula language", () => {
  it("FORMULA.HIGHLIGHT and FORMULA.ERROR: for each text, the highlighter keeps each character, and the compiler gives a result", () => {
    const ctx: FormulaContext = { valueColumns: ["a", "b"], formulaColumns: ["f"] };
    const texty = fc.oneof(fc.string({ unit: "binary" }), fc.stringMatching(/^[=a-z0-9 +\-*/^&<>(),."[\]]{0,20}$/));
    fc.assert(
      fc.property(texty, (text) => {
        expect(highlightFormula(text).map((p) => p.text).join("")).toBe(text);
        const r = compileFormula(text, ctx);
        expect(r.ok || (r.error.span.start >= 0 && r.error.span.end <= text.length && r.error.span.start <= r.error.span.end)).toBe(true);
      }),
    );
  });

  it("FORMULA.ROUND-TRIP: the text of a syntax tree gives the same expression as the tree", () => {
    const ctx: FormulaContext = { valueColumns: [...VALUE_COLUMNS], formulaColumns: ["f"] };
    fc.assert(
      fc.property(arbAst([...VALUE_COLUMNS, "f"]), (ast) => {
        expect(outcome(compileFormula(printAst(ast), ctx))).toEqual(outcome(compileAst(ast, ctx)));
      }),
    );
  });
});

/** This function replaces each cell reference to `name` without an address by the expression `by`. */
function inline(e: Expr, name: string, by: Expr): Expr {
  switch (e.tag) {
    case "ext": {
      const d = e.data as { column?: unknown; at?: readonly unknown[] };
      return e.kind === "vex.cell" && d.column === name && d.at?.length === 0 ? by : e;
    }
    case "app":
      return { ...e, args: e.args.map((x) => inline(x, name, by)) };
    case "each":
      return { ...e, body: inline(e.body, name, by), axis: e.axis.t === "where" ? { ...e.axis, test: inline(e.axis.test, name, by) } : e.axis };
    case "let":
      return { ...e, bind: Object.fromEntries(Object.entries(e.bind).map(([k, v]) => [k, inline(v, name, by)])), body: inline(e.body, name, by) };
    case "rec":
      return { ...e, fields: Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, inline(v, name, by)])) };
    case "lit":
    case "ref":
    case "var":
      return e;
  }
}
const hasCellWithAddress = (e: Expr): boolean => JSON.stringify(e).includes('"kind":"vex.cell"') && /"column":"f1","at":\[[^\]]/.test(JSON.stringify(e));

describe("the sheet evaluation of compiled formulas", () => {
  it("FORMULA.SHEET: a formula of value columns gives the result of the reference evaluator at each row", () => {
    const ctx: FormulaContext = { valueColumns: [...VALUE_COLUMNS], formulaColumns: [] };
    fc.assert(
      fc.property(arbTable, arbAst(VALUE_COLUMNS), (t, ast) => {
        const r = compileAst(ast, ctx);
        fc.pre(r.ok);
        if (!r.ok) return;
        const run = new SheetRun(new Map([["f", r.expr]]), { space: t, domains: FORMULA_DOMAINS });
        for (const k of t.keys) {
          expect(fromCore(run.cell("f", k))).toEqual(fromReference(referenceEvaluate(r.expr, { space: t, origin: k, domains: FORMULA_DOMAINS })));
        }
      }),
    );
  });

  it("FORMULA.SHEET: a read of a formula column gives the result of that formula, for a formula that does not read the origin", () => {
    const ctx1: FormulaContext = { valueColumns: [...VALUE_COLUMNS], formulaColumns: [] };
    const ctx2: FormulaContext = { valueColumns: [...VALUE_COLUMNS], formulaColumns: ["f1"] };
    fc.assert(
      fc.property(arbTable, arbAst(VALUE_COLUMNS), arbAst([...VALUE_COLUMNS, "f1"]), (t, ast1, ast2) => {
        const f1 = compileAst(ast1, ctx1);
        const f2 = compileAst(ast2, ctx2);
        fc.pre(f1.ok && f2.ok);
        if (!f1.ok || !f2.ok) return;
        // A cell reference evaluates its formula at the row of the reference. An inline copy evaluates with the
        // origin of the reader. Both are the same for a formula that does not read the origin.
        fc.pre(!JSON.stringify(f1.expr).includes('"t":"origin"') && !hasCellWithAddress(f2.expr));
        const run = new SheetRun(new Map([["f1", f1.expr], ["f2", f2.expr]]), { space: t, domains: FORMULA_DOMAINS });
        const inlined = inline(f2.expr, "f1", f1.expr);
        for (const k of t.keys) {
          expect(fromCore(run.cell("f2", k))).toEqual(fromReference(referenceEvaluate(inlined, { space: t, origin: k, domains: FORMULA_DOMAINS })));
        }
      }),
    );
  });
});

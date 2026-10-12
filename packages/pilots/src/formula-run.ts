/**
 * The formula path of the pilots: this module compiles the formula columns of a sheet with `@vex/formula`, and it
 * evaluates the cells with a `SheetRun`. The pilots compare this path with the typed builder and with a reference.
 */
import { SheetRun, type Expr, type Result, type Space } from "@mark1russell7/vex";
import { compileFormula, FORMULA_DOMAINS } from "@vex/formula";

/** The cells of a sheet of formulas: one result for each key and each formula column. */
export type FormulaCells = (key: string, column: string) => Result<unknown>;

/**
 * This function compiles the formula columns `formulas` (name to text) and gives the cells. The value columns are the
 * fields of the records. A formula that does not compile throws, because a pilot has fixed formulas.
 */
export function runFormulas(sp: Space, valueColumns: readonly string[], formulas: Readonly<Record<string, string>>): FormulaCells {
  const ctx = { valueColumns, formulaColumns: Object.keys(formulas) };
  const programs = new Map<string, Expr>();
  for (const [name, text] of Object.entries(formulas)) {
    const r = compileFormula(text, ctx);
    if (!r.ok) throw new Error(`the formula of "${name}" does not compile: ${r.error.message}`);
    programs.set(name, r.expr);
  }
  const run = new SheetRun(programs, { space: sp, domains: FORMULA_DOMAINS });
  return (key, column) => run.cell(column, key);
}

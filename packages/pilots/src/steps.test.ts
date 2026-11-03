import { programStep, type Expr } from "@mark1russell7/vex";
import { compileFormula } from "@vex/formula";
import { describe, expect, it } from "vitest";
import { BOM_FORMULAS } from "./bom.ts";
import { forceProgram } from "./force.ts";
import { GRADE_FORMULAS } from "./grades.ts";
import { heatStep } from "./heat.ts";
import { INVOICE_FORMULAS } from "./invoice.ts";
import { ESCAPE_PROGRAM } from "./ireko-audit.ts";
import { GRID_PROGRAM } from "./ireko-grid.ts";
import { MEASURE_COLUMNS } from "./ireko-measure.ts";
import { PLACE_COLUMNS } from "./ireko-place.ts";
import { RADIAL_PROGRAM } from "./ireko-radial.ts";
import { NODE_SHAPE, SHAPE_COLUMNS } from "./ireko-shapes.ts";
import { loanFormulas } from "./loan.ts";
import { SCHEMA_PROGRAM } from "./schema.ts";

/** This function compiles the formulas of a pilot sheet, with its value columns. */
function formulas(prefix: string, valueColumns: readonly string[], texts: Readonly<Record<string, string>>): [string, Expr][] {
  const ctx = { valueColumns, formulaColumns: Object.keys(texts) };
  return Object.entries(texts).map(([name, text]) => {
    const r = compileFormula(text, ctx);
    if (!r.ok) throw new Error(`the formula of "${name}" does not compile: ${r.error.message}`);
    return [`${prefix}.${name}`, r.expr];
  });
}

/** The programs of the pilots, by name. */
const PILOTS: readonly [string, Expr][] = [
  ["escape", ESCAPE_PROGRAM],
  ["grid", GRID_PROGRAM],
  ["radial", RADIAL_PROGRAM],
  ["nodeShape", NODE_SHAPE],
  ["schema", SCHEMA_PROGRAM],
  ["force", forceProgram({ steps: 20, repel: 1, spring: 0.25, center: 0.05 })],
  ["heat", heatStep(0.25).expr],
  ...[...MEASURE_COLUMNS].map(([c, e]): [string, Expr] => [`measure.${c}`, e]),
  ...[...PLACE_COLUMNS].map(([c, e]): [string, Expr] => [`place.${c}`, e]),
  ...[...SHAPE_COLUMNS].map(([c, e]): [string, Expr] => [`shapes.${c}`, e]),
  ...formulas("bom", ["qty", "cost"], BOM_FORMULAS),
  ...formulas("grades", ["name", "score"], GRADE_FORMULAS),
  ...formulas("invoice", ["qty", "price", "total", "discount"], INVOICE_FORMULAS),
  ...formulas("loan", ["payment", "extra"], loanFormulas({ principal: 1000, rate: 0.01 })),
];

describe("the steps of the pilots", () => {
  it("STEP.LOWEST: each program of the pilots is of step A", () => {
    const steps = Object.fromEntries(PILOTS.map(([name, e]) => [name, programStep(e).step]));
    expect(Object.keys(steps).length).toBeGreaterThan(20);
    expect(Object.entries(steps).filter(([, step]) => step !== "A")).toEqual([]);
  });
});

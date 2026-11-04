/**
 * The programs of the pilots, by name. The list has the programs of the ireko, force and heat pilots. It also has the
 * columns of the sheets of ireko and the formula columns of the spreadsheet pilots. The test of the steps and the script
 * `bench/fallback-share.ts` read this list. The package root does not export this module.
 */
import type { Expr } from "@mark1russell7/vex";
import { compileFormula } from "@vex/formula";
import { BOM_FORMULAS } from "./bom.ts";
import { forceProgram, type ForceOptions } from "./force.ts";
import { GRADE_FORMULAS } from "./grades.ts";
import { heatStep } from "./heat.ts";
import { INVOICE_FORMULAS } from "./invoice.ts";
import { ESCAPE_PROGRAM } from "./ireko-audit.ts";
import { GRID_PROGRAM } from "./ireko-grid.ts";
import { LAYERS_PROGRAM } from "./ireko-layers.ts";
import { AVOID_PROGRAM, EDGE_DIRECTION_PROGRAM, LABEL_BOX_PROGRAM, OBSTACLES_PROGRAM, ORTHOGONAL_PROGRAM, STRAIGHT_PROGRAM } from "./ireko-route.ts";
import { TREE_PROGRAM } from "./ireko-tree.ts";
import { MEASURE_COLUMNS } from "./ireko-measure.ts";
import { PLACE_COLUMNS } from "./ireko-place.ts";
import { RADIAL_PROGRAM } from "./ireko-radial.ts";
import { NODE_SHAPE, SHAPE_COLUMNS } from "./ireko-shapes.ts";
import { loanFormulas, type LoanTerms } from "./loan.ts";
import { SCHEMA_PROGRAM } from "./schema.ts";

/** The tuning of the program `force` of the list. */
export const PILOT_FORCE: ForceOptions = { steps: 20, repel: 1, spring: 0.25, center: 0.05 };

/** The value of alpha of the program `heat` of the list. */
export const PILOT_ALPHA = 0.25;

/** The terms of the loan of the formulas `loan.*` of the list. */
export const PILOT_LOAN: LoanTerms = { principal: 1000, rate: 0.01 };

/** This function compiles the formulas of a pilot sheet, with its value columns. */
export function formulas(prefix: string, valueColumns: readonly string[], texts: Readonly<Record<string, string>>): [string, Expr][] {
  const ctx = { valueColumns, formulaColumns: Object.keys(texts) };
  return Object.entries(texts).map(([name, text]) => {
    const r = compileFormula(text, ctx);
    if (!r.ok) throw new Error(`the formula of "${name}" does not compile: ${r.error.message}`);
    return [`${prefix}.${name}`, r.expr];
  });
}

/** The programs of the pilots, by name. */
export const PILOTS: readonly [string, Expr][] = [
  ["escape", ESCAPE_PROGRAM],
  ["grid", GRID_PROGRAM],
  ["radial", RADIAL_PROGRAM],
  ["layers", LAYERS_PROGRAM],
  ["tree", TREE_PROGRAM],
  ["route.direction", EDGE_DIRECTION_PROGRAM],
  ["route.label", LABEL_BOX_PROGRAM],
  ["route.obstacles", OBSTACLES_PROGRAM],
  ["route.straight", STRAIGHT_PROGRAM],
  ["route.orthogonal", ORTHOGONAL_PROGRAM],
  ["route.avoid", AVOID_PROGRAM],
  ["nodeShape", NODE_SHAPE],
  ["schema", SCHEMA_PROGRAM],
  ["force", forceProgram(PILOT_FORCE)],
  ["heat", heatStep(PILOT_ALPHA).expr],
  ...[...MEASURE_COLUMNS].map(([c, e]): [string, Expr] => [`measure.${c}`, e]),
  ...[...PLACE_COLUMNS].map(([c, e]): [string, Expr] => [`place.${c}`, e]),
  ...[...SHAPE_COLUMNS].map(([c, e]): [string, Expr] => [`shapes.${c}`, e]),
  ...formulas("bom", ["qty", "cost"], BOM_FORMULAS),
  ...formulas("grades", ["name", "score"], GRADE_FORMULAS),
  ...formulas("invoice", ["qty", "price", "total", "discount"], INVOICE_FORMULAS),
  ...formulas("loan", ["payment", "extra"], loanFormulas(PILOT_LOAN)),
];

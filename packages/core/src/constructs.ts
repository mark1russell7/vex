/**
 * The step of each construct of Vex (STEP.LADDER). The construct of a node is its tag. An `iterate` with a limit from
 * the data has its own construct `iterate.size` (ITERATE.LIMIT.DATA), of step B. Each other construct is of step A. A
 * function cannot call itself (FN.TOTAL). The table is its own module, so a test can declare a construct of a higher step.
 */
import type { ExprTag } from "./ir.ts";

/** A step of Vex. Step A has loops with a fixed count. Step B adds limits from the data and fixed points. Step C adds functions that call themselves, with a budget. */
export type VexStep = "A" | "B" | "C";

/** The construct of an `iterate` with a limit from the data. */
export const ITERATE_SIZE = "iterate.size";

/** The step that each construct of Vex needs. The name of a construct is the tag of its node, or `ITERATE_SIZE`. */
export const CONSTRUCT_STEPS: Readonly<Record<ExprTag | typeof ITERATE_SIZE, VexStep>> = {
  lit: "A",
  ref: "A",
  app: "A",
  let: "A",
  var: "A",
  rec: "A",
  each: "A",
  fold: "A",
  iterate: "A",
  [ITERATE_SIZE]: "B",
  fn: "A",
  call: "A",
  ext: "A",
};

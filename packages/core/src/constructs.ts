/**
 * The step of each construct of Vex (STEP.LADDER). The construct of a node is its tag. Each construct is of step A
 * today: `iterate` has a literal limit (ITERATE.LIMIT), and a function cannot call itself (FN.TOTAL). A construct of
 * step B, for example a limit of `iterate` from the data, adds one entry here. The table is its own module, so a test
 * can declare a construct of a higher step.
 */
import type { ExprTag } from "./ir.ts";

/** A step of Vex. Step A has loops with a fixed count. Step B adds limits from the data and fixed points. Step C adds functions that call themselves, with a budget. */
export type VexStep = "A" | "B" | "C";

/** The step that each construct of Vex needs. The name of a construct is the tag of its node. */
export const CONSTRUCT_STEPS: Readonly<Record<ExprTag, VexStep>> = {
  lit: "A",
  ref: "A",
  app: "A",
  let: "A",
  var: "A",
  rec: "A",
  each: "A",
  fold: "A",
  iterate: "A",
  fn: "A",
  call: "A",
  ext: "A",
};

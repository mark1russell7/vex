/**
 * The steps of Vex (STEP.LADDER, STEP.LOWEST, STEP.MAX). A step is a level of the power of the language. Step A is a
 * total formula language. Step B adds limits from the data and fixed points. Step C adds functions that call
 * themselves. The checker gives the lowest step that a program needs, with the reason. The host option `maxStep` sets
 * the highest step that the host accepts. The default is B. A program has no field for its step, so a document cannot
 * raise its own step. The ladder is the ladder of steps of coeval (D116 of coeval), with the table of `constructs.ts`.
 */
import { checkStep, isStep, stepLadder, stepOf, stepRank, type StepLadder, type StepReason, type StepWalk } from "@mark1russell7/coeval";
import { CONSTRUCT_STEPS, type VexStep } from "./constructs.ts";
import { children, type Expr } from "./ir.ts";

export { CONSTRUCT_STEPS, type VexStep } from "./constructs.ts";

/** The steps of Vex, from the lowest to the highest. */
export const VEX_STEP_NAMES: readonly VexStep[] = ["A", "B", "C"];

/** The ladder of the steps of Vex: the steps and the step of each construct. */
export const VEX_STEPS: StepLadder<VexStep> = /* @__PURE__ */ stepLadder<VexStep>(VEX_STEP_NAMES, CONSTRUCT_STEPS);

/** The highest step that a host accepts without the option `maxStep`. */
export const DEFAULT_MAX_STEP: VexStep = "B";

/** The options of the check of steps: the highest step that the host accepts. */
export interface StepOptions {
  /** The highest step that the host accepts. The default is `DEFAULT_MAX_STEP`, step B. */
  readonly maxStep?: VexStep;
}

/** The step of a program, with the reason as text, and the construct and the path of the node that needs the step. */
export interface ProgramStep {
  readonly step: VexStep;
  /** The reason as text. */
  readonly reason: string;
  /** The construct that needs the step. A program of step A has none. */
  readonly construct?: string;
  /** The path of the node of the construct, as child indexes (EVAL.LOCATION). A program of step A has none. */
  readonly path?: readonly number[];
}

/** The walk of an expression: the construct of a node is its tag, and the key of a child is its child index. */
const WALK: StepWalk<Expr> = {
  construct: (e) => e.tag,
  children: (e) => children(e).map((child, i) => [i, child] as const),
};

/** This function gives the position of the highest step of a construct of the table. A limit at that step or higher accepts each program without a walk. */
const highest = (): number => Math.max(0, ...Object.values(VEX_STEPS.constructs).map((s) => stepRank(VEX_STEPS, s)));

const at = (path: readonly unknown[]): string => (path.length === 0 ? "at the root" : `at the path [${path.join(", ")}]`);

/**
 * This function gives the lowest step that a program needs, with the reason (STEP.LOWEST). The reason names the first
 * node in the order of `children` whose construct needs that step. The program must have a valid shape (EVAL.SHAPE).
 */
export function programStep(e: Expr): ProgramStep {
  const need = stepOf(VEX_STEPS, WALK, e);
  if (need.reason === undefined) return { step: need.step, reason: `each construct of the program is of step ${need.step}` };
  const { construct, path } = need.reason;
  return { step: need.step, reason: `the node "${construct}" ${at(path)} needs step ${need.step}`, construct, path: path as readonly number[] };
}

/**
 * This function gives the reason that a host refuses a program for its step, or `undefined` (STEP.MAX). A program of a
 * step above the option `maxStep` is not valid, and the reason names the step that it needs. A value of `maxStep` that
 * is not a step of Vex is not valid too. The program must have a valid shape (EVAL.SHAPE).
 */
export function stepError(e: Expr, opts: StepOptions = {}): string | undefined {
  const maxStep: unknown = opts.maxStep ?? DEFAULT_MAX_STEP;
  if (!isStep(VEX_STEPS, maxStep)) {
    const shown = typeof maxStep === "string" ? JSON.stringify(maxStep) : `of the type ${typeof maxStep}`;
    return `the option maxStep ${shown} is not a step of Vex. The steps are ${VEX_STEP_NAMES.join(", ")} (STEP.MAX)`;
  }
  // Stryker disable next-line ConditionalExpression: without the shortcut, the walk gives the same answer
  if (stepRank(VEX_STEPS, maxStep) >= highest()) return undefined;
  const refusal = checkStep(VEX_STEPS, stepOf(VEX_STEPS, WALK, e), maxStep);
  if (refusal === undefined) return undefined;
  // A refusal of `stepOf` has a reason, because its step is above the lowest step.
  const { construct, path } = refusal.reason as StepReason<Expr, VexStep>;
  return `the program needs step ${refusal.needed}, and the host accepts the steps up to ${maxStep}: the node "${construct}" ${at(path)} needs step ${refusal.needed} (STEP.MAX)`;
}

/**
 * The reference tier of Vex: a program as a plan of the kernel of coeval (decision D13 of coeval). The kernel evaluates
 * the document of the program with the machine of `kernel.ts`. The closure compiler and the loop compiler give its
 * results (EVAL.REFERENCE), and the test kit compares them on random programs.
 */
import { agree as kernelAgree, context, prepare, reference as kernelReference, sameValue, type Agreement, type Context, type Failed, type Machine, type Plan, type Result as Outcome, type Tier } from "@mark1russell7/coeval";
import { fromDocument, isDocument, type Envelope } from "./document.ts";
import { vexError, type VexError } from "./errors.ts";
import { nestingError, type CompileOptions, type RunOptions } from "./evaluate.ts";
import { shapeError, type Expr } from "./ir.ts";
import { toKernelError, toVexResult, vexDefinitions, vexMachine, vexSelf } from "./kernel.ts";
import { sameVex } from "./same.ts";
import { monotoneError } from "./monotone.ts";
import { sizeError } from "./size.ts";
import { stepError } from "./steps.ts";
import { countWork, workError, type WorkResult } from "./work.ts";
import { writeDocument } from "./write.ts";

/** The options of a run of a plan of the kernel: the options of a run without a trace. */
export type KernelRunOptions = Omit<RunOptions, "trace">;

/** A result of the kernel with the work of its run (WORK.RESULT). The field `work` is there only with the option `maxWork`. */
export type KernelOutcome = Outcome & { readonly work?: number };

/** A program in the kernel: its document, and a run at an origin of a space. */
export interface KernelPlan {
  /** The document that the kernel evaluates, or `undefined` for a program that is not valid. */
  readonly doc: Envelope | undefined;
  /** This method evaluates the program at an origin. It does not throw. With the option `maxWork`, the result has its work. */
  run(opts: KernelRunOptions): WorkResult<unknown>;
  /** This method evaluates the program at an origin, and gives the result of the kernel with its own code. */
  evaluate(opts: KernelRunOptions): KernelOutcome;
  /**
   * This method evaluates the program at an origin with the reference interpreter of the kernel. The reference reads
   * the document by the rules of the kernel, and it compiles nothing. Thus it shares no compiler with `evaluate`.
   */
  reference(opts: KernelRunOptions): KernelOutcome;
  /**
   * This method compares the tiers of the kernel at an origin (`agree` of coeval). The tiers are `evaluate`, the
   * reference interpreter, the traced evaluation and a second evaluation. The tier `other` of the caller is the last
   * tier. The method gives the result, or the first tier that gives another result. Two errors agree when they have the
   * same code. With the option `maxWork`, the tiers are `evaluate`, the reference interpreter and the tier `other`, and
   * they also agree on the work (WORK.TIERS).
   */
  agree(opts: KernelRunOptions, other?: () => WorkResult<unknown>): Agreement;
}

/** This function gives the context of the kernel at an origin: the position of the origin, and the names of the caller. */
const contextOf = ({ space, origin, vars, tables }: KernelRunOptions): Context => context({ self: vexSelf(space, origin, tables), names: vars ?? {} });

/** This function gives the result of the kernel for a result of Vex. The work stays. */
const toOutcome = (r: WorkResult<unknown>): KernelOutcome => {
  const work = r.work === undefined ? {} : { work: r.work };
  return r.ok ? { ok: true, value: r.value, ...work } : { ok: false, error: toKernelError(r.error), ...work };
};

/** This function gives the difference of two results with a limit of work (WORK.TIERS), or `undefined` when they agree. */
function workDiffers(a: KernelOutcome, b: KernelOutcome): string | undefined {
  if (a.work !== b.work) return `The plan spends ${String(a.work)} points, and the tier spends ${String(b.work)}.`;
  if (a.ok && b.ok) return sameValue(a.value, b.value, sameVex) ? undefined : "The plan and the tier give different values.";
  if (!a.ok && !b.ok) return a.error.code === b.error.code ? undefined : `The plan gives ${a.error.code}, and the tier gives ${b.error.code}.`;
  return a.ok ? "The plan gives a value, and the tier gives an error." : "The plan gives an error, and the tier gives a value.";
}

/**
 * This function gives the plan of a program in the kernel (EVAL.REFERENCE). A document stays as it is, after the check
 * of `fromDocument`. An expression gets its document: a literal has its JSON form, or the value of the host when it has
 * no JSON form. A program that is not valid gives the error of `compile` at each run (EVAL.SHAPE, EVAL.NESTING).
 */
export function kernelPlan(source: Expr | Envelope, opts: CompileOptions = {}): KernelPlan {
  // Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain matches no value
  const domains = opts.domains ?? [];
  let doc: Envelope | undefined;
  let bad: VexError | undefined;
  if (isDocument(source)) {
    const read = fromDocument(source, domains);
    // EVAL.NESTING, LOOP.SIZE, STEP.MAX: the plan refuses the same programs as `compile`. The nesting comes first, because the
    // other checks recurse, and a document can be deeper than the limit of an expression.
    const size = read.ok ? (nestingError(read.value) ?? sizeError(read.value, opts) ?? stepError(read.value, opts) ?? monotoneError(read.value, opts)) : undefined;
    if (read.ok && size === undefined) doc = source;
    else bad = read.ok ? vexError("bad-expression", size ?? "") : read.error;
  } else {
    const shape = shapeError(source);
    const deep = shape ?? nestingError(source);
    const reason = deep ?? sizeError(source, opts) ?? stepError(source, opts) ?? monotoneError(source, opts);
    // Stryker disable next-line StringLiteral: the writer tests only the mode "json" and the order "reads"
    if (reason === undefined) doc = writeDocument(source, { domains, literals: "host", order: "document" });
    else bad = vexError("bad-expression", reason);
  }
  const machine = vexMachine(opts);
  // A program that is not valid has no document. Its plan does not run, because each run fails before the kernel.
  const plan = prepare(machine, doc);
  // An origin outside the space and a program that is not valid fail before the kernel (EVAL.ORIGIN, EVAL.SHAPE).
  const early = ({ space, origin }: KernelRunOptions): Failed | undefined => {
    if (!space.has(origin)) return { ok: false, error: toKernelError(vexError("unknown-key", `the space has no key "${origin}"`, { origin, focus: origin })) };
    return bad === undefined ? undefined : { ok: false, error: toKernelError(bad) };
  };
  // WORK.LIMIT: a run with a limit uses a machine with the limit, and its plan. The plan has no folds, because a fold
  // evaluates a part before the run, and the points of that part then go to no run. The last limit keeps its plan.
  let limited: { readonly maxWork: number; readonly machine: Machine; readonly plan: Plan } | undefined;
  const tierOf = (maxWork: number | undefined): { readonly machine: Machine; readonly plan: Plan } => {
    if (maxWork === undefined) return { machine, plan };
    if (limited === undefined || !Object.is(limited.maxWork, maxWork)) {
      const counting = vexMachine({ ...opts, maxWork });
      limited = { maxWork, machine: counting, plan: prepare(counting, doc, { fold: false }) };
    }
    return limited;
  };
  // WORK.RESULT: the run counts its points on a meter. A run over the limit gives #WORK! at the origin, and no rule of
  // the program hides it.
  const counted = (r: KernelRunOptions, run: (tier: { readonly machine: Machine; readonly plan: Plan }) => Outcome): KernelOutcome => {
    const tier = tierOf(r.maxWork);
    const outcome = countWork(r.maxWork, () => early(r) ?? run(tier));
    if (outcome.over) return { ok: false, error: toKernelError(workError(outcome.limit, r.origin)), work: outcome.work };
    return r.maxWork === undefined ? outcome.result : { ...outcome.result, work: outcome.work };
  };
  const evaluate = (r: KernelRunOptions): KernelOutcome => counted(r, (tier) => tier.plan.evaluate(contextOf(r)));
  const reference = (r: KernelRunOptions): KernelOutcome => counted(r, (tier) => kernelReference(tier.machine, doc, contextOf(r), { definitions: vexDefinitions(opts) }));
  const agree = (r: KernelRunOptions, other?: () => WorkResult<unknown>): Agreement => {
    if (r.maxWork !== undefined) return agreeWork(r, other);
    const tier = other === undefined ? {} : { other: (): Outcome => toOutcome(other()) };
    const first = early(r);
    if (first === undefined) return kernelAgree(machine, doc, contextOf(r), { definitions: vexDefinitions(opts), equal: sameVex, ...tier });
    // The kernel does not evaluate the program, so only the tier can give another result.
    const second = tier.other?.() ?? first;
    return !second.ok && second.error.code === first.error.code ? { ok: true, result: first, effects: [] } : { ok: false, tier: "other", plan: first, other: second, reason: "The plan does not evaluate the program, and the tier gives another result." };
  };
  // WORK.TIERS: with a limit, each tier counts on its own meter. Thus the tiers of coeval in one call of its agree do
  // not compare. The plan, the reference interpreter and the tier of the caller compare their results and their work.
  const agreeWork = (r: KernelRunOptions, other: (() => WorkResult<unknown>) | undefined): Agreement => {
    const result = evaluate(r);
    const tiers: readonly (readonly [Tier, () => KernelOutcome])[] = [["reference", () => reference(r)], ...(other === undefined ? [] : [["other", () => toOutcome(other())] as const])];
    for (const [tier, run] of tiers) {
      const second = run();
      const reason = workDiffers(result, second);
      if (reason !== undefined) return { ok: false, tier, plan: result, other: second, reason };
    }
    return { ok: true, result, effects: [] };
  };
  const run = (r: KernelRunOptions): WorkResult<unknown> => {
    const outcome = evaluate(r);
    const result = toVexResult(outcome);
    return outcome.work === undefined ? result : { ...result, work: outcome.work };
  };
  return { doc, evaluate, reference, agree, run };
}

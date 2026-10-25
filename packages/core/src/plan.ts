/**
 * The reference tier of Vex: a program as a plan of the kernel of coeval (decision D13 of coeval). The kernel evaluates
 * the document of the program with the machine of `kernel.ts`. The closure compiler and the loop compiler give its
 * results (EVAL.REFERENCE), and the test kit compares them on random programs.
 */
import { agree as kernelAgree, context, prepare, reference as kernelReference, type Agreement, type Context, type Failed, type Result as Outcome } from "@mark1russell7/coeval";
import { fromDocument, isDocument, type Envelope } from "./document.ts";
import { vexError, type VexError } from "./errors.ts";
import { MAX_NESTING, nestingOf, type CompileOptions, type RunOptions } from "./evaluate.ts";
import { shapeError, type Expr } from "./ir.ts";
import { toKernelError, toVexResult, vexDefinitions, vexMachine, vexSelf } from "./kernel.ts";
import type { Result } from "./result.ts";
import { sameVex } from "./same.ts";
import { writeDocument } from "./write.ts";

/** The options of a run of a plan of the kernel: the options of a run without a trace. */
export type KernelRunOptions = Omit<RunOptions, "trace">;

/** A program in the kernel: its document, and a run at an origin of a space. */
export interface KernelPlan {
  /** The document that the kernel evaluates, or `undefined` for a program that is not valid. */
  readonly doc: Envelope | undefined;
  /** This method evaluates the program at an origin. It does not throw. */
  run(opts: KernelRunOptions): Result<unknown>;
  /** This method evaluates the program at an origin, and gives the result of the kernel with its own code. */
  evaluate(opts: KernelRunOptions): Outcome;
  /**
   * This method evaluates the program at an origin with the reference interpreter of the kernel. The reference reads
   * the document by the rules of the kernel, and it compiles nothing. Thus it shares no compiler with `evaluate`.
   */
  reference(opts: KernelRunOptions): Outcome;
  /**
   * This method compares the tiers of the kernel at an origin (`agree` of coeval). The tiers are `evaluate`, the
   * reference interpreter, the traced evaluation and a second evaluation. The tier `other` of the caller is the last
   * tier. The method gives the result, or the first tier that gives another result. Two errors agree when they have the
   * same code.
   */
  agree(opts: KernelRunOptions, other?: () => Result<unknown>): Agreement;
}

/** This function gives the context of the kernel at an origin: the position of the origin, and the names of the caller. */
const contextOf = ({ space, origin, vars, tables }: KernelRunOptions): Context => context({ self: vexSelf(space, origin, tables), names: vars ?? {} });

/** This function gives the result of the kernel for a result of Vex. */
const toOutcome = (r: Result<unknown>): Outcome => (r.ok ? { ok: true, value: r.value } : { ok: false, error: toKernelError(r.error) });

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
    if (read.ok) doc = source;
    else bad = read.error;
  } else {
    const shape = shapeError(source);
    const nesting = shape === undefined ? nestingOf(source) : 0;
    const reason = shape ?? (nesting > MAX_NESTING ? `the expression is nested ${String(nesting)} levels deep, and the limit is ${String(MAX_NESTING)}` : undefined);
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
  const evaluate = (r: KernelRunOptions): Outcome => early(r) ?? plan.evaluate(contextOf(r));
  const reference = (r: KernelRunOptions): Outcome => early(r) ?? kernelReference(machine, doc, contextOf(r), { definitions: vexDefinitions(opts) });
  const agree = (r: KernelRunOptions, other?: () => Result<unknown>): Agreement => {
    const tier = other === undefined ? {} : { other: (): Outcome => toOutcome(other()) };
    const first = early(r);
    if (first === undefined) return kernelAgree(machine, doc, contextOf(r), { definitions: vexDefinitions(opts), equal: sameVex, ...tier });
    // The kernel does not evaluate the program, so only the tier can give another result.
    const second = tier.other?.() ?? first;
    return !second.ok && second.error.code === first.error.code ? { ok: true, result: first, effects: [] } : { ok: false, tier: "other", plan: first, other: second, reason: "The plan does not evaluate the program, and the tier gives another result." };
  };
  return { doc, evaluate, reference, agree, run: (r) => toVexResult(evaluate(r)) };
}

/**
 * The reference tier of Vex: a program as a plan of the kernel of coeval (decision D13 of coeval). The kernel evaluates
 * the document of the program with the machine of `kernel.ts`. The closure compiler and the loop compiler give its
 * results (EVAL.REFERENCE), and the test kit compares them on random programs.
 */
import { context, prepare, type Plan, type Result as Outcome } from "@mark1russell7/coeval";
import { fromDocument, isDocument, type Envelope } from "./document.ts";
import { vexError, type VexError } from "./errors.ts";
import { MAX_NESTING, nestingOf, type CompileOptions, type RunOptions } from "./evaluate.ts";
import { shapeError, type Expr } from "./ir.ts";
import { toKernelError, toVexResult, vexMachine, vexSelf } from "./kernel.ts";
import { fail, type Result } from "./result.ts";
import { writeDocument } from "./write.ts";

/** A program in the kernel: its document, and a run at an origin of a space. */
export interface KernelPlan {
  /** The document that the kernel evaluates, or `undefined` for a program that is not valid. */
  readonly doc: Envelope | undefined;
  /** This method evaluates the program at an origin. It does not throw. */
  run(opts: Omit<RunOptions, "trace">): Result<unknown>;
  /** This method evaluates the program at an origin, and gives the result of the kernel with its own code. */
  evaluate(opts: Omit<RunOptions, "trace">): Outcome;
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
  let bad: Result<never> | undefined;
  if (isDocument(source)) {
    const read = fromDocument(source, domains);
    if (read.ok) doc = source;
    else bad = read;
  } else {
    const shape = shapeError(source);
    const nesting = shape === undefined ? nestingOf(source) : 0;
    const reason = shape ?? (nesting > MAX_NESTING ? `the expression is nested ${String(nesting)} levels deep, and the limit is ${String(MAX_NESTING)}` : undefined);
    if (reason === undefined) doc = writeDocument(source, { domains, literals: "host", order: "document" });
    else bad = fail(vexError("bad-expression", reason));
  }
  const plan: Plan | undefined = doc === undefined ? undefined : prepare(vexMachine(opts), doc);
  const evaluate = ({ space, origin, vars, tables }: Omit<RunOptions, "trace">): Outcome => {
    if (!space.has(origin)) return { ok: false, error: toKernelError(vexError("unknown-key", `the space has no key "${origin}"`, { origin, focus: origin })) };
    if (plan === undefined) return { ok: false, error: toKernelError((bad as { readonly error: VexError }).error) };
    return plan.evaluate(context({ self: vexSelf(space, origin, tables), names: vars ?? {} }));
  };
  return { doc, evaluate, run: (r) => toVexResult(evaluate(r)) };
}

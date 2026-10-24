/**
 * The reference interpreter of Vex: the kernel of coeval (decision D13 of coeval). It evaluates the document of a program
 * with the machine of Vex (`kernelPlan`). The machine is the formula kit of the kernel, the contracts of the kinds of Vex
 * and its profile. It shares no code with the closure compiler of `@mark1russell7/vex`. Property tests compare the two
 * interpreters: the same value, or the same error code (EVAL.REFERENCE).
 */
import { kernelPlan, type AnyDomain, type Envelope, type ErrorCode, type Expr, type ExtHandler, type KernelPlan, type Space } from "@mark1russell7/vex";

/** The outcome of the reference interpreter: a value, or an error code. The code is the code of the kernel. */
export type RefOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: ErrorCode };

/** The options of the reference interpreter. */
export interface ReferenceOptions {
  readonly space: Space;
  readonly origin: string;
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, (...a: readonly unknown[]) => unknown>>;
  readonly tables?: Readonly<Record<string, Space>>;
  readonly vars?: Readonly<Record<string, unknown>>;
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
}

/** This function gives the outcome of a run of a plan of the kernel. */
export function referenceRun(plan: KernelPlan, opts: Pick<ReferenceOptions, "space" | "origin" | "tables" | "vars">): RefOutcome {
  const r = plan.evaluate(opts);
  return r.ok ? { ok: true, value: r.value } : { ok: false, code: r.error.code as ErrorCode };
}

/**
 * This function evaluates an expression or a document in the kernel. `fns` are the free functions of `withOptions`. An
 * expression gets its document, so the kernel evaluates the same document form as each other host of coeval.
 */
export function referenceEvaluate(e: Expr | Envelope, opts: ReferenceOptions): RefOutcome {
  const { domains, fns, extensions } = opts;
  const plan = kernelPlan(e, { ...(domains === undefined ? {} : { domains }), ...(fns === undefined ? {} : { fns }), ...(extensions === undefined ? {} : { extensions }) });
  return referenceRun(plan, opts);
}

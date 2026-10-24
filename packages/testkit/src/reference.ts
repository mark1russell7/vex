/**
 * The reference interpreter of Vex: the reference interpreter of the kernel of coeval (decision D13 of coeval). It reads
 * the document of a program by the rules of the kernel, and it compiles nothing. The machine of Vex (`vexMachine`) gives
 * the contracts and the evaluators of the kinds of Vex. The formula kit gets its definitions with the profile of Vex.
 * The reference shares no code with the closure compiler of `@mark1russell7/vex` or with `@mark1russell7/vex-compiler`.
 * Property tests compare the tiers with it: the same value, or the same error code (EVAL.REFERENCE).
 */
import { kernelPlan, type AnyDomain, type Envelope, type ErrorCode, type Expr, type ExtHandler, type Space } from "@mark1russell7/vex";

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

/**
 * This function evaluates an expression or a document with the reference interpreter of the kernel. `fns` are the free
 * functions of `withOptions`. An expression gets its document, so the kernel reads the same document form as each other
 * host of coeval.
 */
export function referenceEvaluate(e: Expr | Envelope, opts: ReferenceOptions): RefOutcome {
  const { domains, fns, extensions } = opts;
  const plan = kernelPlan(e, { ...(domains === undefined ? {} : { domains }), ...(fns === undefined ? {} : { fns }), ...(extensions === undefined ? {} : { extensions }) });
  const r = plan.reference(opts);
  return r.ok ? { ok: true, value: r.value } : { ok: false, code: r.error.code as ErrorCode };
}

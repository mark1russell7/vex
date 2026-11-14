/**
 * The tiers (docs/COMPILER.md §2.1). Tier 2 is generated JavaScript, and it gives its values and its error results. Tier
 * 1 is the closure compiler of the core, and it gives each result that tier 2 cannot give. Thus a tiered program gives
 * the results of the interpreter.
 */
import {
  compile,
  countWork,
  fail,
  fromDocument,
  isCounting,
  isDocument,
  monotoneError,
  ok,
  sizeError,
  stepError,
  workError,
  type CompileOptions,
  type Envelope,
  type Expr,
  type Program,
  type Result,
  type RunOptions,
  type Space,
  type VexError,
  type WorkResult,
} from "@mark1russell7/vex";
import { factsOf, type Schema } from "./facts.ts";

/**
 * The options of the compiler: the options of `compile`, and the schema of the host (docs/COMPILER.md §3.2). With
 * `work`, the code spends the points of the interpreter, so a run can have the option `maxWork` (WORK.TIERS).
 */
export type GenerateOptions = CompileOptions & { readonly schema?: Schema; readonly work?: boolean };
import { printJs } from "./js.ts";
import type { LoopProgram } from "./loop.ts";
import { lower, Unsupported } from "./lower.ts";
import { createRuntime, FALLBACK } from "./runtime.ts";

/**
 * The output of `generate`: the loop IR and the source of a program, and the options that the source is for. Or else
 * the reason that the compiler cannot lower the program.
 */
export type Generated =
  | { readonly ok: true; readonly program: LoopProgram; readonly source: string; readonly options: GenerateOptions }
  | { readonly ok: false; readonly reason: string };

/** A function of tier 2. It gives the value of the program, or `FALLBACK` for each other result. */
export type Tier2 = (space: Space, origin: string, vars: Readonly<Record<string, unknown>> | undefined, tables: Readonly<Record<string, Space>> | undefined) => unknown;

/** This function gives the reason that tier 1 refuses a program with a good shape, or `undefined`. */
const refusal = (e: Expr, options: GenerateOptions): string | undefined => sizeError(e, options) ?? stepError(e, options) ?? monotoneError(e, options);

/**
 * This function lowers an expression or a document and prints its source for the options (DOC.ENTRY). The op tables of
 * the domains give the fast path of each op site. It is pure, so a build can use it.
 */
export function generate(source: Expr | Envelope, options: GenerateOptions = {}): Generated {
  // DOC.ENTRY: a document gives its expression first, or the reason that it is not valid.
  const read = isDocument(source) ? fromDocument(source, options.domains) : ok(source);
  if (!read.ok) return { ok: false, reason: read.error.message };
  try {
    const facts = factsOf(options);
    const program = lower(read.value, facts, options.schema, options.work === true);
    // LOOP.SIZE, STEP.MAX: tier 2 refuses the programs that tier 1 refuses. The lowering checks the shape and the nesting first.
    const size = refusal(read.value, options);
    if (size !== undefined) return { ok: false, reason: size };
    return { ok: true, program, source: printJs(program, facts), options };
  } catch (thrown) {
    // A stack overflow in the lowering of a deep expression also goes to tier 1.
    return { ok: false, reason: thrown instanceof Unsupported ? thrown.message : "the lowering threw an exception" };
  }
}

/**
 * This function makes the function of tier 2 with `new Function`, with the options of the source. It throws on a page
 * that does not permit `new Function`.
 */
export function load(generated: Extract<Generated, { readonly ok: true }>): Tier2 {
  return link(generated).run;
}

/** A loaded program, with the function that gives the error of a run that gave `FALLBACK`. */
interface Linked {
  readonly run: Tier2;
  readonly take: () => VexError | undefined;
}

/** This function loads a program, with the function that gives the error of a run that gave `FALLBACK`. */
function link(generated: Extract<Generated, { readonly ok: true }>): Linked {
  const runtime = createRuntime(generated.options);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from printJs, and it reads each name and literal from K (§5).
  const make = new Function("K", "R", generated.source) as (k: readonly unknown[], r: ReturnType<typeof createRuntime>) => Tier2;
  return { run: make(generated.program.constants, runtime), take: () => runtime.take() };
}

/** The counts of the runs of a tiered program. */
export interface TierStats {
  /** The number of runs. */
  readonly runs: number;
  /** The number of runs where tier 2 gave no result, so tier 1 gave it. A run that tier 2 ends with an error is no fallback. */
  readonly fallbacks: number;
}

/** A program with tiers. It has the interface `Program` of the core, so it can replace a compiled program. */
export interface TieredProgram extends Program {
  /** The tier of the program: 2 when it has generated code, and else 1. */
  readonly tier: 1 | 2;
  /** The reason that the program has no generated code. */
  readonly reason?: string;
  readonly stats: TierStats;
}

/** This function gives the result of one run of tier 2, or `undefined` when tier 1 gives the result. */
function resultOf(code: Linked, r: RunOptions): Result<unknown> | undefined {
  const value = code.run(r.space, r.origin, r.vars, r.tables);
  if (value !== FALLBACK) return ok(value);
  const error = code.take();
  return error === undefined ? undefined : fail(error);
}

/**
 * This function compiles an expression or a document into tier 2 if it can, and else into tier 1 (DOC.ENTRY). Tier 2
 * gives a value or an error. When it gives no result, tier 1 does that evaluation again. A run with a trace and
 * `explain` always use tier 1, because tier 2 makes no trace.
 *
 * A run with the option `maxWork` uses a second program of tier 2, with the code that counts its work (WORK.TIERS). It
 * loads at the first such run. A run of tier 1 after it counts from 0 again, so the result has the count of tier 1.
 */
export function tiered(source: Expr | Envelope, options: GenerateOptions = {}): TieredProgram {
  const slow = compile(source, options);
  // The program of tier 1 has the expression of a document, so tier 2 does not read the document again.
  const { expr } = slow;
  const generated = generate(expr, options);
  let fast: Linked | undefined;
  let reason: string | undefined;
  if (generated.ok) {
    try {
      fast = link(generated);
    } catch {
      reason = "the page does not permit new Function";
    }
  } else {
    reason = generated.reason;
  }
  // The program that counts its work: `undefined` before the first run with a limit, and `null` when it does not load.
  let counting: Linked | null | undefined;
  const counter = (): Linked | undefined => {
    if (counting === undefined) {
      const work = generate(expr, { ...options, work: true });
      counting = work.ok ? link(work) : null;
    }
    return counting ?? undefined;
  };
  // WORK.TIERS: a run with a limit counts on a meter of its own. A run without a limit inside such a run, for example in a
  // function of the host, also gets a meter of its own. Thus it spends no points of the outer run.
  const counted = (code: Linked, r: RunOptions): WorkResult<unknown> | undefined => {
    const run = r.maxWork === undefined ? code : counter();
    if (run === undefined) return undefined;
    const outcome = countWork(r.maxWork, () => resultOf(run, r));
    if (outcome.over) return { ok: false, error: workError(outcome.limit, r.origin), work: outcome.work };
    const result = outcome.result;
    return result === undefined || r.maxWork === undefined ? result : { ...result, work: outcome.work };
  };
  const stats = { runs: 0, fallbacks: 0 };
  return {
    expr,
    tier: fast === undefined ? 1 : 2,
    ...(reason === undefined ? {} : { reason }),
    stats,
    run(r) {
      stats.runs++;
      if (fast === undefined || r.trace !== undefined) return slow.run(r);
      const result = r.maxWork === undefined && !isCounting() ? resultOf(fast, r) : counted(fast, r);
      if (result !== undefined) return result;
      stats.fallbacks++;
      return slow.run(r);
    },
    explain: (r) => slow.explain(r),
  };
}

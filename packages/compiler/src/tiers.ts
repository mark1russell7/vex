/**
 * The tiers (docs/COMPILER.md §2.1). Tier 2 is generated JavaScript. Tier 1 is the closure compiler of the core, and it
 * gives each result that tier 2 cannot give. Thus a tiered program gives the results of the interpreter.
 */
import { compile, fromDocument, isDocument, ok, type CompileOptions, type Envelope, type Expr, type Program, type Space } from "@mark1russell7/vex";
import { factsOf, type Schema } from "./facts.ts";

/** The options of the compiler: the options of `compile`, and the schema of the host (docs/COMPILER.md §3.2). */
export type GenerateOptions = CompileOptions & { readonly schema?: Schema };
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

/** A function of tier 2. It gives the value of the program, or `FALLBACK`. */
export type Tier2 = (space: Space, origin: string, vars: Readonly<Record<string, unknown>> | undefined, tables: Readonly<Record<string, Space>> | undefined) => unknown;

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
    const program = lower(read.value, facts, options.schema);
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
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from printJs, and it reads each name and literal from K (§5).
  const make = new Function("K", "R", generated.source) as (k: readonly unknown[], r: ReturnType<typeof createRuntime>) => Tier2;
  return make(generated.program.constants, createRuntime(generated.options));
}

/** The counts of the runs of a tiered program. */
export interface TierStats {
  /** The number of runs. */
  readonly runs: number;
  /** The number of runs where tier 2 gave `FALLBACK`, so tier 1 gave the result. */
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

/**
 * This function compiles an expression or a document into tier 2 if it can, and else into tier 1 (DOC.ENTRY). After a
 * failed check of tier 2, tier 1 does that evaluation again. A run with a trace and `explain` always use tier 1, because
 * tier 2 makes no trace.
 */
export function tiered(source: Expr | Envelope, options: GenerateOptions = {}): TieredProgram {
  const slow = compile(source, options);
  // The program of tier 1 has the expression of a document, so tier 2 does not read the document again.
  const { expr } = slow;
  const generated = generate(expr, options);
  let fast: Tier2 | undefined;
  let reason: string | undefined;
  if (generated.ok) {
    try {
      fast = load(generated);
    } catch {
      reason = "the page does not permit new Function";
    }
  } else {
    reason = generated.reason;
  }
  const stats = { runs: 0, fallbacks: 0 };
  return {
    expr,
    tier: fast === undefined ? 1 : 2,
    ...(reason === undefined ? {} : { reason }),
    stats,
    run(r) {
      stats.runs++;
      if (fast === undefined || r.trace !== undefined) return slow.run(r);
      const value = fast(r.space, r.origin, r.vars, r.tables);
      if (value !== FALLBACK) return ok(value);
      stats.fallbacks++;
      return slow.run(r);
    },
    explain: (r) => slow.explain(r),
  };
}

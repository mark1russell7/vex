/**
 * The differential of tier 1 and tier 2 on the real programs (COMPILE.ERRORS). The cases of the measurement run twice:
 * once with `compile` and once with `tiered`. Each field of each result is the same, also for each error. Two whole runs
 * keep the state of a sheet out of the comparison.
 */
import { compile, type CompileOptions, type Expr, type Program, type Result } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import { describe, expect, it } from "vitest";
import { corpusCases, readCorpora } from "./corpus.ts";
import { pilotCases, sheetCases } from "./fallback-cases.ts";
import type { Meter, ShareCase } from "./fallback-share.ts";
import { RECORD_SCALE, RECORD_SEED } from "./share-record.ts";

/** One run of a program: its name, its origin, its result, and `true` when tier 2 gave the result. */
interface RunRecord {
  readonly name: string;
  readonly origin: string;
  readonly result: Result<unknown>;
  readonly tier2: boolean;
}

/** A program of a tier, with a test that tells if the last run stayed in tier 2. */
interface Compiled {
  readonly program: Program;
  readonly fast: () => boolean;
}

/** This function runs each case with a compiler of programs, and gives the record of each run. */
function record(cases: readonly ShareCase[], make: (source: Expr, options: CompileOptions) => Compiled): RunRecord[] {
  const runs: RunRecord[] = [];
  const program = (name: string, source: Expr, options: CompileOptions = {}): Program => {
    const { program: p, fast } = make(source, options);
    return {
      ...p,
      run(r) {
        const result = p.run(r);
        runs.push({ name, origin: r.origin, result, tier2: fast() });
        return result;
      },
    };
  };
  const meter: Meter = { program, compiler: (nameOf) => (expr, options) => program(nameOf(expr), expr, options) };
  for (const c of cases) c.run(meter);
  return runs;
}

/** This function gives a program of tier 1. */
const slowly = (source: Expr, options: CompileOptions): Compiled => ({ program: compile(source, options), fast: () => false });

/** This function gives a tiered program. */
function quickly(source: Expr, options: CompileOptions): Compiled {
  const program = tiered(source, options);
  let fallbacks = 0;
  return {
    program,
    fast() {
      const before = fallbacks;
      fallbacks = program.stats.fallbacks;
      return program.tier === 2 && fallbacks === before;
    },
  };
}

/** This function compares two whole runs of the cases, and gives the errors that tier 2 gave, by code. */
function differential(cases: () => readonly ShareCase[]): Map<string, number> {
  const slow = record(cases(), slowly);
  const fast = record(cases(), quickly);
  expect(fast).toHaveLength(slow.length);
  const codes = new Map<string, number>();
  fast.forEach((run, i) => {
    const other = slow.at(i);
    expect(run.result, `${run.name} at ${run.origin}`).toEqual(other?.result);
    if (run.tier2 && !run.result.ok) codes.set(run.result.error.code, (codes.get(run.result.error.code) ?? 0) + 1);
  });
  return codes;
}

describe("COMPILE.ERRORS P17: the real programs in tier 1 and in tier 2", () => {
  it("P17 COMPILE.ERRORS: the pilots give the same results, and tier 2 gives the errors", () => {
    const codes = differential(() => pilotCases({ seed: RECORD_SEED, scale: RECORD_SCALE }));
    expect(codes.get("#ARGS") ?? 0).toBeGreaterThan(0);
    expect(codes.get("#N/A") ?? 0).toBeGreaterThan(0);
  });

  it("P17 COMPILE.ERRORS: the example sheets give the same results, and tier 2 gives #CYCLE!", () => {
    expect(differential(sheetCases).get("#CYCLE!") ?? 0).toBeGreaterThan(0);
  });

  it("P17 COMPILE.ERRORS: the corpora give the same results", () => {
    for (const corpus of readCorpora()) differential(() => corpusCases(corpus));
  });
});

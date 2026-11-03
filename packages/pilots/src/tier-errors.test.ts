/**
 * The differential of tier 1 and tier 2 on the real programs (COMPILE.ERRORS). Each run of each pilot and example sheet
 * runs in both tiers, and each field of the two results is the same, also for each error. The cases are the cases of the
 * measurement, so this test reads each run that the share counts.
 */
import { compile, type CompileOptions, type Expr, type Program, type Result } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import { describe, expect, it } from "vitest";
import { pilotCases, sheetCases } from "./fallback-cases.ts";
import type { Meter, ShareCase } from "./fallback-share.ts";

/** The counts of a differential: the runs, and the errors by code, with the errors that tier 2 gave. */
interface Differential {
  runs: number;
  readonly errors: Map<string, number>;
  readonly tier2: Map<string, number>;
}

/** This function adds one to a count. */
const add = (counts: Map<string, number>, code: string): void => {
  counts.set(code, (counts.get(code) ?? 0) + 1);
};

/** This function gives a meter whose programs run in tier 1 and in tier 2, and compare the two results. */
function differentialMeter(d: Differential): Meter {
  const program = (name: string, source: Expr, options: CompileOptions = {}): Program => {
    const fast = tiered(source, options);
    const slow = compile(source, options);
    return {
      expr: fast.expr,
      explain: (r) => fast.explain(r),
      run(r): Result<unknown> {
        const before = fast.stats.fallbacks;
        const got = fast.run(r);
        expect(got, `${name} at ${r.origin}`).toEqual(slow.run(r));
        d.runs++;
        if (!got.ok) {
          add(d.errors, got.error.code);
          if (fast.tier === 2 && fast.stats.fallbacks === before) add(d.tier2, got.error.code);
        }
        return got;
      },
    };
  };
  return { program, compiler: (nameOf) => (expr, options) => program(nameOf(expr), expr, options) };
}

/** This function runs each case in both tiers. */
function differential(cases: readonly ShareCase[]): Differential {
  const d: Differential = { runs: 0, errors: new Map(), tier2: new Map() };
  const meter = differentialMeter(d);
  for (const c of cases) c.run(meter);
  return d;
}

describe("COMPILE.ERRORS P17: the pilots and the example sheets in tier 1 and in tier 2", () => {
  it("P17 COMPILE.ERRORS: each result of tier 2 is the result of tier 1, and tier 2 gives #ARGS and the other errors", () => {
    const d = differential([...pilotCases({ seed: 1, scale: 0.2 }), ...sheetCases()]);
    expect(d.runs).toBeGreaterThan(1000);
    expect(d.tier2.get("#ARGS") ?? 0).toBeGreaterThan(0);
    expect(d.tier2.get("#N/A") ?? 0).toBeGreaterThan(0);
    expect(d.tier2.get("#NAME?") ?? 0).toBeGreaterThan(0);
    expect(d.tier2.get("#REF!") ?? 0).toBeGreaterThan(0);
    expect(d.tier2.get("#VALUE!") ?? 0).toBeGreaterThan(0);
    expect(d.tier2.get("#CYCLE!") ?? 0).toBeGreaterThan(0);
  });
});

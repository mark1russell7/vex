/**
 * The limit of the nesting in a standalone module (COMPILE.MODULE.NESTING). The interpreter refuses a program past the
 * limit before the evaluation, so a module of that program has no result to give.
 */
import { app, axes, each, evaluate, let_, MAX_NESTING, nestingError, nestingOf, ref, space, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: { fields: { n: "number" } } };
const RECORDS = [{ n: 1 }, { n: -2 }];
const n = ref("n");
const SPACE = space.array(RECORDS);

/** The sizes at the limit, and at one more level, with a leaf of a read and a leaf of a loop. */
const CASES: readonly (readonly [number, Expr])[] = [MAX_NESTING - 2, MAX_NESTING - 1, MAX_NESTING, MAX_NESTING + 1].flatMap((levels) => [[levels, n] as const, [levels, app("sum", each(axes.all, n))] as const]);

/** This function gives a program with `levels` levels above a read of a field. */
const chain = (levels: number, leaf: Expr = n): Expr => {
  let e = leaf;
  for (let i = 0; i < levels; i++) e = app("add", e, n);
  return e;
};

/** The most loops of a generated program. The interpreter reads each loop at each key of the loop above it. */
const MOST_LOOPS = 3;
/** The steps of a generated program. Each step puts a form around the program. */
const STEPS: readonly ((e: Expr, level: number) => Expr)[] = [
  (e) => app("add", e, n),
  (e) => app("add", n, e),
  (e, level) => let_({ [`x${String(level)}`]: n }, app("add", e, v(`x${String(level)}`))),
  (e, level) => let_({ [`x${String(level)}`]: e }, app("multiply", v(`x${String(level)}`), ref("n"))),
];

/** This function gives a program from its steps, with a nesting of at least `target`, and at most `MOST_LOOPS` loops from `loops`. */
function nearLimit(steps: readonly number[], loops: readonly number[], target: number): Expr {
  let e: Expr = n;
  steps.forEach((step, level) => {
    if (nestingOf(e) >= target) return;
    e = loops.includes(level) ? app("sum", each(axes.all, app("add", e, n))) : (STEPS[step] as (typeof STEPS)[number])(e, level);
  });
  return e;
}

/** The generated programs: each form of a step, on both sides of the limit of the nesting. */
const near = fc
  .tuple(
    fc.array(fc.nat(STEPS.length - 1), { minLength: MAX_NESTING + 8, maxLength: MAX_NESTING + 8 }),
    fc.array(fc.nat(MAX_NESTING), { maxLength: MOST_LOOPS }),
    fc.integer({ min: MAX_NESTING - 3, max: MAX_NESTING + 3 }),
  )
  .map(([steps, loops, target]) => nearLimit(steps, loops, target));

/** This function gives the results of the interpreter at each record. */
const interpreted = (e: Expr): readonly unknown[] => SPACE.keys.map((origin) => evaluate(e, { space: SPACE, origin, vars: {}, domains: DOMAINS })).map((r) => (r.ok ? r.value : r.error.message));

/** This function gives the results of the module of a program at each record, or the reason of its refusal. */
function printed(e: Expr): readonly unknown[] {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) return RECORDS.map(() => m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const run = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn run;`)() as (records: unknown, vars: unknown) => readonly unknown[];
  return run(structuredClone(RECORDS), {});
}

describe("COMPILE.MODULE.NESTING", () => {
  it("V-088 COMPILE.MODULE.NESTING: at the limit of EVAL.NESTING, a module gives the results of the interpreter", () => {
    const e = chain(MAX_NESTING - 1);
    expect(nestingOf(e)).toBe(MAX_NESTING);
    expect(printed(e)).toStrictEqual(interpreted(e));
  });

  it("V-088 COMPILE.MODULE.NESTING: past the limit of EVAL.NESTING, a module refuses with the reason of the interpreter", () => {
    const e = chain(MAX_NESTING);
    expect(interpreted(e)[0]).toBe(nestingError(e));
    expect(emitModule(e, OPTIONS)).toStrictEqual({ ok: false, reason: nestingError(e) });
  });

  it("V-088 COMPILE.MODULE.NESTING: a program past the stack of the engine gives the reason, not a RangeError", () => {
    const e = chain(16_000);
    expect(emitModule(e, OPTIONS)).toStrictEqual({ ok: false, reason: nestingError(e) });
  });

  it("V-088 COMPILE.MODULE.NESTING: a sheet refuses a formula past the limit, and names the formula", () => {
    const e = chain(MAX_NESTING);
    const m = emitSheetModule(new Map([["A", e]]), { ...OPTIONS, kinds: { A: "number" } });
    expect(m.ok ? "" : m.reason).toContain(nestingError(e));
  });

  it("V-088 COMPILE.MODULE.NESTING: a sheet refuses a formula past the stack of the engine, not with a RangeError", () => {
    const e = chain(16_000);
    const m = emitSheetModule(new Map([["A", e]]), { ...OPTIONS, kinds: { A: "number" } });
    expect(m.ok ? "" : m.reason).toContain(nestingError(e));
  });

  it("V-088 COMPILE.MODULE.NESTING P17: a generated program near the limit gives the result of the interpreter, or its reason", () => {
    fc.assert(
      fc.property(near, (e) => {
        expect(printed(e)).toStrictEqual(interpreted(e));
      }),
      { numRuns: 30 },
    );
    // A fixed sample holds programs on both sides of the limit, and at the limit.
    const depths = fc.sample(near, { seed: 20261104, numRuns: 40 }).map((e) => nestingOf(e));
    expect(depths.filter((d) => d > MAX_NESTING).length).toBeGreaterThan(4);
    expect(depths.filter((d) => d <= MAX_NESTING).length).toBeGreaterThan(4);
    expect(depths).toContain(MAX_NESTING);
  });

  it.each(CASES)("V-088 COMPILE.MODULE.NESTING P17: at %i levels over a leaf, the module, tier 2 and the interpreter give one result", (levels, leaf) => {
    const e = chain(levels, leaf);
    const fast = tiered(e, { domains: DOMAINS, schema: OPTIONS.schema });
    const results = SPACE.keys.map((origin) => fast.run({ space: SPACE, origin, vars: {} })).map((r) => (r.ok ? r.value : r.error.message));
    expect(printed(e)).toStrictEqual(interpreted(e));
    expect(results).toStrictEqual(interpreted(e));
  });
});

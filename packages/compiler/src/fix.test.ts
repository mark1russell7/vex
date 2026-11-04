/**
 * A fixed-point column in tier 2 (COMPILE.FIX). Tier 2 gives each result of tier 1, with the errors of the rows and the
 * failure at the round limit. `module-fix.test.ts` has the tests of the modules.
 */
import { app, axes, each, evaluate, fix, fn, call, index, last, let_, lit, kernelPlan, monotoneError, origin, programStep, ref, space, toVexResult, vexList, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { arbFixExpr, arbFixGraph, type FixGraph } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule } from "./module.ts";
import { generate, tiered } from "./tiers.ts";

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS = { domains: DOMAINS, schema: { fields: { id: "string", n: "number", b: "boolean" } } } as const;
const KEYS = ["0", "1", "2", "3"];
const S = space.graph(Object.fromEntries(KEYS.map((k) => [k, { id: k, n: Number(k) }])), { "0": ["1"], "1": ["0", "2"], "2": [], "3": ["3"] });
const REACH = fix("reach", "or", app("eq", ref("id"), ref("id", [origin])), app("any", each(axes.predecessors, last("reach"))));
const inLet = let_({ y: REACH }, app("or", lit(false), { tag: "var", name: "y" }));
const inFn = let_({ f: fn([], REACH) }, call("f"));
const inEach = each(axes.all, REACH);
const X = last("x");
const LIMIT = fix("x", "max", lit(0), app("add", X, lit(1)));
const BROKEN = app("divide", lit(1), ref("n"));
/** Two rows of this space have `n` 0, so a column that divides by `n` has two errors. */
const ZEROS = space.array([{ id: "a", n: 0 }, { id: "b", n: 1 }, { id: "c", n: 0 }]);
const INFINITE = space.array([{ id: "a", n: Number.POSITIVE_INFINITY }, { id: "b", n: 1 }]);
const TREE = space.tree({ 0: { id: "a", n: 3 }, 1: { id: "b", n: 1 }, 2: { id: "c", n: 2 } }, { 1: "0", 2: "1" });
/** A list with a key outside the spaces of the tests. */
const OUTSIDE = lit(vexList([{ key: "z", result: { ok: true, value: 1 } }]));

/** This function compares each key with the interpreter, and it gives the tier and the fallbacks of the program. */
function agrees(e: Expr, s: Space = S): readonly number[] {
  const p = tiered(e, OPTIONS);
  for (const at of s.keys) expect(p.run({ space: s, origin: at })).toEqual(evaluate(e, { ...OPTIONS, space: s, origin: at }));
  return [p.tier, p.stats.fallbacks];
}

describe("a fixed-point column in the tiers (COMPILE.FIX)", () => {
  it("COMPILE.FIX: tier 2 lowers a fix, with the result of tier 1 and no fallback", () => {
    expect(generate(REACH, OPTIONS).ok).toBe(true);
    for (const e of [REACH, inLet, inFn, inEach, app("not", REACH)]) expect(agrees(e)).toEqual([2, 0]);
  });

  it("COMPILE.FIX: a read outside a column gives the reason of the check, in each tier", () => {
    const stray = last("x");
    const reason = monotoneError(stray, { domains: DOMAINS });
    expect(reason).toContain("has no");
    expect(generate(stray, OPTIONS)).toEqual({ ok: false, reason });
    expect(emitModule(stray, OPTIONS)).toEqual({ ok: false, reason });
  });

  it("COMPILE.FIX FIX.LIMIT: tier 2 gives the failure at the round limit, and a form that holds it gives its other value", () => {
    expect(agrees(LIMIT)).toEqual([2, 0]);
    expect(agrees(app("ifError", LIMIT, lit(-1)))).toEqual([2, 0]);
    expect(agrees(app("sum", each(axes.all, LIMIT)))).toEqual([2, 0]);
    const r = tiered(LIMIT, OPTIONS).run({ space: S, origin: "0" });
    expect(r.ok ? "" : r.error.code).toBe("#NUM!");
    // A column that settles at the last round has its rows.
    expect(tiered(fix("x", "max", lit(0), app("min", lit(4), app("add", X, lit(1)))), OPTIONS).run({ space: S, origin: "0" })).toEqual({ ok: true, value: 4 });
  });

  it("COMPILE.FIX FIX.KIND: tier 2 gives the error of a row of the wrong kind and of a number that is not finite", () => {
    const wrong = [fix("x", "max", lit(true), X), fix("x", "min", lit(1), app("if", app("eq", ref("n"), lit(2)), lit(false), X)), fix("x", "or", lit(1), X), fix("x", "and", lit(true), app("if", app("eq", ref("n"), lit(2)), lit(1), X))];
    for (const e of wrong) expect(agrees(e)).toEqual([2, 0]);
    expect(agrees(fix("x", "max", ref("n"), X), INFINITE)).toEqual([2, 0]);
    const r = tiered(fix("x", "max", ref("n"), X), OPTIONS).run({ space: INFINITE, origin: "1" });
    expect(r).toEqual(evaluate(fix("x", "max", ref("n"), X), { ...OPTIONS, space: INFINITE, origin: "1" }));
    expect(r.ok ? "" : r.error.code).toBe("#NUM!");
  });

  it("COMPILE.FIX FIX.ERROR: one row with an error gives that error, and two give #ARGS with their causes", () => {
    for (const e of [fix("x", "max", BROKEN, X), fix("x", "max", lit(0), app("max", X, BROKEN))]) {
      expect(agrees(e)).toEqual([2, 0]);
      expect(agrees(e, ZEROS)).toEqual([2, 0]);
      const one = tiered(e, OPTIONS).run({ space: S, origin: "1" });
      expect(one.ok ? "" : one.error.message).toContain("divide");
      const two = tiered(e, OPTIONS).run({ space: ZEROS, origin: "1" });
      expect(two.ok ? [] : [two.error.code, two.error.causes?.length]).toEqual(["#ARGS", 2]);
    }
    expect(agrees(app("ifError", fix("x", "max", lit(0), app("max", X, BROKEN)), lit(7)), ZEROS)).toEqual([2, 0]);
  });

  it("COMPILE.FIX FIX.ROUNDS: a round that moves 0 to -0 changes no row, so the row keeps 0", () => {
    const e = fix("x", "min", lit(0), lit(-0));
    expect(agrees(e)).toEqual([2, 0]);
    expect(tiered(e, OPTIONS).run({ space: S, origin: "0" })).toEqual({ ok: true, value: 0 });
  });

  it("COMPILE.FIX: an inner column hides the column of its name, in each space", () => {
    const spread = fix("x", "max", ref("n"), app("max", X, app("max", each(axes.all, X))));
    expect(agrees(fix("x", "max", ref("n"), app("max", X, fix("x", "max", lit(2), app("min", lit(9), X)))))).toEqual([2, 0]);
    expect(agrees(fix("y", "max", ref("n"), app("max", last("y"), spread)))).toEqual([2, 0]);
    expect(agrees(spread, ZEROS)).toEqual([2, 0]);
    expect(agrees(fix("x", "max", ref("n"), app("max", X, app("ifError", app("max", each(axes.children, X)), lit(0)))), TREE)).toEqual([2, 0]);
    expect(agrees(fix("x", "or", app("eq", ref("n"), lit(1)), app("any", each(axes.successors, X))))).toEqual([2, 0]);
  });

  it("COMPILE.FIX FIX.LAST: a key of a list has no row, so the read of a column gives the error of tier 1", () => {
    const inList = fix("x", "or", lit(false), app("ifError", app("any", each(axes.list(OUTSIDE), X)), lit(true)));
    expect(agrees(inList)).toEqual([2, 0]);
    const column = fix("x", "max", ref("n"), X);
    const atKey = each(axes.list(OUTSIDE), column);
    const p = tiered(app("flat", app("fill", lit(1), atKey)), OPTIONS);
    expect(p.tier).toBe(2);
    expect(p.run({ space: S, origin: "0" })).toEqual(evaluate(app("flat", app("fill", lit(1), atKey)), { ...OPTIONS, space: S, origin: "0" }));
    expect(agrees(app("count", atKey))).toEqual([2, 0]);
    expect(agrees(app("ifError", app("sum", atKey), lit(-1)))[0]).toBe(2);
  });

  it("COMPILE.FIX: a column at the address of an axis reads the row of that key", () => {
    const column = fix("x", "max", ref("n"), X);
    // The list of the axis evaluates at the key of the address, in a loop with another focus.
    const moved = each(axes.all, app("sum", each(axes.list(app("fill", lit(1), column)), lit(1), [index(2)])));
    const outer = each(axes.all, column);
    expect(agrees(app("sum", moved))).toEqual([2, 0]);
    expect(agrees(app("sum", each(axes.all, app("count", each(axes.list(app("fill", column, lit(1))), lit(1), [index(2)])))))).toEqual([2, 0]);
    expect(agrees(app("sum", outer))).toEqual([2, 0]);
  });

  it("COMPILE.FIX: a column in the failure path of an argument gives the error of tier 1", () => {
    expect(agrees(app("add", app("divide", lit(1), lit(0)), LIMIT))).toEqual([2, 0]);
    expect(agrees(app("add", LIMIT, fix("x", "max", BROKEN, X)))).toEqual([2, 0]);
  });

  it("FIX.MONOTONE: tier 2, a module and a module of a sheet refuse a step without a proof, with the reason of tier 1", () => {
    const refused = fix("x", "or", lit(false), app("not", last("x")));
    const reason = 'the step of the "fix" "x" does not move one way: it moves against the last round';
    expect(generate(refused, OPTIONS)).toEqual({ ok: false, reason });
    expect(emitModule(refused, OPTIONS)).toEqual({ ok: false, reason });
    const r = tiered(refused, OPTIONS).run({ space: S, origin: "0" });
    expect(r.ok ? r.value : r.error.message).toBe(reason);
    const sheet = emitSheetModule(new Map([["A", refused]]), { ...OPTIONS, kinds: { A: "boolean" } });
    expect(sheet.ok ? "" : sheet.reason).toContain(reason);
  });

  it("STEP.LADDER: each tier gives the step of a program with a fix", () => {
    expect(programStep(REACH).step).toBe("B");
    expect(generate(REACH, { ...OPTIONS, maxStep: "A" })).toEqual({ ok: false, reason: expect.stringContaining("(STEP.MAX)") as string });
    expect(emitModule(REACH, { ...OPTIONS, maxStep: "A" })).toEqual({ ok: false, reason: expect.stringContaining("(STEP.MAX)") as string });
  });
});

/** This function gives the space of a graph and the space with the reverse order of the rows. */
function spaces(g: FixGraph): readonly [Space, Space] {
  const backward = Object.fromEntries(Object.entries(g.records).toReversed());
  return [space.graph(g.records, g.edges), space.graph(backward, g.edges)];
}

describe("P17: random columns", () => {
  it("FIX.MONOTONE COMPILE.FIX P17: tier 1, tier 2 and the reference tier give one result at each key of each generated column", () => {
    fc.assert(
      fc.property(arbFixExpr(), arbFixGraph, (e, g) => {
        expect(monotoneError(e, { domains: DOMAINS })).toBeUndefined();
        const [s] = spaces(g);
        const p = tiered(e, OPTIONS);
        const reference = kernelPlan(e, { domains: DOMAINS });
        for (const at of s.keys) {
          const r = evaluate(e, { ...OPTIONS, space: s, origin: at });
          expect(p.run({ space: s, origin: at })).toEqual(r);
          const other = toVexResult(reference.reference({ space: s, origin: at }));
          expect(other.ok ? other.value : other.error.code).toEqual(r.ok ? r.value : r.error.code);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("FIX.ORDER FIX.LIMIT P17: a generated column has the same result at each key for the reverse order of the rows", () => {
    fc.assert(
      fc.property(arbFixExpr(), arbFixGraph, (e, g) => {
        const [s, backward] = spaces(g);
        for (const at of s.keys) {
          const r = evaluate(e, { ...OPTIONS, space: s, origin: at });
          const other = evaluate(e, { ...OPTIONS, space: backward, origin: at });
          expect(other.ok ? other.value : other.error.code).toEqual(r.ok ? r.value : r.error.code);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("FIX.ROUNDS FIX.JOIN P17: a column is a fixed point: one more round of the step changes no row", () => {
    fc.assert(
      fc.property(arbFixExpr().filter((e) => e.tag === "fix"), arbFixGraph, (column, g) => {
        const [s] = spaces(g);
        const again = fix(column.name, column.join, column, column.step);
        for (const at of s.keys) {
          const r = evaluate(column, { ...OPTIONS, space: s, origin: at });
          expect(r.ok ? evaluate(again, { ...OPTIONS, space: s, origin: at }) : r).toEqual(r);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * A fixed-point column in tier 2 and in the modules (COMPILE.FIX, COMPILE.FALLBACK). Tier 2 and the modules do not have
 * the construct yet, so a program stays in tier 1, and a module refuses it with a reason.
 */
import { app, axes, each, evaluate, fix, fn, call, last, let_, lit, kernelPlan, monotoneError, origin, programStep, ref, space, toVexResult, type Expr, type Space } from "@mark1russell7/vex";
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

  it("COMPILE.FIX: a module refuses a fix with a reason, and a part that it drops does not need a module of the fix", () => {
    for (const e of [REACH, inLet, inFn, inEach, app("not", REACH)]) expect(emitModule(e, OPTIONS)).toEqual({ ok: false, reason: expect.stringContaining('a fixed point ("fix")') as string });
    const sheet = emitSheetModule(new Map([["A", REACH]]), { ...OPTIONS, kinds: { A: "boolean" } });
    expect(sheet.ok ? "" : sheet.reason).toContain('a fixed point ("fix")');
    const unused = let_({ y: REACH }, lit(1));
    const module = emitModule(unused, OPTIONS);
    expect(evaluate(unused, { ...OPTIONS, space: S, origin: "0" })).toEqual({ ok: true, value: 1 });
    expect(module.ok ? "" : module.reason).toContain('a fixed point ("fix")');
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

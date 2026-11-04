/**
 * `sign` and `minAxis` in each tier (NUM.SIGN, VEC2.SIGN, VEC2.MINAXIS, XY.SIGN). Tier 2 and a standalone module give
 * the result of the interpreter, on values and on errors (P17). `Vec2Domain` is a class, so its vectors stay out of a
 * module, and the plain data of `XYDomain` is the form for a module.
 */
import { app, evaluate, lit, ref, space, type AnyDomain, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

const INF = Number.POSITIVE_INFINITY;
const NAN = Number.NaN;
/** The edges of the ops: zeros, ties, signs, infinite values and `NaN`. */
const EDGES = [0, -0, 1, -1, 2.5, -2.5, Number.MIN_VALUE, INF, -INF, NAN] as const;
const edge = fc.constantFrom(...EDGES);
const PAIRS: readonly (readonly [number, number])[] = EDGES.flatMap((x) => EDGES.map((y) => [x, y] as const));

const SCHEMA = { fields: { x: "number", y: "number", p: "domain:XY" } } as const;
const MODULE: ModuleOptions = { domains: [NumDomain, XYDomain, BoolDomain], schema: SCHEMA };
const TIERED = { domains: [Vec2Domain, NumDomain, BoolDomain] as readonly AnyDomain[] };
const PLAIN = { domains: [NumDomain, XYDomain, BoolDomain] as readonly AnyDomain[] };

/** The vector of a record. A field holds an infinite component, because the ops `vec2` and `xy` refuse one. */
const P = ref("p");

/** The push of a force separation: along the smallest axis of `half - abs(gap)`, with the sign of the gap. */
function pushOf(gap: Expr, half: Expr): Expr {
  const overlap = app("subtract", half, app("abs", gap));
  return app("multiply", app("multiply", app("minAxis", overlap), app("sign", gap)), overlap);
}

/** The programs on numbers, and the same programs on each vector form. */
const NUMBERS: readonly Expr[] = [app("sign", ref("x")), app("add", app("sign", ref("x")), app("sign", ref("y"))), app("ifError", app("sign", ref("x")), lit(7))];
const onVector = (v: Expr, half: Expr): readonly Expr[] => [app("sign", v), app("minAxis", v), app("minAxis", app("sign", v)), app("x", app("minAxis", v)), app("ifError", app("y", app("minAxis", v)), lit(7)), pushOf(v, half)];

/** This function makes the records of the pairs, with the plain data or the `Vec2` of each pair. */
const plainOf = (pairs: readonly (readonly [number, number])[]): readonly unknown[] => pairs.map(([x, y]) => ({ x, y, p: { x, y } }));
const classOf = (pairs: readonly (readonly [number, number])[]): readonly unknown[] => pairs.map(([x, y]) => ({ x, y, p: new Vec2(x, y) }));

/** This function gives the result of a program of the interpreter and of tier 2 at each key. */
function runs(e: Expr, s: Space, domains: readonly AnyDomain[]): { readonly fast: readonly unknown[]; readonly slow: readonly unknown[]; readonly tier: number; readonly fallbacks: number } {
  const p = tiered(e, { domains });
  const fast = s.keys.map((origin) => fromCore(p.run({ space: s, origin })));
  const slow = s.keys.map((origin) => fromCore(evaluate(e, { domains, space: s, origin })));
  return { fast, slow, tier: p.tier, fallbacks: p.stats.fallbacks };
}

/** This function gives the values of a module at each record, with `VEX_ERROR` for an error. */
function moduleValues(e: Expr, records: readonly unknown[]): { readonly got: readonly unknown[]; readonly expected: readonly unknown[] } {
  const m = emitModule(e, MODULE);
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const made = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as { readonly run: (r: unknown, v: unknown) => readonly unknown[]; readonly VEX_ERROR: unknown };
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { domains: PLAIN.domains, space: s, origin });
    return r.ok ? r.value : made.VEX_ERROR;
  });
  return { got: made.run(records, {}), expected };
}

describe("tier 2", () => {
  const edges = space.array(classOf(PAIRS));
  const plain = space.array(plainOf(PAIRS));

  it("P17 NUM.SIGN: tier 2 gives the values and the errors of the interpreter", () => {
    for (const e of NUMBERS) {
      const r = runs(e, edges, TIERED.domains);
      expect(r.tier).toBe(2);
      expect(r.fast).toStrictEqual(r.slow);
    }
  });

  it("P17 VEC2.SIGN VEC2.MINAXIS: tier 2 gives the values and the errors of the interpreter", () => {
    for (const e of onVector(P, app("vec2", lit(2), lit(3)))) {
      const r = runs(e, edges, TIERED.domains);
      expect(r.tier).toBe(2);
      expect(r.fast).toStrictEqual(r.slow);
    }
  });

  it("P17 XY.SIGN: tier 2 gives the values and the errors of the interpreter", () => {
    for (const e of onVector(P, app("xy", lit(2), lit(3)))) {
      const r = runs(e, plain, PLAIN.domains);
      expect(r.tier).toBe(2);
      expect(r.fast).toStrictEqual(r.slow);
    }
  });

  it("P17 VEC2.SIGN VEC2.MINAXIS: tier 2 runs a value and an error without a fallback", () => {
    const one = space.array(classOf([[1, 2], [NAN, 2]]));
    const axis = runs(app("minAxis", P), one, TIERED.domains);
    const signs = runs(app("sign", P), one, TIERED.domains);
    expect((axis.slow[0] as { readonly value: Vec2 }).value).toEqual(new Vec2(1, 0));
    expect((signs.slow[0] as { readonly value: Vec2 }).value).toEqual(new Vec2(1, 1));
    expect([axis.fast, signs.fast]).toStrictEqual([axis.slow, signs.slow]);
    expect([axis.fallbacks, signs.fallbacks]).toEqual([0, 0]);
  });
});

describe("a standalone module", () => {
  it("P17 NUM.SIGN: a module gives the values and the errors of the interpreter", () => {
    for (const e of NUMBERS) {
      const { got, expected } = moduleValues(e, plainOf(PAIRS));
      expect(got).toStrictEqual(expected);
    }
  });

  it("P17 XY.SIGN: a module gives the values and the errors of the interpreter", () => {
    for (const e of onVector(P, app("xy", lit(2), lit(3)))) {
      const { got, expected } = moduleValues(e, plainOf(PAIRS));
      expect(got).toStrictEqual(expected);
    }
  });

  it("P17 XY.SIGN: the ops give the interpreter's result on random records", () => {
    const part = fc.oneof(edge, fc.double());
    const records = fc.array(fc.tuple(part, part), { minLength: 1, maxLength: 8 }).map(plainOf);
    fc.assert(
      fc.property(records, fc.constantFrom(...onVector(P, app("xy", lit(2), lit(3)))), (rs, e) => {
        const { got, expected } = moduleValues(e, rs);
        expect(got).toStrictEqual(expected);
      }),
      { numRuns: 30 },
    );
  });

  it("VEC2.SIGN VEC2.MINAXIS: the class Vec2 stays out of a module, with a reason", () => {
    const options: ModuleOptions = { domains: [NumDomain, Vec2Domain, BoolDomain], schema: { fields: { p: "domain:Vec2" } } };
    const m = (e: Expr): string => {
      const r = emitModule(e, options);
      return r.ok ? "" : r.reason;
    };
    expect(m(app("sign", P))).toBe('the kinds of the values of "sign" do not decide its op');
    expect(m(app("minAxis", P))).toBe('the kinds of the values of "minAxis" do not decide its op');
    // An op of the class with a function stops too, because a module cannot check a copy without the samples of the domain.
    expect(m(app("x", P))).toBe("the domain Vec2 gives no samples, so a module cannot check a copy of its op");
  });
});

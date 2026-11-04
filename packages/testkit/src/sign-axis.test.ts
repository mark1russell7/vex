/**
 * The laws of `sign` and `minAxis` over random values, and the push of a force separation with them. `Vec2Domain` and
 * `XYDomain` have one program for the push, so a program can move from the class to plain data.
 */
import { app, evaluate, lit, ref, space, type AnyDomain, type Expr, type Result } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain, XYDomain, type XY } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

const ONE = space.record({ A: {} });
const INF = Number.POSITIVE_INFINITY;
const SAMPLE = { seed: 20261103, numRuns: 200 } as const;
const small = fc.integer({ min: -9, max: 9 });
const vec = fc.tuple(small, small).map(([x, y]) => new Vec2(x, y));
const edge = fc.constantFrom(0, -0, 1, -1, 2.5, Number.MIN_VALUE, INF, -INF, Number.NaN);

const run = (domains: readonly AnyDomain[], self: unknown, op: string): Result<unknown> => evaluate(app(op, lit(self)), { space: ONE, origin: "A", domains });

/** This function gives the components of a vector of either domain, or the code of an error. */
const parts = (r: Result<unknown>): unknown => (r.ok ? [(r.value as XY).x, (r.value as XY).y] : r.error.code);

/**
 * The push of a force separation in plain code. The push goes along the axis of the smallest overlap, by that overlap,
 * with the sign of the gap. The gap is the second center minus the first center.
 */
function pushOf(gap: Vec2, half: Vec2): Vec2 {
  const o = new Vec2(half.x - Math.abs(gap.x), half.y - Math.abs(gap.y));
  return o.x <= o.y ? new Vec2(Math.sign(gap.x) * o.x, 0) : new Vec2(0, Math.sign(gap.y) * o.y);
}

/** The same push as a program: `half` is the sum of the half sizes, and `overlap` is `half - abs(gap)`. */
const overlap: Expr = app("subtract", ref("half"), app("abs", ref("gap")));
const PUSH: Expr = app("multiply", app("multiply", app("minAxis", overlap), app("sign", ref("gap"))), overlap);

describe("the laws of sign", () => {
  it("NUM.SIGN: sign gives the value of Math.sign for each number except NaN", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (n) => {
        expect(run([NumDomain], n, "sign")).toEqual({ ok: true, value: Math.sign(n) });
      }),
    );
  });

  it("VEC2.SIGN: sign times abs gives the vector", () => {
    fc.assert(
      fc.property(vec, (p) => {
        expect(p.sign().multiply(p.abs()).add(new Vec2(0, 0))).toEqual(p.add(new Vec2(0, 0)));
      }),
    );
  });
});

describe("the laws of minAxis", () => {
  it("VEC2.MINAXIS: along of the axis gives minComponent, and across gives maxComponent", () => {
    fc.assert(
      fc.property(vec, (p) => {
        const axis = p.minAxis();
        expect(p.along(axis)).toBe(p.minComponent());
        expect(p.across(axis)).toBe(p.maxComponent());
      }),
    );
  });

  it("VEC2.MINAXIS: without a tie, swap of the vector swaps the axis", () => {
    for (const p of fc.sample(vec.filter((u) => u.x !== u.y), SAMPLE)) expect(p.swap().minAxis()).toEqual(p.minAxis().swap());
  });

  it("XY.SIGN: sign and minAxis of XYDomain give the components of Vec2Domain at each edge", () => {
    fc.assert(
      fc.property(edge, edge, fc.constantFrom("sign", "minAxis"), (x, y, op) => {
        expect(parts(run([XYDomain], { x, y }, op))).toEqual(parts(run([Vec2Domain], new Vec2(x, y), op)));
      }),
    );
  });
});

describe("the push of a force separation", () => {
  const box = fc.tuple(vec, vec.map((p) => p.abs())).map(([gap, half]) => ({ gap, half }));

  it("VEC2.MINAXIS: the program gives the push of the plain code", () => {
    fc.assert(
      fc.property(box, ({ gap, half }) => {
        const r = evaluate(PUSH, { space: space.record({ A: { gap, half } }), origin: "A", domains: [Vec2Domain, NumDomain] });
        const push = pushOf(gap, half);
        expect(r.ok && (r.value as Vec2).add(new Vec2(0, 0))).toEqual(push.add(new Vec2(0, 0)));
      }),
    );
  });

  it("VEC2.MINAXIS: a gap of 0 on the axis gives no push, because the sign of 0 is 0", () => {
    const at = { gap: new Vec2(0, 1), half: new Vec2(2, 5) };
    expect(evaluate(PUSH, { space: space.record({ A: at }), origin: "A", domains: [Vec2Domain, NumDomain] })).toEqual({ ok: true, value: new Vec2(0, 0) });
  });
});

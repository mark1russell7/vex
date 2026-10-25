/**
 * The frame ops of `Vec2Domain`: `along`, `across`, `compose` and `select`, through the interpreter. A layout rule
 * along a main axis and a cross axis uses these ops, so one program serves the two dimensions.
 */
import { app, evaluate, lit, ref, space, type Expr, type Result } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

const DOMAINS = [Vec2Domain, NumDomain] as const;
const ONE = space.record({ A: {} });
const run = (e: Expr): Result<unknown> => evaluate(e, { space: ONE, origin: "A", domains: DOMAINS });
/** The value of `e`, or its error code. The value has no -0, because `toEqual` takes -0 and 0 as different. */
const value = (e: Expr): unknown => {
  const r = run(e);
  if (!r.ok) return r.error.code;
  return r.value instanceof Vec2 ? new Vec2(r.value.x + 0, r.value.y + 0) : typeof r.value === "number" ? r.value + 0 : r.value;
};

const small = fc.integer({ min: -9, max: 9 });
const vec = fc.tuple(small, small).map(([x, y]) => new Vec2(x, y));
/** The four unit axes. */
const UNIT = [new Vec2(1, 0), new Vec2(0, 1), new Vec2(-1, 0), new Vec2(0, -1)] as const;
const unit = fc.constantFrom(...UNIT);
const SAMPLE = { seed: 20261024, numRuns: 200 } as const;

describe("the frame ops of Vec2", () => {
  it("VEC2.ALONG: along gives dot(v, dir), and across gives dot(v, swap(dir))", () => {
    for (const [p, d] of fc.sample(fc.tuple(vec, vec), SAMPLE)) {
      expect(value(app("along", lit(p), lit(d)))).toBe(value(app("dot", lit(p), lit(d))));
      expect(value(app("across", lit(p), lit(d)))).toBe(value(app("dot", lit(p), app("swap", lit(d)))));
    }
  });

  it("VEC2.ALONG: on the axis (1, 0), along gives x and across gives y. On the axis (0, 1), they give y and x", () => {
    fc.assert(
      fc.property(vec, (p) => {
        expect(value(app("along", lit(p), lit(new Vec2(1, 0))))).toBe(p.x);
        expect(value(app("across", lit(p), lit(new Vec2(1, 0))))).toBe(p.y);
        expect(value(app("along", lit(p), lit(new Vec2(0, 1))))).toBe(p.y);
        expect(value(app("across", lit(p), lit(new Vec2(0, 1))))).toBe(p.x);
      }),
    );
  });

  it("VEC2.COMPOSE: compose(dir, main, cross) gives dir * main + swap(dir) * cross", () => {
    for (const [d, m, c] of fc.sample(fc.tuple(vec, small, small), SAMPLE)) {
      const sum = app("add", app("multiply", lit(d), lit(m)), app("multiply", app("swap", lit(d)), lit(c)));
      expect(value(app("compose", lit(d), lit(m), lit(c)))).toEqual(value(sum));
    }
  });

  it("VEC2.COMPOSE: on a unit axis, along and across of compose give main and cross, and compose of along and across gives the vector", () => {
    fc.assert(
      fc.property(unit, small, small, vec, (d, m, c, p) => {
        const composed = app("compose", lit(d), lit(m), lit(c));
        expect(value(app("along", composed, lit(d)))).toBe(m);
        expect(value(app("across", composed, lit(d)))).toBe(c);
        expect(value(app("compose", lit(d), app("along", lit(p), lit(d)), app("across", lit(p), lit(d))))).toEqual(p);
      }),
    );
  });

  it("VEC2.COMPOSE: one program gives the content size of a stack in each direction", () => {
    // The width of a column is the largest width, and its height is the sum of the heights. A row is the reverse.
    const sizes = [new Vec2(60, 18), new Vec2(145, 90)];
    const sum = sizes.reduce((a, b) => a.add(b));
    const max = sizes.reduce((a, b) => a.max(b));
    const content = app("compose", ref("dir"), app("along", lit(sum), ref("dir")), app("across", lit(max), ref("dir")));
    const stacks = space.record({ column: { dir: new Vec2(0, 1) }, row: { dir: new Vec2(1, 0) } });
    const at = (k: string): unknown => evaluate(content, { space: stacks, origin: k, domains: DOMAINS });
    expect(at("column")).toEqual({ ok: true, value: new Vec2(145, 108) });
    expect(at("row")).toEqual({ ok: true, value: new Vec2(205, 90) });
  });

  it("VEC2.SELECT: select takes a component of a where the mask component is not 0, else the component of b", () => {
    const mask = fc.tuple(fc.integer({ min: -2, max: 2 }), fc.integer({ min: -2, max: 2 })).map(([x, y]) => new Vec2(x, y));
    fc.assert(
      fc.property(mask, vec, vec, (m, a, b) => {
        expect(value(app("select", lit(m), lit(a), lit(b)))).toEqual(new Vec2(m.x !== 0 ? a.x : b.x, m.y !== 0 ? a.y : b.y));
      }),
    );
  });

  it("VEC2.SELECT: a number argument lifts to a vector with that number twice", () => {
    for (const [m, n, b] of fc.sample(fc.tuple(vec, small, vec), SAMPLE)) {
      expect(value(app("select", lit(m), lit(n), lit(b)))).toEqual(value(app("select", lit(m), lit(new Vec2(n, n)), lit(b))));
      expect(value(app("select", lit(m), lit(b), lit(n)))).toEqual(value(app("select", lit(m), lit(b), lit(new Vec2(n, n)))));
    }
  });

  it("VEC2.FINITE: an infinite component gives #NUM!, as before the frame ops", () => {
    expect(value(app("vec2", lit(1), lit(Number.POSITIVE_INFINITY)))).toBe("#NUM!");
    expect(value(app("divide", lit(new Vec2(1, 1)), lit(0)))).toBe("#NUM!");
    expect(value(app("max", lit(new Vec2(1, 1)), lit(Number.POSITIVE_INFINITY)))).toBe("#NUM!");
  });

  it("VEC2.FINITE: select gives an open bound with no infinite value", () => {
    fc.assert(
      fc.property(vec, small, vec, (p, floor, hi) => {
        // A floor on y only: the x component has no bound.
        const yFloor = app("select", lit(new Vec2(0, 1)), app("max", lit(p), lit(floor)), lit(p));
        expect(value(yFloor)).toEqual(new Vec2(p.x, Math.max(p.y, floor)));
        // A 0 in the upper bound means no bound on that component.
        const capped = app("select", lit(hi), app("min", lit(p), lit(hi)), lit(p));
        expect(value(capped)).toEqual(new Vec2(hi.x === 0 ? p.x : Math.min(p.x, hi.x), hi.y === 0 ? p.y : Math.min(p.y, hi.y)));
        // A lower bound with no upper bound: max, with no infinite upper bound.
        expect(value(app("max", lit(p), lit(floor)))).toEqual(new Vec2(Math.max(p.x, floor), Math.max(p.y, floor)));
      }),
    );
  });
});

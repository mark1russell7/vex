/**
 * The sign and the smallest axis (NUM.SIGN, VEC2.SIGN, VEC2.MINAXIS, XY.SIGN): each edge through the interpreter. The
 * rows of a vector hold for `Vec2Domain` and for `XYDomain`, so the two domains give the same components.
 */
import { app, evaluate, lit, space, type AnyDomain, type Result } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { NumDomain } from "./scalars.ts";
import { Vec2, Vec2Domain } from "./vec2.ts";
import { XYDomain, type XY } from "./xy.ts";

const ONE = space.record({ A: {} });
const INF = Number.POSITIVE_INFINITY;
const NAN = Number.NaN;
const TINY = Number.MIN_VALUE;

const run = (domains: readonly AnyDomain[], self: unknown, op: string): Result<unknown> => evaluate(app(op, lit(self)), { space: ONE, origin: "A", domains });

/** This function gives the value of a result, or the code of its error. */
const value = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** This function gives the components of a vector of either domain, or the code of an error. */
const parts = (r: Result<unknown>): unknown => {
  const u = value(r);
  return typeof u === "string" ? u : [(u as XY).x, (u as XY).y];
};

type VectorRow = readonly [x: number, y: number, expected: readonly [number, number] | "#NUM!"];

const SIGNS: readonly VectorRow[] = [
  [3, -4, [1, -1]],
  [-0.5, 7, [-1, 1]],
  [TINY, -TINY, [1, -1]],
  [0, 5, [0, 1]],
  [5, 0, [1, 0]],
  [0, -0, [0, -0]],
  [-0, 0, [-0, 0]],
  [INF, -INF, [1, -1]],
  [-INF, 2, [-1, 1]],
  [NAN, 1, "#NUM!"],
  [1, NAN, "#NUM!"],
  [NAN, NAN, "#NUM!"],
];

const MIN_AXES: readonly VectorRow[] = [
  [1, 2, [1, 0]],
  [2, 1, [0, 1]],
  [3, 3, [1, 0]],
  [0, 0, [1, 0]],
  [0, -0, [1, 0]],
  [-0, 0, [1, 0]],
  [-5, 1, [1, 0]],
  [1, -5, [0, 1]],
  [-5, -1, [1, 0]],
  [-1, -5, [0, 1]],
  [-2, -2, [1, 0]],
  [0, TINY, [1, 0]],
  [TINY, 0, [0, 1]],
  [INF, 1, [0, 1]],
  [1, INF, [1, 0]],
  [-INF, 1, [1, 0]],
  [1, -INF, [0, 1]],
  [INF, INF, [1, 0]],
  [-INF, -INF, [1, 0]],
  [INF, -INF, [0, 1]],
  [NAN, 1, "#NUM!"],
  [1, NAN, "#NUM!"],
  [NAN, NAN, "#NUM!"],
  [NAN, INF, "#NUM!"],
];

/** This function gives the two rows of a vector: one with a `Vec2`, one with plain data. */
const both = (rows: readonly VectorRow[]): readonly (readonly [string, readonly AnyDomain[], unknown, VectorRow[2]])[] =>
  rows.flatMap(([x, y, expected]) => [["Vec2", [Vec2Domain], new Vec2(x, y), expected] as const, ["XY", [XYDomain], { x, y }, expected] as const]);

describe("the sign of a number", () => {
  it.each([[5, 1], [-2.5, -1], [TINY, 1], [-TINY, -1], [0, 0], [-0, -0], [INF, 1], [-INF, -1], [NAN, "#NUM!"]] as const)("the sign of %d is %s", (n, expected) => {
    expect(value(run([NumDomain], n, "sign"))).toBe(expected);
  });

  it("NUM.SIGN: the op takes one number and gives a number", () => {
    expect(value(run([NumDomain], 7, "sign"))).toBe(1);
    expect(NumDomain.ops.sign.returns).toBe("number");
  });
});

describe("the sign of a vector", () => {
  it.each(both(SIGNS))("%s sign of the row %#", (_name, domains, self, expected) => {
    expect(parts(run(domains, self, "sign"))).toEqual(expected);
  });

  it("VEC2.SIGN: sign takes the sign of each component, and the receiver stays the same", () => {
    const p = new Vec2(3, -4);
    expect(p.sign()).toEqual(new Vec2(1, -1));
    expect(p).toEqual(new Vec2(3, -4));
    expect(Vec2Domain.ops.sign.params).toEqual([]);
    expect(Vec2Domain.ops.sign.returns).toBe("domain");
  });

  it("VEC2.SIGN: a component NaN gives #NUM!, and an infinite component has a sign", () => {
    expect(value(run([Vec2Domain], new Vec2(NAN, 1), "sign"))).toBe("#NUM!");
    expect(value(run([Vec2Domain], new Vec2(INF, 1), "sign"))).toEqual(new Vec2(1, 1));
  });
});

describe("the smallest axis", () => {
  it.each(both(MIN_AXES))("%s minAxis of the row %#", (_name, domains, self, expected) => {
    expect(parts(run(domains, self, "minAxis"))).toEqual(expected);
  });

  it("VEC2.MINAXIS: the comparison uses the signed values, and abs compares sizes", () => {
    const p = new Vec2(-5, 1);
    expect(p.minAxis()).toEqual(new Vec2(1, 0));
    expect(p.abs().minAxis()).toEqual(new Vec2(0, 1));
    expect(Vec2Domain.ops.minAxis.params).toEqual([]);
    expect(Vec2Domain.ops.minAxis.returns).toBe("domain");
  });

  it("VEC2.MINAXIS: a tie gives (1, 0), so swap of a tie gives the same axis", () => {
    expect(new Vec2(4, 4).minAxis()).toEqual(new Vec2(1, 0));
    expect(new Vec2(4, 4).swap().minAxis()).toEqual(new Vec2(1, 0));
  });

  it("VEC2.MINAXIS: a component NaN gives #NUM!", () => {
    expect(value(run([Vec2Domain], new Vec2(NAN, 1), "minAxis"))).toBe("#NUM!");
    expect(value(run([Vec2Domain], new Vec2(1, NAN), "minAxis"))).toBe("#NUM!");
  });
});

describe("the plain data form", () => {
  it("XY.SIGN: sign and minAxis of XYDomain are functions that give a value of the domain", () => {
    expect(value(run([XYDomain], { x: 3, y: -4 }, "sign"))).toEqual({ x: 1, y: -1 });
    expect(value(run([XYDomain], { x: 3, y: -4 }, "minAxis"))).toEqual({ x: 0, y: 1 });
    expect(typeof XYDomain.ops.sign.fn).toBe("function");
    expect(typeof XYDomain.ops.minAxis.fn).toBe("function");
  });
});

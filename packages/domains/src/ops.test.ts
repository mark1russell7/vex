/**
 * Each op of each domain, through the interpreter: `app(op, receiver, ...args)` with literal arguments. A row is
 * the receiver, the op, the arguments and the expected value. The rows check the method of the value and the
 * declaration of the op in the domain (parameters, lifting) together.
 */
import { app, evaluate, lit, space, type AnyDomain, type Result } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { Angle, AngleDomain } from "./angle.ts";
import { Color, ColorDomain } from "./color.ts";
import { LiftedNDVectorDomain, NDVector, NDVectorDomain, NumRecordDomain } from "./ndvector.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";
import { Vec2, Vec2Domain } from "./vec2.ts";
import { XYDomain } from "./xy.ts";
import { Fn, FnDomain, Maybe, MaybeDomain } from "./wrappers.ts";

const ONE = space.record({ A: {} });
const run = (domains: readonly AnyDomain[], self: unknown, op: string, ...args: readonly unknown[]): Result<unknown> =>
  evaluate(app(op, lit(self), ...args.map((a) => lit(a))), { space: ONE, origin: "A", domains });
const value = (r: Result<unknown>): unknown => (r.ok ? r.value : `${r.error.code} ${r.error.kind}`);

type Row = readonly [op: string, args: readonly unknown[], expected: unknown];

const v = (x: number, y: number): Vec2 => new Vec2(x, y);

describe("the ops of Vec2Domain", () => {
  const a = v(3, -4);
  const rows: readonly Row[] = [
    ["x", [], 3],
    ["y", [], -4],
    ["add", [v(1, 1)], v(4, -3)],
    ["add", [2], v(5, -2)],
    ["subtract", [v(1, 1)], v(2, -5)],
    ["multiply", [v(2, 3)], v(6, -12)],
    ["divide", [v(3, -2)], v(1, 2)],
    ["min", [v(0, 0)], v(0, -4)],
    ["max", [v(0, 0)], v(3, 0)],
    ["scale", [2], v(6, -8)],
    ["negate", [], v(-3, 4)],
    ["halve", [], v(1.5, -2)],
    ["abs", [], v(3, 4)],
    ["round", [], v(3, -4)],
    ["floor", [], v(3, -4)],
    ["ceil", [], v(3, -4)],
    ["clamp", [-1, 1], v(1, -1)],
    ["swap", [], v(-4, 3)],
    ["lerp", [v(5, 0), 0.5], v(4, -2)],
    ["length", [], 5],
    ["lengthSq", [], 25],
    ["distance", [v(0, 0)], 5],
    ["dot", [v(1, 2)], -5],
    ["cross", [v(1, 2)], 10],
    ["area", [], -12],
    ["sum", [], -1],
    ["minComponent", [], -4],
    ["maxComponent", [], 3],
    ["equals", [v(3, -4)], true],
    ["equals", [v(3, 4)], false],
    ["anyNonPositive", [], true],
    ["allPositive", [], false],
    ["anyNegative", [], true],
    ["allNonNegative", [], false],
    ["anyZero", [], false],
    ["allZero", [], false],
    ["anyLessThan", [0], true],
    ["allLessThan", [0], false],
    ["anyGreaterThan", [2], true],
    ["allGreaterThan", [-5], true],
  ];
  it.each(rows)("%s", (op, args, expected) => {
    expect(value(run([Vec2Domain], a, op, ...args))).toEqual(expected);
  });

  const flip = v(-1, 5);
  const flipRows: readonly Row[] = [
    ["anyNonPositive", [], true],
    ["allPositive", [], false],
    ["anyNegative", [], true],
    ["allNonNegative", [], false],
    ["anyLessThan", [0], true],
    ["allLessThan", [6], true],
    ["allLessThan", [0], false],
    ["anyGreaterThan", [4], true],
    ["anyGreaterThan", [9], false],
    ["allGreaterThan", [-2], true],
    ["allGreaterThan", [0], false],
    ["allZero", [], false],
    ["equals", [v(-1, 6)], false],
  ];
  it.each(flipRows)("%s of (-1, 5)", (op, args, expected) => {
    expect(value(run([Vec2Domain], flip, op, ...args))).toEqual(expected);
  });
  it.each([["allPositive", v(1, 1), true], ["allNonNegative", v(0, 0), true], ["allZero", v(0, 1), false], ["anyZero", v(2, 0), true], ["anyNonPositive", v(1, 1), false], ["anyNegative", v(1, 1), false]] as const)(
    "%s of %s",
    (op, self, expected) => {
      expect(value(run([Vec2Domain], self, op))).toBe(expected);
    },
  );

  it("rotate and angle use radians, the zero vector stays zero, and a division by zero gives #NUM!", () => {
    const r = run([Vec2Domain], v(1, 0), "rotate", Math.PI / 2);
    expect(r.ok && (r.value as Vec2).x).toBeCloseTo(0, 12);
    expect(r.ok && (r.value as Vec2).y).toBeCloseTo(1, 12);
    expect(value(run([Vec2Domain], v(0, 2), "angle"))).toBeCloseTo(Math.PI / 2, 12);
    expect(value(run([Vec2Domain], Vec2.zero, "normalize"))).toEqual(Vec2.zero);
    const unit = value(run([Vec2Domain], a, "normalize")) as Vec2;
    expect(unit.x).toBeCloseTo(0.6, 12);
    expect(unit.y).toBeCloseTo(-0.8, 12);
    expect(value(run([Vec2Domain], v(0, 0), "allZero"))).toBe(true);
    expect(value(run([Vec2Domain], v(1, 0), "anyZero"))).toBe(true);
    expect(value(run([Vec2Domain], a, "divide", 0))).toBe("#NUM! invalid-value");
  });

  it("the helpers of the class and of the domain", () => {
    expect(Vec2.of(1, 2)).toEqual(v(1, 2));
    expect(Vec2.scalar(3)).toEqual(v(3, 3));
    expect(Vec2.one).toEqual(v(1, 1));
    expect(a.toJSON()).toEqual({ x: 3, y: -4 });
    expect(String(a)).toBe("(3, -4)");
    expect(Vec2Domain.show?.(a)).toBe("(3, -4)");
    expect(Vec2Domain.encode?.(a)).toEqual([3, -4]);
    expect(Vec2Domain.decode?.([1, 2])).toEqual(v(1, 2));
    const bad = Vec2Domain.decode?.("x") as Vec2;
    expect(Number.isNaN(bad.x) && Number.isNaN(bad.y)).toBe(true);
    expect(Vec2Domain.valid?.(bad)).toBe(false);
    expect(Vec2Domain.fromScalar?.(2)).toEqual(v(2, 2));
    expect(Vec2Domain.is(a)).toBe(true);
    expect(Vec2Domain.is({ x: 1, y: 2 })).toBe(false);
  });
});

describe("the ops of XYDomain", () => {
  const p = { x: 3, y: -4 };
  const rows: readonly Row[] = [
    ["x", [], 3],
    ["y", [], -4],
    ["add", [{ x: 1, y: 1 }], { x: 4, y: -3 }],
    ["subtract", [{ x: 1, y: 1 }], { x: 2, y: -5 }],
    ["multiply", [{ x: 2, y: 3 }], { x: 6, y: -12 }],
    ["divide", [{ x: 3, y: -2 }], { x: 1, y: 2 }],
    ["min", [{ x: 0, y: 0 }], { x: 0, y: -4 }],
    ["max", [{ x: 0, y: 0 }], { x: 3, y: 0 }],
    ["scale", [2], { x: 6, y: -8 }],
    ["negate", [], { x: -3, y: 4 }],
    ["abs", [], { x: 3, y: 4 }],
    ["floor", [], { x: 3, y: -4 }],
    ["ceil", [], { x: 3, y: -4 }],
    ["round", [], { x: 3, y: -4 }],
    ["dot", [{ x: 1, y: 2 }], -5],
    ["length", [], 5],
    ["distance", [{ x: 0, y: 0 }], 5],
    ["area", [], -12],
    ["sum", [], -1],
    ["equals", [{ x: 3, y: -4 }], true],
    ["equals", [{ x: 3, y: 4 }], false],
  ];
  it.each(rows)("XY %s", (op, args, expected) => {
    expect(value(run([XYDomain], p, op, ...args))).toEqual(expected);
  });

  it("accepts plain objects with the numbers x and y only, and xy of NumDomain makes one", () => {
    expect([{ x: 1, y: 2 }, Object.assign(Object.create(null) as object, { x: 1, y: 2 })].map((u) => XYDomain.is(u))).toEqual([true, true]);
    expect([new Vec2(1, 2), { x: 1, y: 2, z: 3 }, { x: 1 }, { x: "1", y: 2 }, { x: 1, y: "2" }, [1, 2], null, 1].map((u) => XYDomain.is(u))).toEqual([false, false, false, false, false, false, false, false]);
    expect(value(run([NumDomain, XYDomain], 3, "xy", -4))).toEqual({ x: 3, y: -4 });
    // A component that is not finite is not valid.
    expect(value(run([NumDomain, XYDomain], 3, "xy", Number.POSITIVE_INFINITY))).toBe("#NUM! invalid-value");
    expect(value(run([XYDomain], p, "divide", { x: 0, y: 1 }))).toBe("#NUM! invalid-value");
    expect(XYDomain.show?.(p)).toBe("(3, -4)");
    expect(XYDomain.samples?.()).toHaveLength(3);
  });
});

describe("the ops of AngleDomain", () => {
  const quarter = new Angle(Math.PI / 2);
  it("add, subtract, scale, normalize, toVec2, sin, cos and degrees", () => {
    expect(value(run([AngleDomain], quarter, "add", quarter))).toEqual(new Angle(Math.PI));
    expect(value(run([AngleDomain], quarter, "add", 1))).toEqual(new Angle(Math.PI / 2 + 1));
    expect(value(run([AngleDomain], quarter, "subtract", quarter))).toEqual(new Angle(0));
    expect(value(run([AngleDomain], quarter, "scale", 2))).toEqual(new Angle(Math.PI));
    expect((value(run([AngleDomain], new Angle(3 * Math.PI), "normalize")) as Angle).radians).toBeCloseTo(-Math.PI, 12);
    expect((value(run([AngleDomain], new Angle(-0.5), "normalize")) as Angle).radians).toBeCloseTo(-0.5, 12);
    const vec = value(run([AngleDomain, Vec2Domain], quarter, "toVec2", 2)) as Vec2;
    expect(vec.x).toBeCloseTo(0, 12);
    expect(vec.y).toBeCloseTo(2, 12);
    expect(quarter.toVec2().y).toBeCloseTo(1, 12);
    expect(value(run([AngleDomain], quarter, "sin"))).toBeCloseTo(1, 12);
    expect(value(run([AngleDomain], quarter, "cos"))).toBeCloseTo(0, 12);
    expect(value(run([AngleDomain], quarter, "degrees"))).toBeCloseTo(90, 12);
  });

  it("the helpers of the class and of the domain", () => {
    expect(Angle.fromDegrees(180).radians).toBeCloseTo(Math.PI, 12);
    expect(Angle.zero.radians).toBe(0);
    expect(String(new Angle(1))).toBe("1 rad");
    expect(AngleDomain.show?.(new Angle(1))).toBe("1 rad");
    expect(AngleDomain.encode?.(new Angle(2))).toBe(2);
    expect(AngleDomain.decode?.(2)).toEqual(new Angle(2));
    const notAngle = AngleDomain.decode?.("x");
    expect(Number.isNaN(notAngle?.radians)).toBe(true);
    expect(AngleDomain.valid?.(new Angle(Number.NaN))).toBe(false);
    expect(AngleDomain.fromScalar?.(1)).toEqual(new Angle(1));
  });
});

describe("the ops of ColorDomain", () => {
  const red = new Color(200, 10, 0, 0.5);
  it("add, multiply, clamp, mix, luminance and equals", () => {
    expect(value(run([ColorDomain], red, "add", new Color(10, 10, 10, 1)))).toEqual(new Color(210, 20, 10, 1));
    expect(value(run([ColorDomain], red, "multiply", 2))).toEqual(new Color(400, 20, 0, 0.5));
    expect(value(run([ColorDomain], new Color(300, -5, 100), "clamp", 0, 255))).toEqual(new Color(255, 0, 100, 1));
    expect(new Color(300, -5, 100).clamp()).toEqual(new Color(255, 0, 100, 1));
    expect(value(run([ColorDomain], red, "mix", new Color(0, 0, 0, 1), 0.5))).toEqual(new Color(100, 5, 0, 0.75));
    expect(value(run([ColorDomain], new Color(1, 1, 1), "luminance"))).toBeCloseTo(1, 12);
    expect(value(run([ColorDomain], red, "equals", new Color(200, 10, 0, 0.5)))).toBe(true);
    expect(value(run([ColorDomain], red, "equals", new Color(200, 10, 0, 1)))).toBe(false);
  });

  it("the helpers of the class and of the domain", () => {
    expect(Color.gray(5)).toEqual(new Color(5, 5, 5, 1));
    expect(Color.none.toArray()).toEqual([0, 0, 0, 0]);
    expect(String(red)).toBe("rgba(200, 10, 0, 0.5)");
    expect(ColorDomain.show?.(red)).toBe("rgba(200, 10, 0, 0.5)");
    expect(ColorDomain.encode?.(red)).toEqual([200, 10, 0, 0.5]);
    expect(ColorDomain.decode?.([1, 2, 3])).toEqual(new Color(1, 2, 3, 1));
    expect(ColorDomain.valid?.(ColorDomain.decode?.("x") as Color)).toBe(false);
    expect(ColorDomain.fromScalar?.(7)).toEqual(Color.gray(7));
  });
});

describe("the ops of TextDomain", () => {
  const rows: readonly Row[] = [
    ["concat", ["!"], "Vex!"],
    ["concat", [2], "Vex2"],
    ["concat", [true], "Vextrue"],
    ["concat", [{ a: 1 }], 'Vex{"a":1}'],
    ["length", [], 3],
    ["upper", [], "VEX"],
    ["lower", [], "vex"],
    ["contains", ["ex"], true],
    ["eq", ["Vex"], true],
    ["eq", ["vex"], false],
  ];
  it.each(rows)("Text %s %j", (op, args, expected) => {
    expect(value(run([TextDomain], "Vex", op, ...args))).toEqual(expected);
  });

  it("concat gives the own text of a domain value, trim removes the spaces at the ends, and length counts UTF-16 units", () => {
    expect(value(run([TextDomain], "at ", "concat", new Vec2(1, 2)))).toBe("at (1, 2)");
    expect(value(run([TextDomain], "  a b  ", "trim"))).toBe("a b");
    expect(value(run([TextDomain], "😀a", "length"))).toBe(3);
    expect(value(run([TextDomain], "a", "contains", 1))).toMatch(/^#VALUE!/);
    expect(TextDomain.show?.('say "hi"')).toBe('"say \\"hi\\""');
    expect(TextDomain.is(1)).toBe(false);
  });
});

describe("the ops of NumDomain and BoolDomain", () => {
  const rows: readonly Row[] = [
    ["add", [2], 9],
    ["subtract", [2], 5],
    ["multiply", [2], 14],
    ["divide", [2], 3.5],
    ["mod", [2], 1],
    ["pow", [2], 49],
    ["min", [2], 2],
    ["max", [2], 7],
    ["clamp", [0, 5], 5],
    ["abs", [], 7],
    ["negate", [], -7],
    ["sqrt", [], Math.sqrt(7)],
    ["ln", [], Math.log(7)],
    ["exp", [], Math.exp(7)],
    ["log10", [], Math.log10(7)],
    ["sin", [], Math.sin(7)],
    ["cos", [], Math.cos(7)],
    ["hypot", [24], 25],
    ["floor", [], 7],
    ["ceil", [], 7],
    ["round", [], 7],
    ["gt", [2], true],
    ["gte", [7], true],
    ["lt", [2], false],
    ["lte", [7], true],
    ["eq", [7], true],
  ];
  it.each(rows)("Num %s", (op, args, expected) => {
    expect(value(run([NumDomain], 7, op, ...args))).toEqual(expected);
  });

  it("Num gives #NUM! for a result that is not finite, and Bool has and, or, xor, not and eq", () => {
    expect(value(run([NumDomain], 1, "divide", 0))).toBe("#NUM! not-finite");
    expect(value(run([NumDomain], -1, "sqrt"))).toBe("#NUM! not-finite");
    expect(value(run([NumDomain], 0, "ln"))).toBe("#NUM! not-finite");
    expect(value(run([NumDomain], -1, "log10"))).toBe("#NUM! not-finite");
    expect(value(run([NumDomain], 0.5, "asin"))).toBe(Math.asin(0.5));
    expect(value(run([NumDomain], 2, "asin"))).toBe("#NUM! not-finite");
    expect(value(run([NumDomain], 1000, "exp"))).toBe("#NUM! not-finite");
    expect(value(run([BoolDomain], true, "and", false))).toBe(false);
    expect(value(run([BoolDomain], false, "or", true))).toBe(true);
    expect(value(run([BoolDomain], true, "xor", true))).toBe(false);
    expect(value(run([BoolDomain], true, "not"))).toBe(false);
    expect(value(run([BoolDomain], true, "eq", true))).toBe(true);
    expect(BoolDomain.show?.(true)).toBe("true");
    expect(value(run([NumDomain, Vec2Domain], 3, "vec2", -4))).toEqual(v(3, -4));
    expect(value(run([NumDomain, Vec2Domain], 3, "vec2", "4"))).toBe("#VALUE! kind-mismatch");
    expect(value(run([NumDomain, Vec2Domain], 3, "vec2", Number.POSITIVE_INFINITY))).toBe("#NUM! invalid-value");
    expect(NumDomain.show?.(1.5)).toBe("1.5");
  });
});

describe("the ops of NDVectorDomain, LiftedNDVectorDomain and NumRecordDomain", () => {
  const p = new NDVector({ x: 1, y: -2 });
  const q = new NDVector({ y: 3, z: 4 });
  it("the ops that combine two vectors use the union of the names", () => {
    expect(value(run([NDVectorDomain], p, "add", q))).toEqual(new NDVector({ x: 1, y: 1, z: 4 }));
    expect(value(run([NDVectorDomain], p, "subtract", q))).toEqual(new NDVector({ x: 1, y: -5, z: -4 }));
    expect(value(run([NDVectorDomain], p, "multiply", q))).toEqual(new NDVector({ x: 0, y: -6, z: 0 }));
    expect(value(run([NDVectorDomain], p, "min", q))).toEqual(new NDVector({ x: 0, y: -2, z: 0 }));
    expect(value(run([NDVectorDomain], p, "max", q))).toEqual(new NDVector({ x: 1, y: 3, z: 4 }));
    expect(value(run([NDVectorDomain], new NDVector({ x: 0, y: 2 }), "mergePreferNonZero", new NDVector({ x: 5, y: 9 })))).toEqual(new NDVector({ x: 5, y: 2 }));
    expect(value(run([NDVectorDomain], p, "dot", q))).toBe(-6);
    expect(value(run([NDVectorDomain], p, "equals", new NDVector({ x: 1, y: -2, z: 0 })))).toBe(true);
    expect(value(run([NDVectorDomain], p, "equals", q))).toBe(false);
  });

  it("the ops of one vector", () => {
    expect(value(run([NDVectorDomain], p, "scale", 2))).toEqual(new NDVector({ x: 2, y: -4 }));
    expect(value(run([NDVectorDomain], p, "clamp", 0, 1))).toEqual(new NDVector({ x: 1, y: 0 }));
    expect(value(run([NDVectorDomain], new NDVector({ a: 3, b: 4 }), "length"))).toBe(5);
    expect(value(run([NDVectorDomain], p, "norm1"))).toBe(3);
    expect(value(run([NDVectorDomain], p, "normInf"))).toBe(2);
    expect(value(run([NDVectorDomain], p, "get", "y"))).toBe(-2);
    expect(value(run([NDVectorDomain], p, "get", "w"))).toBe(0);
    expect(value(run([NDVectorDomain], p, "set", "w", 9))).toEqual(new NDVector({ x: 1, y: -2, w: 9 }));
    expect(value(run([NDVectorDomain], new NDVector({ a: 1, b: 0, c: 3 }), "pick", ["a", "b"]))).toEqual(new NDVector({ a: 1 }));
    expect(new NDVector({ a: 1, b: 0 }).pick(["a", "b"], true)).toEqual(new NDVector({ a: 1, b: 0 }));
    expect(value(run([NDVectorDomain], p, "withKeys", ["x", "z"]))).toEqual(new NDVector({ x: 1, y: -2, z: 0 }));
  });

  it("the helpers, the lifting domain, the check of numbers, and number records", () => {
    expect(NDVector.of([["a", 1]])).toEqual(new NDVector({ a: 1 }));
    expect(NDVector.zero(["a", "b"])).toEqual(new NDVector({ a: 0, b: 0 }));
    expect(NDVector.zero().keys()).toEqual([]);
    expect(p.map((_k, x) => x * 10)).toEqual(new NDVector({ x: 10, y: -20 }));
    expect(p.toJSON()).toEqual({ x: 1, y: -2 });
    expect(String(p)).toBe('NDVector({"x":1,"y":-2})');
    expect(NDVectorDomain.show?.(p)).toBe(String(p));
    expect(NDVectorDomain.encode?.(p)).toEqual({ x: 1, y: -2 });
    expect(NDVectorDomain.decode?.({ x: 1 })).toEqual(new NDVector({ x: 1 }));
    expect(NDVectorDomain.valid?.(new NDVector({ x: Number.NaN }))).toBe(false);
    expect(value(run([NDVectorDomain], p, "add", 2))).toBe("#VALUE! not-instance");
    expect(value(run([LiftedNDVectorDomain], p, "add", 2))).toEqual(new NDVector({ x: 1, y: -2, scalar: 2 }));
    expect(LiftedNDVectorDomain.show?.(p)).toBe(String(p));
    expect(LiftedNDVectorDomain.valid?.(p)).toBe(true);
    expect(value(run([NumRecordDomain, NDVectorDomain], { a: 1, b: 2 }, "toNDVector"))).toEqual(new NDVector({ a: 1, b: 2 }));
    for (const notRecord of [null, 1, [1], new NDVector({ a: 1 }), { a: Number.POSITIVE_INFINITY }, { a: "1" }]) {
      expect(NumRecordDomain.is(notRecord)).toBe(false);
    }
    expect(NumRecordDomain.is(Object.assign(Object.create(null) as object, { a: 1 }))).toBe(true);
  });
});

describe("the wrapper domains", () => {
  it("Fn calls the function, and Maybe maps, chains and gives a fallback", () => {
    expect(value(run([FnDomain], new Fn((a: number, b: number) => a + b), "invoke", 2, 3))).toBe(5);
    const top = Maybe.top(2);
    const bottom = Maybe.bottom<number>();
    expect(value(run([MaybeDomain], top, "isTop"))).toBe(true);
    expect(value(run([MaybeDomain], bottom, "isBottom"))).toBe(true);
    expect(top.map((x) => x + 1).valueOr(0)).toBe(3);
    expect(bottom.map((x) => x + 1).valueOr(0)).toBe(0);
    expect(top.chain((x) => Maybe.top(x * 10)).valueOr(0)).toBe(20);
    expect(bottom.chain((x) => Maybe.top(x * 10)).isBottom()).toBe(true);
    expect(value(run([MaybeDomain], top, "valueOr", 9))).toBe(2);
    expect(value(run([MaybeDomain], bottom, "valueOr", 9))).toBe(9);
  });
});

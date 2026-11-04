/**
 * The tests of `InsetsDomain`: the four sides of an inset as plain data. Each test names the requirement that it covers.
 */
import { app, evaluate, lit, ref, space, vex, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { InsetsDomain, type Insets } from "./insets.ts";
import { NDVector, NDVectorDomain, NumRecordDomain } from "./ndvector.ts";
import { NumDomain } from "./scalars.ts";
import { Vec2, Vec2Domain } from "./vec2.ts";
import { XYDomain } from "./xy.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, Vec2Domain, XYDomain, InsetsDomain];
const inset = (startX: number, startY: number, endX: number, endY: number): Insets => ({ startX, startY, endX, endY });
const A = inset(1, 2, 3, 4);

/** This function gives the result of a program over one record. */
function run(e: Expr, record: unknown = { i: A, n: 8 }, domains: readonly AnyDomain[] = DOMAINS): unknown {
  return evaluate(e, { space: space.array([record]), origin: "0", domains });
}

const i = ref("i");
const n = ref("n");

/** This function gives the code of the error of a program, or the text `ok`. */
function code(e: Expr, record?: unknown): string {
  const r = run(e, record) as { readonly ok: boolean; readonly error?: { readonly code: string } };
  return r.ok ? "ok" : (r.error?.code ?? "no code");
}

describe("the value of InsetsDomain (INSETS.VALUE)", () => {
  it("INSETS.VALUE: the op insets of NumDomain gives the sides in the order startX, startY, endX, endY", () => {
    expect(run(app("insets", lit(1), lit(2), lit(3), lit(4)))).toEqual({ ok: true, value: A });
    expect(run(app("startY", app("insets", lit(1), lit(2), lit(3), lit(4))))).toEqual({ ok: true, value: 2 });
    expect(run(app("endX", app("insets", lit(1), lit(2), lit(3), lit(4))))).toEqual({ ok: true, value: 3 });
  });

  it("INSETS.VALUE: the domain accepts a plain object with the four number fields, and no other value", () => {
    const nullProto = Object.assign(Object.create(null) as object, A);
    expect([A, nullProto].map((u) => InsetsDomain.is(u))).toEqual([true, true]);
    class Sides {
      readonly startX = 1;
      readonly startY = 2;
      readonly endX = 3;
      readonly endY = 4;
    }
    const others = [
      new Sides(),
      { ...A, more: 1 },
      { startX: 1, startY: 2, endX: 3 },
      { startX: "1", startY: 2, endX: 3, endY: 4 },
      { startX: 1, startY: "2", endX: 3, endY: 4 },
      { startX: 1, startY: 2, endX: "3", endY: 4 },
      { startX: 1, startY: 2, endX: 3, endY: "4" },
      { startX: 1, startY: 2, endX: 3, more: 4 },
      { x: 1, y: 2 },
      [1, 2, 3, 4],
      null,
      undefined,
      1,
      "a",
    ];
    expect(others.map((u) => InsetsDomain.is(u))).toEqual(others.map(() => false));
  });

  it("INSETS.VALUE: the fields, the text and the samples of a value", () => {
    expect(InsetsDomain.fields).toEqual(["startX", "startY", "endX", "endY"]);
    expect(InsetsDomain.show?.(A)).toBe("(1, 2, 3, 4)");
    const samples = InsetsDomain.samples?.() ?? [];
    expect(samples).toEqual([inset(0, 0, 0, 0), inset(1.5, -2, 3, 4), inset(8, 8, 8, 8)]);
    expect(samples.every((s) => InsetsDomain.is(s) && InsetsDomain.valid?.(s) === true)).toBe(true);
    expect(Object.entries(InsetsDomain.ops).map(([name, op]) => `${name}: ${op.returns ?? "?"}`)).toEqual([
      "startX: number", "startY: number", "endX: number", "endY: number",
      "start: domain:XY", "end: domain:XY", "startVec2: domain:Vec2", "endVec2: domain:Vec2",
      "add: domain", "scale: domain",
    ]);
  });

  it("INSETS.VALUE: put the domain before NumRecordDomain, which accepts the same objects", () => {
    const domains = [NumDomain, InsetsDomain, NumRecordDomain, NDVectorDomain];
    expect(run(app("startX", i), { i: A }, domains)).toEqual({ ok: true, value: 1 });
    expect(run(app("toNDVector", ref("r")), { r: { width: 1 } }, domains)).toEqual({ ok: true, value: new NDVector({ width: 1 }) });
  });
});

describe("the lift of a number (INSETS.LIFT)", () => {
  it("INSETS.LIFT: a number gives four equal sides", () => {
    expect(InsetsDomain.fromScalar?.(8)).toEqual(inset(8, 8, 8, 8));
    expect(run(app("add", i, lit(8)))).toEqual({ ok: true, value: inset(9, 10, 11, 12) });
    expect(run(app("add", i, n))).toEqual({ ok: true, value: inset(9, 10, 11, 12) });
  });

  it("INSETS.LIFT: add with a zero value takes a number or a value, so a program needs no test of the type", () => {
    const zero = app("insets", lit(0), lit(0), lit(0), lit(0));
    const sides = app("add", zero, ref("pad"));
    expect(run(sides, { pad: 8 })).toEqual({ ok: true, value: inset(8, 8, 8, 8) });
    expect(run(sides, { pad: A })).toEqual({ ok: true, value: A });
  });

  it("INSETS.LIFT: the builder takes a number for the argument of add", () => {
    const sides = vex(NumDomain, InsetsDomain).over(space.array([{ i: A, n: 8 }]));
    expect(sides.start(sides.from("i"))._.add(8)._.endY().at("0")).toMatchObject({ tag: "some", value: 12 });
    expect(sides.start(sides.from("i"))._.add(sides.from("n"))._.startX().at("0")).toMatchObject({ tag: "some", value: 9 });
  });
});

describe("the sides (INSETS.SIDES, INSETS.VEC2)", () => {
  it("INSETS.SIDES: an op reads each side, and start and end give XY values", () => {
    expect(["startX", "startY", "endX", "endY"].map((op) => run(app(op, i)))).toEqual([1, 2, 3, 4].map((value) => ({ ok: true, value })));
    expect(run(app("start", i))).toEqual({ ok: true, value: { x: 1, y: 2 } });
    expect(run(app("end", i))).toEqual({ ok: true, value: { x: 3, y: 4 } });
  });

  it("INSETS.VEC2: startVec2 and endVec2 give Vec2 values", () => {
    expect(run(app("startVec2", i))).toEqual({ ok: true, value: new Vec2(1, 2) });
    expect(run(app("endVec2", i))).toEqual({ ok: true, value: new Vec2(3, 4) });
  });

  it("INSETS.SIDES: a box inset, with XY values and with Vec2 values", () => {
    const record = { i: A, at: { x: 10, y: 20 }, size: { x: 100, y: 50 }, at2: new Vec2(10, 20), size2: new Vec2(100, 50) };
    expect(run(app("add", ref("at"), app("start", i)), record)).toEqual({ ok: true, value: { x: 11, y: 22 } });
    expect(run(app("subtract", app("subtract", ref("size"), app("start", i)), app("end", i)), record)).toEqual({ ok: true, value: { x: 96, y: 44 } });
    expect(run(app("add", ref("at2"), app("startVec2", i)), record)).toEqual({ ok: true, value: new Vec2(11, 22) });
    expect(run(app("subtract", app("subtract", ref("size2"), app("startVec2", i)), app("endVec2", i)), record)).toEqual({ ok: true, value: new Vec2(96, 44) });
  });
});

describe("the arithmetic (INSETS.ARITH)", () => {
  it("INSETS.ARITH: add and scale work on each side", () => {
    expect(run(app("add", i, i))).toEqual({ ok: true, value: inset(2, 4, 6, 8) });
    expect(run(app("add", i, app("insets", lit(10), lit(20), lit(30), lit(40))))).toEqual({ ok: true, value: inset(11, 22, 33, 44) });
    expect(run(app("scale", i, lit(2)))).toEqual({ ok: true, value: inset(2, 4, 6, 8) });
    expect(run(app("scale", i, lit(-1)))).toEqual({ ok: true, value: inset(-1, -2, -3, -4) });
    expect(InsetsDomain.ops.add.identity?.()).toEqual(inset(0, 0, 0, 0));
  });

  it("INSETS.ARITH: a wrong kind in an argument gives #VALUE!", () => {
    const record = { i: A, p: { x: 1, y: 2 } };
    expect([app("add", i, lit("8")), app("add", i, lit(true)), app("add", i, ref("p")), app("scale", i, i), app("scale", i, lit("2")), app("insets", lit(1), lit("2"), lit(3), lit(4))].map((e) => code(e, record))).toEqual(Array.from({ length: 6 }, () => "#VALUE!"));
  });
});

describe("the values that are not finite (INSETS.FINITE)", () => {
  const FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it("INSETS.FINITE: a value with a side that is not finite is not valid", () => {
    expect(InsetsDomain.valid?.(A)).toBe(true);
    const bad = FINITE.flatMap((x) => [inset(x, 2, 3, 4), inset(1, x, 3, 4), inset(1, 2, x, 4), inset(1, 2, 3, x)]);
    expect(bad.map((v) => InsetsDomain.valid?.(v))).toEqual(bad.map(() => false));
  });

  it("INSETS.FINITE: an op that gives a side that is not finite gives #NUM!", () => {
    for (const x of FINITE) {
      expect(code(app("insets", n, lit(2), lit(3), lit(4)), { n: x })).toBe("#NUM!");
      expect(code(app("insets", lit(1), lit(2), lit(3), n), { n: x })).toBe("#NUM!");
      expect(code(app("add", i, n), { i: A, n: x })).toBe("#NUM!");
      expect(code(app("scale", i, n), { i: A, n: x })).toBe("#NUM!");
      expect(code(app("start", i), { i: inset(x, 2, 3, 4) })).toBe("#NUM!");
      expect(code(app("end", i), { i: inset(1, 2, 3, x) })).toBe("#NUM!");
      expect(code(app("startVec2", i), { i: inset(x, 2, 3, 4) })).toBe("#NUM!");
      expect(code(app("startX", i), { i: inset(x, 2, 3, 4) })).toBe("#NUM!");
    }
    // An overflow of a finite side.
    expect(code(app("add", i, i), { i: inset(1e308, 1e308, 1e308, 1e308) })).toBe("#NUM!");
    expect(code(app("scale", i, lit(1e308)), { i: inset(0, 0, 0, 10) })).toBe("#NUM!");
  });
});

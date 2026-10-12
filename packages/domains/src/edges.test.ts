/**
 * The edges of the ops: equal values for the comparisons, a zero in each component for the tests of a vector, a
 * different value in each channel of a color, and the hooks `is`, `encode` and `decode`. Each row gives the exact
 * result, so a change of a comparison or of an arithmetic operator fails a row.
 */
import { describe, expect, it } from "vitest";
import { Color, ColorDomain } from "./color.ts";
import { NumRecordDomain } from "./ndvector.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";
import { Vec2, Vec2Domain } from "./vec2.ts";

const v = (x: number, y: number): Vec2 => new Vec2(x, y);

describe("the comparisons of NumDomain at equal values and in both orders", () => {
  const { gt, gte, lt, lte, eq } = NumDomain.ops;
  it("gives the exact result for 1 and 2, 2 and 1, and 2 and 2", () => {
    const table = [gt, gte, lt, lte, eq].map((op) => [op.fn(1, 2), op.fn(2, 1), op.fn(2, 2)]);
    expect(table).toEqual([
      [false, true, false],
      [false, true, true],
      [true, false, false],
      [true, false, true],
      [false, false, true],
    ]);
  });
});

describe("the hooks of BoolDomain and NumRecordDomain", () => {
  it("accepts only booleans as Bool values", () => {
    expect([true, false, 1, "true", null].map((u) => BoolDomain.is(u))).toEqual([true, true, false, false, false]);
    expect([BoolDomain.ops.eq.fn(true, true), BoolDomain.ops.eq.fn(true, false)]).toEqual([true, false]);
  });

  it("accepts only plain records of finite numbers as NumRecord values", () => {
    const bare = Object.assign(Object.create(null) as object, { a: 1 });
    const rows: readonly (readonly [unknown, boolean])[] = [
      [{ a: 1, b: 2 }, true],
      [{}, true],
      [bare, true],
      [{ a: 1, b: "2" }, false],
      [{ a: 1, b: Number.NaN }, false],
      [{ a: "1" }, false],
      [[1, 2], false],
      [null, false],
      [undefined, false],
      [5, false],
      [new Vec2(1, 2), false],
    ];
    expect(rows.map(([u]) => NumRecordDomain.is(u))).toEqual(rows.map(([, ok]) => ok));
  });
});

describe("the tests of Vec2 with a zero or an equal value in one component", () => {
  it("gives the exact result of each test for (0, 1), (1, 0), (-1, 1) and (2, 2)", () => {
    const vs = [v(0, 1), v(1, 0), v(-1, 1), v(2, 2)];
    const tests = ["anyNonPositive", "allPositive", "anyNegative", "allNonNegative", "anyZero", "allZero"] as const;
    expect(tests.map((t) => vs.map((x) => x[t]()))).toEqual([
      [true, true, true, false],
      [false, false, false, true],
      [false, false, true, false],
      [true, true, false, true],
      [true, true, false, false],
      [false, false, false, false],
    ]);
    expect(v(0, 0).allZero()).toBe(true);
  });

  it("compares each component with a number, also at the number itself", () => {
    const vs = [v(1, 2), v(2, 1), v(2, 2), v(3, 3), v(1, 1)];
    const tests = ["anyLessThan", "allLessThan", "anyGreaterThan", "allGreaterThan"] as const;
    expect(tests.map((t) => vs.map((x) => x[t](2)))).toEqual([
      [true, true, false, false, true],
      [false, false, false, false, true],
      [false, false, false, true, false],
      [false, false, false, true, false],
    ]);
    // One component at the bound or under it is enough: allGreaterThan is false.
    expect([v(2, 3), v(3, 2), v(1, 3)].map((x) => x.allGreaterThan(2))).toEqual([false, false, false]);
  });

  it("checks both components for equality, and gives exact distances and rotations", () => {
    expect([v(1, 2).equals(v(1, 3)), v(1, 2).equals(v(0, 2)), v(1, 2).equals(v(1, 2))]).toEqual([false, false, true]);
    expect(v(4, 6).distance(v(1, 2))).toBe(5);
    const r = v(1, 2).rotate(Math.PI / 2);
    expect([Math.round(r.x * 1e9) / 1e9, Math.round(r.y * 1e9) / 1e9]).toEqual([-2, 1]);
    const q = v(3, 1).rotate(Math.PI);
    expect([Math.round(q.x * 1e9) / 1e9, Math.round(q.y * 1e9) / 1e9]).toEqual([-3, -1]);
    const w = v(2, 0).rotate(Math.PI / 2);
    expect([Math.round(w.x * 1e9) / 1e9, Math.round(w.y * 1e9) / 1e9]).toEqual([0, 2]);
  });
});

describe("Color", () => {
  it("weights the channels for the luminance, and compares each channel for equality", () => {
    expect(new Color(10, 20, 30).luminance()).toBeCloseTo(18.596, 10);
    const base = new Color(1, 2, 3, 0.5);
    const others = [new Color(9, 2, 3, 0.5), new Color(1, 9, 3, 0.5), new Color(1, 2, 9, 0.5), new Color(1, 2, 3, 1)];
    expect(others.map((o) => base.equals(o))).toEqual([false, false, false, false]);
    expect(base.equals(new Color(1, 2, 3, 0.5))).toBe(true);
  });

  it("decodes a list of three channels with the alpha 1, and keeps an alpha of the list", () => {
    const decode = ColorDomain.decode;
    if (decode === undefined) throw new Error("ColorDomain has no decode");
    expect(decode([1, 2, 3]).toArray()).toEqual([1, 2, 3, 1]);
    expect(decode([1, 2, 3, 0.5]).toArray()).toEqual([1, 2, 3, 0.5]);
    expect(decode([1, 2, 3, 0]).a).toBe(0);
  });
});

const join = (u: unknown): string => TextDomain.ops.concat.fn("x=", u);

describe("TextDomain", () => {
  it("joins a text and a value of each kind: a record gives its JSON text, another value its own text", () => {
    expect([join("a"), join({ a: 1 }), join(null), join(undefined), join(5), join([1, 2]), join(v(1, 2)), join(true)]).toEqual([
      "x=a",
      'x={"a":1}',
      "x=null",
      "x=undefined",
      "x=5",
      "x=1,2",
      "x=(1, 2)",
      "x=true",
    ]);
  });
});

describe("Vec2Domain", () => {
  it("decodes a list, and gives NaN for a missing or wrong component", () => {
    const decode = Vec2Domain.decode;
    if (decode === undefined) throw new Error("Vec2Domain has no decode");
    expect(decode([1, 2])).toEqual(v(1, 2));
    const bad = decode([1, "2"]);
    expect([bad.x, Number.isNaN(bad.y)]).toEqual([1, true]);
  });
});

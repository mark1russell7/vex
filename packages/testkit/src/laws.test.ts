import { defineDomain, type OpTable } from "@mark1russell7/vex";
import { Angle, AngleDomain, BoolDomain, Color, ColorDomain, NDVector, NDVectorDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertLaws, checkLaws, structuralEqual } from "./laws.ts";

const small = fc.integer({ min: -20, max: 20 });

describe("P4 DOMAIN.LAWS: each declared law of each domain holds", () => {
  it("Vec2", () => {
    expect(checkLaws(Vec2Domain, { arb: fc.tuple(small, small).map(([x, y]) => new Vec2(x, y)) }).filter((r) => !r.ok)).toEqual([]);
  });
  it("NDVector", () => {
    const arb = fc.record({ x: small, y: small, z: small }, { requiredKeys: [] }).map((c) => new NDVector(c as Readonly<Record<string, number>>));
    expect(checkLaws(NDVectorDomain, { arb }).filter((r) => !r.ok)).toEqual([]);
  });
  it("Color", () => {
    const arb = fc.tuple(small, small, small, fc.constantFrom(0, 0.5, 1)).map(([r, g, b, a]) => new Color(r, g, b, a));
    expect(checkLaws(ColorDomain, { arb }).filter((r) => !r.ok)).toEqual([]);
  });
  it("Angle", () => {
    expect(checkLaws(AngleDomain, { arb: small.map((r) => new Angle(r)) }).filter((r) => !r.ok)).toEqual([]);
  });
  it("Num and Bool", () => {
    expect(checkLaws(NumDomain, { arb: small }).filter((r) => !r.ok)).toEqual([]);
    expect(checkLaws(BoolDomain, { arb: fc.boolean() }).filter((r) => !r.ok)).toEqual([]);
    expect(checkLaws(TextDomain, { arb: fc.string({ maxLength: 6 }) }).filter((r) => !r.ok)).toEqual([]);
  });
});

describe("the law checker finds a false claim (V-016)", () => {
  /** The old Color: `add` keeps the alpha of the receiver, but the old adapter said `commutative`. */
  class OldColor {
    readonly r: number;
    readonly a: number;
    constructor(r: number, a: number) {
      this.r = r;
      this.a = a;
    }
    add(o: OldColor): OldColor {
      return new OldColor(this.r + o.r, this.a);
    }
  }
  const OldColorDomain = defineDomain<"OldColor", OldColor, OpTable<OldColor, "add">>({
    name: "OldColor",
    is: (u: unknown): u is OldColor => u instanceof OldColor,
    ops: { add: { laws: ["commutative", "associative"] } },
  });

  it("structuralEqual compares primitives with Object.is and objects by their fields", () => {
    expect(structuralEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(structuralEqual(1, "1")).toBe(false);
    expect(structuralEqual(null, {})).toBe(false);
    expect(structuralEqual(new Vec2(1, 2), { x: 1, y: 2 })).toBe(false);
    expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(structuralEqual({ a: 1, c: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(structuralEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toBe(true);
  });

  it("a law of an op that the values do not have fails", () => {
    const NoMethod = defineDomain({ name: "NoMethod", is: (u: unknown): u is number => typeof u === "number", ops: { join: { laws: ["commutative"] } } });
    const [result] = checkLaws(NoMethod, { arb: fc.integer(), numRuns: 5 });
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("Property failed");
  });

  it("assertLaws throws an error that names each failed law", () => {
    const Bad = defineDomain({
      name: "Bad",
      is: (u: unknown): u is number => typeof u === "number",
      ops: { minus: { fn: (a: number, b: number): number => a - b, laws: ["commutative"] } },
    });
    expect(() => assertLaws(Bad, { arb: fc.integer({ min: -9, max: 9 }), numRuns: 50 })).toThrow(/minus commutative/);
    expect(() => assertLaws(NumDomain, { arb: fc.integer({ min: -9, max: 9 }), numRuns: 20 })).not.toThrow();
  });

  it("commutative fails with a counterexample, and associative holds", () => {
    const results = checkLaws(OldColorDomain, { arb: fc.tuple(small, fc.constantFrom(0, 1)).map(([r, a]) => new OldColor(r, a)) });
    expect(results.find((r) => r.name === "OldColor.add commutative")?.ok).toBe(false);
    expect(results.find((r) => r.name === "OldColor.add associative")?.ok).toBe(true);
    expect(results.find((r) => !r.ok)?.message).toContain("Counterexample");
  });
});

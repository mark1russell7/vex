import { defineDomain, type OpTable } from "@mark1russell7/vex";
import { Angle, AngleDomain, BoolDomain, Color, ColorDomain, DateDomain, JsonDomain, LocalDate, NDVector, NDVectorDomain, NumDomain, TextDomain, Vec2, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertLaws, checkLaws, structuralEqual } from "./laws.ts";

const small = fc.integer({ min: -20, max: 20 });

/** This function gives the names of the checks of the op xy of NumDomain. */
const xyChecks = (opts: Parameters<typeof checkLaws>[1]): readonly string[] => checkLaws(NumDomain, opts).map((r) => r.name).filter((n) => n.startsWith("Num.xy"));

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
  it("Date", () => {
    expect(checkLaws(DateDomain, { arb: fc.integer({ min: -1000, max: 1000 }).map((n) => new LocalDate(n)) }).filter((r) => !r.ok)).toEqual([]);
  });
  it("XY", () => {
    expect(checkLaws(XYDomain, { arb: fc.tuple(small, small).map(([x, y]) => ({ x, y })) }).filter((r) => !r.ok)).toEqual([]);
  });
  it("Json: kind gives a text, and field gives a value", () => {
    const arb = fc.oneof(fc.string({ maxLength: 4 }), small, fc.boolean(), fc.array(small, { maxLength: 3 }), fc.dictionary(fc.string({ maxLength: 2 }), small, { maxKeys: 3 }));
    const results = checkLaws(JsonDomain, { arb, numRuns: 50 });
    expect(results.map((r) => r.name)).toEqual(["Json.kind returns string", "Json.field returns any"]);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
  it("KIND.RETURNS: a result of the kind domain:Name is a value of the domain Name of the option domains", () => {
    // With the domain XY, the checker checks the op xy of NumDomain. Without it, the checker cannot check that op.
    expect(xyChecks({ arb: small, numRuns: 5, domains: [XYDomain] })).toEqual(["Num.xy returns domain:XY"]);
    expect(xyChecks({ arb: small, numRuns: 5 })).toEqual([]);
    // A false claim fails: Vec2 is not the domain of the result of xy.
    const wrong = defineDomain({ name: "W", is: (u: unknown): u is number => typeof u === "number", ops: { pair: { fn: (a: number): unknown => ({ x: a, y: a }), params: [], returns: "domain:Vec2" } } });
    expect(checkLaws(wrong, { arb: small, numRuns: 5, domains: [Vec2Domain] }).filter((r) => !r.ok).map((r) => r.name)).toEqual(["W.pair returns domain:Vec2"]);
  });
  it("Num and Bool", () => {
    expect(checkLaws(NumDomain, { arb: small, domains: [XYDomain] }).filter((r) => !r.ok)).toEqual([]);
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

  it("KIND.PRIMITIVE KIND.RETURNS: a false primitive type and a false kind of a result fail, and true ones hold", () => {
    // The domain accepts only the integers, so it does not accept each number.
    const Ints = defineDomain({
      name: "Ints",
      is: (u: unknown): u is number => Number.isInteger(u),
      primitive: "number",
      ops: {
        half: { fn: (a: number): number => a / 2, returns: "domain" },
        twice: { fn: (a: number): number => a * 2, returns: "domain" },
        name: { fn: (a: number): string => String(a), returns: "number" },
        same: { fn: (_a: number, b: unknown): unknown => b, params: ["any"], returns: "any" },
        none: { fn: (): undefined => undefined, returns: "boolean" },
        boom: { fn: (): never => {
          throw new Error("boom");
        }, returns: "string" },
        flag: { fn: (a: number, b: boolean, c: string): boolean => b && c.length > a, params: ["boolean", "string"], returns: "boolean" },
        // Without params, each argument is a value of the domain.
        plus: { fn: (a: number, b: number): number => a + b, returns: "domain" },
        scale: { fn: (a: number, k: number): number => a * k, params: ["number"], returns: "number" },
      },
    });
    const results = checkLaws(Ints, { arb: fc.integer({ min: -9, max: 9 }), numRuns: 100 });
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual(["Ints primitive number", "Ints.half returns domain", "Ints.name returns number"]);
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(["Ints.flag returns boolean", "Ints.plus returns domain", "Ints.scale returns number"]));
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
    expect(() => assertLaws(NumDomain, { arb: fc.integer({ min: -9, max: 9 }), numRuns: 20, domains: [XYDomain] })).not.toThrow();
  });

  it("commutative fails with a counterexample, and associative holds", () => {
    const results = checkLaws(OldColorDomain, { arb: fc.tuple(small, fc.constantFrom(0, 1)).map(([r, a]) => new OldColor(r, a)) });
    expect(results.find((r) => r.name === "OldColor.add commutative")?.ok).toBe(false);
    expect(results.find((r) => r.name === "OldColor.add associative")?.ok).toBe(true);
    expect(results.find((r) => !r.ok)?.message).toContain("Counterexample");
  });
});

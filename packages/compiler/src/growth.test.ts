/**
 * The rule of the gate of the growth of a compile (COMPILE.GROWTH). The gate `bench/growth.ts` runs in the speed gate, and
 * this file tests its rule and the sizes of its shapes.
 */
import { MAX_NESTING, nestingOf } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { BYTES_LIMIT, exponent, exponentsOf, GROWTH_SHAPES, growthFaults, TIME_LIMIT, type GrowthRow, type GrowthShape } from "../test/growth.ts";
import { emitModule } from "./module.ts";
import { MAX_PLACES, placesOf } from "./unshared.ts";

const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;
const SHAPE: GrowthShape = { name: "s", make: () => ({ tag: "lit", value: 0 }), small: 1, large: 2 };
const row = (places: number, ms: number | undefined, bytes: number | undefined): GrowthRow => ({ shape: "s", levels: places, places, ms, bytes });

describe("COMPILE.GROWTH", () => {
  it.each(GROWTH_SHAPES.map((s) => [s.name, s] as const))("COMPILE.GROWTH: the sizes of %s are legal, and they print", (_name, shape) => {
    const large = JSON.parse(JSON.stringify(shape.make(shape.large))) as ReturnType<GrowthShape["make"]>;
    expect(nestingOf(large)).toBeLessThanOrEqual(MAX_NESTING);
    expect(placesOf([large])).toBeLessThanOrEqual(MAX_PLACES);
    expect(emitModule(large, OPTIONS).ok).toBe(true);
    expect(placesOf([shape.make(shape.small)])).toBeLessThan(placesOf([large]));
  });

  it("COMPILE.GROWTH: a shape with a limit of its own states the reason", () => {
    expect(GROWTH_SHAPES.filter((s) => (s.time !== undefined || s.bytes !== undefined) && s.why === undefined)).toStrictEqual([]);
  });

  it("COMPILE.GROWTH: the exponent is 1 for a linear growth and 2 for a quadratic growth", () => {
    expect(exponent(10, 40, 100, 400)).toBeCloseTo(1);
    expect(exponent(10, 160, 100, 400)).toBeCloseTo(2);
  });

  it("COMPILE.GROWTH: a linear shape has no fault, and a quadratic shape fails on its time and on its bytes", () => {
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, 4000))).toStrictEqual([]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 160, 4000))).toStrictEqual([`s has a time exponent of 2.00, and the limit is ${String(TIME_LIMIT)}`]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, 16_000))).toStrictEqual([`s has a bytes exponent of 2.00, and the limit is ${String(BYTES_LIMIT)}`]);
  });

  it("COMPILE.GROWTH: a limit of a shape replaces the limit of the gate, and a value at the limit passes", () => {
    const own: GrowthShape = { ...SHAPE, time: 2, bytes: 2, why: "a reason" };
    expect(growthFaults(own, row(100, 10, 1000), row(400, 160, 16_000))).toStrictEqual([]);
    expect(growthFaults(own, row(100, 10, 1000), row(400, 170, 16_000))).toStrictEqual(["s has a time exponent of 2.04, and the limit is 2"]);
  });

  it("COMPILE.GROWTH: a size with no result is a fault", () => {
    expect(growthFaults(SHAPE, row(100, undefined, 1000), row(400, 40, 4000))).toStrictEqual(["s has a size with no result"]);
    expect(growthFaults(SHAPE, row(100, 10, 1000), row(400, 40, undefined))).toStrictEqual(["s has a size with no result"]);
    expect(exponentsOf(row(100, 10, undefined), row(400, 40, 4000))).toBeUndefined();
  });
});

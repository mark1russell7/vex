/**
 * The tests of `QuantityDomain`: amounts in units as plain data. Each test names the requirement that it covers.
 */
import { app, each, evaluate, axes, lit, ref, space, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { QuantityDomain, isQuantityValue, type Quantity } from "./quantity.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";
import { JsonDomain } from "./json.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, QuantityDomain, JsonDomain];
const q = (amount: number, unit: string): Quantity => ({ value: amount, unit });

/** This function gives the result of a program over one record. */
function run(e: Expr, record: unknown): { readonly ok: boolean; readonly value?: unknown; readonly error?: { readonly code: string; readonly thrown?: unknown } } {
  return evaluate(e, { space: space.array([record]), origin: "0", domains: DOMAINS });
}

/** This function gives the value of a program over one record, or it throws with the error. */
function value(e: Expr, record: unknown): unknown {
  const r = run(e, record);
  if (!r.ok) throw new Error(r.error?.code ?? "no code");
  return r.value;
}

const a = ref("a");
const b = ref("b");

describe("the value of QuantityDomain (QTY.VALUE)", () => {
  it("accepts a plain object with a number and a canonical unit", () => {
    expect(isQuantityValue(q(155, "mm"))).toBe(true);
    expect(isQuantityValue(Object.assign(Object.create(null) as object, { value: 2, unit: "h" }))).toBe(true);
  });

  it("refuses another spelling of a unit, a missing or extra field, and a class", () => {
    expect(isQuantityValue(q(2, "hr"))).toBe(false);
    expect(isQuantityValue(q(2, "furlong-per-blip"))).toBe(false);
    expect(isQuantityValue({ value: "2", unit: "m" })).toBe(false);
    expect(isQuantityValue({ value: 2 })).toBe(false);
    expect(isQuantityValue({ value: 2, unit: "m", note: "x" })).toBe(false);
    expect(isQuantityValue(new (class { value = 2; unit = "m"; })())).toBe(false);
    expect(isQuantityValue(2)).toBe(false);
  });

  it("is not valid with a value that is not finite (QTY.FINITE)", () => {
    expect(QuantityDomain.valid?.(q(Number.NaN, "m"))).toBe(false);
    expect(QuantityDomain.valid?.(q(Number.POSITIVE_INFINITY, "m"))).toBe(false);
    expect(QuantityDomain.valid?.(q(-3, "m"))).toBe(true);
  });

  it("decodes another spelling of a unit to its canonical spelling, and encodes plain data", () => {
    expect(QuantityDomain.decode?.({ value: 2, unit: "hr" })).toEqual(q(2, "h"));
    expect(QuantityDomain.encode?.(q(2, "h"))).toEqual({ value: 2, unit: "h" });
    expect(() => QuantityDomain.decode?.({ value: 2, unit: "no-such-unit" })).toThrow("unknown unit no-such-unit");
    expect(() => QuantityDomain.decode?.({ value: "2", unit: "m" })).toThrow(TypeError);
    expect(QuantityDomain.show?.(q(155, "mm"))).toBe("155 mm");
  });

  it("comes before JsonDomain, which accepts the same objects", () => {
    expect(value(app("unit", a), { a: q(16, "cm") })).toBe("cm");
    expect(value(app("value", a), { a: q(16, "cm") })).toBe(16);
    expect(value(app("kind", a), { a: q(16, "cm") })).toBe("length");
  });
});

describe("the comparisons of QuantityDomain (QTY.COMPARE)", () => {
  it("compares two amounts of one kind in different units, exactly", () => {
    const r = { a: q(155, "mm"), b: q(16, "cm") };
    expect(value(app("lte", a, b), r)).toBe(true);
    expect(value(app("lt", a, b), r)).toBe(true);
    expect(value(app("gt", a, b), r)).toBe(false);
    expect(value(app("gte", a, b), r)).toBe(false);
    expect(value(app("compare", a, b), r)).toBe(-1);
    expect(value(app("eq", a, b), { a: q(1, "m"), b: q(100, "cm") })).toBe(true);
    expect(value(app("eq", a, b), { a: q(0.3, "m"), b: q(30, "cm") })).toBe(true);
  });

  it("gives #CALC! with the reason for two amounts of different kinds (QTY.KIND)", () => {
    const r = run(app("lte", a, b), { a: q(155, "mm"), b: q(2, "kg") });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("#CALC!");
    expect(String(r.error?.thrown)).toContain("cannot compare mm with kg");
  });

  it("gives min and max in the unit of the receiver", () => {
    const r = { a: q(155, "mm"), b: q(16, "cm") };
    expect(value(app("min", a, b), r)).toEqual(q(155, "mm"));
    expect(value(app("max", a, b), r)).toEqual(q(160, "mm"));
    expect(value(app("max", b, a), r)).toEqual(q(16, "cm"));
  });
});

describe("the arithmetic of QuantityDomain (QTY.ARITH)", () => {
  it("adds and subtracts in the unit of the receiver, exactly for decimal inputs", () => {
    expect(value(app("add", a, b), { a: q(155, "mm"), b: q(16, "cm") })).toEqual(q(315, "mm"));
    expect(value(app("add", a, b), { a: q(0.1, "m"), b: q(0.2, "m") })).toEqual(q(0.3, "m"));
    expect(value(app("subtract", a, b), { a: q(1, "h"), b: q(15, "min") })).toEqual(q(0.75, "h"));
  });

  it("gives #CALC! for a sum of different kinds, and #VALUE! for a number argument", () => {
    expect(run(app("add", a, b), { a: q(1, "m"), b: q(1, "kg") }).error?.code).toBe("#CALC!");
    expect(run(app("add", a, lit(1)), { a: q(1, "m") }).error?.code).toBe("#VALUE!");
  });

  it("multiplies and divides by a number, and a division by 0 gives #NUM!", () => {
    expect(value(app("multiply", a, lit(4)), { a: q(65, "W") })).toEqual(q(260, "W"));
    expect(value(app("divide", a, lit(4)), { a: q(260, "W") })).toEqual(q(65, "W"));
    expect(run(app("divide", a, lit(0)), { a: q(260, "W") }).error?.code).toBe("#NUM!");
  });

  it("gives the ratio of two amounts of one kind as a number", () => {
    expect(value(app("ratio", a, b), { a: q(1, "m"), b: q(25, "cm") })).toBe(4);
    expect(run(app("ratio", a, b), { a: q(1, "m"), b: q(0, "cm") }).error?.code).toBe("#NUM!");
    expect(run(app("ratio", a, b), { a: q(1, "m"), b: q(1, "s") }).error?.code).toBe("#CALC!");
  });

  it("negates and gives the size of an amount", () => {
    expect(value(app("negate", a), { a: q(3, "W") })).toEqual(q(-3, "W"));
    expect(value(app("abs", a), { a: q(-3, "W") })).toEqual(q(3, "W"));
  });

  it("reduces a list of amounts with add, in the unit of the first item", () => {
    const parts = space.array([{ w: q(65, "W") }, { w: q(0.1, "kW") }, { w: q(35, "W") }]);
    const total = app("reduce", each(axes.all, ref("w")), lit("add"));
    expect(evaluate(total, { space: parts, origin: "0", domains: DOMAINS })).toEqual({ ok: true, value: q(200, "W") });
  });
});

describe("the conversions of QuantityDomain (QTY.CONVERT)", () => {
  it("converts to another unit of the same kind, and reads the number in a unit", () => {
    expect(value(app("convert", a, lit("cm")), { a: q(155, "mm") })).toEqual(q(15.5, "cm"));
    expect(value(app("convert", a, lit("hr")), { a: q(90, "min") })).toEqual(q(1.5, "h"));
    expect(value(app("valueIn", a, lit("min")), { a: q(2, "h") })).toBe(120);
  });

  it("gives #CALC! for a unit of another kind, or a unit that does not exist", () => {
    expect(run(app("convert", a, lit("kg")), { a: q(155, "mm") }).error?.code).toBe("#CALC!");
    expect(run(app("valueIn", a, lit("no-such-unit")), { a: q(155, "mm") }).error?.code).toBe("#CALC!");
  });
});

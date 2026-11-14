/**
 * The domain of amounts in units: the entry `@mark1russell7/vex-domains/quantity`. A value is a quantity of
 * `@mark1russell7/quantity`, as plain data: `{ value: 155, unit: "mm" }`. That package does the unit arithmetic. It
 * converts each amount exactly, so 155 mm and 16 cm compare without a rounding of doubles.
 */
import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";
import {
  add,
  canonicalUnit,
  compare,
  convert,
  convertExact,
  isCanonicalUnit,
  kindOfQuantity,
  max,
  min,
  rationals,
  scale,
  sub,
  valueIn,
  type Quantity,
} from "@mark1russell7/quantity";

export type { Quantity } from "@mark1russell7/quantity";

type QFn2 = (a: Quantity, b: Quantity) => Quantity;
type QTest = (a: Quantity, b: Quantity) => boolean;

/** The ops of `QuantityDomain`. */
export type QuantityOps = {
  readonly value: FnOp<Quantity, (a: Quantity) => number>;
  readonly unit: FnOp<Quantity, (a: Quantity) => string>;
  readonly kind: FnOp<Quantity, (a: Quantity) => string>;
  readonly convert: FnOp<Quantity, (a: Quantity, unit: string) => Quantity>;
  readonly valueIn: FnOp<Quantity, (a: Quantity, unit: string) => number>;
  readonly add: FnOp<Quantity, QFn2>;
  readonly subtract: FnOp<Quantity, QFn2>;
  readonly multiply: FnOp<Quantity, (a: Quantity, k: number) => Quantity>;
  readonly divide: FnOp<Quantity, (a: Quantity, k: number) => Quantity>;
  readonly ratio: FnOp<Quantity, (a: Quantity, b: Quantity) => number>;
  readonly negate: FnOp<Quantity, (a: Quantity) => Quantity>;
  readonly abs: FnOp<Quantity, (a: Quantity) => Quantity>;
  readonly min: FnOp<Quantity, QFn2>;
  readonly max: FnOp<Quantity, QFn2>;
  readonly compare: FnOp<Quantity, (a: Quantity, b: Quantity) => number>;
  readonly lt: FnOp<Quantity, QTest>;
  readonly lte: FnOp<Quantity, QTest>;
  readonly gt: FnOp<Quantity, QTest>;
  readonly gte: FnOp<Quantity, QTest>;
  readonly eq: FnOp<Quantity, QTest>;
};

/** This function tells if a value is a plain object: its prototype is `Object.prototype` or `null`. */
const plain = (u: unknown): u is { readonly value?: unknown; readonly unit?: unknown } =>
  typeof u === "object" && u !== null && [Object.prototype, null].includes(Object.getPrototypeOf(u) as object | null);

/**
 * This function tells if a value is a quantity of the domain. A quantity is a plain object with only the fields `value`
 * and `unit`. Its value is a number, and its unit is canonical. The check `valid` of the domain refuses a number that
 * is not finite.
 */
export const isQuantityValue = (u: unknown): u is Quantity =>
  plain(u) && Object.keys(u).length === 2 && typeof u.value === "number" && typeof u.unit === "string" && isCanonicalUnit(u.unit);

/** This function gives the ratio a / b of two amounts of one kind, exactly. Each amount is in its own unit. */
const ratioOf = (a: Quantity, b: Quantity): number =>
  rationals.toNumber(rationals.div(convertExact(rationals.fromNumber(a.value), a.unit, b.unit), rationals.fromNumber(b.value)));

/**
 * The domain of amounts in units. Each op does its unit arithmetic with `@mark1russell7/quantity`.
 *
 * - `add`, `subtract`, `min` and `max` give the result in the unit of the receiver. They convert the argument exactly.
 * - The comparisons convert exactly too. Thus `lte` of 155 mm and 16 cm is `true`.
 * - Two amounts of different kinds, for example a length and a mass, give an error value with the reason.
 * - `multiply` and `divide` take a number. `ratio` divides two amounts of one kind, and it gives a number.
 * - No op lifts a number: a number has no unit.
 * - A value that is not finite is not valid, so an op that gives one gives `#NUM!`.
 *
 * Put `QuantityDomain` before `NumRecordDomain` and `JsonDomain`, because they accept the same objects.
 */
export const QuantityDomain: Domain<"Quantity", Quantity, QuantityOps> = defineDomain<"Quantity", Quantity, QuantityOps>({
  name: "Quantity",
  // LOOP.SIZE.OPS: an op keeps the unit of its receiver, or it takes the unit of its argument.
  size: "fixed",
  fields: ["value", "unit"],
  is: isQuantityValue,
  valid: (a: Quantity): boolean => Number.isFinite(a.value) && isCanonicalUnit(a.unit),
  show: (a: Quantity): string => `${String(a.value)} ${a.unit}`,
  encode: (a: Quantity): unknown => ({ value: a.value, unit: a.unit }),
  // A value from JSON can spell its unit in another way, for example "hr". The domain keeps the canonical spelling. A
  // unit that does not exist throws a UnitError, and the reader of the document gives #CALC!.
  decode: (u: unknown): Quantity => {
    if (!plain(u) || typeof u.value !== "number" || typeof u.unit !== "string") throw new TypeError("a quantity is { value: number, unit: string }");
    return { value: u.value, unit: canonicalUnit(u.unit) };
  },
  samples: (): readonly Quantity[] => [
    { value: 155, unit: "mm" },
    { value: 16, unit: "cm" },
    { value: 2.5, unit: "kg" },
  ],
  ops: {
    value: { fn: (a: Quantity): number => a.value, params: [], returns: "number" },
    unit: { fn: (a: Quantity): string => a.unit, params: [], returns: "string" },
    kind: { fn: (a: Quantity): string => kindOfQuantity(a), params: [], returns: "string" },
    convert: { fn: (a: Quantity, unit: string): Quantity => convert(a, unit), params: ["string"], returns: "domain" },
    valueIn: { fn: (a: Quantity, unit: string): number => valueIn(a, unit), params: ["string"], returns: "number" },
    add: { fn: (a: Quantity, b: Quantity): Quantity => add(a, b), params: ["domain"], returns: "domain" },
    subtract: { fn: (a: Quantity, b: Quantity): Quantity => sub(a, b), params: ["domain"], returns: "domain" },
    multiply: { fn: (a: Quantity, k: number): Quantity => scale(a, k), params: ["number"], returns: "domain" },
    // A division by 0 gives a value that is not finite, so the check of the result gives #NUM!.
    divide: { fn: (a: Quantity, k: number): Quantity => ({ value: a.value / k, unit: a.unit }), params: ["number"], returns: "domain" },
    ratio: { fn: (a: Quantity, b: Quantity): number => (b.value === 0 ? Number.NaN : ratioOf(a, b)), params: ["domain"], returns: "number" },
    negate: { fn: (a: Quantity): Quantity => ({ value: -a.value, unit: a.unit }), params: [], returns: "domain" },
    abs: { fn: (a: Quantity): Quantity => ({ value: Math.abs(a.value), unit: a.unit }), params: [], returns: "domain" },
    min: { fn: (a: Quantity, b: Quantity): Quantity => convert(min(a, b), a.unit), params: ["domain"], returns: "domain" },
    max: { fn: (a: Quantity, b: Quantity): Quantity => convert(max(a, b), a.unit), params: ["domain"], returns: "domain" },
    compare: { fn: (a: Quantity, b: Quantity): number => compare(a, b), params: ["domain"], returns: "number" },
    lt: { fn: (a: Quantity, b: Quantity): boolean => compare(a, b) < 0, params: ["domain"], returns: "boolean" },
    lte: { fn: (a: Quantity, b: Quantity): boolean => compare(a, b) <= 0, params: ["domain"], returns: "boolean" },
    gt: { fn: (a: Quantity, b: Quantity): boolean => compare(a, b) > 0, params: ["domain"], returns: "boolean" },
    gte: { fn: (a: Quantity, b: Quantity): boolean => compare(a, b) >= 0, params: ["domain"], returns: "boolean" },
    eq: { fn: (a: Quantity, b: Quantity): boolean => compare(a, b) === 0, params: ["domain"], returns: "boolean" },
  },
});

import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";
import { LocalDate } from "./date.ts";
import { Vec2 } from "./vec2.ts";
import type { XY } from "./xy.ts";

type NumFn1 = (a: number) => number;
type NumFn2 = (a: number, b: number) => number;
type NumFn3 = (a: number, b: number, c: number) => number;
type NumTest = (a: number, b: number) => boolean;

/** The ops of `NumDomain`. */
export type NumOps = {
  readonly add: FnOp<number, NumFn2>;
  readonly subtract: FnOp<number, NumFn2>;
  readonly multiply: FnOp<number, NumFn2>;
  readonly divide: FnOp<number, NumFn2>;
  readonly mod: FnOp<number, NumFn2>;
  readonly pow: FnOp<number, NumFn2>;
  readonly min: FnOp<number, NumFn2>;
  readonly max: FnOp<number, NumFn2>;
  readonly clamp: FnOp<number, NumFn3>;
  readonly abs: FnOp<number, NumFn1>;
  readonly negate: FnOp<number, NumFn1>;
  readonly sign: FnOp<number, NumFn1>;
  readonly sqrt: FnOp<number, NumFn1>;
  readonly ln: FnOp<number, NumFn1>;
  readonly exp: FnOp<number, NumFn1>;
  readonly log10: FnOp<number, NumFn1>;
  readonly sin: FnOp<number, NumFn1>;
  readonly cos: FnOp<number, NumFn1>;
  readonly asin: FnOp<number, NumFn1>;
  readonly hypot: FnOp<number, NumFn2>;
  readonly date: FnOp<number, (year: number, month: number, day: number) => LocalDate>;
  readonly vec2: FnOp<number, (x: number, y: number) => Vec2>;
  readonly xy: FnOp<number, (x: number, y: number) => XY>;
  readonly floor: FnOp<number, NumFn1>;
  readonly ceil: FnOp<number, NumFn1>;
  readonly round: FnOp<number, NumFn1>;
  readonly gt: FnOp<number, NumTest>;
  readonly gte: FnOp<number, NumTest>;
  readonly lt: FnOp<number, NumTest>;
  readonly lte: FnOp<number, NumTest>;
  readonly eq: FnOp<number, NumTest>;
};

/** The domain of numbers. A result that is not a finite number is the error `#NUM!`. */
export const NumDomain: Domain<"Num", number, NumOps> = defineDomain<"Num", number, NumOps>({
  // COMPILE.MODULE.FORM: a vector in a module is plain data, so `vec2` needs no class there.
  moduleForm: { ops: { vec2: { fn: (x: number, y: number): { readonly x: number; readonly y: number } => ({ x, y }), returns: "domain:Vec2" } } },
  name: "Num",
  // LOOP.SIZE.OPS: each value has a fixed size, so each op has a size rule.
  size: "fixed",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  valid: (n: number): boolean => Number.isFinite(n),
  show: (n: number): string => String(n),
  ops: {
    add: { fn: (a: number, b: number): number => a + b, laws: ["commutative", "associative"], identity: (): number => 0, params: ["number"], returns: "number", monotone: ["up", "up"] },
    subtract: { fn: (a: number, b: number): number => a - b, params: ["number"], returns: "number", monotone: ["up", "down"] },
    multiply: { fn: (a: number, b: number): number => a * b, laws: ["commutative", "associative"], identity: (): number => 1, params: ["number"], returns: "number" },
    divide: { fn: (a: number, b: number): number => a / b, params: ["number"], returns: "number" },
    mod: { fn: (a: number, b: number): number => a % b, params: ["number"], returns: "number" },
    pow: { fn: (a: number, b: number): number => a ** b, params: ["number"], returns: "number" },
    min: { fn: (a: number, b: number): number => Math.min(a, b), laws: ["commutative", "associative", "idempotent"], params: ["number"], returns: "number", monotone: ["up", "up"] },
    max: { fn: (a: number, b: number): number => Math.max(a, b), laws: ["commutative", "associative", "idempotent"], params: ["number"], returns: "number", monotone: ["up", "up"] },
    clamp: { fn: (a: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, a)), params: ["number", "number"], returns: "number", monotone: ["up", "up", "up"] },
    abs: { fn: (a: number): number => Math.abs(a), returns: "number" },
    negate: { fn: (a: number): number => -a, returns: "number", monotone: ["down"] },
    // NUM.SIGN: the check of the result turns NaN into #NUM!, and an infinite number has a sign.
    sign: { fn: (a: number): number => Math.sign(a), returns: "number", monotone: ["up"] },
    sqrt: { fn: (a: number): number => Math.sqrt(a), returns: "number" },
    ln: { fn: (a: number): number => Math.log(a), returns: "number" },
    exp: { fn: (a: number): number => Math.exp(a), returns: "number" },
    log10: { fn: (a: number): number => Math.log10(a), returns: "number" },
    // The angles of sin, cos and asin are in radians.
    sin: { fn: (a: number): number => Math.sin(a), returns: "number" },
    cos: { fn: (a: number): number => Math.cos(a), returns: "number" },
    asin: { fn: (a: number): number => Math.asin(a), returns: "number" },
    hypot: { fn: (a: number, b: number): number => Math.hypot(a, b), laws: ["commutative"], params: ["number"], returns: "number" },
    // The year is the receiver: date(year, month, day). The result is a LocalDate, so a chain continues in DateDomain.
    date: { fn: (year: number, month: number, day: number): LocalDate => LocalDate.of(year, month, day), params: ["number", "number"] },
    // The x component is the receiver: vec2(x, y). The result is a Vec2, so a chain continues in Vec2Domain.
    vec2: { fn: (x: number, y: number): Vec2 => new Vec2(x, y), params: ["number"] },
    // The same as plain data, for a standalone module: xy(x, y). The result is a value of XYDomain.
    xy: { fn: (x: number, y: number): XY => ({ x, y }), params: ["number"], returns: "domain:XY" },
    floor: { fn: (a: number): number => Math.floor(a), returns: "number", monotone: ["up"] },
    ceil: { fn: (a: number): number => Math.ceil(a), returns: "number", monotone: ["up"] },
    round: { fn: (a: number): number => Math.round(a), returns: "number", monotone: ["up"] },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"], returns: "boolean" },
    gte: { fn: (a: number, b: number): boolean => a >= b, params: ["number"], returns: "boolean" },
    lt: { fn: (a: number, b: number): boolean => a < b, params: ["number"], returns: "boolean" },
    lte: { fn: (a: number, b: number): boolean => a <= b, params: ["number"], returns: "boolean" },
    eq: { fn: (a: number, b: number): boolean => a === b, laws: ["commutative"], params: ["number"], returns: "boolean" },
  },
});

type BoolFn1 = (a: boolean) => boolean;
type BoolFn2 = (a: boolean, b: boolean) => boolean;

/** The ops of `BoolDomain`. */
export type BoolOps = {
  readonly and: FnOp<boolean, BoolFn2>;
  readonly or: FnOp<boolean, BoolFn2>;
  readonly xor: FnOp<boolean, BoolFn2>;
  readonly not: FnOp<boolean, BoolFn1>;
  readonly eq: FnOp<boolean, BoolFn2>;
};

/** The domain of booleans. For lazy logic, use the special forms `and`, `or` and `if` of the IR. */
export const BoolDomain: Domain<"Bool", boolean, BoolOps> = defineDomain<"Bool", boolean, BoolOps>({
  name: "Bool",
  // LOOP.SIZE.OPS: each value has a fixed size, so each op has a size rule.
  size: "fixed",
  is: (u: unknown): u is boolean => typeof u === "boolean",
  primitive: "boolean",
  show: (b: boolean): string => String(b),
  ops: {
    and: { fn: (a: boolean, b: boolean): boolean => a && b, laws: ["commutative", "associative", "idempotent"], identity: (): boolean => true, params: ["boolean"], returns: "boolean", monotone: ["up", "up"] },
    or: { fn: (a: boolean, b: boolean): boolean => a || b, laws: ["commutative", "associative", "idempotent"], identity: (): boolean => false, params: ["boolean"], returns: "boolean", monotone: ["up", "up"] },
    xor: { fn: (a: boolean, b: boolean): boolean => a !== b, laws: ["commutative", "associative"], identity: (): boolean => false, params: ["boolean"], returns: "boolean" },
    not: { fn: (a: boolean): boolean => !a, returns: "boolean", monotone: ["down"] },
    eq: { fn: (a: boolean, b: boolean): boolean => a === b, laws: ["commutative"], params: ["boolean"], returns: "boolean" },
  },
});

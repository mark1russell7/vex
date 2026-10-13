import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";
import { LocalDate } from "./date.ts";

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
  readonly sqrt: FnOp<number, NumFn1>;
  readonly ln: FnOp<number, NumFn1>;
  readonly exp: FnOp<number, NumFn1>;
  readonly log10: FnOp<number, NumFn1>;
  readonly date: FnOp<number, (year: number, month: number, day: number) => LocalDate>;
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
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  valid: (n: number): boolean => Number.isFinite(n),
  show: (n: number): string => String(n),
  ops: {
    add: { fn: (a: number, b: number): number => a + b, laws: ["commutative", "associative"], identity: (): number => 0, params: ["number"] },
    subtract: { fn: (a: number, b: number): number => a - b, params: ["number"] },
    multiply: { fn: (a: number, b: number): number => a * b, laws: ["commutative", "associative"], identity: (): number => 1, params: ["number"] },
    divide: { fn: (a: number, b: number): number => a / b, params: ["number"] },
    mod: { fn: (a: number, b: number): number => a % b, params: ["number"] },
    pow: { fn: (a: number, b: number): number => a ** b, params: ["number"] },
    min: { fn: (a: number, b: number): number => Math.min(a, b), laws: ["commutative", "associative", "idempotent"], params: ["number"] },
    max: { fn: (a: number, b: number): number => Math.max(a, b), laws: ["commutative", "associative", "idempotent"], params: ["number"] },
    clamp: { fn: (a: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, a)), params: ["number", "number"] },
    abs: { fn: (a: number): number => Math.abs(a) },
    negate: { fn: (a: number): number => -a },
    sqrt: { fn: (a: number): number => Math.sqrt(a) },
    ln: { fn: (a: number): number => Math.log(a) },
    exp: { fn: (a: number): number => Math.exp(a) },
    log10: { fn: (a: number): number => Math.log10(a) },
    // The year is the receiver: date(year, month, day). The result is a LocalDate, so a chain continues in DateDomain.
    date: { fn: (year: number, month: number, day: number): LocalDate => LocalDate.of(year, month, day), params: ["number", "number"] },
    floor: { fn: (a: number): number => Math.floor(a) },
    ceil: { fn: (a: number): number => Math.ceil(a) },
    round: { fn: (a: number): number => Math.round(a) },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"] },
    gte: { fn: (a: number, b: number): boolean => a >= b, params: ["number"] },
    lt: { fn: (a: number, b: number): boolean => a < b, params: ["number"] },
    lte: { fn: (a: number, b: number): boolean => a <= b, params: ["number"] },
    eq: { fn: (a: number, b: number): boolean => a === b, laws: ["commutative"], params: ["number"] },
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
  is: (u: unknown): u is boolean => typeof u === "boolean",
  show: (b: boolean): string => String(b),
  ops: {
    and: { fn: (a: boolean, b: boolean): boolean => a && b, laws: ["commutative", "associative", "idempotent"], identity: (): boolean => true, params: ["boolean"] },
    or: { fn: (a: boolean, b: boolean): boolean => a || b, laws: ["commutative", "associative", "idempotent"], identity: (): boolean => false, params: ["boolean"] },
    xor: { fn: (a: boolean, b: boolean): boolean => a !== b, laws: ["commutative", "associative"], identity: (): boolean => false, params: ["boolean"] },
    not: { fn: (a: boolean): boolean => !a },
    eq: { fn: (a: boolean, b: boolean): boolean => a === b, laws: ["commutative"], params: ["boolean"] },
  },
});

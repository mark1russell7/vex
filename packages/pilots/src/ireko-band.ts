/**
 * The bands of ireko as a Vex domain (docs/COMPILER.md §8.2). The tidy strategies of ireko read the shape of each
 * subtree: a list of bands on each axis. A band tells that between `from` and `to` on one axis, the subtree is between
 * `min` and `max` on the other axis.
 *
 * `BandDomain` has the band ops of the shapes code of ireko. Each op is a function of plain data that reads no name
 * outside itself. Thus a standalone module of `@mark1russell7/vex-compiler` copies the ops, and the generated modules of
 * ireko need no import of Vex. `BandNumDomain` has the op `band`, which makes a band from four numbers.
 */
import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";

/** One band of a shape of ireko, as plain data. It has the four number fields of the type `Band` of ireko. */
export interface Band {
  readonly from: number;
  readonly to: number;
  readonly min: number;
  readonly max: number;
}

type BandNum = (a: Band) => number;
type BandFn2 = (a: Band, b: Band) => Band;

/** The ops of `BandDomain`. */
export type BandOps = {
  readonly from: FnOp<Band, BandNum>;
  readonly to: FnOp<Band, BandNum>;
  readonly min: FnOp<Band, BandNum>;
  readonly max: FnOp<Band, BandNum>;
  readonly move: FnOp<Band, (a: Band, along: number, across: number) => Band>;
  readonly flip: FnOp<Band, (a: Band) => Band>;
  readonly join: FnOp<Band, BandFn2>;
  readonly overlaps: FnOp<Band, (a: Band, b: Band) => boolean>;
};

/**
 * The domain of the bands of ireko: an object with the four number fields `from`, `to`, `min` and `max` and no other
 * field. The op `band` of `BandNumDomain` makes one. A band is valid when its four fields are finite.
 *
 * The ops are the operations of the shapes code of ireko on one band or on two bands:
 *
 * - `from`, `to`, `min` and `max` give the fields.
 * - `move(b, along, across)` adds `along` to `from` and `to`, and `across` to `min` and `max`.
 * - `flip(b)` mirrors the band on the axis of the row: `min` becomes `-max`, and `max` becomes `-min`.
 * - `join(a, b)` gives the smallest band that covers both bands.
 * - `overlaps(a, b)` tells if the intervals from `from` to `to` of the two bands overlap.
 *
 * Put `NumDomain` and `BoolDomain` before `BandDomain`. Then each site of an op of a number or a boolean is static in a
 * module.
 */
export const BandDomain: Domain<"Band", Band, BandOps> = defineDomain<"Band", Band, BandOps>({
  name: "Band",
  // A plain object: its prototype is Object.prototype or null, and it has only the four number fields.
  is: (u: unknown): u is Band =>
    typeof u === "object" &&
    u !== null &&
    [Object.prototype, null].includes(Object.getPrototypeOf(u) as object | null) &&
    Object.keys(u).length === 4 &&
    typeof (u as Band).from === "number" &&
    typeof (u as Band).to === "number" &&
    typeof (u as Band).min === "number" &&
    typeof (u as Band).max === "number",
  valid: (b: Band): boolean => Number.isFinite(b.from) && Number.isFinite(b.to) && Number.isFinite(b.min) && Number.isFinite(b.max),
  show: (b: Band): string => `[${b.from}, ${b.to}] at [${b.min}, ${b.max}]`,
  // An empty band, a band of one box, a band with negative fields and a band of zero width.
  samples: (): readonly Band[] => [
    { from: 0, to: 0, min: 0, max: 0 },
    { from: 0, to: 40, min: 0, max: 120 },
    { from: -2.5, to: 3, min: -7, max: -1 },
    { from: 10, to: 30, min: 5, max: 5 },
  ],
  ops: {
    from: { fn: (a: Band): number => a.from, params: [], returns: "number" },
    to: { fn: (a: Band): number => a.to, params: [], returns: "number" },
    min: { fn: (a: Band): number => a.min, params: [], returns: "number" },
    max: { fn: (a: Band): number => a.max, params: [], returns: "number" },
    move: { fn: (a: Band, along: number, across: number): Band => ({ from: a.from + along, to: a.to + along, min: a.min + across, max: a.max + across }), params: ["number", "number"], returns: "domain" },
    flip: { fn: (a: Band): Band => ({ from: a.from, to: a.to, min: -a.max, max: -a.min }), params: [], returns: "domain" },
    join: {
      fn: (a: Band, b: Band): Band => ({ from: Math.min(a.from, b.from), to: Math.max(a.to, b.to), min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) }),
      laws: ["commutative", "associative", "idempotent"],
      params: ["domain"],
      returns: "domain",
    },
    overlaps: { fn: (a: Band, b: Band): boolean => a.from < b.to && b.from < a.to, laws: ["commutative"], params: ["domain"], returns: "boolean" },
  },
});

/** The ops of `BandNumDomain`. */
export type BandNumOps = {
  readonly band: FnOp<number, (from: number, to: number, min: number, max: number) => Band>;
};

/**
 * The numbers of the band pilot. This domain has only the op `band(from, to, min, max)`, which gives a value of
 * `BandDomain`. Put it after `NumDomain`: the other ops of a number stay the ops of `NumDomain`.
 */
export const BandNumDomain: Domain<"BandNum", number, BandNumOps> = defineDomain<"BandNum", number, BandNumOps>({
  name: "BandNum",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  ops: {
    band: { fn: (from: number, to: number, min: number, max: number): Band => ({ from, to, min, max }), params: ["number", "number", "number"], returns: "domain:Band" },
  },
});

/**
 * The domains of a program over bands. `NumDomain` and `BoolDomain` come before `BandDomain`, so each op site of a
 * number, a boolean or a band is static in a module.
 */
export const BAND_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain, typeof BandNumDomain, typeof BandDomain] = [NumDomain, BoolDomain, BandNumDomain, BandDomain];

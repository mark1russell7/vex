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
type BandTest = (a: Band) => boolean;
type BandTest2 = (a: Band, b: Band) => boolean;

/** The ops of `BandDomain`. */
export type BandOps = {
  readonly from: FnOp<Band, BandNum>;
  readonly to: FnOp<Band, BandNum>;
  readonly min: FnOp<Band, BandNum>;
  readonly max: FnOp<Band, BandNum>;
  readonly move: FnOp<Band, (a: Band, along: number, across: number) => Band>;
  readonly flip: FnOp<Band, (a: Band) => Band>;
  readonly join: FnOp<Band, BandFn2>;
  readonly overlaps: FnOp<Band, BandTest2>;
  readonly sized: FnOp<Band, BandTest>;
  readonly end: FnOp<Band, (a: Band) => Band>;
  readonly side: FnOp<Band, BandNum>;
  readonly aligned: FnOp<Band, BandTest2>;
  readonly outlasts: FnOp<Band, BandTest2>;
  readonly widen: FnOp<Band, BandFn2>;
  readonly cut: FnOp<Band, (c: Band, a: Band, b: Band) => Band>;
  readonly continues: FnOp<Band, BandTest2>;
  readonly extend: FnOp<Band, BandFn2>;
};

/**
 * The domain of the bands of ireko: an object with the four number fields `from`, `to`, `min` and `max` and no other
 * field. The op `band` of `BandNumDomain` makes one. A band is valid when no field is `NaN`.
 *
 * A field can be `Infinity` or `-Infinity`: ireko keeps an infinite end on a band that overflows. An op that gives such
 * a band gives a valid value. An op that gives an infinite field as a number gives `#NUM!` (CALL.RESULT). Thus a program
 * compares the ends of such bands only with the ops of this domain.
 *
 * The ops are the operations of the shapes code of ireko on one band or on two bands:
 *
 * - `from`, `to`, `min` and `max` give the fields.
 * - `move(b, along, across)` adds `along` to `from` and `to`, and `across` to `min` and `max`.
 * - `flip(b)` mirrors the band on the axis of the row: `min` becomes `-max`, and `max` becomes `-min`.
 * - `join(a, b)` gives the smallest band that covers both bands.
 * - `overlaps(a, b)` tells if the intervals from `from` to `to` of the two bands overlap.
 *
 * The other ops are the steps of the sweep of `mergeBands` of ireko. They compare the ends inside the op, so the
 * program gets no infinite end as a number:
 *
 * - `sized(b)` tells if the band has a size on each axis: `to > from` and `max >= min`.
 * - `end(b)` gives the band from `to` to `to`, with `min` and `max` 0: the end event of the band.
 * - `side(b)` gives -1 for a `from` of `-Infinity`, 1 for a `from` of `Infinity` and 0 for a finite `from`.
 * - `aligned(a, b)` tells if the two bands start at the same position.
 * - `outlasts(a, b)` tells if the band `a` ends after the start of the band `b`.
 * - `widen(a, b)` gives `a` with the lower `min` and the higher `max` of the two bands. It keeps the field of `a` for two
 *   equal values, as the comparisons of ireko do.
 * - `cut(c, a, b)` gives the band from the start of `a` to the start of `b`, with `min` and `max` of `c`.
 * - `continues(a, b)` tells if the band `b` starts at the end of `a` with the same `min` and `max`.
 * - `extend(a, b)` gives `a` with the end of `b`.
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
  // An infinite field is valid, and NaN is not.
  valid: (b: Band): boolean => !Number.isNaN(b.from) && !Number.isNaN(b.to) && !Number.isNaN(b.min) && !Number.isNaN(b.max),
  show: (b: Band): string => `[${b.from}, ${b.to}] at [${b.min}, ${b.max}]`,
  // An empty band, a band of one box, a band with negative fields, a band of zero width and a band that overflows.
  samples: (): readonly Band[] => [
    { from: 0, to: 0, min: 0, max: 0 },
    { from: 0, to: 40, min: 0, max: 120 },
    { from: -2.5, to: 3, min: -7, max: -1 },
    { from: 10, to: 30, min: 5, max: 5 },
    { from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY, min: -3, max: Number.POSITIVE_INFINITY },
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
    sized: { fn: (a: Band): boolean => a.to > a.from && a.max >= a.min, params: [], returns: "boolean" },
    end: { fn: (a: Band): Band => ({ from: a.to, to: a.to, min: 0, max: 0 }), params: [], returns: "domain" },
    side: { fn: (a: Band): number => (a.from === Number.NEGATIVE_INFINITY ? -1 : a.from === Number.POSITIVE_INFINITY ? 1 : 0), params: [], returns: "number" },
    aligned: { fn: (a: Band, b: Band): boolean => a.from === b.from, laws: ["commutative"], params: ["domain"], returns: "boolean" },
    outlasts: { fn: (a: Band, b: Band): boolean => a.to > b.from, params: ["domain"], returns: "boolean" },
    widen: { fn: (a: Band, b: Band): Band => ({ from: a.from, to: a.to, min: b.min < a.min ? b.min : a.min, max: b.max > a.max ? b.max : a.max }), params: ["domain"], returns: "domain" },
    cut: { fn: (c: Band, a: Band, b: Band): Band => ({ from: a.from, to: b.from, min: c.min, max: c.max }), params: ["domain", "domain"], returns: "domain" },
    continues: { fn: (a: Band, b: Band): boolean => a.to === b.from && a.min === b.min && a.max === b.max, params: ["domain"], returns: "boolean" },
    extend: { fn: (a: Band, b: Band): Band => ({ from: a.from, to: b.to, min: a.min, max: a.max }), params: ["domain"], returns: "domain" },
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

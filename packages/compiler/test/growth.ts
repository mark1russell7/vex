/**
 * The shapes of the gate of the growth of a compile (COMPILE.GROWTH), and the rule of the gate. The tests and the gate
 * `bench/growth.ts` read this file. A shape gives a program for some levels. The two sizes of each shape are legal
 * programs, under the limit of the nesting and under the limit of the places. The larger size is near those limits.
 */
import { app, axes, each, let_, ref, v, type Expr } from "@mark1russell7/vex";
import { doubling } from "@mark1russell7/vex-testkit";

const n = ref("n");
const SUM = app("sum", each(axes.all, n));
const ORIGIN = ref("n", [{ t: "origin" }]);

/**
 * The most exponent of the time of a shape. CI run 41912930573 gave 5 reads of each shape. The worst read is 0.98 (wideorigin), and
 * the largest spread of a shape is 0.12 (constlet). The sum is this limit.
 */
export const TIME_LIMIT = 1.1;
/** The most exponent of the bytes of a shape with no limit of its own. The text of a module has one size, so this limit has no spread. */
export const BYTES_LIMIT = 1;
/**
 * The most exponent of the time of the source of tier 2 for a shape with no limit of its own (COMPILE.SOURCE.SIZE). One CI read
 * (run 42016811553) gives 1.10 as the worst of these shapes (letchain). The sum with the spread 0.12 of `TIME_LIMIT` is 1.22, rounded up.
 */
export const SOURCE_TIME_LIMIT = 1.25;
/**
 * The most exponent of the bytes of the source of tier 2 for a shape with no limit of its own. The worst of these shapes is 1.034 (loopchain).
 * The names of the locals get more digits with more places, so the exponent is a little over 1. The text has one size, so this limit has no spread.
 */
export const SOURCE_BYTES_LIMIT = 1.04;

/** This function gives the result of `up`, applied `levels` times to `leaf`. */
function repeat(leaf: Expr, levels: number, up: (e: Expr, level: number) => Expr): Expr {
  let e = leaf;
  for (let i = 0; i < levels; i++) e = up(e, i);
  return e;
}

/** This function gives a balanced sum of `width` leaves. */
function tree(width: number, leaf: Expr): Expr {
  if (width <= 1) return leaf;
  const half = Math.floor(width / 2);
  return app("add", tree(half, leaf), tree(width - half, leaf));
}

/** This function gives a name for a level. */
const name = (level: number): string => `x${String(level)}`;

/** This function gives a chain of lets. Each value reads the last name and the first name. */
function readChain(levels: number): Expr {
  let e: Expr = app("add", v(name(levels)), v(name(1)));
  for (let i = levels; i >= 2; i--) e = let_({ [name(i)]: app("add", v(name(i - 1)), v(name(1))) }, e);
  return let_({ [name(1)]: SUM }, e);
}

/** The limits of the source of tier 2 for a shape with a limit of its own (COMPILE.SOURCE.SIZE), with the reason in `why`. */
export interface SourceLimits {
  readonly time?: number;
  readonly bytes?: number;
  readonly why: string;
}

/** A shape of the gate. `time` and `bytes` are the limits of a shape with a limit of its own, with the reason in `why`. */
export interface GrowthShape {
  readonly name: string;
  readonly make: (levels: number) => Expr;
  readonly small: number;
  readonly large: number;
  readonly time?: number;
  readonly bytes?: number;
  readonly why?: string;
  readonly source?: SourceLimits;
}

/** The shapes. Each shape that made a compile quadratic or worse is here, with the shape of the doubling programs. */
export const GROWTH_SHAPES: readonly GrowthShape[] = [
  { name: "plain", make: (levels) => doubling(n, levels), small: 11, large: 14 },
  { name: "constant", make: (levels) => doubling(SUM, levels), small: 10, large: 13 },
  { name: "loop", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, e)))), small: 10, large: 13 },
  { name: "chain", make: (levels) => repeat(n, levels, (e) => app("add", e, n)), small: 62, large: 499 },
  { name: "wide", make: (levels) => repeat(n, levels, (e) => app("add", e, tree(32, n))), small: 60, large: 480, source: { time: 1.45, why: "The text is linear (bytes exponent 0.92), and the time exponent of one read is 1.32. The limit is that read with the spread 0.12, rounded up. The largest text is 32.5 MB in 4.4 s." } },
  { name: "loopchain", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, n)))), small: 41, large: 165 },
  { name: "wideloop", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, tree(32, n))))), small: 40, large: 160, source: { time: 1.35, why: "The text is linear (bytes exponent 1.02), and the time exponent of one read is 1.19. The limit is that read with the spread 0.12, rounded up." } },
  { name: "letchain", make: (levels) => repeat(n, levels, (e, i) => let_({ [name(i)]: n }, app("add", e, v(name(i))))), small: 60, large: 240 },
  { name: "letloop", make: (levels) => repeat(SUM, levels, (e, i) => let_({ [name(i)]: SUM }, app("add", e, v(name(i))))), small: 60, large: 240 },
  { name: "constlet", make: (levels) => repeat(SUM, levels, (e, i) => let_({ [name(i)]: tree(32, SUM) }, app("add", e, v(name(i))))), small: 60, large: 240, source: { time: 1.35, why: "V-089 took the text from 266 MB to 26.9 MB at 240 levels, and the text is linear (bytes exponent 1.03). The time exponent of one read is 1.21. The limit is that read with the spread 0.12, rounded up." } },
  { name: "readchain", make: readChain, small: 120, large: 480 },
  {
    name: "origin",
    make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, ORIGIN)))),
    small: 41,
    large: 166,
    time: 1.25,
    bytes: 1.72,
    why: "Each node of the memo prints a key list with one entry for each level around it. So the text is quadratic in the levels: 22,850 bytes at 41 levels, 248,611 at 166, the largest legal size. The time follows the text: the worst of 5 reads is 1.13, and the largest spread of a shape is 0.12. The cost at the largest size is a module of 248,611 bytes from 665 places, printed in 124 to 203 ms.",
    source: { time: 1.85, bytes: 1.86, why: "Each read of a memo in tier 2 prints the key list of its levels, as the module does. So the text is quadratic in the levels: 362,069 bytes at 41 levels and 4,832,041 at 166, the largest legal size. The exponent was 2.76 before V-089, and the time exponent of one read is 1.71. The time limit is that read with the spread 0.12, rounded up." },
  },
  {
    name: "wideorigin",
    make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, tree(100, ORIGIN))))),
    small: 40,
    large: 160,
    bytes: 1.18,
    why: "This shape has the key lists of the shape origin, and its wide levels add a linear text. So the text is 128,762 bytes at 40 levels and 658,879 at 160, the largest legal size.",
    source: { time: 1.3, bytes: 1.1, why: "This shape has the key lists of the shape origin, and its wide levels add a linear text. So the text is 7,164,987 bytes at 40 levels and 32,769,870 at 160. The time exponent of one read is 1.15. The time limit is that read with the spread 0.12, rounded up." },
  },
];

/** One size of a shape: the medians of its processes. A row with no result has `undefined`. */
export interface GrowthRow {
  readonly shape: string;
  readonly levels: number;
  readonly places: number;
  readonly ms: number | undefined;
  readonly bytes: number | undefined;
}

/** This function gives the exponent of the growth of a value against the places: 1 is linear, and 2 is quadratic. */
export const exponent = (small: number, large: number, placesSmall: number, placesLarge: number): number => Math.log(large / small) / Math.log(placesLarge / placesSmall);

/** The exponents of a shape. */
export interface GrowthExponents {
  readonly time: number;
  readonly bytes: number;
}

/** This function gives the exponents of a shape from its two rows. */
export const exponentsOf = (small: GrowthRow, large: GrowthRow): GrowthExponents | undefined =>
  small.ms === undefined || large.ms === undefined || small.bytes === undefined || large.bytes === undefined
    ? undefined
    : { time: exponent(small.ms, large.ms, small.places, large.places), bytes: exponent(small.bytes, large.bytes, small.places, large.places) };

/** This function gives the faults of a shape: a row with no result, or an exponent over its limit. */
export function growthFaults(shape: GrowthShape, small: GrowthRow, large: GrowthRow): readonly string[] {
  const found = exponentsOf(small, large);
  if (found === undefined) return [`${shape.name} has a size with no result`];
  const time = shape.time ?? TIME_LIMIT;
  const bytes = shape.bytes ?? BYTES_LIMIT;
  return [
    ...(found.time > time ? [`${shape.name} has a time exponent of ${found.time.toFixed(2)}, and the limit is ${String(time)}`] : []),
    ...(found.bytes > bytes ? [`${shape.name} has a bytes exponent of ${found.bytes.toFixed(2)}, and the limit is ${String(bytes)}`] : []),
  ];
}

/** This function gives the faults of the source of tier 2 of a shape (COMPILE.SOURCE.SIZE). It applies the rule of the gate with the limits of the source. */
export function sourceFaults(shape: GrowthShape, small: GrowthRow, large: GrowthRow): readonly string[] {
  const { time = SOURCE_TIME_LIMIT, bytes = SOURCE_BYTES_LIMIT } = shape.source ?? {};
  return growthFaults({ name: `source of ${shape.name}`, make: shape.make, small: shape.small, large: shape.large, time, bytes }, small, large);
}

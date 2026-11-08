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
 * The time exponent of a part of the source of tier 2 with no held limit (COMPILE.SOURCE.SIZE). Over it, a row prints a note, and the note is report only.
 * The parts are `load`, and `generate` of a shape with no read. One CI read of the two parts as one time (run 42016811553) gives 1.10 for letchain.
 * The sum with the spread 0.12 of `TIME_LIMIT` is 1.22, rounded up.
 */
export const SOURCE_TIME_LIMIT = 1.25;
/**
 * The floor of the small median of a read of `generate`, in milliseconds (COMPILE.SOURCE.SIZE). A shape holds its `generate` limit only over this floor.
 * Under it, the noise of a fresh process moves the exponent past the spread. For example, 10 ms in place of 13.2 ms moves `chain` from 0.78 to 0.91.
 */
export const GENERATE_FLOOR_MS = 100;
/** The floor of the small median of a read of `load`, in milliseconds (COMPILE.SOURCE.SIZE). It is the floor of `generate`, for the same reason. */
export const LOAD_FLOOR_MS = GENERATE_FLOOR_MS;
/** The rise of the bytes at the large size that the bytes limit of each shape must find (rule 8i). */
export const BYTES_FLIP = 1.05;

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

/**
 * The limits of the source of tier 2 of a shape (COMPILE.SOURCE.SIZE). `bytes` holds: it is the exponent of one CI read (run 42021404905),
 * with 2.5 % more bytes at the large size, rounded up. So 5 % more bytes at the large size fails.
 * `generate` holds the time exponent of `generate`: the lowering, the checks and the print. `why` gives its read.
 * `generateSmallMs` is the small median of that read, and it is at least `GENERATE_FLOOR_MS`.
 * `load` holds the time exponent of `load`, the parse of the source by `new Function`, by the same rule. `loadSmallMs` is at least `LOAD_FLOOR_MS`.
 * A shape with no `generate` or no `load` has no held read of that part, so its time is report only (V-089).
 */
export interface SourceLimits {
  readonly bytes: number;
  readonly generate?: number;
  readonly generateSmallMs?: number;
  readonly load?: number;
  readonly loadSmallMs?: number;
  readonly why?: string;
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
  readonly source: SourceLimits;
}

/** The shapes. Each shape that made a compile quadratic or worse is here, with the shape of the doubling programs. */
export const GROWTH_SHAPES: readonly GrowthShape[] = [
  {
    name: "plain",
    make: (levels) => doubling(n, levels),
    small: 11,
    large: 14,
    source: { bytes: 0.911, load: 1.12, loadSmallMs: 107.3, why: "CI run 42478066584 timed `load` in 5 processes for each size: 107.3 ms at 11 levels and 853.6 ms at 14, so the load exponent is 1.00. The limit is that read with the spread 0.12, rounded up." },
  },
  { name: "constant", make: (levels) => doubling(SUM, levels), small: 10, large: 13, source: { bytes: 1.039 } },
  { name: "loop", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, e)))), small: 10, large: 13, source: { bytes: 1.037 } },
  {
    name: "chain",
    make: (levels) => repeat(n, levels, (e) => app("add", e, n)),
    small: 62,
    large: 499,
    source: { bytes: 1.034, why: "CI run 42464464092 timed the lowering, the checks and the print of tier 2 in 5 processes for each size. The exponent of the sum of their medians is 0.78: 13.2 ms at 62 levels and 66.8 ms at 499. The small median is under the floor of 100 ms (`GENERATE_FLOOR_MS`), so the time of generate is report only." },
  },
  { name: "wide", make: (levels) => repeat(n, levels, (e) => app("add", e, tree(32, n))), small: 60, large: 480, source: { bytes: 0.934, generate: 1.03, generateSmallMs: 187.8, why: "The text is linear (bytes exponent 0.92), and the largest text is 32.5 MB. CI run 42464464092 timed the lowering, the checks and the print of tier 2 in 5 processes for each size. The generate exponent is the exponent of the sum of their medians: 187.8 ms at 60 levels and 1226.9 ms at 480, so 0.90. The limit is that read with the spread 0.12, rounded up. The time of load is report only (V-089)." } },
  { name: "loopchain", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, n)))), small: 41, large: 165, source: { bytes: 1.052 } },
  { name: "wideloop", make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, tree(32, n))))), small: 40, large: 160, source: { bytes: 1.042, generate: 1.01, generateSmallMs: 103.7, why: "The text is linear (bytes exponent 1.02). CI run 42464464092 timed the lowering, the checks and the print of tier 2 in 5 processes for each size. The generate exponent is the exponent of the sum of their medians: 103.7 ms at 40 levels and 355.8 ms at 160, so 0.89. The limit is that read with the spread 0.12, rounded up. The time of load is report only (V-089)." } },
  {
    name: "letchain",
    make: (levels) => repeat(n, levels, (e, i) => let_({ [name(i)]: n }, app("add", e, v(name(i))))),
    small: 60,
    large: 240,
    source: { bytes: 1.038, why: "CI run 42464464092 timed the lowering, the checks and the print of tier 2 in 5 processes for each size. The exponent of the sum of their medians is 0.83: 16.1 ms at 60 levels and 50.6 ms at 240. The small median is under the floor of 100 ms (`GENERATE_FLOOR_MS`), so the time of generate is report only." },
  },
  { name: "letloop", make: (levels) => repeat(SUM, levels, (e, i) => let_({ [name(i)]: SUM }, app("add", e, v(name(i))))), small: 60, large: 240, source: { bytes: 1.035 } },
  { name: "constlet", make: (levels) => repeat(SUM, levels, (e, i) => let_({ [name(i)]: tree(32, SUM) }, app("add", e, v(name(i))))), small: 60, large: 240, source: { bytes: 1.049, generate: 1.14, generateSmallMs: 350.9, load: 1.15, loadSmallMs: 111.3, why: "V-089 took the text from 266 MB to 26.9 MB at 240 levels, and the text is linear (bytes exponent 1.03). CI run 42464464092 timed the lowering, the checks and the print of tier 2 in 5 processes for each size. The generate exponent is the exponent of the sum of their medians: 350.9 ms at 60 levels and 1442.1 ms at 240, so 1.02. The limit is that read with the spread 0.12, rounded up. CI run 42478066584 timed `load` in 5 processes for each size: 111.3 ms at 60 levels and 460.0 ms at 240, so the load exponent is 1.02. The load limit is that read with the spread 0.12, rounded up." } },
  { name: "readchain", make: readChain, small: 120, large: 480, source: { bytes: 1.041 } },
  {
    name: "origin",
    make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, ORIGIN)))),
    small: 41,
    large: 166,
    time: 1.25,
    bytes: 1.72,
    why: "Each node of the memo prints a key list with one entry for each level around it. So the text is quadratic in the levels: 22,850 bytes at 41 levels, 248,611 at 166, the largest legal size. The time follows the text: the worst of 5 reads is 1.13, and the largest spread of a shape is 0.12. The cost at the largest size is a module of 248,611 bytes from 665 places, printed in 124 to 203 ms.",
    source: { bytes: 1.877, why: "Each read of a memo in tier 2 prints the key list of its levels, as the module does. So the text is quadratic in the levels: 362,069 bytes at 41 levels and 4,832,041 at 166, the largest legal size. The exponent was 2.76 before V-089. No CI read times generate alone for this shape, so its time is report only." },
  },
  {
    name: "wideorigin",
    make: (levels) => repeat(n, levels, (e) => app("sum", each(axes.all, app("add", e, tree(100, ORIGIN))))),
    small: 40,
    large: 160,
    bytes: 1.18,
    why: "This shape has the key lists of the shape origin, and its wide levels add a linear text. So the text is 128,762 bytes at 40 levels and 658,879 at 160, the largest legal size.",
    source: { bytes: 1.115, why: "This shape has the key lists of the shape origin, and its wide levels add a linear text. So the text is 7,164,987 bytes at 40 levels and 32,769,870 at 160. No CI read times generate alone for this shape, so its time is report only." },
  },
];

/** One size of a shape: the medians of its processes. A row with no result has `undefined`. In a row of the source, `ms` is the time of `generate`. */
export interface GrowthRow {
  readonly shape: string;
  readonly levels: number;
  readonly places: number;
  readonly ms: number | undefined;
  /** This value is the median time of `load` in a row of the source. */
  readonly loadMs?: number | undefined;
  readonly bytes: number | undefined;
  /** This value is false when the processes of the row gave different bytes. */
  readonly sameBytes?: boolean;
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

/** The read of the source of tier 2 of a shape. A fault fails the gate, and a note is report only. */
export interface SourceVerdict {
  readonly faults: readonly string[];
  readonly notes: readonly string[];
}

/** This function tells if the bytes of a shape read nothing: the processes of a size gave different bytes. The gate shows such a shape as a no read. */
export function bytesUnread(small: GrowthRow, large: GrowthRow): boolean {
  return small.sameBytes === false || large.sameBytes === false;
}

/** This function gives the time exponent of `load` of a shape, or `undefined` if a row has no time of `load`. */
export const loadExponentOf = (small: GrowthRow, large: GrowthRow): number | undefined =>
  small.loadMs === undefined || large.loadMs === undefined ? undefined : exponent(small.loadMs, large.loadMs, small.places, large.places);

/**
 * This function gives the read of the source of tier 2 of a shape (COMPILE.SOURCE.SIZE). A size with no source is a fault.
 * A bytes exponent over its limit is a fault, and a time exponent of `generate` over the `generate` limit of the shape is a fault.
 * A time exponent of `load` over the `load` limit of the shape is a fault. A shape with no `load` limit has no read, so its time of `load` is a note (V-089).
 * A shape with no `generate` limit has no read, so its time of `generate` is a note.
 * A row with different bytes in its processes has no reading of a text, so its bytes are a note.
 */
export function sourceVerdict(shape: GrowthShape, small: GrowthRow, large: GrowthRow): SourceVerdict {
  const label = `source of ${shape.name}`;
  const found = exponentsOf(small, large);
  if (found === undefined) return { faults: [`${label} has a size with no result`], notes: [] };
  const held = shape.source.generate;
  const generateLimit = held ?? SOURCE_TIME_LIMIT;
  const generateText = `${label} has a generate time exponent of ${found.time.toFixed(2)}, and the limit is ${String(generateLimit)}`;
  const generateOver = found.time > generateLimit;
  const generateFaults = held !== undefined && generateOver ? [generateText] : [];
  const load = loadExponentOf(small, large);
  const loadHeld = shape.source.load;
  const loadLimit = loadHeld ?? SOURCE_TIME_LIMIT;
  const loadText = `${label} has a load time exponent of ${load?.toFixed(2) ?? "none"}, and the limit is ${String(loadLimit)}`;
  const loadOver = load !== undefined && load > loadLimit;
  // A held load limit with no time of load holds nothing, so it is a fault.
  const loadFaults = loadHeld !== undefined && (load === undefined || loadOver) ? [loadText] : [];
  const timeFaults = [...generateFaults, ...loadFaults];
  const timeNotes = [...(held === undefined && generateOver ? [`${generateText}, and the shape has no read of its own`] : []), ...(loadHeld === undefined && loadOver ? [`${loadText} (V-089)`] : [])];
  if (bytesUnread(small, large)) return { faults: timeFaults, notes: [...timeNotes, `${label} has different bytes in its processes, so its bytes are report only`] };
  return { faults: [...timeFaults, ...(found.bytes > shape.source.bytes ? [`${label} has a bytes exponent of ${found.bytes.toFixed(3)}, and the limit is ${String(shape.source.bytes)}`] : [])], notes: timeNotes };
}

/** This function tells if the bytes limit of a shape finds `BYTES_FLIP` times the bytes at the large size. A row with no bytes or with different bytes reads true, because its bytes do not hold. */
export function bytesFlipReadsRed(shape: GrowthShape, small: GrowthRow, large: GrowthRow): boolean {
  if (large.bytes === undefined || bytesUnread(small, large)) return true;
  return sourceVerdict(shape, small, { ...large, bytes: large.bytes * BYTES_FLIP }).faults.length > 0;
}

/**
 * The ireko tree pilot (docs/COMPILER.md §13.3, the strategies). The strategy `tree` of ireko
 * (https://github.com/mark1russell7/ireko) puts the children of a node in one row, on one side of the node. It packs the
 * subtrees by their shapes, so a small subtree fits under the edge of a large subtree. The strategy packs the row from
 * the first child to the last, and again from the last child to the first. The mean of the two packings gives the place
 * of each child. ireko has the MIT license and the same author.
 *
 * `TREE_PROGRAM` is one Vex program that evaluates at each child. Its value is the offset of the child, with the
 * direction of the edges. `treeOutput` makes the record of ireko from these values.
 *
 * The program differs from the code of ireko in two ways. Each one keeps the result of ireko:
 *
 * - A fold has two steps for each child. A step of a fold cannot share a name between its names. Thus the first step
 *   finds the place, and the second step keeps the place and the moved bands.
 * - The op `move` of `BandDomain` adds 0 to the fields on the other axis. Thus a field -0 becomes 0. The sign of such a
 *   zero does not reach a place. The place of the first child is 0, and each other place is a maximum with it.
 *
 * The result differs from ireko in four rare cases. The tests pin the first three:
 *
 * - An offset that is not finite gives an error at each child. ireko gives `Infinity` or `NaN` at some children. It
 *   keeps a finite offset at the other children. Its check then fails, and the engine uses `grid`.
 * - A band with a field `NaN` gives an error at each child, also where ireko ignores this band. The measure pass of
 *   ireko does not make such a band.
 * - A list of no children gives a list of no offsets. ireko throws a `RangeError`.
 * - The op `fill` has at most 100000 items, and the fold has two steps for each child. Thus a row of more than 50000
 *   children gives an error. The code of ireko has no limit.
 */
import { app, axes, call, each, fn, fold, let_, lit, rec, ref, space, v, type Expr, type ItemNames, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { BandDomain, BandNumDomain } from "./ireko-band.ts";
import type { Extent } from "./ireko-grid.ts";
import { bindAll, items } from "./ireko-layers.ts";
import { BANDS, MERGE, type Shape } from "./ireko-shapes.ts";

/** A child of a node after the measure pass, as `MeasuredChild` of ireko. The field `id` and the field `mode` have no effect here. */
export interface TreeChild {
  readonly box: { readonly width: number; readonly height: number };
  readonly extent: Extent;
  readonly shape?: Shape;
}

/** The options of the strategy `tree`, as in ireko. */
export interface TreeOptions {
  readonly side: "bottom" | "top" | "left" | "right";
  readonly distance: number;
  readonly align: "center" | "start" | "end";
}

/** The input of one arrangement: the mode, the size of the box itself, the children, the gap and the options. */
export interface TreeInput {
  readonly mode: "nested" | "linked";
  readonly self: { readonly width: number; readonly height: number };
  readonly children: readonly TreeChild[];
  readonly gap: number;
  readonly options: TreeOptions;
}

/** The offset of each child. A linked node also has the direction of its edges. */
export interface TreeOutput {
  readonly offsets: readonly { readonly x: number; readonly y: number }[];
  readonly direction?: string;
}

/** The value of the program at one child: its offset, and the direction, which is empty in the nested mode. */
export interface TreeValue {
  readonly x: number;
  readonly y: number;
  readonly direction: string;
}

/** A row merges its packed bands when it has more bands than this number, as the function `pack` of ireko. */
export const PACK_MOST = 256;

/** The number of bands that the merge of a long row keeps, as the function `pack` of ireko. */
export const PACK_MERGED = 128;

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const nth = (list: Expr, i: Expr): Expr => op("nth", list, i);
const eq = (a: Expr, b: Expr): Expr => op("eq", a, b);
const add = (a: Expr, b: Expr): Expr => op("add", a, b);
const subtract = (a: Expr, b: Expr): Expr => op("subtract", a, b);
const negate = (a: Expr): Expr => op("negate", a);
const half = (a: Expr): Expr => op("divide", a, lit(2));
const when = (test: Expr, yes: Expr, no: Expr): Expr => op("if", test, yes, no);
const isSide = (side: string): Expr => eq(v("side"), lit(side));
/** The empty list of numbers, and the empty list of bands. A name of a fold takes the kind of its items from its first list. */
const NO_NUMBERS = op("fill", lit(0), lit(0));
const NO_BANDS = op("fill", lit(0), op("band", lit(0), lit(0), lit(0), lit(0)));
const one = (x: Expr): Expr => op("fill", lit(1), x);
const push = (list: Expr, x: Expr): Expr => op("append", list, one(x));
/** A map over the items of a list. The names of `as` hold the item and its position. */
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);
/** A fold over the items of a list. The names of `as` hold the item and its position. */
const over = (list: Expr, as: ItemNames, init: Readonly<Record<string, Expr>>, step: Readonly<Record<string, Expr>>, result: Expr): Expr =>
  fold(axes.list(list), init, step, result, undefined, as);
/** A map over the items of a list, from the last item to the first. */
const backward = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.reverse(axes.list(list)), body, undefined, as);

/** The child at the position of the evaluation. */
const ME = ref("i");

/** The first names: the axis of the row, the mode, and the distance and the size of the box that the row reads. */
const MODE_NAMES = {
  $across: op("or", isSide("bottom"), isSide("top")),
  $nested: eq(v("mode"), lit("nested")),
  // The merge of the shapes pilot reads its limit from this name.
  limit: lit(PACK_MERGED),
};
const SELF_NAMES = {
  $distance: when(v("$nested"), lit(0), when(op("gt", v("distance"), lit(0)), v("distance"), op("multiply", lit(1.5), v("gap")))),
  $selfW: when(v("$nested"), lit(0), v("selfW")),
  $selfH: when(v("$nested"), lit(0), v("selfH")),
};

/** The depth of a child on the side after the node: the extent of the child stays clear of the node. */
const after = (self: string, at: string): Expr => subtract(add(v(self), v("$distance")), op("min", lit(0), ref(at)));
/** The depth of a child on the side before the node. */
const before = (box: string, at: string, size: string): Expr => subtract(negate(v("$distance")), op("max", ref(box), add(ref(at), ref(size))));

/**
 * The depth of each child, as `depthOf` of ireko. A fold takes the first error, so a depth that is not finite gives an
 * error for all the row. An `each` keeps the error in one item, and `nth` and `count` skip such an item.
 */
const DEPTHS = fold(
  axes.all,
  { out: NO_NUMBERS },
  { out: push(v("out"), when(isSide("bottom"), after("$selfH", "ey"), when(isSide("top"), before("bh", "ey", "eh"), when(isSide("right"), after("$selfW", "ex"), before("bw", "ex", "ew"))))) },
  v("out"),
);

/** The band of the extent of a child, for a child with no shape. The op `move` keeps an infinite end. */
const extentBand = (along: string, across: string, at: string, crossAt: string): Expr => op("move", op("band", lit(0), ref(along), lit(0), ref(across)), ref(at), ref(crossAt));

/** The bands of the child at the position of the call, on the axis of the row, as `bandsOf` of ireko. */
const OWN_BANDS = when(
  ref("shaped"),
  when(v("$across"), ref("rows"), ref("cols")),
  one(when(v("$across"), extentBand("eh", "ew", "ey", "ex"), extentBand("ew", "eh", "ex", "ey"))),
);

/**
 * The bands of each child, moved to the depth of the child. A fold takes the first error, as `DEPTHS` does. Thus a
 * child with a band that is not valid gives an error for all the row.
 */
const MOVED = fold(
  axes.all,
  { out: op("fill", lit(0), NO_BANDS) },
  { out: op("append", v("out"), one(let_({ $depth: nth(v("$depths"), ME), $own: OWN_BANDS }, loop(v("$own"), ["b"], op("move", v("b"), v("$depth"), lit(0)))))) },
  v("out"),
);

/** The subtrees from the last child to the first, each one mirrored on the axis of the row, as `flip` of ireko. */
const MIRRORED = backward(v("$bands"), ["$subtree"], loop(v("$subtree"), ["b"], op("flip", v("b"))));

/** The bands of the subtree of step `t`: a subtree has two steps. */
const THIS_SUBTREE = items(nth(v("subtrees"), op("floor", half(v("t")))));

/**
 * The smallest place at or after the name `place` for the subtree in the name `own`. There, each band of the subtree
 * is at the gap or more from each band of the name `packed`. The ops `overlaps` and `clear` compare the ends inside the
 * op, so an infinite end does not give an error. Thus a clearance of `-Infinity` leaves the place, as in ireko.
 */
const CLEAR = over(
  v("own"),
  ["b"],
  { c: v("place") },
  {
    c: over(
      v("packed"),
      ["p"],
      { m: v("c") },
      { m: when(op("overlaps", v("p"), v("b")), op("clear", v("p"), v("b"), v("m"), v("gap")), v("m")) },
      v("m"),
    ),
  },
  v("c"),
);

/**
 * The bands of the name `all` after a merge. The merge gives at most `PACK_MERGED` bands, but LOOP.SIZE does not read
 * this limit. It refuses a list from a fold over a list of the loop. Thus this loop has a literal limit. The op `extend`
 * of a band with itself gives the same band with a fixed size.
 */
const MERGED = let_(
  { merged: call("merge", v("all")) },
  loop(op("take", op("fill", lit(PACK_MERGED), lit(0)), op("count", v("merged"))), ["$unused", "j"], let_({ kept: nth(v("merged"), v("j")) }, op("extend", v("kept"), v("kept")))),
);

/** The name `packed` with the bands of the name `own` at the name `place`. A long row merges its bands, as `pack` of ireko. */
const KEEP = let_({ all: op("append", v("packed"), loop(v("own"), ["b"], op("move", v("b"), lit(0), v("place")))) }, when(op("gt", op("count", v("all")), lit(PACK_MOST)), MERGED, v("all")));

/** The test of the first step of a subtree. */
const FINDS = eq(op("mod", v("t"), lit(2)), lit(0));

/**
 * The function `pack` of its parameter `subtrees`, as `pack` of ireko. The value is the place of each subtree. The first
 * step of a subtree finds its place, and the second step keeps the place and the moved bands. The name `place` starts
 * at the place of the subtree before, so a subtree does not go before it.
 */
const PACK = fn(
  ["subtrees"],
  over(
    op("fill", op("multiply", lit(2), op("count", v("subtrees"))), lit(0)),
    ["$unused", "t"],
    { place: lit(0), places: NO_NUMBERS, packed: NO_BANDS },
    {
      place: when(FINDS, let_({ own: THIS_SUBTREE }, CLEAR), v("place")),
      places: when(FINDS, v("places"), push(v("places"), v("place"))),
      packed: when(FINDS, v("packed"), let_({ own: THIS_SUBTREE }, KEEP)),
    },
    v("places"),
  ),
);

/** The size of each child along the row. The move of a linked node also reads the place of the first child and of the last child. */
const SIZE_NAMES = {
  $sizes: each(axes.all, when(v("$across"), ref("bw"), ref("bh"))),
  $first: nth(v("$means"), lit(0)),
  $lastAt: subtract(op("count", v("$means")), lit(1)),
};
const LAST_NAMES = { $lastStart: nth(v("$means"), v("$lastAt")), $lastSize: nth(v("$sizes"), v("$lastAt")), $firstSize: nth(v("$sizes"), lit(0)) };

/** The move of the row of a linked node: over the first child, over the last child, or over the middle, as ireko. */
const MOVE = {
  $move: when(
    v("$nested"),
    lit(0),
    when(
      eq(v("align"), lit("start")),
      negate(v("$first")),
      let_(
        { $own: when(v("$across"), v("selfW"), v("selfH")) },
        when(
          eq(v("align"), lit("end")),
          subtract(v("$own"), add(v("$lastStart"), v("$lastSize"))),
          subtract(half(v("$own")), half(add(add(add(v("$first"), half(v("$firstSize"))), v("$lastStart")), half(v("$lastSize"))))),
        ),
      ),
    ),
  ),
};

/** The direction of the edges of a linked node, as `DIRECTION` of ireko. The nested mode has none. */
const DIRECTION = when(v("$nested"), lit(""), when(isSide("bottom"), lit("down"), when(isSide("top"), lit("up"), v("side"))));

/**
 * The program of the strategy `tree`. It evaluates at each child, and it gives the offset of the child and the direction
 * of the edges. The variables are the options, `mode`, `gap`, `selfW` and `selfH`.
 */
export const TREE_PROGRAM: Expr = bindAll(
  [
    MODE_NAMES,
    SELF_NAMES,
    { merge: MERGE },
    { $depths: DEPTHS },
    { $bands: MOVED },
    { $mirrored: MIRRORED },
    { pack: PACK },
    { $packed: call("pack", v("$bands")), $back: backward(call("pack", v("$mirrored")), ["p"], negate(v("p"))) },
    { $shift: subtract(nth(v("$packed"), lit(0)), nth(v("$back"), lit(0))) },
    { $means: loop(v("$packed"), ["f", "j"], half(add(add(v("f"), nth(v("$back"), v("j"))), v("$shift")))) },
    SIZE_NAMES,
    LAST_NAMES,
    MOVE,
    { $mean: nth(v("$means"), ME), $depth: nth(v("$depths"), ME) },
    { $place: when(v("$nested"), v("$mean"), add(v("$mean"), v("$move"))) },
  ],
  rec({
    x: when(v("$across"), v("$place"), v("$depth")),
    y: when(v("$across"), v("$depth"), v("$place")),
    direction: DIRECTION,
  }),
);

/** The kinds of the fields of a child and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const TREE_SCHEMA: Schema = {
  fields: { i: "number", bw: "number", bh: "number", ex: "number", ey: "number", ew: "number", eh: "number", shaped: "boolean", rows: BANDS, cols: BANDS },
  vars: { side: "string", distance: "number", align: "string", mode: "string", gap: "number", selfW: "number", selfH: "number" },
};

/** The domains of the program: numbers, texts for the options, booleans for the tests and the bands of ireko. */
export const TREE_DOMAINS: readonly [typeof NumDomain, typeof TextDomain, typeof BoolDomain, typeof BandNumDomain, typeof BandDomain] = [NumDomain, TextDomain, BoolDomain, BandNumDomain, BandDomain];

/** This function gives the space of the children and the variables of a run of the program. A list of bands is an array. */
export function treeRun(input: TreeInput): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  const records = input.children.map((c, i) => ({
    i,
    bw: c.box.width,
    bh: c.box.height,
    ex: c.extent.x,
    ey: c.extent.y,
    ew: c.extent.width,
    eh: c.extent.height,
    shaped: c.shape !== undefined,
    rows: c.shape?.rows ?? [],
    cols: c.shape?.columns ?? [],
  }));
  return { space: space.array(records), vars: { ...input.options, mode: input.mode, gap: input.gap, selfW: input.self.width, selfH: input.self.height } };
}

/** This function gives the record of ireko from the values of the program at the children. */
export function treeOutput(values: readonly TreeValue[]): TreeOutput {
  const offsets = values.map((o) => ({ x: o.x, y: o.y }));
  const direction = values[0]?.direction ?? "";
  return direction === "" ? { offsets } : { offsets, direction };
}

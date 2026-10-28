/**
 * The ireko shapes pilot (docs/COMPILER.md §13.3, the engine). The measure pass of ireko
 * (https://github.com/mark1russell7/ireko) gives a shape to each subtree that a tidy strategy reads. A shape is a list
 * of bands on each axis. The leaves and the nested nodes have the shape of their box. A linked node joins its box with
 * the moved shapes of its children. The join merges the bands with a sweep over the cut points.
 *
 * `shapesTree` follows the code of ireko step by step. It copies `boxShape`, `moveShape`, `joinShapes`, `mergeBands`
 * and `coarsen` of `engine/shape.ts`, and the shapes part of `engine/measure.ts`. `SHAPE_COLUMNS` is a sheet over the
 * tree with the same pass. The column `need` goes down the tree. The column `shape` holds the two lists of bands, and it
 * goes up the tree. The columns `rows` and `cols` read its lists. The tests compare the two, with the same bits. ireko has the MIT license and the same author.
 *
 * `NODE_SHAPE` is the pass for one linked node. Its records are the children, and their shapes are lists of the input
 * (COMPILE.MODULE.LIST.INPUT).
 */
import { app, axes, call, cell, each, fn, fold, iterate, let_, lit, ref, space, v, vexList, type Expr, type ItemNames, type Space } from "@mark1russell7/vex";
import type { ListKind, Schema, SheetModuleOptions } from "@mark1russell7/vex-compiler";
import { BAND_DOMAINS, type Band } from "./ireko-band.ts";

/** The shape of a subtree, relative to the top-left corner of its root box, as `Shape` of ireko. */
export interface Shape {
  readonly rows: readonly Band[];
  readonly columns: readonly Band[];
}

/** The largest number of bands on each axis of a shape, as `MAX_BANDS` of ireko. */
export const MAX_BANDS = 64;

/**
 * One node of the shapes pass, with the values of the measure pass. `p` is the position of the parent, or -1 for the
 * root. `wants` tells if the strategy of the node has `shapes: true`, and `linked` tells if its mode is linked. `w` and
 * `h` are the box of the node. `ox` and `oy` are the offset of the node from the strategy of its parent. `ex`, `ey`,
 * `ew` and `eh` are the extent of its subtree.
 */
export interface ShapeRecord {
  readonly p: number;
  readonly wants: boolean;
  readonly linked: boolean;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly ex: number;
  readonly ey: number;
  readonly ew: number;
  readonly eh: number;
}

/** The item at an index that exists by construction, as `at` of ireko. */
function at<T>(list: ArrayLike<T>, i: number): T {
  const value = list[i];
  if (value === undefined) throw new RangeError(`No item at the index ${String(i)}.`);
  return value;
}

/** This function gives the shape of one box with its top-left corner at the origin, as `boxShape` of ireko. */
export function boxShape(width: number, height: number): Shape {
  return { rows: [{ from: 0, to: height, min: 0, max: width }], columns: [{ from: 0, to: width, min: 0, max: height }] };
}

/** This function moves a shape by `dx` and `dy`, as `moveShape` of ireko. */
export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  return {
    rows: shape.rows.map((b) => ({ from: b.from + dy, to: b.to + dy, min: b.min + dx, max: b.max + dx })),
    columns: shape.columns.map((b) => ({ from: b.from + dx, to: b.to + dx, min: b.min + dy, max: b.max + dy })),
  };
}

/** This function joins shapes into one shape that covers all of them, as `joinShapes` of ireko. */
export function joinShapes(shapes: readonly Shape[], limit: number = MAX_BANDS): Shape {
  return { rows: mergeBands(shapes.flatMap((s) => s.rows), limit), columns: mergeBands(shapes.flatMap((s) => s.columns), limit) };
}

/** This function merges bands into bands that do not overlap, in the order of `from`, as `mergeBands` of ireko. */
export function mergeBands(bands: readonly Band[], limit: number = MAX_BANDS): Band[] {
  const valid = bands.filter((b) => b.to > b.from && b.max >= b.min);
  if (valid.length === 0) return [];
  const cuts = [...new Set(valid.flatMap((b) => [b.from, b.to]))].toSorted((a, b) => a - b);
  const starts = valid.toSorted((a, b) => a.from - b.from);
  const out: Band[] = [];
  let active: Band[] = [];
  let next = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = at(cuts, i);
    const to = at(cuts, i + 1);
    active = active.filter((b) => b.to > from);
    for (; next < starts.length && at(starts, next).from <= from; next++) active.push(at(starts, next));
    if (active.length === 0) continue;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const b of active) {
      if (b.min < min) min = b.min;
      if (b.max > max) max = b.max;
    }
    const last = out.at(-1);
    if (last !== undefined && last.to === from && last.min === min && last.max === max) out[out.length - 1] = { ...last, to };
    else out.push({ from, to, min, max });
  }
  return coarsen(out, limit);
}

/** This function joins pairs of neighbor bands until at most `limit` bands remain, as `coarsen` of ireko. */
function coarsen(bands: Band[], limit: number): Band[] {
  let out = bands;
  while (out.length > limit) {
    const next: Band[] = [];
    for (let i = 0; i < out.length; i += 2) {
      const a = at(out, i);
      const b = out[i + 1];
      next.push(b === undefined ? a : { from: a.from, to: b.to, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) });
    }
    out = next;
  }
  return out;
}

/**
 * This function gives the shape of each node that needs one, as the measure pass of ireko. A node needs a shape when
 * the strategy of its parent wants the shapes, or when its parent needs a shape and is linked. A parent comes before
 * its children. Each other node has `undefined`.
 */
export function shapesTree(records: readonly ShapeRecord[], limit: number = MAX_BANDS): (Shape | undefined)[] {
  const n = records.length;
  const children: number[][] = Array.from({ length: n }, () => []);
  records.forEach((r, i) => {
    if (r.p >= 0) at(children, r.p).push(i);
  });
  const needsShape: boolean[] = Array.from({ length: n }, () => false);
  for (let i = 0; i < n; i++) {
    const p = at(records, i).p;
    if (p >= 0) needsShape[i] = at(records, p).wants || (at(needsShape, p) && at(records, p).linked);
  }
  const shapes: (Shape | undefined)[] = Array.from({ length: n }, () => undefined);
  for (let i = n - 1; i >= 0; i--) {
    if (!at(needsShape, i)) continue;
    const r = at(records, i);
    const kids = at(children, i);
    if (kids.length === 0 || !r.linked) {
      shapes[i] = boxShape(r.w, r.h);
      continue;
    }
    const parts = kids.map((c) => {
      const k = at(records, c);
      // A child without a shape counts with its extent: a shape that covers more is still correct.
      const shape = shapes[c] ?? moveShape(boxShape(k.ew, k.eh), k.ex, k.ey);
      return moveShape(shape, k.ox, k.oy);
    });
    shapes[i] = joinShapes([boxShape(r.w, r.h), ...parts], limit);
  }
  return shapes;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const PARENT = { t: "parent" } as const;
/** The empty list. It fits each list, but its items have no kind. */
const EMPTY = lit(vexList([]));
/** True at the root: it has no parent. */
const ROOT = op("lt", ref("p"), lit(0));
/** The next position after the position in the name `i`. */
const next = (i: string): Expr => op("add", v(i), lit(1));
/** A band with each field 0: the first value of a name of a loop that holds a band. */
const ZERO = op("band", lit(0), lit(0), lit(0), lit(0));

/**
 * The list of one value: `fill(1, x)` (LIST.FILL, COMPILE.MODULE.FILL). Its key is "0", not the key of a node. Thus a
 * loop over such a list reads no record at its keys.
 */
const single = (x: Expr): Expr => op("fill", lit(1), x);

/**
 * An empty list whose items have the kind of `x`: `fill(0, x)`. A module takes the kind of the items of a name of a fold
 * from its first list. The empty literal has no kind of items, so `sortBy` with the option `by` cannot read such a list.
 * A filter gives this list for an item that it does not keep, so its value has the kind of its items.
 */
const none = (x: Expr): Expr => op("fill", lit(0), x);
const NO_BANDS = none(ZERO);
const NO_NUMBERS = none(lit(0));

/**
 * A map over the items of the list `list`, in order. The names of `as` hold the item and its position
 * (AXIS.LIST.ITEM, AXIS.LIST.INDEX). The value is a list with one item for each item.
 */
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);

/**
 * A filter over the items of the list `list`. Its body gives a list of one item or an empty list, and `flat` joins
 * these lists. Thus each item costs one step, and the filter does not append to a long list.
 */
const keep = (list: Expr, as: ItemNames, body: Expr): Expr => op("flat", loop(list, as, body));

/** A fold over the items of the list `list`, in order. Its steps read the item and its position through the names of `as`. */
const over = (list: Expr, as: ItemNames, init: Readonly<Record<string, Expr>>, step: Readonly<Record<string, Expr>>, result: Expr): Expr =>
  fold(axes.list(list), init, step, result, undefined, as);

/** The test of `mergeBands` of ireko: a band with a size on each axis. */
const valid = (b: Expr): Expr => op("and", op("gt", op("to", b), op("from", b)), op("gte", op("max", b), op("min", b)));

/** The list `list` with each band moved: `along` on the axis of the list, and `across` on the other axis. */
const moved = (list: string, along: Expr, across: Expr): Expr => loop(v(list), ["b"], op("move", v("b"), along, across));

/**
 * The cut points of the bands in the name `bands`: the two ends of each valid band, from the smallest, each value once.
 * The ends go into the list in the order of ireko, so a sort that keeps the order keeps the first of two equal ends.
 * An end stays when it is the first end or when it is not equal to the end before it.
 */
const cuts = let_(
  { ends: keep(v("bands"), ["b"], op("if", valid(v("b")), op("append", single(op("from", v("b"))), single(op("to", v("b")))), NO_NUMBERS)) },
  let_(
    { sorted: op("sortBy", v("ends")) },
    keep(v("sorted"), ["x", "i"], op("if", op("or", op("eq", v("i"), lit(0)), op("not", op("eq", v("x"), op("nth", v("sorted"), op("subtract", v("i"), lit(1)))))), single(v("x")), NO_NUMBERS)),
  ),
);

/**
 * The band of the cut in the name `c`: from the cut to the next cut, across the active bands. The name `i` holds the
 * position of the cut in the name `cuts`. A band of the name `starts` is active when it starts at the cut or before and ends after the cut. `min`
 * and `max` keep the first of two equal values, as the comparisons of ireko do. The list is empty when no band is
 * active.
 */
const segment = let_(
  { from: v("c"), to: op("nth", v("cuts"), next("i")) },
  over(
    v("starts"),
    ["b"],
    { any: lit(false), lo: lit(0), hi: lit(0) },
    (() => {
      const b = v("b");
      const active = op("and", valid(b), op("and", op("lte", op("from", b), v("from")), op("gt", op("to", b), v("from"))));
      return {
        any: op("or", v("any"), active),
        lo: op("if", op("and", active, op("or", op("not", v("any")), op("lt", op("min", b), v("lo")))), op("min", b), v("lo")),
        hi: op("if", op("and", active, op("or", op("not", v("any")), op("gt", op("max", b), v("hi")))), op("max", b), v("hi")),
      };
    })(),
    op("if", v("any"), single(op("band", v("from"), v("to"), v("lo"), v("hi"))), NO_BANDS),
  ),
);

/** The bands of each segment with an active band, in the order of the cuts. The last cut starts no segment. */
const segments = keep(v("cuts"), ["c", "i"], op("if", op("lt", next("i"), op("count", v("cuts"))), segment, NO_BANDS));

/** The segments with neighbor bands of the same interval joined, as the sweep of ireko. The name `p` holds the last band. */
const joined = over(
  v("segments"),
  ["s"],
  { has: lit(false), p: ZERO, acc: NO_BANDS },
  (() => {
    const s = v("s");
    const same = op("and", v("has"), op("and", op("eq", op("to", v("p")), op("from", s)), op("and", op("eq", op("min", v("p")), op("min", s)), op("eq", op("max", v("p")), op("max", s)))));
    return {
      has: lit(true),
      p: op("if", same, op("band", op("from", v("p")), op("to", s), op("min", v("p")), op("max", v("p"))), s),
      acc: op("if", op("and", v("has"), op("not", same)), op("append", v("acc"), single(v("p"))), v("acc")),
    };
  })(),
  op("if", v("has"), op("append", v("acc"), single(v("p"))), v("acc")),
);

/** One step of `coarsen` of ireko: each pair of neighbor bands becomes one band that covers both. The name `a` holds the first band of a pair. */
const pairs = over(
  v("out"),
  ["b"],
  { odd: lit(false), a: ZERO, acc: NO_BANDS },
  { odd: op("not", v("odd")), a: v("b"), acc: op("if", v("odd"), op("append", v("acc"), single(op("join", v("a"), v("b")))), v("acc")) },
  op("if", v("odd"), op("append", v("acc"), single(v("a"))), v("acc")),
);

/**
 * The function `merge` of the bands of its parameter `bands`, as `mergeBands` of ireko with the limit of the variable
 * `limit`. Its value is a list (COMPILE.MODULE.LIST.CALL), so the formula of a shape calls it once for each axis.
 */
const MERGE = fn(
  ["bands"],
  let_(
    { starts: op("sortBy", v("bands"), lit({ by: "from" })), cuts },
    let_(
      { segments },
      let_(
        { out: joined },
        // Each step halves the number of bands, so 64 steps cover each list of the sheet.
        iterate(64, { out: v("out") }, { out: pairs }, v("out"), op("lte", op("count", v("out")), v("limit"))),
      ),
    ),
  ),
);

/**
 * The names of one axis of a shape: its position in a shape, and the fields of a record along the axis and across it.
 * `field` is the field of the bands of a child in `NODE_SHAPE`.
 */
interface ShapeAxis {
  readonly index: number;
  readonly field: string;
  readonly offset: string;
  readonly cross: string;
  readonly size: string;
  readonly crossSize: string;
  readonly at: string;
  readonly crossAt: string;
  readonly extent: string;
  readonly crossExtent: string;
}
const ROWS: ShapeAxis = { index: 0, field: "rows", offset: "oy", cross: "ox", size: "h", crossSize: "w", at: "ey", crossAt: "ex", extent: "eh", crossExtent: "ew" };
const COLS: ShapeAxis = { index: 1, field: "cols", offset: "ox", cross: "oy", size: "w", crossSize: "h", at: "ex", crossAt: "ey", extent: "ew", crossExtent: "eh" };

/** The band of a box of the size `size` along the axis and `cross` across it, at the origin: `boxShape` of ireko. */
const box = (size: Expr, cross: Expr): Expr => op("band", lit(0), size, lit(0), cross);

/**
 * The shape of a node on one axis. A node without a need has no bands. A linked node with children joins its box with
 * the shapes of its children, moved by their offsets. Each other node has the band of its box. The join calls the
 * function `merge` of the formula.
 */
function shapeOf(a: ShapeAxis): Expr {
  const own = single(box(ref(a.size), ref(a.crossSize)));
  // At a child: its shape, or the band of its extent, moved by its offset. The loop over the bands reads no record at
  // the key of a band, so the names hold the offset of the child.
  const child = let_(
    { part: op("if", cell("need"), op("nth", cell("shape"), lit(a.index)), single(op("move", box(ref(a.extent), ref(a.crossExtent)), ref(a.at), ref(a.crossAt)))), along: ref(a.offset), across: ref(a.cross) },
    moved("part", v("along"), v("across")),
  );
  const parts = each(axes.children, child);
  const linked = op("and", ref("linked"), op("gt", op("count", each(axes.children, lit(0))), lit(0)));
  return op("if", op("not", cell("need")), EMPTY, op("if", linked, call("merge", op("append", own, op("flat", parts))), own));
}

/**
 * The shape of a node: a list of two lists of bands, the rows and the columns. Both axes call one function `merge`, so
 * a module has the merge once.
 */
const SHAPE = let_({ merge: MERGE }, let_({ rows: shapeOf(ROWS), cols: shapeOf(COLS) }, op("append", single(v("rows")), single(v("cols")))));

/**
 * The sheet of the shapes pass. `need` reads the parent, so it fills the tree from the root. `shape` reads the
 * children, so it fills the tree from the leaves. `rows` and `cols` read the two lists of `shape`. Each list of bands
 * has the order of `from`.
 */
export const SHAPE_COLUMNS: ReadonlyMap<string, Expr> = new Map<string, Expr>([
  ["need", op("if", ROOT, lit(false), op("or", ref("wants", [PARENT]), op("and", cell("need", [PARENT]), ref("linked", [PARENT]))))],
  ["shape", SHAPE],
  ["rows", op("nth", cell("shape"), lit(ROWS.index))],
  ["cols", op("nth", cell("shape"), lit(COLS.index))],
]);

/** A list of bands. Its keys come from `fill`, so they are not the keys of nodes. */
const BANDS: ListKind = { list: "domain:Band", texts: true };

/** The kinds of the columns. The column `shape` reads itself at the children, so it needs its kind. */
export const SHAPE_KINDS: NonNullable<SheetModuleOptions["kinds"]> = { need: "boolean", shape: { list: BANDS, texts: true }, rows: BANDS, cols: BANDS };

/** The kinds of the fields of a record and of the variable `limit`, for the compiler (docs/COMPILER.md §3.2). */
export const SHAPE_SCHEMA: Schema = {
  fields: { p: "number", wants: "boolean", linked: "boolean", w: "number", h: "number", ox: "number", oy: "number", ex: "number", ey: "number", ew: "number", eh: "number" },
  vars: { limit: "number" },
};

/** The domains of the sheet: numbers, booleans and the bands of ireko. */
export const SHAPE_DOMAINS: typeof BAND_DOMAINS = BAND_DOMAINS;

/** This function gives the tree space of the records: the key of a record is the text of its position. */
export function shapeSpace(records: readonly ShapeRecord[]): Space {
  const parents = Object.fromEntries(records.flatMap((r, i) => (r.p < 0 ? [] : [[String(i), String(r.p)]])));
  return space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), parents);
}

/**
 * The shape of one node on one axis, from the shapes of its children (COMPILE.MODULE.LIST.INPUT). Each record is a
 * child. Its field `field` holds its bands, and its offset moves them. The box of the node comes from the variables.
 */
function nodeShapeOf(a: ShapeAxis): Expr {
  const own = single(box(v(a.size), v(a.crossSize)));
  const child = let_({ part: ref(a.field), along: ref(a.offset), across: ref(a.cross) }, moved("part", v("along"), v("across")));
  return call("merge", op("append", own, op("flat", each(axes.all, child))));
}

/**
 * The shape of one linked node with children, as the measure loop of ireko computes it for each node. The records are
 * the children, and each one holds its shape as two lists of bands. The value at each record is the shape of the node.
 */
export const NODE_SHAPE: Expr = let_({ merge: MERGE }, let_({ rows: nodeShapeOf(ROWS), cols: nodeShapeOf(COLS) }, op("append", single(v("rows")), single(v("cols")))));

/**
 * The schema of `NODE_SHAPE`. Each child has an offset and two lists of bands. The variables are the box of the node and
 * the limit of the bands.
 */
export const NODE_SCHEMA: Schema = {
  fields: { ox: "number", oy: "number", rows: BANDS, cols: BANDS },
  vars: { w: "number", h: "number", limit: "number" },
};

/**
 * The ireko audit pilot (docs/COMPILER.md §13.3, phase C3). After a layout, the audit of ireko
 * (https://github.com/mark1russell7/ireko) reports its defects. The check `ESCAPE` finds each node that is not inside
 * its container: the nearest ancestor in the nested mode. A container with the fit `clip` hides the parts outside it,
 * so it has no finding.
 *
 * `escapes` follows the code of ireko step by step. `ESCAPE_PROGRAM` is one Vex program that evaluates at each node,
 * and it reads the container at the position `c`. The tests compare the two.
 *
 * This file also has three other programs of the engine of ireko. The test file holds a copy of each function of ireko,
 * and the tests compare the bits.
 *
 * - `OVERLAP_PROGRAM` is the check `OVERLAP`: the sweep over the sorted boxes, with the same pairs in the same order.
 *   A filter of the open boxes keeps the cost of ireko, O(n log n + k) for k candidate pairs.
 * - `BOUNDS_PROGRAM` is the final bounds of a layout.
 * - `BETWEEN_PROGRAM` is the function `edgesBetweenChildren` of the measure pass.
 *
 * `@mark1russell7/vex-domains` has no box. `XYDomain` holds the corners and the sizes, and its vectors are plain data
 * for a standalone module. The result differs from ireko in two rare cases. The tests pin the first case:
 *
 * - A sum or a difference that is not finite gives an error at each key. For example, `x + width` of a box can overflow.
 *   ireko keeps the infinite number. The engine of ireko refuses an infinite box, so only very large numbers give this.
 * - `BETWEEN_PROGRAM` has at most 100000 steps for each edge (ITERATE.LIMIT). No test pins this: a run of that size is
 *   too heavy for the test file, and the default limit of ireko is 100000 nodes.
 */
import { app, axes, call, each, fn, fold, index, iterate, let_, lit, rec, ref, space, v, type Expr, type ItemNames, type Space, type VexList } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, XYDomain, type XY } from "@mark1russell7/vex-domains";

/** A placed node: its box, the index of its container or -1, and the fit `clip`. */
export interface PlacedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly container: number;
  readonly clip: boolean;
}

/** The tolerance of the audit of ireko, in pixels. */
export const TOLERANCE = 0.5;

/** A rectangle, as in the geometry of ireko. */
type Rect = Pick<PlacedBox, "x" | "y" | "width" | "height">;

/** This function tells if `outer` holds `inner`, with a tolerance. */
function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** This function tells for each node if the audit of ireko gives the finding `ESCAPE`. */
export function escapes(nodes: readonly PlacedBox[]): boolean[] {
  return nodes.map((node) => {
    const c = node.container;
    if (c < 0) return false;
    const holder = nodes[c];
    if (holder === undefined) throw new Error(`The container ${String(c)} does not exist.`);
    if (holder.clip) return false;
    return !contains(holder, node, TOLERANCE);
  });
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
/** A field of the container: the node at the position `c` (NAV.COMPUTED). */
const holder = (field: string): Expr => ref(field, [index(ref("c"))]);
const and = (...tests: Expr[]): Expr => tests.reduceRight((rest, t) => op("and", t, rest));

/** The program of the check `ESCAPE`. It evaluates at each node, and it gives true for a node with the finding. */
export const ESCAPE_PROGRAM: Expr = and(
  op("gte", ref("c"), lit(0)),
  op("not", holder("clip")),
  op(
    "not",
    and(
      op("gte", ref("x"), op("subtract", holder("x"), lit(TOLERANCE))),
      op("gte", ref("y"), op("subtract", holder("y"), lit(TOLERANCE))),
      op("lte", op("add", ref("x"), ref("w")), op("add", op("add", holder("x"), holder("w")), lit(TOLERANCE))),
      op("lte", op("add", ref("y"), ref("h")), op("add", op("add", holder("y"), holder("h")), lit(TOLERANCE))),
    ),
  ),
);

/** The kinds of the fields of a node, for the compiler (docs/COMPILER.md §3.2). */
export const ESCAPE_SCHEMA: Schema = { fields: { x: "number", y: "number", w: "number", h: "number", c: "number", clip: "boolean" }, vars: {} };

/** The domains of the program: numbers and booleans. */
export const ESCAPE_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain] = [NumDomain, BoolDomain];

/** This function gives the space of the nodes of a run of the program. */
export function escapeRun(nodes: readonly PlacedBox[]): { readonly space: Space } {
  return { space: space.array(nodes.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height, c: b.container, clip: b.clip }))) };
}

/** A node of the check `OVERLAP`. `last` is the position of its last child or -1, and `nested` tells if the node is in the nested mode. */
export interface OverlapNode extends PlacedBox {
  readonly last: number;
  readonly nested: boolean;
}

/** The largest number of findings `OVERLAP` in one layout, as in ireko. */
export const MAX_OVERLAP_ISSUES = 100;

const nth = (list: Expr, i: Expr): Expr => op("nth", list, i);
const eq = (a: Expr, b: Expr): Expr => op("eq", a, b);
const lt = (a: Expr, b: Expr): Expr => op("lt", a, b);
const gt = (a: Expr, b: Expr): Expr => op("gt", a, b);
const add = (a: Expr, b: Expr): Expr => op("add", a, b);
const subtract = (a: Expr, b: Expr): Expr => op("subtract", a, b);
const when = (test: Expr, yes: Expr, no: Expr): Expr => op("if", test, yes, no);
const xy = (x: Expr, y: Expr): Expr => op("xy", x, y);
const compX = (p: Expr): Expr => op("x", p);
const compY = (p: Expr): Expr => op("y", p);
/** The empty list of numbers, and the empty list of `XY` values. A name of a fold takes the kind of its items from its first list. */
const NO_NUMBERS = op("fill", lit(0), lit(0));
const NO_XY = op("fill", lit(0), xy(lit(0), lit(0)));
const one = (x: Expr): Expr => op("fill", lit(1), x);
const push = (list: Expr, x: Expr): Expr => op("append", list, one(x));
/** A map over the items of a list. The names of `as` hold the item and its position. */
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);
/** The item `x` in a list where the test is true, and the empty list `none` in the other case. A `flat` over such lists is a filter. */
const keep = (test: Expr, x: Expr, none: Expr): Expr => when(test, one(x), none);
/**
 * A list with one item for each record, from a fold. A fold takes the first error, so a value that is not finite gives
 * an error for all the layout. An `each` keeps the error in one item, and `nth` skips such an item.
 */
const eachRecord = (none: Expr, item: Expr): Expr => fold(axes.all, { out: none }, { out: push(v("out"), item) }, v("out"));

/** The node at the position of the step. */
const ME = ref("i");
const AT = xy(ref("x"), ref("y"));
const SIZE = xy(ref("w"), ref("h"));

/** The clip root of each node, as `clipRoots` of ireko: the nearest container with the fit `clip`, or -1. A container comes before its nodes. */
const CLIP_ROOTS = eachRecord(NO_NUMBERS, when(lt(ref("c"), lit(0)), lit(-1), when(holder("clip"), ref("c"), nth(v("out"), ref("c")))));

/**
 * The end of the subtree of each node, as `holdsOf` of ireko, from the last node to the first. Thus the node `a` has its
 * end at the position `$top - a` of this list.
 */
const ENDS = fold(
  axes.reverse(axes.all),
  { out: NO_NUMBERS },
  { out: push(v("out"), when(lt(ref("last"), lit(0)), add(ME, lit(1)), nth(v("out"), subtract(v("$top"), ref("last"))))) },
  v("out"),
);

/** A field of the clip root of the node. */
const root = (field: string): Expr => ref(field, [index(v("$r"))]);
const ROOT_AT = xy(root("x"), root("y"));
const ROOT_END = add(ROOT_AT, xy(root("w"), root("h")));
/** A value for the node: `free` for a node that no container clips, and `inside` for another node. */
const clipped = (free: Expr, inside: Expr): Expr => let_({ $r: nth(v("$roots"), ME) }, when(lt(v("$r"), lit(0)), free, inside));

/** The first corner of the visible part of each node, and its size, as `visible` of ireko. */
const LOWS = eachRecord(NO_XY, clipped(AT, op("max", AT, ROOT_AT)));
const SIZES = eachRecord(NO_XY, clipped(SIZE, subtract(op("min", add(AT, SIZE), ROOT_END), op("max", AT, ROOT_AT))));
/** The far corner of each box less the tolerance. Each test of `overlaps` of ireko reads this value. */
const FARS = eachRecord(NO_XY, subtract(add(nth(v("$lows"), ME), nth(v("$sizes"), ME)), xy(lit(TOLERANCE), lit(TOLERANCE))));

/** A node with a visible part. A node that no container clips counts also with no area. */
const SHOWN = let_(
  { $s: nth(v("$sizes"), ME) },
  op("or", lt(nth(v("$roots"), ME), lit(0)), and(gt(compX(v("$s")), lit(0)), gt(compY(v("$s")), lit(0)))),
);
/** The positions of the boxes of the sweep, in the order of the nodes. */
const ENTRIES = fold(axes.all, { out: NO_NUMBERS }, { out: when(SHOWN, push(v("out"), ME), v("out")) }, v("out"));

/** The values of the boxes of the sweep for the density of ireko. The first node has no clip root, so the list has at least one item. */
const SPANS = {
  $sum: op("reduce", loop(v("$entries"), ["e"], nth(v("$sizes"), v("e"))), lit("add")),
  $from: op("reduce", loop(v("$entries"), ["e"], nth(v("$lows"), v("e"))), lit("min")),
  $to: op("reduce", loop(v("$entries"), ["e"], add(nth(v("$lows"), v("e")), nth(v("$sizes"), v("e")))), lit("max")),
};
/** The sum of the sizes on one axis over the length that the boxes cover, as `densityOf` of ireko. */
const DENSITY = fn(["s", "a", "b"], when(gt(v("b"), v("a")), op("divide", v("s"), subtract(v("b"), v("a"))), lit(0)));
const densityOf = (comp: (p: Expr) => Expr): Expr => call("density", comp(v("$sum")), comp(v("$from")), comp(v("$to")));

/**
 * The test of the sweep along y, as in `overlapsOf` of ireko. It also counts the far corners. The sweep reads them in
 * lists, where `flat` skips an error. So this count gives the error of a box that is not finite for all the layout.
 */
const ALONG_Y = when(op("gte", op("count", v("$fars")), lit(0)), lt(densityOf(compY), densityOf(compX)), lit(false));

/** The coordinate on the axis of the sweep. */
const onAxis = (p: Expr): Expr => when(v("$alongY"), compY(p), compX(p));

/** The boxes in the order of the sweep. `x` is the start of a box, and `y` its position. The sort is stable, so equal starts keep the order of the nodes, as in ireko. */
const ORDER = op(
  "sortBy",
  fold(axes.list(v("$entries")), { out: NO_XY }, { out: push(v("out"), xy(onAxis(nth(v("$lows"), v("e"))), v("e"))) }, v("out"), undefined, ["e"]),
  lit({ by: "x" }),
);

/** The test of `overlaps` of ireko for the boxes at the positions `a` and `b`. */
const OVERLAPS = fn(
  ["a", "b"],
  let_(
    { $la: nth(v("$lows"), v("a")), $lb: nth(v("$lows"), v("b")), $fa: nth(v("$fars"), v("a")), $fb: nth(v("$fars"), v("b")) },
    and(lt(compX(v("$la")), compX(v("$fb"))), lt(compX(v("$lb")), compX(v("$fa"))), lt(compY(v("$la")), compY(v("$fb"))), lt(compY(v("$lb")), compY(v("$fa")))),
  ),
);
/** The test of `holdsOf` of ireko: the nested node `a` holds the node `b` in its subtree. */
const HOLDS = fn(["a", "b"], and(gt(v("b"), v("a")), lt(v("b"), nth(v("$ends"), subtract(v("$top"), v("a")))), ref("nested", [index(v("a"))])));

/** The test of the pair of the open box `o` and the new box `n`. */
const FOUND = fn(["o", "n"], and(call("overlaps", v("o"), v("n")), op("not", call("holds", v("o"), v("n"))), op("not", call("holds", v("n"), v("o")))));

/** The new box of a step, and the room in the list of the findings. */
const NEW = compY(v("e"));
const ROOM = op("max", lit(0), subtract(lit(MAX_OVERLAP_ISSUES), v("n")));
const LIVE = op("flat", loop(v("open"), ["o"], keep(gt(onAxis(nth(v("$fars"), v("o"))), compX(v("e"))), v("o"), NO_NUMBERS)));
const HITS = op("flat", loop(v("open"), ["o"], keep(call("found", v("o"), NEW), xy(op("min", v("o"), NEW), op("max", v("o"), NEW)), NO_XY)));

/**
 * The sweep of `overlapsOf` of ireko. A step reads the old values of the names, and it cannot share a name between its
 * names. So `pairs` and `n` take the hits of a step in the next step, and the result takes the hits of the last step.
 * The test of `overlaps` holds the test of the open boxes, so the hits read the old list `open`. A closed box gives no hit.
 */
const SWEEP = fold(
  axes.list(v("$order")),
  { open: NO_NUMBERS, hits: NO_XY, pairs: NO_XY, n: lit(0) },
  { open: push(LIVE, NEW), hits: HITS, pairs: op("append", v("pairs"), op("take", v("hits"), ROOM)), n: add(v("n"), op("count", v("hits"))) },
  rec({ pairs: op("append", v("pairs"), op("take", v("hits"), ROOM)), count: add(v("n"), op("count", v("hits"))) }),
  undefined,
  ["e"],
);

/**
 * The program of the check `OVERLAP`. It gives one value for the layout at each node. The value holds the pairs of the
 * first findings in the order of ireko, and the count of all the pairs. A pair is an `XY` value: `x` is the first box
 * and `y` is the second box.
 */
export const OVERLAP_PROGRAM: Expr = [
  { $top: subtract(op("count", each(axes.all, ME)), lit(1)) },
  { $roots: CLIP_ROOTS, $ends: ENDS },
  { $lows: LOWS, $sizes: SIZES },
  { $fars: FARS, $entries: ENTRIES },
  SPANS,
  { density: DENSITY },
  { $alongY: ALONG_Y },
  { $order: ORDER, overlaps: OVERLAPS, holds: HOLDS },
  { found: FOUND },
  { $findings: SWEEP },
].reduceRight<Expr>((inner, set) => let_(set, inner), v("$findings"));

/** The kinds of the fields of a node, for the compiler (docs/COMPILER.md §3.2). */
export const OVERLAP_SCHEMA: Schema = {
  fields: { i: "number", x: "number", y: "number", w: "number", h: "number", c: "number", clip: "boolean", last: "number", nested: "boolean" },
  vars: {},
};

/** The domains of the program: numbers, booleans and `XY` values for the boxes and the pairs. */
export const OVERLAP_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain, typeof XYDomain] = [NumDomain, BoolDomain, XYDomain];

/** This function gives the space of the nodes of a run of the program. */
export function overlapRun(nodes: readonly OverlapNode[]): { readonly space: Space } {
  return { space: space.array(nodes.map((b, i) => ({ i, x: b.x, y: b.y, w: b.width, h: b.height, c: b.container, clip: b.clip, last: b.last, nested: b.nested }))) };
}

/** The value of the program at one node. A list in a record keeps the form `VexList` also in a module with plain lists. */
export interface OverlapValue {
  readonly pairs: VexList;
  readonly count: number;
}

/** The findings of a layout: the pairs of boxes in the order of the issues of ireko, and the count of all the pairs. The first box of a pair has the lower position. */
export interface OverlapOutput {
  readonly pairs: readonly (readonly [number, number])[];
  readonly count: number;
}

/** This function gives the findings from the values of the program. Each node has the same value, and no nodes have no findings. */
export function overlapOutput(values: readonly OverlapValue[]): OverlapOutput {
  const found = values[0];
  if (found === undefined) return { pairs: [], count: 0 };
  const pairs = found.pairs.items.map((item): [number, number] => {
    if (!item.result.ok) throw new Error(`${item.result.error.code}: ${item.result.error.message}`);
    const pair = item.result.value as XY;
    return [pair.x, pair.y];
  });
  return { pairs, count: found.count };
}

/** One rectangle of the final bounds, as in ireko: a box of a node, or a point of an edge with no size. */
export type BoundsRect = Pick<PlacedBox, "x" | "y" | "width" | "height">;

/** The first rectangle, read from each position. */
const first = (field: string): Expr => ref(field, [index(0)]);
const FIRST = { at: xy(first("x"), first("y")), size: xy(first("w"), first("h")) };
/** The test of the first step: the first rectangle is the first value of the fold, and a union with itself can change its bits. */
const IS_FIRST = eq(ME, lit(0));
/** The bounds with the rectangle of the step: the corner of `union` of ireko, and the far corner from the old size. */
const NEW_AT = op("min", v("at"), AT);
const NEW_SIZE = subtract(op("max", add(v("at"), v("size")), add(AT, SIZE)), NEW_AT);
/** The value of `clean` of ireko: a number that is almost 0 is 0, and `-0` is 0. */
const CLEAN = fn(["n"], when(lt(op("abs", v("n")), lit(1e-9)), lit(0), v("n")));
const cleaned = (x: Expr): Expr => call("clean", x);

/**
 * The program of the final bounds of ireko: `unionAll` of the boxes and the points of the edges, then `clean` of each
 * number. It gives one value for the layout at each rectangle. A fold keeps the left order of `unionAll`, because the
 * far corner comes from the old corner and the old size. A reduction of the corners can give other bits.
 */
export const BOUNDS_PROGRAM: Expr = let_(
  { clean: CLEAN },
  let_(
    {
      $bounds: fold(
        axes.all,
        { at: FIRST.at, size: FIRST.size },
        { at: when(IS_FIRST, v("at"), NEW_AT), size: when(IS_FIRST, v("size"), NEW_SIZE) },
        rec({ x: cleaned(compX(v("at"))), y: cleaned(compY(v("at"))), width: cleaned(compX(v("size"))), height: cleaned(compY(v("size"))) }),
      ),
    },
    v("$bounds"),
  ),
);

/** The kinds of the fields of a rectangle, for the compiler (docs/COMPILER.md §3.2). */
export const BOUNDS_SCHEMA: Schema = { fields: { i: "number", x: "number", y: "number", w: "number", h: "number" }, vars: {} };

/** The domains of the program: numbers, booleans and `XY` values for the corners and the sizes. */
export const BOUNDS_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain, typeof XYDomain] = [NumDomain, BoolDomain, XYDomain];

/** This function gives the space of a run of the program. The space holds the boxes of the nodes, and then the points of the edges with no size. */
export function boundsRun(nodes: readonly BoundsRect[], points: readonly { readonly x: number; readonly y: number }[]): { readonly space: Space } {
  const rects = [...nodes, ...points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 }))];
  return { space: space.array(rects.map((r, i) => ({ i, x: r.x, y: r.y, w: r.width, h: r.height }))) };
}

/** This function gives the bounds of ireko from the values of the program. No rectangles give `EMPTY_RECT` of ireko. */
export function boundsOutput(values: readonly BoundsRect[]): BoundsRect {
  return values[0] ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** An extra edge between two nodes, by their positions in pre-order. */
export interface TreeEdge {
  readonly source: number;
  readonly target: number;
}

/** The value of the program at one edge: the node that owns it, and the places of the two children that it connects. Each one is -1 when the edge has no owner. */
export interface BetweenValue {
  readonly owner: number;
  readonly from: number;
  readonly to: number;
}

/** The output of `edgesBetweenChildren` of ireko: the edges of each node between its children, and the owner of each edge. */
export interface BetweenOutput {
  readonly between: readonly (readonly { readonly from: number; readonly to: number }[])[];
  readonly owner: readonly number[];
}

/** The parent of each node, from the field of the first edge. */
const parentOf = (x: Expr): Expr => nth(v("$parents"), x);

/** The nodes by their parents. `x` is the parent and `y` is the node. The sort is stable, so the children of a parent keep their order. */
const BY_PARENT = op("sortBy", loop(v("$parents"), ["p", "j"], xy(v("p"), v("j"))), lit({ by: "x" }));
/** The place of the node of a step among its siblings. */
const NEXT_PLACE = when(eq(compX(v("e")), v("prev")), add(v("run"), lit(1)), lit(0));
/**
 * The place of each node among the children of its parent, as the first loop of `edgesBetweenChildren` of ireko. `x` of
 * the fold is the node and `y` is its place, so a second sort gives the places in the order of the nodes.
 */
const PLACES = loop(
  op(
    "sortBy",
    fold(
      axes.list(v("$byParent")),
      { out: NO_XY, prev: lit(-2), run: lit(0) },
      { out: push(v("out"), xy(compY(v("e")), NEXT_PLACE)), prev: compX(v("e")), run: NEXT_PLACE },
      v("out"),
      undefined,
      ["e"],
    ),
    lit({ by: "x" }),
  ),
  ["q"],
  compY(v("q")),
);

/** The largest limit of `iterate` (ITERATE.LIMIT). */
const WALK_MOST = 100000;

/** The test of an edge between two children of the lowest common ancestor. */
const CROSSES = and(op("gte", v("fromChild"), lit(0)), op("gte", v("toChild"), lit(0)));
const ifCrosses = (x: Expr): Expr => when(CROSSES, x, lit(-1));

/**
 * The walk to the lowest common ancestor of the ends of an edge. A parent comes before its children in pre-order, so the
 * end with the higher position is not an ancestor of the other end. Each step moves that end to its parent. The two ends
 * meet at the ancestor, and the names `fromChild` and `toChild` keep the nodes below it. The two paths share no node
 * below the ancestor, so a walk has fewer steps than nodes. The function of ireko marks the ancestors of the source in
 * a map, with the same result.
 *
 * The limit is a number. A data limit over the parents costs one count of the parents at each edge in a module.
 */
const WALK = iterate(
  WALK_MOST,
  { a: ref("s"), b: ref("t"), fromChild: lit(-1), toChild: lit(-1) },
  {
    a: when(gt(v("a"), v("b")), parentOf(v("a")), v("a")),
    b: when(lt(v("a"), v("b")), parentOf(v("b")), v("b")),
    fromChild: when(gt(v("a"), v("b")), v("a"), v("fromChild")),
    toChild: when(lt(v("a"), v("b")), v("b"), v("toChild")),
  },
  rec({ owner: ifCrosses(v("a")), from: ifCrosses(nth(v("$places"), v("fromChild"))), to: ifCrosses(nth(v("$places"), v("toChild"))) }),
  eq(v("a"), v("b")),
);

/**
 * The program of `edgesBetweenChildren` of ireko. It evaluates at each edge, and it gives the node that owns the edge and
 * the places of the two children. The first edge holds the parents in the field `parents`, because a variable of a module
 * cannot be a list. A layout with no edges has no run, as the function of ireko stops before its loop.
 */
export const BETWEEN_PROGRAM: Expr = let_({ $parents: first("parents") }, let_({ $byParent: BY_PARENT }, let_({ $places: PLACES }, WALK)));

/** The kinds of the fields of an edge, for the compiler (docs/COMPILER.md §3.2). */
export const BETWEEN_SCHEMA: Schema = { fields: { s: "number", t: "number", parents: { list: "number" } }, vars: {} };

/** The domains of the program: numbers, booleans and `XY` values for the sort of the nodes. */
export const BETWEEN_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain, typeof XYDomain] = [NumDomain, BoolDomain, XYDomain];

/** This function gives the space of the edges of a run of the program. `parents` has the parent of each node in pre-order, and -1 for the root. */
export function betweenRun(parents: readonly number[], edges: readonly TreeEdge[]): { readonly space: Space } {
  return { space: space.array(edges.map((e, i) => ({ s: e.source, t: e.target, parents: i === 0 ? parents : [] }))) };
}

/** This function gives the record of ireko from the values of the program at the edges, in the order of the edges. */
export function betweenOutput(count: number, values: readonly BetweenValue[]): BetweenOutput {
  const between: { from: number; to: number }[][] = Array.from({ length: count }, () => []);
  for (const { owner, from, to } of values) between[owner]?.push({ from, to });
  return { between, owner: values.map((e) => e.owner) };
}

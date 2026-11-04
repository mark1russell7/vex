/**
 * The ireko route pilot (docs/COMPILER.md §13.3). ireko is at https://github.com/mark1russell7/ireko. Its route pass makes
 * the edges and asks a router for the points of each edge. ireko has the MIT license and the same author.
 *
 * The calculations of the pass are Vex programs:
 *
 * - `EDGE_DIRECTION_PROGRAM` evaluates at each edge. It gives the direction that the engine gives to a router, with the
 *   function `forward` of ireko.
 * - `LABEL_BOX_PROGRAM` evaluates at each container, and it gives the box of its label.
 * - `OBSTACLES_PROGRAM` evaluates at the nodes, and it gives the obstacles of one edge.
 * - `STRAIGHT_PROGRAM` and `ORTHOGONAL_PROGRAM` evaluate at each edge. They give the points of these two routers.
 * - `AVOID_PROGRAM` evaluates at the boxes of one edge, and it gives the points of the router `avoid`.
 * - `cleaned` makes a program that also has the function `clean` of ireko on each point.
 *
 * The rest of the pass is control, and it stays in the host. This part is the loop over the edges, the unique names and
 * the issues. It is also the call of a router of the user, the catch of its throw and the check of its points. The use
 * of `straight` after a failure is control too.
 *
 * The program `AVOID_PROGRAM` differs from the code of ireko in four ways. Each one keeps the result of ireko:
 *
 * - The search is one `iterate` with a phase. The phase 4 takes the first state of the heap. The phases 0 to 3 are the
 *   steps from that state that make a cost lower, and the other steps have no phase. A step of a loop cannot share a
 *   value between its names, so each phase changes few names.
 * - A list holds the cost and the previous state of each state as one `XY` value. A cost of -1 is the `Infinity` of
 *   ireko, because a value `Infinity` gives `#NUM!`.
 * - Each change of an item makes a new list with `each` (the function `setAt`). No op changes one item of a list.
 * - The grids of free points and open steps are maps over the grid. ireko writes the cells of each box into arrays.
 *
 * The result differs from ireko in rare cases. The tests pin each one, but not the limit of the phases:
 *
 * - A value that is not finite gives an error. Thus a ratio of `borderPoint` that overflows gives an error, where ireko
 *   keeps the other ratio. A box or a distance with `NaN` or an infinite number also gives an error. In ireko, that
 *   value goes to its check of the route.
 * - The search has at most 100000 phases, and the grid has at most 50000 points. The op `fill` holds this second limit.
 *   A longer search or a larger grid gives an error. ireko has no limit.
 */
import { app, axes, call, each, fn, fold, index, iterate, let_, lit, ok, rec, ref, space, v, vexList, type Expr, type ItemNames, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, TextDomain, XYDomain } from "@mark1russell7/vex-domains";
import { bindAll } from "./ireko-layers.ts";

/** A rectangle of ireko, as plain data. */
export interface RouteRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A point of a route, as plain data. */
export interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

/** The direction of an edge, as in ireko. */
export type RouteDirection = "down" | "up" | "left" | "right";

/** The input of a router, as `RouteInput` of ireko. The field `id` and the field `kind` have no effect here. */
export interface RouterEdge {
  readonly source: RouteRect;
  readonly target: RouteRect;
  readonly direction?: RouteDirection;
  readonly obstacles?: readonly RouteRect[];
}

/** An edge of the route pass, for the direction that a router gets. */
export interface DirectedEdge {
  readonly kind: "tree" | "extra";
  readonly source: RouteRect;
  readonly target: RouteRect;
  /** The direction of the strategy of the parent of a tree edge. */
  readonly parentDirection?: RouteDirection;
  /** The direction of the flow that owns an extra edge. */
  readonly flow?: RouteDirection;
}

/** A placed node, for the obstacles of an edge. The nodes are in pre-order. */
export interface RouteNode extends RouteRect {
  readonly scale: number;
  readonly label: string;
  readonly mode: "nested" | "linked";
  /** The index of the last child of the node, or -1. */
  readonly lastChild: number;
}

/** The largest number of obstacles of one edge, as `MAX_OBSTACLES` of ireko. */
export const MAX_ROUTE_OBSTACLES = 32;
/** The distance between a route and a box, as `MARGIN` of ireko. */
export const ROUTE_MARGIN = 10;
/** The cost of one bend, as `BEND` of ireko. */
export const ROUTE_BEND = 40;
/** A value smaller than each distance of a layout, as `EPSILON` of ireko. */
export const ROUTE_EPSILON = 1e-6;

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const nth = (list: Expr, i: Expr): Expr => op("nth", list, i);
const eq = (a: Expr, b: Expr): Expr => op("eq", a, b);
const add = (a: Expr, b: Expr): Expr => op("add", a, b);
const subtract = (a: Expr, b: Expr): Expr => op("subtract", a, b);
const multiply = (a: Expr, b: Expr): Expr => op("multiply", a, b);
const half = (a: Expr): Expr => op("divide", a, lit(2));
const abs = (a: Expr): Expr => op("abs", a);
const lt = (a: Expr, b: Expr): Expr => op("lt", a, b);
const gt = (a: Expr, b: Expr): Expr => op("gt", a, b);
const gte = (a: Expr, b: Expr): Expr => op("gte", a, b);
const lte = (a: Expr, b: Expr): Expr => op("lte", a, b);
const and = (...tests: Expr[]): Expr => op("and", ...tests);
const or = (...tests: Expr[]): Expr => op("or", ...tests);
const not = (a: Expr): Expr => op("not", a);
const when = (test: Expr, yes: Expr, no: Expr): Expr => op("if", test, yes, no);
const count = (list: Expr): Expr => op("count", list);
const floorHalf = (a: Expr): Expr => op("floor", half(a));
const mod = (a: Expr, b: Expr): Expr => op("mod", a, b);
const xy = (a: Expr, b: Expr): Expr => op("xy", a, b);
const xOf = (p: Expr): Expr => op("x", p);
const yOf = (p: Expr): Expr => op("y", p);
const one = (x: Expr): Expr => op("fill", lit(1), x);
const push = (list: Expr, x: Expr): Expr => op("append", list, one(x));
const pair = (a: Expr, b: Expr): Expr => op("append", one(a), one(b));
const isDir = (name: string): Expr => eq(v("dir"), lit(name));
const NO_NUMBERS = op("fill", lit(0), lit(0));
const NO_POINTS = op("fill", lit(0), xy(lit(0), lit(0)));
/** A reduction that gives the first error of the list. A box with an error must not leave the list without a sign. */
const STRICT = lit({ strict: true });
/** A list literal of numbers. */
const numbers = (...list: readonly number[]): Expr => lit(vexList(list.map((x, i) => ({ key: String(i), result: ok(x) }))));
/** A map over the items of a list. The names of `as` hold the item and its position. */
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);
/** A fold over the items of a list. The names of `as` hold the item and its position. */
const over = (list: Expr, as: ItemNames, init: Readonly<Record<string, Expr>>, step: Readonly<Record<string, Expr>>, result: Expr): Expr =>
  fold(axes.list(list), init, step, result, undefined, as);

/** The position of the record of the evaluation. */
const ME = ref("i");

/**
 * The value of a pair after a read from a list. The op `xy` gives LOOP.SIZE a value of a fixed size. A read of an item
 * of a loop list has no such fact, so a loop refuses a step that keeps it (gap 1 of the tree pilot).
 */
const fresh = (e: Expr): Expr => let_({ $pair: e }, xy(xOf(v("$pair")), yOf(v("$pair"))));

/** The list `list` with the pair `value` at the position `at`. A step of a loop uses the list one time. */
const setAt = (list: Expr, at: Expr, value: Expr): Expr => let_({ $new: fresh(value) }, loop(list, ["$item", "$at"], when(eq(v("$at"), at), v("$new"), v("$item"))));

/** The list `list` with the items at the positions `a` and `b` swapped. */
const swap = (list: Expr, a: Expr, b: Expr): Expr =>
  let_({ $a: fresh(nth(list, a)), $b: fresh(nth(list, b)) }, loop(list, ["$item", "$at"], when(eq(v("$at"), a), v("$b"), when(eq(v("$at"), b), v("$a"), v("$item")))));

/** The names of an edge: the two boxes and the direction, from the fields of one record. */
const EDGE_NAMES = {
  sx: ref("sx"),
  sy: ref("sy"),
  sw: ref("sw"),
  sh: ref("sh"),
  tx: ref("tx"),
  ty: ref("ty"),
  tw: ref("tw"),
  th: ref("th"),
  dir: ref("dir"),
};

/** The function `contains` of ireko, with a tolerance of 0. */
const CONTAINS = fn(
  ["ox", "oy", "ow", "oh", "ix", "iy", "iw", "ih"],
  and(gte(v("ix"), v("ox")), gte(v("iy"), v("oy")), lte(add(v("ix"), v("iw")), add(v("ox"), v("ow"))), lte(add(v("iy"), v("ih")), add(v("oy"), v("oh")))),
);

const RATIO_X = op("divide", half(v("w")), abs(v("$dx")));
const RATIO_Y = op("divide", half(v("h")), abs(v("$dy")));

/** The function `borderPoint` of ireko. A value `Infinity` gives `#NUM!`, so the tests choose the ratio that exists. */
const BORDER = fn(
  ["x", "y", "w", "h", "px", "py"],
  bindAll(
    [
      { $cx: add(v("x"), half(v("w"))), $cy: add(v("y"), half(v("h"))) },
      { $dx: subtract(v("px"), v("$cx")), $dy: subtract(v("py"), v("$cy")) },
    ],
    when(
      and(eq(v("$dx"), lit(0)), eq(v("$dy"), lit(0))),
      xy(v("$cx"), v("$cy")),
      let_(
        { $t: when(eq(v("$dx"), lit(0)), RATIO_Y, when(eq(v("$dy"), lit(0)), RATIO_X, op("min", RATIO_X, RATIO_Y))) },
        xy(add(v("$cx"), multiply(v("$dx"), v("$t"))), add(v("$cy"), multiply(v("$dy"), v("$t")))),
      ),
    ),
  ),
);

/** A point with the cross value `c` and the main value `m`. The main axis is y when `vertical` is true. */
const POINT_ON = fn(["vertical", "c", "m"], when(v("vertical"), xy(v("c"), v("m")), xy(v("m"), v("c"))));

/**
 * The points between the place `m0` at the cross value `c0` and the place `m1` at the cross value `c1`. The result is one
 * segment on one line, or a turn at the middle. ireko writes this calculation two times, one time for each axis.
 */
const LINE = fn(
  ["vertical", "c0", "c1", "m0", "m1"],
  when(
    eq(v("c0"), v("c1")),
    pair(call("pointOn", v("vertical"), v("c0"), v("m0")), call("pointOn", v("vertical"), v("c1"), v("m1"))),
    let_(
      { $mid: half(add(v("m0"), v("m1"))) },
      op(
        "append",
        pair(call("pointOn", v("vertical"), v("c0"), v("m0")), call("pointOn", v("vertical"), v("c0"), v("$mid"))),
        pair(call("pointOn", v("vertical"), v("c1"), v("$mid")), call("pointOn", v("vertical"), v("c1"), v("m1"))),
      ),
    ),
  ),
);

/** The place where an edge leaves the source, on the main axis. */
const LEAVES = fn(["vertical", "ahead"], when(v("vertical"), when(v("ahead"), add(v("sy"), v("sh")), v("sy")), when(v("ahead"), add(v("sx"), v("sw")), v("sx"))));
/** The place where an edge enters the target, on the main axis. */
const ENTERS = fn(["vertical", "ahead"], when(v("vertical"), when(v("ahead"), v("ty"), add(v("ty"), v("th"))), when(v("ahead"), v("tx"), add(v("tx"), v("tw")))));

/** The functions of the routers `straight` and `orthogonal`. */
const ROUTER_FUNCTIONS = { contains: CONTAINS, border: BORDER, pointOn: POINT_ON };
const ROUTE_FUNCTIONS = { line: LINE, leaves: LEAVES, enters: ENTERS };

/** The centers of the two boxes and the test of nested boxes. */
const CENTERS = {
  $ax: add(v("sx"), half(v("sw"))),
  $ay: add(v("sy"), half(v("sh"))),
  $bx: add(v("tx"), half(v("tw"))),
  $by: add(v("ty"), half(v("th"))),
  $nestedPair: or(
    call("contains", v("sx"), v("sy"), v("sw"), v("sh"), v("tx"), v("ty"), v("tw"), v("th")),
    call("contains", v("tx"), v("ty"), v("tw"), v("th"), v("sx"), v("sy"), v("sw"), v("sh")),
  ),
};

const CENTER_LINE = pair(xy(v("$ax"), v("$ay")), xy(v("$bx"), v("$by")));

/** The route of the router `straight`. */
const STRAIGHT = when(v("$nestedPair"), CENTER_LINE, pair(call("border", v("sx"), v("sy"), v("sw"), v("sh"), v("$bx"), v("$by")), call("border", v("tx"), v("ty"), v("tw"), v("th"), v("$ax"), v("$ay"))));

const crossOfSource = (vertical: Expr): Expr => when(vertical, v("$ax"), v("$ay"));
const crossOfTarget = (vertical: Expr): Expr => when(vertical, v("$bx"), v("$by"));

/** The names of the elbow of a tree edge, as the function `elbow` of ireko. */
const ELBOW_NAMES = {
  $elbowVertical: or(isDir("down"), isDir("up")),
  $elbowAhead: or(isDir("down"), isDir("right")),
};
const ELBOW_PLACES = {
  $elbowFrom: call("leaves", v("$elbowVertical"), v("$elbowAhead")),
  $elbowTo: call("enters", v("$elbowVertical"), v("$elbowAhead")),
};
const ELBOW_FITS = and(not(eq(v("dir"), lit(""))), when(v("$elbowAhead"), gt(v("$elbowTo"), v("$elbowFrom")), lt(v("$elbowTo"), v("$elbowFrom"))));
const ELBOW = call("line", v("$elbowVertical"), crossOfSource(v("$elbowVertical")), crossOfTarget(v("$elbowVertical")), v("$elbowFrom"), v("$elbowTo"));

/** The route of an edge that has no direction: on the axis with the larger distance. */
const FACING = bindAll(
  [
    { $dx: subtract(v("$bx"), v("$ax")), $dy: subtract(v("$by"), v("$ay")) },
    { $vertical: gte(abs(v("$dy")), abs(v("$dx"))) },
    { $ahead: gt(when(v("$vertical"), v("$dy"), v("$dx")), lit(0)) },
    { $from: call("leaves", v("$vertical"), v("$ahead")), $to: call("enters", v("$vertical"), v("$ahead")) },
  ],
  when(
    // The boxes overlap on this axis: there is no gap for the turn.
    when(v("$ahead"), lt(v("$to"), v("$from")), gt(v("$to"), v("$from"))),
    STRAIGHT,
    call("line", v("$vertical"), crossOfSource(v("$vertical")), crossOfTarget(v("$vertical")), v("$from"), v("$to")),
  ),
);

/** The route of the router `orthogonal`. */
const ORTHOGONAL = when(v("$nestedPair"), CENTER_LINE, when(ELBOW_FITS, ELBOW, FACING));

/** The kinds of the fields of an edge of `straight` or `orthogonal`, for the compiler (docs/COMPILER.md §3.2). */
export const ROUTER_SCHEMA: Schema = {
  fields: { sx: "number", sy: "number", sw: "number", sh: "number", tx: "number", ty: "number", tw: "number", th: "number", dir: "string" },
  vars: {},
};

/** The program of the router `straight`. It evaluates at each edge, and it gives the points of the edge. */
export const STRAIGHT_PROGRAM: Expr = bindAll([EDGE_NAMES, ROUTER_FUNCTIONS, CENTERS], STRAIGHT);

/** The program of the router `orthogonal`. It evaluates at each edge, and it gives the points of the edge. */
export const ORTHOGONAL_PROGRAM: Expr = bindAll([EDGE_NAMES, ROUTER_FUNCTIONS, ROUTE_FUNCTIONS, CENTERS, ELBOW_NAMES, ELBOW_PLACES], ORTHOGONAL);

/** The function `clean` of ireko. The test takes -0 too, so the value 0 replaces it. */
const clean = (a: Expr): Expr => let_({ $value: a }, when(lt(abs(v("$value")), lit(1e-9)), lit(0), v("$value")));

/** This function gives the program `points` with the function `clean` of ireko on each point, as the route pass does. */
export const cleaned = (points: Expr): Expr => loop(points, ["$point"], xy(clean(xOf(v("$point"))), clean(yOf(v("$point")))));

/** The function `forward` of ireko on the two boxes of an edge, for the direction in the name `flow`. */
const FORWARD = when(
  eq(v("flow"), lit("down")),
  gte(v("ty"), add(v("sy"), v("sh"))),
  when(eq(v("flow"), lit("up")), lte(add(v("ty"), v("th")), v("sy")), when(eq(v("flow"), lit("right")), gte(v("tx"), add(v("sx"), v("sw"))), lte(add(v("tx"), v("tw")), v("sx")))),
);

/** The program of the direction of an edge. It evaluates at each edge, and an empty text is no direction. */
export const EDGE_DIRECTION_PROGRAM: Expr = bindAll(
  [EDGE_NAMES, { flow: ref("flow") }],
  when(ref("tree"), ref("parentDir"), when(and(not(eq(v("flow"), lit(""))), FORWARD), v("flow"), lit(""))),
);

/** The kinds of the fields of an edge of the program of the direction. */
export const EDGE_DIRECTION_SCHEMA: Schema = {
  fields: { ...ROUTER_SCHEMA.fields, tree: "boolean", parentDir: "string", flow: "string" },
  vars: {},
};

/** A table of ireko as a list literal of code points. */
const codes = (text: string): Expr => numbers(...Array.from(text, (ch) => ch.codePointAt(0) ?? 0));
const NARROW = codes("ijl.,:;|!'`");
const SEMI = codes('ftrI()[]{}-/\\"');
const WIDE = codes("mwMW@%");

const has = (table: Expr): Expr => gte(op("ifError", op("indexOf", table, v("$code")), lit(-1)), lit(0));
const within = (low: string, high: string): Expr => and(gte(v("$code"), lit(low.codePointAt(0) ?? 0)), lte(v("$code"), lit(high.codePointAt(0) ?? 0)));

/** The width of the character in the name `$code`, as `widthOfCharacter` of ireko. */
const WIDTH = when(
  eq(v("$code"), lit(32)),
  lit(0.28),
  when(
    has(NARROW),
    lit(0.27),
    when(
      has(SEMI),
      lit(0.36),
      when(
        has(WIDE),
        lit(0.86),
        when(within("A", "Z"), lit(0.66), when(within("0", "9"), lit(0.56), when(within("a", "z"), lit(0.52), when(gte(v("$code"), lit(0x2e80)), lit(1), lit(0.6))))),
      ),
    ),
  ),
);

/** The sum of the widths of the characters of the label of the focus, in parts of the size of the font. */
const EM = over(op("codePoints", ref("label")), ["$code"], { $em: lit(0) }, { $em: add(v("$em"), WIDTH) }, v("$em"));

const SCALED = (factor: number): Expr => multiply(lit(factor), ref("scale"));

/** The function `labelBoxOf` of ireko, at the focus. */
const LABEL_BOX = let_(
  { $size: SCALED(13) },
  rec({
    x: add(ref("x"), SCALED(4)),
    y: add(ref("y"), SCALED(2)),
    width: op("min", subtract(ref("width"), SCALED(8)), add(multiply(EM, v("$size")), SCALED(8))),
    height: add(v("$size"), SCALED(8)),
  }),
);

/** The program of the box of a label. It evaluates at each container. */
export const LABEL_BOX_PROGRAM: Expr = LABEL_BOX;

/** The end of the subtree of each node, from the last node to the first. In the pre-order, a subtree is a range of indexes. */
const SUBTREE_ENDS = fold(
  axes.reverse(axes.all),
  { out: NO_NUMBERS },
  { out: push(v("out"), when(lt(ref("last"), lit(0)), add(ME, lit(1)), nth(v("out"), subtract(subtract(v("$n"), lit(1)), ref("last"))))) },
  v("out"),
);

/** The test of `holds` of ireko: the node `a` is a nested container of the node `b`. */
const HOLDS = fn(["a", "b"], and(gt(v("b"), v("a")), lt(v("b"), nth(v("$ends"), subtract(subtract(v("$n"), lit(1)), v("a")))), ref("nested", [index(v("a"))])));

const atNode = (field: string, node: string): Expr => ref(field, [index(v(node))]);
const middleOf = (at: string, size: string): Expr => half(add(add(add(atNode(at, "s"), half(atNode(size, "s"))), atNode(at, "t")), half(atNode(size, "t"))));

/** The test of a node that counts for the edge: not an end, and not inside a nested end. */
const NOT_END = and(not(eq(ME, v("s"))), not(eq(ME, v("t"))), not(call("holds", v("s"), ME)), not(call("holds", v("t"), ME)));
const HOLDS_END = or(call("holds", ME, v("s")), call("holds", ME, v("t")));

/** The distance from the center of the focus to the middle of the edge. */
const DISTANCE = op("hypot", subtract(add(ref("x"), half(ref("width"))), v("$midX")), subtract(add(ref("y"), half(ref("height"))), v("$midY")));

/** The first records by their distance. A `sortBy` keeps the keys, so the body of the axis `list` reads each record. */
const NEAREST = each(
  axes.list(op("take", op("sortBy", each(axes.where(axes.all, and(NOT_END, not(HOLDS_END))), DISTANCE), STRICT), lit(MAX_ROUTE_OBSTACLES))),
  rec({ x: ref("x"), y: ref("y"), width: ref("width"), height: ref("height") }),
);

/** The program of the obstacles of the edge from the node `s` to the node `t`. It evaluates at the first node. */
export const OBSTACLES_PROGRAM: Expr = bindAll(
  [
    { $n: count(each(axes.all, lit(0))) },
    { $ends: SUBTREE_ENDS },
    { holds: HOLDS, $midX: middleOf("x", "width"), $midY: middleOf("y", "height") },
  ],
  op("append", NEAREST, each(axes.where(axes.all, and(NOT_END, HOLDS_END)), LABEL_BOX)),
);

/** The kinds of the fields of a node and of the variables, for the compiler. */
export const OBSTACLES_SCHEMA: Schema = {
  fields: { i: "number", x: "number", y: "number", width: "number", height: "number", scale: "number", nested: "boolean", last: "number", label: "string" },
  vars: { s: "number", t: "number" },
};

/** The kinds of the fields of a container for the program of the box of a label. */
export const LABEL_BOX_SCHEMA: Schema = {
  fields: { x: "number", y: "number", width: "number", height: "number", scale: "number", label: "string" },
  vars: {},
};

// The router avoid. The sides have the positions of SIDES of ireko: bottom, right, top and left.
const OUT_X = numbers(0, 1, 0, -1);
const OUT_Y = numbers(1, 0, -1, 0);
const ALL_SIDES = numbers(0, 1, 2, 3);
/** The sides of a direction, as `FROM` of ireko. The side of the child, as `INTO` of ireko, is the opposite side. */
const FROM_SIDE = when(isDir("down"), lit(0), when(isDir("right"), lit(1), when(isDir("up"), lit(2), lit(3))));
/** The steps of the search, as `STEPS` of ireko: the change of the column, the change of the row, and the axis. */
const STEP_I = numbers(1, -1, 0, 0);
const STEP_J = numbers(0, 0, 1, -1);
const STEP_AXIS = numbers(0, 0, 1, 1);
const MARGIN = lit(ROUTE_MARGIN);
const BEND = lit(ROUTE_BEND);
const EPSILON = lit(ROUTE_EPSILON);
const POP = lit(4);

const grownSize = (size: Expr): Expr => add(size, multiply(lit(2), MARGIN));
const BOX_X = subtract(ref("x"), MARGIN);
const BOX_Y = subtract(ref("y"), MARGIN);
const BOX_RIGHT = add(BOX_X, grownSize(ref("width")));
const BOX_BOTTOM = add(BOX_Y, grownSize(ref("height")));

const atBox = (field: string, box: string): Expr => ref(field, [index(v(box))]);

/** The names of the two ends: the last two records. */
const AVOID_ENDS = [
  { $n: count(each(axes.all, lit(0))) },
  { $sourceAt: subtract(v("$n"), lit(2)), $targetAt: subtract(v("$n"), lit(1)) },
  {
    sx: atBox("x", "$sourceAt"),
    sy: atBox("y", "$sourceAt"),
    sw: atBox("width", "$sourceAt"),
    sh: atBox("height", "$sourceAt"),
    tx: atBox("x", "$targetAt"),
    ty: atBox("y", "$targetAt"),
    tw: atBox("width", "$targetAt"),
    th: atBox("height", "$targetAt"),
  },
];

/** The function `portOf` of ireko on one axis. */
const PORT = fn(["at", "size", "out"], add(add(v("at"), half(v("size"))), half(multiply(v("out"), v("size")))));
/** The function `stubOf` of ireko on one axis. */
const STUB = fn(["at", "size", "out"], add(call("port", v("at"), v("size"), v("out")), multiply(v("out"), MARGIN)));

/** The stubs of a list of sides on one axis. */
const stubs = (sides: string, at: string, size: string, out: Expr): Expr => loop(v(sides), ["$side"], call("stub", v(at), v(size), nth(out, v("$side"))));

/** The function `axis` of ireko. */
const AXIS = fn(
  ["values"],
  let_(
    { $sorted: op("sortBy", v("values"), STRICT) },
    over(
      v("$sorted"),
      ["$value", "$at"],
      { kept: NO_NUMBERS },
      { kept: when(or(eq(v("$at"), lit(0)), gt(subtract(v("$value"), nth(v("$sorted"), subtract(v("$at"), lit(1)))), EPSILON)), push(v("kept"), v("$value")), v("kept")) },
      v("kept"),
    ),
  ),
);

/** The function `find` of ireko: the binary search. */
const FIND = fn(
  ["sorted", "value"],
  let_(
    { $last: subtract(count(v("sorted")), lit(1)) },
    iterate(
      64,
      { lo: lit(0), hi: v("$last") },
      {
        lo: let_({ $mid: floorHalf(add(v("lo"), v("hi"))) }, when(lt(nth(v("sorted"), v("$mid")), subtract(v("value"), EPSILON)), add(v("$mid"), lit(1)), v("lo"))),
        hi: let_({ $mid: floorHalf(add(v("lo"), v("hi"))) }, when(lt(nth(v("sorted"), v("$mid")), subtract(v("value"), EPSILON)), v("hi"), v("$mid"))),
      },
      v("lo"),
      gte(v("lo"), v("hi")),
    ),
  ),
);

/** The first position of a value within `EPSILON`, as `findIndex` of ireko, or -1. */
const FIRST_NEAR = fn(
  ["list", "value"],
  over(v("list"), ["$near", "$at"], { found: lit(-1) }, { found: when(and(lt(v("found"), lit(0)), lte(abs(subtract(v("$near"), v("value"))), EPSILON)), v("$at"), v("found")) }, v("found")),
);

/** The function `indexOf` of the search of ireko. */
const GRID_INDEX = fn(
  ["px", "py"],
  let_(
    { $column: call("firstNear", v("$xs"), v("px")), $row: call("firstNear", v("$ys"), v("py")) },
    when(or(lt(v("$column"), lit(0)), lt(v("$row"), lit(0))), lit(-1), add(multiply(v("$row"), v("$w")), v("$column"))),
  ),
);

/** The columns of each grown box as `xy(first, last)`. A module cannot hold a second domain of objects, so the rows have their own list. */
const COLUMNS = fold(axes.all, { out: NO_POINTS }, { out: push(v("out"), xy(call("find", v("$xs"), BOX_X), call("find", v("$xs"), BOX_RIGHT))) }, v("out"));
/** The rows of each grown box as `xy(first, last)`. */
const ROWS = fold(axes.all, { out: NO_POINTS }, { out: push(v("out"), xy(call("find", v("$ys"), BOX_Y), call("find", v("$ys"), BOX_BOTTOM))) }, v("out"));

const I = v("$i");
const J = v("$j");
const FROM = xOf(v("$columns"));
const TO = yOf(v("$columns"));
const LOW = xOf(v("$rows"));
const HIGH = yOf(v("$rows"));

/** A map over the points of the grid. Its value tells if no box passes the test. */
const clearOf = (test: Expr): Expr =>
  loop(
    op("fill", multiply(v("$w"), v("$h")), lit(0)),
    ["$unused", "$k"],
    let_(
      { $i: mod(v("$k"), v("$w")), $j: op("floor", op("divide", v("$k"), v("$w"))) },
      over(v("$columnRanges"), ["$columns", "$box"], { clear: lit(true) }, { clear: and(v("clear"), not(let_({ $rows: nth(v("$rowRanges"), v("$box")) }, test))) }, v("clear")),
    ),
  );

/** The test of an open step between neighbor points, as `open` of ireko. */
const OPEN = fn(
  ["i", "j", "di", "dj"],
  let_(
    { $l: add(v("i"), v("di")), $k: add(v("j"), v("dj")) },
    and(
      gte(v("$l"), lit(0)),
      lt(v("$l"), v("$w")),
      gte(v("$k"), lit(0)),
      lt(v("$k"), v("$h")),
      nth(v("$free"), add(multiply(v("$k"), v("$w")), v("$l"))),
      when(
        eq(v("di"), lit(0)),
        nth(v("$openY"), add(multiply(op("min", v("j"), v("$k")), v("$w")), v("i"))),
        nth(v("$openX"), add(multiply(v("j"), v("$w")), op("min", v("i"), v("$l")))),
      ),
    ),
  ),
);

const columnOf = (g: Expr): Expr => mod(g, v("$w"));
const rowOf = (g: Expr): Expr => op("floor", op("divide", g, v("$w")));
const gridOf = (state: Expr): Expr => op("floor", op("divide", state, lit(2)));

/** The function `estimate` of ireko, for the state in the parameter. */
const ESTIMATE = fn(
  ["state"],
  let_(
    { $g: gridOf(v("state")) },
    op(
      "min",
      loop(
        v("$goals"),
        ["$goal"],
        add(
          abs(subtract(nth(v("$xs"), columnOf(xOf(v("$goal")))), nth(v("$xs"), columnOf(v("$g"))))),
          abs(subtract(nth(v("$ys"), rowOf(xOf(v("$goal")))), nth(v("$ys"), rowOf(v("$g"))))),
        ),
      ),
    ),
  ),
);

const keyAt = (heap: Expr, i: Expr): Expr => yOf(nth(heap, i));
const parentOf = (i: Expr): Expr => floorHalf(subtract(i, lit(1)));

/** The loop of `Heap.push` of ireko. The parameter `start` is the heap, and `from` is the position of the new item. */
const SIFT_UP = fn(
  ["start", "from"],
  iterate(
    64,
    { heap: v("start"), at: v("from") },
    { heap: swap(v("heap"), v("at"), parentOf(v("at"))), at: parentOf(v("at")) },
    v("heap"),
    or(eq(v("at"), lit(0)), lte(keyAt(v("heap"), parentOf(v("at"))), keyAt(v("heap"), v("at")))),
  ),
);

/** The position of the child that replaces the item at the position `at`, or `at`, as `Heap.pop` of ireko. */
const SMALLER = fn(
  ["items", "at"],
  bindAll(
    [
      { $left: add(multiply(lit(2), v("at")), lit(1)), $size: count(v("items")) },
      { $right: add(v("$left"), lit(1)) },
      { $m: when(and(lt(v("$left"), v("$size")), lt(keyAt(v("items"), v("$left")), keyAt(v("items"), v("at")))), v("$left"), v("at")) },
    ],
    when(and(lt(v("$right"), v("$size")), lt(keyAt(v("items"), v("$right")), keyAt(v("items"), v("$m")))), v("$right"), v("$m")),
  ),
);

/** The loop of `Heap.pop` of ireko. */
const SIFT_DOWN = fn(
  ["start"],
  iterate(
    64,
    { heap: v("start"), at: lit(0) },
    { heap: swap(v("heap"), v("at"), call("smaller", v("heap"), v("at"))), at: call("smaller", v("heap"), v("at")) },
    v("heap"),
    eq(call("smaller", v("heap"), v("at")), v("at")),
  ),
);

/** The function `Heap.pop` of ireko, without the first item as its value. The heap has one item or more. */
const POP_HEAP = fn(
  ["start"],
  let_(
    { $size: subtract(count(v("start")), lit(1)) },
    call("siftDown", setAt(op("take", v("start"), v("$size")), lit(0), nth(v("start"), v("$size")))),
  ),
);

/** The function `Heap.push` of ireko. */
const PUSH_HEAP = fn(["start", "item"], call("siftUp", op("append", v("start"), one(v("item"))), count(v("start"))));

/** The state after the step `d` from the state in the parameter. */
const NEXT_STATE = fn(
  ["state", "d"],
  let_(
    { $g: gridOf(v("state")) },
    add(
      multiply(add(multiply(add(rowOf(v("$g")), nth(STEP_J, v("d"))), v("$w")), add(columnOf(v("$g")), nth(STEP_I, v("d")))), lit(2)),
      nth(STEP_AXIS, v("d")),
    ),
  ),
);

/** The cost of the step `d` from the state in the parameter, if the step is open and makes the cost lower, or -1. */
const NEW_COST = fn(
  ["cells", "state", "d"],
  bindAll(
    [
      { $g: gridOf(v("state")), $axis: nth(STEP_AXIS, v("d")), $di: nth(STEP_I, v("d")), $dj: nth(STEP_J, v("d")) },
      { $col: columnOf(v("$g")), $row: rowOf(v("$g")) },
    ],
    when(
      not(call("open", v("$col"), v("$row"), v("$di"), v("$dj"))),
      lit(-1),
      let_(
        {
          $length: add(
            abs(subtract(nth(v("$xs"), add(v("$col"), v("$di"))), nth(v("$xs"), v("$col")))),
            abs(subtract(nth(v("$ys"), add(v("$row"), v("$dj"))), nth(v("$ys"), v("$row")))),
          ),
          $bend: when(eq(v("$axis"), mod(v("state"), lit(2))), lit(0), BEND),
          $old: xOf(nth(v("cells"), call("next", v("state"), v("d")))),
        },
        let_(
          { $cost: add(add(xOf(nth(v("cells"), v("state"))), v("$length")), v("$bend")) },
          when(or(lt(v("$old"), lit(0)), lt(v("$cost"), v("$old"))), v("$cost"), lit(-1)),
        ),
      ),
    ),
  ),
);

/** The first step at or after `from` that makes a cost lower, or the phase `POP`. A step changes only the cost of its own target. */
const FIRST_STEP = fn(
  ["cells", "state", "from"],
  over(
    ALL_SIDES,
    ["$unused", "d"],
    { first: POP },
    { first: when(and(eq(v("first"), POP), gte(v("d"), v("from")), gte(call("newCost", v("cells"), v("state"), v("d")), lit(0))), v("d"), v("first")) },
    v("first"),
  ),
);

/** The axis of the last segment into the goal at the grid index in the parameter, or -1. */
const GOAL_AXIS = fn(
  ["g"],
  over(v("$goals"), ["$goal"], { axis: lit(-1) }, { axis: when(eq(xOf(v("$goal")), v("g")), when(eq(mod(yOf(v("$goal")), lit(2)), lit(0)), lit(1), lit(0)), v("axis")) }, v("axis")),
);

/** The cost of the route that ends at the state in the parameter, or -1 for a state that is no better goal. */
const NEW_BEST = fn(
  ["state", "cost", "bestCost"],
  let_(
    { $axis: call("goalAxis", gridOf(v("state"))) },
    when(
      lt(v("$axis"), lit(0)),
      lit(-1),
      let_(
        { $total: add(v("cost"), when(eq(v("$axis"), mod(v("state"), lit(2))), lit(0), BEND)) },
        when(or(lt(v("bestCost"), lit(0)), lt(v("$total"), v("bestCost"))), v("$total"), lit(-1)),
      ),
    ),
  ),
);

/** The side at the state of a first item, for the names of a start. */
const SEED_STATE = fn(["g", "side"], add(multiply(v("g"), lit(2)), when(eq(mod(v("side"), lit(2)), lit(0)), lit(1), lit(0))));

/** The first states of the search, as `xy(state, cost)`. A side that faces away from the target costs one bend more. */
const SEEDS = over(
  v("$startSides"),
  ["$side", "$at"],
  { out: NO_POINTS },
  {
    out: let_(
      { $g: call("gridIndex", nth(v("$startX"), v("$at")), nth(v("$startY"), v("$at"))) },
      when(
        and(gte(v("$g"), lit(0)), nth(v("$free"), v("$g"))),
        push(
          v("out"),
          xy(
            call("seedState", v("$g"), v("$side")),
            when(lt(add(multiply(nth(OUT_X, v("$side")), v("$towardX")), multiply(nth(OUT_Y, v("$side")), v("$towardY"))), lit(0)), BEND, lit(0)),
          ),
        ),
        v("out"),
      ),
    ),
  },
  v("out"),
);

/** The goals, as `xy(grid index, side)`. */
const GOALS = over(
  v("$endSides"),
  ["$side", "$at"],
  { out: NO_POINTS },
  {
    out: let_(
      { $g: call("gridIndex", nth(v("$endX"), v("$at")), nth(v("$endY"), v("$at"))) },
      when(and(gte(v("$g"), lit(0)), nth(v("$free"), v("$g"))), push(v("out"), xy(v("$g"), v("$side"))), v("out")),
    ),
  },
  v("out"),
);

const EMPTY = eq(count(v("heap")), lit(0));
const AT_POP = eq(v("phase"), POP);
const TOP = xOf(nth(v("heap"), lit(0)));
const TOP_COST = xOf(nth(v("cells"), TOP));
/** The new cost of the step of the name `phase`. The phase is a step that makes the cost lower. */
const RELAX = call("newCost", v("cells"), v("state"), v("phase"));
const NEXT = call("next", v("state"), v("phase"));

/** The test of the end of a search, as the `break` of the loop of ireko. */
const FINISHED = or(EMPTY, and(gte(v("bestCost"), lit(0)), gte(TOP_COST, v("bestCost"))));

/** The search. A cost of the name `bestCost` of -1 is `Infinity`. The result is `FOUND`, or the route of `orthogonal`. */
const searchWith = (found: Expr): Expr =>
  iterate(
    100000,
    { cells: v("$cells0"), heap: v("$heap0"), state: lit(-1), phase: POP, best: lit(-1), bestCost: lit(-1), done: lit(false) },
    {
      phase: when(AT_POP, when(FINISHED, POP, call("firstStep", v("cells"), TOP, lit(0))), call("firstStep", v("cells"), v("state"), add(v("phase"), lit(1)))),
      done: when(AT_POP, FINISHED, lit(false)),
      state: when(and(AT_POP, not(EMPTY)), TOP, v("state")),
      best: when(and(AT_POP, not(FINISHED)), when(gte(call("newBest", TOP, TOP_COST, v("bestCost")), lit(0)), TOP, v("best")), v("best")),
      bestCost: when(and(AT_POP, not(FINISHED)), let_({ $total: call("newBest", TOP, TOP_COST, v("bestCost")) }, when(gte(v("$total"), lit(0)), v("$total"), v("bestCost"))), v("bestCost")),
      heap: when(
        AT_POP,
        when(EMPTY, v("heap"), call("popHeap", v("heap"))),
        let_({ $next: NEXT }, call("pushHeap", v("heap"), xy(v("$next"), add(RELAX, call("estimate", v("$next")))))),
      ),
      cells: when(AT_POP, v("cells"), setAt(v("cells"), NEXT, xy(RELAX, v("state")))),
    },
    when(lt(v("best"), lit(0)), ORTHOGONAL, found),
    v("done"),
  );

/** The states of the route, from the last to the first, as points. */
const TRAIL = iterate(
  100000,
  { at: v("best"), trail: NO_POINTS },
  {
    at: yOf(nth(v("cells"), v("at"))),
    trail: let_({ $g: gridOf(v("at")) }, push(v("trail"), xy(nth(v("$xs"), columnOf(v("$g"))), nth(v("$ys"), rowOf(v("$g")))))),
  },
  v("trail"),
  lt(v("at"), lit(0)),
);

const near = (a: Expr, b: Expr): Expr => lte(abs(subtract(a, b)), EPSILON);

/** The side of the first start at the first point of the path, as `starts.find` of ireko. */
const FIRST_SIDE = over(
  v("$startSides"),
  ["$side", "$at"],
  { side: lit(-1) },
  { side: when(and(lt(v("side"), lit(0)), near(nth(v("$startX"), v("$at")), xOf(v("$begin"))), near(nth(v("$startY"), v("$at")), yOf(v("$begin")))), v("$side"), v("side")) },
  v("side"),
);

/** The side of the goal of the best state, as `goals.get` of ireko. */
const LAST_SIDE = let_(
  { $g: gridOf(v("best")) },
  over(v("$goals"), ["$goal"], { side: lit(-1) }, { side: when(eq(xOf(v("$goal")), v("$g")), yOf(v("$goal")), v("side")) }, v("side")),
);

const portOf = (at: string, size: string, sideName: string, out: Expr): Expr => call("port", v(at), v(size), nth(out, v(sideName)));

/** The function `simplify` of ireko. */
const SIMPLIFY = fn(
  ["points"],
  over(
    v("points"),
    ["$p"],
    { out: NO_POINTS },
    {
      out: bindAll(
        [{ $size: count(v("out")), $px: xOf(v("$p")), $py: yOf(v("$p")) }, { $lastAt: subtract(v("$size"), lit(1)) }],
        when(
          and(gte(v("$size"), lit(1)), near(xOf(nth(v("out"), v("$lastAt"))), v("$px")), near(yOf(nth(v("out"), v("$lastAt"))), v("$py"))),
          v("out"),
          when(
            and(
              gte(v("$size"), lit(2)),
              or(
                and(near(xOf(nth(v("out"), subtract(v("$lastAt"), lit(1)))), xOf(nth(v("out"), v("$lastAt")))), near(xOf(nth(v("out"), v("$lastAt"))), v("$px"))),
                and(near(yOf(nth(v("out"), subtract(v("$lastAt"), lit(1)))), yOf(nth(v("out"), v("$lastAt")))), near(yOf(nth(v("out"), v("$lastAt"))), v("$py"))),
              ),
            ),
            push(op("take", v("out"), v("$lastAt")), xy(v("$px"), v("$py"))),
            push(v("out"), xy(v("$px"), v("$py"))),
          ),
        ),
      ),
    },
    v("out"),
  ),
);

/** The route from the port of the source, through the grid, to the port of the target. */
const FOUND = bindAll(
  [
    { $path: each(axes.reverse(axes.list(TRAIL)), v("$point"), undefined, ["$point"]) },
    { $begin: nth(v("$path"), lit(0)) },
    { $firstSide: FIRST_SIDE, $lastSide: LAST_SIDE },
  ],
  call(
    "simplify",
    op(
      "append",
      one(xy(portOf("sx", "sw", "$firstSide", OUT_X), portOf("sy", "sh", "$firstSide", OUT_Y))),
      op("append", v("$path"), one(xy(portOf("tx", "tw", "$lastSide", OUT_X), portOf("ty", "th", "$lastSide", OUT_Y)))),
    ),
  ),
);

/** The grid lines of one axis, as the function `search` of ireko. */
const gridLines = (low: Expr, high: Expr, stubsName: string): Expr => {
  const ends = fold(axes.all, { out: NO_NUMBERS }, { out: push(push(v("out"), low), high) }, v("out"));
  return bindAll(
    [
      { $edges: each(axes.all, low), $far: each(axes.all, high) },
      {
        $first: subtract(op("min", op("append", v("$edges"), v(stubsName)), STRICT), MARGIN),
        $last: add(op("max", op("append", v("$far"), v(stubsName)), STRICT), MARGIN),
      },
    ],
    call("axis", op("append", pair(v("$first"), v("$last")), op("append", ends, v(stubsName)))),
  );
};

/**
 * The program of the router `avoid`. It evaluates at the boxes of one edge: the obstacles, then the source, then the
 * target. It gives the same value at each box, so a run reads one box. The variable `dir` is the direction, or an empty
 * text.
 */
export const AVOID_PROGRAM: Expr = bindAll(
  [
    ...AVOID_ENDS,
    ROUTER_FUNCTIONS,
    ROUTE_FUNCTIONS,
    CENTERS,
    ELBOW_NAMES,
    ELBOW_PLACES,
    { port: PORT },
    { stub: STUB },
    { axis: AXIS, find: FIND, firstNear: FIRST_NEAR },
    { $startSides: when(eq(v("dir"), lit("")), ALL_SIDES, one(FROM_SIDE)), $endSides: when(eq(v("dir"), lit("")), ALL_SIDES, one(mod(add(FROM_SIDE, lit(2)), lit(4)))) },
    {
      $startX: stubs("$startSides", "sx", "sw", OUT_X),
      $startY: stubs("$startSides", "sy", "sh", OUT_Y),
      $endX: stubs("$endSides", "tx", "tw", OUT_X),
      $endY: stubs("$endSides", "ty", "th", OUT_Y),
    },
    { $allX: op("append", v("$startX"), v("$endX")), $allY: op("append", v("$startY"), v("$endY")) },
    { $xs: gridLines(BOX_X, BOX_RIGHT, "$allX"), $ys: gridLines(BOX_Y, BOX_BOTTOM, "$allY") },
    { $w: count(v("$xs")), $h: count(v("$ys")) },
    { $columnRanges: COLUMNS, $rowRanges: ROWS },
    {
      $free: clearOf(and(gt(I, FROM), lt(I, TO), gt(J, LOW), lt(J, HIGH))),
      $openX: clearOf(and(gte(I, FROM), lt(I, TO), gt(J, LOW), lt(J, HIGH))),
      $openY: clearOf(and(gte(J, LOW), lt(J, HIGH), gt(I, FROM), lt(I, TO))),
    },
    { gridIndex: GRID_INDEX, open: OPEN },
    { $goals: GOALS, $towardX: subtract(v("$bx"), v("$ax")), $towardY: subtract(v("$by"), v("$ay")) },
    { estimate: ESTIMATE, goalAxis: GOAL_AXIS, seedState: SEED_STATE },
    { $seeds: SEEDS },
    { siftUp: SIFT_UP, smaller: SMALLER },
    { siftDown: SIFT_DOWN },
    { popHeap: POP_HEAP, pushHeap: PUSH_HEAP, next: NEXT_STATE },
    { newCost: NEW_COST, newBest: NEW_BEST, simplify: SIMPLIFY },
    { firstStep: FIRST_STEP },
    {
      $cells0: over(v("$seeds"), ["$seed"], { cells: op("fill", multiply(multiply(v("$w"), v("$h")), lit(2)), xy(lit(-1), lit(-1))) }, { cells: setAt(v("cells"), xOf(v("$seed")), xy(yOf(v("$seed")), lit(-1))) }, v("cells")),
      $heap0: over(v("$seeds"), ["$seed"], { heap: NO_POINTS }, { heap: call("pushHeap", v("heap"), xy(xOf(v("$seed")), add(yOf(v("$seed")), call("estimate", xOf(v("$seed")))))) }, v("heap")),
    },
  ],
  when(v("$nestedPair"), CENTER_LINE, when(lt(count(v("$goals")), lit(1)), ORTHOGONAL, searchWith(FOUND))),
);

/** The kinds of the fields of a box and of the variable, for the compiler. */
export const AVOID_SCHEMA: Schema = {
  fields: { x: "number", y: "number", width: "number", height: "number" },
  vars: { dir: "string" },
};

/** The domains of the programs: numbers, texts, booleans and the points as `XY`. */
export const ROUTE_DOMAINS: readonly [typeof NumDomain, typeof TextDomain, typeof BoolDomain, typeof XYDomain] = [NumDomain, TextDomain, BoolDomain, XYDomain];

const dirOf = (d: RouteDirection | undefined): string => d ?? "";
const edgeRecord = (source: RouteRect, target: RouteRect, direction: RouteDirection | undefined): Readonly<Record<string, unknown>> => ({
  sx: source.x,
  sy: source.y,
  sw: source.width,
  sh: source.height,
  tx: target.x,
  ty: target.y,
  tw: target.width,
  th: target.height,
  dir: dirOf(direction),
});

/** This function gives the records of the edges of `straight` and `orthogonal`. */
export function routerRecords(edges: readonly RouterEdge[]): readonly Readonly<Record<string, unknown>>[] {
  return edges.map((e) => edgeRecord(e.source, e.target, e.direction));
}

/** This function gives the records of the edges of the program of the direction. */
export function directionRecords(edges: readonly DirectedEdge[]): readonly Readonly<Record<string, unknown>>[] {
  return edges.map((e) => ({ ...edgeRecord(e.source, e.target, undefined), tree: e.kind === "tree", parentDir: dirOf(e.parentDirection), flow: dirOf(e.flow) }));
}

/** This function gives the records of the nodes. */
export function nodeRecords(nodes: readonly RouteNode[]): readonly Readonly<Record<string, unknown>>[] {
  return nodes.map((n, i) => ({ i, x: n.x, y: n.y, width: n.width, height: n.height, scale: n.scale, nested: n.mode === "nested", last: n.lastChild, label: n.label }));
}

/** This function gives the space and the variables of the program of the obstacles. */
export function obstaclesRun(nodes: readonly RouteNode[], s: number, t: number): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  return { space: space.array(nodeRecords(nodes)), vars: { s, t } };
}

/** This function gives the records of the boxes of the program of the router `avoid`. */
export function avoidRecords(edge: RouterEdge): readonly RouteRect[] {
  return [...(edge.obstacles ?? []), edge.source, edge.target];
}

/** This function gives the space and the variables of the program of the router `avoid`. */
export function avoidRun(edge: RouterEdge): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  return { space: space.array(avoidRecords(edge)), vars: { dir: dirOf(edge.direction) } };
}

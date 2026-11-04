/**
 * The ireko layers pilot (docs/COMPILER.md §13.3, the strategies). The strategy `layers` of ireko
 * (https://github.com/mark1russell7/ireko) puts the children of a box in layers, as a flowchart. A depth-first search
 * turns around the edges that close a cycle. The longest path gives the layer of each child. Eight passes order each
 * layer by the mean place of the neighbors. Then the depths and the lengths of the layers give the offsets.
 *
 * `layersArrange` follows the code of ireko step by step. `LAYERS_PROGRAM` is one Vex program that evaluates at each
 * child. The search and the passes are `iterate` loops with lists as names. The tests compare the two, with the same
 * bits. ireko has the MIT license and the same author.
 *
 * The program differs from ireko in three ways. Each one keeps the result of ireko:
 *
 * - The first record holds the edges in the fields `froms` and `tos`, because a variable of a module cannot be a list.
 * - A pass of relaxation replaces the queue of Kahn. The longest path of a graph with no cycle has one value.
 * - The name `order` replaces the array `place`: the place of a child is its position in the order of its layer.
 *
 * The result differs from ireko in two rare cases, and the tests pin the first one:
 *
 * - A sum that is not finite gives an error at each child. ireko keeps the offsets that stay finite, for example with
 *   the alignment `start`. Its other offsets fail its check, and the engine then uses `grid`.
 * - Each loop has at most 100000 steps. A graph that needs more steps gives an error, for example a chain of 12501 children.
 */
import { app, axes, call, each, fn, fold, index, iterate, let_, lit, rec, ref, space, v, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import type { Extent } from "./ireko-grid.ts";

/** An edge between two children, as `ChildEdge` of ireko. */
export interface LayersEdge {
  readonly from: number;
  readonly to: number;
}

/** The options of the strategy `layers`, as in ireko. */
export interface LayersOptions {
  readonly side: "bottom" | "top" | "left" | "right";
  readonly distance: number;
  readonly align: "center" | "start" | "end";
}

/** The input of one arrangement: the mode, the size of the box itself, the extents of the children, the gap, the options and the edges. */
export interface LayersInput {
  readonly mode: "nested" | "linked";
  readonly self: { readonly width: number; readonly height: number };
  readonly extents: readonly Extent[];
  readonly gap: number;
  readonly options: LayersOptions;
  readonly edges: readonly LayersEdge[];
}

/** The offset of each child. */
export interface LayersOutput {
  readonly offsets: readonly { readonly x: number; readonly y: number }[];
}

/** The number of passes of the barycenter ordering, as `SWEEPS` of ireko. */
export const LAYER_SWEEPS = 8;

/** The item at an index that exists by construction. */
function at<T>(list: ArrayLike<T>, i: number): T {
  const value = list[i];
  if (value === undefined) throw new RangeError(`No item at the index ${String(i)}.`);
  return value;
}

/** This function gives the layer of each child, as `layersOf` of ireko. */
export function layersOf(k: number, edges: readonly LayersEdge[]): number[] {
  const next: number[][] = Array.from({ length: k }, () => []);
  for (const e of edges) if (e.from !== e.to && e.from >= 0 && e.to >= 0 && e.from < k && e.to < k) at(next, e.from).push(e.to);
  const state = new Uint8Array(k);
  const forward: number[][] = Array.from({ length: k }, () => []);
  for (let root = 0; root < k; root++) {
    if (at(state, root) !== 0) continue;
    const stack: [number, number][] = [[root, 0]];
    state[root] = 1;
    while (stack.length > 0) {
      const top = at(stack, stack.length - 1);
      const [node, i] = top;
      const out = at(next, node);
      if (i >= out.length) {
        state[node] = 2;
        stack.pop();
        continue;
      }
      top[1] = i + 1;
      const w = at(out, i);
      if (at(state, w) === 1) at(forward, w).push(node);
      else at(forward, node).push(w);
      if (at(state, w) === 0) {
        state[w] = 1;
        stack.push([w, 0]);
      }
    }
  }
  const indegree = new Int32Array(k);
  for (const out of forward) for (const w of out) indegree[w] = at(indegree, w) + 1;
  const queue: number[] = [];
  for (let node = 0; node < k; node++) if (at(indegree, node) === 0) queue.push(node);
  const layer: number[] = Array.from({ length: k }, () => 0);
  for (let head = 0; head < queue.length; head++) {
    const node = at(queue, head);
    for (const w of at(forward, node)) {
      layer[w] = Math.max(at(layer, w), at(layer, node) + 1);
      indegree[w] = at(indegree, w) - 1;
      if (at(indegree, w) === 0) queue.push(w);
    }
  }
  return layer;
}

/** This function gives the children of each layer, in order, as `orderOf` of ireko. */
export function orderOf(k: number, layer: readonly number[], edges: readonly LayersEdge[]): number[][] {
  const count = Math.max(0, ...layer) + 1;
  const order: number[][] = Array.from({ length: count }, () => []);
  for (let node = 0; node < k; node++) at(order, at(layer, node)).push(node);
  const neighbors: number[][] = Array.from({ length: k }, () => []);
  for (const e of edges) {
    if (e.from === e.to || e.from < 0 || e.to < 0 || e.from >= k || e.to >= k) continue;
    at(neighbors, e.from).push(e.to);
    at(neighbors, e.to).push(e.from);
  }
  const place = new Float64Array(k);
  const remember = (): void => {
    for (const l of order) for (const [i, node] of l.entries()) place[node] = i;
  };
  remember();
  for (let pass = 0; pass < LAYER_SWEEPS; pass++) {
    const down = pass % 2 === 0;
    for (let s = 0; s < count; s++) {
      const l = down ? s : count - 1 - s;
      const near = down ? l - 1 : l + 1;
      const keyOf = (node: number): number => {
        const ns = at(neighbors, node).filter((u) => at(layer, u) === near);
        return ns.length === 0 ? at(place, node) : ns.reduce((sum, u) => sum + at(place, u), 0) / ns.length;
      };
      const keys = new Map(at(order, l).map((node) => [node, keyOf(node)]));
      order[l] = at(order, l).toSorted((a, b) => (keys.get(a) ?? 0) - (keys.get(b) ?? 0) || a - b);
      remember();
    }
  }
  return order;
}

/** This function gives the move of the block of layers to the side of the node in the linked mode, as `linkedShift` of ireko. */
function linkedShift(side: LayersOptions["side"], self: LayersInput["self"], widest: number, total: number, distance: number): { x: number; y: number } {
  switch (side) {
    case "bottom":
      return { x: (self.width - widest) / 2, y: self.height + distance };
    case "top":
      return { x: (self.width - widest) / 2, y: -distance - total };
    case "right":
      return { x: self.width + distance, y: (self.height - widest) / 2 };
    case "left":
      return { x: -distance - total, y: (self.height - widest) / 2 };
  }
}

/** This function arranges the children like the strategy `layers` of ireko. */
export function layersArrange(input: LayersInput): LayersOutput {
  const { mode, self, extents, gap, options, edges } = input;
  const k = extents.length;
  const order = orderOf(k, layersOf(k, edges), edges);
  const down = options.side === "bottom" || options.side === "top";
  const forward = options.side === "bottom" || options.side === "right";
  const distance = options.distance > 0 ? options.distance : 2 * gap;
  const along = (c: Extent): { from: number; size: number } => (down ? { from: c.y, size: c.height } : { from: c.x, size: c.width });
  const across = (c: Extent): { from: number; size: number } => (down ? { from: c.x, size: c.width } : { from: c.y, size: c.height });

  const depths = order.map((layer) => Math.max(...layer.map((c) => along(at(extents, c)).size)));
  const lengths = order.map((layer) => layer.reduce((sum, c, i) => sum + across(at(extents, c)).size + (i > 0 ? gap : 0), 0));
  const widest = Math.max(...lengths);
  const total = depths.reduce((sum, d, i) => sum + d + (i > 0 ? distance : 0), 0);

  const offsets = extents.map(() => ({ x: 0, y: 0 }));
  let flow = 0;
  for (const [l, layer] of order.entries()) {
    const depth = at(depths, l);
    const free = widest - at(lengths, l);
    let cross = options.align === "start" ? 0 : options.align === "end" ? free : free / 2;
    const start = forward ? flow : total - flow - depth;
    for (const c of layer) {
      const child = at(extents, c);
      const a = along(child);
      const b = across(child);
      const main = start + (depth - a.size) / 2 - a.from;
      const side = cross - b.from;
      offsets[c] = down ? { x: side, y: main } : { x: main, y: side };
      cross += b.size + gap;
    }
    flow += depth + distance;
  }

  if (mode === "nested") return { offsets };
  const shift = linkedShift(options.side, self, widest, total, distance);
  return { offsets: offsets.map((o) => ({ x: o.x + shift.x, y: o.y + shift.y })) };
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const nth = (list: Expr, i: Expr): Expr => op("nth", list, i);
const eq = (a: Expr, b: Expr): Expr => op("eq", a, b);
const add = (a: Expr, b: Expr): Expr => op("add", a, b);
const subtract = (a: Expr, b: Expr): Expr => op("subtract", a, b);
const half = (a: Expr): Expr => op("divide", a, lit(2));
const when = (test: Expr, yes: Expr, no: Expr): Expr => op("if", test, yes, no);
const and = (...tests: Expr[]): Expr => tests.reduceRight((rest, t) => op("and", t, rest));
const not = (a: Expr): Expr => op("not", a);
/** The empty list. */
const NONE = op("fill", lit(0), lit(0));
const one = (x: Expr): Expr => op("fill", lit(1), x);
const push = (list: Expr, x: Expr): Expr => op("append", list, one(x));
const lastOf = (list: Expr): Expr => subtract(op("count", list), lit(1));
const pop = (list: Expr): Expr => op("take", list, lastOf(list));
const top = (list: Expr): Expr => nth(list, lastOf(list));
/** The list `list` with `x` at the position `i`. Each step copies the list, because no op changes one item. */
const put = (list: Expr, i: Expr, x: Expr): Expr => each(axes.list(list), when(eq(v("$j"), i), x, v("$old")), undefined, ["$old", "$j"]);

/** The items of a list of a list of lists, for a list op of a module (gap: `listy` does not know that `nth` gives a list). */
export const items = (list: Expr): Expr => each(axes.list(list), v("$item"), undefined, ["$item"]);

/** The child at the position of the call. */
const ME = ref("i");
/** The extent of the child on the axis of the flow, and across it. The field `size` is the second one. */
const ALONG = { from: when(v("$down"), ref("ey"), ref("ex")), size: when(v("$down"), ref("eh"), ref("ew")) };
const ACROSS = { from: when(v("$down"), ref("ex"), ref("ey")), size: when(v("$down"), ref("ew"), ref("eh")) };

/** The tests and the lists of the edges: an edge counts when its ends are two children. */
const VALID_FNS = {
  valid: fn(["f", "t"], and(not(eq(v("f"), v("t"))), op("gte", v("f"), lit(0)), op("gte", v("t"), lit(0)), op("lt", v("f"), v("$k")), op("lt", v("t"), v("$k")))),
};
const EDGE_FNS = {
  /** The other ends of the edges of the child `node`, in the order of the edges. With `both`, an edge into the child counts too. */
  endsOf: fn(
    ["node", "both"],
    fold(
      axes.list(v("$froms")),
      { acc: NONE },
      {
        acc: let_(
          { $t: nth(v("$tos"), v("$e")) },
          when(
            call("valid", v("$f"), v("$t")),
            when(eq(v("$f"), v("node")), push(v("acc"), v("$t")), when(and(v("both"), eq(v("$t"), v("node"))), push(v("acc"), v("$f")), v("acc"))),
            v("acc"),
          ),
        ),
      },
      v("acc"),
      undefined,
      ["$f", "$e"],
    ),
  ),
};

/** The edges out of a child, the test of a child with no next edge, and the target of the next edge. */
const OUT_FNS = { outOf: fn(["node"], items(nth(v("$next"), v("node")))) };
const STACK_FNS = {
  spent: fn(["node", "i"], op("gte", v("i"), op("count", call("outOf", v("node"))))),
  targetOf: fn(["node", "i"], nth(call("outOf", v("node")), v("i"))),
};

/** The test of a child with a state of the search. The state 0 is new, and the state 1 is on the stack. */
const stateIs = (node: Expr, state: number): Expr => eq(nth(v("st"), node), lit(state));
const EMPTY = eq(op("count", v("sv")), lit(0));
const NEW_ROOT = stateIs(v("root"), 0);

/**
 * This function gives one name of a step of the search. An empty stack takes the next root. Each other step finishes
 * the child on the top, or it follows one edge. The names `$n`, `$c` and `$w` are the child, its next edge and the target.
 */
const stepOf = (root: Expr, finish: Expr, follow: Expr): Expr =>
  when(EMPTY, root, let_({ $n: top(v("sv")), $c: top(v("si")) }, when(call("spent", v("$n"), v("$c")), finish, let_({ $w: call("targetOf", v("$n"), v("$c")) }, follow))));

/**
 * The search of ireko with one loop. The names `sv` and `si` are the two columns of the stack. The result is the list
 * of the sources of the forward edges into each child, so a cycle has no edge in it.
 */
const SEARCH = iterate(
  100000,
  { st: op("fill", v("$k"), lit(0)), sv: NONE, si: NONE, root: lit(0), fa: NONE, fb: NONE },
  {
    root: when(EMPTY, add(v("root"), lit(1)), v("root")),
    st: stepOf(when(NEW_ROOT, put(v("st"), v("root"), lit(1)), v("st")), put(v("st"), v("$n"), lit(2)), when(stateIs(v("$w"), 0), put(v("st"), v("$w"), lit(1)), v("st"))),
    sv: stepOf(when(NEW_ROOT, push(v("sv"), v("root")), v("sv")), pop(v("sv")), when(stateIs(v("$w"), 0), push(v("sv"), v("$w")), v("sv"))),
    si: stepOf(
      when(NEW_ROOT, push(v("si"), lit(0)), v("si")),
      pop(v("si")),
      let_({ $moved: push(pop(v("si")), add(v("$c"), lit(1))) }, when(stateIs(v("$w"), 0), push(v("$moved"), lit(0)), v("$moved"))),
    ),
    fa: stepOf(v("fa"), v("fa"), push(v("fa"), when(stateIs(v("$w"), 1), v("$w"), v("$n")))),
    fb: stepOf(v("fb"), v("fb"), push(v("fb"), when(stateIs(v("$w"), 1), v("$n"), v("$w")))),
  },
  each(
    axes.all,
    let_(
      { $me: ME },
      fold(axes.list(v("fb")), { acc: NONE }, { acc: when(eq(v("$b"), v("$me")), push(v("acc"), nth(v("fa"), v("$e"))), v("acc")) }, v("acc"), undefined, ["$b", "$e"]),
    ),
  ),
  and(EMPTY, op("gte", v("root"), v("$k"))),
);

/** The longest path to each child: each step can make a path longer by one edge, and a path has fewer edges than the children. */
const LONGEST = iterate(
  100000,
  { t: lit(0), lay: op("fill", v("$k"), lit(0)) },
  {
    t: add(v("t"), lit(1)),
    lay: each(
      axes.list(v("$into")),
      fold(axes.list(v("$us")), { m: nth(v("lay"), v("$w")) }, { m: op("max", v("m"), add(nth(v("lay"), v("$u")), lit(1))) }, v("m"), undefined, ["$u"]),
      undefined,
      ["$us", "$w"],
    ),
  },
  v("lay"),
  op("gte", v("t"), v("$k")),
);

/** The children of the layer `l`, in the order of the children. The items have the keys of the records. */
const MEMBER_FNS = { membersOf: fn(["l"], each(axes.where(axes.all, eq(nth(v("$lay"), ME), v("l"))), ME)) };

/** The layer of step `t` of the passes, and the layer next to it. A pass goes down when its number is even. */
const DOWN_FNS = { isDown: fn(["t"], eq(op("mod", op("floor", op("divide", v("t"), v("$count"))), lit(2)), lit(0))) };
const STEP_FNS = { stepLayer: fn(["t"], let_({ $s: op("mod", v("t"), v("$count")) }, when(call("isDown", v("t")), v("$s"), subtract(subtract(v("$count"), lit(1)), v("$s"))))) };
const NEAR_FNS = {
  nearLayer: fn(["t"], when(call("isDown", v("t")), subtract(call("stepLayer", v("t")), lit(1)), add(call("stepLayer", v("t")), lit(1)))),
};

/** The place of the child at the position of the call: the mean place of its neighbors in the layer `near`, or its own place. */
const KEY = let_(
  { $node: ME },
  fold(
    axes.list(nth(v("$nbrs"), v("$node"))),
    { sum: lit(0), n: lit(0) },
    {
      sum: when(eq(nth(v("$lay"), v("$u")), v("$near")), add(v("sum"), op("indexOf", items(nth(v("order"), v("$near"))), v("$u"))), v("sum")),
      n: when(eq(nth(v("$lay"), v("$u")), v("$near")), add(v("n"), lit(1)), v("n")),
    },
    when(eq(v("n"), lit(0)), op("indexOf", items(nth(v("order"), v("$l"))), v("$node")), op("divide", v("sum"), v("n"))),
    undefined,
    ["$u"],
  ),
);

/**
 * The passes. A step sorts one layer by the keys. The sort is stable, and the members are in the order of the children,
 * so the sort has the tie-break of ireko. Each item keeps the key of its record, so the last `each` reads its child.
 */
const SWEEPS = iterate(
  100000,
  { t: lit(0), order: v("$members") },
  {
    t: add(v("t"), lit(1)),
    order: let_(
      { $l: call("stepLayer", v("t")), $near: call("nearLayer", v("t")) },
      each(
        axes.list(v("order")),
        when(eq(v("$j"), v("$l")), each(axes.list(op("sortBy", each(axes.list(nth(v("$members"), v("$l"))), KEY))), ME), v("$old")),
        undefined,
        ["$old", "$j"],
      ),
    ),
  },
  v("order"),
  op("gte", v("t"), op("multiply", lit(LAYER_SWEEPS), v("$count"))),
);

/** The sizes of the layers: the depth and the length, with the additions in the order of ireko. */
const SIZE_NAMES = {
  $depths: each(axes.list(v("$order")), op("max", each(axes.list(v("$o")), ALONG.size)), undefined, ["$o"]),
  $lengths: each(
    axes.list(v("$order")),
    fold(axes.list(v("$o")), { sum: lit(0) }, { sum: add(add(v("sum"), ACROSS.size), when(op("gt", v("$c"), lit(0)), v("gap"), lit(0))) }, v("sum"), undefined, ["$x", "$c"]),
    undefined,
    ["$o"],
  ),
};

const LAYOUT_NAMES = {
  $widest: op("max", v("$lengths")),
  $total: fold(axes.list(v("$depths")), { sum: lit(0) }, { sum: add(add(v("sum"), v("$d")), when(op("gt", v("$c"), lit(0)), v("$distance"), lit(0))) }, v("sum"), undefined, ["$d", "$c"]),
  $flows: fold(axes.list(v("$depths")), { flow: lit(0), out: NONE }, { flow: add(v("flow"), add(v("$d"), v("$distance"))), out: push(v("out"), v("flow")) }, v("out"), undefined, ["$d"]),
};

/** The place across the flow of each child of a layer, in order. */
const CROSSES = {
  $crosses: each(
    axes.list(v("$order")),
    let_(
      { $free: subtract(v("$widest"), nth(v("$lengths"), v("$l"))) },
      fold(
        axes.list(v("$o")),
        { cross: when(eq(v("align"), lit("start")), lit(0), when(eq(v("align"), lit("end")), v("$free"), half(v("$free")))), out: NONE },
        { cross: add(v("cross"), add(ACROSS.size, v("gap"))), out: push(v("out"), v("cross")) },
        v("out"),
      ),
    ),
    undefined,
    ["$o", "$l"],
  ),
};

/** The move of the block of layers in the linked mode, as `linkedShift` of ireko. */
const SHIFT = {
  $sx: when(
    eq(v("side"), lit("right")),
    add(v("selfW"), v("$distance")),
    when(eq(v("side"), lit("left")), subtract(op("negate", v("$distance")), v("$total")), half(subtract(v("selfW"), v("$widest")))),
  ),
  $sy: when(
    eq(v("side"), lit("bottom")),
    add(v("selfH"), v("$distance")),
    when(eq(v("side"), lit("top")), subtract(op("negate", v("$distance")), v("$total")), half(subtract(v("selfH"), v("$widest")))),
  ),
};

/** This function binds the sets of names in order, around `body`: each set sees the sets before it. */
export const bindAll = (sets: readonly Readonly<Record<string, Expr>>[], body: Expr): Expr => sets.reduceRight((inner, set) => let_(set, inner), body);

/**
 * The program of the strategy `layers`. It evaluates at each child, and it gives the offset of the child. The variables
 * are the options, `mode`, `gap`, `selfW` and `selfH`. The fields `froms` and `tos` of the first record hold the edges.
 */
export const LAYERS_PROGRAM: Expr = bindAll(
  [
    { $k: op("count", each(axes.all, ME)), $froms: ref("froms", [index(0)]), $tos: ref("tos", [index(0)]) },
    VALID_FNS,
    EDGE_FNS,
    { $next: each(axes.all, call("endsOf", ME, lit(false))), $nbrs: each(axes.all, call("endsOf", ME, lit(true))) },
    OUT_FNS,
    STACK_FNS,
    { $into: SEARCH },
    { $lay: LONGEST },
    { $count: add(op("max", v("$lay")), lit(1)) },
    MEMBER_FNS,
    { $members: each(axes.list(op("fill", v("$count"), lit(0))), call("membersOf", v("$n")), undefined, ["$zero", "$n"]) },
    DOWN_FNS,
    STEP_FNS,
    NEAR_FNS,
    { $order: SWEEPS },
    {
      $down: op("or", eq(v("side"), lit("bottom")), eq(v("side"), lit("top"))),
      $forward: op("or", eq(v("side"), lit("bottom")), eq(v("side"), lit("right"))),
      $distance: when(op("gt", v("distance"), lit(0)), v("distance"), op("multiply", lit(2), v("gap"))),
    },
    SIZE_NAMES,
    LAYOUT_NAMES,
    CROSSES,
    SHIFT,
    { $l: nth(v("$lay"), ME), $linked: eq(v("mode"), lit("linked")) },
    { $depth: nth(v("$depths"), v("$l")), $flow: nth(v("$flows"), v("$l")) },
    {
      $main: subtract(
        add(when(v("$forward"), v("$flow"), subtract(subtract(v("$total"), v("$flow")), v("$depth"))), half(subtract(v("$depth"), ALONG.size))),
        ALONG.from,
      ),
      $side: subtract(nth(items(nth(v("$crosses"), v("$l"))), op("indexOf", items(nth(v("$order"), v("$l"))), ME)), ACROSS.from),
    },
    { $x: when(v("$down"), v("$side"), v("$main")), $y: when(v("$down"), v("$main"), v("$side")) },
  ],
  rec({
    x: when(v("$linked"), add(v("$x"), v("$sx")), v("$x")),
    y: when(v("$linked"), add(v("$y"), v("$sy")), v("$y")),
  }),
);

/** The kinds of the fields of a child and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const LAYERS_SCHEMA: Schema = {
  fields: { i: "number", ex: "number", ey: "number", ew: "number", eh: "number", froms: { list: "number" }, tos: { list: "number" } },
  vars: { side: "string", distance: "number", align: "string", mode: "string", gap: "number", selfW: "number", selfH: "number" },
};

/** The domains of the program: numbers, texts for the options, and booleans for the tests. */
export const LAYERS_DOMAINS: readonly [typeof NumDomain, typeof TextDomain, typeof BoolDomain] = [NumDomain, TextDomain, BoolDomain];

/** This function gives the space of the children and the variables of a run of the program. */
export function layersRun(input: LayersInput): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  const froms = input.edges.map((e) => e.from);
  const tos = input.edges.map((e) => e.to);
  const records = input.extents.map((e, i) => ({ i, ex: e.x, ey: e.y, ew: e.width, eh: e.height, froms: i === 0 ? froms : [], tos: i === 0 ? tos : [] }));
  return { space: space.array(records), vars: { ...input.options, mode: input.mode, gap: input.gap, selfW: input.self.width, selfH: input.self.height } };
}

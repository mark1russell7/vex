/**
 * The ireko measure pilot (docs/COMPILER.md §13.3, the engine). The measure pass of ireko
 * (https://github.com/mark1russell7/ireko) visits each node after its children. For each node with children, it starts
 * the strategy of the node, and then it fits the arrangement into the box of the node. The strategies are code of the
 * user or of ireko, so the pass starts them in its own loop. The fit after the strategy is a calculation over the
 * children of one node, and this pilot gives it as a Vex sheet.
 *
 * `fitNode` follows the code of ireko step by step. `MEASURE_COLUMNS` is a sheet over a small tree: the node is the
 * root, and its children are the leaves. The columns of the node read the children with a fold. The columns of a
 * child read the cells of the node. The tests compare the two, with the same bits. ireko has the MIT license and the
 * same author.
 */
import { app, axes, cell, fold, lit, ref, space, v, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema, SheetModuleOptions } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";

/**
 * One record of the sheet. The root is the node, with `p` -1 and 0 in each other field. Each other record is a child,
 * with `p` 0. `ox` and `oy` are the offset of the child from the strategy. `ex`, `ey`, `ew` and `eh` are the extent of
 * the subtree of the child.
 */
export interface MeasureRecord {
  readonly p: number;
  readonly ox: number;
  readonly oy: number;
  readonly ex: number;
  readonly ey: number;
  readonly ew: number;
  readonly eh: number;
}

/**
 * The node of a fit. `linked` is true in the linked mode. `content` is true when the strategy gives a content area
 * (`cx`, `cy`, `cw`, `ch`). `ownW` and `ownH` are the own size of the node, and `expW` and `expH` its explicit size.
 * `hasW` and `hasH` tell if the spec gives a width and a height (`nodeW`, `nodeH`). `grow`, `scale` and `clip` are the
 * fit of the node.
 */
export interface MeasureVars {
  readonly linked: boolean;
  readonly content: boolean;
  readonly cx: number;
  readonly cy: number;
  readonly cw: number;
  readonly ch: number;
  readonly ownW: number;
  readonly ownH: number;
  readonly expW: number;
  readonly expH: number;
  readonly hasW: boolean;
  readonly hasH: boolean;
  readonly nodeW: number;
  readonly nodeH: number;
  readonly padding: number;
  readonly header: number;
  readonly grow: boolean;
  readonly scale: boolean;
  readonly clip: boolean;
}

/** A rectangle with its top-left corner and its size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The fit of one node. `bounds` is the union of the placed children with the start rectangle: the extent in the linked
 * mode, and the content in the nested mode. `first` is the size before the check of the padding, `small` tells if the
 * check failed, and `size` is the box in the nested mode. `placement` has one item for each child.
 */
export interface Fit {
  readonly bounds: Box;
  readonly first: { readonly width: number; readonly height: number };
  readonly small: boolean;
  readonly size: { readonly width: number; readonly height: number };
  readonly placement: readonly { readonly x: number; readonly y: number; readonly scale: number }[];
}

/** One child of a fit: its offset from the strategy and the extent of its subtree. */
export interface FitChild {
  readonly offset: { readonly x: number; readonly y: number };
  readonly extent: Box;
}

/** This function gives the smallest rectangle that contains `a` and `b`, as `union` of ireko. */
function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** This function fits the children of one node into its box, as the measure pass of ireko after the strategy. */
export function fitNode(children: readonly FitChild[], vars: MeasureVars): Fit {
  const placed = children.map(({ offset: o, extent: e }) => ({ x: o.x + e.x, y: o.y + e.y, width: e.width, height: e.height }));
  const start: Box | undefined = vars.linked ? { x: 0, y: 0, width: vars.ownW, height: vars.ownH } : vars.content ? { x: vars.cx, y: vars.cy, width: vars.cw, height: vars.ch } : undefined;
  let bounds = start;
  for (const r of placed) bounds = bounds === undefined ? r : union(bounds, r);
  if (bounds === undefined) throw new Error("A fit needs a child or a start rectangle.");
  const content = bounds;
  const { padding } = vars;
  const top = Math.max(padding, vars.header);
  const need = { width: content.width + 2 * padding, height: content.height + top + padding };
  const fixed = !vars.grow;
  let size = fixed
    ? { width: vars.hasW ? vars.nodeW : need.width, height: vars.hasH ? vars.nodeH : need.height }
    : { width: Math.max(need.width, vars.expW), height: Math.max(need.height, vars.expH) };
  const before = size;
  const small = fixed && (size.width - 2 * padding < 1 || size.height - top - padding < 1);
  if (small) size = { width: Math.max(size.width, 2 * padding + 1), height: Math.max(size.height, top + padding + 1) };
  const free = { width: size.width - 2 * padding, height: size.height - top - padding };
  const scale = vars.scale ? Math.min(1, free.width / content.width, free.height / content.height) : 1;
  const shownW = content.width * scale;
  const shownH = content.height * scale;
  const ox = padding + (vars.clip ? Math.max(0, (free.width - shownW) / 2) : (free.width - shownW) / 2);
  const oy = top + (vars.clip ? Math.max(0, (free.height - shownH) / 2) : (free.height - shownH) / 2);
  const placement = children.map(({ offset: o }) => (vars.linked ? { x: o.x, y: o.y, scale: 1 } : { x: ox + scale * (o.x - content.x), y: oy + scale * (o.y - content.y), scale }));
  return { bounds, first: before, small, size, placement };
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const PARENT = { t: "parent" } as const;
/** True at the root: the node itself. */
const ROOT = op("lt", ref("p"), lit(0));
/** The value of a column at the node. */
const up = (column: string): Expr => cell(column, [PARENT]);
const twice = (x: Expr): Expr => op("multiply", lit(2), x);

/** The names of one axis of the plane: the fields of a child and the variables of the start rectangle. */
interface Axis {
  readonly offset: string;
  readonly at: string;
  readonly size: string;
  readonly start: string;
  readonly startSize: string;
  readonly own: string;
}
const X: Axis = { offset: "ox", at: "ex", size: "ew", start: "cx", startSize: "cw", own: "ownW" };
const Y: Axis = { offset: "oy", at: "ey", size: "eh", start: "cy", startSize: "ch", own: "ownH" };

/**
 * The union of the placed children on one axis, as a fold over the children of the node. The names `lo` and `len` are
 * the start and the size of the union. `has` is false while the union has no rectangle. The result is `lo` or `len`.
 */
function bound(a: Axis, result: "lo" | "len"): Expr {
  const lo = v("lo");
  const at = op("add", ref(a.offset), ref(a.at));
  const low = op("min", lo, at);
  return fold(
    axes.children,
    {
      has: op("or", v("linked"), v("content")),
      lo: op("if", v("linked"), lit(0), v(a.start)),
      len: op("if", v("linked"), v(a.own), v(a.startSize)),
    },
    {
      has: lit(true),
      lo: op("if", v("has"), low, at),
      len: op("if", v("has"), op("subtract", op("max", op("add", lo, v("len")), op("add", at, ref(a.size))), low), ref(a.size)),
    },
    v(result),
  );
}

/** The size before the check of the padding: the size of the spec, or the need. With `grow`, the larger of the need and the explicit size. */
const first = (need: string, has: string, size: string, explicit: string): Expr => op("if", v("grow"), op("max", cell(need), v(explicit)), op("if", v(has), v(size), cell(need)));
/** The free size on the height axis: the size less the top and the padding. */
const freeH = (h: Expr): Expr => op("subtract", op("subtract", h, cell("top")), v("padding"));
/** The start of the content on one axis: centered in the free area. With `clip`, a content that is too large starts at the padding. */
const centered = (start: Expr, free: string, len: string): Expr => {
  const half = op("divide", op("subtract", cell(free), op("multiply", cell(len), cell("sc"))), lit(2));
  return op("add", start, op("if", v("clip"), op("max", lit(0), half), half));
};
/** The placement of a child on one axis: the offset in the linked mode, else moved into the free area and scaled. */
const placed = (a: Axis, start: string, lo: string): Expr =>
  op("if", ROOT, lit(0), op("if", v("linked"), ref(a.offset), op("add", up(start), op("multiply", up("sc"), op("subtract", ref(a.offset), up(lo))))));

/**
 * The sheet of the fit. The columns from `lx` to `sc` have a meaning at the root: the node. The columns `lx`, `ly` and
 * `ls` have a meaning at each child: its placement in the box of the node. A column reads only the cells of its own
 * record and of the parent, so the module has no search.
 */
export const MEASURE_COLUMNS: ReadonlyMap<string, Expr> = new Map<string, Expr>([
  ["bx", bound(X, "lo")],
  ["by", bound(Y, "lo")],
  ["bw", bound(X, "len")],
  ["bh", bound(Y, "len")],
  // The header is the smallest space above the content. The padding counts as a part of it.
  ["top", op("max", v("padding"), v("header"))],
  ["needW", op("add", cell("bw"), twice(v("padding")))],
  ["needH", op("add", op("add", cell("bh"), cell("top")), v("padding"))],
  ["firstW", first("needW", "hasW", "nodeW", "expW")],
  ["firstH", first("needH", "hasH", "nodeH", "expH")],
  // A fixed size that cannot hold its own padding: the box grows to hold one pixel of content.
  ["small", op("if", v("grow"), lit(false), op("or", op("lt", op("subtract", cell("firstW"), twice(v("padding"))), lit(1)), op("lt", freeH(cell("firstH")), lit(1))))],
  ["sw", op("if", cell("small"), op("max", cell("firstW"), op("add", twice(v("padding")), lit(1))), cell("firstW"))],
  ["sh", op("if", cell("small"), op("max", cell("firstH"), op("add", op("add", cell("top"), v("padding")), lit(1))), cell("firstH"))],
  ["freeW", op("subtract", cell("sw"), twice(v("padding")))],
  ["freeH", freeH(cell("sh"))],
  // A child has no children, so its bounds have no size. The scale of a child is not read, so it is 1.
  ["sc", op("if", op("and", ROOT, v("scale")), op("min", op("min", lit(1), op("divide", cell("freeW"), cell("bw"))), op("divide", cell("freeH"), cell("bh"))), lit(1))],
  ["sx", centered(v("padding"), "freeW", "bw")],
  ["sy", centered(cell("top"), "freeH", "bh")],
  ["lx", placed(X, "sx", "bx")],
  ["ly", placed(Y, "sy", "by")],
  ["ls", op("if", op("or", ROOT, v("linked")), lit(1), up("sc"))],
]);

/** The kinds of the columns. A column that a formula reads before its own formula needs its kind. */
export const MEASURE_KINDS: NonNullable<SheetModuleOptions["kinds"]> = Object.fromEntries([...MEASURE_COLUMNS.keys()].map((c) => [c, c === "small" ? "boolean" : "number"]));

/** The kinds of the fields of a record and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const MEASURE_SCHEMA: Schema = {
  fields: { p: "number", ox: "number", oy: "number", ex: "number", ey: "number", ew: "number", eh: "number" },
  vars: {
    linked: "boolean",
    content: "boolean",
    cx: "number",
    cy: "number",
    cw: "number",
    ch: "number",
    ownW: "number",
    ownH: "number",
    expW: "number",
    expH: "number",
    hasW: "boolean",
    hasH: "boolean",
    nodeW: "number",
    nodeH: "number",
    padding: "number",
    header: "number",
    grow: "boolean",
    scale: "boolean",
    clip: "boolean",
  },
};

/** The domains of the sheet: numbers and booleans. */
export const MEASURE_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain] = [NumDomain, BoolDomain];

/** This function gives the records of a fit: the node at the position 0, and then its children. */
export function measureRecords(children: readonly FitChild[]): MeasureRecord[] {
  return [{ p: -1, ox: 0, oy: 0, ex: 0, ey: 0, ew: 0, eh: 0 }, ...children.map(({ offset: o, extent: e }) => ({ p: 0, ox: o.x, oy: o.y, ex: e.x, ey: e.y, ew: e.width, eh: e.height }))];
}

/** This function gives the tree space of the records: the key of a record is the text of its position. */
export function measureSpace(records: readonly MeasureRecord[]): Space {
  const parents = Object.fromEntries(records.flatMap((r, i) => (r.p < 0 ? [] : [[String(i), String(r.p)]])));
  return space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), parents);
}

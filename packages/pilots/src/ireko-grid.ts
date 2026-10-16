/**
 * The ireko grid pilot (docs/COMPILER.md §6, phase C3). ireko (https://github.com/mark1russell7/ireko) is a layout
 * engine. Its strategy `grid` puts the children of a box in rows and columns. This module has the strategy twice.
 * `gridArrange` follows the code of ireko step by step. `GRID_PROGRAM` is one Vex program that evaluates at each child.
 * The tests compare the two, with the same bits.
 *
 * ireko has the MIT license and the same author, so `gridArrange` copies its arithmetic in the same order. The order
 * of the additions decides the bits of a result.
 */
import { app, axes, each, let_, lit, rec, ref, space, v, type Expr, type Move, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";

/** The extent of a child: the box of its subtree, relative to the position of the child. */
export interface Extent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The options of the strategy `grid`, as in ireko. */
export interface GridOptions {
  readonly columns: number;
  readonly justify: "start" | "center" | "end";
  readonly align: "auto" | "start" | "center" | "end";
  readonly uniform: boolean;
  readonly side: "bottom" | "top" | "left" | "right";
  readonly distance: number;
}

/** The input of one arrangement: the mode, the size of the box itself, the extents of its children, the gap and the options. */
export interface GridInput {
  readonly mode: "nested" | "linked";
  readonly self: { readonly width: number; readonly height: number };
  readonly extents: readonly Extent[];
  readonly gap: number;
  readonly options: GridOptions;
}

/** The offset of each child, and the size of the grid. */
export interface GridOutput {
  readonly offsets: readonly { readonly x: number; readonly y: number }[];
  readonly width: number;
  readonly height: number;
}

/** This function gives the place of a child in its cell: at the start, at the center or at the end of the free space. */
function place(where: "start" | "center" | "end", free: number): number {
  switch (where) {
    case "start":
      return 0;
    case "center":
      return free / 2;
    case "end":
      return free;
  }
}

/** This function gives the start of each size in a row of sizes with a gap between them. */
function offsetsOf(sizes: readonly number[], gap: number): number[] {
  const out: number[] = [];
  let cursor = 0;
  for (const s of sizes) {
    out.push(cursor);
    cursor += s + gap;
  }
  return out;
}

/** This function gives the sum of numbers, from left to right. */
function sum(values: readonly number[]): number {
  let total = 0;
  for (const x of values) total += x;
  return total;
}

/** This function gives the corner of the cluster of children, from the side of the box where they go. */
function clusterOrigin(side: GridOptions["side"], selfW: number, selfH: number, w: number, h: number, distance: number): { readonly x: number; readonly y: number } {
  switch (side) {
    case "bottom":
      return { x: selfW / 2 - w / 2, y: selfH + distance };
    case "top":
      return { x: selfW / 2 - w / 2, y: -distance - h };
    case "right":
      return { x: selfW + distance, y: selfH / 2 - h / 2 };
    case "left":
      return { x: -distance - w, y: selfH / 2 - h / 2 };
  }
}

/** This function gives the item at an index that exists by construction. */
const at = (list: readonly number[], i: number): number => list[i] ?? Number.NaN;

/** This function arranges the children like the strategy `grid` of ireko. */
export function gridArrange(input: GridInput): GridOutput {
  const { mode, self, extents, gap, options } = input;
  const n = extents.length;
  const vertical = mode === "linked" && (options.side === "left" || options.side === "right");
  const auto = mode === "linked" ? (vertical ? 1 : n) : Math.ceil(Math.sqrt(n));
  const columns = options.columns > 0 ? Math.min(options.columns, n) : auto;
  const rows = Math.ceil(n / columns);
  const colW: number[] = Array.from({ length: columns }, () => 0);
  const rowH: number[] = Array.from({ length: rows }, () => 0);
  extents.forEach((e, i) => {
    const c = i % columns;
    const r = Math.floor(i / columns);
    colW[c] = Math.max(at(colW, c), e.width);
    rowH[r] = Math.max(at(rowH, r), e.height);
  });
  if (options.uniform) {
    const w = Math.max(...colW);
    const h = Math.max(...rowH);
    colW.fill(w);
    rowH.fill(h);
  }
  const colX = offsetsOf(colW, gap);
  const rowY = offsetsOf(rowH, gap);
  const width = sum(colW) + gap * (columns - 1);
  const height = sum(rowH) + gap * (rows - 1);
  const align = options.align === "auto" ? (mode === "linked" ? "start" : "center") : options.align;
  const cells = extents.map((e, i) => {
    const c = i % columns;
    const r = Math.floor(i / columns);
    const ex = at(colX, c) + place(options.justify, at(colW, c) - e.width);
    const ey = at(rowY, r) + place(align, at(rowH, r) - e.height);
    return { x: ex - e.x, y: ey - e.y };
  });
  if (mode === "nested") return { offsets: cells, width, height };
  const distance = options.distance > 0 ? options.distance : gap * 1.5;
  const origin = clusterOrigin(options.side, self.width, self.height, width, height, distance);
  return { offsets: cells.map((p) => ({ x: origin.x + p.x, y: origin.y + p.y })), width, height };
}

// The parts of the program. Each child is a record with its index `i` and its extent. The options are variables. The
// program binds each shared value once, so the generated code computes it once.
const ORIGIN: readonly Move[] = [{ t: "origin" }];
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const is = (name: string, text: string): Expr => op("eq", v(name), lit(text));
const columnOf = (i: Expr): Expr => op("mod", i, v("$cols"));
const rowOf = (i: Expr): Expr => op("floor", op("divide", i, v("$cols")));

/** The largest field `field` of the children whose key `keyOf(i)` is the value of the variable `name`, and at least 0. */
const largest = (field: string, keyOf: (i: Expr) => Expr, name: string): Expr =>
  op("max", lit(0), op("max", each(axes.where(axes.all, op("eq", keyOf(ref("i")), v(name))), ref(field))));
/** With `uniform`, each cell has the largest size of all children. */
const size = (field: string, keyOf: (i: Expr) => Expr, name: string): Expr =>
  op("if", v("uniform"), op("max", lit(0), op("max", each(axes.all, ref(field)))), largest(field, keyOf, name));
const colW = (name: string): Expr => size("w", columnOf, name);
const rowH = (name: string): Expr => size("h", rowOf, name);

/** The start of column `c`: the widths of the columns before it, each with a gap, added from left to right. */
const colX = (c: Expr): Expr => op("sum", each(axes.where(axes.all, op("lt", ref("i"), c)), let_({ $c: ref("i") }, op("add", colW("$c"), v("gap")))));
/** The start of row `r`: the first child of each row before it gives the height of that row. */
const rowY = (r: Expr): Expr =>
  op(
    "sum",
    each(
      axes.where(axes.all, op("and", op("eq", columnOf(ref("i")), lit(0)), op("lt", ref("i"), op("multiply", r, v("$cols"))))),
      let_({ $r: rowOf(ref("i")) }, op("add", rowH("$r"), v("gap"))),
    ),
  );
/** The width of the grid: the width of each column, added from left to right, and the gaps. */
const width = op("add", op("sum", each(axes.where(axes.all, op("lt", ref("i"), v("$cols"))), let_({ $c: ref("i") }, colW("$c")))), op("multiply", v("gap"), op("subtract", v("$cols"), lit(1))));
const height = op(
  "add",
  op("sum", each(axes.where(axes.all, op("eq", columnOf(ref("i")), lit(0))), let_({ $r: rowOf(ref("i")) }, rowH("$r")))),
  op("multiply", v("gap"), op("subtract", v("$rows"), lit(1))),
);
const placeIn = (where: Expr, free: Expr): Expr => op("if", op("eq", where, lit("start")), lit(0), op("if", op("eq", where, lit("center")), op("divide", free, lit(2)), free));
const half = (a: Expr): Expr => op("divide", a, lit(2));
const side = (choices: Readonly<Record<GridOptions["side"], Expr>>): Expr =>
  op("if", is("side", "bottom"), choices.bottom, op("if", is("side", "top"), choices.top, op("if", is("side", "right"), choices.right, choices.left)));

/**
 * The program of the strategy `grid`. It evaluates at each child, and it gives the offset of the child and the size of
 * the grid. The variables are the options, `mode`, `gap`, `selfW` and `selfH`.
 */
export const GRID_PROGRAM: Expr = let_(
  { $n: op("count", each(axes.all, ref("i"))), $linked: is("mode", "linked") },
  let_(
    {
      // A linked tree reads best as one row, or one column on the left and right sides.
      $cols: op(
        "if",
        op("gt", v("columns"), lit(0)),
        op("min", v("columns"), v("$n")),
        op("if", v("$linked"), op("if", op("or", is("side", "left"), is("side", "right")), lit(1), v("$n")), op("ceil", op("sqrt", v("$n")))),
      ),
    },
    let_(
      {
        $rows: op("ceil", op("divide", v("$n"), v("$cols"))),
        $col: columnOf(ref("i", ORIGIN)),
        $row: rowOf(ref("i", ORIGIN)),
        $align: op("if", is("align", "auto"), op("if", v("$linked"), lit("start"), lit("center")), v("align")),
        $dist: op("if", op("gt", v("distance"), lit(0)), v("distance"), op("multiply", v("gap"), lit(1.5))),
      },
      let_(
        {
          $x: op("subtract", op("add", colX(v("$col")), placeIn(v("justify"), op("subtract", colW("$col"), ref("w")))), ref("x")),
          $y: op("subtract", op("add", rowY(v("$row")), placeIn(v("$align"), op("subtract", rowH("$row"), ref("h")))), ref("y")),
          $w: width,
          $h: height,
        },
        op(
          "if",
          v("$linked"),
          rec({
            x: op("add", side({ bottom: op("subtract", half(v("selfW")), half(v("$w"))), top: op("subtract", half(v("selfW")), half(v("$w"))), right: op("add", v("selfW"), v("$dist")), left: op("subtract", op("negate", v("$dist")), v("$w")) }), v("$x")),
            y: op("add", side({ bottom: op("add", v("selfH"), v("$dist")), top: op("subtract", op("negate", v("$dist")), v("$h")), right: op("subtract", half(v("selfH")), half(v("$h"))), left: op("subtract", half(v("selfH")), half(v("$h"))) }), v("$y")),
            width: v("$w"),
            height: v("$h"),
          }),
          rec({ x: v("$x"), y: v("$y"), width: v("$w"), height: v("$h") }),
        ),
      ),
    ),
  ),
);

/** The kinds of the fields of a child and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const GRID_SCHEMA: Schema = {
  fields: { i: "number", x: "number", y: "number", w: "number", h: "number" },
  vars: { columns: "number", justify: "string", align: "string", uniform: "boolean", side: "string", distance: "number", mode: "string", gap: "number", selfW: "number", selfH: "number" },
};

/** The domains of the program: numbers, and texts for the options. */
export const GRID_DOMAINS: readonly [typeof NumDomain, typeof TextDomain] = [NumDomain, TextDomain];

/** This function gives the space of the children and the variables of a run of the program. */
export function gridRun(input: GridInput): { readonly space: Space; readonly vars: Readonly<Record<string, unknown>> } {
  const records = input.extents.map((e, i) => ({ i, x: e.x, y: e.y, w: e.width, h: e.height }));
  return { space: space.array(records), vars: { ...input.options, mode: input.mode, gap: input.gap, selfW: input.self.width, selfH: input.self.height } };
}

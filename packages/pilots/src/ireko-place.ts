/**
 * The ireko place pilot (docs/COMPILER.md §13.3, the engine). The engine of ireko (https://github.com/mark1russell7/ireko)
 * has two passes over the tree. The measure pass gives the size of each box and the placement of each child in the box
 * of its parent. The place pass then visits each node after its parent. It composes the placements into an absolute
 * position and an absolute scale, and it finds the nested container that holds each node.
 *
 * `placeTree` follows the code of ireko step by step. `PLACE_COLUMNS` is a sheet over the tree of the nodes. Each
 * column reads the cells of the parent, so one fill of the sheet visits each node once. The tests compare the two, with
 * the same bits. ireko has the MIT license and the same author.
 */
import { app, cell, lit, ref, space, v, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema, SheetModuleOptions } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";

/**
 * One node of the place pass. `p` is the position of the parent, or -1 for the root. `px`, `py` and `ps` are the
 * placement of the node in the box of its parent. `bw` and `bh` are the size of its box. `nested` is true for a node in
 * the nested mode.
 */
export interface PlaceRecord {
  readonly p: number;
  readonly px: number;
  readonly py: number;
  readonly ps: number;
  readonly bw: number;
  readonly bh: number;
  readonly nested: boolean;
}

/** The output of the place pass for each node: the absolute box, the absolute scale and the position of the container or -1. */
export interface PlacedRecord {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly container: number;
}

/** The origin of the layout: the absolute position of the root. */
export interface PlaceVars {
  readonly ox: number;
  readonly oy: number;
}

/** This function changes a number that is almost 0 to 0, as `clean` of ireko. It also changes `-0` to `0`. */
function clean(x: number): number {
  return Math.abs(x) < 1e-9 ? 0 : x;
}

/** The item at an index that exists by construction. */
const at = (list: ArrayLike<number>, i: number): number => list[i] ?? Number.NaN;

/** This function gives the place of each node, as the place pass of ireko. A parent comes before its children. */
export function placeTree(records: readonly PlaceRecord[], vars: PlaceVars): PlacedRecord[] {
  const n = records.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const as = new Float64Array(n);
  const container: number[] = Array.from({ length: n }, () => -1);
  const out: PlacedRecord[] = [];
  for (let i = 0; i < n; i++) {
    const r = records[i];
    if (r === undefined) throw new Error(`The record ${String(i)} does not exist.`);
    const p = r.p;
    if (p < 0) {
      ax[i] = vars.ox;
      ay[i] = vars.oy;
      as[i] = 1;
    } else {
      const ps = at(as, p);
      ax[i] = at(ax, p) + ps * r.px;
      ay[i] = at(ay, p) + ps * r.py;
      as[i] = ps * r.ps;
      container[i] = records[p]?.nested === true ? p : at(container, p);
    }
    const scale = at(as, i);
    out.push({ x: clean(at(ax, i)), y: clean(at(ay, i)), width: r.bw * scale, height: r.bh * scale, scale, container: at(container, i) });
  }
  return out;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const PARENT = { t: "parent" } as const;
/** True at the root: it has no parent. */
const ROOT = op("lt", ref("p"), lit(0));
/** The value of a column at the parent. */
const up = (column: string): Expr => cell(column, [PARENT]);
/** A number that is almost 0 changes to 0, as `clean` of ireko. */
const cleaned = (column: string): Expr => op("if", op("lt", op("abs", cell(column)), lit(1e-9)), lit(0), cell(column));
/** The absolute position on one axis: the position of the parent plus the placement, in the scale of the parent. */
const position = (origin: string, column: string, offset: string): Expr => op("if", ROOT, v(origin), op("add", up(column), op("multiply", up("as"), ref(offset))));

/**
 * The sheet of the place pass. The columns `ax`, `ay` and `as` are the absolute position and scale of each node. The
 * other columns are the output of the pass. A column reads only the cells of its own node and of the parent.
 */
export const PLACE_COLUMNS: ReadonlyMap<string, Expr> = new Map<string, Expr>([
  ["ax", position("ox", "ax", "px")],
  ["ay", position("oy", "ay", "py")],
  ["as", op("if", ROOT, lit(1), op("multiply", up("as"), ref("ps")))],
  // The container of a node is its parent in the nested mode. Else it is the container of the parent.
  ["container", op("if", ROOT, lit(-1), op("if", ref("nested", [PARENT]), ref("p"), up("container")))],
  ["x", cleaned("ax")],
  ["y", cleaned("ay")],
  ["width", op("multiply", ref("bw"), cell("as"))],
  ["height", op("multiply", ref("bh"), cell("as"))],
]);

/** The kinds of the columns. Each column of the pass reads a column before its formula, so each column needs its kind. */
export const PLACE_KINDS: NonNullable<SheetModuleOptions["kinds"]> = { ax: "number", ay: "number", as: "number", container: "number", x: "number", y: "number", width: "number", height: "number" };

/** The kinds of the fields of a node and of the variables, for the compiler (docs/COMPILER.md §3.2). */
export const PLACE_SCHEMA: Schema = {
  fields: { p: "number", px: "number", py: "number", ps: "number", bw: "number", bh: "number", nested: "boolean" },
  vars: { ox: "number", oy: "number" },
};

/** The domains of the sheet: numbers, and booleans for the tests. */
export const PLACE_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain] = [NumDomain, BoolDomain];

/** This function gives the tree space of the nodes: the key of a node is the text of its position. */
export function placeSpace(records: readonly PlaceRecord[]): Space {
  const parents = Object.fromEntries(records.flatMap((r, i) => (r.p < 0 ? [] : [[String(i), String(r.p)]])));
  return space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), parents);
}

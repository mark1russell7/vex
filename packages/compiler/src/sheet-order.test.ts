/**
 * The static order of the cells of a sheet in a module (COMPILE.MODULE.SHEET). These tests examine the functions of
 * `sheet-order.ts` directly: the reads of a column, the order of the columns and the reads of finished cells.
 */
import { app, axes, cell, each, ext, fn, fold, call, index, key, let_, lit, offset, parent, v, type Expr } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { columnOrder, isCellRef, readsFinished, readsOf, type Direction } from "./sheet-order.ts";

const NO_CELLS = new Map<string, ReadonlyMap<string, Expr>>();

/** This function gives the columns and the directions of the reads of the column `c` in the formula `e`. */
function readsIn(e: Expr, c = "c"): { readonly columns: readonly string[]; readonly directions: readonly Direction[] } {
  const r = readsOf(new Map([[c, e]]), NO_CELLS, c);
  return { columns: [...r.columns].toSorted(), directions: [...r.directions].toSorted() };
}

describe("COMPILE.MODULE.SHEET: the data of a cell reference", () => {
  it("COMPILE.MODULE.SHEET: a cell reference is an object with a column name and an address of fixed moves", () => {
    expect(isCellRef({ column: "a", at: [] })).toBe(true);
    expect(isCellRef({ column: "a", at: [offset(-1), parent, key("k"), index(2)] })).toBe(true);
    // A function with the same parts is not an object.
    expect(isCellRef(Object.assign(() => 0, { column: "a", at: [] }))).toBe(false);
    expect(isCellRef(null)).toBe(false);
    expect(isCellRef("a")).toBe(false);
    expect(isCellRef({ column: 1, at: [] })).toBe(false);
    expect(isCellRef({ column: "a" })).toBe(false);
    // Each part of the address must be a move, and a move with an expression is not fixed.
    expect(isCellRef({ column: "a", at: [{ t: "bogus" }] })).toBe(false);
    expect(isCellRef({ column: "a", at: [key(lit("k"))] })).toBe(false);
  });
});

describe("SHEET.FILL: the reads of a column and their directions", () => {
  it("SHEET.FILL: an offset reads in the direction of its first step that is not 0", () => {
    expect(readsIn(cell("c", [offset(-1)]))).toStrictEqual({ columns: ["c"], directions: ["before"] });
    expect(readsIn(cell("c", [offset(0, 2)]))).toStrictEqual({ columns: ["c"], directions: ["after"] });
    expect(readsIn(cell("c", [offset(0)]))).toStrictEqual({ columns: ["c"], directions: [] });
  });

  it("SHEET.FILL: a window reads the keys from its first offset to its last offset", () => {
    expect(readsIn(each(axes.window(-1, 1), cell("c")))).toStrictEqual({ columns: ["c"], directions: ["after", "before"] });
    expect(readsIn(each(axes.window(1, 2), cell("c")))).toStrictEqual({ columns: ["c"], directions: ["after"] });
    expect(readsIn(each(axes.window(-2, -1), cell("c")))).toStrictEqual({ columns: ["c"], directions: ["before"] });
    // The steps of a fold have the direction of its axis too.
    expect(readsIn(fold(axes.window(1, 1), { s: lit(0) }, { s: app("add", v("s"), cell("c")) }, v("s")))).toStrictEqual({ columns: ["c"], directions: ["after"] });
  });

  it("SHEET.FILL: a test of a where axis reads in the direction of its base axis", () => {
    const e = each(axes.where(axes.window(-1, -1), app("gt", cell("c"), lit(0))), lit(0));
    expect(readsIn(e)).toStrictEqual({ columns: ["c"], directions: ["before"] });
  });

  it("SHEET.FILL: an extension of another kind is not a read of a cell", () => {
    expect(readsIn(app("add", ext("other", { column: "d", at: [] }), lit(1)))).toStrictEqual({ columns: [], directions: [] });
    expect(readsIn(app("add", ext("other", 5), cell("d")))).toStrictEqual({ columns: ["d"], directions: [] });
  });
});

describe("SHEET.FILL: the order of the columns", () => {
  it("SHEET.FILL: each column comes after the columns that it reads", () => {
    const columns = new Map<string, Expr>([
      ["a", cell("b")],
      ["b", lit(1)],
    ]);
    expect(columnOrder(columns, NO_CELLS)).toStrictEqual(["b", "a"]);
  });

  it("SHEET.FILL: a cycle places its first column, and then the columns that read it", () => {
    const columns = new Map<string, Expr>([
      ["a", cell("b")],
      ["b", cell("a")],
      ["d", cell("c")],
      ["c", cell("b")],
    ]);
    expect(columnOrder(columns, NO_CELLS)).toStrictEqual(["a", "b", "c", "d"]);
  });
});

describe("COMPILE.MODULE.SHEET.DIRECT: the reads of finished cells", () => {
  const order = ["s", "later"];
  /** This function tells if each read of the formula `e` of the column `s` reads a finished cell. */
  const finished = (e: Expr, tree: boolean): boolean => readsFinished(new Map([["s", e]]), order, "s", tree);

  it("COMPILE.MODULE.SHEET.DIRECT: a column that the sheet does not have or that is not valid reads no finished cell", () => {
    expect(readsFinished(new Map(), order, "s", false)).toBe(false);
    expect(finished({ tag: "bogus" } as unknown as Expr, false)).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.DIRECT: in a post-order tree, the axis children reads finished cells under where and reverse", () => {
    expect(finished(app("sum", each(axes.children, cell("s"))), true)).toBe(true);
    expect(finished(app("sum", each(axes.where(axes.children, lit(true)), cell("s"))), true)).toBe(true);
    expect(finished(app("sum", each(axes.reverse(axes.children), cell("s"))), true)).toBe(true);
    // An empty address in the JSON form is the key itself.
    const json = { tag: "each", axis: axes.children, body: cell("s"), at: [] } as unknown as Expr;
    expect(finished(app("sum", json), true)).toBe(true);
    // The children of another key are not the children of the key, and another axis is not the axis children.
    expect(finished(app("sum", each(axes.children, cell("s"), [parent])), true)).toBe(false);
    expect(finished(app("add", app("sum", each(axes.children, cell("s"))), app("sum", each(axes.siblings, cell("s")))), true)).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.DIRECT: the first values of a fold and the body of a function read at other places", () => {
    expect(finished(fold(axes.children, { s: cell("later") }, { s: v("s") }, v("s")), true)).toBe(false);
    expect(finished(fold(axes.children, { s: lit(0) }, { s: v("s") }, cell("later")), true)).toBe(false);
    expect(finished(let_({ f: fn([], cell("s", [parent])) }, call("f")), true)).toBe(false);
    expect(finished(cell("s", [parent]), true)).toBe(true);
  });

  it("COMPILE.MODULE.SHEET.DIRECT: an extension of another kind reads no cell", () => {
    expect(finished(app("add", ext("other", { column: "later", at: [] }), lit(1)), false)).toBe(true);
    expect(finished(app("add", cell("later"), lit(1)), false)).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.DIRECT: in an array, only an offset of one negative step reads a finished cell of the column", () => {
    expect(finished(cell("s", [offset(-1)]), false)).toBe(true);
    expect(finished(cell("s", [offset(-1, 0)]), false)).toBe(false);
    expect(finished(cell("s", [offset(0)]), false)).toBe(false);
  });
});

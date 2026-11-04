/**
 * The reads of a column and the order of the columns of a sheet (SHEET.FILL). These tests examine `isCellRef`,
 * `readsOf` and `columnOrder` of `sheet.ts` directly. `SheetRun` and the module of the compiler use these functions.
 */
import { describe, expect, it } from "vitest";
import { app, axes, each, ext, fold, index, key, lit, offset, parent, v, type Expr } from "./ir.ts";
import { cell, columnOrder, isCellRef, readsOf, type Direction } from "./sheet.ts";

const NO_CELLS = new Map<string, ReadonlyMap<string, Expr>>();

/** This function gives the columns and the directions of the reads of the column `c` in the formula `e`. */
function readsIn(e: Expr, c = "c"): { readonly columns: readonly string[]; readonly directions: readonly Direction[] } {
  const r = readsOf(new Map([[c, e]]), NO_CELLS, c);
  return { columns: [...r.columns].toSorted(), directions: [...r.directions].toSorted() };
}

describe("SHEET.FILL: the data of a cell reference", () => {
  it("SHEET.FILL: a cell reference is an object with a column name and an address of fixed moves", () => {
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

/**
 * The static order of the cells of a sheet in a module (COMPILE.MODULE.SHEET). These tests examine the reads of
 * finished cells in `sheet-order.ts` directly.
 */
import { app, axes, cell, each, ext, fn, fold, call, let_, lit, offset, parent, v, type Expr, fix, index, key, last, ref } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { readsFinished } from "./sheet-order.ts";

describe("COMPILE.MODULE.SHEET.DIRECT: the reads of finished cells", () => {
  const order = ["s", "later"];
  /** This function tells if each read of the formula `e` of the column `s` reads a finished cell. */
  const finished = (e: Expr, tree: boolean): boolean => readsFinished(new Map([["s", e]]), order, "s", tree);

  it("COMPILE.MODULE.SHEET.DIRECT: a column that the sheet does not have or that is not valid reads no finished cell", () => {
    expect(readsFinished(new Map(), order, "s", false)).toBe(false);
    expect(finished({ tag: "bogus" } as unknown as Expr, false)).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.DIRECT COMPILE.FIX.MODULE: the parts of a column evaluate at each row, so a read of the column in them is no finished cell", () => {
    const earlier = cell("s", [offset(-1)]);
    expect(finished(app("add", ref("n"), earlier), false)).toBe(true);
    expect(finished(fix("x", "max", earlier, last("x")), false)).toBe(false);
    expect(finished(fix("x", "max", lit(0), app("max", last("x"), earlier)), false)).toBe(false);
    expect(readsFinished(new Map<string, Expr>([["r", ref("n")], ["s", fix("x", "max", cell("r"), last("x"))]]), ["r", "s"], "s", false)).toBe(true);
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

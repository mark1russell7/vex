import { describe, expect, it } from "vitest";
import { codeOf, formatError, vexError } from "./errors.ts";
import { describeType, labelOf, previewValue, sizeOf } from "./evaluate.ts";
import { app, axes, children, each, ext, index, isAxis, isExpr, isMove, key, let_, lit, parent, ref, rec, v, type Expr } from "./ir.ts";
import { vexList } from "./list.ts";
import { chainResult, fail, getOr, isNone, mapResult, none, ok, some } from "./result.ts";
import { Pt } from "./test-support.ts";

describe("the validation of the IR (IR.JSON)", () => {
  it("isMove accepts each move kind and rejects other values", () => {
    for (const m of [{ t: "key", key: "A" }, { t: "index", i: 2 }, { t: "offset", d: [1, -1] }, { t: "other" }, { t: "origin" }, { t: "index", i: ref("c") }, { t: "key", key: lit("A") }]) {
      expect(isMove(m)).toBe(true);
    }
    const bad = [null, 3, "key", { t: "key", key: 1 }, { t: "index", i: 1.5 }, { t: "offset", d: [0.5] }, { t: "jump" }, { t: "index", i: "c" }, { t: "index", i: { tag: "nope" } }, { t: "key", key: [] }];
    for (const m of bad) expect(isMove(m)).toBe(false);
  });

  it("isAxis accepts each axis kind, also a nested where, and rejects other values", () => {
    const nested = axes.where(axes.where(axes.others, lit(true)), lit(false));
    for (const a of [axes.all, axes.others, axes.other, axes.neighbors(4), axes.neighbors(), nested]) expect(isAxis(a)).toBe(true);
    for (const a of [null, "all", { t: "neighbors", n: 6 }, { t: "where", axis: axes.all, test: 1 }, { t: "up" }]) {
      expect(isAxis(a)).toBe(false);
    }
  });

  it("isExpr checks the whole tree", () => {
    const good: readonly Expr[] = [
      lit(1),
      ref("a.b", [{ t: "other" }]),
      app("add", ref("a"), lit(2)),
      let_({ x: lit(1) }, v("x")),
      rec({ a: lit(1) }),
      each(axes.all, ref("a")),
      ext("kind", { any: "data" }),
    ];
    for (const e of good) expect(isExpr(e)).toBe(true);
    const badExprs: readonly unknown[] = [
      null,
      "lit",
      { tag: "lit" },
      { tag: "ref", path: "a" },
      { tag: "ref", path: ["a"], at: [{ t: "jump" }] },
      { tag: "app", op: "add", args: [1] },
      { tag: "let", bind: [], body: lit(1) },
      { tag: "var", name: 1 },
      { tag: "rec", fields: { a: 1 } },
      { tag: "each", axis: { t: "up" }, body: lit(1) },
      { tag: "ext", kind: "k" },
      { tag: "loop" },
      // The expression of a computed move is a part of the tree.
      { tag: "ref", path: ["a"], at: [{ t: "index", i: { tag: "var" } }] },
      { tag: "each", axis: axes.all, body: lit(1), at: [{ t: "key", key: { tag: "lit" } }] },
    ];
    for (const e of badExprs) expect(isExpr(e)).toBe(false);
  });
});

describe("the folds over the IR", () => {
  it("children and sizeOf visit each child, also the tests of nested where axes", () => {
    const e = each(axes.where(axes.where(axes.all, lit(true)), lit(false)), ref("a"));
    expect(children(e)).toEqual([ref("a"), lit(true), lit(false)]);
    expect(children(rec({ a: lit(1), b: lit(2) }))).toEqual([lit(1), lit(2)]);
    expect(children(let_({ x: lit(1) }, v("x")))).toEqual([lit(1), v("x")]);
    expect(children(ext("k", null))).toEqual([]);
    // The expressions of computed moves come last: after the body and the tests of an axis.
    expect(children(ref("a", [index(ref("c")), parent, key(lit("B"))]))).toEqual([ref("c"), lit("B")]);
    expect(children(each(axes.where(axes.all, lit(true)), ref("a"), [index(ref("c"))]))).toEqual([ref("a"), lit(true), ref("c")]);
    expect(sizeOf(ref("a", [index(ref("c"))]))).toBe(2);
    expect(sizeOf(e)).toBe(4);
    expect(sizeOf(app("add", lit(1), rec({ a: lit(2) })))).toBe(4);
  });

  it("labelOf gives a short label for each kind", () => {
    expect(labelOf(lit("s"))).toBe('"s"');
    expect(labelOf(ref([]))).toBe("(record)");
    expect(labelOf(ref("a.b"))).toBe("a.b");
    expect(labelOf(app("add"))).toBe("add");
    expect(labelOf(let_({ x: lit(1), y: lit(2) }, v("x")))).toBe("let x, y");
    expect(labelOf(v("x"))).toBe("x");
    expect(labelOf(rec({ a: lit(1) }))).toBe("{ a }");
    expect(labelOf(each(axes.others, lit(1)))).toBe("each others");
    expect(labelOf(ext("sheet", null))).toBe("sheet");
  });

  it("previewValue and describeType give short texts for any value", () => {
    expect(previewValue(1)).toBe("1");
    expect(previewValue(undefined)).toBe("undefined");
    expect(previewValue(vexList([{ key: "A", result: ok(1) }]))).toBe("list(1)");
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
    expect(previewValue({ long: "x".repeat(80) })).toHaveLength(60);
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(previewValue(cyclic)).toBe("object");
    expect(previewValue(() => 1)).toBe("function");
    expect(describeType(null)).toBe("null");
    expect(describeType([1])).toBe("array");
    expect(describeType(vexList([]))).toBe("list");
    expect(describeType(new Pt(0, 0))).toBe("Pt");
    expect(describeType(Object.create(null))).toBe("object");
    expect(describeType("s")).toBe("string");
  });
});

describe("results and errors", () => {
  it("the Optional and Result helpers", () => {
    expect(isNone(none())).toBe(true);
    expect(isNone(some(1))).toBe(false);
    expect(getOr(some(1), 0)).toBe(1);
    expect(getOr(none(), 0)).toBe(0);
    const e = fail<number>(vexError("empty", "no values"));
    expect(mapResult(ok(2), (x) => x * 3)).toEqual(ok(6));
    expect(mapResult(e, (x) => x * 3)).toBe(e);
    expect(chainResult(ok(2), (x) => ok(x + 1))).toEqual(ok(3));
    expect(chainResult(e, (x) => ok(x + 1))).toBe(e);
  });

  it("each error kind has a code, and formatError gives one line", () => {
    expect(codeOf("unknown-key")).toBe("#REF!");
    expect(codeOf("cycle")).toBe("#CYCLE!");
    const e = vexError("unknown-key", 'there is no key "Z"', { origin: "A", focus: "B", op: "x", causes: [], thrown: 1, path: [0] });
    expect(formatError(e)).toBe('#REF! unknown-key: there is no key "Z"');
    expect(e).toMatchObject({ origin: "A", focus: "B", op: "x", causes: [], thrown: 1, path: [0] });
  });
});

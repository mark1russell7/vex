/**
 * Lists as values (LIST.VALUE, AXIS.LIST, LIST.SORT, LIST.TAKE, LIST.NTH): a `let` binds a list, the axis `list` has
 * the items of a list as targets, and the ops `sortBy`, `take` and `nth` work on the order of a list.
 */
import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { defineDomain } from "./domain.ts";
import { evaluate } from "./evaluate.ts";
import { app, axes, axisExprs, children, each, fold, isExpr, let_, lit, ref, v, type Expr } from "./ir.ts";
import { isVexList } from "./list.ts";
import { parse, serialize } from "./json.ts";
import { axisTargets, space } from "./space.ts";
import { error, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"] },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"] },
    divide: { fn: (a: number, b: number): number => a / b, params: ["number"] },
  },
});

const boxes = space.array([
  { x: 30, w: 1, s: "c" },
  { x: 10, w: 2, s: "a" },
  { x: 20, w: 3, s: "b" },
  { x: 10, w: 4, s: "B" },
]);
const run = (e: Expr, origin = "0"): ReturnType<typeof evaluate> => evaluate(e, { space: boxes, origin, domains: [Num] });
const keysOf = (r: ReturnType<typeof evaluate>): readonly string[] => {
  const list = value(r);
  return isVexList(list) ? list.items.map((item) => item.key) : [];
};
const xs = each(axes.all, ref("x"));
const sorted = app("sortBy", xs);

describe("lists as values", () => {
  it("LIST.VALUE: a let binds a list, and a list op applies to its name", () => {
    expect(value(run(let_({ xs }, app("sum", v("xs")))))).toBe(70);
    expect(value(run(let_({ xs }, app("count", v("xs")))))).toBe(4);
  });

  it("AXIS.LIST: the targets are the keys of the items, in the order of the list, and the body reads the fields of each target", () => {
    expect(keysOf(run(each(axes.list(sorted), ref("w"))))).toEqual(["1", "3", "2", "0"]);
    expect(value(run(app("values", each(axes.list(sorted), ref("w")))))).toEqual([2, 4, 3, 1]);
    // The reverse order and a test of where.
    expect(value(run(app("values", each(axes.reverse(axes.list(sorted)), ref("w")))))).toEqual([1, 3, 4, 2]);
    expect(value(run(app("values", each(axes.where(axes.list(sorted), app("gt", ref("w"), lit(2))), ref("s")))))).toEqual(["B", "b"]);
    // A fold over the list goes in its order: here, the last w.
    expect(value(run(fold(axes.list(sorted), { last: lit(0) }, { last: ref("w") }, v("last"))))).toBe(1);
  });

  it("AXIS.LIST: the list evaluates at the node, an error item gives an error item, and a value that is not a list gives #VALUE!", () => {
    // Each item has an error: the key 9 is not in the space.
    const withError = each(axes.all, app("add", ref("x"), ref("nope", [{ t: "key", key: "9" }])));
    const r = run(each(axes.list(withError), ref("w")));
    expect(isVexList(value(r))).toBe(true);
    const items = (value(r) as { items: readonly { result: { ok: boolean } }[] }).items;
    expect(items.map((item) => item.result.ok)).toEqual([false, false, false, false]);
    expect(error(run(fold(axes.list(withError), { n: lit(0) }, { n: ref("w") }, v("n")))).code).toBe("#REF!");
    expect(error(run(each(axes.list(lit(5)), ref("w"))))).toMatchObject({ code: "#VALUE!", message: 'the axis "list" needs a list, not a number' });
    expect(error(run(each(axes.list(ref("nope")), ref("w")))).code).toBe("#N/A");
    // A key that is not in the space has no record, so a read of a field there gives #N/A.
    const keys = { kind: "vex.list", items: [{ key: "7", result: { ok: true, value: 1 } }] };
    expect(error(evaluate(app("first", each(axes.list(v("k")), ref("w")), lit({ strict: true })), { space: boxes, origin: "0", domains: [Num], vars: { k: keys } }))).toMatchObject({ code: "#N/A", focus: "7" });
    // A space alone cannot give the targets of the axis list.
    expect(axisTargets(boxes, { origin: "0", focus: "0" }, { t: "list", list: xs })).toMatchObject({ ok: false, error: { code: "#VALUE!" } });
  });

  it("LIST.SORT: sortBy orders the items by their values, from the smallest, and keeps the order of equal values", () => {
    expect(keysOf(run(sorted))).toEqual(["1", "3", "2", "0"]);
    // Texts compare by their code units, so "B" comes before "a".
    expect(keysOf(run(app("sortBy", each(axes.all, ref("s")))))).toEqual(["3", "1", "2", "0"]);
    expect(keysOf(run(app("sortBy", each(axes.where(axes.all, app("gt", ref("x"), lit(100))), ref("x")))))).toEqual([]);
    // LIST.LENIENT: an error item is not in the sorted list, and strict gives the first error.
    const partial = each(axes.all, app("divide", lit(1), app("add", ref("x"), lit(-20))));
    expect(keysOf(run(app("sortBy", each(axes.all, ref("x", [{ t: "offset", d: [1] }])))))).toEqual(["0", "2", "1"]);
    expect(error(run(app("sortBy", each(axes.all, ref("x", [{ t: "offset", d: [1] }])), lit({ strict: true })))).code).toBe("#REF!");
    // 1 / 0 is not a finite number, so the item of the key 2 is an error.
    expect(keysOf(run(app("sortBy", partial)))).toEqual(["1", "3", "0"]);
  });

  it("LIST.SORT: values of two kinds, NaN and other values give #VALUE!", () => {
    const mixed = space.array([{ v: 1 }, { v: "a" }]);
    const sortV = app("sortBy", each(axes.all, ref("v")));
    expect(error(evaluate(sortV, { space: mixed, origin: "0" }))).toMatchObject({ code: "#VALUE!", message: '"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a string' });
    expect(error(evaluate(sortV, { space: space.array([{ v: 2 }, { v: Number.NaN }]), origin: "0" })).message).toBe('"sortBy" needs numbers without NaN or texts, all of one kind, but an item is NaN');
    expect(error(evaluate(sortV, { space: space.array([{ v: true }]), origin: "0" })).message).toBe('"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a boolean');
    expect(error(evaluate(app("sortBy", each(axes.all, lit(null))), { space: mixed, origin: "0" })).message).toBe('"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a null');
  });

  it("LIST.TAKE LIST.NTH: the first items of a list, and the value at a position", () => {
    expect(keysOf(run(app("take", sorted, lit(2))))).toEqual(["1", "3"]);
    expect(keysOf(run(app("take", sorted, lit(0))))).toEqual([]);
    expect(keysOf(run(app("take", sorted, lit(9))))).toEqual(["1", "3", "2", "0"]);
    expect(value(run(app("nth", sorted, lit(2))))).toBe(20);
    expect(value(run(app("nth", sorted, lit(0))))).toBe(10);
    expect(error(run(app("nth", sorted, lit(4))))).toMatchObject({ code: "#N/A", message: '"nth" has no item at the position 4, and the list has 4 items' });
    for (const bad of [lit(-1), lit(1.5), lit("1"), lit(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(error(run(app("take", sorted, bad))).code).toBe("#VALUE!");
      expect(error(run(app("nth", sorted, bad))).code).toBe("#VALUE!");
    }
    expect(error(run(app("nth", sorted))).message).toBe('"nth" needs a whole number from 0, not undefined');
    // The options come after the number. Strict gives the first error item.
    const gaps = each(axes.all, ref("x", [{ t: "offset", d: [1] }]));
    expect(value(run(app("nth", gaps, lit(2))))).toBe(10);
    expect(error(run(app("nth", gaps, lit(0), lit({ strict: true })))).code).toBe("#REF!");
    expect(error(run(app("take", gaps, lit(1), lit({ strict: true })))).code).toBe("#REF!");
  });

  it("AXIS.LIST: the list is a child before the tests of where, it evaluates outside the axis, and JSON keeps it", () => {
    const test = app("gt", ref("w"), lit(1));
    const e = each(axes.where(axes.reverse(axes.list(v("xs"))), test), ref("w"));
    expect(axisExprs(e.axis)).toEqual([v("xs"), test]);
    expect(children(e)).toEqual([ref("w"), v("xs"), test]);
    expect(isExpr(e)).toBe(true);
    expect(isExpr({ tag: "each", axis: { t: "list" }, body: lit(1) })).toBe(false);
    expect(value(parse(value(serialize(let_({ xs }, e))), []))).toEqual(let_({ xs }, e));
    // The read of the list is outside the axis, and the reads of the body and the test are inside it.
    expect(deps(each(axes.where(axes.list(xs), test), ref("w")))).toEqual([
      { at: [], path: ["w"], axes: ["where"], axisAt: [[]] },
      { at: [], path: ["x"], axes: ["all"], axisAt: [[]] },
      { at: [], path: ["w"], axes: ["where"], axisAt: [[]] },
    ]);
    expect(deps(fold(axes.list(xs), { n: ref("s") }, { n: ref("w") }, v("n")))).toEqual([
      { at: [], path: ["s"], axes: [], axisAt: [] },
      { at: [], path: ["w"], axes: ["list"], axisAt: [[]] },
      { at: [], path: ["x"], axes: ["all"], axisAt: [[]] },
    ]);
  });
});

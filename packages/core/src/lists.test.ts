/**
 * Lists as values (LIST.VALUE, AXIS.LIST, LIST.SORT, LIST.TAKE, LIST.NTH): a `let` binds a list, the axis `list` has
 * the items of a list as targets, and the ops `sortBy`, `take` and `nth` work on the order of a list.
 */
import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { defineDomain } from "./domain.ts";
import { evaluate } from "./evaluate.ts";
import { vexError } from "./errors.ts";
import { app, axes, axisExprs, call, children, each, fn, fold, isExpr, iterate, let_, lit, rec, ref, v, type Expr } from "./ir.ts";
import { isVexList, vexList, type VexList } from "./list.ts";
import { parse, serialize } from "./json.ts";
import { axisTargets, space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

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
const runWith = (e: Expr, vars: Readonly<Record<string, unknown>>): ReturnType<typeof evaluate> => evaluate(e, { space: boxes, origin: "0", domains: [Num], vars });
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
    expect(axisTargets(boxes, { origin: "0", focus: "0" }, { t: "list", list: xs })).toMatchObject({ ok: false, error: { code: "#VALUE!", message: 'the axis "list" needs the evaluator, which gives the value of its list' } });
    // An error of the list has the path of the list, and an error of a test has the path of the test.
    expect(error(run(each(axes.list(ref("nope")), ref("w")))).path).toEqual([1]);
    const tested = value(run(each(axes.where(axes.list(xs), ref("nope")), ref("w")))) as { items: readonly { result: { ok: boolean; error?: { path: readonly number[] } } }[] };
    expect(tested.items[0]?.result.error?.path).toEqual([2]);
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

  it("LIST.SORT: a long list with equal values gets the order of the values, and equal values keep their order", () => {
    // A long list goes through the merges of the sort of the engine, so each part of the comparison counts.
    const many = space.array(Array.from({ length: 300 }, (_x, i) => ({ v: (i * 7919) % 101 })));
    const r = evaluate(app("keys", app("sortBy", each(axes.all, ref("v")))), { space: many, origin: "0" });
    const expected = many.keys.toSorted((a, b) => ((Number(a) * 7919) % 101) - ((Number(b) * 7919) % 101) || Number(a) - Number(b));
    expect(value(r)).toEqual(expected);
  });

  it("LIST.SORT: values of two kinds, NaN and other values give #VALUE!", () => {
    const mixed = space.array([{ v: 1 }, { v: "a" }]);
    const sortV = app("sortBy", each(axes.all, ref("v")));
    expect(error(evaluate(sortV, { space: mixed, origin: "0" }))).toMatchObject({ code: "#VALUE!", message: '"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a string' });
    expect(error(evaluate(sortV, { space: space.array([{ v: 2 }, { v: Number.NaN }]), origin: "0" })).message).toBe('"sortBy" needs numbers without NaN or texts, all of one kind, but an item is NaN');
    expect(error(evaluate(sortV, { space: space.array([{ v: true }]), origin: "0" })).message).toBe('"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a boolean');
    expect(error(evaluate(app("sortBy", each(axes.all, lit(null))), { space: mixed, origin: "0" }))).toMatchObject({ op: "sortBy", message: '"sortBy" needs numbers without NaN or texts, all of one kind, but an item is a null' });
  });

  it("LIST.TAKE LIST.NTH: the first items of a list, and the value at a position", () => {
    expect(keysOf(run(app("take", sorted, lit(2))))).toEqual(["1", "3"]);
    expect(keysOf(run(app("take", sorted, lit(0))))).toEqual([]);
    expect(keysOf(run(app("take", sorted, lit(9))))).toEqual(["1", "3", "2", "0"]);
    expect(value(run(app("nth", sorted, lit(2))))).toBe(20);
    expect(value(run(app("nth", sorted, lit(0))))).toBe(10);
    expect(error(run(app("nth", sorted, lit(4))))).toMatchObject({ code: "#N/A", op: "nth", message: '"nth" has no item at the position 4, and the list has 4 items' });
    for (const bad of [lit(-1), lit(1.5), lit("1"), lit(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(error(run(app("take", sorted, bad))).code).toBe("#VALUE!");
      expect(error(run(app("nth", sorted, bad))).code).toBe("#VALUE!");
    }
    expect(error(run(app("nth", sorted)))).toMatchObject({ op: "nth", message: '"nth" needs a whole number from 0, not undefined' });
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
    // JSON encodes a value of a domain in the list of an axis, also inside reverse, and in a function and a call.
    const pt = lit(new Pt(1, 2));
    const encoded = rec({
      list: each(axes.list(each(axes.all, pt)), lit(1)),
      reverse: each(axes.reverse(axes.list(each(axes.all, pt))), lit(1)),
      fn: let_({ f: fn(["x"], app("add", v("x"), pt)) }, call("f", pt)),
    });
    expect(value(parse(value(serialize(encoded, [PtDomain])), [PtDomain]))).toStrictEqual(encoded);
    expect(error(parse('{"tag":"each","axis":null,"body":{"tag":"lit","value":1}}', [])).code).toBe("#VALUE!");
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

describe("list ops that build lists (LIST.BUILD)", () => {
  // The widths in key order: 1, 2, 3 and 4.
  const ws = each(axes.all, ref("w"));
  // The x of the next box: the key 3 has no next box, so its item is #REF!.
  const gaps = each(axes.all, ref("x", [{ t: "offset", d: [1] }]));
  // Each item is #N/A.
  const missing = each(axes.all, ref("nope"));
  const strict = lit({ strict: true });
  // A list with an item of #DEPTH!: a full call stack of the engine.
  const deep: VexList = vexList([{ key: "0", result: { ok: false, error: vexError("depth", "the call stack is full") } }]);

  it("LIST.DROP: the items after the first n items, and a larger n gives an empty list", () => {
    expect(keysOf(run(app("drop", sorted, lit(1))))).toEqual(["3", "2", "0"]);
    expect(keysOf(run(app("drop", sorted, lit(0))))).toEqual(["1", "3", "2", "0"]);
    expect(keysOf(run(app("drop", sorted, lit(4))))).toEqual([]);
    expect(keysOf(run(app("drop", sorted, lit(9))))).toEqual([]);
    expect(value(run(app("values", app("drop", ws, lit(2)))))).toEqual([3, 4]);
    for (const bad of [lit(-1), lit(1.5), lit("1"), lit(Number.MAX_SAFE_INTEGER + 1)]) expect(error(run(app("drop", sorted, bad)))).toMatchObject({ code: "#VALUE!", op: "drop" });
    expect(error(run(app("drop", sorted)))).toMatchObject({ code: "#VALUE!", message: '"drop" needs a whole number from 0, not undefined' });
    // LIST.LENIENT: the error item of the key 3 is not in the list, and strict gives it. The options come after n.
    expect(keysOf(run(app("drop", gaps, lit(1))))).toEqual(["1", "2"]);
    expect(error(run(app("drop", gaps, lit(1), strict))).code).toBe("#REF!");
  });

  it("LIST.APPEND: the items of the list and then the items of the other list, also with the same keys", () => {
    const two = app("take", sorted, lit(2));
    expect(keysOf(run(app("append", two, ws)))).toEqual(["1", "3", "0", "1", "2", "3"]);
    expect(value(run(app("values", app("append", two, ws))))).toEqual([10, 10, 1, 2, 3, 4]);
    expect(value(run(app("sum", app("append", ws, ws))))).toBe(20);
    expect(keysOf(run(app("append", app("take", ws, lit(0)), two)))).toEqual(["1", "3"]);
    expect(keysOf(run(app("append", two, app("take", ws, lit(0)))))).toEqual(["1", "3"]);
    // The axis list goes over each item, also over two items with one key.
    expect(value(run(app("values", each(axes.list(app("append", two, two)), ref("s")))))).toEqual(["a", "B", "a", "B"]);
    expect(error(run(app("append", ws, lit(5))))).toMatchObject({ code: "#VALUE!", op: "append", message: '"append" needs a list as its second argument, not a number' });
    expect(error(run(app("append", ws))).code).toBe("#VALUE!");
  });

  it("LIST.WITHOUT: the items of the list whose key is not the key of an item of the other list", () => {
    expect(keysOf(run(app("without", sorted, app("take", ws, lit(2)))))).toEqual(["3", "2"]);
    expect(keysOf(run(app("without", ws, sorted)))).toEqual([]);
    expect(keysOf(run(app("without", ws, app("take", ws, lit(0)))))).toEqual(["0", "1", "2", "3"]);
    // Only the keys count, not the values, and each item with a removed key goes.
    expect(keysOf(run(app("without", ws, each(axes.all, lit(false)))))).toEqual([]);
    expect(keysOf(run(app("without", app("append", ws, ws), app("drop", ws, lit(2)))))).toEqual(["0", "1", "0", "1"]);
    expect(error(run(app("without", ws, lit("0"))))).toMatchObject({ code: "#VALUE!", op: "without", message: '"without" needs a list as its second argument, not a string' });
  });

  it("LIST.FLAT: the items of the lists of the items, in order, and a value that is not a list gives #VALUE!", () => {
    // At each target, the next two boxes: the window of the offsets 0 and 1 from the next box.
    const nexts = each(axes.all, each(axes.window(0, 1), ref("w"), [{ t: "offset", d: [1] }]));
    expect(keysOf(run(app("flat", nexts)))).toEqual(["1", "2", "2", "3", "3"]);
    expect(value(run(app("values", app("flat", nexts))))).toEqual([2, 3, 3, 4, 4]);
    expect(keysOf(run(app("flat", each(axes.where(axes.all, lit(false)), ws))))).toEqual([]);
    // The grandchildren in a tree: a list of the lists of the children of each child.
    const tree = space.tree({ r: { n: 1 }, a: { n: 2 }, b: { n: 3 }, c: { n: 4 }, d: { n: 5 } }, { a: "r", b: "r", c: "a", d: "b" });
    expect(value(evaluate(app("keys", app("flat", each(axes.children, each(axes.children, ref("n"))))), { space: tree, origin: "r" }))).toEqual(["c", "d"]);
    expect(error(run(app("flat", ws)))).toMatchObject({ code: "#VALUE!", op: "flat", message: '"flat" needs a list as the value of each item, but an item is a number' });
  });

  it("LIST.BUILD: an item keeps its key and its value, and LIST.LENIENT applies to each list that the op reads", () => {
    const items = (e: Expr): VexList["items"] => {
      const list = value(run(e));
      return isVexList(list) ? list.items : [];
    };
    expect(items(app("append", gaps, ws))).toEqual([...items(gaps).filter((item) => item.result.ok), ...items(ws)]);
    expect(items(app("drop", ws, lit(3)))).toEqual(items(ws).slice(3));
    // By default, an error item is not in the new list: the key 3 of gaps.
    expect(keysOf(run(app("append", gaps, gaps)))).toEqual(["0", "1", "2", "0", "1", "2"]);
    expect(keysOf(run(app("without", ws, gaps)))).toEqual(["3"]);
    const mixed = each(axes.all, app("if", app("gt", ref("w"), lit(3)), ref("nope"), gaps));
    expect(keysOf(run(app("flat", mixed)))).toEqual(["0", "1", "2", "0", "1", "2", "0", "1", "2"]);
    // With strict, the first error item of the list comes first, and then the first error item of the other lists.
    expect(error(run(app("append", gaps, missing, strict))).code).toBe("#REF!");
    expect(error(run(app("append", ws, missing, strict))).code).toBe("#N/A");
    expect(error(run(app("without", ws, gaps, strict))).code).toBe("#REF!");
    expect(error(run(app("flat", mixed, strict))).code).toBe("#N/A");
    expect(error(run(app("flat", each(axes.window(0, 0), gaps), strict))).code).toBe("#REF!");
    // EVAL.DEPTH: no list op skips #DEPTH!, also in the other lists.
    for (const e of [app("append", ws, v("d")), app("without", ws, v("d")), app("flat", each(axes.window(0, 0), v("d"))), app("drop", v("d"), lit(0))]) {
      expect(error(runWith(e, { d: deep })).code).toBe("#DEPTH!");
    }
    // The ops are app nodes, so JSON keeps them.
    const e = app("flat", each(axes.all, app("without", app("append", ws, gaps), app("drop", sorted, lit(1)), strict)));
    expect(isExpr(e)).toBe(true);
    expect(value(parse(value(serialize(e)), []))).toEqual(e);
  });

  it("LIST.APPEND LIST.DROP LIST.WITHOUT LIST.FLAT: an iteration keeps the stack of a depth-first search in a list", () => {
    // a goes to b and c, b and c go to d, and e goes to a. The search starts at each key, in key order.
    const g = space.graph({ a: {}, b: {}, c: {}, d: {}, e: {} }, { a: ["b", "c"], b: ["d"], c: ["d"], e: ["a"] });
    // The top of the stack, if the search did not see it: a list with one item, or an empty list.
    const fresh = app("without", app("take", v("stack"), lit(1)), v("seen"));
    const search = iterate(
      100,
      { stack: each(axes.all, lit(0)), seen: app("take", each(axes.all, lit(0)), lit(0)) },
      // The step removes the top, and it puts the successors of a new top on the stack, in their order.
      { stack: app("append", app("flat", each(axes.list(fresh), each(axes.successors, lit(0)))), app("drop", v("stack"), lit(1))), seen: app("append", v("seen"), fresh) },
      app("keys", v("seen")),
      app("gt", lit(1), app("count", v("stack"))),
    );
    expect(value(evaluate(search, { space: g, origin: "a", domains: [Num] }))).toEqual(["a", "b", "d", "c", "e"]);
  });
});

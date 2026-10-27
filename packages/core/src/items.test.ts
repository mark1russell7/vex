/**
 * The names of the items of a loop over a list (AXIS.LIST.ITEM, AXIS.LIST.INDEX, AXIS.LIST.SCOPE): the field `as` binds
 * the value of each item and its position. Each test compares tier 1 with the kernel.
 */
import { check } from "@mark1russell7/coeval";
import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { fromDocument, toDocument, type Envelope } from "./document.ts";
import { defineDomain } from "./domain.ts";
import { evaluate } from "./evaluate.ts";
import { app, axes, call, each, fn, fold, isExpr, iterate, let_, lit, ref, shapeError, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { vexMachine } from "./kernel.ts";
import { isVexList } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import type { Result } from "./result.ts";
import { space } from "./space.ts";
import { value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"] },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"] },
  },
});

const rows = space.array([{ w: 1 }, { w: 2 }, { w: 3 }, { w: 4 }]);
type Vars = Readonly<Record<string, unknown>>;

/** This function gives the value of a result, or its code. A list gives each item as a key and a value or a code. */
function plain(r: Result<unknown>): unknown {
  if (!r.ok) return r.error.code;
  if (!isVexList(r.value)) return r.value;
  return r.value.items.map((item) => [item.key, item.result.ok ? item.result.value : item.result.error.code]);
}

/** This function gives the result of tier 1, and checks that the kernel gives the same value or code. */
function both(e: Expr, vars: Vars = {}): unknown {
  const expected = plain(evaluate(e, { space: rows, origin: "0", domains: [Num], vars }));
  expect(plain(kernelPlan(e, { domains: [Num] }).run({ space: rows, origin: "0", vars }))).toEqual(expected);
  return expected;
}

const l = v("l");
const L = { l: [10, null, 30, 40] };
const doc = (e: Expr): Envelope => value(toDocument(e, [Num]));

/** This function gives the document of a loop with another field `as`. */
function withAs(e: Expr, as: unknown): unknown {
  const d = doc(e);
  return { ...d, value: { ...(d.value as Readonly<Record<string, unknown>>), as } };
}

describe("the names of the items of a loop over a list (AXIS.LIST.ITEM)", () => {
  it("AXIS.LIST.ITEM: the item name holds the value of the item of each target", () => {
    expect(both(each(axes.list(l), app("add", v("x"), lit(1)), undefined, ["x"]), L)).toEqual([["0", 11], ["1", "#N/A"], ["2", 31], ["3", 41]]);
    expect(both(each(axes.reverse(axes.list(l)), v("x"), undefined, ["x"]), L)).toEqual([["3", 40], ["2", 30], ["1", "#N/A"], ["0", 10]]);
    // A list of records of the space: the item is the value, and the body still reads the record of the key.
    const ws = each(axes.all, ref("w"));
    expect(both(each(axes.list(ws), app("add", v("x"), ref("w")), undefined, ["x"]))).toEqual([["0", 2], ["1", 4], ["2", 6], ["3", 8]]);
  });

  it("AXIS.LIST.ITEM: an error item gives an error item, the body does not evaluate, and a fold gives the error", () => {
    expect(both(each(axes.list(l), lit(1), undefined, ["x"]), L)).toEqual([["0", 1], ["1", "#N/A"], ["2", 1], ["3", 1]]);
    expect(both(fold(axes.list(l), { s: lit(0) }, { s: app("add", v("s"), v("x")) }, v("s"), undefined, ["x"]), L)).toBe("#N/A");
    expect(both(fold(axes.list(l), { s: lit(0) }, { s: app("add", v("s"), v("x")) }, v("s"), undefined, ["x"]), { l: [1, 2, 3] })).toBe(6);
  });

  it("AXIS.LIST.ITEM: a filter by the value of the item goes in the body", () => {
    const keep = app("if", app("gt", v("x"), lit(15)), app("fill", lit(1), v("x")), app("fill", lit(0), v("x")));
    expect(both(app("values", app("flat", each(axes.list(l), keep, undefined, ["x"]))), L)).toEqual([30, 40]);
  });
});

describe("the index of an item (AXIS.LIST.INDEX)", () => {
  it("AXIS.LIST.INDEX: the index is the position as nth counts it, without the error items", () => {
    expect(both(each(axes.list(l), v("i"), undefined, ["x", "i"]), L)).toEqual([["0", 0], ["1", "#N/A"], ["2", 1], ["3", 2]]);
    expect(both(each(axes.list(l), app("nth", l, v("i")), undefined, ["x", "i"]), L)).toEqual([["0", 10], ["1", "#N/A"], ["2", 30], ["3", 40]]);
  });

  it("AXIS.LIST.INDEX: under reverse, the index is the position in the list, not in the order of the loop", () => {
    expect(both(each(axes.reverse(axes.list(l)), v("i"), undefined, ["x", "i"]), L)).toEqual([["3", 2], ["2", 1], ["1", "#N/A"], ["0", 0]]);
    const last = fold(axes.reverse(axes.list(l)), { i: lit(-1) }, { i: v("j") }, v("i"), undefined, ["x", "j"]);
    expect(both(last, { l: [5, 6, 7] })).toBe(0);
  });

  it("AXIS.LIST.INDEX: a test of where keeps the value and the index of each item", () => {
    const big = axes.where(axes.list(v("ws")), app("gt", ref("w"), lit(2)));
    const list = each(axes.all, ref("w"));
    expect(both(let_({ ws: list }, each(big, app("add", v("x"), v("i")), undefined, ["x", "i"])))).toEqual([["2", 5], ["3", 7]]);
  });

  it("AXIS.LIST.INDEX: the item at each index equals nth of the list at that index, in each tier", () => {
    // Each array of at most 4 items from 1, -2 and null, in both orders.
    let arrays: (number | null)[][] = [[]];
    for (let n = 0; n < 4; n++) arrays = [...arrays, ...arrays.filter((a) => a.length === n).flatMap((a) => [1, -2, null].map((x) => [...a, x]))];
    expect(arrays).toHaveLength(121);
    for (const xs of arrays) {
      for (const back of [false, true]) {
        const axis = back ? axes.reverse(axes.list(l)) : axes.list(l);
        const named = both(each(axis, v("x"), undefined, ["x", "i"]), { l: xs });
        expect(both(each(axis, app("nth", l, v("i")), undefined, ["x", "i"]), { l: xs })).toEqual(named);
        const keys = xs.map((_x, i) => String(i));
        expect((named as readonly (readonly [string, unknown])[]).map(([key]) => key)).toEqual(back ? keys.toReversed() : keys);
      }
    }
  });
});

describe("the scope of the names of the items (AXIS.LIST.SCOPE)", () => {
  it("AXIS.LIST.SCOPE: the names hide an outer name in the body and in the step", () => {
    expect(both(let_({ x: lit(100) }, each(axes.list(l), v("x"), undefined, ["x"])), { l: [1, 2] })).toEqual([["0", 1], ["1", 2]]);
    expect(both(let_({ x: lit(100) }, fold(axes.list(l), { s: lit(0) }, { s: app("add", v("s"), v("x")) }, v("s"), undefined, ["x"])), { l: [1, 2] })).toBe(3);
  });

  it("AXIS.LIST.SCOPE: the test of where reads the outer name, or gives #NAME?", () => {
    const tested = each(axes.where(axes.list(l), app("gt", v("x"), lit(1))), v("x"), undefined, ["x"]);
    expect(both(let_({ x: lit(2) }, tested), { l: [1, 2] })).toEqual([["0", 1], ["1", 2]]);
    expect(both(let_({ x: lit(0) }, tested), { l: [1, 2] })).toEqual([]);
    expect(both(tested, { l: [1, 2] })).toEqual([["0", "#NAME?"], ["1", "#NAME?"]]);
    expect(check(vexMachine({ domains: [Num] }), doc(tested), { declaredType: "lit", names: ["l"] })).toMatchObject([{ code: "#NAME?" }]);
    expect(check(vexMachine({ domains: [Num] }), doc(let_({ x: lit(0) }, tested)), { declaredType: "lit", names: ["l"] })).toEqual([]);
  });

  it("AXIS.LIST.SCOPE: the result of a fold and the list do not see the names", () => {
    const sum = fold(axes.list(l), { s: lit(0) }, { s: app("add", v("s"), v("x")) }, v("x"), undefined, ["x"]);
    expect(both(sum, { l: [1, 2] })).toBe("#NAME?");
    expect(both(let_({ x: lit(7) }, sum), { l: [1, 2] })).toBe(7);
    expect(both(each(axes.list(v("x")), lit(1), undefined, ["x"]))).toBe("#NAME?");
    expect(check(vexMachine({ domains: [Num] }), doc(sum), { declaredType: "lit", names: ["l"] })).toMatchObject([{ code: "#NAME?" }]);
    const body = each(axes.list(l), app("add", v("x"), v("i")), undefined, ["x", "i"]);
    expect(check(vexMachine({ domains: [Num] }), doc(body), { declaredType: "lit", names: ["l"] })).toEqual([]);
  });

  it("AXIS.LIST.SCOPE: a name of as hides a function, and a loop without as does not", () => {
    const f = fn([], ref("w"));
    const hidden = deps(let_({ f }, each(axes.list(l), call("f"), undefined, ["f"])));
    const seen = deps(let_({ f }, each(axes.list(l), call("f"))));
    expect(hidden.some((d) => d.path[0] === "w")).toBe(false);
    expect(seen.some((d) => d.path[0] === "w")).toBe(true);
  });
});

describe("the field as of a document (DOC.CONSTRUCT)", () => {
  const loops: readonly Expr[] = [
    each(axes.list(l), v("x"), undefined, ["x"]),
    each(axes.where(axes.reverse(axes.list(l)), lit(true)), v("i"), undefined, ["x", "i"]),
    fold(axes.list(l), { s: lit(0) }, { s: app("add", v("s"), v("x")) }, v("s"), undefined, ["x", "i"]),
  ];

  it("DOC.CONSTRUCT: a loop with as goes to a document and back, and to JSON and back", () => {
    for (const e of loops) {
      expect(isExpr(e)).toBe(true);
      expect(value(fromDocument(doc(e), [Num]))).toEqual(e);
      expect(value(parse(value(serialize(e)), [Num]))).toEqual(e);
    }
    expect(each(axes.list(l), lit(1))).not.toHaveProperty("as");
    expect(fold(axes.list(l), {}, {}, lit(1))).not.toHaveProperty("as");
  });

  it("DOC.CONSTRUCT: a field as that is not valid makes the expression and the document not valid", () => {
    const body = v("x");
    const bad: readonly [unknown, string][] = [
      [[], "a list of one or two names"],
      [["x", "i", "j"], "a list of one or two names"],
      [[1], "a list of one or two names"],
      ["x", "a list of one or two names"],
      [["x", "x"], 'the two names of "as" are the same name "x"'],
    ];
    for (const [as, reason] of bad) {
      const e = { tag: "each", axis: axes.list(l), body, as };
      expect(isExpr(e)).toBe(false);
      expect(shapeError(e)).toContain(reason);
    }
    for (const axis of [axes.all, axes.where(axes.all, lit(true)), axes.reverse(axes.children)]) {
      expect(shapeError({ tag: "each", axis, body, as: ["x"] })).toContain('"as" needs the axis "list"');
    }
    const clash = { tag: "fold", axis: axes.list(l), init: { x: lit(0) }, step: {}, result: lit(0), as: ["y", "x"] };
    expect(shapeError(clash)).toContain('the name "x" of "as" is a name of "init" too');
  });

  it("DOC.CONSTRUCT: a document with a field as that is not valid gives an error at the field", () => {
    for (const as of [["x", "x"], [], 7]) expect(fromDocument(withAs(each(axes.list(l), v("x")), as), [Num]).ok).toBe(false);
    const r = fromDocument(withAs(each(axes.all, lit(1)), ["x"]), [Num]);
    expect(r.ok ? undefined : r.error.message).toContain('"as" needs the axis "list"');
    // The contract of iterate is closed, and iterate has no axis, so it has no field as.
    expect(fromDocument(withAs(iterate(1, {}, {}, lit(0)), ["x"]), [Num]).ok).toBe(false);
  });
});

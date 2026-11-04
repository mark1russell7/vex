import { app, axes, defineDomain, each, evaluate, ext, fn, fold, iterate, lit, let_, ok, call, ref, space, v, vexError, vexList, fail, type Addr, type Axis, type Expr, type ExtHandler, type FreeFn, type Space } from "@mark1russell7/vex";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

/**
 * The differential test of the list values (COMPILE.LIST.VALUE). For each program, the tiered program gives the bits of
 * the interpreter and of the reference tier. The field `fast` tells if tier 2 gives the result with no fallback.
 */
const DEPTH = fail(vexError("depth", "too deep"));
const extensions: Readonly<Record<string, ExtHandler>> = {
  deep: () => DEPTH,
  sad: () => fail(vexError("kind-mismatch", "sad")),
};
const fns: Readonly<Record<string, FreeFn>> = { take: () => 99, fill: () => 77 };
const Boom = defineDomain({
  name: "Boom",
  primitive: "number",
  is: (u: unknown): u is number => typeof u === "number" && u > 1000,
  ops: {
    boom: {
      fn: (): number => {
        throw new Error("boom");
      },
    },
    deep: {
      fn: function deep(): number {
        return deep() + 1;
      },
    },
  },
});
const OPTIONS: GenerateOptions = { domains: [Boom, NumDomain, TextDomain], extensions };

const S = space.array([
  { n: 3, id: "1", t: "a" },
  { n: 1, id: "2", t: "b" },
  { n: 2, id: "0", t: "a" },
]);
const ns = each(axes.all, ref("n"));
const ts = each(axes.all, ref("t"));
const sorted = app("sortBy", ns);
const empty = lit(vexList([]));
const bad = vexError("kind-mismatch", "an item", { origin: "x", focus: "x" });
const good = (key: string, value: unknown) => ({ key, result: ok(value) });
const hurt = (key: string) => ({ key, result: fail(bad) });
const deepItem = (key: string) => ({ key, result: DEPTH });
const VARS = {
  hurt: vexList([good("0", 5), hurt("1"), good("2", 7)]),
  deep: vexList([good("0", 5), deepItem("1")]),
  big: vexList([good("0", 2000), good("1", 3000)]),
  flat: vexList([good("0", vexList([good("a", 1)])), hurt("1")]),
  array: [4, 5],
  holes: [4, undefined],
};
const hurtItems = lit(VARS.hurt);
const take1 = app("take", ns, lit(1));
const deepExt = ext("deep", null);

/** A case: its title, its program and the answer to the question "does tier 2 give the result". */
type Case = readonly [string, Expr, boolean];

function same(e: Expr, fast: boolean, options: GenerateOptions = OPTIONS): void {
  const p = tiered(e, options);
  expect(p.tier).toBe(2);
  for (const k of S.keys) {
    const run = { space: S, origin: k, vars: VARS };
    const expected = fromCore(evaluate(e, { ...options, ...run }));
    expect(fromCore(p.run(run))).toStrictEqual(expected);
    expect(fromReference(referenceEvaluate(e, { ...options, ...run }))).toStrictEqual(expected);
  }
  expect(p.stats.fallbacks === 0).toBe(fast);
}

describe("COMPILE.LIST.VALUE: a list as a value in tier 2", () => {
  const values: readonly Case[] = [
    ["take", app("take", ns, lit(2)), true],
    ["take of an empty list", app("take", empty, lit(2)), true],
    ["drop past the end", app("drop", ns, lit(9)), true],
    ["nth", app("nth", sorted, lit(2)), true],
    ["get at the key of the field", app("get", ns, ref("id")), true],
    ["append and a loop that grows", iterate(3, { a: empty }, { a: app("append", v("a"), ns) }, v("a")), true],
    ["a fold that grows a list", fold(axes.all, { a: empty }, { a: app("append", v("a"), app("take", ns, lit(1))) }, app("count", v("a"))), true],
    ["without", app("without", ns, app("take", ns, lit(1))), true],
    ["flat over the groups", app("flat", app("group", ns, ts)), true],
    ["distinct and join", app("join", app("distinct", ts), lit("-")), true],
    ["indexOf", app("indexOf", sorted, lit(3)), true],
    ["fill", app("fill", lit(2), ref("n")), true],
    ["fill in a list op", app("sum", app("fill", ref("n"), lit(2))), true],
    ["a list op on a list of a let", let_({ a: ns }, app("get", v("a"), ref("id"))), true],
    ["sortBy with an option", app("sortBy", ts, { tag: "lit", value: { strict: true } }), true],
    ["a list op in an item", app("sum", each(axes.others, app("nth", sorted, lit(0)))), true],
    ["a list in a function", let_({ f: fn(["x"], app("first", app("take", v("x"), lit(1)))) }, call("f", ns)), true],
    ["the fused ops on a list of an op", app("sum", app("take", ns, lit(2))), true],
    ["reduce on a list of an op", app("reduce", app("take", ns, lit(2)), lit("add")), true],
    ["mean on a list of an op", app("mean", app("drop", ns, lit(1))), true],
    ["values and keys on a sorted list", rec2(app("values", sorted), app("keys", sorted)), true],
    ["a literal in the arguments", app("append", ns, lit(vexList([good("9", 9)]))), true],
  ];
  it.each(values)("%s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const errors: readonly Case[] = [
    ["an index out of range", app("nth", ns, lit(9)), true],
    ["no item at a key", app("get", ns, lit("z")), true],
    ["no item with a value", app("indexOf", ns, lit(99)), true],
    ["a wrong kind of count", app("take", ns, lit("2")), true],
    ["a count that is not whole", app("nth", ns, lit(1.5)), true],
    ["a wrong kind of key", app("get", ns, ref("n")), true],
    ["a second value that is not a list", app("append", ns, lit(1)), true],
    ["a wrong kind of value in sum", app("sum", app("take", ts, lit(1))), true],
    ["first of an empty list", app("first", empty), true],
    ["mean of an empty list", app("mean", app("take", ns, lit(0))), true],
    ["reduce with no op of a step", app("reduce", ts, lit("nope")), true],
    ["reduce on an empty list", app("reduce", empty, lit("add")), true],
    ["flat of numbers", app("flat", ns), true],
    ["join of numbers", app("join", ns, lit(",")), true],
    ["sortBy with a bad option", app("sortBy", ts, lit({ by: 1 })), true],
    ["a bad count of fill", app("fill", lit(-1), lit(1)), true],
    ["fill with no value", app("fill", lit(1)), true],
    ["fill with no arguments", app("fill"), true],
    ["two errors of list ops", app("add", app("nth", ns, lit(9)), app("get", ns, lit("z"))), true],
    ["an op in a let with an error", let_({ a: app("nth", ns, lit(9)) }, lit(1)), true],
    ["the error of an op in an if", app("if", lit(true), app("nth", ns, lit(9)), lit(0)), true],
    ["ifError hides the error", app("ifError", app("nth", ns, lit(9)), lit(0)), true],
    ["a list op skips the item", app("count", each(axes.all, app("nth", ns, lit(9)))), true],
    ["a list op in a loop gives the error", fold(axes.all, { a: lit(0) }, { a: app("nth", ns, ref("n")) }, v("a")), true],
    ["an op that throws in reduce", app("reduce", v("big"), lit("boom")), true],
    ["a full call stack in reduce", app("reduce", v("big"), lit("deep")), false],
  ];
  it.each(errors)("%s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  // A list with an error item: tier 2 makes none, and the code of the interpreter reads a list of the input (§4.1).
  const items: readonly Case[] = [
    ["each op skips the item", app("sum", v("hurt")), true],
    ["take skips the item", app("take", v("hurt"), lit(2)), true],
    ["nth counts the items with a value", app("nth", v("hurt"), lit(1)), true],
    ["get has no item at the key", app("get", v("hurt"), lit("1")), true],
    ["errors gives the error", app("errors", v("hurt")), true],
    ["a literal", app("count", hurtItems), true],
    ["the list as the result", v("hurt"), true],
    ["append keeps the good items", app("append", v("hurt"), v("hurt")), true],
    ["without reads the keys of the good items", app("without", ns, v("hurt")), true],
    ["flat skips the item", app("flat", v("flat")), true],
    ["strict gives the error of the item", app("take", v("hurt"), lit(1), lit({ strict: true })), false],
    ["strict in get gives the error of the item", app("get", v("hurt"), lit("0"), lit({ strict: true })), false],
    ["strict in a second list", app("append", ns, v("hurt"), lit({ strict: true })), false],
    ["strict in flat", app("flat", v("flat"), lit({ strict: true })), false],
    ["ifError hides the error of the item", app("ifError", app("first", v("hurt"), lit({ strict: true })), lit(0)), false],
    ["a list op skips the item of an error of an item", app("count", each(axes.all, app("first", v("hurt"), lit({ strict: true })))), false],
  ];
  it.each(items)("an error item: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  // V-066 and V-067: the program cannot catch #DEPTH!, so it wins over each error that the program can catch.
  const depth: readonly Case[] = [
    ["an extension after the error of an op", app("add", app("nth", ns, lit(9)), deepExt), false],
    ["an extension before the error of an op", app("add", deepExt, app("nth", ns, lit(9))), false],
    ["an item of a list before a wrong count", app("take", each(axes.all, deepExt), lit("x")), false],
    ["a later argument after an item of an error", app("take", each(axes.all, ext("sad", null)), deepExt), false],
    ["an extension in ifError", app("ifError", app("nth", ns, deepExt), lit(0)), false],
    ["an extension after ifError", app("add", app("ifError", app("nth", ns, lit(9)), lit(0)), deepExt), false],
    ["an item of the input", app("take", v("deep"), lit(1)), false],
    ["an item of the input with a wrong count", app("take", v("deep"), lit("x")), false],
    ["an item of the input in get", app("get", v("deep"), lit("0")), false],
    ["an item of the input in ifError", app("ifError", app("first", v("deep")), lit(0)), false],
    ["an item of the input in a loop of a list op", app("count", each(axes.all, app("first", v("deep")))), false],
    ["an item of a second list", app("append", ns, v("deep")), false],
    ["an item of a second list, with an error of an op first", app("add", app("nth", ns, lit(9)), app("count", app("append", ns, v("deep")))), false],
    ["a full call stack in a loop of a list op", app("count", each(axes.all, app("reduce", v("big"), lit("deep")))), false],
  ];
  it.each(depth)("#DEPTH! wins: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  it("LIST.GET COMPILE.ERRORS: the error of a list op has the path and the position of its node, at each focus", () => {
    const e = fold(axes.all, { a: lit(0) }, { a: app("get", ns, lit("z")) }, v("a"));
    const p = tiered(e, OPTIONS);
    const r = p.run({ space: S, origin: "1" });
    expect(r).toStrictEqual(evaluate(e, { ...OPTIONS, space: S, origin: "1" }));
    expect(p.stats.fallbacks).toBe(0);
    expect(r).toMatchObject({ ok: false, error: { op: "get", origin: "1", focus: "0", path: [1] } });
  });

  it("COMPILE.LIST.VALUE COMPILE.TIERED: a list op finds the receiver first, also with a free function or a domain op of its name", () => {
    const options: GenerateOptions = { ...OPTIONS, fns };
    // The list op wins on a list, and the host function wins on each other value.
    same(app("take", ns, lit(1)), true, options);
    same(app("take", ref("n"), lit(1)), true, options);
    // The host function wins over fill.
    same(app("fill", lit(2), lit(1)), true, options);
    const Own = defineDomain({ name: "Own", primitive: "number", is: (u: unknown): u is number => typeof u === "number", ops: { fill: { fn: (a: number, b: number): number => a * b }, take: { fn: (a: number): number => a + 1 } } });
    same(app("fill", lit(2), lit(4)), true, { domains: [Own] });
    same(app("take", ns, lit(1)), true, { domains: [Own] });
    expect(generate(app("take", ns, lit(1)), OPTIONS).ok).toBe(true);
  });

  it("COMPILE.TIERED LIST.GET: an index of the keys stays for one list, and each run gives its own list", () => {
    const e = app("get", v("a"), ref("id"));
    const p = tiered(e, OPTIONS);
    const first = vexList([good("1", 10), good("2", 20), good("0", 30)]);
    const second = vexList([good("1", 11), good("2", 21), good("0", 31)]);
    for (const a of [first, second, first]) expect(p.run({ space: S, origin: "0", vars: { a } })).toStrictEqual(evaluate(e, { ...OPTIONS, space: S, origin: "0", vars: { a } }));
    expect(p.stats.fallbacks).toBe(0);
  });
});

/** The names of the value and of the position of an item. */
const AS = ["item", "i"] as const;
/** A loop over an axis list that names its items. */
const named = (axis: Axis, body: Expr, at?: Addr): Expr => each(axis, body, at, AS);
const sumOf = (list: Expr): Expr => fold(axes.list(list), { s: lit(0) }, { s: app("add", v("s"), v("item")) }, v("s"), undefined, AS);
/** A list with a key outside the space. */
const outside = lit(vexList([good("z", 4), good("1", 5)]));
const fieldOr0 = app("ifError", ref("n"), lit(0));
/** An iteration with a data limit over an axis. */
const overList = (axis: Axis): Expr => iterate({ axis }, { s: lit(0) }, { s: app("add", v("s"), lit(2)) }, v("s"));
const toKey1: Addr = [{ t: "key", key: "1" }];

describe("COMPILE.LIST.AXIS: the axis list in tier 2", () => {
  const values: readonly Case[] = [
    ["the value and the position", named(axes.list(ns), app("add", v("item"), v("i"))), true],
    ["one name reads the value", each(axes.list(ns), v("x"), undefined, ["x"]), true],
    ["no names: the record at the key", each(axes.list(ns), ref("n")), true],
    ["the keys of the items", app("keys", each(axes.list(app("sortBy", ns)), ref("t"))), true],
    ["reverse", named(axes.reverse(axes.list(ns)), app("add", v("item"), lit(1))), true],
    ["AXIS.LIST.INDEX: reverse keeps the position of the item", named(axes.reverse(axes.list(ns)), app("nth", ns, v("i"))), true],
    ["where reads the record", named(axes.where(axes.list(ns), app("gt", ref("n"), lit(1))), app("add", v("item"), v("i"))), true],
    ["where over reverse", named(axes.where(axes.reverse(axes.list(ns)), app("gt", ref("n"), lit(1))), v("i")), true],
    ["an empty list", named(axes.list(empty), v("item")), true],
    ["the first item of the empty list", app("ifError", app("first", named(axes.list(empty), v("item"))), lit(-1)), true],
    ["a loop stops at the first item", app("first", named(axes.list(ns), app("add", v("item"), lit(1)))), true],
    ["sum, values and reduce", rec2(app("sum", named(axes.list(ns), v("item"))), app("reduce", named(axes.list(ns), v("item")), lit("add"))), true],
    ["an item that is a list", named(axes.list(lit(vexList([good("0", vexList([good("a", 1), good("b", 2)]))]))), app("count", v("item"))), true],
    ["a loop in a loop", named(axes.list(ns), app("sum", each(axes.list(ns), app("add", v("item"), v("x")), undefined, ["x"]))), true],
    ["a memo of a part reads the item", named(axes.list(ns), app("sum", each(axes.all, app("add", ref("n"), v("item"))))), true],
    ["the origin is the node", named(axes.list(ns), ref("n", [{ t: "origin" }])), true],
    ["fold", sumOf(ns), true],
    ["fold with the position", fold(axes.reverse(axes.list(ns)), { s: lit(0) }, { s: app("add", v("s"), v("i")) }, v("s"), undefined, AS), true],
    ["fold over an empty list", sumOf(empty), true],
    ["fold with where", fold(axes.where(axes.list(ns), app("gt", ref("n"), lit(1))), { s: lit(0) }, { s: app("add", v("s"), v("item")) }, v("s"), undefined, AS), true],
    ["a list that a loop grows", iterate(3, { l: take1 }, { l: app("append", v("l"), sumOf(v("l"))) }, app("sum", v("l"))), true],
    ["a stack of a depth-first walk", iterate(4, { stack: take1, seen: lit(0) }, { stack: app("drop", v("stack"), lit(1)), seen: app("add", v("seen"), sumOf(app("take", v("stack"), lit(1)))) }, v("seen")), true],
    ["an array of a name", named(axes.list(v("array")), app("add", v("item"), v("i"))), true],
    ["an array of a literal", sumOf(lit([1, 2])), true],
    ["the array of a list op", named(axes.list(app("values", ns)), v("item")), true],
    ["AXIS.LIST: the address moves the list", each(axes.list(app("take", ns, ref("n"))), v("item"), toKey1, AS), true],
    ["AXIS.LIST: a fold moves the list", fold(axes.list(app("take", ns, ref("n"))), { s: lit(0) }, { s: app("add", v("s"), v("item")) }, v("s"), toKey1, AS), true],
    ["AXIS.LIST: a computed move", each(axes.list(app("take", ns, ref("n"))), v("item"), [{ t: "key", key: lit("2") }], AS), true],
    ["AXIS.LIST: a test after a move", each(axes.where(axes.list(ns), app("gt", ref("n"), lit(1))), v("item"), toKey1, AS), true],
  ];
  it.each(values)("%s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const scopes: readonly Case[] = [
    ["AXIS.LIST.SCOPE: a test reads the outer name", let_({ item: lit(2) }, named(axes.where(axes.list(ns), app("gt", ref("n"), v("item"))), v("item"))), true],
    ["AXIS.LIST.SCOPE: the list reads the outer name", let_({ item: ns }, named(axes.list(v("item")), v("item"))), true],
    ["AXIS.LIST.SCOPE: a test does not see the name", app("ifError", app("count", named(axes.where(axes.list(ns), app("gt", v("item"), lit(1))), lit(1))), lit(-1)), true],
    ["AXIS.LIST.SCOPE: a name hides an outer name in the body", let_({ item: lit(2) }, named(axes.list(ns), v("item"))), true],
    ["AXIS.LIST.SCOPE: a step sees the names of the fold", fold(axes.list(ns), { s: lit(0), t: lit(0) }, { s: app("add", v("t"), v("item")), t: app("add", v("s"), v("i")) }, rec2(v("s"), v("t")), undefined, AS), true],
    ["AXIS.LIST.SCOPE: result does not see the name", app("ifError", fold(axes.list(ns), { s: lit(0) }, { s: lit(1) }, v("item"), undefined, AS), lit(-1)), true],
    ["FN.CALL: a name hides a function", let_({ f: fn([], lit(1)) }, app("ifError", app("count", each(axes.list(ns), call("f"), undefined, ["f"])), lit(-1))), true],
    ["FN.CALL: a body calls a function with the item", let_({ f: fn(["x"], app("add", v("x"), lit(1))) }, named(axes.list(ns), call("f", v("item")))), true],
  ];
  it.each(scopes)("%s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const errors: readonly Case[] = [
    ["a number is not a list", named(axes.list(lit(3)), v("item")), true],
    ["ifError takes a wrong kind", app("ifError", app("count", named(axes.list(lit(3)), v("item"))), lit(-1)), true],
    ["a text is not a list", app("ifError", sumOf(lit("abc")), lit(-1)), true],
    ["a record is not a list", app("ifError", sumOf(lit({ a: 1 })), lit(-1)), true],
    ["the kind error of a fold", sumOf(lit(3)), true],
    ["a wrong kind stops a let only where a body reads it", let_({ x: sumOf(lit(3)) }, lit(1)), true],
    ["the error of the list", named(axes.list(app("nth", ns, lit(9))), v("item")), true],
    ["ifError takes the error of the list", app("ifError", sumOf(app("nth", ns, lit(9))), lit(-1)), true],
    ["the error of a body in a value each", named(axes.list(ns), app("nth", ns, lit(9))), false],
    ["a lenient op skips the error of a body", app("count", named(axes.list(ns), app("nth", ns, v("item")))), true],
    ["the error of a step", fold(axes.list(ns), { s: lit(0) }, { s: app("nth", ns, lit(9)) }, v("s"), undefined, AS), true],
    ["the path of result", fold(axes.list(ns), { s: lit(0) }, { s: lit(1) }, ref("zz"), undefined, AS), true],
    ["a test without a boolean", app("ifError", app("count", named(axes.where(axes.list(ns), lit(1)), v("item"))), lit(-1)), true],
    ["the path of a test", named(axes.where(axes.list(ns), ref("zz")), v("item")), false],
    ["the path of an address after a test", each(axes.where(axes.list(ns), lit(true)), lit(1), [{ t: "key", key: app("nth", ns, lit(9)) }], AS), true],
    ["an address that fails comes before the list", each(axes.list(app("nth", ns, lit(9))), lit(1), [{ t: "key", key: "zz" }], AS), true],
    ["the origin stays with a moved list", each(axes.list(lit(3)), lit(1), toKey1, AS), true],
    ["the record of a moved list", each(axes.list(ref("zz")), lit(1), toKey1, AS), true],
  ];
  it.each(errors)("an error: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const outsiders: readonly Case[] = [
    ["AXIS.LIST: a key outside the space has no record", named(axes.list(outside), ref("n")), false],
    ["the value of the item stays", named(axes.list(outside), app("add", v("item"), v("i"))), true],
    ["ifError takes the missing record", named(axes.list(outside), fieldOr0), true],
    ["a test reads no record", app("count", named(axes.where(axes.list(outside), app("ifError", app("gt", ref("n"), lit(0)), lit(true))), v("item"))), true],
    ["all from a key outside", named(axes.list(outside), app("count", each(axes.all, ref("n")))), true],
    ["others from a key outside", named(axes.list(outside), app("count", each(axes.others, ref("n")))), true],
    ["next from a key outside", named(axes.list(outside), app("ifError", app("count", each(axes.successors, ref("n"))), lit(-1))), true],
    ["a move from a key outside", named(axes.list(outside), app("ifError", ref("n", [{ t: "key", key: "2" }]), lit(-1))), true],
    ["fold over a key outside", fold(axes.list(outside), { s: lit(0) }, { s: app("add", v("s"), fieldOr0) }, v("s"), undefined, AS), true],
  ];
  it.each(outsiders)("a key outside the space: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const items: readonly Case[] = [
    ["each", named(axes.list(hurtItems), v("item")), false],
    ["each with no names", each(axes.list(hurtItems), lit(1)), false],
    ["count skips it", app("count", named(axes.list(hurtItems), v("item"))), false],
    ["first", app("first", named(axes.list(hurtItems), v("item"))), false],
    ["errors finds it", app("errors", named(axes.list(hurtItems), v("item"))), false],
    ["a position skips it", app("values", named(axes.list(hurtItems), v("i"))), false],
    ["reverse", app("values", named(axes.reverse(axes.list(hurtItems)), v("i"))), false],
    ["where keeps it", app("count", named(axes.where(axes.list(hurtItems), lit(false)), v("item"))), false],
    ["fold stops at it", sumOf(hurtItems), false],
    ["ifError takes it from a fold", app("ifError", sumOf(hurtItems), lit(-1)), false],
    ["an array with a hole", named(axes.list(v("holes")), v("item")), false],
    ["fold over a hole", app("ifError", sumOf(v("holes")), lit(-1)), false],
    ["a list of a run", sumOf(v("hurt")), false],
  ];
  it.each(items)("an error item stays with tier 1: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const depth: readonly Case[] = [
    ["an item, then an op error", app("add", app("count", named(axes.list(v("deep")), v("item"))), app("nth", ns, lit(9))), false],
    ["an op error, then an item", app("add", app("nth", ns, lit(9)), app("count", named(axes.list(v("deep")), v("item")))), false],
    ["a wrong kind, then an extension", app("add", sumOf(lit(3)), deepExt), false],
    ["an extension, then a wrong kind", app("add", deepExt, sumOf(lit(3))), false],
    ["a body", app("ifError", app("count", named(axes.list(ns), deepExt)), lit(-1)), false],
    ["a step", app("ifError", fold(axes.list(ns), { s: lit(0) }, { s: deepExt }, v("s"), undefined, AS), lit(-1)), false],
    ["the list", app("ifError", app("count", named(axes.list(app("append", deepExt, ns)), v("item"))), lit(-1)), false],
    ["a test", app("ifError", app("count", named(axes.where(axes.list(ns), deepExt), v("item"))), lit(-1)), false],
    ["a key outside, then an extension", app("add", app("count", named(axes.list(outside), ref("n"))), deepExt), false],
  ];
  it.each(depth)("#DEPTH! wins: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  const limits: readonly Case[] = [
    ["ITERATE.LIMIT.DATA: the count of a list", overList(axes.list(ns)), true],
    ["ITERATE.LIMIT.DATA: an empty list makes no step", overList(axes.list(empty)), true],
    ["ITERATE.LIMIT.DATA: reverse", overList(axes.reverse(axes.list(ns))), true],
    ["ITERATE.LIMIT.DATA: where reads the record", overList(axes.where(axes.list(ns), app("gt", ref("n"), lit(1)))), true],
    ["ITERATE.LIMIT.DATA: the limit reads a name of the node", let_({ l: ns }, overList(axes.list(v("l")))), true],
    ["ITERATE.LIMIT.DATA: an array", overList(axes.list(v("array"))), true],
    ["ITERATE.LIMIT.DATA: the path of until after the list", iterate({ axis: axes.list(ns) }, { s: lit(0) }, { s: app("add", v("s"), lit(1)) }, v("s"), ref("zz")), true],
    ["ITERATE.LIMIT.DATA: the path of until after a test", iterate({ axis: axes.where(axes.list(ns), lit(true)) }, { s: lit(0) }, { s: app("add", v("s"), lit(1)) }, v("s"), lit(1)), true],
    ["ITERATE.LIMIT.DATA: until stops the steps", iterate({ axis: axes.list(ns) }, { s: lit(0) }, { s: app("add", v("s"), lit(1)) }, v("s"), app("gt", v("s"), lit(1))), true],
    ["ITERATE.LIMIT.ERROR: a value that is not a list", overList(axes.list(lit(3))), false],
    ["ITERATE.LIMIT.ERROR: an error of the list", overList(axes.list(app("nth", ns, lit(9)))), false],
    ["ITERATE.LIMIT.ERROR: an error item", overList(axes.list(hurtItems)), false],
    ["ITERATE.LIMIT.ERROR: a hole", overList(axes.list(v("holes"))), false],
    ["ITERATE.LIMIT.ERROR: a test that fails", overList(axes.where(axes.list(ns), ref("zz"))), false],
    ["ITERATE.LIMIT.ERROR: ifError takes the error", app("ifError", overList(axes.list(lit(3))), lit(-1)), true],
    ["#DEPTH! wins over the error of a limit", app("add", overList(axes.list(lit(3))), deepExt), false],
  ];
  it.each(limits)("a data limit: %s", (_title, e, fast) => expect(() => same(e, fast)).not.toThrow());

  it("COMPILE.LIST.AXIS AXIS.LIST: the kind error has the path of the node, the origin of the node and the focus of the address", () => {
    const e = each(axes.list(lit(3)), lit(1), toKey1);
    const run = { space: S, origin: "2", vars: VARS };
    const r = tiered(e, OPTIONS).run(run);
    expect(r).toStrictEqual(evaluate(e, { ...OPTIONS, ...run }));
    expect(r).toMatchObject({ ok: false, error: { kind: "kind-mismatch", origin: "2", focus: "1", path: [] } });
  });

  it("COMPILE.LIST.AXIS: a program over an axis list has no fallback for a run with new lists, and each run reads its own list", () => {
    const e = sumOf(v("a"));
    const p = tiered(e, OPTIONS);
    expect(p.tier).toBe(2);
    const first = vexList([good("1", 10), good("2", 20)]);
    const second = [1, 2, 3];
    for (const a of [first, second, first]) expect(p.run({ space: S, origin: "0", vars: { a } })).toStrictEqual(evaluate(e, { ...OPTIONS, space: S, origin: "0", vars: { a } }));
    expect(p.stats.fallbacks).toBe(0);
  });
});

/** A record of two values. */
function rec2(a: Expr, b: Expr): Expr {
  return { tag: "rec", fields: { a, b } };
}

const COUNTS = fc.constantFrom<Expr>(lit(0), lit(1), lit(2), lit(9), lit(-1), lit("x"), ref("n"));
const KEYS = fc.constantFrom<Expr>(lit("0"), lit("1"), lit("z"), lit(1), ref("id"));

/** A program with lists as values: list ops over axes, literals, the input and the names of loops. */
const arbList: fc.Arbitrary<Expr> = fc.letrec<{ l: Expr }>((tie) => ({
  l: fc.oneof(
    { maxDepth: 3, depthSize: "small", withCrossShrink: true },
    fc.constantFrom<Expr>(ns, ts, empty, outside, v("array"), v("holes"), v("hurt"), v("flat"), v("big"), each(axes.others, ref("n")), each(axes.all, app("nth", ns, ref("n"))), each(axes.where(axes.all, app("gt", ref("n"), lit(1))), ref("n"))),
    fc.tuple(fc.constantFrom("take", "drop"), tie("l"), COUNTS).map(([op, a, n]): Expr => app(op, a, n)),
    fc.tuple(fc.constantFrom("append", "without"), tie("l"), tie("l")).map(([op, a, b]): Expr => app(op, a, b)),
    fc.tuple(fc.constantFrom("sortBy", "distinct", "flat"), tie("l")).map(([op, a]): Expr => app(op, a)),
    fc.tuple(tie("l"), tie("l")).map(([a, b]): Expr => app("flat", app("group", a, b))),
    fc.tuple(COUNTS, tie("l")).map(([n, a]): Expr => app("fill", n, a)),
    fc.tuple(tie("l"), tie("l")).map(([a, b]): Expr => iterate(2, { a }, { a: app("append", v("a"), b) }, v("a"))),
    fc.tuple(tie("l"), tie("l")).map(([a, b]): Expr => fold(axes.all, { a }, { a: app("drop", app("append", v("a"), b), lit(1)) }, v("a"))),
    fc.tuple(tie("l"), tie("l")).map(([a, b]): Expr => let_({ x: a }, app("append", v("x"), b))),
  ),
})).l;
// The body of a loop over the axis list reads the item, its position or the record at its key.
const ITEMS: fc.Arbitrary<Expr> = fc.constantFrom<Expr>(v("item"), v("i"), ref("n"), app("add", v("item"), v("i")), app("add", v("item"), ref("n")));
const arbValue: fc.Arbitrary<Expr> = fc.oneof(
  arbList,
  fc.tuple(fc.constantFrom("count", "first", "sum", "mean", "min", "max", "values", "keys", "errors"), arbList).map(([op, a]): Expr => app(op, a)),
  fc.tuple(arbList, COUNTS).map(([a, n]): Expr => app("nth", a, n)),
  fc.tuple(arbList, KEYS).map(([a, k]): Expr => app("get", a, k)),
  fc.tuple(arbList, KEYS).map(([a, k]): Expr => app("indexOf", a, k)),
  fc.tuple(arbList).map(([a]): Expr => app("reduce", a, lit("add"))),
  fc.tuple(arbList, COUNTS).map(([a, n]): Expr => app("ifError", app("nth", a, n, lit({ strict: true })), lit(-1))),
  fc.tuple(arbList, KEYS).map(([a, k]): Expr => app("count", each(axes.all, app("get", a, k)))),
  fc.tuple(arbList, arbList).map(([a, b]): Expr => app("add", app("first", a), app("nth", b, lit(9)))),
  fc.tuple(arbList).map(([a]): Expr => app("add", app("first", a), deepExt)),
  fc.tuple(arbList, ITEMS).map(([a, x]): Expr => app("values", named(axes.list(a), x))),
  fc.tuple(arbList, ITEMS).map(([a, x]): Expr => app("first", named(axes.reverse(axes.list(a)), x))),
  fc.tuple(arbList, ITEMS).map(([a, x]): Expr => app("count", named(axes.where(axes.list(a), app("gt", ref("n"), lit(1))), x))),
  fc.tuple(arbList, ITEMS).map(([a, x]): Expr => fold(axes.list(a), { s: lit(0) }, { s: app("add", v("s"), app("ifError", x, lit(0))) }, v("s"), undefined, AS)),
);

function agree(e: Expr, s: Space, k: string, tally: { values: number; fast: number }): void {
  const p = tiered(e, OPTIONS);
  const run = { space: s, origin: k, vars: VARS };
  const expected = fromCore(evaluate(e, { ...OPTIONS, ...run }));
  expect(fromCore(p.run(run))).toStrictEqual(expected);
  expect(fromReference(referenceEvaluate(e, { ...OPTIONS, ...run }))).toStrictEqual(expected);
  tally.values++;
  if (p.tier === 2 && p.stats.fallbacks === 0) tally.fast++;
}

describe("P17 COMPILE.LIST.VALUE: on programs with lists as values, a tiered program gives the result of the interpreter and of the kernel", () => {
  it("P17 COMPILE.LIST.VALUE: each result agrees, also each error value, and tier 2 gives most results", () => {
    const tally = { values: 0, fast: 0 };
    fc.assert(
      fc.property(arbValue, fc.constantFrom(...S.keys), (e, k) => {
        agree(e, S, k, tally);
      }),
      { numRuns: 400 },
    );
    // The generator has error items, holes and keys outside the space. The share of tier 2 is about 0.55, with a low of 0.50 in 12 runs.
    expect(tally.fast / tally.values).toBeGreaterThan(0.4);
  });
});

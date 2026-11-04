import { app, axes, defineDomain, each, evaluate, ext, fn, fold, iterate, lit, let_, ok, call, ref, space, v, vexError, vexList, fail, type Expr, type ExtHandler, type FreeFn, type Space } from "@mark1russell7/vex";
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
};
const hurtItems = lit(VARS.hurt);
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
    fc.constantFrom<Expr>(ns, ts, empty, v("hurt"), v("flat"), v("big"), each(axes.others, ref("n")), each(axes.all, app("nth", ns, ref("n"))), each(axes.where(axes.all, app("gt", ref("n"), lit(1))), ref("n"))),
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
    expect(tally.fast / tally.values).toBeGreaterThan(0.5);
  });
});

/**
 * The check of sizes in the loops of a program (LOOP.SIZE, LOOP.SIZE.OPS). A step that uses the old lists of its loop
 * two times can double them at each step. The check refuses such a step before a run, and it accepts the other steps.
 */
import { describe, expect, it } from "vitest";
import { defineDomain, type AnyDomain, type OpSpec, type ReturnKind, type SizeRule } from "./domain.ts";
import { vexError } from "./errors.ts";
import { compile, evaluate } from "./evaluate.ts";
import { app, axes, call, each, ext, fn, fold, iterate, let_, lit, rec, ref, v, type Expr } from "./ir.ts";
import { ok } from "./result.ts";
import { LIST_OPS, LIST_SIZES, vexList } from "./list.ts";
import { ruleOf, sizeError, type SizeOptions } from "./size.ts";
import { space } from "./space.ts";
import { Pt, PtDomain } from "./test-support.ts";

/** A function of the host with a size rule (LOOP.SIZE.OPS). */
const sized = <F extends (...args: never[]) => unknown>(f: F, size: SizeRule, returns?: ReturnKind): F => Object.assign(f, returns === undefined ? { size } : { size, returns });

/** A value of the domain `Bag`: a domain without a size rule for its op `grow`. */
class Bag {
  constructor(readonly items: readonly unknown[]) {}
  grow(): Bag {
    return new Bag([...this.items, ...this.items]);
  }
}

const BagDomain = defineDomain({
  name: "Bag",
  is: (u: unknown): u is Bag => u instanceof Bag,
  ops: {
    grow: {},
    size: { returns: "number" },
    same: { returns: "domain" },
    pt: { returns: "domain:Pt" },
    num: { returns: "domain:Num" },
    lost: { returns: "domain:Lost" },
    keep: { size: { size: [1] } },
    far: { size: "fixed", returns: "domain:Lost" },
    pair: { size: { size: [1, 1] } },
  },
});

/** A domain of numbers, with a primitive kind. */
const NumDomain = defineDomain({
  name: "Num",
  primitive: "number",
  is: (u: unknown): u is number => typeof u === "number",
  ops: { neg: { fn: (a: number) => -a, returns: "domain" }, twice: { fn: (a: number) => 2 * a } },
});

/** A domain that takes each value, with each method of a value as an op. */
const AnyDomainOf = defineDomain({
  name: "Any",
  is: (u: unknown): u is object => typeof u === "object" && u !== null && !(u instanceof Pt),
  methods: "all",
  ops: {},
});

/** A domain whose test throws. */
const Thrower = defineDomain({
  name: "Thrower",
  is: (u: unknown): u is object => {
    if (u instanceof Bag) throw new Error("no");
    return false;
  },
  ops: {},
});

const FNS = {
  add: sized((a: unknown, b: unknown) => (a as number) + (b as number), "scalar"),
  cat: sized((a: unknown, b: unknown) => `${String(a)}${String(b)}`, { size: [1, "text"] }, "string"),
  glue: sized((a: unknown, b: unknown) => `${String(a)}${String(b)}`, { size: [1, "text"] }),
  both: sized((...xs: readonly unknown[]) => xs, { size: [], rest: 1 }),
  box: sized((a: unknown) => [a], "fixed", "domain"),
  list: sized((a: unknown) => [a], { size: ["many"] }),
  some: sized((a: unknown) => a, { size: ["scaled"] }),
  wild: (a: unknown) => a,
};

const OPTS: SizeOptions = { domains: [PtDomain, BagDomain, NumDomain], fns: FNS };
const check = (e: Expr, opts: SizeOptions = OPTS): string | undefined => sizeError(e, opts);
const refusal = (name: string, what: string, at: string, tag = "fold"): string => `the expression has a node "${tag}" whose step gives the name "${name}" ${what}, at ${at} (LOOP.SIZE)`;
const TWICE = "a value that uses the lists of the loop more than one time in its size";

const NONE = lit(vexList([]));
const one = (x: Expr): Expr => app("fill", lit(1), x);
const step = (init: Expr, next: (x: Expr) => Expr, limit = 12): Expr => iterate(limit, { x: init }, { x: next(v("x")) }, app("count", v("x")));
const folded = (init: Expr, next: (x: Expr) => Expr): Expr => fold(axes.all, { x: init }, { x: next(v("x")) }, v("x"));

const TWELVE = space.array(Array.from({ length: 12 }, (_x, i) => ({ n: i })));

describe("the size check of the loops (LOOP.SIZE)", () => {
  it("LOOP.SIZE: a fold over 12 records whose step appends the list to itself gives 4096 items, so compile refuses it", () => {
    const doubled = fold(axes.all, { xs: one(lit(1)) }, { xs: app("append", v("xs"), v("xs")) }, app("count", v("xs")));
    const reason = refusal("xs", TWICE, 'the op "append"');
    expect(check(doubled)).toBe(reason);
    const r = evaluate(doubled, { space: TWELVE, origin: "0" });
    expect(r.ok ? r.value : { code: r.error.code, message: r.error.message }).toStrictEqual({ code: "#VALUE!", message: reason });
    expect(compile(doubled, {}).run({ space: TWELVE, origin: "0" }).ok).toBe(false);
    // The step with one use of the list and one new item is valid, and its value does not change.
    const grown = fold(axes.all, { xs: one(lit(1)) }, { xs: app("append", v("xs"), one(ref("n"))) }, app("count", v("xs")));
    expect(check(grown)).toBeUndefined();
    expect(evaluate(grown, { space: TWELVE, origin: "0" })).toStrictEqual({ ok: true, value: 13 });
  });

  it("LOOP.SIZE: a list from outside the loop is a constant, so a step can append it at each step", () => {
    const outside = let_({ o: one(lit(2)) }, folded(NONE, (x) => app("append", x, v("o"))));
    expect(check(outside)).toBeUndefined();
    // A free name of the caller does not change in the loop either.
    expect(check(folded(NONE, (x) => app("append", x, v("free"))))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("append", app("append", x, ref("xs")), ext("k", 1))))).toBeUndefined();
  });

  it("LOOP.SIZE: get and first give an item, and an item does not grow, so a step can append an item of its list", () => {
    expect(check(folded(NONE, (x) => app("append", x, one(app("get", x, lit("0"))))))).toBeUndefined();
    // A list that holds the whole list as a new item doubles.
    expect(check(folded(NONE, (x) => app("append", x, one(x))))).toBe(refusal("x", TWICE, 'the op "append"'));
    expect(check(folded(NONE, (x) => app("append", app("take", x, lit(3)), one(lit(1)))))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("append", app("take", x, lit(1)), one(app("first", x)))))).toBeUndefined();
  });

  it("LOOP.SIZE: a use inside a nested loop or inside each counts as many uses", () => {
    const nested = folded(NONE, (x) => iterate(2, { y: x }, { y: app("append", v("y"), x) }, v("y")));
    expect(check(nested)).toBe(refusal("x", TWICE, 'the name "y"'));
    const copies = folded(NONE, (x) => each(axes.list(app("take", x, lit(3))), x));
    expect(check(copies)).toBe(refusal("x", TWICE, 'a node "each"'));
    // The item of each is one use. In the step of an inner fold, the item of an outer list counts as many uses.
    expect(check(folded(NONE, (x) => each(axes.list(x), app("add", v("it"), lit(1)), undefined, ["it"])))).toBeUndefined();
    // A body that reads two measures of the item can hold more than one copy of the item.
    const two = folded(one(one(lit(1))), (x) => each(axes.list(x), app("append", v("it"), one(app("first", v("it")))), undefined, ["it"]));
    expect(check(two)).toBe(refusal("x", TWICE, 'a node "each"'));
    const inner = folded(NONE, (x) => fold(axes.list(x), { s: NONE }, { s: app("append", v("s"), one(v("it"))) }, v("s"), undefined, ["it", "i"]));
    expect(check(inner)).toBe(refusal("x", "a value that uses the lists of the loop more than one time in its largest item", 'the name "s"'));
  });

  it("LOOP.SIZE: a chain of two names that doubles is not valid", () => {
    const chain = iterate(12, { a: NONE, b: NONE }, { a: app("append", v("a"), v("b")), b: v("a") }, v("a"));
    expect(check(chain)).toBe(refusal("a", TWICE, 'the op "append"', "iterate"));
    // A name without a step keeps its value, and a step that passes a value on is valid.
    expect(check(iterate(12, { a: NONE, b: one(lit(1)) }, { a: app("append", v("a"), v("b")) }, v("a")))).toBeUndefined();
    expect(check(iterate(12, { a: NONE, b: NONE }, { a: v("b"), b: v("a") }, v("a")))).toBeUndefined();
  });

  it("LOOP.SIZE: a fixed number of copies grows by a factor, and fill of one copy or of a number is valid", () => {
    expect(check(step(one(lit(1)), (x) => app("fill", lit(2), x)))).toBe(refusal("x", "a size that can grow by a factor at each step", 'the op "fill"', "iterate"));
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), x)))).toBeUndefined();
    expect(check(step(one(lit(1)), (x) => app("fill", lit(0), x)))).toBeUndefined();
    expect(check(step(one(lit(1)), (x) => app("fill", app("count", x), lit(0))))).toBeUndefined();
  });

  it("LOOP.SIZE: a function counts the uses of its parameters at each call", () => {
    const twice = let_({ f: fn(["a"], app("append", v("a"), v("a"))) }, folded(NONE, (x) => call("f", x)));
    expect(check(twice)).toBe(refusal("x", TWICE, 'the function "f"'));
    const once = let_({ f: fn(["a", "b"], app("append", v("a"), v("b"))) }, folded(NONE, (x) => call("f", x, one(lit(1)))));
    expect(check(once)).toBeUndefined();
    // A call with another number of arguments, of a value or of a missing name is an error, and an error has no size.
    expect(check(let_({ f: fn(["a"], v("a")), g: lit(1) }, folded(NONE, (x) => app("append", x, rec({ a: call("f"), b: call("g", x), c: call("h", x), d: v("f") })))))).toBeUndefined();
  });

  it("LOOP.SIZE: text that a step joins to itself doubles, and text with a constant grows by the constant", () => {
    expect(check(step(lit("ab"), (x) => app("cat", x, x)))).toBe(refusal("x", TWICE, 'the op "cat"', "iterate"));
    expect(check(step(lit("ab"), (x) => app("cat", x, lit("c"))))).toBeUndefined();
    // The "text" use of a value that is not surely a text can grow it by a factor.
    expect(check(step(one(lit(1)), (x) => app("glue", lit("a"), x)))).toBe(refusal("x", "a size that can grow by a factor at each step", 'the op "glue"', "iterate"));
    // After the first step, the value of `cat` is a text.
    expect(check(step(one(lit(1)), (x) => app("cat", lit("a"), x)))).toBeUndefined();
    // `join` adds the separator one time for each item.
    expect(check(step(lit(""), (x) => app("join", app("fill", lit(1), x), x)))).toBe(refusal("x", TWICE, 'the op "join"', "iterate"));
    expect(check(step(lit(""), (x) => app("join", app("fill", lit(1), x), lit(","))))).toBeUndefined();
  });

  it("LOOP.SIZE: a record and a list of the loop with numbers in their steps are valid", () => {
    const sums = folded(rec({ a: lit(0), b: lit(true) }), (x) => rec({ a: app("add", x, x), b: app("and", lit(true), lit(false)), c: app("or", lit(true), lit(false)) }));
    expect(check(sums)).toBeUndefined();
    expect(check(fold(axes.all, { s: lit(0), n: lit(null) }, { s: app("add", v("s"), v("s")), n: lit(null) }, v("s")))).toBeUndefined();
    expect(check(step(lit(0), (x) => app("if", app("add", x, x), x, lit(1))))).toBeUndefined();
    expect(check(step(lit(0), (x) => app("ifError", x, lit(1))))).toBeUndefined();
    expect(check(step(lit([1, "a", [true]]), (x) => app("append", x, lit({ k: 1 })), 3))).toBeUndefined();
    expect(check(step(lit(vexList([{ key: "a", result: { ok: true, value: 1 } }, { key: "b", result: { ok: false, error: vexError("empty", "no value") } }])), (x) => app("drop", x, lit(1))))).toBeUndefined();
  });

  it("LOOP.SIZE: an if gives the bound of its branches, so a doubling branch is not valid", () => {
    expect(check(step(NONE, (x) => app("if", lit(true), app("append", x, x), x)))).toBe(refusal("x", TWICE, 'the op "append"', "iterate"));
    expect(check(step(NONE, (x) => app("ifError", app("append", x, x), x)))).toBe(refusal("x", TWICE, 'the op "append"', "iterate"));
    // A missing argument gives an error, so it adds no size.
    expect(check(step(NONE, () => app("if", lit(true))))).toBeUndefined();
    expect(check(step(NONE, (x) => app("ifError", app("append", x, lit(1)))))).toBeUndefined();
    expect(check(each(axes.all, app("ifError")))).toBeUndefined();
  });

  it("LOOP.SIZE: each list op of a step reads the list of the loop by its size rule", () => {
    const valid = (f: (x: Expr) => Expr): void => expect(check(step(one(one(lit(1))), f))).toBeUndefined();
    for (const op of ["count", "sum", "min", "max", "mean", "any", "all", "none", "indexOf"]) valid((x) => app("fill", app(op, x), lit(0)));
    for (const op of ["sortBy", "drop", "without", "distinct"]) valid((x) => app(op, x, lit(1)));
    valid((x) => app("flat", app("fill", lit(1), x)));
    valid((x) => app("values", x));
    valid((x) => app("fill", lit(1), app("nth", x, lit(0))));
    valid((x) => app("fill", lit(1), app("first", x)));
    valid((x) => app("keys", x));
    expect(check(step(one(lit(1)), (x) => app("take", app("append", x, app("keys", x)), lit(1))))).toBe(refusal("x", TWICE, 'the op "append"', "iterate"));
    expect(check(step(one(lit(1)), (x) => app("group", x, lit("k"))))).toBeUndefined();
    expect(check(step(one(lit(1)), (x) => app("errors", x)))).toBe(refusal("x", TWICE, 'the op "errors"', "iterate"));
  });

  it("LOOP.SIZE: reduce folds the list with the size rule of the op that it names", () => {
    expect(check(step(one(lit(new Pt(1, 1))), (x) => app("fill", lit(1), app("reduce", x, lit("add")))))).toBeUndefined();
    expect(check(step(one(lit(new Bag([]))), (x) => app("fill", lit(1), app("reduce", x, lit("pair")))))).toBeUndefined();
    // An argument without a rule has many uses, so each item can add the whole list.
    expect(check(step(one(lit(new Bag([]))), (x) => app("fill", lit(1), app("reduce", x, lit("keep")))))).toBe(refusal("x", TWICE, 'the op "reduce"', "iterate"));
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("size")))))).toBeUndefined();
    const open = refusal("x", TWICE, 'the op "reduce"', "iterate");
    expect(check(step(one(lit(new Bag([]))), (x) => app("fill", lit(1), app("reduce", x, lit("grow")))))).toContain(open);
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, v("name")))))).toContain(open);
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("constructor")))))).toContain(open);
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("twice")))), { domains: [AnyDomainOf, NumDomain] })).toContain(open);
    const reducing: AnyDomain = defineDomain({
      name: "R",
      is: (_u: unknown): _u is object => false,
      ops: { r: { size: "reduce" }, u: { size: { size: [1, 1], union: true, constant: true } }, d: { size: { size: ["many"] } }, o: { size: { size: [[1, "size"], [1, "count"]] } } },
    });
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("r")))), { domains: [reducing] })).toContain(open);
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("u")))), { domains: [reducing] })).toBeUndefined();
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("d")))), { domains: [reducing] })).toContain(open);
    // A term with a measure counts by its use.
    expect(check(step(one(lit(1)), (x) => app("fill", lit(1), app("reduce", x, lit("o")))), { domains: [reducing] })).toBeUndefined();
  });

  it("LOOP.SIZE: a union counts each key one time, and its constant adds", () => {
    const union = defineDomain({ name: "U", is: (u: unknown): u is object => typeof u === "object" && u !== null, ops: { merge: { size: { size: [1, 1], union: true, constant: true } } } });
    expect(check(step(lit({ a: 1 }), (x) => app("merge", x, lit({ b: 2 }))), { domains: [union] })).toBeUndefined();
    expect(check(step(lit({ a: 1 }), (x) => app("merge", x, x)), { domains: [union] })).toBeUndefined();
  });

  it("LOOP.SIZE: an item of a fold over a list is one item, and a key of group is long", () => {
    const items = fold(axes.list(lit([1, 2, 3])), { s: NONE }, { s: app("append", v("s"), one(v("it"))) }, v("s"), undefined, ["it", "i"]);
    expect(check(items)).toBeUndefined();
    const groups = step(one(lit(1)), (x) => app("first", app("group", x, lit("k"))));
    expect(check(groups)).toBeUndefined();
    expect(check(fold(axes.where(axes.reverse(axes.all), lit(true)), { s: NONE }, { s: app("append", v("s"), one(lit(1))) }, v("s")))).toBeUndefined();
  });

  it("LOOP.SIZE: an iteration with until reads the test, and a result reads the last values", () => {
    const until = iterate(12, { x: NONE }, { x: app("append", v("x"), one(lit(1))) }, app("count", v("x")), app("add", app("count", v("x")), lit(1)));
    expect(check(until)).toBeUndefined();
    const after = let_({ y: until }, folded(NONE, (x) => app("append", x, app("fill", v("y"), lit(1)))));
    expect(check(after)).toBeUndefined();
    // A kind that a later step does not know makes each kind, and a function that is not called has no size.
    expect(check(step(one(one(ref("r"))), (x) => app("first", x)))).toBeUndefined();
    expect(check(fn(["a"], app("append", v("a"), v("a"))))).toBeUndefined();
    // A loop with no step keeps the values of init.
    expect(check(fold(axes.all, { x: one(lit(1)) }, {}, v("x")))).toBeUndefined();
  });

  it("LOOP.SIZE: a large program reads each kind at once, and the check still refuses a doubling step", () => {
    const big = rec(Object.fromEntries(Array.from({ length: 60_000 }, (_x, i) => [`f${String(i)}`, lit(i)])));
    expect(check(folded(NONE, (x) => app("append", app("take", x, lit(0)), app("fill", lit(1), big))))).toBeUndefined();
    expect(check(rec({ big, loop: step(NONE, (x) => app("append", x, x)) }))).toBe(refusal("x", TWICE, 'the op "append"', "iterate"));
    expect(check(rec({ big, loop: step(lit(0), (x) => app("if", lit(true), lit(NONE.value), x)) }))).toBeUndefined();
  });
});

describe("the size rule of setNth (LOOP.SIZE.SETNTH)", () => {
  const ITEM = "a value that uses the lists of the loop more than one time in its largest item";
  const set = (x: Expr, value: Expr): Expr => app("setNth", x, lit(0), value);
  const itemOf = (x: Expr, i = 0): Expr => app("nth", x, lit(i));
  // A list of lists: from an empty list, the kinds of the items are not known, so these tests start here.
  const LISTS = lit(vexList([{ key: "0", result: ok(vexList([{ key: "a", result: ok(1) }])) }, { key: "1", result: ok(vexList([{ key: "b", result: ok(2) }])) }]));

  it("LOOP.SIZE.SETNTH: a step takes a value that does not grow, also a value from an old item", () => {
    expect(check(folded(NONE, (x) => set(x, lit(1))))).toBeUndefined();
    expect(check(folded(NONE, (x) => set(x, itemOf(x, 1))))).toBeUndefined();
    expect(check(folded(NONE, (x) => set(x, app("add", itemOf(x), lit(1)))))).toBeUndefined();
    expect(check(folded(NONE, (x) => set(x, app("count", x))))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("setNth", x, app("count", x), ref("n"))))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("setNth", x, lit(0), lit(1), lit({ strict: true }))))).toBeUndefined();
  });

  it("LOOP.SIZE.SETNTH: a step can add to one old item, because the item bound grows by a constant", () => {
    expect(check(folded(NONE, (x) => set(x, app("append", itemOf(x), one(lit(1))))))).toBeUndefined();
    expect(check(folded(NONE, (x) => set(x, rec({ a: itemOf(x), b: ref("n") }))))).toBeUndefined();
  });

  it("LOOP.SIZE.SETNTH: a value that holds the list counts the list two times, so the check refuses it", () => {
    expect(check(folded(NONE, (x) => set(x, x)))).toBe(refusal("x", TWICE, 'the op "setNth"'));
    expect(check(folded(NONE, (x) => set(x, app("take", x, lit(1)))))).toBe(refusal("x", TWICE, 'the op "setNth"'));
    expect(check(folded(NONE, (x) => set(x, app("flat", x))))).toBe(refusal("x", TWICE, 'the op "setNth"'));
    expect(check(folded(NONE, (x) => set(x, app("values", x))))).toBe(refusal("x", TWICE, 'the op "setNth"'));
    // An each with a fixed body has one small item for each item, so the bound stays linear.
    expect(check(folded(NONE, (x) => set(x, each(axes.list(x), lit(1)))))).toBeUndefined();
    expect(check(folded(LISTS, (x) => set(x, each(axes.list(x), itemOf(x)))))).toBeDefined();
  });

  it("LOOP.SIZE.SETNTH: a value that holds two old items doubles the largest item, so the check refuses it", () => {
    expect(check(folded(LISTS, (x) => set(x, app("append", itemOf(x), itemOf(x)))))).toBe(refusal("x", ITEM, 'the op "setNth"'));
    expect(check(folded(LISTS, (x) => set(x, app("append", itemOf(x), itemOf(x, 1)))))).toBe(refusal("x", ITEM, 'the op "setNth"'));
    expect(check(folded(NONE, (x) => set(x, rec({ a: itemOf(x), b: itemOf(x, 1) }))))).toBe(refusal("x", ITEM, 'a node "rec"'));
    expect(check(folded(NONE, (x) => set(x, app("fill", lit(2), itemOf(x)))))).toBe(refusal("x", "a largest item that can grow by a factor at each step", 'the op "setNth"'));
    expect(check(folded(LISTS, (x) => set(x, app("flat", app("fill", ref("n"), itemOf(x))))))).toBeDefined();
  });

  it("LOOP.SIZE.SETNTH: the old list of a second name counts as the list", () => {
    const two = (next: Readonly<Record<string, Expr>>): Expr => fold(axes.all, { x: NONE, y: NONE }, next, v("x"));
    expect(check(two({ y: v("x"), x: set(v("x"), v("y")) }))).toBeDefined();
    const lists = (next: Readonly<Record<string, Expr>>): Expr => fold(axes.all, { x: LISTS, y: NONE }, next, v("x"));
    expect(check(lists({ y: app("append", itemOf(v("x")), itemOf(v("x"))), x: set(v("x"), v("y")) }))).toBeDefined();
    expect(check(two({ y: itemOf(v("x")), x: set(v("x"), lit(1)) }))).toBeUndefined();
  });

  it("LOOP.SIZE.SETNTH: a value of another kind is valid", () => {
    // The items of the list are numbers, and the value is a text. The result kind joins the two kinds.
    const numbers = each(axes.all, ref("n"));
    expect(check(step(numbers, (x) => set(x, lit(1))))).toBeUndefined();
    expect(check(iterate(3, { x: numbers }, { x: set(v("x"), lit("a")) }, app("sum", v("x"))))).toBeUndefined();
    expect(check(step(numbers, (x) => app("append", set(x, lit(1)), lit(vexList([])))))).toBeUndefined();
  });
});

describe("the size rules of the ops (LOOP.SIZE.OPS)", () => {
  it("LOOP.SIZE.OPS: each list op and fill has a size rule", () => {
    expect([...LIST_OPS, "fill"].filter((op) => !Object.hasOwn(LIST_SIZES, op))).toStrictEqual([]);
  });

  it("LOOP.SIZE.OPS: a function of the host without a size rule gets no bound (fail closed)", () => {
    expect(check(folded(NONE, (x) => app("wild", x)))).toBe(`${refusal("x", TWICE, 'the op "wild"')}. The op "wild" has no size rule (LOOP.SIZE.OPS)`);
    // Outside a loop, and with values that do not come from the loop, an op without a rule is valid.
    expect(check(app("wild", lit(1)))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("append", x, app("wild", lit(1)))))).toBeUndefined();
    expect(check(folded(NONE, (x) => app("append", x, app("wild"))))).toBeUndefined();
  });

  it("LOOP.SIZE.OPS: an op of a domain without a size rule gets no bound (fail closed)", () => {
    const reason = check(step(lit(new Bag([1])), (x) => app("grow", x)));
    expect(reason).toBe(`${refusal("x", TWICE, 'the op "grow"', "iterate")}. The op "grow" has no size rule (LOOP.SIZE.OPS)`);
    // An op whose result is a number, or a value of a fixed domain, has a rule from its kind.
    for (const op of ["size", "pt", "num"]) expect(check(step(lit(new Bag([1])), (x) => app("keep", x, app(op, x))))).toBeUndefined();
    expect(check(step(lit(new Bag([1])), (x) => app("keep", app("far", x))))).toBeUndefined();
    for (const op of ["same", "lost"]) expect(check(step(lit(new Bag([1])), (x) => app(op, x)))).toContain("(LOOP.SIZE.OPS)");
    // The ops of a domain of numbers take only numbers, and a domain with each method takes each other value.
    expect(check(step(lit(1), (x) => app("neg", x)))).toBeUndefined();
    expect(check(step(lit(1), (x) => app("twice", x)))).toContain('The op "twice" has no size rule');
    expect(check(step(lit({ a: 1 }), (x) => app("keys", x)), { domains: [NumDomain, AnyDomainOf] })).toContain('The op "keys" has no size rule');
    expect(check(step(lit("a"), (x) => app("neg", x)))).toBeUndefined();
  });

  it("LOOP.SIZE.OPS: the rules of the functions of the host: scalar, fixed, rest, many and scaled", () => {
    expect(check(step(NONE, (x) => app("append", x, app("box", x))))).toBeUndefined();
    expect(check(step(NONE, (x) => app("both", x)))).toBeUndefined();
    expect(check(step(NONE, (x) => app("both", x, x)))).toBe(refusal("x", TWICE, 'the op "both"', "iterate"));
    expect(check(step(NONE, (x) => app("list", x)))).toBe(refusal("x", TWICE, 'the op "list"', "iterate"));
    expect(check(step(NONE, (x) => app("some", x)))).toBe(refusal("x", "a size that can grow by a factor at each step", 'the op "some"', "iterate"));
    expect(check(step(lit(0), (x) => app("add", x, x)), { fns: { add: FNS.add } })).toBeUndefined();
  });

  it("LOOP.SIZE.OPS: ruleOf gives the rule of an op from its own rule, its result kind and its domain", () => {
    const domains: readonly AnyDomain[] = [PtDomain, BagDomain, NumDomain];
    const rule = (d: AnyDomain, op: string): SizeRule | undefined => ruleOf(d, d.ops[op] as OpSpec<unknown>, domains);
    expect(rule(BagDomain, "keep")).toStrictEqual({ size: [1] });
    expect(rule(BagDomain, "size")).toBe("scalar");
    expect(rule(NumDomain, "neg")).toBe("scalar");
    expect(rule(PtDomain, "pick")).toBe("fixed");
    expect(rule(BagDomain, "num")).toBe("scalar");
    expect(rule(BagDomain, "pt")).toBe("fixed");
    expect(rule(BagDomain, "lost")).toBeUndefined();
    expect(rule(BagDomain, "same")).toBeUndefined();
    expect(rule(BagDomain, "grow")).toBeUndefined();
  });

  it("LOOP.SIZE.OPS: a domain whose test throws does not take the value, and an error of the host goes out of the check", () => {
    expect(check(step(lit(new Bag([1])), (x) => app("keep", x)), { domains: [Thrower, BagDomain] })).toBeUndefined();
    const fns = Object.defineProperty({}, "bad", {
      enumerable: true,
      get: () => {
        throw new Error("a getter of the host");
      },
    });
    expect(() => sizeError(app("bad", lit(1)), { fns })).toThrow("a getter of the host");
    expect(sizeError(app("count", lit(1)))).toBeUndefined();
  });
});

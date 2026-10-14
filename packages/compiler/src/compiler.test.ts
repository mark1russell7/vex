import {
  app,
  axes,
  defineDomain,
  each,
  evaluate,
  explain,
  ext,
  fail,
  key,
  let_,
  lit,
  ok,
  rec,
  ref,
  space,
  v,
  vexError,
  type CompileOptions,
  type Expr,
  type RunOptions,
  type Space,
} from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoNodes } from "./memo.ts";
import { generate, tiered } from "./tiers.ts";

/** A value of the test domain. Its methods have each number of arguments, and some of them fail. */
class Box {
  readonly v: number;
  constructor(value: number) {
    this.v = value;
  }
  get0(): number {
    return this.v;
  }
  plus(o: Box): Box {
    return new Box(this.v + o.v);
  }
  mix(o: Box, k: number): Box {
    return new Box(this.v + o.v * k);
  }
  sum3(a: number, b: number, c: number): number {
    return this.v + a + b + c;
  }
  max(o: Box): Box {
    return this.v >= o.v ? this : o;
  }
  span(a: Box, b: Box): number {
    return this.v + b.v - a.v;
  }
  boom1(): never {
    throw new Error("boom");
  }
  boom2(): never {
    throw new Error("boom");
  }
  bad(): number {
    return Number.NaN;
  }
  boom(): never {
    throw new Error("boom");
  }
  deep(): never {
    throw new RangeError("Maximum call stack size exceeded");
  }
  nothing(): undefined {
    return undefined;
  }
  /** A method with optional arguments, for a site with fewer arguments than parameters. */
  opt(o?: Box, k?: number): number {
    return this.v + (o?.v ?? 0) * (k ?? 1);
  }
  /** A method with one declared parameter and a second argument of any kind. */
  pair(o: Box, x: unknown): string {
    return `${this.v + o.v}:${typeof x}`;
  }
  /** A method with a boolean and a text. */
  flag(b: boolean, s: string): string {
    return `${this.v}:${String(b)}:${s}`;
  }
  /** A method that is not an op of the domain. */
  hidden(): number {
    return 1;
  }
  nil(): null {
    return null;
  }
}

const BoxDomain = defineDomain({
  name: "Box",
  is: (u: unknown): u is Box => u instanceof Box,
  fromScalar: (n: number) => new Box(n),
  // The value 13 is not valid, so an op that gives it gives #NUM!.
  valid: (b: Box) => b.v !== 13,
  ops: {
    get0: {},
    plus: { liftScalar: true, params: ["domain"] },
    mix: { liftScalar: [true, false], params: ["domain", "number"] },
    sum3: {},
    max: { params: ["domain"] },
    span: { liftScalar: true, params: ["domain", "domain"] },
    boom1: {},
    boom2: {},
    bad: {},
    boom: {},
    deep: {},
    nothing: {},
    nil: {},
    opt: { params: ["domain", "number"] },
    pair: { params: ["domain"] },
    flag: { params: ["boolean", "string"] },
    // A declared op that the values do not have as a method. The free function of the same name gives the value.
    ghost: {},
    twice: { fn: (b: Box) => new Box(b.v * 2) },
    // A name that cannot be an op, also with a function.
    constructor: { fn: () => 1 },
  },
});

/** A domain whose methods are all ops. */
class Tag {
  constructor(readonly name: string) {}
  upper(): string {
    return this.name.toUpperCase();
  }
  /** A method with the name of an op of Box, which is the first domain. */
  get0(): number {
    return this.name.length;
  }
}
const TagDomain = defineDomain({ name: "Tag", is: (u: unknown): u is Tag => u instanceof Tag, methods: "all", ops: {} });

/** A domain whose op lifts numbers, without `fromScalar`. Thus it lifts no number. */
class Plain {
  constructor(readonly value: number) {}
  add1(x: unknown): unknown {
    return typeof x === "number" ? this.value + x : "no";
  }
}
const PlainDomain = defineDomain({ name: "Plain", is: (u: unknown): u is Plain => u instanceof Plain, ops: { add1: { liftScalar: true } } });

/** A domain of texts with a declared method op. A text is not an object, so it has no methods. */
const TextDomain = defineDomain({ name: "Text", is: (u: unknown): u is string => typeof u === "string", ops: { toUpperCase: {} } });

/** The paths of the extension "log", in the order of the evaluation. */
let log: string[] = [];

const OPTIONS: CompileOptions = {
  domains: [BoxDomain, TagDomain, NumDomain, TextDomain],
  fns: {
    double: (x: unknown) => (typeof x === "number" ? x * 2 : x),
    zero: () => 0,
    ghost: () => 7,
    // The method "nothing" of Box gives no value. That is an error of the op, so this function does not apply.
    nothing: () => 5,
    throws: () => {
      throw new Error("fn");
    },
  },
  extensions: {
    echo: (data) => ok(data),
    no: () => fail(vexError("missing-field", "no value")),
    throws: () => {
      throw new Error("ext");
    },
    // The path and the position of the node, and the keys of its space.
    log: (_data, ctx) => {
      log.push(`${ctx.path.join(".")} @${ctx.position.origin}/${ctx.position.focus} in ${ctx.space.keys.join("")}`);
      return ok(true);
    },
    // The field "recv" of the record at the focus, also null or undefined.
    recv: (_data, ctx) => ok((ctx.space.get(ctx.position.focus) as { readonly recv?: unknown } | undefined)?.recv),
  },
};

const S = space.record({
  A: { n: 1, b: true, box: new Box(1), tag: new Tag("a"), s: "x" },
  B: { n: 2, b: false, box: new Box(2), tag: new Tag("b") },
  C: { n: 3, b: true, box: new Box(6), tag: new Tag("c"), big: 1e308 },
});
const T = space.record({ X: { n: 10 }, Y: { n: 20 } });
const GRID = space.grid([
  [{ n: 1 }, { n: 2 }],
  [{ n: 3 }, { n: 4 }],
]);
const RUN: RunOptions = { space: S, origin: "A", tables: { T }, vars: { c: 5 } };

/**
 * A space for the sites of ops. Each op evaluates once at each key, in key order: the first value fills the cache of
 * the method, and each later value tests one branch of the fast path.
 */
const own = Object.assign(new Box(4), { get0: () => 99 });
const methodOf = (name: string): unknown => Reflect.get(Box.prototype, name);
const SITES = space.record({
  A: { box: new Box(1), arg: new Box(1), k: 3, recv: new Box(1), on: true, word: "a" },
  B: { box: new Box(2), arg: new Box(5), k: 3, recv: new Box(2), on: false, word: "b" },
  C: { box: new Box(3), arg: 2, k: 1, recv: null, on: "x", word: "c" },
  L: { box: new Box(6), arg: new Box(1), k: 1, on: true, word: 7 },
  D: { box: new Box(4), arg: new Tag("d"), k: "x" },
  E: { box: own, arg: new Box(1), k: 3, recv: 7 },
  F: { box: { get0: methodOf("get0"), plus: methodOf("plus") }, arg: new Box(1), k: 3, recv: new Box(3) },
  G: { box: Object.assign(new Box(1), { kind: "vex.list", items: [] }), arg: new Box(1), k: 3 },
  H: { box: 7, arg: new Box(1), k: 3 },
  K: { box: new Box(5), arg: new Box(2), k: "x" },
});

/**
 * This function checks that the tiered program gives the result of the interpreter. `fast` tells if tier 2 gave the
 * result, with no fallback.
 */
function expectSame(e: Expr, fast: boolean, run: RunOptions = RUN, options: CompileOptions = OPTIONS): void {
  const p = tiered(e, options);
  expect(fromCore(p.run(run))).toStrictEqual(fromCore(evaluate(e, { ...options, ...run })));
  // Each program of these tests has generated code. Without a value from it, the one run has one fallback.
  expect(p.tier).toBe(2);
  expect(p).not.toHaveProperty("reason");
  expect(p.stats).toEqual({ runs: 1, fallbacks: fast ? 0 : 1 });
}

/** This function gives an expression with `levels` levels. */
const deep = (levels: number): Expr => {
  let e: Expr = lit(1);
  for (let i = 1; i < levels; i++) e = app("double", e);
  return e;
};

const n = ref("n");
const box = ref("box");
const all = (body: Expr): Expr => each(axes.all, body);
const where = (test: Expr, body: Expr): Expr => each(axes.where(axes.all, test), body);

describe("COMPILE.TIERED: the result of each kind of node is the result of the interpreter", () => {
  const cases: readonly (readonly [string, Expr, boolean])[] = [
    ["a literal", lit(4), true],
    ["a field", n, true],
    ["a path", ref("box.v"), true],
    ["the record", ref([]), true],
    ["a field at an address", ref("n", [key("B")]), true],
    ["a missing field", ref("s", [key("B")]), false],
    ["an address that does not exist", ref("n", [key("Z")]), false],
    ["a path through a number", ref("n.x"), false],
    ["a name that is not a field", ref("__proto__"), false],
    ["a variable of the run", v("c"), true],
    ["a name without a binding", v("nope"), false],
    ["a binding", let_({ a: n }, app("double", v("a"))), true],
    ["a binding of a literal", let_({ a: lit(2) }, v("a")), true],
    ["a binding with an error that the body does not read", let_({ a: ref("missing") }, n), true],
    ["a binding with an error that the body reads", let_({ a: ref("missing") }, v("a")), false],
    ["a record", rec({ a: n, b: lit("x") }), true],
    ["0 and -0", rec({ a: lit(0), b: lit(-0) }), true],
    ["a method without arguments", app("get0", box), true],
    ["a method with one argument", app("plus", box, box), true],
    ["a number that the op lifts", app("plus", box, lit(2)), true],
    ["a method with two arguments", app("mix", box, box, lit(3)), true],
    ["an argument of the wrong kind", app("mix", box, box, lit("3")), false],
    ["an argument that is not of the domain", app("plus", box, lit("x")), false],
    ["a method with three arguments", app("sum3", box, lit(1), lit(2), lit(3)), true],
    ["a function of the spec", app("twice", box), true],
    ["a method of a domain with methods all", app("upper", ref("tag")), true],
    ["an op that is also a list op", app("max", box, ref("box", [key("C")])), true],
    ["a result that is not finite", app("bad", box), false],
    ["a result that is not valid", app("plus", ref("box", [key("C")]), lit(7)), false],
    ["a method that throws", app("boom", box), false],
    ["a method that fills the call stack", app("deep", box), false],
    ["a method without a value", app("nothing", box), false],
    ["an op that the domain does not have", app("nope", box), false],
    ["a free function", app("double", n), true],
    ["a free function without arguments", app("zero"), true],
    ["a free function that throws", app("throws", n), false],
    ["an unknown function without arguments", app("nope"), false],
    ["an op of numbers", app("add", n, lit(2)), true],
    ["if", app("if", ref("b"), lit(1), lit(2)), true],
    ["if with false", app("if", app("not", ref("b")), lit(1), lit(2)), false],
    ["if with a condition that is not a boolean", app("if", n, lit(1), lit(2)), false],
    ["if without arguments", app("if"), false],
    ["if without the branch that it selects", app("if", ref("b", [key("B")]), lit(1)), false],
    ["and", app("and", ref("b"), ref("b", [key("B")])), true],
    ["or", app("or", ref("b", [key("B")]), ref("b")), true],
    ["or that stops", app("or", ref("b"), n), true],
    ["and with an argument that is not a boolean", app("and", ref("b"), n), false],
    ["and without arguments", app("and"), false],
    ["ifError with a value", app("ifError", n, lit(0)), true],
    ["ifError with an error", app("ifError", ref("missing"), lit(0)), true],
    ["ifError with an error and no second argument", app("ifError", ref("missing")), false],
    ["ifError without arguments", app("ifError"), false],
    ["ifError does not hide #DEPTH!", app("ifError", app("deep", box), lit(0)), false],
    ["a list", all(n), true],
    ["a list with an error item", all(ref("s")), false],
    ["an extension", ext("echo", { a: 1 }), true],
    ["an extension with an error", ext("no", null), false],
    ["an extension that throws", ext("throws", null), false],
    ["an unknown extension", ext("nope", null), false],
  ];
  it.each(cases)("%s", (_title, e, fast) => expectSame(e, fast));

  it("a method op on a text, which has no methods", () => expectSame(app("toUpperCase", ref("s")), false));
  it("a list op without arguments", () => expectSame(app("count"), false));
  it("ifError and then a list op", () => expectSame(rec({ a: app("ifError", ref("missing"), lit(0)), b: app("count", all(n)) }), true));
  it("a result that is not finite, without a domain of numbers", () => expectSame(app("values", all(app("bad", box))), true, RUN, { domains: [BoxDomain] }));
  it("the check of the result stops at the first domain that accepts it, also without valid", () => {
    const Loose = defineDomain({ name: "Loose", is: (u: unknown): u is number => typeof u === "number" && u > 2, ops: {} });
    const Even = defineDomain({ name: "Even", is: (u: unknown): u is number => typeof u === "number", valid: (x: number) => x % 2 === 0, ops: {} });
    // 3 is odd, but Loose takes it first, and Loose has no check. 4 is even. The fast path of the site gets 3.
    const s1 = space.record({ A: { box: new Box(4) }, B: { box: new Box(3) } });
    expectSame(app("values", all(app("get0", box))), true, { space: s1, origin: "A" }, { domains: [BoxDomain, Loose, Even] });
  });
  it("a function of a later domain, without an op in the first domain", () => expectSame(app("values", all(app("pow", n, lit(2)))), true, RUN, { domains: [BoxDomain, NumDomain] }));
  it("a free function with two arguments", () => expectSame(app("values", all(app("pick", n, lit(4)))), true, RUN, { fns: { pick: (a: unknown, b: unknown) => (a === 1 ? b : a) } }));
  it("the check of the first domain that accepts the result", () => {
    const Even = defineDomain({ name: "Even", is: (u: unknown): u is number => typeof u === "number", valid: (x: number) => x % 2 === 0, ops: {} });
    expectSame(app("values", all(app("get0", box))), true, RUN, { domains: [BoxDomain, Even] });
  });
  it("a table inside an item, without the tables of the run", () => expectSame(app("count", all(app("count", each(axes.table("T"), n)))), true, { space: S, origin: "A" }));
  it("an op name without arguments, with a domain that has the op", () =>
    expectSame(app("get0"), true, RUN, { domains: [BoxDomain], fns: { get0: (...xs: readonly unknown[]) => xs.length } }));
  it("an op without a value, in each item", () => expectSame(app("values", all(app("and"))), true));
  it("a free function of a list", () => expectSame(app("double", all(n)), true));
  it("AXIS.TABLE: the origin of an axis that is not a table stays the origin", () => expectSame(app("sum", all(ref("n", [{ t: "origin" }]))), true));
  it("an inherited method is not a method", () => expectSame(app("toString", ref("tag")), false));
  it("an inherited function is not a free function", () => expectSame(app("toString"), false));
  it("the options null of a list op", () => expectSame(app("sum", all(n), lit(null)), true));
  it("an inherited name is not a table", () => expectSame(app("count", all(app("count", each(axes.table("toString"), n)))), true));
  it("a name without a binding, in each item, without the variables of the run", () => expectSame(app("count", all(v("zz"))), true, { space: S, origin: "A" }));
  it("a free function without domains", () => expectSame(app("double", n), true, RUN, { fns: { double: (x: unknown) => x } }));
  it("an op that lifts numbers, of a domain without fromScalar", () => {
    const s1 = space.record({ A: { p: new Plain(1) }, B: { p: new Plain(2) } });
    expectSame(app("values", all(app("add1", ref("p"), lit(2)))), true, { space: s1, origin: "A" }, { domains: [PlainDomain] });
  });
  it("a method of a function, and a method of Function.prototype", () => {
    const FnsDomain = defineDomain({ name: "Fns", is: (u: unknown): u is () => number => typeof u === "function", methods: "all", ops: {} });
    const s1 = space.record({ A: { f: Object.assign(() => 1, { twice: () => 2 }) } });
    expectSame(app("twice", ref("f")), true, { space: s1, origin: "A" }, { domains: [FnsDomain] });
    expectSame(app("bind", ref("f")), false, { space: s1, origin: "A" }, { domains: [FnsDomain] });
  });
  it("a domain that accepts each value does not take an op without arguments", () => {
    const Everything = defineDomain({ name: "Everything", is: (u: unknown): u is unknown => u === u, ops: { zero: { fn: () => 1 } } });
    expectSame(app("zero"), true, RUN, { domains: [Everything], fns: { zero: () => 0 } });
  });
  it("an own property that is not a function is not a method", () => expectSame(app("get0", box), false, { space: space.record({ A: { box: Object.assign(new Box(1), { get0: 5 }) } }), origin: "A" }));
  it("a name that cannot be an op", () => expectSame(app("constructor", box), false));
  it("an argument after the declared parameters has any kind", () => expectSame(app("max", box, box, lit(1)), true));
  it("a method of a later domain", () => expectSame(app("get0", ref("tag")), true));
  it("a program without options", () => expectSame(app("sum", all(n)), true, RUN, {}));
  it("a check of a sum that throws", () => {
    const Throws = defineDomain({ name: "Throws", is: (u: unknown): u is number => typeof u === "number", valid: (): boolean => {
      throw new Error("valid");
    }, ops: {} });
    expectSame(app("sum", all(n)), false, RUN, { domains: [Throws] });
  });
  it("an origin that is not a key gives #REF!", () => expectSame(n, false, { ...RUN, origin: "Z" }));
  it("a variable without the variables of the run", () => expectSame(v("c"), false, { space: S, origin: "A" }));
  it("a variable that is not enumerable has no binding, as in the interpreter", () => {
    expectSame(v("c"), false, { ...RUN, vars: Object.defineProperty({}, "c", { value: 1, enumerable: false }) });
    expectSame(v("c"), false, { ...RUN, vars: Object.create({ c: 1 }) as Record<string, unknown> });
  });
  it("0 and -0 stay different constants", () => {
    const r = tiered(rec({ a: lit(0), b: lit(-0) }), OPTIONS).run(RUN);
    expect(r.ok && Object.is((r.value as { b: number }).b, -0)).toBe(true);
  });
  it("an own method of a value is its method, after a value with the method of its class", () => {
    const shadow = Object.assign(new Box(4), { get0: () => 99 });
    const p = tiered(app("get0", box), OPTIONS);
    const spaceOf = (b: Box): Space => space.record({ A: { box: b } });
    expect(p.run({ space: spaceOf(new Box(1)), origin: "A" })).toEqual(ok(1));
    expect(p.run({ space: spaceOf(shadow), origin: "A" })).toEqual(ok(99));
    expect(p.stats.fallbacks).toBe(0);
  });
});

describe("COMPILE.TIERED: the site of an op gives the result of the interpreter for each receiver", () => {
  const at = { space: SITES, origin: "A" };
  // The value at G has the form of a list, so the list op "max" applies to it in the interpreter, and tier 1 gives it.
  const cases: readonly (readonly [string, Expr, boolean])[] = [
    ["a method without arguments", app("get0", box), true],
    ["a method with one argument", app("plus", box, ref("arg")), true],
    ["a method with two arguments", app("span", box, ref("arg"), ref("k")), true],
    ["a method with two arguments, the second of a kind", app("mix", box, ref("arg"), ref("k")), true],
    ["a method that throws, without arguments", app("boom", box), true],
    ["a method that throws, with one argument", app("boom1", box, ref("arg")), true],
    ["a method that throws, with two arguments", app("boom2", box, ref("arg"), ref("k")), true],
    ["a method without a value", app("nothing", box), true],
    ["a method that gives null", app("nil", box), true],
    ["a result that is not finite", app("bad", box), true],
    ["fewer arguments than parameters, one", app("opt", box), true],
    ["fewer arguments than parameters, two", app("opt", box, ref("arg")), true],
    ["a second argument of any kind", app("pair", box, ref("arg"), ref("k")), true],
    ["a boolean and a text", app("flag", box, ref("on"), ref("word")), true],
    ["a receiver of each kind", app("get0", ext("recv", null)), true],
    ["a method that is not an op", app("hidden", box), true],
    ["a declared op without a method, and a free function", app("ghost", box), true],
    ["a name that cannot be an op", app("constructor", box), true],
    ["a list op name", app("max", box, ref("arg")), false],
  ];
  it.each(cases)("%s", (_title, op, fast) => expectSame(app("values", all(op)), fast, at));

  it("a site keeps the method of its last receiver, so it reads no descriptor for the next receivers", () => {
    let reads = 0;
    const counted = <T extends object>(x: T): T =>
      new Proxy(x, {
        getOwnPropertyDescriptor(target, name) {
          reads++;
          return Reflect.getOwnPropertyDescriptor(target, name);
        },
      });
    const records = Object.fromEntries(
      [1, 2, 3, 4].map((i) => [`K${i}`, { box: counted(new Box(i)), arg: counted(new Box(i)), k: 2, tag: counted(new Tag(`t${i}`)), p: counted(new Plain(i)) }]),
    );
    const s4 = space.record(records);
    const options = { ...OPTIONS, domains: [BoxDomain, PlainDomain, TagDomain, NumDomain] };
    // Each op has arguments that the fast path takes: an argument that is not a number, or a number at a parameter
    // that does not lift. A number at the parameter of a domain fails in the fast path too.
    const ops = [
      app("get0", box),
      app("plus", box, ref("arg")),
      app("pair", box, ref("arg"), ref("k")),
      app("pair", box, lit(2), ref("k")),
      app("opt", box, lit(2)),
      app("mix", box, ref("arg"), ref("k")),
      app("span", box, ref("arg"), ref("arg")),
      app("upper", ref("tag")),
      app("add1", ref("p"), lit(2)),
      app("add1", ref("p"), lit(2), lit(3)),
    ];
    for (const op of ops) {
      const e = app("values", all(op));
      const expected = evaluate(e, { ...options, space: s4, origin: "K1" });
      reads = 0;
      expect(tiered(e, options).run({ space: s4, origin: "K1" })).toEqual(expected);
      // The first receiver has a descriptor read for its own properties. The next three use the method of the site.
      expect(reads).toBe(1);
    }
  });
});

describe("COMPILE.TIERED: a list op over an axis is one loop with the result of the interpreter", () => {
  const ops = ["count", "sum", "mean", "min", "max", "first", "values", "keys", "errors"] as const;
  it.each(ops)("%s over all", (op) => expectSame(app(op, all(n)), true));
  it.each(["any", "all", "none"] as const)("%s over all", (op) => expectSame(app(op, all(ref("b"))), true));
  it.each(["any", "all", "none"] as const)("%s with an item that is not a boolean", (op) => expectSame(app(op, all(n)), false));
  it.each(["sum", "mean", "min", "max"] as const)("%s with an item that is not a number", (op) => expectSame(app(op, all(ref("tag"))), false));
  it.each(["mean", "min", "max", "first", "reduce"] as const)("%s of no items", (op) =>
    expectSame(app(op, where(lit(false), n), lit("add")), false),
  );

  const cases: readonly (readonly [string, Expr, boolean])[] = [
    ["others", app("sum", each(axes.others, n)), true],
    ["where", app("sum", where(ref("b"), n)), true],
    ["where with a test that is not a boolean", app("sum", where(n, n)), true],
    ["where in where", app("count", each(axes.where(axes.where(axes.all, ref("b")), app("gt", n, lit(1))), n)), true],
    ["an axis from an address", app("count", each(axes.others, n, [key("B")])), true],
    ["an axis from an address that does not exist", app("count", each(axes.others, n, [key("Z")])), false],
    ["the axis table, where the origin is the target", app("sum", each(axes.table("T"), ref("n", [{ t: "origin" }]))), true],
    ["a table that does not exist", app("count", each(axes.table("nope"), n)), false],
    ["an axis that the space does not have", app("count", each(axes.neighbors(8), n)), false],
    ["a binding over the axis", app("sum", let_({ a: lit(1) }, all(app("add", n, v("a"))))), true],
    ["the items with an error are skipped", app("sum", all(ref("big"))), true],
    ["strict, with no error item", app("sum", all(n), lit({ strict: true })), true],
    ["strict, with an error item", app("sum", all(ref("s")), lit({ strict: true })), false],
    ["errors with an error item", app("errors", all(ref("s"))), false],
    ["a sum that is not finite", app("sum", all(ref("big", [key("C")]))), false],
    ["reduce", app("reduce", all(box), lit("plus")), true],
    ["reduce with options", app("reduce", all(n), lit("add"), lit({ strict: true })), true],
    ["reduce with a name that is not a text", app("reduce", all(n), lit(1)), false],
    ["reduce without a name", app("reduce", all(n)), false],
    ["reduce with an op that no domain has", app("reduce", all(n), lit("nope")), false],
    ["reduce with a step that fails", app("reduce", all(box), lit("bad")), false],
    ["a list op inside an item", app("sum", all(app("count", each(axes.others, n)))), true],
    ["a list op inside an item fails, so the item is skipped", app("count", all(app("min", each(axes.where(axes.others, lit(false)), n)))), true],
    ["a step inside an item fails, so the item is skipped", app("count", all(app("reduce", all(ref("tag")), lit("nope")))), true],
    ["strict inside an item, with an error item", app("count", all(app("sum", all(ref("s")), lit({ strict: true })))), true],
    ["ifError inside an item", app("sum", all(app("ifError", ref("big"), lit(0)))), true],
    ["an extension error inside an item", app("count", all(ext("no", null))), false],
    ["a list op over a list value", let_({ xs: all(n) }, app("count", v("xs"))), false],
  ];
  it.each(cases)("%s", (_title, e, fast) => expectSame(e, fast));

  it("the targets of a costly axis come from a cache, for each space", () => {
    const p = tiered(app("sum", each(axes.neighbors(8), n)), OPTIONS);
    const other = space.grid([[{ n: 5 }, { n: 6 }]]);
    for (const [s, k] of [[GRID, "0,0"], [GRID, "0,0"], [GRID, "1,1"], [other, "0,1"]] as const) {
      expect(p.run({ space: s, origin: k })).toEqual(evaluate(p.expr, { ...OPTIONS, space: s, origin: k }));
    }
    expect(p.stats.fallbacks).toBe(0);
  });

  it("the targets of an axis without a cache", () => {
    const tree = space.tree({ R: { n: 1 }, X: { n: 2 }, Y: { n: 3 } }, { X: "R", Y: "R" });
    expectSame(app("sum", each(axes.children, n)), true, { space: tree, origin: "R" });
  });

  it("a binding with a list op, strict, and ifError", () => {
    expectSame(let_({ a: app("sum", all(n), lit({ strict: true })), b: app("ifError", ref("missing"), lit(0)) }, app("add", v("a"), v("b"))), true);
    expectSame(let_({ a: app("sum", all(ref("s")), lit({ strict: true })) }, v("a")), false);
  });

  it("the targets of an axis come from a cache for each space and focus", () => {
    let calls = 0;
    const counted = (s1: Space): Space => ({
      kind: s1.kind,
      keys: s1.keys,
      has: (k: string): k is string => s1.has(k),
      get: (k) => s1.get(k),
      coords: (k) => s1.coords(k),
      keyAt: (c) => s1.keyAt(c),
      parentOf: (k) => s1.parentOf?.(k),
      childrenOf: (k) => {
        calls++;
        return s1.childrenOf?.(k) ?? [];
      },
    });
    const tree = space.tree({ R: { n: 1 }, X: { n: 2 }, Y: { n: 3 } }, { X: "R", Y: "R" });
    const [one, two] = [counted(tree), counted(tree)];
    const p = tiered(app("sum", each(axes.children, n)), OPTIONS);
    const runs = [[one, "R", 1], [one, "R", 1], [one, "X", 2], [two, "R", 3]] as const;
    for (const [s1, origin, after] of runs) {
      expect(p.run({ space: s1, origin })).toEqual(evaluate(p.expr, { ...OPTIONS, space: tree, origin }));
      expect(calls).toBe(after);
    }
  });

  it("an extension gets the path, the position and the space of its node", () => {
    const E = ext("log", null);
    const e = rec({
      root: E,
      and: app("and", E, E),
      if: app("if", E, E, lit(false)),
      else: app("if", lit(false), lit(1), E),
      let: let_({ x: E }, app("and", v("x"), E)),
      ifError: app("ifError", E, lit(false)),
      fallback: app("ifError", ref("missing"), E),
      fused: app("count", let_({ y: E }, each(axes.where(axes.where(axes.all, E), E), app("and", v("y"), E))), E),
      table: app("count", each(axes.where(axes.table("T"), E), E)),
      list: each(axes.where(axes.others, E), E),
      reduce: app("reduce", all(n), lit("add"), E),
      args: app("double", E, E),
    });
    log = [];
    const expected = evaluate(e, { ...OPTIONS, ...RUN });
    const paths = log.toSorted();
    log = [];
    const p = tiered(e, OPTIONS);
    expect(p.run(RUN)).toEqual(expected);
    expect(p.stats.fallbacks).toBe(0);
    expect(log.toSorted()).toEqual(paths);
    log = [];
    expect(tiered(E, OPTIONS).run(RUN)).toEqual(ok(true));
    expect(log).toEqual([" @A/A in ABC"]);
  });

  it("reduce keeps the dispatch of a name for the next run", () => {
    const p = tiered(app("reduce", all(n), v("op")), OPTIONS);
    for (const op of ["add", "add", "max"]) expect(p.run({ ...RUN, vars: { op } })).toEqual(evaluate(p.expr, { ...OPTIONS, ...RUN, vars: { op } }));
    expect(p.stats.fallbacks).toBe(0);
  });
});

describe("COMPILE.FALLBACK: a program that tier 2 cannot give operates in tier 1", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an expression nested deeper than the limit", () => {
    const p = tiered(deep(501), OPTIONS);
    expect(p.tier).toBe(1);
    expect(p.reason).toMatch(/nested/);
    expect(p.run(RUN)).toEqual(evaluate(deep(501), { ...OPTIONS, ...RUN }));
    // At the limit, the program has generated code.
    expectSame(deep(500), true);
  });

  it("an expression that is not an expression of the IR", () => {
    const e = { tag: "nope" } as unknown as Expr;
    const g = generate(e);
    expect(g.ok ? "" : g.reason).toBe("the lowering threw an exception");
  });

  it("a page that does not permit new Function", () => {
    vi.stubGlobal("Function", function Blocked() {
      throw new EvalError("new Function is not permitted");
    });
    const p = tiered(n, OPTIONS);
    vi.unstubAllGlobals();
    expect(p.tier).toBe(1);
    expect(p.reason).toBe("the page does not permit new Function");
    expect(p.run(RUN)).toEqual(ok(1));
  });
});

/**
 * This function gives the calls of the free function "tick" in a run of `e` at each key of each space: the calls of
 * tier 2 and the calls of the interpreter. The results of the two are the same.
 */
function ticks(e: Expr, spaces: readonly Space[]): { readonly tier2: number; readonly interpreter: number } {
  let calls = 0;
  const options = { domains: [NumDomain], fns: { tick: (x: unknown) => ((calls += 1), x) } };
  const p = tiered(e, options);
  const fast = spaces.flatMap((s) => s.keys.map((origin) => p.run({ space: s, origin })));
  const tier2 = calls;
  calls = 0;
  const slow = spaces.flatMap((s) => s.keys.map((origin) => evaluate(e, { ...options, space: s, origin })));
  expect(fast).toEqual(slow);
  expect(p.stats.fallbacks).toBe(0);
  return { tier2, interpreter: calls };
}

/** This function gives an array space of the values 1 to `count`. */
const values = (count: number): Space => space.array(Array.from({ length: count }, (_, i) => ({ x: i + 1 })));

/** This function gives the sum of x plus the binding y, with y bound outside the loop to `bound`. */
const sumWithY = (bound: Expr): Expr => let_({ y: bound }, app("sum", each(axes.all, app("add", ref("x"), v("y")))));

/** A function as a value of a record. */
const one = (): number => 1;

/** This function gives the sum over all of the second argument of "second": the key `k`, and then a call of tick. */
const node = (k: Expr): Expr => app("sum", each(axes.all, app("second", k, app("tick", ref("x")))));

/** This function gives the nodes of the memo of an expression. */
const memo = (e: Expr): readonly Expr[] => [...memoNodes(e).keys()];

/** The columns of 12 values: the index, and a width. */
const columns = space.array(Array.from({ length: 12 }, (_, i) => ({ i, w: (i * 7) % 5 })));
/** This function gives the largest width in the column of the origin, with `cols` columns. */
const widest = (cols: Expr): Expr => {
  const column = app("mod", ref("i", [{ t: "origin" }]), cols);
  return app("max", each(axes.where(axes.all, app("eq", app("mod", ref("i"), cols), column)), app("tick", ref("w"))));
};


describe("COMPILE.MEMO: a node that depends only on the space evaluates once for each space", () => {
  const total = app("sum", each(axes.all, app("tick", ref("x"))));

  it("the share of each value in the total: the total evaluates once for each space", () => {
    // 10 values: 10 calls of tick in tier 2, and 100 in the interpreter. Then 5 more values in a second space.
    expect(ticks(app("divide", ref("x"), total), [values(10)])).toEqual({ tier2: 10, interpreter: 100 });
    expect(ticks(app("divide", ref("x"), total), [values(10), values(5)])).toEqual({ tier2: 15, interpreter: 125 });
  });

  it("a node inside an item evaluates once for each space, too", () => {
    expect(ticks(app("count", each(axes.all, total)), [values(4)])).toEqual({ tier2: 4, interpreter: 64 });
  });

  it("COMPILE.GROUP: the largest width in the column of the origin evaluates once for each column", () => {
    // 12 values in 3 columns: each column has 4 values, so tier 2 has 12 calls, and the interpreter has 12 times 4.
    expect(ticks(widest(lit(3)), [columns])).toEqual({ tier2: 12, interpreter: 48 });
  });

  it("COMPILE.GROUP: a variable of the run is a key too", () => {
    let calls = 0;
    const options = { domains: [NumDomain], fns: { tick: (x: unknown) => ((calls += 1), x) } };
    const e = widest(v("cols"));
    const p = tiered(e, options);
    const runs = [3, 4, 3].flatMap((cols) => columns.keys.map((origin) => ({ space: columns, origin, vars: { cols } })));
    const fast = runs.map((r) => p.run(r));
    // 12 calls for 3 columns, 12 calls for 4 columns, and no call for 3 columns again.
    expect(calls).toBe(24);
    expect(fast).toEqual(runs.map((r) => evaluate(e, { ...options, ...r })));
  });

  it("COMPILE.GROUP: a binding outside the node is a key, with or without a flag", () => {
    for (const bound of [lit(2), ref("x", [key("A")])]) {
      const p = tiered(sumWithY(bound), OPTIONS);
      expect(p.tier).toBe(2);
      for (const origin of S.keys) expect(p.run({ ...RUN, origin })).toEqual(evaluate(sumWithY(bound), { ...OPTIONS, ...RUN, origin }));
      expect(p.stats.fallbacks).toBe(0);
    }
    // The whole binding depends only on the space, and the loop has the key y.
    expect([...memoNodes(sumWithY(lit(2))).values()]).toEqual([[], [v("y")]]);
  });

  it("COMPILE.GROUP: a key evaluates once for each run, and its value replaces it inside the node", () => {
    // The key calls tick once for each of the 12 runs. Inside the node, the value of the key replaces the key.
    const ticked = app("mod", app("tick", ref("i", [{ t: "origin" }])), lit(3));
    const e = app("max", each(axes.where(axes.all, app("eq", app("mod", ref("i"), lit(3)), ticked)), ref("w")));
    expect(ticks(e, [columns])).toEqual({ tier2: 12, interpreter: 144 });
  });

  it("COMPILE.GROUP: the memo keeps no entry with an object or a function in its keys, and keeps null", () => {
    let calls = 0;
    const shared = { n: 1 };
    const options = { domains: [NumDomain], fns: { tick: (x: unknown) => ((calls += 1), x), second: (_a: unknown, b: unknown) => b } };
    const s4 = space.array(Array.from({ length: 4 }, (_, x) => ({ x, obj: shared, fn: one })));
    const cases: readonly (readonly [Expr, Readonly<Record<string, unknown>>, number])[] = [
      // The same object at each origin: no entry, so each of the 4 runs evaluates the 4 items.
      [ref("obj", [{ t: "origin" }]), {}, 16],
      [ref("fn", [{ t: "origin" }]), {}, 16],
      // null is not an object for the memo: one entry, so the first run evaluates the 4 items.
      [v("c"), { c: null }, 4],
    ];
    for (const [k, vars, expected] of cases) {
      calls = 0;
      const p = tiered(node(k), options);
      const fast = s4.keys.map((origin) => p.run({ space: s4, origin, vars }));
      expect(calls).toBe(expected);
      expect(fast).toEqual(s4.keys.map((origin) => evaluate(node(k), { ...options, space: s4, origin, vars })));
    }
  });

  it("COMPILE.GROUP: a key with an error, a key that is an object, and the keys 0 and -0", () => {
    const signs = { domains: [NumDomain], fns: { sign: (k: unknown, _x: unknown) => (Object.is(k, -0) ? -1 : 1), tick: (x: unknown) => x } };
    const zeros = space.record({ A: { z: 0, x: 1 }, B: { z: -0, x: 2 }, C: { x: 3 }, D: { z: { n: 1 }, x: 4 } });
    const e = app("sum", each(axes.all, app("sign", ref("z", [{ t: "origin" }]), ref("x"))));
    const p = tiered(e, signs);
    for (const origin of [...zeros.keys, ...zeros.keys]) expect(p.run({ space: zeros, origin })).toEqual(evaluate(e, { ...signs, space: zeros, origin }));
    expect(p.stats.fallbacks).toBe(0);
  });

  it("an error of the node is the error at each key", () => {
    const failing = app("sum", each(axes.all, app("tick", ref("missing"))), lit({ strict: true }));
    expect(ticks(app("ifError", failing, lit(0)), [values(3)])).toEqual({ tier2: 0, interpreter: 0 });
  });
});

describe("COMPILE.MEMO: the nodes of the memo and their keys", () => {
  const loop = each(axes.all, ref("x"));
  const atOrigin = ref("x", [{ t: "origin" }]);
  const run = v("c");
  const testAtOrigin = ref("b", [{ t: "origin" }]);
  const column = app("mod", ref("i", [{ t: "origin" }]), run);
  const boundKey = let_({ y: atOrigin }, v("y"));
  const recordKey = rec({ a: atOrigin });
  const loopKey = app("add", atOrigin, app("sum", loop));
  // Each case: the expression, and the keys of its node in the memo, or undefined for a node without a memo.
  const cases: readonly (readonly [string, Expr, readonly Expr[] | undefined])[] = [
    ["a loop over all", app("sum", loop), []],
    ["a literal", lit(1), undefined],
    ["a read at the origin", ref("x"), undefined],
    ["a loop over the others of the origin", app("sum", each(axes.others, ref("x"))), undefined],
    ["a loop over the others of a key", app("sum", each(axes.others, ref("x"), [key("A")])), []],
    ["a loop over the others of an index", app("sum", each(axes.others, ref("x"), [{ t: "index", i: 0 }])), []],
    ["a loop from a key and then the origin", app("sum", each(axes.others, ref("x"), [key("A"), { t: "origin" }])), undefined],
    ["a read at a key in the body", app("sum", each(axes.all, ref("x", [key("A")]))), []],
    ["a read at the origin in the body: the read is a key", app("sum", each(axes.all, app("add", ref("x"), atOrigin))), [atOrigin]],
    ["a relative read in the body", app("sum", each(axes.all, ref("x", [{ t: "parent" }]))), []],
    ["a loop over a table", app("sum", each(axes.table("T"), ref("x"))), undefined],
    ["a name from the run is a key", app("sum", each(axes.all, app("add", ref("x"), run))), [run]],
    ["a name bound inside", app("sum", each(axes.all, let_({ y: ref("x") }, v("y")))), []],
    ["a name bound outside, to a read at the origin", let_({ y: ref("x") }, app("sum", each(axes.all, v("y")))), undefined],
    ["a binding inside the node", let_({ y: lit(1) }, app("sum", each(axes.all, v("y")))), []],
    ["a node with one binding that reads the origin", let_({ y: lit(1), z: ref("x") }, app("sum", each(axes.all, v("y")))), undefined],
    ["a test of where at the origin is a key", app("sum", each(axes.where(axes.all, testAtOrigin), ref("x"))), [testAtOrigin]],
    ["a group: the column of the origin is a key", app("max", each(axes.where(axes.all, app("eq", app("mod", ref("i"), run), column)), ref("w"))), [run, column]],
    ["a key that reads a name of the node is not a key", let_({ y: lit(1) }, app("sum", each(axes.all, app("add", app("add", ref("x"), atOrigin), v("y"))))), [atOrigin]],
    ["a loop over a table from a key", app("sum", each(axes.table("T"), ref("x"), [key("A")])), undefined],
    ["an extension", app("sum", each(axes.all, ext("echo", 1))), undefined],
    ["an extension in a key", app("sum", each(axes.all, app("add", ref("x"), app("add", atOrigin, ext("echo", 1))))), undefined],
    ["a record of loops", rec({ a: app("sum", loop), b: lit(1) }), []],
    ["a binding of a loop", let_({ y: app("sum", loop) }, v("y")), []],
    ["a where test at the target", app("sum", each(axes.where(axes.all, ref("b")), ref("x"))), []],
    ["a node whose only loop is in a key", app("negate", app("add", atOrigin, app("sum", loop))), undefined],
    ["a key with a binding", app("sum", each(axes.all, app("add", ref("x"), boundKey))), [boundKey]],
    ["a record as a key", app("count", each(axes.all, app("add", ref("x"), recordKey))), [recordKey]],
    ["a record with a key in it", app("count", each(axes.all, rec({ a: ref("x"), b: atOrigin }))), [atOrigin]],
    ["a key with a loop of its own", app("count", each(axes.where(axes.all, app("eq", ref("x"), loopKey)), ref("x"))), [loopKey]],
    ["a loop from a key, with a key in it", app("sum", each(axes.others, app("add", ref("x"), atOrigin), [key("A")])), [atOrigin]],
  ];
  it.each(cases)("%s", (_title, e, keys) => {
    const got = memoNodes(e).get(e);
    expect(got).toEqual(keys);
    // The keys are the parts of the expression themselves, not copies.
    expect((got ?? []).every((k, i) => k === (keys ?? [])[i])).toBe(true);
  });

  it("the nodes inside other nodes", () => {
    const inner = app("sum", loop);
    expect(memo(app("add", ref("x"), inner))).toEqual([inner]);
    const outer = app("count", each(axes.all, inner));
    expect(memo(outer)).toEqual([outer, inner]);
    expect(memo(app("count", each(axes.others, inner)))).toEqual([inner]);
    expect(memo(let_({ y: ref("x") }, app("add", v("y"), inner)))).toEqual([inner]);
    expect(memo(rec({ a: ref("x"), b: inner }))).toEqual([inner]);
    const test = app("gt", inner, lit(0));
    expect(memo(app("count", each(axes.where(axes.others, test), ref("x"))))).toEqual([test, inner]);
    // The bindings above the loop of a list op: the loop and the bindings have no value of their own.
    const fused = app("count", let_({ t: inner }, each(axes.all, ref("x"))));
    expect(memo(fused)).toEqual([fused, inner]);
    expect(memo(app("sum", let_({ y: lit(1) }, each(axes.all, v("y")))))).toHaveLength(1);
    // A binding and the body of a let, and the body of a list.
    expect(memo(let_({ y: inner }, ref("x")))).toEqual([inner]);
    expect(memo(each(axes.others, inner))).toEqual([inner]);
    expect(memo(app("add", let_({ y: lit(1) }, inner), ref("x")))).toEqual([let_({ y: lit(1) }, inner), inner]);
    // Nodes without a loop.
    expect(memo(let_({ y: lit(1) }, v("y")))).toEqual([]);
    expect(memo(ref("x", [key("A")]))).toEqual([]);
    // An op that is not a list op has a value of its first argument, so its bindings and its loop can be in the memo.
    const lets = let_({ y: lit(1) }, each(axes.all, ref("x")));
    const notList = app("add", lets, lit(1));
    expect(memo(notList)).toEqual([notList, lets, lets.body]);
  });
});

describe("COMPILE.TRACE: a trace comes from tier 1", () => {
  it("a run with a trace and explain give the trace of the interpreter", () => {
    const e = app("sum", all(n));
    const p = tiered(e, OPTIONS);
    const sink = { events: [] };
    expect(p.run({ ...RUN, trace: sink })).toEqual(evaluate(e, { ...OPTIONS, ...RUN }));
    expect(sink.events.length).toBeGreaterThan(0);
    expect(p.explain(RUN)).toEqual(explain(e, { ...OPTIONS, ...RUN }));
    expect(p.stats).toEqual({ runs: 1, fallbacks: 0 });
  });
});

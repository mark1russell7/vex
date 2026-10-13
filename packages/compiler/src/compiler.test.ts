import {
  app,
  axes,
  defineDomain,
  each,
  evaluate,
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
    twice: { fn: (b: Box) => new Box(b.v * 2) },
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

/** A domain of texts with a declared method op. A text is not an object, so it has no methods. */
const TextDomain = defineDomain({ name: "Text", is: (u: unknown): u is string => typeof u === "string", ops: { toUpperCase: {} } });

const OPTIONS: CompileOptions = {
  domains: [BoxDomain, TagDomain, NumDomain, TextDomain],
  fns: {
    double: (x: unknown) => (typeof x === "number" ? x * 2 : x),
    zero: () => 0,
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
  A: { box: new Box(1), arg: new Box(1), k: 3 },
  B: { box: new Box(2), arg: new Box(5), k: 3 },
  C: { box: new Box(3), arg: 2, k: 1 },
  D: { box: new Box(4), arg: new Tag("d"), k: "x" },
  E: { box: own, arg: new Box(1), k: 3 },
  F: { box: { get0: methodOf("get0"), plus: methodOf("plus") }, arg: new Box(1), k: 3 },
  G: { box: Object.assign(new Box(1), { kind: "vex.list", items: [] }), arg: new Box(1), k: 3 },
  H: { box: 7, arg: new Box(1), k: 3 },
});

/**
 * This function checks that the tiered program gives the result of the interpreter. `fast` tells if tier 2 gave the
 * result, with no fallback.
 */
function expectSame(e: Expr, fast: boolean, run: RunOptions = RUN, options: CompileOptions = OPTIONS): void {
  const p = tiered(e, options);
  expect(fromCore(p.run(run))).toStrictEqual(fromCore(evaluate(e, { ...options, ...run })));
  expect(p.tier === 2 && p.stats.fallbacks === 0).toBe(fast);
}

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
    ["a list op name", app("max", box, ref("arg")), false],
  ];
  it.each(cases)("%s", (_title, op, fast) => {
    expectSame(app("values", all(op)), fast, at);
    expectSame(all(op), false, at);
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
    let e: Expr = lit(1);
    for (let i = 0; i < 600; i++) e = app("double", e);
    const p = tiered(e, OPTIONS);
    expect(p.tier).toBe(1);
    expect(p.reason).toMatch(/nested/);
    expectSame(e, false);
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

describe("COMPILE.TRACE: a trace comes from tier 1", () => {
  it("a run with a trace and explain give the trace of the interpreter", () => {
    const e = app("sum", all(n));
    const p = tiered(e, OPTIONS);
    const sink = { events: [] };
    expect(p.run({ ...RUN, trace: sink })).toEqual(evaluate(e, { ...OPTIONS, ...RUN }));
    expect(sink.events.length).toBeGreaterThan(0);
    expect(p.explain(RUN)).toEqual(tiered(e, OPTIONS).explain(RUN));
    expect(p.stats).toEqual({ runs: 1, fallbacks: 0 });
  });
});

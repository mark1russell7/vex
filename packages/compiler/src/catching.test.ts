/**
 * The contexts that catch an error (COMPILE.FALLBACK, V-071). A check of tier 2 tells one of two things. An error of the
 * program is a failure of the block, and the context of the block can catch it. A request for tier 1 is no error, so it
 * stops the program in each context. These tests put each failing part in each context that catches an error.
 */
import { app, axes, call, dataLimit, each, evaluate, ext, fail, fn, fold, iterate, let_, lit, ok, rec, ref, space, v, vexError, type Axis, type Expr, type ExtHandler, type Result, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tiered, type GenerateOptions } from "./tiers.ts";

const EXTENSIONS: Readonly<Record<string, ExtHandler>> = {
  value: () => ok(2),
  error: () => fail(vexError("missing-field", "no field")),
  depth: () => fail(vexError("depth", "too deep")),
};

/** In these options, `add` has one identity, so an empty `reduce` of `add` gives a value. */
const ONE: GenerateOptions = { domains: [NumDomain, BoolDomain, TextDomain], extensions: EXTENSIONS };
/** In these options, `add` has two identities, so an empty `reduce` of `add` gives an error. */
const TWO: GenerateOptions = { domains: [Vec2Domain, NumDomain, BoolDomain], extensions: EXTENSIONS };
/** These options add a schema that some records break. Such a record asks tier 1 too. */
const KINDS: GenerateOptions = { ...ONE, schema: { fields: { n: "number" } } };

const S = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
const TREE = space.tree({ r: { n: 1 }, a: { n: 2 }, b: { n: 3 } }, { r: null, a: "r", b: "r" });
const MIXED = space.record({ A: { n: 1 }, B: { n: "x" }, C: {} });

/** A list with no item. */
const none = (body: Expr = ref("n")): Expr => each(axes.where(axes.all, lit(false)), body);
/** A list whose items all fail, so a list op sees no item. */
const failed = each(axes.all, ref("missing"));
const reduce = (op: string, list: Expr = none()): Expr => app("reduce", list, lit(op));

/** This function compares a tiered program with the interpreter at each key of each space, and gives its fallbacks. */
function fallbacks(e: Expr, options: GenerateOptions, spaces: readonly Space[] = [S]): number {
  const p = tiered(e, options);
  for (const s of spaces) {
    for (const origin of s.keys) expect(p.run({ space: s, origin })).toEqual(evaluate(e, { ...options, space: s, origin }));
  }
  return p.stats.fallbacks;
}

/** The result of a program at the key 0. */
function result(e: Expr, options: GenerateOptions = ONE): Result<unknown> {
  return tiered(e, options).run({ space: S, origin: "0" });
}

/** This function gives a data limit whose later test uses an extension that gives #DEPTH!. */
const depthTest = (first: Expr): Axis => axes.where(axes.all, app("if", app("gt", ref("n"), lit(1)), ext("depth", null), first));

describe("a request for tier 1 in a context that catches an error", () => {
  it("V-071 COMPILE.FALLBACK: an empty reduce gives the identity of its op in each context", () => {
    const programs: readonly (readonly [Expr, unknown])[] = [
      [app("ifError", reduce("add"), lit(-1)), 0],
      [app("ifError", app("add", reduce("add"), lit(1)), lit(-1)), 1],
      [app("ifError", reduce("and"), lit(-1)), true],
      [app("ifError", reduce("add", failed), lit(-1)), 0],
      [app("ifError", let_({ x: reduce("add") }, v("x")), lit(-1)), 0],
      [app("ifError", app("if", lit(true), reduce("add"), lit(1)), lit(-1)), 0],
      [app("ifError", rec({ a: reduce("add") }), lit(-1)), { a: 0 }],
      [app("ifError", fold(axes.all, { a: lit(5) }, { a: reduce("add") }, v("a")), lit(-1)), 0],
      [app("ifError", iterate(1, { a: lit(5) }, { a: reduce("add") }, v("a")), lit(-1)), 0],
      [app("ifError", let_({ f: fn(["x"], v("x")) }, call("f", reduce("add"))), lit(-1)), 0],
      [app("count", each(axes.all, reduce("add"))), 3],
      [app("sum", each(axes.all, app("add", reduce("add"), lit(1)))), 3],
      [app("first", each(axes.all, reduce("add"))), 0],
      [app("count", each(axes.where(axes.all, app("eq", reduce("add"), lit(0))), ref("n"))), 3],
    ];
    for (const [e, expected] of programs) {
      expect(result(e)).toStrictEqual(ok(expected));
      expect(fallbacks(e, ONE)).toBe(3);
    }
  });

  it("V-071 COMPILE.MEMO: a request for tier 1 in a node of the memo leaves no entry without a value", () => {
    // The node reads a field of the origin, so the memo keeps it for each record. A second run reads the memo.
    const e = app("ifError", app("add", reduce("add"), ref("n")), lit(-1));
    expect(fallbacks(e, ONE, [S, S])).toBe(6);
  });

  it("V-071 ITERATE.LIMIT.ERROR COMPILE.EXT: #DEPTH! of a later test of a data limit wins over a caught error", () => {
    for (const first of [lit("x"), ref("missing"), ext("error", null)]) {
      // In the second axis, only one of the two tests can use an extension.
      for (const axis of [depthTest(first), axes.where(depthTest(first), lit(true))]) {
        const e = app("ifError", iterate(dataLimit(axis), { a: lit(0) }, { a: lit(1) }, v("a")), lit(-1));
        expect(result(e)).toMatchObject({ ok: false, error: { code: "#DEPTH!" } });
        expect(fallbacks(e, ONE)).toBe(3);
      }
    }
  });
});

describe("an error of the program in a context that catches an error", () => {
  it("V-071 LIST.EMPTY: an empty reduce of an op without one identity is an error, so tier 2 gives the result", () => {
    const programs: readonly Expr[] = [
      app("ifError", reduce("max"), lit(-1)),
      app("ifError", reduce("nope"), lit(-1)),
      app("ifError", reduce("__proto__"), lit(-1)),
      app("count", each(axes.all, reduce("subtract"))),
    ];
    for (const e of programs) expect(fallbacks(e, ONE)).toBe(0);
    // Two domains have an identity of add.
    expect(fallbacks(app("ifError", reduce("add"), lit(-1)), TWO)).toBe(0);
  });

  it("V-071 LIST.EMPTY: tier 1 decides an empty reduce when the program does not fix the op or the domain", () => {
    const programs: readonly Expr[] = [
      // The name is not a literal.
      let_({ op: lit("add") }, app("ifError", app("reduce", none(), v("op")), lit(-1))),
      // The option names one of the two domains.
      app("ifError", app("reduce", none(), lit("add"), lit({ domain: "Num" })), lit(-1)),
      // The option names a domain with no identity of the op.
      app("ifError", app("reduce", none(), lit("max"), lit({ domain: "Num" })), lit(-1)),
    ];
    for (const e of programs) expect(fallbacks(e, TWO)).toBe(3);
  });

  it("V-071 COMPILE.TIERED: a reduce with items stays in tier 2 in a context that catches an error", () => {
    const items = each(axes.all, ref("n"));
    expect(result(app("ifError", app("reduce", items, lit("add")), lit(-1)))).toStrictEqual(ok(6));
    expect(fallbacks(app("ifError", app("reduce", items, lit("add")), lit(-1)), ONE)).toBe(0);
    expect(fallbacks(app("count", each(axes.all, app("reduce", items, lit("add")))), ONE)).toBe(0);
    // A step that fails is an error of the program.
    expect(fallbacks(app("ifError", app("reduce", each(axes.all, lit("x")), lit("add")), lit(-1)), ONE)).toBe(0);
  });

  it("V-071 ITERATE.LIMIT.ERROR: a failed test of a data limit without an extension stays in tier 2", () => {
    const e = app("ifError", iterate(dataLimit(axes.where(axes.all, lit("x"))), { a: lit(0) }, { a: lit(1) }, v("a")), lit(-1));
    expect(result(e)).toStrictEqual(ok(-1));
    expect(fallbacks(e, ONE)).toBe(0);
  });
});

/** The names of the list ops. */
const LIST_OPS = ["count", "sum", "mean", "min", "max", "any", "all", "none", "first", "values", "keys", "errors"] as const;

/** The parts that can fail: each request for tier 1, and each error of the program in a list op. */
const PARTS: readonly Expr[] = [
  reduce("add"),
  reduce("multiply"),
  reduce("and"),
  reduce("or"),
  reduce("concat"),
  reduce("max"),
  reduce("subtract"),
  reduce("nope"),
  reduce("add", failed),
  reduce("add", each(axes.children, ref("n"))),
  reduce("max", each(axes.children, ref("n"))),
  app("reduce", none()),
  app("reduce", none(), lit(1)),
  app("reduce", none(), ref("n")),
  app("reduce", none(), lit("add"), lit({ domain: "Num" })),
  app("reduce", none(), lit("add"), lit({ domain: "Nope" })),
  app("reduce", none(), lit("max"), lit({ domain: "Num" })),
  app("reduce", failed, lit("add"), lit({ strict: true })),
  app("reduce", each(axes.all, lit("x")), lit("add")),
  ...LIST_OPS.flatMap((op) => [app(op, none()), app(op, failed), app(op, failed, lit({ strict: true })), app(op, each(axes.all, lit("x"))), app(op, each(axes.children, ref("n")))]),
  // List values: each op takes a list that is empty, that has an error item, or that is not a list.
  ...["first", "sum", "count"].flatMap((op) => [app(op, app("take", none(), lit(1))), app(op, app("take", failed, lit(1))), app(op, app("append", none(), failed))]),
  app("reduce", app("take", none(), lit(1)), lit("add")),
  app("reduce", app("append", none(), none()), lit("add")),
  app("nth", none(), lit(0)),
  app("nth", failed, lit(0)),
  app("nth", each(axes.all, ref("n")), lit(99)),
  app("get", none(), lit("0")),
  app("get", failed, ref("n")),
  app("take", ref("n"), lit(1)),
  app("append", failed, ref("n")),
  fold(axes.list(none()), { a: lit(0) }, { a: lit(1) }, v("a")),
  fold(axes.list(failed), { a: lit(0) }, { a: lit(1) }, v("a")),
  fold(axes.list(ref("n")), { a: lit(0) }, { a: lit(1) }, v("a")),
  iterate(dataLimit(axes.list(none())), { a: lit(0) }, { a: lit(1) }, v("a")),
  iterate(dataLimit(axes.list(failed)), { a: lit(0) }, { a: lit(1) }, v("a")),
  failed,
  ref("missing"),
  ref("n"),
  app("add", lit(1), lit("x")),
  app("divide", ref("n"), lit(0)),
  v("unbound"),
  ext("value", null),
  ext("error", null),
  ext("depth", null),
  lit(1),
];

/** Each context that catches an error, or that holds a part beside another part. */
const arbCatching: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => {
  const e = tie("e");
  const items = fc.constantFrom<Axis>(
    axes.all,
    axes.others,
    axes.children,
    axes.list(none()),
    axes.list(failed),
    axes.list(ref("n")),
    axes.list(each(axes.all, ref("n"))),
    axes.reverse(axes.list(each(axes.all, ref("n")))),
    axes.where(axes.list(each(axes.all, ref("n"))), lit(false)),
  );
  const list = fc.tuple(fc.constantFrom(...LIST_OPS), items, e, fc.boolean()).map(([op, axis, x, strict]) => app(op, each(axis, x), ...(strict ? [lit({ strict: true })] : [])));
  return {
    e: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.constantFrom(...PARTS),
      fc.tuple(e, fc.constantFrom<Expr>(lit(-1), ref("missing"), reduce("add"))).map(([x, y]) => app("ifError", x, y)),
      list,
      fc.tuple(items, e).map(([axis, x]) => app("reduce", each(axis, x), lit("add"))),
      fc.tuple(items, e).map(([axis, x]) => app("count", each(axes.where(axis, app("eq", x, lit(0))), ref("n")))),
      fc.tuple(e, e).map(([x, y]) => app("add", x, y)),
      fc.tuple(e, e).map(([x, y]) => rec({ x, y })),
      fc.tuple(e, e, e).map(([c, x, y]) => app("if", app("eq", c, lit(0)), x, y)),
      fc.tuple(e, e).map(([x, y]) => let_({ a: x }, y)),
      e.map((x) => let_({ a: x }, v("a"))),
      fc.tuple(e, e).map(([x, y]) => let_({ f: fn(["p"], y) }, call("f", x))),
      fc.tuple(e, e).map(([x, y]) => fold(axes.all, { a: x }, { a: y }, v("a"))),
      e.map((x) => fold(axes.where(axes.all, app("eq", x, lit(0))), { a: lit(0) }, { a: ref("n") }, v("a"))),
      fc.tuple(e, e).map(([x, y]) => iterate(2, { a: x }, { a: y }, v("a"))),
      e.map((x) => iterate(2, { a: lit(0) }, { a: app("add", v("a"), lit(1)) }, v("a"), app("eq", x, lit(0)))),
      e.map((x) => iterate(dataLimit(axes.where(axes.all, app("eq", x, lit(0)))), { a: lit(0) }, { a: lit(1) }, v("a"))),
    ),
  };
}).e;

describe("the parts of list values in a context that catches an error", () => {
  it("V-071 COMPILE.LIST.VALUE COMPILE.LIST.AXIS: tier 2 takes each one, so the property reaches the code of list values", () => {
    const parts = PARTS.filter((p) => JSON.stringify(p).includes('"take"') || JSON.stringify(p).includes('"nth"') || JSON.stringify(p).includes('"get"') || JSON.stringify(p).includes('"append"') || JSON.stringify(p).includes('"list"'));
    expect(parts.length).toBeGreaterThanOrEqual(19);
    expect(parts.filter((p) => tiered(app("ifError", p, lit(-1)), ONE).tier !== 2)).toStrictEqual([]);
  });
});

describe("P17: each failing part in each context", () => {
  it.each([
    ["one identity", ONE],
    ["two identities", TWO],
    ["a schema", KINDS],
  ] as const)("V-071 P17 COMPILE.FALLBACK: a tiered program gives the result of the interpreter, with %s", (_name, options) => {
    fc.assert(
      fc.property(arbCatching, (e) => {
        expect(fallbacks(e, options, [S, TREE, MIXED, S])).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

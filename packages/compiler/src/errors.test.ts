/**
 * The error results of tier 2 (COMPILE.ERRORS). Tier 2 ends a program with the error of the interpreter, with its code,
 * its kind, its message, its path, its position and its causes. The program does not go to tier 1 for this result.
 */
import { app, axes, call, defineDomain, each, evaluate, ext, fail, fn, fold, index, iterate, key, let_, lit, offset, ok, rec, ref, space, v, vexError, type Expr, type ExtHandler, type FreeFn, type Result, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_COPIED } from "./lower.ts";
import { FALLBACK } from "./runtime.ts";
import { generate, load, tiered, type GenerateOptions } from "./tiers.ts";

const BadDomain = defineDomain<{ readonly bad: boolean }>({
  name: "bad",
  is: (u): u is { readonly bad: boolean } => typeof u === "object" && u !== null && "bad" in u,
  valid: (x) => {
    if (x.bad) throw new Error("no check");
    return Object.keys(x).length === 1;
  },
  fromScalar: (n) => {
    if (n < 0) throw new Error("no lift");
    return { bad: false };
  },
  ops: {
    make: { fn: (bad: unknown) => ({ bad: bad === true }), params: ["any"] },
    wrong: { fn: () => ({ bad: false, extra: 1 }) },
    both: { fn: (a: { readonly bad: boolean }) => a, liftScalar: true, params: ["domain"] },
  },
});

const FNS: Readonly<Record<string, FreeFn>> = {
  boom: (): never => {
    throw new Error("boom");
  },
  nothing: (): undefined => undefined,
  infinite: (): number => Number.POSITIVE_INFINITY,
  badValue: (): unknown => ({ bad: false, extra: 1 }),
};

const located = vexError("missing-field", "a foreign error", { path: [9], origin: "Z", focus: "Y" });
const EXTENSIONS: Readonly<Record<string, ExtHandler>> = {
  value: () => ok(2),
  cycle: () => fail(vexError("cycle", "a cycle")),
  located: () => fail(located),
  throws: () => {
    throw new Error("ext");
  },
  // A handler that throws an object that is not an Error.
  thrown: () => {
    // oxlint-disable-next-line typescript/only-throw-error -- the test needs a thrown value that is not an Error.
    throw { reason: "text" };
  },
};

const OPTIONS: GenerateOptions = { domains: [Vec2Domain, NumDomain, BoolDomain, TextDomain, BadDomain], extensions: EXTENSIONS, fns: FNS };
const S = space.record({ A: { n: 1, t: "x", o: { p: 1 }, u: null }, B: { n: 2, t: "y", o: 3 }, C: { n: 3, o: { q: 2 } } });
const TABLES = { T: S };

/** This function gives the run of a key of a space. */
const runOf = (s: Space, origin: string, vars?: Readonly<Record<string, unknown>>): { readonly space: Space; readonly origin: string; readonly tables: typeof TABLES; readonly vars?: Readonly<Record<string, unknown>> } => ({ space: s, origin, tables: TABLES, ...(vars === undefined ? {} : { vars }) });

/** This function gives the code of a result, or the text "value". */
const codeOf = (r: Result<unknown>): string => (r.ok ? "value" : r.error.code);

/**
 * This function compares a program with the interpreter at each key, and gives the codes of the results. Tier 2 gives
 * each result, so the program has no fallback.
 */
function direct(e: Expr, s: Space = S, vars?: Readonly<Record<string, unknown>>): string[] {
  const p = tiered(e, OPTIONS);
  expect(p.tier, p.tier === 1 ? p.reason : "").toBe(2);
  const codes = s.keys.map((origin) => {
    const r = p.run(runOf(s, origin, vars));
    expect(r).toEqual(evaluate(e, { ...OPTIONS, ...runOf(s, origin, vars) }));
    return codeOf(r);
  });
  expect(p.stats.fallbacks).toBe(0);
  return codes;
}

const all = (body: Expr): Expr => each(axes.all, body);
const nope = ref("nope");
const text = lit("x");

describe("COMPILE.ERRORS: tier 2 gives the error of each site", () => {
  it("COMPILE.ERRORS: an origin that is not a key", () => {
    const p = tiered(ref("n"), OPTIONS);
    expect(p.run(runOf(S, "nowhere"))).toEqual(evaluate(ref("n"), { ...OPTIONS, ...runOf(S, "nowhere") }));
    expect(p.stats).toEqual({ runs: 1, fallbacks: 0 });
  });

  it("COMPILE.ERRORS: the names of variables and functions", () => {
    expect(direct(v("x"))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(v("x"), S, { x: 1 })).toEqual(["value", "value", "value"]);
    expect(direct(let_({ f: fn([], lit(1)) }, v("f")))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(call("f"))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(call("x"), S, { x: 1 })).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    // A property of the prototype of the variables is no variable.
    expect(direct(call("toString"), S, {})).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(let_({ x: lit(1) }, call("x")))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(let_({ x: nope }, call("x")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(let_({ f: fn(["a"], v("a")) }, call("f")))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(let_({ f: fn(["a"], app("add", v("a"), nope)) }, call("f", lit(1))))).toEqual(["#N/A", "#N/A", "#N/A"]);
  });

  it("COMPILE.ERRORS: the fields of a record", () => {
    expect(direct(nope)).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref(["o", "p"]))).toEqual(["value", "#N/A", "#N/A"]);
    expect(direct(ref(["o", "p", "z"]))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("u"))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("__proto__"))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref(["o", "__proto__", "x"]))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("nope", [key("A")]))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("n", []))).toEqual(["value", "value", "value"]);
  });

  it("COMPILE.ERRORS: a record that is not an object, and a key without a record", () => {
    const s = space.array([1, 2]);
    expect(direct(ref("x"), s)).toEqual(["#N/A", "#N/A"]);
    const holes = space.record({ A: undefined, B: { x: 1 } });
    expect(direct(ref("x"), holes)).toEqual(["#N/A", "value"]);
  });

  it("COMPILE.ERRORS: the addresses and the axes", () => {
    const g = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(direct(ref("n", [offset(1)]), g)).toEqual(["value", "value", "#REF!"]);
    expect(direct(ref("n", [index(lit(9))]), g)).toEqual(["#REF!", "#REF!", "#REF!"]);
    expect(direct(ref("n", [index(text)]), g)).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(ref("n", [key("Z")]), g)).toEqual(["#REF!", "#REF!", "#REF!"]);
    expect(direct(ref("n", [index(nope)]), g)).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("n", [index(nope), index(text)]), g)).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ref("n", [offset(1), offset(1)]), g)).toEqual(["value", "#REF!", "#REF!"]);
    expect(direct(ref([], [offset(1)]), g)).toEqual(["value", "value", "#REF!"]);
    expect(direct(app("sum", each(axes.table("nope"), ref("n"))))).toEqual(["#REF!", "#REF!", "#REF!"]);
    expect(direct(app("sum", each(axes.table("T"), ref("n"))))).toEqual(["value", "value", "value"]);
    expect(direct(app("sum", each(axes.window(0, 1), ref("n"))))).toEqual(["value", "value", "value"]);
  });

  it("COMPILE.ERRORS: the tests of the axes", () => {
    expect(direct(app("sum", each(axes.where(axes.all, ref("n")), ref("n"))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("sum", each(axes.where(axes.all, nope), ref("n"))))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(fold(axes.where(axes.all, ref("t")), { a: lit(0) }, { a: lit(1) }, v("a")))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(fold(axes.all, { a: lit(0) }, { a: app("add", v("a"), nope) }, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(fold(axes.all, { a: nope, b: text }, { a: lit(0), b: lit(0) }, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
  });

  it("COMPILE.ERRORS: the tests of iterate, and its limit", () => {
    const step = { a: app("add", v("a"), lit(1)) };
    expect(direct(iterate(2, { a: lit(0) }, step, v("a"), lit(1)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(iterate(2, { a: lit(0) }, step, v("a"), app("gt", v("a"), lit(9))))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(iterate(2, { a: lit(0) }, step, v("a")))).toEqual(["value", "value", "value"]);
    expect(direct(iterate(2, { a: nope }, step, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(iterate(2, { a: lit(0) }, { a: nope }, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(iterate(2, { a: nope, b: text }, { a: lit(0), b: lit(0) }, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
  });

  it("COMPILE.ERRORS: if, and, or and ifError", () => {
    expect(direct(app("if"))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("if", lit(1), lit(2), lit(3)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("if", lit(true)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("if", lit(false), lit(1)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("if", app("gt", ref("n"), lit(1)), nope, text))).toEqual(["value", "#N/A", "#N/A"]);
    expect(direct(app("and"))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("or"))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("and", lit(true), lit(1)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("or", lit(false), text))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("ifError"))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("ifError", nope))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("ifError", nope, app("add", text, lit(1))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("ifError", nope, nope))).toEqual(["#N/A", "#N/A", "#N/A"]);
  });

  it("COMPILE.ERRORS: the failures of an op", () => {
    expect(direct(app("nope", lit(1)))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(app("nope"))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(app("nope", lit({ odd: 1 })))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("add", lit(new Vec2(1, 2)), lit("x")))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("divide", lit(1), lit(0)))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("boom"))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
    expect(direct(app("nothing"))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
    expect(direct(app("infinite"))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("badValue"))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("wrong", app("make", lit(false))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("make", lit(true)))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
    expect(direct(app("both", lit(-1)))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
    expect(direct(app("both", lit(1)))).toEqual(["value", "value", "value"]);
  });

  it("COMPILE.ERRORS: the kinds of the arguments of an op with a static site", () => {
    expect(direct(app("add", ref("n"), text))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("sqrt", app("subtract", lit(0), ref("n"))))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("gt", ref("t"), lit(1)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
  });

  it("COMPILE.ERRORS: the list ops", () => {
    expect(direct(app("sum", all(ref("t"))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("mean", all(ref("t"))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("min", all(ref("t"))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("max", all(text)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("any", all(ref("n"))))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("all", all(text)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("none", all(text)))).toEqual(["#VALUE!", "#VALUE!", "#VALUE!"]);
    expect(direct(app("mean", all(nope)))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("min", all(nope)))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("max", all(nope)))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("first", all(nope)))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("sum", all(lit(1e308))))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("mean", all(lit(1e308))))).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(direct(app("reduce", all(ref("n")), lit("nope")))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(app("reduce", all(ref("n")), lit("divide"), lit({ strict: false })))).toEqual(["value", "value", "value"]);
    expect(direct(app("sum", all(ref("n")), nope))).toEqual(["#N/A", "#N/A", "#N/A"]);
  });

  it("COMPILE.ERRORS: the extensions", () => {
    expect(direct(ext("none", null))).toEqual(["#NAME?", "#NAME?", "#NAME?"]);
    expect(direct(ext("cycle", null))).toEqual(["#CYCLE!", "#CYCLE!", "#CYCLE!"]);
    expect(direct(ext("located", null))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(ext("throws", null))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
    expect(direct(ext("thrown", null))).toEqual(["#CALC!", "#CALC!", "#CALC!"]);
  });

  it("COMPILE.ERRORS: `load` keeps its contract: a function that gives a value or `FALLBACK`", () => {
    const g = generate(nope, OPTIONS);
    if (!g.ok) throw new Error(g.reason);
    expect(load(g)(S, "A", undefined, undefined)).toBe(FALLBACK);
  });

  it("COMPILE.ERRORS: a run after an error of tier 2 gives its own result, and the error object is new for each run", () => {
    const p = tiered(ref(["o", "p"]), OPTIONS);
    const a = p.run(runOf(S, "B"));
    expect(p.run(runOf(S, "A"))).toEqual(ok(1));
    const b = p.run(runOf(S, "B"));
    expect(a).toEqual(b);
    expect(codeOf(a)).toBe("#N/A");
    expect(p.stats).toEqual({ runs: 3, fallbacks: 0 });
  });

  it("COMPILE.ERRORS: `run` with a trace and `explain` stay on tier 1", () => {
    const p = tiered(nope, OPTIONS);
    expect(codeOf(p.explain(runOf(S, "A")).result)).toBe("#N/A");
    expect(p.stats).toEqual({ runs: 0, fallbacks: 0 });
  });
});

describe("CALL.ARGS REC.FIELDS COMPILE.ERRORS: two or more failed arguments give #ARGS", () => {
  it("CALL.ARGS REC.FIELDS: an op and a record, with each error as a cause", () => {
    expect(direct(app("add", nope, app("nope", lit(1))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(rec({ a: nope, b: lit(1), c: ref("zz") }))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(app("add", nope, ref("n"), ref("zz"), lit(1), ref("yy")))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(app("add", ref("n"), nope))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(app("add", nope, ref("n")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(app("add", ref("n"), lit(1), ref("n")))).toEqual(["value", "value", "value"]);
  });

  it("CALL.ARGS: an error of a key only, so the cause and the sole error depend on the run", () => {
    expect(direct(app("add", ref(["o", "p"]), ref(["o", "q"])))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(rec({ a: ref("t"), b: ref(["o", "p"]) }))).toEqual(["value", "#N/A", "#ARGS"]);
  });

  it("CALL.ARGS: #ARGS in #ARGS, and each order of depth", () => {
    expect(direct(app("add", app("add", nope, ref("zz")), app("add", ref("yy"), text)))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(app("add", app("add", app("add", nope, ref("zz")), ref("yy")), app("add", ref("xx"), app("add", ref("ww"), ref("vv")))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(rec({ a: app("add", nope, ref("zz")), b: rec({ c: nope, d: ref("zz") }) }))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
  });

  it("CALL.ARGS: a node inside a conditional, a binding, a function and a loop", () => {
    const pair = app("add", nope, ref("zz"));
    expect(direct(app("if", app("gt", ref("n"), lit(1)), pair, lit(1)))).toEqual(["value", "#ARGS", "#ARGS"]);
    expect(direct(let_({ x: pair }, v("x")))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(let_({ x: pair }, app("add", v("x"), v("x"))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(let_({ x: nope, y: ref("zz") }, app("add", v("x"), v("y"))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(let_({ f: fn(["a"], app("add", nope, v("a"))) }, call("f", lit(1))))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(let_({ f: fn(["a", "b"], app("add", v("a"), v("b"))) }, call("f", nope, ref("zz"))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(let_({ f: fn(["a"], lit(1)) }, call("f", nope)))).toEqual(["value", "value", "value"]);
    expect(direct(iterate(3, { a: lit(0) }, { a: app("add", nope, ref("zz")) }, v("a")))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(fold(axes.all, { a: lit(0) }, { a: app("add", ref("t"), ref(["o", "p"])) }, v("a")))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(iterate(3, { a: lit(0) }, { a: app("if", app("gt", v("a"), lit(0)), app("add", nope, ref("zz")), lit(1)) }, v("a")))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
  });

  it("CALL.ARGS: a loop turn that fails once does not keep its error for the next run", () => {
    const p = tiered(app("add", ref("t"), ref(["o", "p"])), OPTIONS);
    for (const origin of ["B", "C", "A", "C", "B"]) expect(p.run(runOf(S, origin))).toEqual(evaluate(p.expr, { ...OPTIONS, ...runOf(S, origin) }));
    expect(p.stats.fallbacks).toBe(0);
  });

  it("CALL.ARGS: the arguments of a list op, and the list op in an argument", () => {
    expect(direct(app("add", app("sum", all(ref("t"))), app("mean", all(nope))))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    expect(direct(rec({ a: app("first", all(nope)), b: app("min", all(nope)) }))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
  });

  it("CALL.ARGS: an argument of a node of the memo, and a second node with the same memo", () => {
    const total = app("sum", all(ref("n")));
    const bad = app("sum", each(axes.where(axes.all, app("eq", ref("n"), lit(2))), ref("t")));
    expect(direct(app("add", total, nope))).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(direct(app("add", bad, nope, total))).toEqual(["#ARGS", "#ARGS", "#ARGS"]);
    const p = tiered(rec({ a: bad, b: app("add", bad, lit(1)) }), OPTIONS);
    for (const origin of [...S.keys, ...S.keys]) expect(p.run(runOf(S, origin))).toEqual(evaluate(p.expr, { ...OPTIONS, ...runOf(S, origin) }));
    expect(p.stats.fallbacks).toBe(0);
  });

  it("CALL.ARGS EVAL.ORDER: tier 2 calls each extension once, in the order of the interpreter", () => {
    const seen: string[] = [];
    const tag = (name: string): ExtHandler => () => {
      seen.push(name);
      return name.startsWith("bad") ? fail(vexError("cycle", name)) : ok(1);
    };
    const extensions = Object.fromEntries(["bad1", "good1", "bad2", "good2", "bad3", "bad4"].map((name) => [name, tag(name)]));
    const options = { ...OPTIONS, extensions };
    const e = app("add", ext("good1", null), rec({ x: ext("bad1", null), y: ext("good2", null) }), app("add", ext("bad2", null), ext("bad3", null)), ext("bad4", null));
    evaluate(e, { ...options, space: S, origin: "A" });
    const order = seen.splice(0);
    const p = tiered(e, options);
    expect(p.run({ space: S, origin: "A" })).toEqual(evaluate(e, { ...options, space: S, origin: "A" }));
    expect(seen.slice(0, order.length)).toEqual(order);
    expect(seen).toHaveLength(order.length * 2);
    expect(p.stats.fallbacks).toBe(0);
  });

  it("CALL.ARGS COMPILE.EXT EVAL.DEPTH: #DEPTH! in a later argument stops the program, so tier 1 gives it", () => {
    const depth: GenerateOptions = { ...OPTIONS, extensions: { ...EXTENSIONS, depth: () => fail(vexError("depth", "deep")) } };
    const e = app("add", nope, ext("depth", null), ref("zz"));
    const p = tiered(e, depth);
    const r = p.run({ space: S, origin: "A" });
    expect(codeOf(r)).toBe("#DEPTH!");
    expect(r).toEqual(evaluate(e, { ...depth, space: S, origin: "A" }));
    expect(p.stats.fallbacks).toBe(1);
  });

  it("COMPILE.ERRORS: a program past the limit of the copies keeps its value path, and tier 1 gives #ARGS", () => {
    const wide = (x: Expr, count: number): Expr => app("add", ...Array.from({ length: count }, () => x));
    const e = wide(wide(wide(wide(ref("n"), 8), 8), 8), 8);
    const p = tiered(e, OPTIONS);
    expect(p.tier).toBe(2);
    expect(MAX_COPIED).toBeGreaterThan(0);
    expect(p.run({ space: S, origin: "A" })).toEqual(ok(4096));
    const bad = wide(wide(wide(wide(nope, 8), 8), 8), 8);
    const q = tiered(bad, OPTIONS);
    expect(q.run({ space: S, origin: "A" })).toEqual(evaluate(bad, { ...OPTIONS, space: S, origin: "A" }));
    expect(q.stats.fallbacks).toBe(1);
  });

  it("COMPILE.ERRORS: the generated code of a chain has one copy for each later argument", () => {
    const size = (count: number): number => {
      const g = generate(app("add", ...Array.from({ length: count }, (_x, i) => ref(`f${String(i)}`))), OPTIONS);
      return g.ok ? g.source.length : Number.NaN;
    };
    // A chain of 32 arguments is near 4 chains of 8 arguments: the size is linear in the arguments.
    expect(size(32)).toBeLessThan(size(8) * 4.5);
  });

  it("V-068 COMPILE.EXT: the search for extensions reads each body of a chain of functions once", () => {
    // V-068: `#mayExt` read the body of a function at each call. Each function here calls the next function twice, so the
    // search read the last body 2^16 times, before the limit of the calls could end the lowering.
    let reads = 0;
    const counted = {
      get tag(): "lit" {
        reads++;
        return "lit";
      },
      value: 1,
    } as Expr;
    const depth = 18;
    let e: Expr = app("ifError", app("add", nope, call("f0")), lit(0));
    for (let i = 0; i < depth; i++) {
      const next = call(`f${String(i + 1)}`);
      e = let_({ [`f${String(i)}`]: fn([], i === depth - 1 ? counted : app("add", next, next)) }, e);
    }
    expect(tiered(e, OPTIONS).tier).toBe(1);
    expect(reads).toBeLessThan(2 ** 17);
  });
});

/** The leaves of the generated programs: a value or an error with each code at some keys. */
const arbLeaf: fc.Arbitrary<Expr> = fc.constantFrom<Expr>(
  lit(1),
  lit(2),
  ref("n"),
  ref("t"),
  ref(["o", "p"]),
  ref(["o", "q"]),
  nope,
  text,
  app("nope", lit(1)),
  app("divide", ref("n"), lit(0)),
  app("boom"),
  app("nothing"),
  app("sqrt", lit(-1)),
  ref("n", [offset(1)]),
  ref("n", [index(lit(9))]),
  v("unbound"),
  call("unbound"),
  ext("cycle", null),
  ext("located", null),
  ext("throws", null),
  ext("none", null),
  ext("value", null),
);

/** Programs with each code in each context, so that errors meet in #ARGS, in a binding, in a list and in the memo. */
const arbProgram: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => {
  const e = tie("e");
  const list = fc.tuple(fc.constantFrom("sum", "count", "mean", "min", "max", "first", "reduce", "any"), fc.boolean(), e).map(([op, strict, body]): Expr => {
    const options = strict ? [lit({ strict: true })] : [];
    return app(op, ...(op === "reduce" ? [all(body), lit("add"), ...options] : [all(body), ...options]));
  });
  return {
    e: fc.oneof(
      { maxDepth: 4, depthSize: "medium" },
      arbLeaf,
      fc.tuple(e, e).map(([a, b]) => app("add", a, b)),
      fc.tuple(e, e, e).map(([a, b, c]) => app("multiply", a, b, c)),
      fc.tuple(e, e, e).map(([a, b, c]) => rec({ a, b, c })),
      fc.tuple(e, e).map(([a, b]) => app("ifError", a, b)),
      fc.tuple(e, e, e).map(([c, a, b]) => app("if", app("gt", c, lit(1)), a, b)),
      fc.tuple(e, e).map(([a, b]) => let_({ x: a }, app("add", v("x"), b))),
      fc.tuple(e, e).map(([a, b]) => let_({ x: a, y: b }, rec({ p: v("x"), q: v("y") }))),
      fc.tuple(e, e).map(([a, b]) => let_({ f: fn(["p", "q"], app("add", v("p"), v("q"), a)) }, call("f", a, b))),
      fc.tuple(e, e).map(([a, b]) => iterate(2, { x: a }, { x: app("add", v("x"), b) }, v("x"))),
      fc.tuple(e, e).map(([a, b]) => fold(axes.all, { x: a }, { x: app("add", v("x"), b) }, v("x"))),
      list,
    ),
  };
}).e;

describe("P17 COMPILE.ERRORS: generated programs with each code", () => {
  it("P17 COMPILE.ERRORS CALL.ARGS REC.FIELDS: a tiered program gives the error of the interpreter, in each field", () => {
    fc.assert(
      fc.property(arbProgram, fc.constantFrom(...S.keys), (e, origin) => {
        const p = tiered(e, OPTIONS);
        expect(p.run(runOf(S, origin))).toEqual(evaluate(e, { ...OPTIONS, ...runOf(S, origin) }));
      }),
      { numRuns: 1500 },
    );
  });

  it("COMPILE.ERRORS: the sample has each code and #ARGS, and tier 2 gives most of the errors", () => {
    const codes = new Map<string, number>();
    let errors = 0;
    let fast = 0;
    for (const [e, origin] of fc.sample(fc.tuple(arbProgram, fc.constantFrom(...S.keys)), { seed: 20261103, numRuns: 1000 })) {
      const p = tiered(e, OPTIONS);
      const r = p.run(runOf(S, origin));
      if (r.ok) continue;
      codes.set(r.error.code, (codes.get(r.error.code) ?? 0) + 1);
      errors++;
      if (p.stats.fallbacks === 0) fast++;
    }
    for (const code of ["#ARGS", "#N/A", "#NAME?", "#REF!", "#VALUE!", "#NUM!", "#CALC!", "#CYCLE!"]) expect(codes.get(code) ?? 0, code).toBeGreaterThan(0);
    expect(fast / errors).toBeGreaterThan(0.9);
  });
});

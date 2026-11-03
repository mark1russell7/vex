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

/** A record with the mark `bad`, whose check throws. */
interface Marked {
  readonly bad: boolean;
}

const BadDomain = defineDomain({
  name: "bad",
  is: (u: unknown): u is Marked => typeof u === "object" && u !== null && "bad" in u,
  valid: (x: Marked): boolean => {
    if (x.bad) throw new Error("no check");
    return Object.keys(x).length === 1;
  },
  fromScalar: (n: number): Marked => {
    if (n < 0) throw new Error("no lift");
    return { bad: false };
  },
  ops: {
    wrong: { fn: (): Marked => ({ bad: false, extra: 1 }) as Marked },
    both: { fn: (_self: Marked, other: Marked): Marked => other, liftScalar: true, params: ["domain"] },
  },
});

const FNS: Readonly<Record<string, FreeFn>> = {
  boom: (): never => {
    throw new Error("boom");
  },
  nothing: (): undefined => undefined,
  infinite: (): number => Number.POSITIVE_INFINITY,
  badValue: (): unknown => ({ bad: false, extra: 1 }),
  make: (bad: unknown): Marked => ({ bad: bad === true }),
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

/** This function checks a program with `direct`, and that it gives an error at a key. */
function fails(e: Expr, s: Space = S, vars?: Readonly<Record<string, unknown>>): void {
  expect(direct(e, s, vars).some((code) => code !== "value")).toBe(true);
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
    fails(v("x"));
    direct(v("x"), S, { x: 1 });
    fails(let_({ f: fn([], lit(1)) }, v("f")));
    fails(call("f"));
    fails(call("x"), S, { x: 1 });
    // A property of the prototype of the variables is no variable.
    fails(call("toString"), S, {});
    fails(let_({ x: lit(1) }, call("x")));
    fails(let_({ x: nope }, call("x")));
    fails(let_({ f: fn(["a"], v("a")) }, call("f")));
    fails(let_({ f: fn(["a"], app("add", v("a"), nope)) }, call("f", lit(1))));
  });

  it("COMPILE.ERRORS: the fields of a record", () => {
    fails(nope);
    fails(ref(["o", "p"]));
    fails(ref(["o", "p", "z"]));
    fails(ref("u"));
    fails(ref("__proto__"));
    fails(ref(["o", "__proto__", "x"]));
    fails(ref("nope", [key("A")]));
    direct(ref("n", []));
  });

  it("COMPILE.ERRORS: a record that is not an object, and a key without a record", () => {
    const s = space.array([1, 2]);
    fails(ref("x"), s);
    const holes = space.record({ A: undefined, B: { x: 1 } });
    fails(ref("x"), holes);
  });

  it("COMPILE.ERRORS: the addresses and the axes", () => {
    const g = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
    fails(ref("n", [offset(1)]), g);
    fails(ref("n", [index(lit(9))]), g);
    fails(ref("n", [index(text)]), g);
    fails(ref("n", [key("Z")]), g);
    fails(ref("n", [index(nope)]), g);
    fails(ref("n", [index(nope), index(text)]), g);
    fails(ref("n", [offset(1), offset(1)]), g);
    fails(ref([], [offset(1)]), g);
    fails(app("sum", each(axes.table("nope"), ref("n"))));
    direct(app("sum", each(axes.table("T"), ref("n"))));
    direct(app("sum", each(axes.window(0, 1), ref("n"))));
  });

  it("COMPILE.ERRORS: the tests of the axes", () => {
    fails(app("sum", each(axes.where(axes.all, ref("n")), ref("n"))));
    fails(app("sum", each(axes.where(axes.all, nope), ref("n"))));
    fails(fold(axes.where(axes.all, ref("t")), { a: lit(0) }, { a: lit(1) }, v("a")));
    fails(fold(axes.all, { a: lit(0) }, { a: app("add", v("a"), nope) }, v("a")));
    fails(fold(axes.all, { a: nope, b: text }, { a: lit(0), b: lit(0) }, v("a")));
  });

  it("COMPILE.ERRORS: the tests of iterate, and its limit", () => {
    const step = { a: app("add", v("a"), lit(1)) };
    fails(iterate(2, { a: lit(0) }, step, v("a"), lit(1)));
    fails(iterate(2, { a: lit(0) }, step, v("a"), app("gt", v("a"), lit(9))));
    direct(iterate(2, { a: lit(0) }, step, v("a")));
    fails(iterate(2, { a: nope }, step, v("a")));
    fails(iterate(2, { a: lit(0) }, { a: nope }, v("a")));
    fails(iterate(2, { a: nope, b: text }, { a: lit(0), b: lit(0) }, v("a")));
  });

  it("COMPILE.ERRORS: if, and, or and ifError", () => {
    fails(app("if"));
    fails(app("if", lit(1), lit(2), lit(3)));
    fails(app("if", lit(true)));
    fails(app("if", lit(false), lit(1)));
    fails(app("if", app("gt", ref("n"), lit(1)), nope, text));
    fails(app("and"));
    fails(app("or"));
    fails(app("and", lit(true), lit(1)));
    fails(app("or", lit(false), text));
    fails(app("ifError"));
    fails(app("ifError", nope));
    fails(app("ifError", nope, app("add", text, lit(1))));
    fails(app("ifError", nope, nope));
  });

  it("COMPILE.ERRORS: the failures of an op", () => {
    fails(app("nope", lit(1)));
    fails(app("nope"));
    fails(app("nope", lit({ odd: 1 })));
    fails(app("add", lit(new Vec2(1, 2)), lit("x")));
    fails(app("divide", lit(1), lit(0)));
    fails(app("boom"));
    fails(app("nothing"));
    fails(app("infinite"));
    fails(app("badValue"));
    fails(app("wrong", app("make", lit(false))));
    fails(app("make", lit(true)));
    fails(app("both", app("make", lit(false)), lit(-1)));
    fails(app("both", app("make", lit(false)), lit("x")));
    direct(app("both", app("make", lit(false)), lit(1)));
    // A number that a domain does not accept as valid is finite, so its error is not #NUM! of a number.
    fails(app("wrong", lit(1)));
  });

  it("COMPILE.ERRORS: the kinds of the arguments of an op with a static site", () => {
    fails(app("add", ref("n"), text));
    fails(app("sqrt", app("subtract", lit(0), ref("n"))));
    fails(app("gt", ref("t"), lit(1)));
  });

  it("COMPILE.ERRORS: the list ops", () => {
    fails(app("sum", all(ref("t"))));
    fails(app("mean", all(ref("t"))));
    fails(app("min", all(ref("t"))));
    fails(app("max", all(text)));
    fails(app("any", all(ref("n"))));
    fails(app("all", all(text)));
    fails(app("none", all(text)));
    fails(app("mean", all(nope)));
    fails(app("min", all(nope)));
    fails(app("max", all(nope)));
    fails(app("first", all(nope)));
    fails(app("sum", all(lit(1e308))));
    fails(app("mean", all(lit(1e308))));
    fails(app("reduce", all(ref("n")), lit("nope")));
    direct(app("reduce", all(ref("n")), lit("divide"), lit({ strict: false })));
  });

  it("COMPILE.FALLBACK COMPILE.ERRORS: a failed argument after the list of a list op goes to tier 1", () => {
    const e = app("sum", all(ref("n")), nope);
    const p = tiered(e, OPTIONS);
    expect(p.run(runOf(S, "A"))).toEqual(evaluate(e, { ...OPTIONS, ...runOf(S, "A") }));
    expect(p.stats.fallbacks).toBe(1);
  });

  it("COMPILE.ERRORS: the extensions", () => {
    fails(ext("none", null));
    fails(ext("cycle", null));
    fails(ext("located", null));
    fails(ext("throws", null));
    fails(ext("thrown", null));
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
    p.explain(runOf(S, "A"));
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
    expect(direct(app("add", ref(["o", "p"]), ref(["o", "q"])))).toEqual(["#N/A", "#ARGS", "#N/A"]);
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

  it("COMPILE.ERRORS: past the limit of the copies, a node keeps no error, and tier 1 gives the result", () => {
    const wide = (x: Expr): Expr => app("add", x, x, x, x, x, x, x, x);
    const big = (x: Expr): Expr => wide(wide(wide(x)));
    const e = app("add", ...Array.from({ length: 7 }, () => big(ref("n"))), big(nope));
    // The first parts of the program use the copies, so the last part has none.
    expect(MAX_COPIED).toBeLessThan(585 * 7);
    const p = tiered(e, OPTIONS);
    expect(p.tier).toBe(2);
    expect(p.run(runOf(S, "A"))).toEqual(evaluate(e, { ...OPTIONS, ...runOf(S, "A") }));
    expect(p.stats.fallbacks).toBe(1);
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
    expect(fast / errors).toBeGreaterThan(0.7);
  });
});

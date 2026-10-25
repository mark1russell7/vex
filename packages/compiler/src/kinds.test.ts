/**
 * The kinds of the values of a program (docs/COMPILER.md §3.2). A literal, a field or a variable of the schema, and the
 * result of an op that declares `returns` have a known kind. An op site whose values have known kinds calls the
 * function of its op with no guard (KIND.STATIC). Each case compares the tiered program with the interpreter.
 */
import { app, axes, defineDomain, each, evaluate, ext, let_, lit, ref, space, v, type Expr, type FreeFn } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { factsOf } from "./facts.ts";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

// The third record breaks the schema: each of its fields has another kind.
const ROWS = space.array([
  { n: 1, s: "a", b: true },
  { n: 2, s: "b", b: false },
  { n: "3", s: 4, b: 1 },
]);
const SCHEMA = { fields: { n: "number", s: "string", b: "boolean" }, vars: { k: "number", t: "string" } } as const;
const FNS: Readonly<Record<string, FreeFn>> = { twice: (x: unknown): unknown => (typeof x === "number" ? x * 2 : x) };

/** A free function that gives its argument. */
const same: FreeFn = (x: unknown): unknown => x;
const OPTIONS: GenerateOptions = { domains: [NumDomain, BoolDomain, TextDomain], fns: FNS, schema: SCHEMA };

/** This function compares the tiered program with the interpreter at each key, and gives the number of fallbacks. */
function expectSame(e: Expr, options: GenerateOptions = OPTIONS, vars: Readonly<Record<string, unknown>> = { k: 2, t: "x" }): number {
  const p = tiered(e, options);
  for (const origin of ROWS.keys) {
    const run = { space: ROWS, origin, vars };
    expect(fromCore(p.run(run))).toStrictEqual(fromCore(evaluate(e, { ...options, ...run })));
  }
  return p.stats.fallbacks;
}

/** This function gives the number of static sites and of guarded sites in the source of a program. */
function sitesOf(e: Expr, options: GenerateOptions = OPTIONS): { readonly direct: number; readonly guarded: number; readonly source: string } {
  const g = generate(e, options);
  const source = g.ok ? g.source : "";
  return { direct: (source.match(/= f\d+_\d+\(/g) ?? []).length, guarded: (source.match(/S\d+: \{/g) ?? []).length, source };
}

const n = ref("n");
const s = ref("s");
const b = ref("b");
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);

describe("KIND.STATIC: an op site whose values have known kinds", () => {
  it("calls the function of its op, and a value against the schema goes to tier 1", () => {
    const e = op("multiply", op("add", n, lit(1)), v("k"));
    expect(sitesOf(e)).toMatchObject({ direct: 2, guarded: 0 });
    // The third record has a text for n, so its run goes to tier 1.
    expect(expectSame(e)).toBe(1);
    // A variable against the schema goes to tier 1 at each key.
    expect(expectSame(e, OPTIONS, { k: "2" })).toBe(3);
    // Without the schema, the kinds of n and k are not known.
    expect(sitesOf(e, { domains: OPTIONS.domains ?? [] })).toMatchObject({ direct: 0, guarded: 2 });
  });

  it("takes the op of the first domain of the kind of the receiver, also for the name of a list op and for texts and booleans", () => {
    const e = op("concat", op("upper", s), op("max", n, lit(5)));
    expect(sitesOf(e)).toMatchObject({ direct: 3, guarded: 0 });
    expect(expectSame(e)).toBe(1);
    const tests = op("and", op("eq", s, v("t")), op("xor", b, lit(true)));
    expect(sitesOf(tests)).toMatchObject({ direct: 2, guarded: 0 });
    expect(expectSame(tests)).toBe(1);
  });

  it("gives the error of the interpreter for an argument of a kind that the op does not accept", () => {
    const e = op("ifError", op("add", n, lit("x")), lit(7));
    expect(sitesOf(e).source).toContain("= F;");
    expect(expectSame(e)).toBe(1);
  });

  it("calls a free function when no domain of the kind has the op, and keeps the dispatch for a name with no op", () => {
    expect(sitesOf(op("twice", n))).toMatchObject({ direct: 0, guarded: 0 });
    expect(sitesOf(op("twice", n)).source).toContain(".free");
    expect(expectSame(op("twice", n))).toBe(1);
    expect(expectSame(op("ifError", op("nope", n), lit(0)))).toBe(1);
  });

  it("goes to tier 1 when an op gives a result of another kind than it declares", () => {
    const Liar = defineDomain({ name: "Liar", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { half: { fn: (a: number): unknown => String(a / 2), returns: "number" } } });
    expect(expectSame(op("half", n), { domains: [Liar], schema: SCHEMA })).toBe(3);
  });

  it("V-059 KIND.STATIC KIND.RETURNS: a site whose op gives a value of a domain stays in tier 2, with the checks of the interpreter", () => {
    // V-059: the site compared the JavaScript type of the result with the kind of a domain, so each run went to tier 1.
    const options = { domains: [NumDomain, XYDomain], schema: SCHEMA };
    const e = op("xy", n, v("k"));
    expect(sitesOf(e, options)).toMatchObject({ direct: 1, guarded: 0 });
    // Only the third record breaks the schema, so only its run goes to tier 1.
    expect(expectSame(e, options)).toBe(1);
    // A component that is not finite is not valid in XYDomain. The check of the result finds it, and tier 1 gives the error.
    expect(expectSame(e, options, { k: Number.POSITIVE_INFINITY, t: "x" })).toBe(3);
    // An op can give a value of another kind than it declares. The checks of the interpreter keep such a value too.
    const Liar = defineDomain({ name: "Liar", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { pt: { fn: (a: number): unknown => a * 2, returns: "domain:XY" } } });
    expect(expectSame(op("pt", n), { domains: [Liar, XYDomain], schema: SCHEMA })).toBe(1);
  });

  it("keeps the guards when a domain without a primitive type comes first, or when an op lifts a number", () => {
    expect(sitesOf(op("add", n, v("k")), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toMatchObject({ direct: 0, guarded: 1 });
    const Lifted = defineDomain({
      name: "Lifted",
      is: (u: unknown): u is number => typeof u === "number",
      primitive: "number",
      fromScalar: (x: number): number => x * 10,
      ops: { mix: { fn: (a: number, c: number): number => a + c, liftScalar: true, returns: "number" }, tag: { fn: (a: number, t: string): string => `${t}${a}`, liftScalar: true, params: ["string"], returns: "string" } },
    });
    const options = { domains: [Lifted], schema: SCHEMA };
    expect(sitesOf(op("mix", n, lit(1)), options)).toMatchObject({ direct: 0 });
    expect(expectSame(op("mix", n, lit(1)), options)).toBe(1);
    // A text is not lifted, so the site of tag is static.
    expect(sitesOf(op("tag", n, s), options)).toMatchObject({ direct: 1 });
    expect(expectSame(op("tag", n, s), options)).toBe(1);
  });

  it("accepts a value of the domain for a parameter of the kind domain, and checks a result of the kind any with the dispatch", () => {
    const Mix = defineDomain({ name: "Mix", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { mix: { fn: (a: number, c: number): unknown => (a > c ? a : String(c)), params: ["domain"], returns: "any" } } });
    const e = op("mix", n, v("k"));
    expect(sitesOf(e, { domains: [Mix], schema: SCHEMA })).toMatchObject({ direct: 1 });
    expect(expectSame(e, { domains: [Mix], schema: SCHEMA })).toBe(1);
    expect(sitesOf(op("mix", n, s), { domains: [Mix], schema: SCHEMA }).source).toContain("= F;");
  });

  it("checks a result with the domain of its kind: valid of that domain, the dispatch of the checks, or nothing", () => {
    const Short = defineDomain({
      name: "Short",
      is: (u: unknown): u is string => typeof u === "string",
      primitive: "string",
      valid: (x: string): boolean => x.length < 3,
      ops: { dup: { fn: (a: string): string => a + a, returns: "domain" } },
    });
    const dup = op("ifError", op("dup", op("dup", s)), lit("long"));
    expect(sitesOf(dup, { domains: [Short], schema: SCHEMA }).source).toContain(".valid(");
    expect(expectSame(dup, { domains: [Short], schema: SCHEMA })).toBe(1);
    // A domain without a primitive type comes before the booleans, so the checks of the result use the dispatch.
    const gt = op("not", op("gt", n, lit(1)));
    expect(sitesOf(gt, { domains: [NumDomain, Vec2Domain, BoolDomain], schema: SCHEMA }).source).toContain("d1.is(");
    expect(expectSame(gt, { domains: [NumDomain, Vec2Domain, BoolDomain], schema: SCHEMA })).toBe(1);
    // No domain accepts a boolean, so the result needs no check of a domain.
    expect(sitesOf(op("gt", n, lit(1)), { domains: [NumDomain], schema: SCHEMA }).source).not.toContain("d1");
    expect(expectSame(op("gt", n, lit(1)), { domains: [NumDomain], schema: SCHEMA })).toBe(1);
  });
});

describe("KIND.STATIC: the facts of a static site", () => {
  it("decides the op from the kinds only: a receiver of an unknown kind, a method of a kernel, a lift and a free function", () => {
    // A receiver without a kind has no static site, also when a free function has the name.
    expect(factsOf({ domains: [NumDomain], fns: FNS }).staticSite("twice", [undefined])).toBeUndefined();
    expect(factsOf({ domains: [NumDomain], fns: FNS }).staticSite("twice", ["number"])).toEqual({ t: "free" });
    expect(factsOf({ domains: [NumDomain] }).staticSite("twice", ["number"])).toBeUndefined();
    // A method of a domain without a primitive type is an op of the value, not a free function with the same name.
    type Span = { readonly lo: number; readonly hi: number };
    const Interval = defineDomain({ name: "Interval", is: (u: unknown): u is Span => typeof u === "object" && u !== null, ops: { span: {} } });
    expect(factsOf({ domains: [Interval], fns: { span: same } }).staticSite("span", ["domain:Interval"])).toBeUndefined();
    // A number argument of a lifting parameter needs the dispatch. A boolean argument does not lift, so it is a bad argument.
    const Lifted = defineDomain({
      name: "Lifted",
      is: (u: unknown): u is Span => typeof u === "object" && u !== null,
      fromScalar: (x: number): Span => ({ lo: x, hi: x }),
      ops: { mix: { fn: (a: Span, _b: Span, _c: Span): Span => a, liftScalar: [false, true], params: ["domain", "domain"], returns: "domain" } },
    });
    const facts = factsOf({ domains: [Lifted] });
    expect(facts.staticSite("mix", ["domain:Lifted", "domain:Lifted", "number"])).toBeUndefined();
    expect(facts.staticSite("mix", ["domain:Lifted", "domain:Lifted", "boolean"])).toEqual({ t: "fn", domain: 0, bad: true, returns: "domain:Lifted" });
  });

  it("KIND.RETURNS: an op that declares a result of another domain gives the kind of that domain", () => {
    expect(factsOf({ domains: [NumDomain, XYDomain] }).staticSite("xy", ["number", "number"])).toEqual({ t: "fn", domain: 0, bad: false, returns: "domain:XY" });
    expect(factsOf({ domains: [NumDomain, XYDomain] }).checkOf("domain:XY")).toBe(1);
  });
});

describe("KIND.STATIC: the kinds go through the forms, the bindings, the list ops and the memo", () => {
  const cases: readonly (readonly [string, Expr, number])[] = [
    ["if with two numbers", op("add", op("if", b, n, lit(0)), lit(1)), 1],
    ["ifError with two numbers", op("add", op("ifError", op("divide", n, lit(0)), lit(0)), lit(1)), 2],
    ["and and or give booleans", op("not", op("or", op("and", b, b), b)), 1],
    ["a binding", let_({ x: op("add", n, lit(1)) }, op("multiply", v("x"), lit(2))), 2],
    ["a sum, a count, a mean, a min and a max", op("add", op("add", op("sum", each(axes.all, n)), op("count", each(axes.all, n))), op("add", op("mean", each(axes.all, n)), op("min", each(axes.all, n)))), 3],
    ["any, all and none", op("and", op("not", op("any", each(axes.all, b))), op("not", op("none", each(axes.all, b)))), 2],
    ["a node of the memo", op("add", op("max", each(axes.where(axes.all, b), n)), lit(1)), 1],
  ];
  it.each(cases)("%s", (_name, e, direct) => {
    expect(sitesOf(e)).toMatchObject({ direct, guarded: 0 });
    expectSame(e);
  });

  it("an if with two kinds, a record and an extension have no kind", () => {
    expect(sitesOf(op("add", op("if", b, n, s), lit(1)))).toMatchObject({ direct: 0, guarded: 1 });
    expect(sitesOf(op("add", ref("missing.x"), lit(1)))).toMatchObject({ direct: 0, guarded: 1 });
    expect(sitesOf(op("add", ext("note", null), lit(1)), { ...OPTIONS, extensions: { note: () => ({ ok: true, value: 1 }) } })).toMatchObject({ direct: 0, guarded: 1 });
    expectSame(op("ifError", op("add", op("if", b, n, s), lit(1)), lit(0)));
  });
});

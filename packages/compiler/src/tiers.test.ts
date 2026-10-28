import { app, axes, call, defineDomain, each, evaluate, ext, fn, fold, index, isVexList, iterate, key, let_, lit, offset, ok, rec, ref, space, toDocument, v as variable, vexList, type Addr, type Axis, type Expr, type ExtHandler, type FreeFn, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbChain, arbExpr, arbLiteral, arbOrigin, arbSpace, fromCore, fromReference, modelChain, referenceEvaluate, type ModelOptions } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule } from "./module.ts";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;

/** An extension handler that gives the path of its node, as a text. */
const pathOf: ExtHandler = (_data, ctx) => ok(ctx.path.join("."));

/** An extension handler that gives the last number of the path of its node: the index of the node in its parent. */
const lastOf: ExtHandler = (_data, ctx) => ok(ctx.path.at(-1) ?? -1);

/** An extension handler that gives the length of the path of its node: its depth. */
const depthOf: ExtHandler = (_data, ctx) => ok(ctx.path.length);

/** A program with `count` calls of one function. */
const calls = (count: number): Expr => let_({ f: fn(["x"], app("add", variable("x"), ref("n"))) }, rec(Object.fromEntries(Array.from({ length: count }, (_x, i) => [`c${String(i)}`, call("f", lit(i))]))));

/** A position from the text of a path: its length, modulo 3, the number of keys of the test. */
const positionOf = (x: Expr): Expr => app("mod", app("length", x), lit(3));
/** The reduction of the field q of each key with the op `op`. */
const total = (op: string): Expr => app("reduce", each(axes.all, ref("q")), lit(op));
const vec = fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })).map(([x, y]) => new Vec2(x, y));
const OPS = ["add", "subtract", "scale", "length", "dot", "divide", "multiply", "anyNonPositive", "gt", "not", "and"];
const OPTS = { domainValue: vec, ops: OPS };

/** The free functions. `length` has the name of an op of Vec2, so the op of the domain comes first. */
const FNS: Readonly<Record<string, FreeFn>> = {
  twice: (x: unknown): unknown => (typeof x === "number" ? x * 2 : x),
  pick: (x: unknown, y: unknown): unknown => y ?? x,
  boom: (): never => {
    throw new Error("boom");
  },
  length: (): number => 42,
};

const CHAINS = (keys: readonly string[]): ModelOptions => ({
  keys,
  paths: ["p", "q", "n", "s", "b", "nested.x", "missing", "", "__proto__"],
  ops: ["add", "subtract", "scale", "length", "dot", "distance", "halve", "maxComponent", "anyNonPositive", "multiply", "gt", "abs", "max", "negate", "not", "nope"],
  fns: ["twice", "pick", "boom", "length", "unknown"],
  reduceOps: ["add", "max", "nope"],
  reductions: ["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "keys", "errors", "first", "reduce"],
  depth: 2,
});

const LIST_OPS = ["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "keys", "errors", "first", "reduce"] as const;
const AXES: readonly Axis[] = [
  { t: "all" },
  { t: "others" },
  { t: "neighbors", n: 8 },
  { t: "children" },
  { t: "descendants" },
  { t: "window", from: -1, to: 1 },
  { t: "table", name: "T" },
  { t: "successors" },
  { t: "reachable" },
];

/** A list op over a direct `each`, sometimes under a `let`, with a body and a test from the whole grammar. */
const arbListProgram: fc.Arbitrary<Expr> = fc
  .tuple(
    fc.constantFrom(...LIST_OPS),
    fc.constantFrom(...AXES),
    fc.oneof(
      {
        weight: 3,
        arbitrary: fc.constantFrom<Expr>(
          { tag: "ref", path: ["n"] },
          { tag: "ref", path: ["b"] },
          { tag: "ref", path: ["p"] },
          { tag: "app", op: "length", args: [{ tag: "ref", path: ["p"] }] },
          // The origin: in the axis table, the origin is the target (AXIS.TABLE).
          { tag: "ref", path: ["n"], at: [{ t: "origin" }] },
        ),
      },
      { weight: 1, arbitrary: arbExpr({ ...OPTS, maxDepth: 2 }) },
    ),
    fc.option(fc.oneof(fc.constant<Expr>({ tag: "ref", path: ["b"] }), arbExpr({ ...OPTS, maxDepth: 2 })), { nil: undefined }),
    fc.constantFrom<readonly Expr[]>([], [{ tag: "lit", value: { strict: true } }], [{ tag: "lit", value: "add" }], [{ tag: "lit", value: "max" }, { tag: "lit", value: null }]),
    fc.boolean(),
    // An address: an offset and an index can fail at some keys (V-051).
    fc.constantFrom<Addr | undefined>(undefined, undefined, [{ t: "offset", d: [1] }], [{ t: "index", i: 1 }], [{ t: "origin" }]),
  )
  .map(([op, axis, body, test, rest, bind, at]): Expr => {
    const items: Expr = { tag: "each", axis: test === undefined ? axis : { t: "where", axis, test }, body, ...(at === undefined ? {} : { at }) };
    const list: Expr = bind ? { tag: "let", bind: { a: { tag: "ref", path: ["n"] } }, body: items } : items;
    return { tag: "app", op, args: [list, ...rest] };
  });

/** A list op over all with a key: the body or the test of where reads a field at the origin (COMPILE.GROUP). */
const arbKeyedProgram: fc.Arbitrary<Expr> = fc
  .tuple(fc.constantFrom(...LIST_OPS), fc.constantFrom("n", "p", "b"), fc.constantFrom("n", "p", "b"), fc.boolean(), fc.constantFrom("add", "gt", "subtract"))
  .map(([op, f, g, inTest, combine]): Expr => {
    const atOrigin: Expr = { tag: "ref", path: [f], at: [{ t: "origin" }] };
    const both: Expr = { tag: "app", op: combine, args: [{ tag: "ref", path: [g] }, atOrigin] };
    const axis: Axis = inTest ? { t: "where", axis: { t: "all" }, test: both } : { t: "all" };
    return { tag: "app", op, args: [{ tag: "each", axis, body: inTest ? { tag: "ref", path: [g] } : both }, ...(op === "reduce" ? [{ tag: "lit", value: "add" } as Expr] : [])] };
  });

/** A program over the numbers of the field n and the variable a: with a schema, most of its op sites are static. */
const arbNumeric: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { maxDepth: 3, depthSize: "small" },
    fc.integer({ min: -3, max: 3 }).map((x): Expr => ({ tag: "lit", value: x })),
    fc.constantFrom<Expr>({ tag: "ref", path: ["n"] }, { tag: "ref", path: ["n"], at: [{ t: "origin" }] }, { tag: "var", name: "a" }),
    fc.tuple(fc.constantFrom("add", "subtract", "multiply", "max", "divide"), tie("e"), tie("e")).map(([op, a, b]): Expr => ({ tag: "app", op, args: [a, b] })),
    fc.tuple(tie("e"), tie("e"), tie("e")).map(([c, a, b]): Expr => ({ tag: "app", op: "if", args: [{ tag: "app", op: "gt", args: [c, { tag: "lit", value: 0 }] }, a, b] })),
    tie("e").map((x): Expr => ({ tag: "app", op: "sum", args: [{ tag: "each", axis: { t: "others" }, body: x }] })),
    tie("e").map((x): Expr => ({ tag: "app", op: "ifError", args: [x, { tag: "lit", value: 0 }] })),
  ),
})).e;

const tables = arbSpace(vec).map((t): Readonly<Record<string, Space>> => ({ T: t }));
const vars = fc.option(fc.record({ a: arbLiteral(vec), c: arbLiteral(vec) }), { nil: undefined });

/** A space, an origin, the tables and the variables, for an expression. */
const runOf = <E,>(e: fc.Arbitrary<E>) => arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), e, arbOrigin(s), tables, vars));

/**
 * This function checks that the tiered program gives the result of the interpreter, and that both give the result of
 * the reference tier: the kernel of coeval (EVAL.REFERENCE). It counts the runs with a value, and the runs where tier 2
 * gave the value. Tier 2 makes no error values, so a list with an error item does not count.
 */
function agree(e: Expr, s: Space, k: string, t: Readonly<Record<string, Space>>, v: Readonly<Record<string, unknown>> | undefined, count: { values: number; fast: number }, options: GenerateOptions = { domains: DOMAINS, fns: FNS }): void {
  const p = tiered(e, options);
  const run = { space: s, origin: k, tables: t, ...(v === undefined ? {} : { vars: v }) };
  const expected = evaluate(e, { ...options, ...run });
  expect(fromCore(p.run(run))).toStrictEqual(fromCore(expected));
  expect(fromReference(referenceEvaluate(e, { ...options, ...run }))).toStrictEqual(fromCore(expected));
  if (expected.ok && !(isVexList(expected.value) && expected.value.items.some((item) => !item.result.ok))) {
    count.values++;
    if (p.tier === 2 && p.stats.fallbacks === 0) count.fast++;
  }
}

/**
 * This function gives the share of the values that tier 2 gave, on a fixed sample of runs. The share is the same in each
 * test run, so a change of the generators that lowers it fails at once, on the change that causes it.
 */
function shareOfTier2(runs: ReturnType<typeof runOf<Expr>>): number {
  const count = { values: 0, fast: 0 };
  for (const [s, e, k, t, v] of fc.sample(runs, { seed: 20261024, numRuns: 200 })) agree(e, s, k, t, v, count);
  return count.fast / count.values;
}

describe("the tiers", () => {
  // In each property, a fallback gives the right result too. Thus the share of tier 2 shows a gap that the equality cannot show.
  it("P17 COMPILE.TIERED EVAL.REFERENCE: on programs of the whole grammar, a tiered program gives the result of the interpreter and of the kernel", () => {
    const runs = runOf(arbExpr(OPTS));
    fc.assert(fc.property(runs, ([s, e, k, t, v]) => agree(e, s, k, t, v, { values: 0, fast: 0 })));
    expect(shareOfTier2(runs)).toBeGreaterThan(0.5);
  });

  it("P17 COMPILE.TIERED: on the programs of the builder, a tiered program gives the result of the interpreter", () => {
    const runs = arbSpace(vec).chain((s) => runOf(arbChain(CHAINS(s.keys)).map(modelChain)));
    fc.assert(fc.property(runs, ([s, e, k, t, v]) => agree(e, s, k, t, v, { values: 0, fast: 0 })));
    expect(shareOfTier2(runs)).toBeGreaterThan(0.5);
  });

  it("P17 COMPILE.MEMO: one program at each key of each space, twice, gives the result of the interpreter at each key", () => {
    const programs = fc.oneof(arbExpr(OPTS), arbListProgram, arbKeyedProgram, arbKeyedProgram.map((e): Expr => ({ tag: "app", op: "add", args: [{ tag: "ref", path: ["n"] }, e] })));
    fc.assert(
      fc.property(programs, fc.array(arbSpace(vec), { minLength: 1, maxLength: 3 }), tables, (e, spaces, t) => {
        const options = { domains: DOMAINS, fns: FNS };
        const p = tiered(e, options);
        for (const s of [...spaces, ...spaces]) {
          for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k, tables: t }))).toStrictEqual(fromCore(evaluate(e, { ...options, space: s, origin: k, tables: t })));
        }
      }),
    );
  });

  it("P17 KIND.STATIC: with the domains of primitive types first and a schema, a tiered program gives the result of the interpreter", () => {
    // The records of the spaces often break the schema: then a run goes to tier 1.
    const options: GenerateOptions = { domains: [NumDomain, BoolDomain, TextDomain, Vec2Domain], fns: FNS, schema: { fields: { n: "number", b: "boolean", s: "string" }, vars: { a: "number", c: "boolean" } } };
    const count = { values: 0, fast: 0 };
    const runs = runOf(fc.oneof(arbExpr(OPTS), arbListProgram, arbKeyedProgram, arbNumeric, arbNumeric));
    fc.assert(
      fc.property(runs, ([s, e, k, t, v]) => {
        agree(e, s, k, t, v, count, options);
      }),
    );
    // Some programs have static sites. A fixed sample gives the same count in each run, so a change of the generators fails at once.
    const direct = fc.sample(runs, { seed: 20261024, numRuns: 200 }).filter(([, e]) => {
      const g = generate(e, options);
      return g.ok && /= f\d+_\d+\(/.test(g.source);
    });
    expect(direct.length).toBeGreaterThan(20);
  });

  it("COMPILE.MEMO V-051: the axis all with an address that fails at some keys gives the error at those keys", () => {
    // V-051: the memo took the list op as a value of the space, so tier 2 gave the value of the first key at each key.
    const s = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
    for (const at of [[{ t: "offset", d: [1] }], [{ t: "offset", d: [-1] }], [{ t: "index", i: 1 }]] as const satisfies readonly Addr[]) {
      const e: Expr = { tag: "app", op: "count", args: [{ tag: "each", axis: { t: "all" }, body: { tag: "ref", path: ["n"] }, at }] };
      const p = tiered(e, { domains: DOMAINS });
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { domains: DOMAINS, space: s, origin: k })));
    }
  });

  it("COMPILE.MEMO V-052: a move from the focus before a fixed key can fail, so the address reads the focus", () => {
    // V-052: the memo took an address that ends with a fixed key as a fixed key. At the last key, offset(1) fails.
    const s = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
    const loop: Expr = { tag: "app", op: "sum", args: [{ tag: "each", axis: { t: "all" }, body: { tag: "ref", path: ["n"] } }] };
    const addresses = [
      [{ t: "offset", d: [1] }, { t: "key", key: "0" }],
      [{ t: "offset", d: [-1] }, { t: "index", i: 0 }],
      [{ t: "offset", d: [1] }, { t: "origin" }],
      [{ t: "offset", d: [1] }, { t: "index", i: { tag: "lit", value: 0 } }],
      [{ t: "origin" }, { t: "offset", d: [1] }, { t: "key", key: "1" }],
    ] as const satisfies readonly Addr[];
    for (const at of addresses) {
      const e: Expr = { tag: "rec", fields: { loop, moved: { tag: "ref", path: ["n"], at } } };
      const all: Expr = { tag: "app", op: "count", args: [{ tag: "each", axis: { t: "all" }, body: { tag: "ref", path: ["n"] }, at }] };
      for (const x of [e, all]) {
        const p = tiered(x, { domains: DOMAINS });
        for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(x, { domains: DOMAINS, space: s, origin: k })));
      }
    }
  });

  it("V-062 REC.FIELDS: tier 2 makes a field __proto__ an own field of the record, as the interpreter does", () => {
    // V-062: an assignment of the key __proto__ set the prototype of the new record, so the field was lost.
    const s = space.array([{ n: 1 }, { n: 2 }]);
    const e = rec(JSON.parse('{"__proto__":{"tag":"ref","path":["n"]},"m":{"tag":"lit","value":3}}') as Readonly<Record<string, Expr>>);
    expect(generate(e, { domains: DOMAINS }).ok).toBe(true);
    const p = tiered(e, { domains: DOMAINS });
    for (const [i, k] of s.keys.entries()) {
      const got = p.run({ space: s, origin: k });
      expect(fromCore(got)).toStrictEqual(fromCore(evaluate(e, { domains: DOMAINS, space: s, origin: k })));
      const out = got.ok ? got.value : undefined;
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toBe(i + 1);
    }
    expect(p.stats).toEqual({ runs: 2, fallbacks: 0 });
  });

  it("V-064 LIST.ARRAY COMPILE.TIERED: a list op on an array in the body of a list op goes to tier 1, so the item stays", () => {
    // V-064: the runtime gave FALLBACK for a list op on an array. In the loop of count, FALLBACK is an error item, so
    // tier 2 skipped each item and gave 0. The property P17 found the first two programs.
    const s = space.record({ A: { fr: [1, 2] }, B: { fr: [] }, C: { fr: [3] } });
    const empty = lit([]);
    const programs: readonly Expr[] = [
      app("count", each(axes.all, app("sum", let_({ b: empty }, empty)))),
      app("count", each(axes.all, rec({ x: app("keys", empty), y: lit(null) }))),
      app("sum", each(axes.all, app("sum", ref("fr")))),
      app("count", each(axes.all, app("keys", ref("fr")))),
    ];
    const values = [3, 3, 6, 3];
    for (const [i, e] of programs.entries()) {
      const p = tiered(e, { domains: DOMAINS });
      expect(p.tier).toBe(2);
      for (const k of s.keys) {
        const got = fromCore(p.run({ space: s, origin: k }));
        expect(got).toStrictEqual(fromCore(evaluate(e, { domains: DOMAINS, space: s, origin: k })));
        expect(got).toStrictEqual({ ok: true, value: values[i] });
      }
      expect(p.stats.fallbacks).toBe(s.keys.length);
    }
    // A function of the host with the name of the list op comes first, and an op that is not a list op is an error item.
    // Tier 2 gives these values itself.
    const fns: Readonly<Record<string, FreeFn>> = { keys: () => 1 };
    const own: readonly (readonly [Expr, number])[] = [
      [app("sum", each(axes.all, app("keys", ref("fr")))), 3],
      [app("count", each(axes.all, app("add", ref("fr"), lit(1)))), 0],
    ];
    for (const [e, value] of own) {
      const p = tiered(e, { domains: DOMAINS, fns });
      for (const k of s.keys) {
        const got = fromCore(p.run({ space: s, origin: k }));
        expect(got).toStrictEqual(fromCore(evaluate(e, { domains: DOMAINS, fns, space: s, origin: k })));
        expect(got).toStrictEqual({ ok: true, value });
      }
      expect(p.stats.fallbacks).toBe(0);
    }
  });

  it("COMPILE.TIERED: an extension in each part of a loop and of an address gets the path of its node", () => {
    // The handler "where" gives the path of its node, so a wrong path in tier 2 gives another value than the interpreter.
    const w = ext("where", null);
    const last = ext("last", null);
    const s = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);
    const e = rec({
      iterate: iterate(2, { a: w, b: w }, { a: app("concat", variable("a"), w) }, app("concat", app("concat", variable("a"), w), variable("b"))),
      until: iterate(3, { a: lit("") }, { a: app("concat", variable("a"), w) }, app("concat", variable("a"), w), app("gt", app("length", app("concat", variable("a"), w)), lit(4))),
      fold: fold(axes.where(axes.all, app("eq", app("length", w), lit(1))), { a: w }, { a: app("concat", variable("a"), w) }, app("concat", variable("a"), w), [index(positionOf(w))]),
      each: app("values", each(axes.all, w, [index(positionOf(w))])),
      ref: ref("n", [key(app("concat", lit(""), positionOf(w))), offset(0)]),
      keyed: ref("n", [index(positionOf(w))]),
      // Two computed moves in one address, and a where test before a computed address.
      twice: ref("n", [index(positionOf(w)), index(positionOf(w))]),
      tested: app("values", each(axes.where(axes.all, app("gt", app("length", w), lit(0))), w, [index(positionOf(w))])),
      // The index of a node in its parent: the steps of two names, and an address after a where test.
      steps: iterate(2, { a: lit(0), b: lit(0) }, { a: last, b: last }, app("add", variable("a"), app("multiply", variable("b"), lit(100)))),
      // The test until is at the depth 2 of the part, or deeper: then the iteration makes no step.
      stop: iterate(3, { a: lit(0) }, { a: app("add", variable("a"), lit(1)) }, variable("a"), app("gte", ext("depth", null), lit(2))),
      after: app("values", each(axes.where(axes.others, app("gt", ref("n"), lit(0))), ref("n"), [index(last)])),
    });
    const options = { domains: [NumDomain, TextDomain, BoolDomain], extensions: { where: pathOf, last: lastOf, depth: depthOf } };
    // Each part alone: tier 2 gives each value, so a fallback does not hide a wrong path.
    for (const part of [e, ...Object.values(e.fields)]) {
      const p = tiered(part, options);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(part, { ...options, space: s, origin: k })));
      expect([p.tier, p.stats.fallbacks]).toEqual([2, 0]);
    }
  });

  it("FN.CALL: tier 2 puts the body of a function at each call, and an extension in the body gets the path of the body", () => {
    const s = space.array([
      { n: 1, w: "a" },
      { n: -2, w: "bc" },
      { n: 3, w: "" },
    ]);
    const options = { domains: [NumDomain, TextDomain, BoolDomain], extensions: { where: pathOf } };
    const bind = {
      tag: fn(["x"], app("concat", variable("x"), ext("where", null))),
      plus: fn(["x", "y"], app("add", variable("x"), app("multiply", variable("y"), ref("n")))),
      k: lit(10),
    };
    const parts: Readonly<Record<string, Expr>> = {
      once: call("tag", ref("w")),
      loop: app("sum", each(axes.all, call("plus", ref("n"), variable("k")))),
      fold: fold(axes.reverse(axes.all), { a: lit(0) }, { a: call("plus", variable("a"), lit(1)) }, variable("a")),
      // The body of g sees k of the place of its binding, not k of the place of the call.
      nested: let_({ g: fn(["z"], call("plus", variable("z"), variable("k"))) }, let_({ k: lit(1000) }, call("g", lit(2)))),
      // A name of a loop hides the function plus, and a function of an inner let hides the value k.
      hidden: iterate(2, { plus: lit(1) }, { plus: app("add", variable("plus"), lit(1)) }, variable("plus")),
      shadow: let_({ k: fn([], lit(7)) }, call("k")),
      // An extension in an argument gets the path of the argument.
      path: call("tag", ext("where", null)),
    };
    for (const part of Object.values(parts)) {
      const e = let_(bind, part);
      const p = tiered(e, options);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { ...options, space: s, origin: k })));
      expect([p.tier, p.stats.fallbacks]).toEqual([2, 0]);
    }
    // A call with the wrong number of arguments, a call of a value, a function as a value and a call of a hidden function go to tier 1.
    // Tier 2 has code for each of them: the code goes to tier 1 at the call. A variable with the name of a function does
    // not hide the function.
    for (const part of [call("plus", lit(1)), call("k"), variable("tag"), iterate(1, { tag: lit(0) }, { tag: lit(1) }, call("tag", lit(1)))]) {
      const e = let_(bind, part);
      expect(generate(e, options).ok).toBe(true);
      const r = tiered(e, options).run({ space: s, origin: "0", vars: { tag: 5 } });
      expect(fromCore(r)).toStrictEqual(fromCore(evaluate(e, { ...options, space: s, origin: "0", vars: { tag: 5 } })));
      expect(r.ok).toBe(false);
    }
  });

  it("FN.CALL: tier 2 puts the bodies of functions in at most 10000 places, and tier 1 evaluates a program with more", () => {
    const s = space.array([{ n: 1 }]);
    const reason = "the calls put the bodies of functions in more than 10000 places";
    expect(generate(calls(10_000), { domains: DOMAINS }).ok).toBe(true);
    expect(generate(calls(10_001), { domains: DOMAINS })).toEqual({ ok: false, reason });
    // Each function calls the one before it twice, so the program puts the body of f1 in 2 ** 14 places.
    let chain: Expr = call("f15", lit(0));
    for (let i = 15; i >= 1; i--) chain = let_({ [`f${String(i)}`]: fn(["x"], i === 1 ? app("add", variable("x"), lit(1)) : call(`f${String(i - 1)}`, call(`f${String(i - 1)}`, variable("x")))) }, chain);
    const p = tiered(chain, { domains: DOMAINS });
    expect([p.tier, p.reason]).toEqual([1, reason]);
    expect(fromCore(p.run({ space: s, origin: "0" }))).toStrictEqual({ ok: true, value: 2 ** 14 });
  });

  it("AXIS.LIST LIST.SORT: a program with lists as values goes to tier 1, and a module keeps each list as an array", () => {
    const s = space.array([{ n: 3 }, { n: 1 }, { n: 2 }]);
    const sorted = app("sortBy", each(axes.all, ref("n")));
    const axis = 'the program has the axis "list", and tier 2 does not have lists as values yet';
    const cases: readonly (readonly [Expr, string])[] = [
      [app("sum", each(axes.list(sorted), ref("n"))), axis],
      [fold(axes.reverse(axes.list(sorted)), { a: lit(0) }, { a: ref("n") }, variable("a")), axis],
      [app("nth", sorted, lit(1)), 'the program has the list op "nth", and tier 2 does not have lists as values yet'],
      [app("count", app("take", sorted, lit(2))), 'the program has the list op "take", and tier 2 does not have lists as values yet'],
      [app("first", sorted), 'the program has the list op "sortBy", and tier 2 does not have lists as values yet'],
    ];
    for (const [e, reason] of cases) {
      expect(generate(e, { domains: [NumDomain] })).toEqual({ ok: false, reason });
      expect(emitModule(e, { domains: [NumDomain], schema: { fields: { n: "number" } } }).ok).toBe(true);
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(1);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain], space: s, origin: k })));
    }
  });

  it("AXIS.LIST.ITEM AXIS.LIST.INDEX COMPILE.FALLBACK: a loop with the names as goes to tier 1", () => {
    const s = space.array([{ n: 3 }, { n: 1 }, { n: 2 }]);
    const sorted = app("sortBy", each(axes.all, ref("n")));
    const cases: readonly Expr[] = [
      app("sum", each(axes.list(sorted), app("add", variable("x"), variable("i")), undefined, ["x", "i"])),
      fold(axes.reverse(axes.list(sorted)), { a: lit(0) }, { a: app("add", variable("a"), variable("x")) }, variable("a"), undefined, ["x"]),
      let_({ y: app("sum", each(axes.where(axes.list(sorted), lit(true)), variable("x"), undefined, ["x"])) }, variable("y")),
    ];
    for (const e of cases) {
      expect(generate(e, { domains: [NumDomain] })).toEqual({ ok: false, reason: 'the program has the axis "list", and tier 2 does not have lists as values yet' });
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(1);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain], space: s, origin: k })));
    }
  });

  it("LIST.BUILD COMPILE.FALLBACK COMPILE.MODULE.LIST: a list op that builds a list goes to tier 1, and a module has it", () => {
    const s = space.array([{ n: 3 }, { n: 1 }, { n: 2 }]);
    const ns = each(axes.all, ref("n"));
    const cases: readonly (readonly [Expr, string])[] = [
      [app("count", app("drop", ns, lit(1))), "drop"],
      [app("sum", app("append", ns, ns)), "append"],
      [app("count", app("without", ns, app("take", ns, lit(1)))), "without"],
      [app("sum", app("flat", each(axes.window(0, 1), ns))), "flat"],
    ];
    for (const [e, op] of cases) {
      expect(generate(e, { domains: [NumDomain] })).toEqual({ ok: false, reason: `the program has the list op "${op}", and tier 2 does not have lists as values yet` });
      expect(emitModule(e, { domains: [NumDomain], schema: { fields: { n: "number" } } }).ok).toBe(true);
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(1);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain], space: s, origin: k })));
    }
    // A domain op with the name of a list op, on a value that is not a list, is not a list op in a module.
    const Stack = defineDomain({ name: "Stack", primitive: "number", is: (u: unknown): u is number => typeof u === "number", ops: { drop: { fn: (a: number, b: number): number => a - b, params: ["number"], returns: "number" } } });
    const own = app("drop", ref("n"), lit(1));
    expect(emitModule(own, { domains: [Stack], schema: { fields: { n: "number" } } }).ok).toBe(true);
    expect(fromCore(tiered(own, { domains: [Stack] }).run({ space: s, origin: "0" }))).toStrictEqual({ ok: true, value: 2 });
  });

  it("LIST.GET LIST.LITERAL LOOP.LIST COMPILE.FALLBACK COMPILE.MODULE.LIST: get, a list literal and a list of a loop go to tier 1, and a module has them", () => {
    const s = space.array([{ n: 3, id: "1" }, { n: 1, id: "2" }, { n: 2, id: "0" }]);
    const ns = each(axes.all, ref("n"));
    const empty = lit(vexList([]));
    const schema = { fields: { n: "number", id: "string" } } as const;
    const lists = "tier 2 does not have lists as values yet";
    const cases: readonly (readonly [Expr, string])[] = [
      [app("get", ns, ref("id")), `the program has the list op "get", and ${lists}`],
      [app("count", empty), `the program has a list literal, and ${lists}`],
      [iterate(2, { a: empty }, { a: app("append", variable("a"), ns) }, app("sum", variable("a"))), `the program has the list op "append", and ${lists}`],
      [iterate(2, { a: ns }, { a: app("drop", variable("a"), lit(1)) }, app("count", variable("a"))), `the program has the list op "drop", and ${lists}`],
    ];
    for (const [e, reason] of cases) {
      expect(generate(e, { domains: [NumDomain] })).toEqual({ ok: false, reason });
      expect(emitModule(e, { domains: [NumDomain], schema }).ok).toBe(true);
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(1);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain], space: s, origin: k })));
    }
    // A domain op get on a value that is not a list is not a list op in a module, and tier 1 gives its value.
    const own = app("get", ref("n"), lit(1));
    const Pick = defineDomain({ name: "Pick", primitive: "number", is: (u: unknown): u is number => typeof u === "number", ops: { get: { fn: (a: number, b: number): number => a * 10 + b, params: ["number"], returns: "number" } } });
    expect(emitModule(own, { domains: [Pick], schema }).ok).toBe(true);
    expect(fromCore(tiered(own, { domains: [Pick] }).run({ space: s, origin: "0" }))).toStrictEqual({ ok: true, value: 31 });
  });

  it("LIST.ARRAY LIST.INDEXOF LIST.FILL COMPILE.FALLBACK COMPILE.MODULE.FILL: a list op on an array, indexOf and fill give the result of tier 1, and a module has indexOf over a list and fill", () => {
    const s = space.array([{ n: 3, fr: [0.2, 0.3] }, { n: 1, fr: [] }, { n: 2, fr: [1, null] }]);
    const names = { a: [3, 1, 2], keys: ["x", "y"] };
    const ns = each(axes.all, ref("n"));
    const schema = { fields: { n: "number" } } as const;
    const lists = "tier 2 does not have lists as values yet";
    const cases: readonly (readonly [Expr, string])[] = [
      [app("indexOf", ns, lit(1)), "indexOf"],
      [app("indexOf", variable("keys"), lit("y")), "indexOf"],
      [app("count", app("fill", lit(2), lit(1))), "fill"],
    ];
    const same = (e: Expr, p: ReturnType<typeof tiered>): void => {
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k, vars: names }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain], space: s, origin: k, vars: names })));
    };
    for (const [e, op] of cases) {
      expect(generate(e, { domains: [NumDomain] })).toEqual({ ok: false, reason: `the program has the list op "${op}", and ${lists}` });
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(1);
      same(e, p);
    }
    expect(emitModule(app("indexOf", ns, lit(1)), { domains: [NumDomain], schema }).ok).toBe(true);
    // An array is not a list of a module, so indexOf over an array gives a reason.
    expect(emitModule(app("indexOf", variable("keys"), lit("y")), { domains: [NumDomain], schema }).ok).toBe(false);
    // A module has fill since COMPILE.MODULE.FILL.
    expect(emitModule(app("count", app("fill", lit(2), lit(1))), { domains: [NumDomain], schema }).ok).toBe(true);
    // Tier 2 takes a list op on a field or a name. A run with an array goes to tier 1, which reads the array as a list.
    for (const e of [app("sum", ref("fr")), app("count", variable("a")), app("max", variable("a")), app("add", app("count", ref("fr")), lit(1))]) {
      const p = tiered(e, { domains: [NumDomain] });
      expect(p.tier).toBe(2);
      same(e, p);
      expect(p.stats.fallbacks).toBeGreaterThan(0);
    }
    expect(fromCore(tiered(app("sum", ref("fr")), { domains: [NumDomain] }).run({ space: s, origin: "0" }))).toStrictEqual({ ok: true, value: 0.5 });
  });

  it("LIST.DISTINCT LIST.GROUP LIST.JOIN COMPILE.FALLBACK: distinct, group and join go to tier 1, and a module gives a reason", () => {
    const s = space.array([{ n: 3, t: "a" }, { n: 1, t: "b" }, { n: 3, t: "a" }]);
    const names = { xs: ["p", "q", "p"] };
    const ns = each(axes.all, ref("n"));
    const ts = each(axes.all, ref("t"));
    const schema = { fields: { n: "number", t: "string" } } as const;
    const cases: readonly (readonly [Expr, string])[] = [
      [app("count", app("distinct", ns)), "distinct"],
      [app("values", app("distinct", variable("xs"))), "distinct"],
      [app("count", app("group", ns, ts)), "group"],
      [app("sum", app("flat", app("group", ns, ts))), "flat"],
      [app("join", ts, lit("|")), "join"],
      [app("join", variable("xs"), ref("t")), "join"],
    ];
    for (const [e, op] of cases) {
      expect(generate(e, { domains: [NumDomain, TextDomain] })).toEqual({ ok: false, reason: `the program has the list op "${op}", and tier 2 does not have lists as values yet` });
      const p = tiered(e, { domains: [NumDomain, TextDomain] });
      expect(p.tier).toBe(1);
      for (const k of s.keys) expect(fromCore(p.run({ space: s, origin: k, vars: names }))).toStrictEqual(fromCore(evaluate(e, { domains: [NumDomain, TextDomain], space: s, origin: k, vars: names })));
    }
    expect(fromCore(tiered(app("join", ts, lit("|")), { domains: [NumDomain] }).run({ space: s, origin: "0" }))).toStrictEqual({ ok: true, value: "a|b|a" });
    // A module does not have the three ops yet: a list as the receiver gives the reason of the list op.
    const modules: readonly (readonly [Expr, string])[] = [
      [app("count", app("distinct", ns)), "distinct"],
      [app("first", app("distinct", ns)), "distinct"],
      [app("count", app("group", ns, ts)), "group"],
      [app("sum", app("flat", app("group", ns, ts))), "group"],
      [app("join", ts, lit("|")), "join"],
    ];
    for (const [e, op] of modules) {
      const m = emitModule(e, { domains: [NumDomain, TextDomain], schema });
      expect(m.ok ? "" : m.reason).toBe(`the list op "${op}"`);
    }
  });

  it("COMPILE.FALLBACK: an exception in the lowering gives a reason, not an exception", () => {
    // A host domain whose op table throws when the compiler reads it.
    const broken = Object.defineProperty({ ...NumDomain }, "ops", {
      get: () => {
        throw new Error("the op table is not ready");
      },
    }) as typeof NumDomain;
    const g = generate(app("add", ref("n"), lit(1)), { domains: [broken] });
    expect(g.ok ? "" : g.reason).toBe("the lowering threw an exception");
  });

  it("EVAL.SHAPE V-053: an expression that is not valid goes to tier 1, and a module gives the reason", () => {
    // V-053: a node with a tag of a newer version of Vex made the walks of the compiler throw a TypeError.
    const s = space.array([{ n: 1 }]);
    const reason = 'the expression has a node with the tag "loop", and this version of Vex does not know it';
    const newer = { tag: "app", op: "add", args: [{ tag: "lit", value: 1 }, { tag: "loop" }] } as unknown as Expr;
    expect(generate(newer, { domains: DOMAINS })).toEqual({ ok: false, reason });
    expect(emitModule(newer, { domains: DOMAINS, schema: {} })).toEqual({ ok: false, reason });
    const r = tiered(newer, { domains: DOMAINS }).run({ space: s, origin: "0" });
    expect(fromCore(r)).toStrictEqual(fromCore(evaluate(newer, { domains: DOMAINS, space: s, origin: "0" })));
    expect(r.ok ? undefined : r.error.message).toBe(reason);
  });

  it("DOC.ENTRY: tiered and generate take a document, and give the source and the results of its expression", () => {
    const s = space.array([{ n: 1 }, { n: 2 }, { n: 4 }]);
    const e = app("add", ref("n"), app("sum", each(axes.others, ref("n"))));
    const d = toDocument(e);
    if (!d.ok) throw new Error(d.error.message);
    expect(generate(d.value, { domains: DOMAINS })).toEqual(generate(e, { domains: DOMAINS }));
    const program = tiered(d.value, { domains: DOMAINS });
    expect([program.tier, program.expr]).toEqual([2, e]);
    for (const origin of s.keys) expect(fromCore(program.run({ space: s, origin }))).toStrictEqual(fromCore(evaluate(e, { domains: DOMAINS, space: s, origin })));
    // A document that is not valid gives its reason, and tier 1 gives its error at each run.
    const bad = { type: "ref", value: ["world", "n"] };
    const reason = 'the document is not valid at "/value/0": The root world is not open here. The open roots are self, names.';
    expect(generate(bad)).toEqual({ ok: false, reason });
    const slow = tiered(bad);
    expect([slow.tier, slow.reason, slow.expr]).toEqual([1, reason, bad]);
    const r = slow.run({ space: s, origin: "0" });
    expect(r.ok ? undefined : r.error.message).toBe(reason);
  });

  it("P17 VEC2.COMPOSE VEC2.SELECT: a program with the frame ops of Vec2 gives the result of the interpreter in tier 2", () => {
    // The content size along the axis p: the sum of the sizes q along p, and their maximum across p.
    const programs: readonly Expr[] = [
      app("compose", ref("p"), app("along", total("add"), ref("p")), app("across", total("max"), ref("p"))),
      app("select", ref("p"), ref("q"), lit(3)),
      app("select", ref("p"), app("min", ref("q"), ref("p")), ref("q")),
    ];
    for (const e of programs) expect(tiered(e, { domains: DOMAINS, fns: FNS }).tier).toBe(2);
    const runs = runOf(fc.constantFrom(...programs));
    fc.assert(fc.property(runs, ([s, e, k, t, v]) => agree(e, s, k, t, v, { values: 0, fast: 0 })));
    expect(shareOfTier2(runs)).toBeGreaterThan(0.5);
  });

  it("P17 COMPILE.TIERED: on list ops over an axis, a tiered program gives the result of the interpreter", () => {
    const runs = runOf(arbListProgram);
    fc.assert(fc.property(runs, ([s, e, k, t, v]) => agree(e, s, k, t, v, { values: 0, fast: 0 })));
    expect(shareOfTier2(runs)).toBeGreaterThan(0.5);
  });
});

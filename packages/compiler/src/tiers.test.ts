import { app, axes, each, evaluate, ext, fold, index, isVexList, iterate, key, lit, offset, ok, rec, ref, space, v as variable, type Addr, type Axis, type Expr, type ExtHandler, type FreeFn, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbChain, arbExpr, arbLiteral, arbOrigin, arbSpace, fromCore, modelChain, type ModelOptions } from "@mark1russell7/vex-testkit";
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

/** A position from the text of a path: its length, modulo 3, the number of keys of the test. */
const positionOf = (x: Expr): Expr => app("mod", app("length", x), lit(3));
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
 * This function checks that the tiered program gives the result of the interpreter. It counts the runs with a value,
 * and the runs where tier 2 gave the value. Tier 2 makes no error values, so a list with an error item does not count.
 */
function agree(e: Expr, s: Space, k: string, t: Readonly<Record<string, Space>>, v: Readonly<Record<string, unknown>> | undefined, count: { values: number; fast: number }, options: GenerateOptions = { domains: DOMAINS, fns: FNS }): void {
  const p = tiered(e, options);
  const run = { space: s, origin: k, tables: t, ...(v === undefined ? {} : { vars: v }) };
  const expected = evaluate(e, { ...options, ...run });
  expect(fromCore(p.run(run))).toStrictEqual(fromCore(expected));
  if (expected.ok && !(isVexList(expected.value) && expected.value.items.some((item) => !item.result.ok))) {
    count.values++;
    if (p.tier === 2 && p.stats.fallbacks === 0) count.fast++;
  }
}

describe("the tiers", () => {
  // In each property, a fallback gives the right result too. Thus the share of tier 2 shows a gap that the equality cannot show.
  it("P17 COMPILE.TIERED: on programs of the whole grammar, a tiered program gives the result of the interpreter", () => {
    const count = { values: 0, fast: 0 };
    fc.assert(fc.property(runOf(arbExpr(OPTS)), ([s, e, k, t, v]) => agree(e, s, k, t, v, count)));
    expect(count.fast / count.values).toBeGreaterThan(0.5);
  });

  it("P17 COMPILE.TIERED: on the programs of the builder, a tiered program gives the result of the interpreter", () => {
    const count = { values: 0, fast: 0 };
    fc.assert(fc.property(arbSpace(vec).chain((s) => runOf(arbChain(CHAINS(s.keys)).map(modelChain))), ([s, e, k, t, v]) => agree(e, s, k, t, v, count)));
    expect(count.fast / count.values).toBeGreaterThan(0.5);
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
    let direct = 0;
    fc.assert(
      fc.property(runOf(fc.oneof(arbExpr(OPTS), arbListProgram, arbKeyedProgram, arbNumeric, arbNumeric)), ([s, e, k, t, v]) => {
        agree(e, s, k, t, v, count, options);
        const g = generate(e, options);
        if (g.ok && /= f\d+_\d+\(/.test(g.source)) direct++;
      }),
    );
    // Some programs have static sites.
    expect(direct).toBeGreaterThan(20);
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

  it("P17 COMPILE.TIERED: on list ops over an axis, a tiered program gives the result of the interpreter", () => {
    const count = { values: 0, fast: 0 };
    fc.assert(fc.property(runOf(arbListProgram), ([s, e, k, t, v]) => agree(e, s, k, t, v, count)));
    expect(count.fast / count.values).toBeGreaterThan(0.5);
  });
});

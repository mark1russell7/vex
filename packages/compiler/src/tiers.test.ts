import { evaluate, isVexList, type Axis, type Expr, type FreeFn, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbChain, arbExpr, arbLiteral, arbOrigin, arbSpace, fromCore, modelChain, type ModelOptions } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;
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
  )
  .map(([op, axis, body, test, rest, bind]): Expr => {
    const each: Expr = { tag: "each", axis: test === undefined ? axis : { t: "where", axis, test }, body };
    const list: Expr = bind ? { tag: "let", bind: { a: { tag: "ref", path: ["n"] } }, body: each } : each;
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

  it("P17 COMPILE.TIERED: on list ops over an axis, a tiered program gives the result of the interpreter", () => {
    const count = { values: 0, fast: 0 };
    fc.assert(fc.property(runOf(arbListProgram), ([s, e, k, t, v]) => agree(e, s, k, t, v, count)));
    expect(count.fast / count.values).toBeGreaterThan(0.5);
  });
});

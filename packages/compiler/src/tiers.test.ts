import { evaluate, isVexList, type Axis, type Expr, type FreeFn, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbChain, arbExpr, arbLiteral, arbOrigin, arbSpace, fromCore, modelChain, type ModelOptions } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tiered } from "./tiers.ts";

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

const tables = arbSpace(vec).map((t): Readonly<Record<string, Space>> => ({ T: t }));
const vars = fc.option(fc.record({ a: arbLiteral(vec), c: arbLiteral(vec) }), { nil: undefined });

/** A space, an origin, the tables and the variables, for an expression. */
const runOf = <E,>(e: fc.Arbitrary<E>) => arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), e, arbOrigin(s), tables, vars));

/**
 * This function checks that the tiered program gives the result of the interpreter. It counts the runs with a value,
 * and the runs where tier 2 gave the value. Tier 2 makes no error values, so a list with an error item does not count.
 */
function agree(e: Expr, s: Space, k: string, t: Readonly<Record<string, Space>>, v: Readonly<Record<string, unknown>> | undefined, count: { values: number; fast: number }): void {
  const options = { domains: DOMAINS, fns: FNS };
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

  it("P17 COMPILE.TIERED: on list ops over an axis, a tiered program gives the result of the interpreter", () => {
    const count = { values: 0, fast: 0 };
    fc.assert(fc.property(runOf(arbListProgram), ([s, e, k, t, v]) => agree(e, s, k, t, v, count)));
    expect(count.fast / count.values).toBeGreaterThan(0.5);
  });
});

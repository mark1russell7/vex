/**
 * Arrays as lists (LIST.ARRAY), `indexOf` (LIST.INDEXOF) and `fill` (LIST.FILL), as properties. Each property compares
 * the interpreter with the reference interpreter of the kernel (EVAL.REFERENCE).
 */
import { app, evaluate, lit, space, v, vexList, type Expr, type ListItem, type Result } from "@mark1russell7/vex";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromCore, fromReference } from "./compare.ts";
import { referenceEvaluate } from "./reference.ts";

const DOMAINS = [NumDomain, TextDomain] as const;
const ONE = space.record({ A: {} });
const SAMPLE = { seed: 20261024, numRuns: 200 } as const;

/** This function gives the result of the interpreter, and checks that the reference interpreter gives the same result. */
function run(e: Expr, vars: Readonly<Record<string, unknown>> = {}): ReturnType<typeof fromCore> {
  const opts = { space: ONE, origin: "A", domains: DOMAINS, vars };
  const r: Result<unknown> = evaluate(e, opts);
  expect(fromReference(referenceEvaluate(e, opts))).toStrictEqual(fromCore(r));
  return fromCore(r);
}

/** The list literal with the positions of an array as keys. */
const listOf = (a: readonly unknown[]): Expr => lit(vexList(a.map((x, i): ListItem => ({ key: String(i), result: { ok: true, value: x } }))));

const item = fc.oneof(fc.integer({ min: -3, max: 3 }), fc.constantFrom("a", "b"), fc.boolean());
const items = fc.array(item, { maxLength: 6 });
const numbers = fc.array(fc.integer({ min: -9, max: 9 }), { maxLength: 6 });
const OPS: readonly (readonly [string, ...Expr[]])[] = [
  ["count"], ["sum"], ["mean"], ["min"], ["max"], ["any"], ["all"], ["values"], ["keys"], ["first"], ["sortBy"],
  ["take", lit(2)], ["drop", lit(1)], ["nth", lit(1)], ["get", lit("1")], ["append", lit([1])], ["without", lit([0, 0])], ["indexOf", lit("a")], ["indexOf", lit(1)],
];

describe("arrays as lists, as properties", () => {
  it("LIST.ARRAY: each list op on an array gives its result on the list with the positions as keys", () => {
    for (const a of fc.sample(items, SAMPLE)) {
      for (const [op, ...rest] of OPS) expect([op, a, run(app(op, lit(a), ...rest))]).toStrictEqual([op, a, run(app(op, listOf(a), ...rest))]);
    }
  });

  it("LIST.ARRAY: an array of a name is the same list as an array of a literal", () => {
    fc.assert(
      fc.property(numbers, fc.constantFrom(...OPS), (a, [op, ...rest]) => {
        expect(run(app(op, app("values", lit(a)), ...rest))).toStrictEqual(run(app(op, lit(a), ...rest)));
        expect(run(app(op, v("xs"), ...rest), { xs: a })).toStrictEqual(run(app(op, lit(a), ...rest)));
      }),
    );
  });

  it("LIST.INDEXOF: nth of indexOf gives the value, and no item before that position has the value", () => {
    fc.assert(
      fc.property(items, item, (a, x) => {
        const i = run(app("indexOf", lit(a), lit(x)));
        const found = a.indexOf(x);
        expect(i).toStrictEqual(found < 0 ? { ok: false, code: "#N/A" } : { ok: true, value: found });
        expect(run(app("nth", lit(a), app("indexOf", lit(a), lit(x))))).toStrictEqual(found < 0 ? { ok: false, code: "#N/A" } : { ok: true, value: x });
      }),
    );
  });

  it("LIST.FILL: fill(n, value) has n items, each with the value, and the keys of an array of n values", () => {
    for (const [n, x] of fc.sample(fc.tuple(fc.integer({ min: 0, max: 50 }), item), SAMPLE)) {
      expect(run(app("count", app("fill", lit(n), lit(x))))).toStrictEqual({ ok: true, value: n });
      expect(run(app("values", app("fill", lit(n), lit(x))))).toStrictEqual({ ok: true, value: Array.from({ length: n }, () => x) });
      expect(run(app("keys", app("fill", lit(n), lit(x))))).toStrictEqual(run(app("keys", lit(Array.from({ length: n }, () => x)))));
    }
  });
});

import { evaluate, vex, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbSpace } from "./arbitraries.ts";
import { arbChain, modelChain, runChain, type DynRoot, type ModelOptions } from "./builder-model.ts";
import { fromCore, fromReference } from "./compare.ts";
import { referenceEvaluate } from "./reference.ts";

const DOMAINS = [Vec2Domain, NumDomain, BoolDomain] as const;
const vec = fc.tuple(fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 })).map(([x, y]) => new Vec2(x, y));

/** The free functions of the test. `length` has the name of an op of Vec2, so the op of the domain comes first. */
const FNS: Readonly<Record<string, (...a: readonly unknown[]) => unknown>> = {
  twice: (x: unknown): unknown => (typeof x === "number" ? x * 2 : x),
  pick: (x: unknown, y: unknown): unknown => y ?? x,
  boom: (): never => {
    throw new Error("boom");
  },
  length: (): number => 42,
};

const options = (keys: readonly string[]): ModelOptions => ({
  keys,
  paths: ["p", "q", "n", "s", "b", "nested.x", "missing", "", "__proto__"],
  ops: ["add", "subtract", "scale", "length", "dot", "distance", "halve", "maxComponent", "anyNonPositive", "multiply", "gt", "abs", "max", "negate", "not", "nope"],
  fns: ["twice", "pick", "boom", "length", "unknown"],
  reduceOps: ["add", "max", "nope"],
  reductions: ["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "first", "reduce"],
  depth: 2,
});

const rootOf = (s: Space): DynRoot => vex(...DOMAINS).withOptions({ fns: FNS }).over(s) as unknown as DynRoot;

const caseArb = arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbChain(options(s.keys))));

describe("the builder model test (QUALITY-PLAN §4.1)", () => {
  it("a random chain of builder calls gives the result of the model at each key", () => {
    fc.assert(
      fc.property(caseArb, ([s, chain]) => {
        const built = runChain(chain, rootOf(s));
        const expected = modelChain(chain);
        for (const k of s.keys) {
          const actual = typeof built.result === "function" ? built.result(k) : evaluate(built.program, { space: s, origin: k, domains: DOMAINS, fns: FNS });
          expect(fromCore(actual), `at ${k}`).toEqual(fromReference(referenceEvaluate(expected, { space: s, origin: k, domains: DOMAINS, fns: FNS })));
        }
      }),
    );
  });
});

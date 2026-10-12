import { evaluate, vex, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbSpace } from "./arbitraries.ts";
import { arbChain, chainText, modelChain, runChain, type BuilderChain, type DynRoot, type ModelOptions } from "./builder-model.ts";
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
  reductions: ["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "keys", "errors", "first", "reduce"],
  depth: 2,
});

const rootOf = (s: Space): DynRoot => vex(...DOMAINS).withOptions({ fns: FNS }).over(s) as unknown as DynRoot;

const caseArb = arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbChain(options(s.keys))));

describe("the text of a chain", () => {
  it("chainText gives the TypeScript text of each kind of call", () => {
    const sub: BuilderChain = { head: { t: "from", path: "q" }, steps: [] };
    const chain: BuilderChain = {
      head: { t: "start", value: "p" },
      steps: [
        { t: "from", path: "nested.x" },
        { t: "move", m: { t: "to", key: "A" } },
        { t: "move", m: { t: "index", i: -1 } },
        { t: "move", m: { t: "offset", d: [1, -1] } },
        { t: "move", m: { t: "parent" } },
        { t: "op", op: "add", args: [{ k: "field", path: "p" }, { k: "lit", value: -2 }, { k: "of", key: "B", path: "q" }, { k: "chain", chain: sub }] },
        { t: "call", name: "twice", args: [{ k: "lit", value: true }] },
        { t: "ifError", fallback: { k: "lit", value: 0 } },
        { t: "fork", a: [{ t: "from", path: "p" }], b: [] },
        { t: "with", bind: { k: "field", path: "n" }, body: [{ t: "op", op: "scale", args: [{ k: "var", name: "x" }] }] },
        { t: "axis", axis: "neighbors4", body: [], where: [{ t: "op", op: "not", args: [] }], reduce: { op: "reduce", with: "add", strict: true } },
        { t: "axis", axis: "children", body: [], reduce: { op: "count", strict: true } },
        { t: "axis", axis: "each", body: [], reduce: { op: "errors", strict: false } },
        { t: "axis", axis: "others", body: [{ t: "move", m: { t: "other" } }] },
      ],
    };
    expect(chainText(chain)).toBe(
      'root.start("p").from("nested.x").to("A").index(-1).offset(1, -1).parent()' +
        '._.add("p", -2, root.of("B", "q"), root.from("q")).call("twice", true).ifError(0)' +
        '.fork({ a: (e0) => e0.from("p"), b: (e1) => e1 }).with({ x: "n" }, (e2, vars) => e2._.scale(vars.x))' +
        '.neighbors(4, (e3) => e3, { where: (e4) => e4._.not() }).reduce("add", { strict: true })' +
        ".children((e5) => e5).count({ strict: true }).each((e6) => e6).errors().others((e7) => e7.other())",
    );
  });
});

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

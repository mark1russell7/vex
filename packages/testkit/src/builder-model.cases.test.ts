/**
 * Fixed cases of the builder model test. The random test reaches each kind of call, but some combinations are rare:
 * a bound name in an axis body, a `where` test that reads the target, a strict reduction, and each kind of move.
 * Each case compares the real builder with the model at each key, and gives the expected values.
 */
import { evaluate, lit, space, vex, type Space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { chainText, modelChain, runChain, type BuilderChain, type DynChain, type DynRoot, type Reduction, type Step } from "./builder-model.ts";
import { fromCore, fromReference } from "./compare.ts";
import { referenceEvaluate } from "./reference.ts";

const DOMAINS = [NumDomain] as const;
const three = space.record({ A: { n: 1 }, B: { n: 2 }, C: { n: 4 } });
const pair = space.record({ A: { n: 1 }, B: { n: 2 } });
const row = space.array([{ n: 1 }, { n: 2 }, { n: 4 }]);
const tree = space.tree({ r: { n: 1 }, a: { n: 2 }, b: { n: 4 } }, { a: "r", b: "r" });

/** This function gives the result of the real builder at each key, and checks that the model gives the same results. */
function results(c: BuilderChain, s: Space): unknown[] {
  const root = vex(...DOMAINS).over(s) as unknown as DynRoot;
  const program = runChain(c, root).program;
  const expected = modelChain(c);
  return s.keys.map((k) => {
    const got = fromCore(evaluate(program, { space: s, origin: k, domains: DOMAINS }));
    expect(got).toEqual(fromReference(referenceEvaluate(expected, { space: s, origin: k, domains: DOMAINS })));
    return got.ok ? got.value : got.code;
  });
}

const fromN: BuilderChain["head"] = { t: "from", path: "n" };
const axis = (body: readonly Step[], reduce: Reduction, where?: readonly Step[]): Step => (where === undefined ? { t: "axis", axis: "others", body, reduce } : { t: "axis", axis: "others", body, where, reduce });
const at = (m: Extract<Step, { t: "move" }>["m"]): BuilderChain => ({ head: fromN, steps: [{ t: "move", m }, { t: "from", path: "n" }] });
const text = (reduce: Reduction): string => chainText({ head: fromN, steps: [axis([], reduce)] });
// A root whose chains have no members and an empty op proxy, for the errors of the runner.
const start = (): DynChain => ({ kind: "fake", program: lit(0), _: {} });
const fakeRoot: DynRoot = { from: start, start, of: () => undefined, lit: () => undefined, field: () => undefined, rec: () => undefined };

describe("the builder model at fixed cases", () => {
  it("a bound name inside an axis body reads the binding of with, not the value of the axis", () => {
    const c: BuilderChain = {
      head: { t: "start", value: 10 },
      steps: [{ t: "with", bind: { k: "lit", value: 5 }, body: [axis([{ t: "op", op: "add", args: [{ k: "var", name: "x" }] }], { op: "sum", strict: false })] }],
    };
    // Each other key gives 10 + 5, and each key has two other keys.
    expect(results(c, three)).toEqual([30, 30, 30]);
  });

  it("a where test reads the field of the target", () => {
    const c: BuilderChain = { head: fromN, steps: [axis([], { op: "count", strict: false }, [{ t: "from", path: "n" }, { t: "op", op: "gt", args: [{ k: "lit", value: 1 }] }])] };
    expect(results(c, three)).toEqual([2, 1, 1]);
  });

  it("a strict reduction gives the first error, and a reduction that is not strict skips it", () => {
    const missing: readonly Step[] = [{ t: "from", path: "missing" }];
    expect(results({ head: fromN, steps: [axis(missing, { op: "count", strict: true })] }, three)).toEqual(["#N/A", "#N/A", "#N/A"]);
    expect(results({ head: fromN, steps: [axis(missing, { op: "count", strict: false })] }, three)).toEqual([0, 0, 0]);
    expect(results({ head: fromN, steps: [axis(missing, { op: "reduce", with: "add", strict: true })] }, three)).toEqual(["#N/A", "#N/A", "#N/A"]);
    // Without the error items the list is empty, so reduce gives the identity of add.
    expect(results({ head: fromN, steps: [axis(missing, { op: "reduce", with: "add", strict: false })] }, three)).toEqual([0, 0, 0]);
    expect(results({ head: fromN, steps: [axis([{ t: "from", path: "n" }], { op: "reduce", with: "add", strict: false })] }, three)).toEqual([6, 5, 3]);
  });

  it("each kind of move gives its key", () => {
    expect(results(at({ t: "to", key: "B" }), three)).toEqual([2, 2, 2]);
    expect(results(at({ t: "index", i: 2 }), three)).toEqual([4, 4, 4]);
    expect(results(at({ t: "origin" }), three)).toEqual([1, 2, 4]);
    expect(results(at({ t: "other" }), pair)).toEqual([2, 1]);
    expect(results(at({ t: "offset", d: [1] }), row)).toEqual([2, 4, "#REF!"]);
    expect(results(at({ t: "parent" }), tree)).toEqual(["#REF!", 1, 1]);
  });

  it("a chain argument evaluates at the origin", () => {
    const c: BuilderChain = { head: fromN, steps: [{ t: "op", op: "add", args: [{ k: "chain", chain: { head: fromN, steps: [] } }] }] };
    expect(results(c, three)).toEqual([2, 4, 8]);
  });
});

describe("the runner and the text of a chain", () => {
  it("names a missing member of the chain, and a missing op of the op proxy", () => {
    expect(() => runChain({ head: fromN, steps: [{ t: "from", path: "n" }] }, fakeRoot)).toThrow('the chain has no member "from"');
    expect(() => runChain({ head: fromN, steps: [{ t: "op", op: "add", args: [] }] }, fakeRoot)).toThrow('the op proxy has no "add"');
  });

  it("gives the text of each reduction, with and without the strict option", () => {
    expect(text({ op: "reduce", with: "add", strict: true })).toBe('root.from("n").others((e0) => e0).reduce("add", { strict: true })');
    expect(text({ op: "reduce", with: "add", strict: false })).toBe('root.from("n").others((e0) => e0).reduce("add")');
    expect(text({ op: "sum", strict: true })).toBe('root.from("n").others((e0) => e0).sum({ strict: true })');
    expect(text({ op: "count", strict: false })).toBe('root.from("n").others((e0) => e0).count()');
  });
});

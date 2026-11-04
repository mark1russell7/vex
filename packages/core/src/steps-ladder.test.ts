/**
 * The tests of a refusal of the steps. This file declares the plain `iterate` as a
 * construct of step B and `call` as a construct of step C, in a mock of the table of `constructs.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { evaluate } from "./evaluate.ts";
import { app, call, fn, iterate, let_, lit, rec, v, type Expr } from "./ir.ts";
import { space } from "./space.ts";
import { programStep, stepError, VEX_STEPS } from "./steps.ts";
import { error, value } from "./test-support.ts";

vi.mock(import("./constructs.ts"), async (load) => {
  const real = await load();
  const steps: typeof real.CONSTRUCT_STEPS = { ...real.CONSTRUCT_STEPS, iterate: "B", call: "C" };
  return { ...real, CONSTRUCT_STEPS: steps };
});

const loop: Expr = iterate(3, { i: lit(5) }, { i: v("i") }, v("i"));
const called: Expr = let_({ f: fn(["x"], v("x")) }, call("f", lit(7)));
const sp = space.array([{ n: 1 }]);

describe("the steps of Vex with constructs of steps B and C", () => {
  it("STEP.LADDER: the ladder takes the table of constructs", () => {
    expect(VEX_STEPS.constructs["iterate"]).toBe("B");
    expect(VEX_STEPS.constructs["call"]).toBe("C");
  });

  it("STEP.LOWEST: the step is the highest step of the nodes, and the reason is the first node with it", () => {
    expect(programStep(lit(1))).toEqual({ step: "A", reason: "each construct of the program is of step A" });
    expect(programStep(loop)).toEqual({ step: "B", reason: 'the node "iterate" at the root needs step B', construct: "iterate", path: [] });
    expect(programStep(rec({ a: lit(1), b: loop }))).toEqual({ step: "B", reason: 'the node "iterate" at the path [1] needs step B', construct: "iterate", path: [1] });
    expect(programStep(app("add", loop, called)).step).toBe("C");
  });

  it("STEP.MAX: a program above maxStep is not valid, and the reason names the needed step", () => {
    expect(stepError(loop, { maxStep: "A" })).toBe('the program needs step B, and the host accepts the steps up to A: the node "iterate" at the root needs step B (STEP.MAX)');
    expect(stepError(loop)).toBeUndefined();
    expect(stepError(loop, { maxStep: "B" })).toBeUndefined();
    expect(stepError(called)).toBe('the program needs step C, and the host accepts the steps up to B: the node "call" at the path [1] needs step C (STEP.MAX)');
    expect(stepError(called, { maxStep: "C" })).toBeUndefined();
    const e = error(evaluate(loop, { space: sp, origin: "0", maxStep: "A" }));
    expect([e.code, e.kind]).toEqual(["#VALUE!", "bad-expression"]);
    expect(e.message).toContain("needs step B");
  });

  it("STEP.VALUE: each step that accepts a program gives the same value", () => {
    expect(value(evaluate(loop, { space: sp, origin: "0" }))).toBe(5);
    expect(evaluate(loop, { space: sp, origin: "0", maxStep: "C" })).toEqual(evaluate(loop, { space: sp, origin: "0", maxStep: "B" }));
    expect(value(evaluate(called, { space: sp, origin: "0", maxStep: "C" }))).toBe(7);
  });
});

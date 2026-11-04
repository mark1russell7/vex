import { describe, expect, it } from "vitest";
import { compile, evaluate } from "./evaluate.ts";
import { app, axes, call, each, fn, fold, iterate, let_, lit, rec, ref, v, type Expr, type ExprTag } from "./ir.ts";
import { toDocument } from "./document.ts";
import { kernelPlan } from "./plan.ts";
import { cell, SheetRun } from "./sheet.ts";
import { space } from "./space.ts";
import { CONSTRUCT_STEPS, DEFAULT_MAX_STEP, programStep, stepError, VEX_STEP_NAMES, VEX_STEPS, type VexStep } from "./steps.ts";
import { error, value } from "./test-support.ts";

/** One program of each construct of Vex. */
const PROGRAMS: readonly Expr[] = [
  lit(1),
  app("add", ref("n"), lit(1)),
  let_({ f: fn(["x"], app("add", v("x"), lit(1))) }, call("f", lit(2))),
  rec({ a: lit(1) }),
  each(axes.all, ref("n")),
  fold(axes.all, { s: lit(0) }, { s: app("add", v("s"), ref("n")) }, v("s")),
  iterate(3, { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i")),
];

const sp = space.array([{ n: 1 }, { n: 2 }]);

describe("the steps of Vex", () => {
  it("STEP.LADDER: the steps are A, B and C, the limit from the data is of step B, and each other construct is of step A", () => {
    expect(VEX_STEPS.steps).toEqual(["A", "B", "C"]);
    expect(VEX_STEP_NAMES).toEqual(VEX_STEPS.steps);
    const tags: readonly ExprTag[] = ["lit", "ref", "app", "let", "var", "rec", "each", "fold", "iterate", "fn", "call", "ext"];
    expect(CONSTRUCT_STEPS.fix).toBe("B");
    expect(CONSTRUCT_STEPS.last).toBe("B");
    expect(Object.keys(CONSTRUCT_STEPS).toSorted()).toEqual([...tags, "fix", "last", "iterate.size"].toSorted());
    for (const tag of tags) expect(VEX_STEPS.constructs[tag]).toBe("A");
    expect(VEX_STEPS.constructs["iterate.size"]).toBe("B");
    expect(DEFAULT_MAX_STEP).toBe("B");
  });

  it("STEP.LOWEST: each program of each construct is of step A, with the reason", () => {
    for (const e of PROGRAMS) expect(programStep(e)).toEqual({ step: "A", reason: "each construct of the program is of step A" });
  });

  it("STEP.MAX: each step accepts each program today, also with the default", () => {
    for (const e of PROGRAMS) {
      expect(stepError(e)).toBeUndefined();
      for (const maxStep of VEX_STEP_NAMES) expect(stepError(e, { maxStep })).toBeUndefined();
    }
  });

  it("STEP.MAX: a value of maxStep that is not a step is not valid, in compile, in the plan and in a sheet", () => {
    expect(stepError(lit(1), { maxStep: "D" as VexStep })).toBe('the option maxStep "D" is not a step of Vex. The steps are A, B, C (STEP.MAX)');
    expect(stepError(lit(1), { maxStep: 2 as unknown as VexStep })).toBe("the option maxStep of the type number is not a step of Vex. The steps are A, B, C (STEP.MAX)");
    const bad = { maxStep: "a" as VexStep };
    const e = error(evaluate(lit(1), { space: sp, origin: "0", ...bad }));
    expect([e.code, e.kind]).toEqual(["#VALUE!", "bad-expression"]);
    expect(e.message).toContain("(STEP.MAX)");
    expect(error(compile(lit(1), bad).run({ space: sp, origin: "0" })).message).toContain("(STEP.MAX)");
    for (const source of [lit(1), value(toDocument(lit(1)))]) {
      const plan = kernelPlan(source, bad);
      expect(plan.doc).toBeUndefined();
      expect(error(plan.run({ space: sp, origin: "0" })).message).toContain("(STEP.MAX)");
    }
    const run = new SheetRun(new Map([["a", lit(1)]]), { space: sp, ...bad });
    expect(error(run.cell("a", "0")).message).toContain("(STEP.MAX)");
  });

  it("STEP.VALUE: each step gives the same value of each program, and a new step gives a new compile", () => {
    for (const e of PROGRAMS) {
      const expected = evaluate(e, { space: sp, origin: "1" });
      for (const maxStep of VEX_STEP_NAMES) expect(evaluate(e, { space: sp, origin: "1", maxStep })).toEqual(expected);
    }
    // The cache of compiled programs keys on maxStep, so a refusal at one limit does not stay at another limit.
    const e = lit(5);
    expect(evaluate(e, { space: sp, origin: "0", maxStep: "Z" as VexStep }).ok).toBe(false);
    expect(value(evaluate(e, { space: sp, origin: "0", maxStep: "A" }))).toBe(5);
  });

  it("STEP.CYCLE: a cycle of cells without an explicit fixed point gives #CYCLE! at each step", () => {
    for (const maxStep of VEX_STEP_NAMES) {
      const run = new SheetRun(new Map([["a", app("add", cell("b"), lit(1))], ["b", cell("a")]]), { space: sp, maxStep });
      for (const c of ["a", "b"]) expect(error(run.cell(c, "0")).code).toBe("#CYCLE!");
    }
  });
});

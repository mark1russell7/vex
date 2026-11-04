// The tests of the edits of the RADIALGAP ablation. Each edit must apply to the radial module of today's emitter, and each
// variant must give the result of the module on the input of the gate.
import { describe, expect, it } from "vitest";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialRun } from "../../pilots/src/ireko-radial.ts";
import { emitModule } from "../src/module.ts";
import { allEdits, catchCheck, errorRecords, handBoth, handPairs, handSum, itemTries, loadErrors, loadRadial, noChecks, noColumnTry, noItemTry, ringOf } from "./ablation.ts";

const source = (): string => {
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial", faults: "value" });
  if (!m.ok) throw new Error(m.reason);
  return m.source;
};

describe("the edits of the radial ablation", () => {
  it("find a loop item with a try block in the radial module", () => {
    expect(itemTries(source())).toBeGreaterThan(0);
    expect(itemTries(noItemTry(source()))).toBe(0);
  });

  it("give variants with the result of the module on the nested ring of 60 children", () => {
    const { space: s, vars } = radialRun(ringOf(60, "nested"));
    const want = JSON.stringify(loadRadial((x) => x)(s.records, vars));
    for (const edit of [noChecks, noColumnTry, noItemTry, allEdits, handSum, handPairs, handBoth, catchCheck]) {
      expect(JSON.stringify(loadRadial(edit)(s.records, vars))).toBe(want);
    }
  });

  it("stop when the text of an edit is not in the source", () => {
    expect(() => noChecks("const x = 1;")).toThrow(/once in the radial module/);
    expect(() => noItemTry("const x = 1;")).toThrow(/no loop item/);
    expect(() => handSum("const x = 1;")).toThrow(/once in the radial module/);
    expect(() => catchCheck("const x = 1;")).toThrow(/no catch/);
  });

  it("CATCHFAULT: the form throw gives the result of the module on the nested ring of 60 children", () => {
    const { space: s, vars } = radialRun(ringOf(60, "nested"));
    expect(JSON.stringify(loadRadial((x) => x, "throw")(s.records, vars))).toBe(JSON.stringify(loadRadial((x) => x)(s.records, vars)));
  });

  it("CATCHFAULT: the catch check leaves no bare catch in the radial module", () => {
    const edited = catchCheck(source());
    expect(edited).not.toContain("catch {");
    expect(edited.split("catch ($) { H($);").length).toBe(source().split("catch {").length);
  });

  it("CATCHFAULT: the catch check lets a ReferenceError leave the run, and the module holds it as a value", () => {
    const broken = (text: string): string => text.replace("let v = m[j];", "let v = m[j]; if (j === 0) gone;");
    const { space: s, vars } = radialRun(ringOf(60, "nested"));
    expect(() => loadRadial((x) => catchCheck(broken(x)))(s.records, vars)).toThrow(ReferenceError);
    expect(() => loadRadial(broken)(s.records, vars)).not.toThrow();
  });

  it("CATCHFAULT: each key of the module of the many errors takes the path of a throw, with and without the check", () => {
    const counted = (x: string): string => catchCheck(x).replaceAll("function H(x) {", "function H(x) { globalThis.vexCaught = (globalThis.vexCaught ?? 0) + 1;");
    const records = errorRecords(50);
    const scope = globalThis as { vexCaught?: number };
    scope.vexCaught = 0;
    const want = records.map(() => 0);
    expect(loadErrors((x) => x)(records, {})).toEqual(want);
    expect(loadErrors(counted)(records, {})).toEqual(want);
    const caught = scope.vexCaught;
    delete scope.vexCaught;
    expect(caught).toBe(50);
    expect(loadErrors((x) => x, "throw")(records, {})).toEqual(want);
  });
});

// The tests of the edits of the RADIALGAP ablation. Each edit must apply to the radial module of today's emitter, and each
// variant must give the result of the module on the input of the gate.
import { describe, expect, it } from "vitest";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialRun } from "../../pilots/src/ireko-radial.ts";
import { emitModule } from "../src/module.ts";
import { allEdits, handBoth, handPairs, handSum, itemTries, loadRadial, noChecks, noColumnTry, noItemTry, ringOf } from "./ablation.ts";

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
    for (const edit of [noChecks, noColumnTry, noItemTry, allEdits, handSum, handPairs, handBoth]) {
      expect(JSON.stringify(loadRadial(edit)(s.records, vars))).toBe(want);
    }
  });

  it("stop when the text of an edit is not in the source", () => {
    expect(() => noChecks("const x = 1;")).toThrow(/once in the radial module/);
    expect(() => noItemTry("const x = 1;")).toThrow(/no loop item/);
    expect(() => handSum("const x = 1;")).toThrow(/once in the radial module/);
  });
});

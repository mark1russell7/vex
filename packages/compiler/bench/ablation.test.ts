// The tests of the edits of the RADIALGAP ablation. Each edit must apply to the radial module of today's emitter, and each
// variant must give the result of the module on the input of the gate.
import { describe, expect, it } from "vitest";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialRun } from "../../pilots/src/ireko-radial.ts";
import { emitModule } from "../src/index.ts";
import { MAX_BANDS, type ShapeRecord } from "../../pilots/src/ireko-shapes.ts";
import { allEdits, freezeEnvelope, handBoth, handPairs, handSum, itemTries, loadRadial, loadShapes, noChecks, noColumnTry, noFreeze, noItemTry, ringOf } from "./ablation.ts";

const source = (): string => {
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial" });
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

/** This function gives the result of the shapes module on a small tree, with the source changed by `edit`. */
const shapesOn = (edit: (source: string) => string): unknown => {
  const records = Array.from({ length: 21 }, (_, i): ShapeRecord => ({ p: i === 0 ? -1 : Math.floor((i - 1) / 4), wants: true, linked: true, w: 10 + i, h: 20 + i, ox: i, oy: 2, ex: 0, ey: 0, ew: 10 + i, eh: 20 + i }));
  return loadShapes(edit)(records, { limit: MAX_BANDS }, records.map((r) => r.p));
};

describe("the edits of the freeze ablation", () => {
  it("give variants with the result of the shapes module", () => {
    const expected = JSON.stringify(shapesOn((source) => source));
    expect(JSON.stringify(shapesOn(freezeEnvelope))).toBe(expected);
    expect(JSON.stringify(shapesOn(noFreeze))).toBe(expected);
  });

  it("stop when the text of an edit is not in the source", () => {
    expect(() => noFreeze("const x = 1;")).toThrow(/in the shapes module/);
  });
});

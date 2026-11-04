import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { childRecord, fitChild, GRID_LINKED, measureVars, NODE_FIXED_KIDS, placeTreeInput, RADIAL_TWO } from "./inputs.ts";
import { gridRun } from "./ireko-grid.ts";
import { measureRecords } from "./ireko-measure.ts";
import { IREKO_COMMITTED, IREKO_NOT_COMMITTED, irekoName, irekoSource, isIrekoModule, loadModule, type IrekoModule } from "./ireko-modules.ts";
import { radialRun } from "./ireko-radial.ts";

/** One input of a module: the arguments of its function. */
type Args = readonly unknown[];

/** This function gives the arguments of a run of a sheet from its records and variables. */
function sheetArgs(records: readonly { readonly p: number }[], vars: unknown): Args {
  return [records, vars, records.map((r) => r.p)];
}

/** This function gives one value of a generator, with a fixed seed. */
function one<T>(values: fc.Arbitrary<T>): T {
  const [value] = fc.sample(values, { seed: 20261104, numRuns: 1 });
  if (value === undefined) throw new Error("The generator gave no value.");
  return value;
}

/** This function gives the input of the arguments of the module of a strategy. */
function strategyArgs(run: ReturnType<typeof gridRun>): Args {
  return [run.space.records, run.vars];
}

/** This table gives a valid input for each committed module. */
const INPUTS: Readonly<Partial<Record<IrekoModule, () => Args>>> = {
  measure: () => sheetArgs(measureRecords(one(fc.array(fitChild, { minLength: 1, maxLength: 3 }))), one(measureVars)),
  place: () => {
    const { records, vars } = one(placeTreeInput(4));
    return sheetArgs(records, vars);
  },
  shape: () => [NODE_FIXED_KIDS.map(childRecord), { w: 100, h: 20, limit: 2 }],
  grid: () => strategyArgs(gridRun(GRID_LINKED)),
  radial: () => strategyArgs(radialRun(RADIAL_TWO)),
};

/** This function gives the text with a fault of the printed code in the first catch of the function of the module. */
function withFault(source: string, name: string): string {
  const at = source.indexOf("try {", source.indexOf(`function ${name}(`));
  if (at < 0) throw new Error(`The function ${name} has no catch.`);
  return `${source.slice(0, at)}try { printedFault();${source.slice(at + "try {".length)}`;
}

describe("the standalone modules of ireko (COMPILE.MODULE.FAULT)", () => {
  it("COMPILE.MODULE: each row prints a module with no import, and the list of the committed modules names each row", () => {
    expect([...IREKO_COMMITTED, ...IREKO_NOT_COMMITTED].every((which) => !irekoSource(which, "throw").includes("import"))).toBe(true);
    expect(["grid", "layers", "measure", "place", "radial", "shape", "tree"].every(isIrekoModule)).toBe(true);
    expect(isIrekoModule("other")).toBe(false);
  });

  it.each(IREKO_COMMITTED)("COMPILE.MODULE.FAULT: the module %s has the form with throw, and a build prints the other form", (which) => {
    expect(irekoSource(which, "throw")).toContain("function FK(");
    expect(irekoSource(which, "value")).not.toContain("function FK(");
  });

  it.each(IREKO_COMMITTED)("COMPILE.MODULE.FAULT: a fault of the printed code leaves the run of the module %s, and a build hides it", (which) => {
    const name = irekoName(which);
    const args = INPUTS[which]?.() ?? [];
    const thrown = loadModule(withFault(irekoSource(which, "throw"), name), name) as (...a: Args) => unknown;
    const hidden = loadModule(withFault(irekoSource(which, "value"), name), name) as (...a: Args) => unknown;
    expect(() => thrown(...args)).toThrow(ReferenceError);
    expect(() => hidden(...args)).not.toThrow();
  });
});

import { SheetRun } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fitChild as child, measureVars as vars } from "./inputs.ts";
import { fitNode, MEASURE_COLUMNS, MEASURE_DOMAINS, measureRecords, measureSpace, type Fit, type FitChild, type MeasureVars } from "./ireko-measure.ts";
import { irekoRun, irekoSource } from "./ireko-modules.ts";

type Columns = Readonly<Record<string, readonly unknown[]>>;
type Run = (records: unknown, vars: unknown, parents: unknown) => Columns;

/** This function gives the run of the standalone module of the sheet, as the build of ireko writes it. */
function moduleOf(): Run {
  // The fit reads only its own record and the parent, so the module has no search.
  expect(irekoSource("measure", "throw")).not.toContain("function SH(");
  return irekoRun("measure") as Run;
}

/** This function gives the fit from the columns of a run: the node at the position 0, and the children after it. */
function fitOf(columns: Columns, n: number): Fit {
  const read = (name: string, i: number): unknown => columns[name]?.[i];
  const num = (name: string, i = 0): number => {
    const value = read(name, i);
    if (typeof value !== "number") throw new Error(`The column ${name} has no number at ${String(i)}.`);
    return value;
  };
  const small = read("small", 0);
  if (typeof small !== "boolean") throw new Error("The column small has no boolean at 0.");
  return {
    bounds: { x: num("bx"), y: num("by"), width: num("bw"), height: num("bh") },
    first: { width: num("firstW"), height: num("firstH") },
    small,
    size: { width: num("sw"), height: num("sh") },
    placement: Array.from({ length: n }, (_, k) => ({ x: num("lx", k + 1), y: num("ly", k + 1), scale: num("ls", k + 1) })),
  };
}

describe("the ireko measure pilot", () => {
  const measure = moduleOf();
  const run = (children: readonly FitChild[], v: MeasureVars): Fit => {
    const records = measureRecords(children);
    return fitOf(
      measure(
        records,
        v,
        records.map((r) => r.p),
      ),
      children.length,
    );
  };

  it("COMPILE.MODULE.SHEET COMPILE.MODULE.TREE: the module gives the fit of the measure pass of ireko, with the same bits", () => {
    fc.assert(
      fc.property(fc.array(child, { minLength: 1, maxLength: 30 }), vars, (children, v) => {
        expect(run(children, v)).toEqual(fitNode(children, v));
      }),
      { numRuns: 300 },
    );
  });

  it("COMPILE.MODULE.SHEET: the sheet gives the fit of ireko in SheetRun, the interpreter of the module", () => {
    fc.assert(
      fc.property(fc.array(child, { minLength: 1, maxLength: 6 }), vars, (children, v) => {
        const records = measureRecords(children);
        const s = measureSpace(records);
        const sheet = new SheetRun(MEASURE_COLUMNS, { space: s, domains: MEASURE_DOMAINS, vars: { ...v } });
        const columns = Object.fromEntries(
          [...MEASURE_COLUMNS.keys()].map((c) => [
            c,
            s.keys.map((k) => {
              const r = sheet.cell(c, k);
              if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
              return r.value;
            }),
          ]),
        );
        expect(fitOf(columns, children.length)).toEqual(fitNode(children, v));
      }),
      { numRuns: 40 },
    );
  });

  it("gives the fit of fixed cases: a scaled box, a box too small for its padding, and a linked node", () => {
    const base: MeasureVars = { linked: false, content: false, cx: 0, cy: 0, cw: 0, ch: 0, ownW: 10, ownH: 10, expW: 0, expH: 0, hasW: false, hasH: false, nodeW: 0, nodeH: 0, padding: 4, header: 0, grow: true, scale: false, clip: false };
    const two: FitChild[] = [
      { offset: { x: 0, y: 0 }, extent: { x: 0, y: 0, width: 20, height: 10 } },
      { offset: { x: 30, y: 0 }, extent: { x: 0, y: 0, width: 20, height: 10 } },
    ];
    // The content is 50 by 10. With the padding 4, the box is 58 by 18.
    expect(run(two, base)).toEqual({ bounds: { x: 0, y: 0, width: 50, height: 10 }, first: { width: 58, height: 18 }, small: false, size: { width: 58, height: 18 }, placement: [{ x: 4, y: 4, scale: 1 }, { x: 34, y: 4, scale: 1 }] });
    // A fixed box of 33 by 13 scales the content by 0.5, and centers it.
    const scaled = run(two, { ...base, grow: false, scale: true, hasW: true, hasH: true, nodeW: 33, nodeH: 13 });
    expect(scaled.size).toEqual({ width: 33, height: 13 });
    expect(scaled.placement).toEqual([{ x: 4, y: 4, scale: 0.5 }, { x: 19, y: 4, scale: 0.5 }]);
    // A fixed box of 5 by 5 cannot hold the padding 4: it grows to 9 by 9.
    const small = run(two, { ...base, grow: false, clip: true, hasW: true, hasH: true, nodeW: 5, nodeH: 5 });
    expect([small.small, small.first, small.size]).toEqual([true, { width: 5, height: 5 }, { width: 9, height: 9 }]);
    expect(small.placement[0]).toEqual({ x: 4, y: 4, scale: 1 });
    // A linked node keeps the offsets, and its extent holds its own box and the subtrees.
    const linked = run(two, { ...base, linked: true });
    expect([linked.bounds, linked.placement]).toEqual([{ x: 0, y: 0, width: 50, height: 10 }, [{ x: 0, y: 0, scale: 1 }, { x: 30, y: 0, scale: 1 }]]);
  });
});

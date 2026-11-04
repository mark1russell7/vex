import { app, axes, cell, each, index, lit, offset, ref, SheetRun, space, v as bound, type Expr } from "@mark1russell7/vex";
import { emitSheetModule } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fitChild as child, measureVars as vars } from "./inputs.ts";
import { fitNode, MEASURE_COLUMNS, MEASURE_DOMAINS, MEASURE_KINDS, MEASURE_SCHEMA, measureRecords, measureSpace, type Fit, type FitChild, type MeasureVars } from "./ireko-measure.ts";

type Columns = Readonly<Record<string, readonly unknown[]>>;
type Run = (records: unknown, vars: unknown, parents: unknown) => Columns;
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);

/** This function gives the run of the standalone module of the sheet, as the build of ireko writes it. */
function moduleOf(): Run {
  const m = emitSheetModule(MEASURE_COLUMNS, { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: MEASURE_KINDS, space: "tree", name: "measureOf" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // The fit reads only its own record and the parent, so the module has no search.
  expect(m.source).not.toContain("function SH(");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return measureOf;`)() as Run;
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

/**
 * The bounds over an array of children, with no node record. Each key keeps the union up to it, and each key reads the
 * union of the last key at a computed position. `MEASURE_COLUMNS` stays a tree: a node with no children has no key in
 * an array, and the columns of the node have one value for each node.
 */
describe("SHEET.CELL.COMPUTED: the bounds of a fit over an array", () => {
  const last = op("subtract", op("count", each(axes.all, lit(1))), lit(1));
  const before = (column: string, start: Expr): Expr => op("ifError", cell(column, [offset(-1)]), start);

  /** This function gives the columns of the union on one axis. */
  const axis = (name: string, o: string, at: string, size: string, start: string, startSize: string, own: string): readonly (readonly [string, Expr])[] => {
    const here = op("add", ref(o), ref(at));
    const lo = before(`lo${name}`, op("if", bound("linked"), lit(0), bound(start)));
    const len = before(`len${name}`, op("if", bound("linked"), bound(own), bound(startSize)));
    const low = op("min", lo, here);
    return [
      [`lo${name}`, op("if", cell("seen"), low, here)],
      [`len${name}`, op("if", cell("seen"), op("subtract", op("max", op("add", lo, len), op("add", here, ref(size))), low), ref(size))],
      [`b${name}`, cell(`lo${name}`, [index(last)])],
      [`s${name}`, cell(`len${name}`, [index(last)])],
    ];
  };
  const columns = new Map<string, Expr>([
    // The first key has a union only if the node has a start rectangle. Each later key has a union.
    ["seen", op("or", op("ifError", op("or", cell("seen", [offset(-1)]), lit(true)), lit(false)), op("or", bound("linked"), bound("content")))],
    ...axis("x", "ox", "ex", "ew", "cx", "cw", "ownW"),
    ...axis("y", "oy", "ey", "eh", "cy", "ch", "ownH"),
  ]);
  const options = { domains: MEASURE_DOMAINS, schema: MEASURE_SCHEMA, kinds: { seen: "boolean", lox: "number", leny: "number", lenx: "number", loy: "number" }, name: "boundsOf" } as const;

  it("SHEET.CELL.COMPUTED COMPILE.MODULE.SHEET.COMPUTED: a read of the last key gives the bounds of ireko, with the same bits", () => {
    const m = emitSheetModule(columns, options);
    if (!m.ok) throw new Error(m.reason);
    // Each read of a cell reads a finished cell, so the module has no search.
    expect(m.source).not.toContain("function SH(");
    // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in the build of ireko.
    const boundsOf = new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn boundsOf;`)() as (records: unknown, vars: unknown) => Columns;
    fc.assert(
      fc.property(fc.array(child, { minLength: 1, maxLength: 30 }), vars, (children, x) => {
        const records = measureRecords(children).slice(1);
        const out = boundsOf(records, x);
        const end = records.length - 1;
        expect({ x: out["bx"]?.[end], y: out["by"]?.[end], width: out["sx"]?.[end], height: out["sy"]?.[end] }).toEqual(fitNode(children, x).bounds);
        const sheet = new SheetRun(columns, { space: space.array(records), domains: MEASURE_DOMAINS, vars: { ...x } });
        expect(["bx", "by", "sx", "sy"].map((c) => sheet.cell(c, "0"))).toEqual(["bx", "by", "sx", "sy"].map((c) => ({ ok: true, value: out[c]?.[0] })));
      }),
      { numRuns: 100 },
    );
  });
});

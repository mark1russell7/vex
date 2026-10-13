import { compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, toVexChain } from "@vex/formula";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { axisColumns, chartColumns, chartData, chartTitle, defaultChart, describeChart, frameOf, LIMIT, niceAxis, pointLabel, toPixel, xText, type ChartData } from "./chart.ts";
import { deleteColumn, emptyDoc, isSheetDoc, setChart, type SheetDoc } from "./doc.ts";
import { evaluateDoc, type Compiler } from "./engine.ts";
import { EXAMPLES } from "./examples.ts";

const compiler: Compiler = { compile: compileFormula, toVexChain, highlight: highlightFormula, functions: FUNCTIONS, domains: FORMULA_DOMAINS };

/** This function gives an example, its evaluation and the ids of its rows. */
function example(id: string): { readonly doc: SheetDoc; readonly ev: ReturnType<typeof evaluateDoc>; readonly rows: readonly string[] } {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (ex === undefined) throw new Error(id);
  return { doc: ex.doc, ev: evaluateDoc(ex.doc, compiler), rows: ex.doc.rows.map((r) => r.id) };
}

/** A document with one number column and the texts `cells`. */
function numbers(cells: readonly string[]): SheetDoc {
  return { version: 1, title: "N", columns: [{ id: "c1", name: "V", kind: "value", type: "number" }], rows: cells.map((t, i) => ({ id: `r${i + 1}`, parent: null, cells: { c1: t } })) };
}

/** The coordinates of the property tests. The constants found two defects of the axes: a subnormal end and a wrong step. */
const edgy = fc.oneof(fc.double({ min: -LIMIT, max: LIMIT, noNaN: true }), fc.integer({ min: -1000, max: 1000 }), fc.constantFrom(0, 5e-324, -5e-324, 1e-200, LIMIT, -LIMIT, 0.1, 0.3));

/** This function gives the columns of the first chart of an example. */
function first(id: string): readonly string[] {
  const { doc, ev } = example(id);
  return defaultChart(doc, ev).series;
}

const ofData = (x: [number, number], y: [number, number], sameScale: boolean): ChartData => ({ series: [], xName: "Row", xDates: false, x: { min: x[0], max: x[1] }, y: { min: y[0], max: y[1] }, sameScale });

describe("the chart", () => {
  it("draws a line for each column of numbers, across the column of the axis", () => {
    const { doc, ev, rows } = example("prey");
    const spec = doc.chart ?? { x: null, series: [] };
    const data = chartData(doc, ev, rows, spec);
    expect(data.series.map((s) => [s.name, s.kind, s.runs.length, s.runs[0]?.length, s.missing])).toEqual([
      ["Rabbits", "line", 1, 30, 0],
      ["Foxes", "line", 1, 30, 0],
    ]);
    expect(data.series[0]?.runs[0]?.[0]).toEqual({ x: 0, y: 100, row: "r1", index: 0 });
    expect([data.xName, data.x, data.sameScale]).toEqual(["Week", { min: 0, max: 29 }, false]);
    expect(chartTitle(data)).toBe("Rabbits and Foxes across Week");
    expect(describeChart(data)).toBe("Rabbits: 30 points, from 86.268703 to 212.588879. Foxes: 30 points, from 20 to 112.881911.");
    const s = data.series[1];
    const p = s?.runs[0]?.[4];
    expect(s === undefined || p === undefined ? "" : pointLabel(s, p, data.xName)).toBe("Foxes at Week 4: 20.757208");
    // Without a column for the axis, the number of the row on the screen is the axis.
    const byRow = chartData(doc, ev, rows, { ...spec, x: null });
    expect([byRow.xName, byRow.x, chartTitle({ ...byRow, series: byRow.series.slice(0, 1) })]).toEqual(["Row", { min: 1, max: 30 }, "Rabbits across the rows"]);
  });

  it("draws a path for a column of vectors, with one scale on the two axes", () => {
    const { doc, ev, rows } = example("ball");
    const data = chartData(doc, ev, rows, doc.chart ?? { x: null, series: [] });
    const path = data.series[0];
    expect([path?.name, path?.kind, path?.runs[0]?.length, data.sameScale, chartTitle(data)]).toEqual(["Position", "path", 12, true, "Position"]);
    expect(path?.runs[0]?.slice(0, 2)).toEqual([
      { x: 0, y: 0, row: "r1", index: 0 },
      { x: 1, y: 3, row: "r2", index: 1 },
    ]);
    expect(path === undefined || path.runs[0]?.[1] === undefined ? "" : pointLabel(path, path.runs[0][1], data.xName)).toBe("Position, row 2: (1, 3)");
    const f = frameOf(data, 600, 240);
    if (f === undefined) throw new Error("no frame");
    // One unit has the same length in pixels on the two axes, so the arc of the ball keeps its form.
    expect((f.right - f.left) / (f.x.max - f.x.min)).toBeCloseTo((f.bottom - f.top) / (f.y.max - f.y.min), 9);
    for (const p of path?.runs.flat() ?? []) {
      const q = toPixel(f, p);
      expect(q.x >= f.left && q.x <= f.right && q.y >= f.top && q.y <= f.bottom).toBe(true);
    }
  });

  it("breaks the line at a cell that is not a point, and counts the cells without a point", () => {
    const doc = numbers(["1", "oops", "3", "", "5", "1e16"]);
    const data = chartData(doc, evaluateDoc(doc, compiler), doc.rows.map((r) => r.id), { x: null, series: ["c1"] });
    expect(data.series[0]?.runs.map((run) => run.map((p) => p.y))).toEqual([[1], [3], [5]]);
    expect(data.series[0]?.missing).toBe(3);
    expect(LIMIT).toBe(1e15);
    // A column for the axis without a number at a row gives no point at that row.
    const two: SheetDoc = { ...doc, columns: [...doc.columns, { id: "c2", name: "Twice", kind: "formula", formula: "= V * 2" }] };
    const across = chartData(two, evaluateDoc(two, compiler), two.rows.map((r) => r.id), { x: "c1", series: ["c2"] });
    expect(across.series[0]?.runs.flat().map((p) => [p.x, p.y])).toEqual([[1, 2], [3, 6], [5, 10]]);
  });

  it("uses the rows on the screen in their order, and draws only columns of numbers or vectors", () => {
    const { doc, ev, rows } = example("grades");
    expect(chartColumns(doc, ev).map((c) => c.name)).toEqual(["Score", "Rank"]);
    expect(chartData(doc, ev, rows, { x: null, series: ["c1", "c4", "c5"] }).series).toEqual([]);
    const back = chartData(doc, ev, rows.toReversed(), { x: null, series: ["c2"] });
    expect(back.series[0]?.runs[0]?.[0]).toEqual({ x: 1, y: 91, row: "r5", index: 0 });
    const none = chartData(doc, ev, [], { x: null, series: ["c2"] });
    expect([none.x, frameOf(none, 600, 240), describeChart(none)]).toEqual([undefined, undefined, "Score: 0 points."]);
  });

  it("uses a column of dates for the horizontal axis, with the days since 1970-01-01 and the text of the dates", () => {
    const { doc, ev, rows } = example("invoices");
    expect(axisColumns(doc, ev).map((c) => `${c.name}${c.dates ? " (dates)" : ""}`)).toEqual(["Issued (dates)", "Terms", "Due (dates)", "Pay by (dates)", "Paid (dates)", "Days late"]);
    const data = chartData(doc, ev, rows, { x: "c2", series: ["c3"] });
    // 2026-09-01 is day 20697, from Date.parse of JavaScript.
    expect([data.xDates, data.xName, data.series[0]?.runs[0]?.[0]?.x]).toEqual([true, "Issued", 20697]);
    const s = data.series[0];
    const p = s?.runs[0]?.[0];
    expect(s === undefined || p === undefined ? "" : pointLabel(s, p, data.xName, data.xDates)).toBe("Terms at Issued 2026-09-01: 30");
    expect([xText(20697, true), xText(20697, false), chartData(doc, ev, rows, { x: "c3", series: ["c3"] }).xDates]).toEqual(["2026-09-01", "20,697", false]);
  });

  it("starts with the first formula column that it can draw", () => {
    expect([first("budget"), first("grades"), first("shapes")]).toEqual([["c3"], ["c3"], ["c4"]]);
    const plain = numbers(["4"]);
    expect(defaultChart(plain, evaluateDoc(plain, compiler))).toEqual({ x: null, series: ["c1"] });
    expect(defaultChart(emptyDoc(), evaluateDoc(emptyDoc(), compiler))).toEqual({ x: null, series: [] });
  });

  it("keeps the chart in the document: a deleted column leaves the chart, and a chart uses only known columns", () => {
    const { doc } = example("prey");
    expect(deleteColumn(doc, "c1").chart).toEqual({ x: null, series: ["c2", "c3"] });
    expect(deleteColumn(doc, "c2").chart).toEqual({ x: "c1", series: ["c3"] });
    expect(setChart(doc, undefined)).not.toHaveProperty("chart");
    expect(isSheetDoc(setChart(doc, undefined))).toBe(true);
    expect(isSheetDoc(setChart(doc, { x: "c9", series: [] }))).toBe(false);
    expect(isSheetDoc(setChart(doc, { x: null, series: ["c2", "c2"] }))).toBe(false);
    expect(isSheetDoc({ ...doc, chart: { x: null } })).toBe(false);
    expect(isSheetDoc({ ...doc, chart: "line" })).toBe(false);
  });

  it("gives round ticks that cover each range, with a bounded number of ticks", () => {
    const coord = edgy;
    fc.assert(
      fc.property(coord, coord, fc.integer({ min: 1, max: 12 }), (a, b, count) => {
        const r = { min: Math.min(a, b), max: Math.max(a, b) };
        const axis = niceAxis(r, count);
        expect(axis.min).toBeLessThanOrEqual(r.min);
        expect(axis.max).toBeGreaterThanOrEqual(r.max);
        expect(axis.max).toBeGreaterThan(axis.min);
        expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
        expect(axis.ticks.length).toBeLessThanOrEqual(count + 5);
        // The step is 1, 2 or 5 times a power of 10, and the ticks go up by the step.
        const mantissa = Number((axis.step / 10 ** Math.floor(Math.log10(axis.step))).toPrecision(6));
        expect([1, 2, 5]).toContain(mantissa);
        expect(axis.ticks).toEqual(axis.ticks.toSorted((p, q) => p - q));
        expect(new Set(axis.ticks).size).toBe(axis.ticks.length);
      }),
    );
    expect(niceAxis({ min: 0, max: 29 }, 6)).toEqual({ min: 0, max: 30, step: 5, ticks: [0, 5, 10, 15, 20, 25, 30] });
    expect(niceAxis({ min: 0.1, max: 0.3 }, 2).ticks).toEqual([0.1, 0.2, 0.3]);
    expect(niceAxis({ min: 5, max: 5 }, 4)).toMatchObject({ min: 2, max: 8 });
    // The smallest number above 0 is not 0 after the rounding of the ends.
    expect(niceAxis({ min: -1, max: 5e-324 }, 1).max).toBeGreaterThan(0);
    // A range too narrow for the precision of its numbers gets space on each side, and the loop of the ticks ends.
    expect(niceAxis({ min: 1e15, max: 1e15 + 0.125 }, 5).ticks.length).toBeLessThanOrEqual(13);
  });

  it("gives a frame with one scale for paths, and a bounded number of ticks on each axis", () => {
    const coord = edgy;
    const range = fc.tuple(coord, coord).map(([a, b]): [number, number] => [Math.min(a, b), Math.max(a, b)]);
    fc.assert(
      fc.property(range, range, fc.boolean(), fc.integer({ min: 240, max: 1600 }), fc.integer({ min: 160, max: 260 }), (x, y, same, w, h) => {
        const f = frameOf(ofData(x, y, same), w, h);
        if (f === undefined) throw new Error("no frame");
        expect(f.x.ticks.length).toBeLessThanOrEqual(2 * Math.max(2, Math.floor((f.right - f.left) / 90)) + 3);
        expect(f.y.ticks.length).toBeLessThanOrEqual(2 * Math.max(2, Math.floor((f.bottom - f.top) / 45)) + 3);
        for (const [p, q] of [[x[0], y[0]], [x[1], y[1]]] as const) {
          const px = toPixel(f, { x: p, y: q });
          expect(px.x).toBeGreaterThanOrEqual(f.left - 1e-6);
          expect(px.x).toBeLessThanOrEqual(f.right + 1e-6);
          expect(px.y).toBeGreaterThanOrEqual(f.top - 1e-6);
          expect(px.y).toBeLessThanOrEqual(f.bottom + 1e-6);
        }
        const ratio = (f.right - f.left) / (f.x.max - f.x.min) / ((f.bottom - f.top) / (f.y.max - f.y.min));
        expect(same ? ratio : 1).toBeCloseTo(1, 6);
      }),
    );
  });
});

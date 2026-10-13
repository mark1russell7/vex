/**
 * The data of the chart. A column of numbers gives a line over the horizontal axis. A column of vectors gives a path
 * through its points. Some cells are not points: a cell with an error value, an empty cell, a value of another kind,
 * or a number larger than `LIMIT`. A cell that is not a point breaks the line.
 *
 * The chart uses the rows on the screen, in their order. Thus a sort or a filter changes the chart.
 */
import type { Result } from "@mark1russell7/vex";
import { LocalDate, Vec2 } from "@mark1russell7/vex-domains";
import type { ChartSpec, SheetDoc } from "./doc.ts";
import type { Evaluation } from "./engine.ts";
import { formatValue } from "./values.ts";

/** The kind of a series: a line of numbers, or a path of vectors. */
export type SeriesKind = "line" | "path";

/** A column that a chart can draw. */
export interface ChartColumn {
  readonly id: string;
  readonly name: string;
  readonly kind: SeriesKind;
}

/** A point of the chart, the row that gives it, and the number of that row on the screen. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly row: string;
  readonly index: number;
}

/** A series of the chart. */
export interface ChartSeries {
  readonly column: string;
  readonly name: string;
  readonly kind: SeriesKind;
  /** The runs of points. A cell that is not a point ends a run. */
  readonly runs: readonly (readonly ChartPoint[])[];
  /** The number of cells that are not points. */
  readonly missing: number;
}

/** The range of the values on one axis. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/** The data of a chart. */
export interface ChartData {
  readonly series: readonly ChartSeries[];
  /** The name of the horizontal axis. */
  readonly xName: string;
  /** The value is true when the horizontal axis is a column of dates. Then a value of the axis is the count of days since 1970-01-01. */
  readonly xDates: boolean;
  /** The range of the points on each axis. A chart without points has no range. */
  readonly x: Range | undefined;
  readonly y: Range | undefined;
  /** The value is true when each series is a path. Then the two axes have one scale, so a shape keeps its form. */
  readonly sameScale: boolean;
}

/** The name of the horizontal axis without a column. */
export const ROW_AXIS = "Row";

/** The largest size of a coordinate of a point. A larger number is not a point, because the axes lose their precision. */
export const LIMIT = 1e15;

const inLimit = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && Math.abs(n) <= LIMIT;
const numberOf = (r: Result<unknown> | undefined): number | undefined => (r?.ok === true && typeof r.value === "number" ? r.value : undefined);
/** The value of a cell on the horizontal axis: a number, or the days of a date since 1970-01-01. */
const axisValueOf = (r: Result<unknown> | undefined): number | undefined => (r?.ok === true && r.value instanceof LocalDate ? r.value.days : numberOf(r));

/** This function gives the kind of a column from its first value: a number gives a line, and a vector gives a path. */
export function seriesKind(doc: SheetDoc, ev: Evaluation, column: string): SeriesKind | undefined {
  for (const r of doc.rows) {
    const res = ev.cell(r.id, column);
    if (res?.ok !== true) continue;
    if (typeof res.value === "number") return "line";
    return res.value instanceof Vec2 ? "path" : undefined;
  }
  return undefined;
}

/** This function gives the columns that a chart can draw, in the order of the document. */
export function chartColumns(doc: SheetDoc, ev: Evaluation): readonly ChartColumn[] {
  return doc.columns.flatMap((c) => {
    const kind = seriesKind(doc, ev, c.id);
    return kind === undefined ? [] : [{ id: c.id, name: c.name, kind }];
  });
}

/** A column that the horizontal axis can use: a column of numbers or a column of dates. */
export interface AxisColumn {
  readonly id: string;
  readonly name: string;
  readonly dates: boolean;
}

/** This function gives the columns that the horizontal axis can use, in the order of the document. */
export function axisColumns(doc: SheetDoc, ev: Evaluation): readonly AxisColumn[] {
  return doc.columns.flatMap((c) => {
    const first = doc.rows.map((r) => ev.cell(r.id, c.id)).find((r) => r?.ok === true);
    const v = first?.ok === true ? first.value : undefined;
    return typeof v === "number" || v instanceof LocalDate ? [{ id: c.id, name: c.name, dates: v instanceof LocalDate }] : [];
  });
}

/** This function gives a first chart for a document: the first formula column that a chart can draw, over the rows. */
export function defaultChart(doc: SheetDoc, ev: Evaluation): ChartSpec {
  const all = chartColumns(doc, ev);
  const formulas = new Set(doc.columns.filter((c) => c.kind === "formula").map((c) => c.id));
  const first = all.find((c) => formulas.has(c.id)) ?? all[0];
  return { x: null, series: first === undefined ? [] : [first.id] };
}

/** This function gives the data of the chart `spec` over the rows `rows`, in their order. */
export function chartData(doc: SheetDoc, ev: Evaluation, rows: readonly string[], spec: ChartSpec): ChartData {
  const byId = new Map(doc.columns.map((c) => [c.id, c]));
  const xCol = spec.x === null ? undefined : byId.get(spec.x);
  const xs = rows.map((id, i) => (xCol === undefined ? i + 1 : axisValueOf(ev.cell(id, xCol.id))));
  const xDates = xCol !== undefined && axisColumns(doc, ev).some((c) => c.id === xCol.id && c.dates);
  const series = spec.series.flatMap((id): ChartSeries[] => {
    const col = byId.get(id);
    const kind = seriesKind(doc, ev, id);
    if (col === undefined || kind === undefined) return [];
    const runs: ChartPoint[][] = [];
    let run: ChartPoint[] = [];
    let missing = 0;
    rows.forEach((row, index) => {
      const res = ev.cell(row, id);
      const v = res?.ok === true ? res.value : undefined;
      const x = kind === "line" ? xs[index] : v instanceof Vec2 ? v.x : undefined;
      const y = kind === "line" ? numberOf(res) : v instanceof Vec2 ? v.y : undefined;
      if (!inLimit(x) || !inLimit(y)) {
        missing++;
        if (run.length > 0) runs.push(run);
        run = [];
      } else run.push({ x, y, row, index });
    });
    if (run.length > 0) runs.push(run);
    return [{ column: id, name: col.name, kind, runs, missing }];
  });
  const points = series.flatMap((s) => s.runs.flat());
  const range = (pick: (p: ChartPoint) => number): Range | undefined =>
    points.length === 0 ? undefined : { min: Math.min(...points.map(pick)), max: Math.max(...points.map(pick)) };
  return {
    series,
    xName: xCol?.name ?? ROW_AXIS,
    xDates,
    x: range((p) => p.x),
    y: range((p) => p.y),
    sameScale: series.length > 0 && series.every((s) => s.kind === "path"),
  };
}

/** An axis: the range that it shows, the distance between two ticks, and the ticks. */
export interface Axis {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly ticks: readonly number[];
}

/** This function removes the error of floating point from a tick, so `0.1 * 3` gives `0.3`. */
const clean = (n: number): number => Number(n.toPrecision(12));

/** The largest number of ticks on one axis. The loop of the ticks stops there, whatever the numbers are. */
const MAX_TICKS = 100;

/** This function gives the ticks of the range `[min, max]` at the multiples of `step`. */
function ticksIn(min: number, max: number, step: number): readonly number[] {
  const out: number[] = [];
  const first = Math.ceil(clean(min / step));
  for (let i = 0; i < MAX_TICKS; i++) {
    const t = clean((first + i) * step);
    if (t > max + step * 1e-9) break;
    out.push(t);
  }
  return out;
}

/** This function gives a round step near `span / count`: 1, 2 or 5 times a power of 10. A span of 0 gives 0. */
function stepFor(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  if (!(raw > 0) || !(pow > 0)) return 0;
  const f = raw / pow;
  return clean((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow);
}

/**
 * This function gives an axis that covers the range `r` with approximately `count` ticks. The distance between two
 * ticks is 1, 2 or 5 times a power of 10. A range of one value gets space on each side. A range that is too narrow for
 * the precision of its numbers also gets space on each side, so the ticks are different numbers.
 */
export function niceAxis(r: Range, count: number): Axis {
  const size = Math.max(Math.abs(r.min), Math.abs(r.max));
  // The numbers below `1e-200` include the subnormal numbers, which do not have the digits for a round step.
  const narrow = stepFor(r.max - r.min, count) <= Math.max(size * 1e-10, 1e-200);
  const mid = r.min / 2 + r.max / 2;
  const pad = Math.max(1, size / 2);
  const min = narrow ? mid - pad : r.min;
  const max = narrow ? mid + pad : r.max;
  const step = stepFor(max - min, count);
  // The rounding of `clean` can move an end past the range by a small amount. Then the end moves one step out.
  const lo0 = clean(Math.floor(clean(min / step)) * step);
  const hi0 = clean(Math.ceil(clean(max / step)) * step);
  const lo = lo0 > r.min ? clean(lo0 - step) : lo0;
  const hi = hi0 < r.max ? clean(hi0 + step) : hi0;
  return { min: lo, max: hi, step, ticks: ticksIn(lo, hi, step) };
}

/** This function makes an axis wider, about its center, so it shows the length `span` with approximately `count` ticks. */
function widen(a: Axis, span: number, count: number): Axis {
  const mid = (a.min + a.max) / 2;
  const min = mid - span / 2;
  const max = mid + span / 2;
  const step = stepFor(span, count);
  return { min, max, step, ticks: ticksIn(min, max, step) };
}

/** The frame of a chart: the edges of the plot in pixels, and the axes. */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly x: Axis;
  readonly y: Axis;
}

/** The space around the plot, in pixels, for the labels of the ticks. */
export const MARGIN = { left: 56, right: 16, top: 12, bottom: 28 } as const;

/**
 * This function gives the frame of a chart of `width` by `height` pixels. A chart of paths gets one scale on the two
 * axes. A chart without points has no frame.
 */
export function frameOf(data: ChartData, width: number, height: number): Frame | undefined {
  if (data.x === undefined || data.y === undefined) return undefined;
  const left = MARGIN.left;
  const top = MARGIN.top;
  const right = Math.max(left + 1, width - MARGIN.right);
  const bottom = Math.max(top + 1, height - MARGIN.bottom);
  const xCount = Math.max(2, Math.floor((right - left) / 90));
  const yCount = Math.max(2, Math.floor((bottom - top) / 45));
  const x = niceAxis(data.x, xCount);
  const y = niceAxis(data.y, yCount);
  if (!data.sameScale) return { left, top, right, bottom, x, y };
  // One scale: the pixels for one unit are the smaller of the two, and the other axis shows more units.
  const scale = Math.min((right - left) / (x.max - x.min), (bottom - top) / (y.max - y.min));
  return { left, top, right, bottom, x: widen(x, (right - left) / scale, xCount), y: widen(y, (bottom - top) / scale, yCount) };
}

/** This function gives the pixel of a point in a frame. The vertical axis goes up. */
export function toPixel(f: Frame, p: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } {
  return {
    x: f.left + ((p.x - f.x.min) / (f.x.max - f.x.min)) * (f.right - f.left),
    y: f.bottom - ((p.y - f.y.min) / (f.y.max - f.y.min)) * (f.bottom - f.top),
  };
}

/** This function gives the title of a chart for a screen reader, for example "Rabbits and Foxes across Week". */
export function chartTitle(data: ChartData): string {
  const names = data.series.map((s) => s.name);
  const list = names.length <= 1 ? (names[0] ?? "No column") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
  if (data.series.every((s) => s.kind === "path")) return list;
  return `${list} across ${data.xName === ROW_AXIS ? "the rows" : data.xName}`;
}

/** This function gives a description of the points of a chart, for a screen reader. */
export function describeChart(data: ChartData): string {
  return data.series
    .map((s) => {
      const pts = s.runs.flat();
      const span = (pick: (p: ChartPoint) => number): string =>
        pts.length === 0 ? "" : `from ${formatValue(Math.min(...pts.map(pick)))} to ${formatValue(Math.max(...pts.map(pick)))}`;
      const where = pts.length === 0 ? "" : s.kind === "line" ? `, ${span((p) => p.y)}` : `, x ${span((p) => p.x)}, y ${span((p) => p.y)}`;
      return `${s.name}: ${pts.length} point${pts.length === 1 ? "" : "s"}${where}.`;
    })
    .join(" ");
}

/** This function gives the text of a value of the horizontal axis: a number, or a date for an axis of dates. */
export const xText = (x: number, dates: boolean): string => (dates ? new LocalDate(x).toString() : formatValue(x));

/** This function gives the label of a point, for example "Rabbits, row 5: 125.3" or "Position, row 2: (1, 3)". */
export function pointLabel(s: ChartSeries, p: ChartPoint, xName: string, dates = false): string {
  if (s.kind === "path") return `${s.name}, row ${p.index + 1}: (${formatValue(p.x)}, ${formatValue(p.y)})`;
  return xName === ROW_AXIS ? `${s.name}, row ${p.index + 1}: ${formatValue(p.y)}` : `${s.name} at ${xName} ${xText(p.x, dates)}: ${formatValue(p.y)}`;
}

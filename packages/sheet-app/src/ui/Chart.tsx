/**
 * The chart: an SVG drawing of the chart of the document, over the rows on the screen. The bar above the drawing
 * chooses the columns and the horizontal axis. A click on a point selects its row, and the selected row has a ring.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { chartColumns, chartData, chartTitle, describeChart, frameOf, pointLabel, toPixel, type ChartSeries, type Frame } from "../chart.ts";
import type { ChartSpec, SheetDoc } from "../doc.ts";
import type { Evaluation } from "../engine.ts";
import { formatValue } from "../values.ts";

/** The properties of the chart. */
export interface ChartProps {
  readonly doc: SheetDoc;
  readonly ev: Evaluation;
  /** The rows on the screen, in order. */
  readonly rows: readonly string[];
  readonly spec: ChartSpec;
  /** The selected row. */
  readonly selected: string;
  readonly onChange: (spec: ChartSpec) => void;
  readonly onSelectRow: (row: string) => void;
}

/** The number of colors of the series. The next series starts the colors again. */
const COLORS = 6;
const colorOf = (i: number): string => `var(--vs-series-${(i % COLORS) + 1})`;

/** Above this number of points, a line shows a dot only at the selected row. */
const DOTS = 80;

/** The lines, the dots and the ring of one series. */
function SeriesView(props: { readonly s: ChartSeries; readonly color: string; readonly frame: Frame; readonly xName: string; readonly selected: string; readonly onSelectRow: (row: string) => void }): ReactElement {
  const { s, frame } = props;
  const count = s.runs.reduce((n, r) => n + r.length, 0);
  return (
    <g className="vs-series" style={{ color: props.color }}>
      {s.runs.map((run, i) => (
        <polyline key={i} points={run.map((p) => toPixel(frame, p)).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} />
      ))}
      {s.runs.flat().map((p) => {
        const q = toPixel(frame, p);
        const on = p.row === props.selected;
        if (!on && count > DOTS) return null;
        return (
          <circle key={p.row} className={on ? "vs-dot vs-dot-sel" : "vs-dot"} cx={q.x} cy={q.y} r={on ? 5 : 3} onClick={() => props.onSelectRow(p.row)}>
            <title>{pointLabel(s, p, props.xName)}</title>
          </circle>
        );
      })}
    </g>
  );
}

/** The chart. */
export function Chart(props: ChartProps): ReactElement {
  const { doc, ev, rows, spec } = props;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const titleId = useId();
  const descId = useId();

  // The drawing has the width of its box, so the text keeps its size on each screen.
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e?.contentRect.width ?? 640))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => chartColumns(doc, ev), [doc, ev]);
  const data = useMemo(() => chartData(doc, ev, rows, spec), [doc, ev, rows, spec]);
  const height = Math.round(Math.min(260, Math.max(160, width * 0.36)));
  const frame = frameOf(data, width, height);
  const toggle = (id: string): void => props.onChange({ ...spec, series: spec.series.includes(id) ? spec.series.filter((s) => s !== id) : [...spec.series, id] });
  const missing = data.series.filter((s) => s.missing > 0);

  return (
    <section className="vs-chart" aria-label="The chart">
      <div className="vs-chart-bar">
        {/* A path has its own horizontal axis, so a chart of paths has no choice of the axis. */}
        {data.sameScale ? null : (
          <label className="vs-chart-axis">
            <span>Across</span>
            <select value={spec.x ?? ""} onChange={(e) => props.onChange({ ...spec, x: e.target.value === "" ? null : e.target.value })}>
              <option value="">Row number</option>
              {columns
                .filter((c) => c.kind === "line")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="vs-chart-series" role="group" aria-label="The columns that the chart draws">
          {columns.map((c) => {
            const at = spec.series.indexOf(c.id);
            return (
              <button key={c.id} type="button" className="vs-chip vs-key" aria-pressed={at >= 0} onClick={() => toggle(c.id)}>
                <span className="vs-key-mark" aria-hidden="true" style={at >= 0 ? { background: colorOf(at) } : undefined} />
                {c.name}
                {c.kind === "path" ? <span className="vs-chip-hint">vector</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div ref={box} className="vs-chart-box">
        {frame === undefined ? (
          <p className="vs-chart-empty">{spec.series.length === 0 ? "Choose a column to draw." : "The columns have no numbers or vectors on the rows on the screen."}</p>
        ) : (
          <svg className="vs-chart-svg" width={width} height={height} role="img" aria-labelledby={titleId} aria-describedby={descId}>
            <title id={titleId}>{`A chart of ${chartTitle(data)}`}</title>
            <desc id={descId}>{describeChart(data)}</desc>
            <g className="vs-axis">
              {frame.y.ticks.map((t) => {
                const y = toPixel(frame, { x: frame.x.min, y: t }).y;
                return (
                  <g key={`y${t}`}>
                    <line x1={frame.left} x2={frame.right} y1={y} y2={y} className={t === 0 ? "vs-axis-zero" : undefined} />
                    <text x={frame.left - 9} y={y} textAnchor="end" dominantBaseline="middle">
                      {formatValue(t)}
                    </text>
                  </g>
                );
              })}
              {frame.x.ticks.map((t) => {
                const x = toPixel(frame, { x: t, y: frame.y.min }).x;
                return (
                  <g key={`x${t}`}>
                    <line x1={x} x2={x} y1={frame.top} y2={frame.bottom} className={t === 0 ? "vs-axis-zero" : undefined} />
                    <text x={x} y={frame.bottom + 16} textAnchor="middle">
                      {formatValue(t)}
                    </text>
                  </g>
                );
              })}
            </g>
            {data.series.map((s, i) => (
              <SeriesView key={s.column} s={s} color={colorOf(i)} frame={frame} xName={data.xName} selected={props.selected} onSelectRow={props.onSelectRow} />
            ))}
          </svg>
        )}
      </div>
      {missing.length === 0 ? null : (
        <p className="vs-chart-note">
          {missing.map((s) => `${s.name}: ${s.missing} row${s.missing === 1 ? " has" : "s have"} no point.`).join(" ")}
        </p>
      )}
    </section>
  );
}

/**
 * The grid pilot: a uniform grid layout as one Vex program. The reader changes the number of
 * items, the columns, the gap and the width of the bounds. The program evaluates at each item and gives its
 * rectangle. A chip shows if the rectangles of the program are equal to the rectangles of the plain TypeScript
 * implementation.
 */
import { gridProgram, gridReference, gridRoot, gridVex, type GridItem } from "@vex/pilots";
import { sizeOf } from "@mark1russell7/vex";
import { useMemo, useState, type ReactElement } from "react";

/** This function gives the sizes of the items, from a seed. Some items have no size. */
function itemsOf(n: number, seed: number): readonly GridItem[] {
  let x = seed;
  const next = (): number => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  return Array.from({ length: n }, (): GridItem => {
    if (next() < 0.12) return {};
    return { width: 40 + Math.round(next() * 90), height: 30 + Math.round(next() * 60) };
  });
}

const HUES = [35, 194, 12, 250, 120, 300, 60, 170, 330, 220, 90, 270];

/** A slider with its label and its value. For the columns, 0 shows as "auto". */
function slider(label: string, value: number, set: (v: number) => void, min: number, max: number, step = 1): ReactElement {
  return (
    <label className="vx-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.currentTarget.value))} aria-label={label} />
      <output>{label === "columns" && value === 0 ? "auto" : value}</output>
    </label>
  );
}

/** The grid pilot. */
export default function GridPilot(): ReactElement {
  const [count, setCount] = useState(7);
  const [columns, setColumns] = useState(0);
  const [gap, setGap] = useState(12);
  const [width, setWidth] = useState(420);
  const [seed, setSeed] = useState(7);

  const items = useMemo(() => itemsOf(count, seed), [count, seed]);
  const config = useMemo(() => ({ columns, gap }), [columns, gap]);
  const bounds = useMemo(() => ({ width, height: 400 }), [width]);
  const rects = useMemo(() => gridVex(items, bounds, config), [items, bounds, config]);
  const agrees = useMemo(() => JSON.stringify(rects) === JSON.stringify(gridReference(items, bounds, config)), [rects, items, bounds, config]);
  const nodes = useMemo(() => sizeOf(gridProgram(gridRoot(items), bounds, config).program), [items, bounds, config]);

  const right = Math.max(width, ...rects.map((r) => r.left + r.width));
  const bottom = Math.max(100, ...rects.map((r) => r.top + r.height));

  return (
    <section className="vx-frame" aria-label="The grid pilot">
      <header>
        <strong>A uniform grid layout, as one formula</strong>
        <span className="vx-row">
          <span className="vx-chip" data-state={agrees ? "pass" : "fail"} data-testid="grid-agrees">
            {agrees ? "equal to the reference" : "different from the reference"}
          </span>
          <button type="button" className="vx-button" onClick={() => setSeed((s) => s + 1)}>
            New sizes
          </button>
        </span>
      </header>
      <div className="vx-body vx-row" style={{ flexWrap: "wrap", gap: "1rem" }}>
        {slider("items", count, setCount, 0, 12)}
        {slider("columns", columns, setColumns, 0, 6)}
        {slider("gap", gap, setGap, 0, 40)}
        {slider("bounds width", width, setWidth, 120, 800, 20)}
      </div>
      <svg viewBox={`-4 -4 ${right + 8} ${bottom + 8}`} width="100%" style={{ maxHeight: 420 }} role="img" aria-label="The rectangles of the items">
        <rect x={0} y={0} width={width} height={bottom} fill="none" stroke="var(--color-rule-strong)" strokeDasharray="6 4" />
        {rects.map((r, i) => {
          const sized = items[i]?.width !== undefined;
          return (
            <g key={i}>
              <rect
                x={r.left}
                y={r.top}
                width={r.width}
                height={r.height}
                rx={4}
                fill={`hsl(${HUES[i % HUES.length] ?? 0} 70% 55% / 0.35)`}
                stroke={`hsl(${HUES[i % HUES.length] ?? 0} 70% 40%)`}
                strokeDasharray={sized ? undefined : "4 3"}
              />
              <text x={r.left + 6} y={r.top + 18} fontSize={14} fontWeight={700} fill="currentColor">
                {i}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="vx-muted">
        {rects.length} rectangles from a program of {nodes} nodes. A dashed item has no size, so it gets the size of the cell.
      </p>
    </section>
  );
}

/**
 * The boxes of the specimen on graph paper, as SVG. The view marks the origin, the focus, the reads of the
 * current step (blue arrows, red for a failed read) and the boxes with an error. The reader can drag a box,
 * or select it and move it with the arrow keys.
 */
import { Vec2 } from "@mark1russell7/vex-domains";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { moveBox, type BoxKey, type Boxes } from "../lib/specimen.ts";

/** One arrow from a box to a box. */
export interface ReadArrow {
  readonly from: string;
  readonly to: string;
  readonly ok: boolean;
}

/** The properties of the view. */
export interface SpaceViewProps {
  readonly boxes: Boxes;
  readonly origin?: string;
  readonly focus?: string;
  readonly reads?: readonly ReadArrow[];
  readonly errorKeys?: readonly string[];
  readonly dimKeys?: readonly string[];
  readonly draggable?: boolean;
  readonly onSelect?: (k: BoxKey) => void;
  /** More SVG content in grid units, for example vectors. */
  readonly overlay?: ReactNode;
  readonly label: string;
}

/** The size of one grid unit, in pixels of the view box. */
export const UNIT = 24;
/** The size of the graph paper, in cells: the columns and the rows. */
export const COLS = 20;
export const ROWS = 15;

const centre = (b: Boxes, k: string): readonly [number, number] => {
  const box = b[k as BoxKey];
  return [(box.position.x + box.size.x / 2) * UNIT, (box.position.y + box.size.y / 2) * UNIT];
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The view. */
export function SpaceView(props: SpaceViewProps): ReactElement {
  const { boxes, origin, focus, reads = [], errorKeys = [], dimKeys = [], draggable = true } = props;
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ readonly key: BoxKey; readonly dx: number; readonly dy: number } | undefined>(undefined);

  const toGrid = (e: PointerEvent): readonly [number, number] => {
    const el = svg.current;
    if (el === null) return [0, 0];
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * COLS, ((e.clientY - r.top) / r.height) * ROWS];
  };

  const place = (k: BoxKey, x: number, y: number): void => {
    const s = boxes[k].size;
    moveBox(k, new Vec2(clamp(Math.round(x), 0, COLS - s.x), clamp(Math.round(y), 0, ROWS - s.y)));
  };

  const onKey = (k: BoxKey, e: KeyboardEvent): void => {
    if (!draggable) return;
    const step: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const p = boxes[k].position;
    place(k, p.x + d[0], p.y + d[1]);
  };

  return (
    <svg
      ref={svg}
      className="graph-paper"
      viewBox={`0 0 ${COLS * UNIT} ${ROWS * UNIT}`}
      role="group"
      aria-label={props.label}
      style={{ width: "100%", height: "auto", maxHeight: "30rem", display: "block", touchAction: "none", borderBottom: "1px solid var(--color-rule)" }}
      onPointerMove={(e) => {
        if (drag === undefined) return;
        const [gx, gy] = toGrid(e);
        place(drag.key, gx - drag.dx, gy - drag.dy);
      }}
      onPointerUp={() => setDrag(undefined)}
      onPointerLeave={() => setDrag(undefined)}
    >
      <defs>
        <marker id="vx-arrow-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-accent)" />
        </marker>
        <marker id="vx-arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-mark)" />
        </marker>
      </defs>
      {(Object.keys(boxes) as BoxKey[]).map((k) => {
        const b = boxes[k];
        const isOrigin = k === origin;
        const isFocus = k === focus;
        const isError = errorKeys.includes(k);
        const isDim = dimKeys.includes(k);
        const stroke = isError ? "var(--color-mark)" : isOrigin || isFocus ? "var(--color-accent)" : "var(--color-ink)";
        return (
          <g
            key={k}
            tabIndex={0}
            role="button"
            aria-label={`Box ${k}, ${b.name}, at ${b.position.x}, ${b.position.y}, size ${b.size.x} by ${b.size.y}${isOrigin ? ", the origin" : ""}${isFocus ? ", the focus" : ""}`}
            style={{ cursor: draggable ? (drag?.key === k ? "grabbing" : "grab") : "pointer", opacity: isDim ? 0.35 : 1, outline: "none" }}
            onPointerDown={(e) => {
              props.onSelect?.(k);
              if (!draggable) return;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              const [gx, gy] = toGrid(e);
              setDrag({ key: k, dx: gx - b.position.x, dy: gy - b.position.y });
            }}
            onKeyDown={(e) => onKey(k, e)}
          >
            <rect
              x={b.position.x * UNIT}
              y={b.position.y * UNIT}
              width={b.size.x * UNIT}
              height={b.size.y * UNIT}
              rx={3}
              fill={isFocus ? "var(--color-accent-wash)" : isError ? "var(--color-mark-wash)" : `rgba(${b.color.r}, ${b.color.g}, ${b.color.b}, 0.12)`}
              stroke={stroke}
              strokeWidth={isOrigin ? 3 : isFocus ? 2.5 : 1.5}
              strokeDasharray={isFocus && !isOrigin ? "6 4" : undefined}
            />
            <circle cx={b.position.x * UNIT} cy={b.position.y * UNIT} r={3} fill="var(--color-ink)" />
          </g>
        );
      })}
      {/* The labels are a layer above all boxes, with a halo, so the border of another box never hides a label. */}
      <g pointerEvents="none" aria-hidden="true" style={{ paintOrder: "stroke" }} stroke="var(--color-page)" strokeWidth={4} strokeLinejoin="round">
        {(Object.keys(boxes) as BoxKey[]).map((k) => {
          const b = boxes[k];
          return (
            <g key={k} opacity={dimKeys.includes(k) ? 0.35 : 1}>
              <text x={b.position.x * UNIT + 6} y={b.position.y * UNIT + 19} fontFamily="var(--font-mono)" fontSize={16} fontWeight={700} fill="var(--color-ink)">
                {k}
              </text>
              <text x={b.position.x * UNIT + 22} y={b.position.y * UNIT + 19} fontFamily="var(--font-sans)" fontSize={13} fill="var(--color-ink-secondary)">
                {b.name}
              </text>
            </g>
          );
        })}
      </g>
      {reads
        .filter((r) => r.from !== r.to && r.from in boxes && r.to in boxes)
        .map((r, i) => {
          const [x1, y1] = centre(boxes, r.from);
          const [x2, y2] = centre(boxes, r.to);
          return (
            <line
              key={`${r.from}-${r.to}-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={r.ok ? "var(--color-accent)" : "var(--color-mark)"}
              strokeWidth={2}
              markerEnd={`url(#${r.ok ? "vx-arrow-ok" : "vx-arrow-bad"})`}
              pointerEvents="none"
            />
          );
        })}
      {props.overlay}
    </svg>
  );
}

/** This function draws a vector from a grid point, as an SVG arrow in grid units. */
export function VectorArrow(props: { readonly from: Vec2; readonly v: Vec2; readonly color?: string; readonly label?: string }): ReactElement {
  const x1 = props.from.x * UNIT;
  const y1 = props.from.y * UNIT;
  const x2 = (props.from.x + props.v.x) * UNIT;
  const y2 = (props.from.y + props.v.y) * UNIT;
  const color = props.color ?? "var(--color-accent)";
  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2.5} markerEnd="url(#vx-arrow-ok)" />
      {props.label === undefined ? null : (
        <text x={x2 + 4} y={y2 - 4} fontFamily="var(--font-mono)" fontSize={11} fill={color}>
          {props.label}
        </text>
      )}
    </g>
  );
}

/**
 * The layout audit of Jqy, live. The boxes are the output of the Jqy engine for a nested radial tree. Four Vex
 * formulas check each child box against its parent, and a fifth formula places a child on the ring of its parent.
 * The formulas come from `@vex/pilots`, and its tests compare them with a reference on random layouts.
 *
 * The reader can drag a box, or select it and move it with the arrow keys. A box with a finding has a red edge. The
 * panel shows the result of each check at the selected box, and the steps of one check.
 */
import { Vec2 } from "@mark1russell7/vex-domains";
import { checkResults, explainCheck, placedVex, type AuditCode, type AuditOptions, type LayoutBox } from "@vex/pilots";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { show } from "../lib/format.ts";
import { Code } from "./Code.tsx";

const TUNING: AuditOptions = { pad: 16, gap: 4, minRadius: 8 };

const box = (id: string, x: number, y: number, w: number, h: number, parent?: string, radial?: boolean): LayoutBox => ({
  id,
  position: new Vec2(x, y),
  size: new Vec2(w, h),
  ...(parent === undefined ? {} : { parent }),
  ...(radial === undefined ? {} : { radial }),
});

/** The output of the Jqy engine (commit 8848753) with the spacing 16 and the default tuning. */
const START: readonly LayoutBox[] = [
  box("app", 0, 0, 242, 242, undefined, true),
  box("api", 162, 95, 52, 52, "app", true),
  box("auth", 192, 117, 8, 8, "api"),
  box("users", 180, 124, 8, 8, "api"),
  box("billing", 180, 110, 8, 8, "api"),
  box("web", 105, 148, 73, 73, "app"),
  box("jobs", 31, 124, 73, 73, "app"),
  box("db", 31, 45, 73, 73, "app"),
  box("cache", 105, 21, 73, 73, "app"),
];

const CHECKS: readonly { readonly code: AuditCode; readonly title: string; readonly formula: string }[] = [
  {
    code: "NESTED_CHILD_OUTSIDE_PARENT",
    title: "Outside the parent",
    formula: `const parent = root.start(0).parent();
const inner = parent.from("size")._.subtract(2 * pad);
const innerLo = parent.from("position")._.add(pad);
root.from("position")._.subtract(innerLo)._.anyLessThan(-0.5)
  ._.or(innerLo._.add(inner)
    ._.subtract(root.from("position")._.add("size"))
    ._.anyLessThan(-0.5))`,
  },
  {
    code: "RADIAL_CHILD_OFF_RING",
    title: "Off the ring",
    formula: `const largest = root.start(0).parent()
  .children((c) => c.from("size")._.maxComponent()).max();
const ring = inner._.minComponent()._.divide(2)
  ._.subtract(largest._.add(gap)._.divide(2))._.max(minRadius);
parent.from("radial")._.and(
  centre._.distance(innerCentre)._.subtract(ring)._.abs()._.gt(1))`,
  },
  {
    code: "NESTED_CHILD_TOO_BIG",
    title: "Too big",
    formula: `root.from("size")._.maxComponent()
  ._.gt(inner._.minComponent()._.add(0.5))`,
  },
  {
    code: "NESTED_CHILD_NOT_SQUARE",
    title: "Not square",
    formula: `root.from("size")._.swap()._.subtract("size")
  ._.abs()._.maxComponent()._.gt(0.5)`,
  },
];

/** This function moves the box `id` and each box under it by `d`. */
function moveTree(boxes: readonly LayoutBox[], id: string, d: Vec2): LayoutBox[] {
  const under = new Set([id]);
  for (const b of boxes) if (b.parent !== undefined && under.has(b.parent)) under.add(b.id);
  return boxes.map((b) => (under.has(b.id) ? { ...b, position: b.position.add(d) } : b));
}

/** The inner centre of a parent box: the centre of its ring. */
const innerCentre = (p: LayoutBox): Vec2 => p.position.add(Vec2.scalar(TUNING.pad)).add(p.size.subtract(Vec2.scalar(2 * TUNING.pad)).halve());

/** The layout audit. */
export default function AuditLab(): ReactElement {
  const [boxes, setBoxes] = useState<readonly LayoutBox[]>(START);
  const [selected, setSelected] = useState("auth");
  const [check, setCheck] = useState<AuditCode>("NESTED_CHILD_OUTSIDE_PARENT");
  const drag = useRef<{ readonly id: string; readonly last: Vec2 } | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);

  const results = useMemo(() => checkResults(boxes, TUNING), [boxes]);
  const placed = useMemo(() => placedVex(boxes, TUNING), [boxes]);
  const trace = useMemo(() => explainCheck(boxes, TUNING, check, selected), [boxes, check, selected]);
  const failing = (id: string): readonly AuditCode[] => CHECKS.filter((c) => { const r = results[id]?.[c.code]; return r?.ok === true && r.value === true; }).map((c) => c.code);
  const findings = boxes.flatMap((b) => failing(b.id).map((code) => ({ id: b.id, code })));
  const selectedBox = boxes.find((b) => b.id === selected);

  const toWorld = (e: ReactPointerEvent): Vec2 => {
    const m = svg.current?.getScreenCTM()?.inverse();
    if (m === undefined) return Vec2.scalar(0);
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return new Vec2(p.x, p.y);
  };
  const onMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (d === undefined) return;
    const now = toWorld(e);
    const step = now.subtract(d.last).round();
    if (step.x === 0 && step.y === 0) return;
    drag.current = { id: d.id, last: d.last.add(step) };
    setBoxes((bs) => moveTree(bs, d.id, step));
  };
  const onKey = (id: string, e: KeyboardEvent): void => {
    const n = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: new Vec2(-n, 0), ArrowRight: new Vec2(n, 0), ArrowUp: new Vec2(0, -n), ArrowDown: new Vec2(0, n) }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    setBoxes((bs) => moveTree(bs, id, d));
  };
  const placeOnRings = (): void => {
    // The parents come before their children, so each child goes to the ring of its parent at its new place.
    let bs: readonly LayoutBox[] = boxes;
    for (const b of boxes) {
      const p = placedVex(bs, TUNING).get(b.id);
      const now = bs.find((x) => x.id === b.id);
      if (p?.ok !== true || !(p.value instanceof Vec2) || now === undefined) continue;
      bs = moveTree(bs, b.id, p.value.subtract(now.size.halve()).subtract(now.position));
    }
    setBoxes(bs);
  };

  return (
    <section className="vx-frame" aria-label="The layout audit">
      <header>
        <strong>The layout audit of Jqy</strong>
        <span className="vx-row">
          <span className="vx-muted" role="status">
            {findings.length === 0 ? "no findings" : `${findings.length} finding${findings.length === 1 ? "" : "s"}`}
          </span>
          <button type="button" className="vx-button" onClick={placeOnRings}>
            Place on the rings
          </button>
          <button type="button" className="vx-button" onClick={() => setBoxes(START)}>
            Reset
          </button>
        </span>
      </header>
      <div className="vx-body">
        <svg ref={svg} viewBox="-8 -8 258 258" className="graph-paper" style={{ width: "100%", maxHeight: "28rem", display: "block", touchAction: "none" }} role="group" aria-label="The boxes of the layout. Drag a box, or select it and use the arrow keys." onPointerMove={onMove} onPointerUp={() => (drag.current = undefined)} onPointerCancel={() => (drag.current = undefined)}>
          {boxes.map((b) => {
            const bad = failing(b.id).length > 0;
            const isSel = b.id === selected;
            return (
              <rect
                key={b.id}
                x={b.position.x}
                y={b.position.y}
                width={b.size.x}
                height={b.size.y}
                rx={2}
                tabIndex={0}
                role="button"
                aria-label={`${b.id}${bad ? `, findings: ${failing(b.id).join(", ")}` : ""}`}
                aria-pressed={isSel}
                fill={bad ? "var(--color-mark-wash)" : b.parent === undefined ? "var(--color-surface)" : "var(--color-accent-wash)"}
                stroke={bad ? "var(--color-mark)" : isSel ? "var(--color-accent)" : "var(--color-ink)"}
                strokeWidth={isSel || bad ? 2 : 1}
                style={{ cursor: b.parent === undefined ? "pointer" : "grab", outline: "none" }}
                onPointerDown={(e) => {
                  setSelected(b.id);
                  if (b.parent === undefined) return;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  drag.current = { id: b.id, last: toWorld(e).round() };
                }}
                onFocus={() => setSelected(b.id)}
                onKeyDown={(e) => onKey(b.id, e)}
              />
            );
          })}
          {/* The rings are above the boxes, so each child shows its centre on the ring of its parent. */}
          {boxes
            .filter((p) => p.radial === true)
            .map((p) => {
              const first = boxes.find((b) => b.parent === p.id);
              const r = first === undefined ? undefined : placed.get(first.id);
              const c = innerCentre(p);
              return r?.ok === true && r.value instanceof Vec2 ? <circle key={`ring-${p.id}`} cx={c.x} cy={c.y} r={r.value.distance(c)} fill="none" stroke="var(--color-accent)" strokeDasharray="3 3" strokeWidth={1} pointerEvents="none" /> : null;
            })}
          <g pointerEvents="none" aria-hidden="true" style={{ paintOrder: "stroke" }} stroke="var(--color-surface)" strokeWidth={3} strokeLinejoin="round">
            {boxes
              .filter((b) => b.size.x >= 20)
              .map((b) => (
                <text key={b.id} x={b.position.x + 4} y={b.position.y + 12} fontFamily="var(--font-mono)" fontSize={10} fontWeight={700} fill="var(--color-ink)">
                  {b.id}
                </text>
              ))}
          </g>
        </svg>
      </div>
      <div className="vx-body vx-audit-panel">
        <div>
          <p className="vx-muted" style={{ margin: 0 }}>
            The checks at <strong>{selected}</strong>
            {selectedBox?.parent === undefined ? " (a root: it has no parent, so the checks that read the parent give an error value)" : ""}:
          </p>
          <table className="vx-table" style={{ width: "100%" }} aria-label="The checks at the selected box">
            <tbody>
              {CHECKS.map((c) => {
                const r = results[selected]?.[c.code];
                const text = r === undefined ? "" : !r.ok ? r.error.code : r.value === true ? "fails" : "passes";
                return (
                  <tr key={c.code} style={{ background: c.code === check ? "var(--color-accent-wash)" : undefined }}>
                    <th scope="row">
                      <button type="button" onClick={() => setCheck(c.code)} style={{ all: "unset", cursor: "pointer" }} aria-pressed={c.code === check}>
                        {c.title}
                      </button>
                    </th>
                    <td className={r !== undefined && r.ok && r.value === true ? "vx-cell-error" : undefined}>{text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <pre className="vx-code" style={{ fontSize: "var(--text-xs)", whiteSpace: "pre", overflowX: "auto" }} tabIndex={0} role="region" aria-label="The formula of the selected check">
          <Code code={CHECKS.find((c) => c.code === check)?.formula ?? ""} />
        </pre>
      </div>
      <details className="vx-body">
        <summary>
          The steps of "{CHECKS.find((c) => c.code === check)?.title}" at {selected}
        </summary>
        <ol style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", listStyle: "none", paddingLeft: 0 }}>
          {trace.events.map((e, i) => (
            <li key={i} style={{ paddingLeft: `${Math.min(e.path.length, 10)}ch` }}>
              {e.label} @{e.focus} → {e.result.ok ? show(e.result.value) : e.result.error.code}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

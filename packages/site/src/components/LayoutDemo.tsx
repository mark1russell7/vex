/**
 * The layout demo: the reason that Vex exists. A Vex program gives each box a push away from the boxes that
 * it overlaps. The push is the sum of the directions from their centres to its centre. Drag the boxes to see the
 * pushes change. "Relax" moves each box one step along its push, and repeats until no box overlaps.
 */
import { Vec2 } from "@mark1russell7/vex-domains";
import { useMemo, type ReactElement } from "react";
import { show } from "../lib/format.ts";
import { getBoxes, resetBoxes, rootOf, setBoxes, useBoxes, type BoxKey, type Boxes, type SpecimenRoot } from "../lib/specimen.ts";
import { COLS, ROWS, SpaceView, UNIT } from "./SpaceView.tsx";

const KEYS: readonly BoxKey[] = ["A", "B", "C", "D"];

/** The code of the push program. */
export const PUSH_CODE = `const centre = root.from("size")._.halve()._.add("position");
const push = centre
  .others(
    (e) => e._.subtract(e.from("size")._.halve()._.add("position"))._.normalize(),
    { where: overlaps },
  )
  .reduce("add");`;

/** This function builds the push program over a root. */
function pushOf(root: SpecimenRoot) {
  const centre = root.from("size")._.halve()._.add("position");
  return centre
    .others((e) => e._.subtract(e.from("size")._.halve()._.add("position"))._.normalize(), {
      where: (e) =>
        e.origin().from("position")._.add(e.origin().from("size"))._.subtract(e.from("position"))._.allPositive()._.and(
          e.from("position")._.add(e.from("size"))._.subtract(e.origin().from("position"))._.allPositive(),
        ),
    })
    .reduce("add");
}

/** This function moves each box one step along its push. A box stays on the graph paper, as a drag keeps it. */
export function relaxOnce(b: Boxes): Boxes {
  const t = pushOf(rootOf(b)).all();
  let next = b;
  for (const k of KEYS) {
    const o = t.get(k);
    if (o.tag !== "some") continue;
    const v = o.value;
    const p = next[k].position;
    next = { ...next, [k]: { ...next[k], position: new Vec2(Math.max(0, Math.min(COLS - next[k].size.x, p.x + Math.round(v.x))), Math.max(0, Math.min(ROWS - next[k].size.y, p.y + Math.round(v.y)))) } };
  }
  return next;
}

/** The demo. */
export default function LayoutDemo(): ReactElement {
  const boxes = useBoxes();
  const pushes = useMemo(() => {
    const t = pushOf(rootOf(boxes)).all();
    return KEYS.map((k) => ({ key: k, push: t.get(k) }));
  }, [boxes]);

  const overlay = (
    <g pointerEvents="none">
      {pushes.map(({ key: k, push }) => {
        if (push.tag !== "some") return null;
        const v = push.value;
        const b = boxes[k];
        const cx = (b.position.x + b.size.x / 2) * UNIT;
        const cy = (b.position.y + b.size.y / 2) * UNIT;
        if (v.length() === 0) return null;
        return (
          <g key={k}>
            <line x1={cx} y1={cy} x2={cx + v.x * UNIT * 2} y2={cy + v.y * UNIT * 2} stroke="var(--color-mark)" strokeWidth={3} markerEnd="url(#vx-arrow-bad)" />
          </g>
        );
      })}
    </g>
  );

  return (
    <section className="vx-frame" aria-label="The layout demo">
      <header>
        <strong>Push the boxes apart</strong>
        <span className="vx-row">
          <button
            type="button"
            className="vx-button"
            data-variant="primary"
            onClick={() => {
              let b = getBoxes();
              for (let i = 0; i < 12; i++) {
                const n = relaxOnce(b);
                if (KEYS.every((k) => n[k].position.equals(b[k].position))) break;
                b = n;
              }
              setBoxes(b);
            }}
          >
            Relax
          </button>
          <button type="button" className="vx-button" onClick={resetBoxes}>
            Reset
          </button>
        </span>
      </header>
      <SpaceView boxes={boxes} overlay={overlay} label="The boxes. Red arrows show the push of each box that overlaps another box." />
      <table className="vx-table">
        <tbody>
          {pushes.map(({ key: k, push }) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{push.tag !== "some" ? "error" : push.value.length() === 0 ? "no overlap, no push" : `push ${show(push.value)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <pre className="vx-code">{PUSH_CODE}</pre>
    </section>
  );
}

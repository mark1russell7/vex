import { Vec2 } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { INITIAL_BOXES, type Boxes } from "../lib/specimen.ts";
import { relaxOnce } from "./LayoutDemo.tsx";
import { COLS, ROWS } from "./SpaceView.tsx";

describe("the layout demo", () => {
  it("keeps a box at the right and the bottom edge of the graph paper, as a drag keeps it", () => {
    // B overlaps A from the top left, so the push of A points to the bottom right corner, out of the graph paper.
    const size = new Vec2(4, 4);
    const boxes: Boxes = {
      A: { ...INITIAL_BOXES.A, size, position: new Vec2(COLS - 4, ROWS - 4) },
      B: { ...INITIAL_BOXES.B, size, position: new Vec2(COLS - 6, ROWS - 6) },
      C: { ...INITIAL_BOXES.C, size: new Vec2(3, 3), position: new Vec2(0, 0) },
      D: { ...INITIAL_BOXES.D, size: new Vec2(2, 2), position: new Vec2(5, 0) },
    };
    const next = relaxOnce(boxes);
    // A stays at the edge. B moves away from A, and C and D do not overlap a box, so they stay.
    expect(next.A.position).toEqual(new Vec2(COLS - 4, ROWS - 4));
    expect(next.B.position).toEqual(new Vec2(COLS - 7, ROWS - 7));
    expect([next.C.position, next.D.position]).toEqual([boxes.C.position, boxes.D.position]);
  });
});

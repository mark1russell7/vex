import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gridProgram, gridReference, gridRoot, gridVex, type GridItem, type Rect } from "./grid.ts";

const overlap = (a: Rect, b: Rect): boolean => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

const size = fc.oneof(fc.integer({ min: 0, max: 400 }), fc.double({ min: 0, max: 400, noNaN: true }));
const item: fc.Arbitrary<GridItem> = fc.record({ width: size, height: size }, { requiredKeys: [] });
const bounds = fc.record({ width: fc.integer({ min: 0, max: 2000 }), height: fc.integer({ min: 0, max: 2000 }) });
const config = fc.record({ columns: fc.integer({ min: -1, max: 6 }), gap: fc.integer({ min: 0, max: 40 }) }, { requiredKeys: [] });

describe("the grid pilot", () => {
  it("four items of 100 by 100 in bounds of 400 by 400, with a gap of 10", () => {
    const items = [{ width: 100, height: 100 }, { width: 100, height: 100 }, { width: 100, height: 100 }, { width: 100, height: 100 }];
    const expected = [
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 110, top: 0, width: 100, height: 100 },
      { left: 0, top: 110, width: 100, height: 100 },
      { left: 110, top: 110, width: 100, height: 100 },
    ];
    expect(gridReference(items, { width: 400, height: 400 }, { gap: 10 })).toEqual(expected);
    expect(gridVex(items, { width: 400, height: 400 }, { gap: 10 })).toEqual(expected);
  });

  it("the Vex program and the reference give the same rectangles for random items, bounds and configurations", () => {
    fc.assert(
      fc.property(fc.array(item, { maxLength: 12 }), bounds, config, (items, b, c) => {
        expect(gridVex(items, b, c)).toEqual(gridReference(items, b, c));
      }),
    );
  });

  it("the rectangles of items with a positive size do not overlap", () => {
    const positive = fc.record({ width: fc.integer({ min: 1, max: 300 }), height: fc.integer({ min: 1, max: 300 }) });
    fc.assert(
      fc.property(fc.array(positive, { maxLength: 10 }), bounds, config, (items, b, c) => {
        const rects = gridVex(items, b, c);
        rects.forEach((r, i) => rects.slice(i + 1).forEach((s) => expect(overlap(r, s)).toBe(false)));
      }),
    );
  });

  it("an item without a size gets the cell size, and the trace shows the reads of the cell", () => {
    const items: readonly GridItem[] = [{ width: 50, height: 20 }, {}];
    expect(gridVex(items, { width: 500, height: 100 })[1]).toEqual({ left: 50, top: 0, width: 50, height: 20 });
    const root = gridRoot(items);
    const trace = gridProgram(root, { width: 500, height: 100 }).explain("1");
    expect(trace.events.some((e) => e.tag === "ext" && e.result.ok && e.result.value === 1)).toBe(true);
  });
});

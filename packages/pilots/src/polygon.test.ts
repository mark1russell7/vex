import { Vec2 } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { measureReference, measureVex } from "./polygon.ts";

const v = (x: number, y: number): Vec2 => new Vec2(x, y);
const polygon = fc.array(fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })), { minLength: 3, maxLength: 10 }).map((ps) => ps.map(([x, y]) => v(x, y)));
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a) + Math.abs(b));

/** The gap between two centroids, relative to their size: 0 if both are missing, Infinity if one is missing. */
const gap = (a: Vec2 | undefined, b: Vec2 | undefined): number =>
  a === undefined || b === undefined ? (a === b ? 0 : Number.POSITIVE_INFINITY) : a.distance(b) / (1 + b.length());

describe("the polygon pilot", () => {
  it("measures a unit square and a 3-4-5 triangle: the values checked by hand", () => {
    expect(measureVex([v(0, 0), v(1, 0), v(1, 1), v(0, 1)])).toEqual({ area: 1, perimeter: 4, centroid: v(0.5, 0.5) });
    // The triangle: the area is 4 * 3 / 2, the edges are 4, 5 and 3, and the centroid is the mean of the vertices.
    expect(measureVex([v(0, 0), v(4, 0), v(0, 3)])).toEqual({ area: 6, perimeter: 12, centroid: v(4 / 3, 1) });
    // Clockwise vertices give a negative area. A polygon with no area has no centroid.
    expect(measureVex([v(0, 0), v(0, 3), v(4, 0)]).area).toBe(-6);
    expect(measureVex([v(0, 0), v(1, 1), v(2, 2)]).centroid).toBeUndefined();
  });

  it("gives the measures of the reference for random polygons", () => {
    fc.assert(
      fc.property(polygon, (ps) => {
        const got = measureVex(ps);
        const want = measureReference(ps);
        expect(near(got.area, want.area) && near(got.perimeter, want.perimeter)).toBe(true);
        expect(gap(got.centroid, want.centroid)).toBeLessThan(1e-9);
      }),
    );
  });

  it("keeps the area, the perimeter and the centroid when the first vertex changes", () => {
    fc.assert(
      fc.property(polygon, fc.nat(), (ps, n) => {
        const k = n % ps.length;
        const a = measureVex(ps);
        const b = measureVex([...ps.slice(k), ...ps.slice(0, k)]);
        expect(near(a.area, b.area) && near(a.perimeter, b.perimeter)).toBe(true);
        // A tiny area can be 0 in one order and not in the other, so the centroid check needs an area that is not tiny.
        expect(Math.abs(a.area) < 1e-6 ? 0 : gap(a.centroid, b.centroid)).toBeLessThan(1e-9);
      }),
    );
  });

  it("changes the sign of the area and keeps the perimeter when the order of the vertices reverses", () => {
    fc.assert(
      fc.property(polygon, (ps) => {
        const a = measureVex(ps);
        const b = measureVex(ps.toReversed());
        expect(near(a.area, -b.area) && near(a.perimeter, b.perimeter)).toBe(true);
      }),
    );
  });
});

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { heatReference, heatVex, totalHeat, type HeatGrid } from "./heat.ts";

/** A random grid from 1 by 1 to 6 by 6, with temperatures from -100 to 100. */
const grid: fc.Arbitrary<number[][]> = fc
  .tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }))
  .chain(([rows, cols]) => fc.array(fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: cols, maxLength: cols }), { minLength: rows, maxLength: rows }));
const alpha = fc.double({ min: 0, max: 0.25, noNaN: true });
const steps = fc.integer({ min: 0, max: 6 });

/** The largest difference between two grids of the same shape. A grid of another shape gives Infinity. */
const maxDiff = (a: HeatGrid, b: HeatGrid): number =>
  a.length !== b.length ? Number.POSITIVE_INFINITY : Math.max(0, ...a.flatMap((row, i) => row.map((t, j) => Math.abs(t - (b[i]?.[j] ?? Number.NaN)))));

describe("the heat pilot", () => {
  it("spreads the heat of the center cell of a 3 by 3 grid: the values of two steps, checked by hand", () => {
    const start = [[0, 0, 0], [0, 100, 0], [0, 0, 0]];
    // Step 1: the center gives a quarter of its heat to each neighbor. A corner has no neighbor with heat.
    expect(heatVex(start, 0.25, 1)).toEqual([[0, 25, 0], [25, 0, 25], [0, 25, 0]]);
    // Step 2: a corner gets 0.25 * (25 + 25). An edge cell keeps 25 - 0.25 * 75. The center gets 0.25 * 100.
    expect(heatVex(start, 0.25, 2)).toEqual([[12.5, 6.25, 12.5], [6.25, 25, 6.25], [12.5, 6.25, 12.5]]);
    expect(heatReference(start, 0.25, 2)).toEqual(heatVex(start, 0.25, 2));
  });

  it("gives the grid of the reference for random grids, values of alpha and numbers of steps", () => {
    fc.assert(
      fc.property(grid, alpha, steps, (g, a, n) => {
        expect(maxDiff(heatVex(g, a, n), heatReference(g, a, n))).toBeLessThan(1e-9);
      }),
    );
  });

  it("keeps the total heat, because no heat leaves the grid", () => {
    fc.assert(
      fc.property(grid, alpha, steps, (g, a, n) => {
        const scale = 1 + g.flat().reduce((s, t) => s + Math.abs(t), 0);
        expect(Math.abs(totalHeat(heatVex(g, a, n)) - totalHeat(g)) / scale).toBeLessThan(1e-12);
      }),
    );
  });

  it("does not make a value larger than the largest value or smaller than the smallest value", () => {
    fc.assert(
      fc.property(grid, alpha, steps, (g, a, n) => {
        const after = heatVex(g, a, n).flat();
        expect(Math.max(...after)).toBeLessThanOrEqual(Math.max(...g.flat()) + 1e-9);
        expect(Math.min(...after)).toBeGreaterThanOrEqual(Math.min(...g.flat()) - 1e-9);
      }),
    );
  });
});

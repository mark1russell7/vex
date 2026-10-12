/**
 * The heat pilot: heat diffusion on a grid of cells. In each step, heat flows between each cell and its four
 * neighbors. The new value of a cell is `t + alpha * sum(neighbor - t)`. This is a weighted mean of the cell and its
 * neighbors, and the weights add up to 1. A cell at an edge has fewer neighbors. No heat leaves the grid, so the total
 * heat stays the same. For `alpha` up to 1/4, the largest value does not grow and the smallest value does not fall.
 *
 * The Vex program is one step at one cell. The host compiles the program once and runs it at each cell of each step.
 */
import { compile, space, vex, type Program } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";

/** A grid of temperatures: rows of cells. */
export type HeatGrid = readonly (readonly number[])[];

/** This function gives the compiled Vex program of one step at one cell. */
export function heatStep(alpha: number): Program {
  // The builder needs a space for the types. The program reads only the field `t`, so any grid of that shape works.
  const root = vex(NumDomain).over(space.grid([[{ t: 0 }]]));
  const flow = root.start(0).neighbors(4, (n) => n.from("t")._.subtract(n.origin().from("t"))).sum();
  return compile(root.from("t")._.add(flow._.multiply(alpha)).program, { domains: [NumDomain] });
}

/** This function gives the grid after `steps` steps, with the Vex program. A cell that gives an error throws. */
export function heatVex(grid: HeatGrid, alpha: number, steps: number): HeatGrid {
  const program = heatStep(alpha);
  let now = grid;
  for (let n = 0; n < steps; n++) {
    const s = space.grid(now.map((row) => row.map((t) => ({ t }))));
    now = now.map((row, i) =>
      row.map((_t, j) => {
        const r = program.run({ space: s, origin: `${i},${j}` });
        if (!r.ok || typeof r.value !== "number") throw new Error(`the cell ${i},${j} gave ${r.ok ? typeof r.value : r.error.code}`);
        return r.value;
      }),
    );
  }
  return now;
}

/** This function gives the grid after `steps` steps, in plain TypeScript. */
export function heatReference(grid: HeatGrid, alpha: number, steps: number): HeatGrid {
  let now = grid;
  for (let n = 0; n < steps; n++) {
    const prev = now;
    now = prev.map((row, i) =>
      row.map((t, j) => {
        let flow = 0;
        for (const [di, dj] of [[-1, 0], [0, -1], [0, 1], [1, 0]] as const) {
          const v = prev[i + di]?.[j + dj];
          if (v !== undefined) flow += v - t;
        }
        return t + flow * alpha;
      }),
    );
  }
  return now;
}

/** The total heat of a grid. */
export const totalHeat = (grid: HeatGrid): number => grid.flat().reduce((s, t) => s + t, 0);

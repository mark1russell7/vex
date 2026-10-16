import { compile, type Result } from "@mark1russell7/vex";
import { emitModule, tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GRID_DOMAINS, GRID_PROGRAM, GRID_SCHEMA, gridArrange, gridRun, type GridInput, type GridOutput } from "./ireko-grid.ts";

const size = fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true });
const coord = fc.double({ min: -200, max: 200, noNaN: true, noDefaultInfinity: true });
const input: fc.Arbitrary<GridInput> = fc.record({
  mode: fc.constantFrom("nested", "linked"),
  self: fc.record({ width: size, height: size }),
  extents: fc.array(fc.record({ x: coord, y: coord, width: size, height: size }), { minLength: 1, maxLength: 12 }),
  gap: fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
  options: fc.record({
    columns: fc.integer({ min: 0, max: 14 }),
    justify: fc.constantFrom("start", "center", "end"),
    align: fc.constantFrom("auto", "start", "center", "end"),
    uniform: fc.boolean(),
    side: fc.constantFrom("bottom", "top", "left", "right"),
    distance: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true })),
  }),
});

type Cell = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** This function evaluates the program at each child with `run`, and it gives the output of the strategy. */
function arrangeWith(run: (r: { readonly space: GridRun["space"]; readonly origin: string; readonly vars: GridRun["vars"] }) => Result<unknown>, i: GridInput): GridOutput {
  const { space, vars } = gridRun(i);
  const cells = space.keys.map((origin) => {
    const r = run({ space, origin, vars });
    if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.value as Cell;
  });
  return { offsets: cells.map((c) => ({ x: c.x, y: c.y })), width: cells[0]?.width ?? 0, height: cells[0]?.height ?? 0 };
}
type GridRun = ReturnType<typeof gridRun>;

describe("the ireko grid pilot", () => {
  const interpreted = compile(GRID_PROGRAM, { domains: GRID_DOMAINS });
  const generated = tiered(GRID_PROGRAM, { domains: GRID_DOMAINS });

  it("COMPILE.TIERED: the Vex program gives the layout of ireko with the same bits, in the interpreter and in tier 2", () => {
    fc.assert(
      fc.property(input, (i) => {
        const expected = gridArrange(i);
        expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
        expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
      }),
    );
    expect(generated.tier).toBe(2);
    expect(generated.stats.fallbacks).toBe(0);
  });

  it("COMPILE.MODULE: the standalone module of the program gives the layout of ireko with the same bits", () => {
    const m = emitModule(GRID_PROGRAM, { domains: GRID_DOMAINS, schema: GRID_SCHEMA, name: "grid" });
    if (!m.ok) throw new Error(m.reason);
    expect(m.source).not.toContain("import");
    // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
    const grid = new Function(`${m.source.replaceAll(/^export /gm, "")}
return grid;`)() as (records: unknown, vars: unknown) => readonly Cell[];
    fc.assert(
      fc.property(input, (i) => {
        const { space, vars } = gridRun(i);
        const cells = grid(space.records, vars);
        expect({ offsets: cells.map((c) => ({ x: c.x, y: c.y })), width: cells[0]?.width ?? 0, height: cells[0]?.height ?? 0 }).toEqual(gridArrange(i));
      }),
    );
  });

  it("gives the layout of fixed cases: a square grid of three children, and a tree in one row", () => {
    // Two columns 12 and 11 wide with a gap of 2, and two rows 5 high. Each child is at the center of its cell.
    const three = [0, 1, 2].map((k) => ({ x: 0, y: 0, width: 10 + k, height: 5 }));
    const options = { columns: 0, justify: "center", align: "auto", uniform: false, side: "bottom", distance: 0 } as const;
    expect(gridArrange({ mode: "nested", self: { width: 0, height: 0 }, extents: three, gap: 2, options })).toEqual({ offsets: [{ x: 1, y: 0 }, { x: 14, y: 0 }, { x: 0, y: 7 }], width: 25, height: 12 });
    expect(arrangeWith((r) => interpreted.run(r), { mode: "linked", self: { width: 20, height: 4 }, extents: three, gap: 2, options })).toEqual(
      gridArrange({ mode: "linked", self: { width: 20, height: 4 }, extents: three, gap: 2, options }),
    );
  });
});

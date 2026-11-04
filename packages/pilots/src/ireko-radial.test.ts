import { compile, type Result } from "@mark1russell7/vex";
import { tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RADIAL_MIXED, RADIAL_TWO, radialLarge as large, radialRing as ring } from "./inputs.ts";
import { irekoRun } from "./ireko-modules.ts";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, radialArrange, radialRun, type RadialInput, type RadialOutput } from "./ireko-radial.ts";

type Offset = { readonly x: number; readonly y: number };
type RadialRun = ReturnType<typeof radialRun>;

/** This function evaluates the program at each child with `run`, and it gives the output of the strategy. */
function arrangeWith(run: (r: { readonly space: RadialRun["space"]; readonly origin: string; readonly vars: RadialRun["vars"] }) => Result<unknown>, i: RadialInput): RadialOutput {
  const { space, vars } = radialRun(i);
  return {
    offsets: space.keys.map((origin) => {
      const r = run({ space, origin, vars });
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      return r.value as Offset;
    }),
  };
}

/** This function gives the function of the standalone module of the program. */
function moduleOf(): (records: unknown, vars: unknown) => readonly Offset[] {
  return irekoRun("radial") as (records: unknown, vars: unknown) => readonly Offset[];
}

describe("the ireko radial pilot", () => {
  const interpreted = compile(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS });
  const generated = tiered(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS });
  const radial = moduleOf();
  const expectSame = (i: RadialInput): void => {
    const { space, vars } = radialRun(i);
    expect({ offsets: radial(space.records, vars) }).toEqual(radialArrange(i));
  };

  it("COMPILE.MODULE LOOP.NAMES: the module gives the layout of ireko on each ring, with the same bits", () => {
    fc.assert(
      fc.property(ring(16), (i) => {
        expectSame(i);
      }),
    );
  });

  it("COMPILE.TIERED: the program gives the layout of ireko in the interpreter and in tier 2", () => {
    // The interpreter searches the radius again at each child, so these runs have few children.
    fc.assert(
      fc.property(ring(5), (i) => {
        const expected = radialArrange(i);
        expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
        expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
      }),
      { numRuns: 20 },
    );
    expect(generated.tier).toBe(2);
  });

  it("COMPILE.MODULE: the program gives the layout of ireko on a full ring of more than 256 children", () => {
    // A failure stops without a shrink: each run evaluates the program at more than 256 children.
    fc.assert(
      fc.property(large, (i) => {
        expectSame(i);
      }),
      { numRuns: 4, endOnFailure: true },
    );
  });

  it("gives the layout of fixed cases: two children on a half ring, and a ring that the search finds", () => {
    // Two children on a half ring: each part is 90 degrees, so the children are at 45 and 135 degrees.
    const two = RADIAL_TWO;
    // The radius is 10, so the centers are at (7.07, 7.07) and (-7.07, 7.07).
    const centers = radialArrange(two).offsets.map((p) => [p.x + 5, p.y + 5].map((c) => Math.round(c * 1e6) / 1e6));
    expect(centers).toEqual([
      [7.071068, 7.071068],
      [-7.071068, 7.071068],
    ]);
    expectSame(two);
    // A full ring of a large child and small children: the pairs make the search double the radius.
    const mixed = RADIAL_MIXED;
    expectSame(mixed);
    expect(arrangeWith((r) => interpreted.run(r), mixed)).toEqual(radialArrange(mixed));
  });
});

import { compile, type Result } from "@mark1russell7/vex";
import { emitModule, tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PAIRWISE_LIMIT, RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialArrange, radialClosed, radialRun, type RadialChild, type RadialInput, type RadialOutput } from "./ireko-radial.ts";

const size = fc.double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true });
const coord = fc.double({ min: -200, max: 0, noNaN: true, noDefaultInfinity: true });
const child: fc.Arbitrary<RadialChild> = fc.record({ box: fc.record({ width: size, height: size }), extent: fc.record({ x: coord, y: coord, width: size, height: size }) });
const base = {
  mode: fc.constantFrom<"nested" | "linked">("nested", "linked"),
  self: fc.record({ width: size, height: size }),
  gap: fc.double({ min: 0, max: 40, noNaN: true, noDefaultInfinity: true }),
};
const options = (sweep: fc.Arbitrary<number>): fc.Arbitrary<RadialInput["options"]> =>
  fc.record({
    startAngle: fc.oneof(fc.constant(-90), fc.double({ min: -360, max: 360, noNaN: true, noDefaultInfinity: true })),
    sweep,
    clockwise: fc.boolean(),
    distance: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 60, noNaN: true, noDefaultInfinity: true })),
  });
/** A part of a ring with 1 to 12 children, or one child on a full ring. */
const small: fc.Arbitrary<RadialInput> = fc.oneof(
  fc.record({ ...base, children: fc.array(child, { minLength: 1, maxLength: 12 }), options: options(fc.oneof(fc.constant(180), fc.double({ min: 1, max: 360, maxExcluded: true, noNaN: true }))) }),
  fc.record({ ...base, children: fc.array(child, { minLength: 1, maxLength: 1 }), options: options(fc.constant(360)) }),
);
/** A full ring with more children than the limit of the search of ireko. */
const large: fc.Arbitrary<RadialInput> = fc.record({ ...base, children: fc.array(child, { minLength: PAIRWISE_LIMIT + 1, maxLength: PAIRWISE_LIMIT + 8 }), options: options(fc.constant(360)) });

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
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial" });
  if (!m.ok) throw new Error(m.reason);
  expect(m.source).not.toContain("import");
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}
return radial;`)() as (records: unknown, vars: unknown) => readonly Offset[];
}

describe("the ireko radial pilot", () => {
  const interpreted = compile(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS });
  const generated = tiered(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS });
  const radial = moduleOf();
  const expectSame = (i: RadialInput): void => {
    const expected = radialArrange(i);
    expect(arrangeWith((r) => interpreted.run(r), i)).toEqual(expected);
    expect(arrangeWith((r) => generated.run(r), i)).toEqual(expected);
    expect({ offsets: radial(radialRun(i).space.records, radialRun(i).vars) }).toEqual(expected);
  };

  it("COMPILE.MODULE: the program gives the layout of ireko on a part of a ring, with the same bits in each stage", () => {
    fc.assert(
      fc.property(small, (i) => {
        expectSame(i);
      }),
    );
    expect(generated.tier).toBe(2);
    expect(generated.stats.fallbacks).toBe(0);
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

  it("gives the layout of fixed cases, and the closed form excludes a full ring of 2 to 256 children", () => {
    const square: RadialChild = { box: { width: 10, height: 10 }, extent: { x: 0, y: 0, width: 10, height: 10 } };
    const opts = { startAngle: 0, sweep: 180, clockwise: true, distance: 0 };
    // Two children on a half ring: each part is 90 degrees, so the children are at 45 and 135 degrees.
    const two: RadialInput = { mode: "nested", self: { width: 0, height: 0 }, children: [square, square], gap: 0, options: opts };
    // The radius is 10, so the centers are at (7.07, 7.07) and (-7.07, 7.07).
    const centers = radialArrange(two).offsets.map((p) => [p.x + 5, p.y + 5].map((c) => Math.round(c * 1e6) / 1e6));
    expect(centers).toEqual([
      [7.071068, 7.071068],
      [-7.071068, 7.071068],
    ]);
    expectSame(two);
    const ring = { ...two, options: { ...opts, sweep: 360 } };
    expect(radialClosed(ring)).toBe(false);
    expect(() => radialArrange(ring)).toThrow("needs the search of ireko");
    expect(radialClosed({ ...ring, children: [square] })).toBe(true);
    expect(radialClosed({ ...ring, children: [] })).toBe(true);
  });
});

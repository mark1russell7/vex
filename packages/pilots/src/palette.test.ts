import { Color } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AA, paletteReference, paletteVex } from "./palette.ts";

const gray = (n: number): Color => new Color(n, n, n);
const channel = fc.integer({ min: 0, max: 255 });
const palette = fc
  .array(fc.tuple(channel, channel, channel), { minLength: 2, maxLength: 6 })
  .map((cs) => Object.fromEntries(cs.map(([r, g, b], i) => [`c${i}`, new Color(r, g, b)])));

describe("the palette pilot", () => {
  it("checks a palette of five colors: the known ratios of WCAG", () => {
    const report = paletteVex({ black: gray(0), white: gray(255), gray77: gray(0x77), gray76: gray(0x76), navy: new Color(0, 0, 128) });
    expect(report["white"]?.luminance).toBe(1);
    expect(report["black"]?.contrast["white"]).toBeCloseTo(21, 9);
    // #777777 on white is 4.48:1 and fails AA. #767676 on white is 4.54:1 and passes. Navy on white is 16:1.
    expect(report["white"]?.contrast["gray77"]).toBeCloseTo(4.478, 3);
    expect(report["white"]?.passing).toEqual(["black", "gray76", "navy"]);
    expect(report["navy"]?.contrast["white"]).toBeCloseTo(16.01, 2);
    // Black passes with white and with both grays, but not with navy: navy on black is only 1.3:1.
    expect(report["black"]?.passing).toEqual(["white", "gray77", "gray76"]);
  });

  it("gives the report of the reference for random palettes", () => {
    fc.assert(
      fc.property(palette, (p) => {
        const got = paletteVex(p);
        const want = paletteReference(p);
        for (const k of Object.keys(p)) {
          expect(Math.abs((got[k]?.luminance ?? Number.NaN) - (want[k]?.luminance ?? Number.NaN))).toBeLessThan(1e-12);
          for (const [o, r] of Object.entries(want[k]?.contrast ?? {})) expect(Math.abs((got[k]?.contrast[o] ?? Number.NaN) - r)).toBeLessThan(1e-9);
          expect(got[k]?.passing).toEqual(want[k]?.passing);
        }
      }),
    );
  });

  it("gives a symmetric contrast from 1 to 21, so a pair passes AA in both directions or in neither", () => {
    fc.assert(
      fc.property(palette, (p) => {
        const got = paletteVex(p);
        for (const [a, ra] of Object.entries(got)) {
          for (const [b, r] of Object.entries(ra.contrast)) {
            expect(r).toBe(got[b]?.contrast[a]);
            expect(r).toBeGreaterThanOrEqual(1);
            expect(r).toBeLessThanOrEqual(21 + 1e-9);
            expect(ra.passing.includes(b)).toBe(r >= AA);
          }
        }
      }),
    );
  });
});

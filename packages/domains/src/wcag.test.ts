import { app, evaluate, lit, ref, space, type Expr } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { Color, ColorDomain } from "./color.ts";

const gray = (n: number): Color => new Color(n, n, n);

describe("the WCAG 2.1 ops of ColorDomain", () => {
  it("relativeLuminance: 0 for black, 1 for white, and the sRGB transfer function between them", () => {
    expect(gray(0).relativeLuminance()).toBe(0);
    expect(gray(255).relativeLuminance()).toBe(1);
    expect(new Color(255, 0, 0).relativeLuminance()).toBeCloseTo(0.2126, 12);
    // The linear part of the transfer function: 10 / 255 / 12.92.
    expect(gray(10).relativeLuminance()).toBeCloseTo(10 / 255 / 12.92, 12);
    // The power part: ((128 / 255 + 0.055) / 1.055) ^ 2.4.
    expect(gray(128).relativeLuminance()).toBeCloseTo(((128 / 255 + 0.055) / 1.055) ** 2.4, 12);
    // A channel outside 0 to 255 counts as the nearest end.
    expect(new Color(300, -5, 0).relativeLuminance()).toBeCloseTo(0.2126, 12);
  });

  it("contrast: 21 for black and white, 1 for one color, and the same in both directions", () => {
    expect(gray(0).contrast(gray(255))).toBeCloseTo(21, 12);
    expect(gray(255).contrast(gray(0))).toBeCloseTo(21, 12);
    expect(gray(77).contrast(gray(77))).toBe(1);
    // The known pair: #777777 on white is 4.48:1 and fails AA. #767676 on white is 4.54:1 and passes.
    expect(gray(0x77).contrast(gray(255))).toBeCloseTo(4.478, 3);
    expect(gray(0x76).contrast(gray(255))).toBeCloseTo(4.542, 3);
  });

  it("the interpreter applies both ops to Color values", () => {
    const s = space.record({ A: { c: gray(0x76), d: gray(255) } });
    const run = (e: Expr): unknown => {
      const r = evaluate(e, { space: s, origin: "A", domains: [ColorDomain] });
      return r.ok ? r.value : r.error.code;
    };
    expect(run(app("contrast", ref("c"), ref("d")))).toBeCloseTo(4.542, 3);
    expect(run(app("relativeLuminance", ref("d")))).toBe(1);
    expect(run(app("contrast", ref("c"), lit("white")))).toBe("#VALUE!");
  });
});

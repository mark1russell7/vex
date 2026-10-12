import { defineDomain, type Domain, type OpTable } from "@mark1russell7/vex";

/** The linear value of an sRGB channel from 0 to 255, with the sRGB transfer function of WCAG 2.1. */
function linear(channel: number): number {
  const s = Math.min(1, Math.max(0, channel / 255));
  // For integer channels, the sRGB threshold 0.04045 and the WCAG threshold 0.03928 give the same result.
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/**
 * An immutable RGBA color. The channels have no fixed range: use `clamp` to limit them. `add` adds the color
 * channels and keeps the larger alpha, so `add` is commutative and associative.
 */
export class Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;

  constructor(r: number, g: number, b: number, a = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  /** This function makes a gray color with the value `n` in each channel. */
  static gray(n: number): Color {
    return new Color(n, n, n, 1);
  }
  /** The black color with alpha 0: the identity of `add`. */
  static readonly none: Color = new Color(0, 0, 0, 0);

  /** The channel sum. The alpha is the larger alpha. */
  add(o: Color): Color {
    return new Color(this.r + o.r, this.g + o.g, this.b + o.b, Math.max(this.a, o.a));
  }
  /** Each color channel times `factor`. The alpha does not change. */
  multiply(factor: number): Color {
    return new Color(this.r * factor, this.g * factor, this.b * factor, this.a);
  }
  /** Each color channel in the range from `lo` to `hi`. */
  clamp(lo = 0, hi = 255): Color {
    const c = (x: number): number => Math.min(hi, Math.max(lo, x));
    return new Color(c(this.r), c(this.g), c(this.b), this.a);
  }
  /** The linear mix from this color to `o`. */
  mix(o: Color, t: number): Color {
    const m = (x: number, y: number): number => x + (y - x) * t;
    return new Color(m(this.r, o.r), m(this.g, o.g), m(this.b, o.b), m(this.a, o.a));
  }
  /** The relative luminance (Rec. 709 weights) of the color channels. */
  luminance(): number {
    return 0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b;
  }
  /**
   * The relative luminance of WCAG 2.1, from 0 (black) to 1 (white). Each channel from 0 to 255 becomes a linear
   * value with the sRGB transfer function. A channel outside the range counts as the nearest end of the range.
   */
  relativeLuminance(): number {
    return 0.2126 * linear(this.r) + 0.7152 * linear(this.g) + 0.0722 * linear(this.b);
  }
  /** The contrast ratio of WCAG 2.1 between this color and `o`: 1 for equal luminance, 21 for black and white. */
  contrast(o: Color): number {
    const a = this.relativeLuminance();
    const b = o.relativeLuminance();
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  equals(o: Color): boolean {
    return this.r === o.r && this.g === o.g && this.b === o.b && this.a === o.a;
  }
  toArray(): readonly [number, number, number, number] {
    return [this.r, this.g, this.b, this.a];
  }
  toString(): string {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
  }
}

/** The ops of `ColorDomain`. */
export type ColorOps = OpTable<Color, "add" | "multiply" | "clamp" | "mix" | "luminance" | "relativeLuminance" | "contrast" | "equals">;

/** The domain of colors. */
export const ColorDomain: Domain<"Color", Color, ColorOps> = defineDomain<"Color", Color, ColorOps>({
  name: "Color",
  is: (u: unknown): u is Color => u instanceof Color,
  fromScalar: (n: number): Color => Color.gray(n),
  valid: (c: Color): boolean => c.toArray().every((x) => Number.isFinite(x)),
  show: (c: Color): string => c.toString(),
  encode: (c: Color): readonly number[] => c.toArray(),
  decode: (u: unknown): Color => {
    const [r, g, b, a] = (Array.isArray(u) ? u : []) as readonly number[];
    return new Color(r ?? Number.NaN, g ?? Number.NaN, b ?? Number.NaN, a ?? 1);
  },
  ops: {
    add: { laws: ["commutative", "associative"], identity: (): Color => Color.none, params: ["domain"] },
    multiply: { params: ["number"] },
    clamp: { params: ["number", "number"] },
    mix: { params: ["domain", "number"] },
    luminance: {},
    relativeLuminance: {},
    contrast: { laws: ["commutative"], params: ["domain"] },
    equals: { laws: ["commutative"], params: ["domain"] },
  },
});

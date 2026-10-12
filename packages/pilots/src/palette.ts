/**
 * The palette pilot: the contrast of each pair of colors of a palette, with the rules of WCAG 2.1. For each color, the
 * Vex programs give its relative luminance and its contrast ratio with each other color. They also give the other
 * colors that pass the level AA for normal text (4.5 or more). That list uses the reduction `keys()`.
 */
import { space, vex } from "@mark1russell7/vex";
import { BoolDomain, Color, ColorDomain, NumDomain } from "@mark1russell7/vex-domains";

/** The ratio of the level AA of WCAG 2.1 for normal text. */
export const AA = 4.5;

/** The report of one color of a palette. */
export interface ColorReport {
  readonly luminance: number;
  /** The contrast ratio with each other color, by name. */
  readonly contrast: Readonly<Record<string, number>>;
  /** The other colors that pass AA with this color, in the order of the palette. */
  readonly passing: readonly string[];
}

/** This function gives the report of each color of a palette, with Vex. */
export function paletteVex(palette: Readonly<Record<string, Color>>): Record<string, ColorReport> {
  const root = vex(ColorDomain, NumDomain, BoolDomain).over(space.record(Object.fromEntries(Object.entries(palette).map(([k, c]) => [k, { color: c }]))));
  const luminance = root.from("color")._.relativeLuminance();
  // A list chain has no result(), so the host reads the list as two reductions: its keys and its values.
  const contrast = root.from("color").others((e) => e._.contrast("color"));
  const others = contrast.keys();
  const ratios = contrast.values();
  const passing = root
    .start(0)
    .others((e) => e, { where: (e) => e.from("color")._.contrast(e.origin().from("color"))._.gte(AA) })
    .keys();
  const out: Record<string, ColorReport> = {};
  for (const k of Object.keys(palette)) {
    const l = luminance.result(k);
    const names = others.result(k);
    const values = ratios.result(k);
    const p = passing.result(k);
    if (!l.ok || !names.ok || !values.ok || !p.ok) throw new Error(`the color ${k} gave an error`);
    out[k] = { luminance: l.value, contrast: Object.fromEntries(names.value.map((o, i) => [o, values.value[i] ?? Number.NaN])), passing: [...p.value] };
  }
  return out;
}

/** The linear value of a channel, in plain TypeScript, with the threshold 0.03928 of the text of WCAG 2.1. */
function lin(ch: number): number {
  const s = Math.min(1, Math.max(0, ch / 255));
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** The relative luminance of WCAG 2.1, in plain TypeScript. */
function luminanceOf(c: Color): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** This function gives the report of each color of a palette, in plain TypeScript. */
export function paletteReference(palette: Readonly<Record<string, Color>>): Record<string, ColorReport> {
  const names = Object.keys(palette);
  const lum = Object.fromEntries(names.map((k) => [k, luminanceOf(palette[k] ?? Color.none)]));
  const ratio = (a: string, b: string): number => {
    const x = lum[a] ?? 0;
    const y = lum[b] ?? 0;
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  return Object.fromEntries(
    names.map((k) => {
      const others = names.filter((o) => o !== k);
      return [k, { luminance: lum[k] ?? 0, contrast: Object.fromEntries(others.map((o) => [o, ratio(k, o)])), passing: others.filter((o) => ratio(k, o) >= AA) }];
    }),
  );
}

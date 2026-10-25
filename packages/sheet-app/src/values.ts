/**
 * The values of the cells: the text of a value cell becomes a typed value, and a value becomes text for the screen.
 */
import { isVexList } from "@mark1russell7/vex";
import { Color, LocalDate, Vec2 } from "@mark1russell7/vex-domains";
import type { ValueType } from "./doc.ts";

/** The result of reading the text of a cell: empty, a value, or a reason why the text is not a value of the type. */
export type Parsed = { readonly kind: "empty" } | { readonly kind: "ok"; readonly value: unknown } | { readonly kind: "bad"; readonly reason: string };

const NUMBER = /^[+-]?(\d[\d_,]*(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** This function reads a number, or gives `undefined`. The signs `_` and `,` between the digits do not count. */
const numberOf = (t: string): number | undefined => (NUMBER.test(t) ? Number(t.replaceAll(/[_,]/g, "")) : undefined);

/** This function reads the text of a cell as a value of the type `type`. */
export function parseValue(type: ValueType, text: string): Parsed {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  switch (type) {
    case "text":
      return { kind: "ok", value: text };
    case "number": {
      const n = numberOf(t);
      return n === undefined ? { kind: "bad", reason: `"${t}" is not a number` } : { kind: "ok", value: n };
    }
    case "boolean": {
      const l = t.toLowerCase();
      if (["true", "yes", "1"].includes(l)) return { kind: "ok", value: true };
      if (["false", "no", "0"].includes(l)) return { kind: "ok", value: false };
      return { kind: "bad", reason: `"${t}" is not TRUE or FALSE` };
    }
    case "vec2": {
      const parts = t.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.trim());
      // Each part reads as a cell of the type number, so a part with the sign _ is not NaN.
      const [x, y] = parts.map((p) => numberOf(p));
      if (parts.length !== 2 || x === undefined || y === undefined) return { kind: "bad", reason: `"${t}" is not a vector like (3, 4)` };
      return { kind: "ok", value: new Vec2(x, y) };
    }
    case "date": {
      const d = LocalDate.parse(t);
      return d === undefined ? { kind: "bad", reason: `"${t}" is not a date like 2026-10-13` } : { kind: "ok", value: d };
    }
    case "color": {
      const m = HEX.exec(t);
      if (m === null) return { kind: "bad", reason: `"${t}" is not a color like #3366ff` };
      const digits = m[1] ?? "";
      const hex = digits.length === 3 ? digits.split("").map((c) => c + c).join("") : digits;
      return { kind: "ok", value: new Color(Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)) };
    }
  }
}

const NUMBERS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const channel = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** This function gives the hex text of a color, for example `#3366ff`. */
export const colorHex = (c: Color): string => `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;

/** This function gives the text of a value for the screen. */
export function formatValue(u: unknown): string {
  if (u === undefined || u === null) return "";
  if (typeof u === "number") return Number.isFinite(u) ? NUMBERS.format(u) : String(u);
  if (typeof u === "boolean") return u ? "TRUE" : "FALSE";
  if (typeof u === "string") return u;
  if (u instanceof Vec2) return `(${NUMBERS.format(u.x)}, ${NUMBERS.format(u.y)})`;
  if (u instanceof Color) return colorHex(u);
  if (u instanceof LocalDate) return u.toString();
  if (isVexList(u)) return `list of ${u.items.length}`;
  if (Array.isArray(u)) return `[${u.map(formatValue).join(", ")}]`;
  try {
    return JSON.stringify(u) ?? "(value)";
  } catch {
    return "(value)";
  }
}

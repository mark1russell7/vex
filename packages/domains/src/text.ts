/**
 * The domain of texts. The op `concat` joins a text and a value of any kind. It is the operator `&` of a
 * spreadsheet, and of the formula language of the sheet app.
 */
import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";

type TextFn1 = (a: string) => string;

/** The ops of `TextDomain`. */
export type TextOps = {
  readonly concat: FnOp<string, (a: string, b: unknown) => string>;
  readonly length: FnOp<string, (a: string) => number>;
  readonly upper: FnOp<string, TextFn1>;
  readonly lower: FnOp<string, TextFn1>;
  readonly trim: FnOp<string, TextFn1>;
  readonly contains: FnOp<string, (a: string, b: string) => boolean>;
  readonly eq: FnOp<string, (a: string, b: string) => boolean>;
};

/**
 * This function gives the text of a value for `concat`. A text stays. A plain record gives its JSON text. Another
 * value, for example a number or a `Vec2`, gives its own text.
 */
const textOf = (u: unknown): string => (typeof u === "object" && u !== null && Object.getPrototypeOf(u) === Object.prototype ? JSON.stringify(u) : String(u));

/** The domain of texts. */
export const TextDomain: Domain<"Text", string, TextOps> = defineDomain<"Text", string, TextOps>({
  name: "Text",
  is: (u: unknown): u is string => typeof u === "string",
  primitive: "string",
  show: (s: string): string => JSON.stringify(s),
  ops: {
    concat: { fn: (a: string, b: unknown): string => a + textOf(b), params: ["any"], returns: "string" },
    // The length counts UTF-16 code units, like the function LEN of a spreadsheet.
    length: { fn: (a: string): number => a.length, returns: "number" },
    upper: { fn: (a: string): string => a.toUpperCase(), returns: "string" },
    lower: { fn: (a: string): string => a.toLowerCase(), returns: "string" },
    trim: { fn: (a: string): string => a.trim(), returns: "string" },
    contains: { fn: (a: string, b: string): boolean => a.includes(b), params: ["string"], returns: "boolean" },
    eq: { fn: (a: string, b: string): boolean => a === b, laws: ["commutative"], params: ["string"], returns: "boolean" },
  },
});

/**
 * The domain of texts. The op `concat` joins a text and a value of any kind. It is the operator `&` of a
 * spreadsheet, and of the formula language of the sheet app.
 */
import { defineDomain, type Domain, type FnOp, type VexList } from "@mark1russell7/vex";

type TextFn1 = (a: string) => string;

/** The ops of `TextDomain`. */
export type TextOps = {
  readonly concat: FnOp<string, (a: string, b: unknown) => string>;
  readonly length: FnOp<string, (a: string) => number>;
  readonly codePoints: FnOp<string, (a: string) => VexList<number>>;
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
  // LOOP.SIZE.OPS: `concat` adds the JSON text of a value that is not a text. `upper` and `lower` can make a text
  // longer, for example "ß" becomes "SS". The new letters do not change again, so a text grows at most three times in
  // total, and not at each step.
  ops: {
    concat: { fn: (a: string, b: unknown): string => a + textOf(b), params: ["any"], returns: "string", size: { size: [1, "text"] } },
    // The length counts UTF-16 code units, like the function LEN of a spreadsheet.
    length: { fn: (a: string): number => a.length, returns: "number" },
    // The list has one item for each code point, so a pair of surrogates is one item, and a lone surrogate is an item
    // with its own value (TEXT.CODEPOINTS). The function reads no name of Vex, so a module can copy it. The rule tells
    // that the count is at most the length. Each item has a number and a new key, so `keys` adds a part for each item.
    codePoints: {
      fn: (a: string): VexList<number> =>
        Object.freeze({
          kind: "vex.list",
          items: Object.freeze(Array.from(a, (ch, i) => ({ key: String(i), result: { ok: true as const, value: ch.codePointAt(0) as number } }))),
        }),
      returns: "list:number",
      size: { size: [1], inner: [0], item: [0], keys: "position" },
    },
    upper: { fn: (a: string): string => a.toUpperCase(), returns: "string", size: { size: [1] } },
    lower: { fn: (a: string): string => a.toLowerCase(), returns: "string", size: { size: [1] } },
    trim: { fn: (a: string): string => a.trim(), returns: "string", size: { size: [1] } },
    contains: { fn: (a: string, b: string): boolean => a.includes(b), params: ["string"], returns: "boolean" },
    eq: { fn: (a: string, b: string): boolean => a === b, laws: ["commutative"], params: ["string"], returns: "boolean" },
  },
});

import { defineDomain, type Domain, type FnOp } from "@mark1russell7/vex";

/**
 * A JSON value that `JsonDomain` accepts: a text, a finite number, a boolean, an array or a plain object. The items of
 * an array and the fields of an object can be `null`.
 */
export type JsonValue = string | number | boolean | readonly unknown[] | { readonly [key: string]: unknown };

/** The kind of a JSON value. */
export type JsonKind = "boolean" | "number" | "string" | "array" | "object";

/** The kind of an item of an array or of a field of an object: the kind of a JSON value, or `"null"`. */
export type JsonItemKind = JsonKind | "null";

/** The ops of `JsonDomain`. */
export type JsonOps = {
  readonly kind: FnOp<JsonValue, (v: JsonValue) => JsonKind>;
  readonly kinds: FnOp<JsonValue, (c: JsonValue) => readonly JsonItemKind[]>;
  readonly fields: FnOp<JsonValue, (o: JsonValue) => readonly string[]>;
  readonly field: FnOp<JsonValue, (o: JsonValue, k: unknown) => unknown>;
};

/**
 * The domain of JSON values, for example the documents of a database. Each op is a function of plain data, so a
 * standalone module can copy the domain. Put `JsonDomain` last in the list of domains. Then `add`, `eq` and the other
 * ops of `NumDomain`, `TextDomain` and `BoolDomain` come first. The domain does not use the names `keys`, `get` and
 * `values`, because these names are list ops, and a domain op comes before a list op on an array.
 */
export const JsonDomain: Domain<"Json", JsonValue, JsonOps> = defineDomain<"Json", JsonValue, JsonOps>({
  name: "Json",
  // A plain object has the prototype Object.prototype or null. Thus a Vec2, a LocalDate or a Map is not a JSON value.
  // An object with the kind "vex.list" and an array of items is a list of Vex. The test reads no name outside itself,
  // so a module can copy it.
  is: (u: unknown): u is JsonValue =>
    typeof u === "string" ||
    typeof u === "boolean" ||
    Number.isFinite(u) ||
    Array.isArray(u) ||
    (typeof u === "object" &&
      u !== null &&
      [Object.prototype, null].includes(Object.getPrototypeOf(u) as object | null) &&
      !((u as { readonly kind?: unknown }).kind === "vex.list" && Array.isArray((u as { readonly items?: unknown }).items))),
  samples: (): readonly JsonValue[] => [{ a: 1, b: [true, null], c: { d: "x" } }, [1, "x", null, [2]], "x", 2, false],
  ops: {
    // Each op reads no name outside itself, so a module can copy its text.
    kind: { fn: (v: JsonValue): JsonKind => (Array.isArray(v) ? "array" : (typeof v as JsonKind)), params: [], returns: "string" },
    kinds: {
      fn: (c: JsonValue): readonly JsonItemKind[] => {
        if (typeof c !== "object") throw new Error(`"kinds" needs an array or an object, not a ${typeof c}`);
        // Array.from gives undefined for a hole, so a hole has the kind "null".
        return Array.from(Array.isArray(c) ? (c as readonly unknown[]) : Object.values(c), (x, i): JsonItemKind => {
          if (x === null || x === undefined) return "null";
          if (Array.isArray(x)) return "array";
          if (typeof x === "string" || typeof x === "boolean" || Number.isFinite(x) || [Object.prototype, null].includes(Object.getPrototypeOf(x) as object | null)) return typeof x as JsonKind;
          throw new Error(`"kinds" found a value that is not JSON at the position ${i}`);
        });
      },
      params: [],
    },
    fields: {
      fn: (o: JsonValue): readonly string[] => {
        if (typeof o !== "object" || Array.isArray(o)) throw new Error(`"fields" needs an object, not ${Array.isArray(o) ? "an array" : `a ${typeof o}`}`);
        return Object.keys(o);
      },
      params: [],
    },
    field: {
      fn: (o: JsonValue, k: unknown): unknown => {
        if (typeof o !== "object" || Array.isArray(o)) throw new Error(`"field" needs an object, not ${Array.isArray(o) ? "an array" : `a ${typeof o}`}`);
        if (typeof k !== "string") throw new Error(`"field" needs a text key, not a ${typeof k}`);
        if (!Object.hasOwn(o, k)) throw new Error(`the object has no field "${k}"`);
        const value = (o as Readonly<Record<string, unknown>>)[k];
        if (value === null || value === undefined) throw new Error(`the field "${k}" is null`);
        return value;
      },
      params: ["any"],
      returns: "any",
    },
  },
});

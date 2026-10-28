/**
 * The schema program (EXAMPLE.SCHEMA). It reads a list of JSON documents. For each field path, it gives the distinct
 * kinds of the values and the number of documents with the path. The app Graph shows this schema for a sample of a collection.
 *
 * The walk `leaves(d, 3)` goes into an object that is not empty at a depth under 3. It records an empty object, or an
 * object at the depth 3, with the kind `object`. It does not go into an array. The kind of an array is `array<k1|k2>`,
 * from the distinct kinds of its items, or `array` when it is empty.
 */
import { app, axes, call, each, evaluate, fn, let_, lit, rec, space, v, vexList, type AnyDomain, type Expr, type ItemNames } from "@mark1russell7/vex";
import { JsonDomain } from "./json.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";

/** A record of the schema: one field path, its distinct kinds in the order of their first occurrence, and its count of documents. */
export interface JsonFieldSchema {
  readonly path: string;
  readonly kinds: readonly string[];
  readonly count: number;
}

/** These are the domains of `SCHEMA_PROGRAM`. `JsonDomain` is last, so `eq`, `concat` and `gt` go to the domains of numbers and texts. */
export const SCHEMA_DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, JsonDomain];

const EMPTY = lit(vexList([]));
/** A loop over the items of a list, with the names of the item and of its position (AXIS.LIST.ITEM). */
const loop = (list: Expr, as: ItemNames, body: Expr): Expr => each(axes.list(list), body, undefined, as);
const text = (...parts: Expr[]): Expr => parts.reduce((a, b) => app("concat", a, b));
const field = (o: Expr, k: string): Expr => app("field", o, lit(k));

/** The kind of the array `a`: `array<k1|k2>` from the distinct kinds of its items, or `array` when it is empty. */
const arrayKind = fn(["a"], let_({ ks: app("distinct", app("kinds", v("a"))) }, app("if", app("eq", app("count", v("ks")), lit(0)), lit("array"), text(lit("array<"), app("join", v("ks"), lit("|")), lit(">")))));

/** The notes of each document that is an object: the path and the kind of each leaf, and the position of the document. */
const notes = app(
  "flat",
  loop(
    v("docs"),
    ["d", "i"],
    loop(app("if", app("ifError", app("eq", app("kind", v("d")), lit("object")), lit(false)), app("leaves", v("d"), lit(3)), EMPTY), ["l"], rec({ path: field(v("l"), "path"), kind: app("if", app("eq", field(v("l"), "kind"), lit("array")), call("arrayKind", field(v("l"), "value")), field(v("l"), "kind")), doc: v("i") })),
  ),
);

/** The records of the schema: for each group of notes with one path, the distinct kinds and the count of the documents. */
const records = let_(
  { groups: app("group", v("notes"), loop(v("notes"), ["n"], field(v("n"), "path"))) },
  app(
    "values",
    loop(
      v("groups"),
      ["g"],
      rec({
        path: field(app("nth", v("g"), lit(0)), "path"),
        kinds: app("values", app("distinct", loop(v("g"), ["n"], field(v("n"), "kind")))),
        count: app("count", app("distinct", loop(v("g"), ["n"], field(v("n"), "doc")))),
      }),
    ),
  ),
);

/**
 * This is the schema program. It reads the documents from the name `docs`, and it gives an array of `JsonFieldSchema`
 * in the order that the paths first occur. It skips a document that is not an object, and a document with a value that
 * is not JSON. Evaluate it with `SCHEMA_DOMAINS`.
 */
export const SCHEMA_PROGRAM: Expr = let_({ arrayKind }, let_({ notes }, records));

/**
 * This function evaluates `SCHEMA_PROGRAM` for the documents `docs`, and it gives the records of the schema. It throws
 * an `Error` with the code and the message when the program gives an error, for example when `docs` is not an array.
 */
export function schemaOf(docs: readonly unknown[]): readonly JsonFieldSchema[] {
  const r = evaluate(SCHEMA_PROGRAM, { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs } });
  if (!r.ok) throw new Error(`the schema program gave ${r.error.code}: ${r.error.message}`);
  return r.value as readonly JsonFieldSchema[];
}

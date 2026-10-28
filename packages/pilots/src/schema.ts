/**
 * The schema pilot (EXAMPLE.SCHEMA). The app Graph shows the schema of a collection. For each field path of up to 20
 * sample documents, it shows the kinds of the values and the number of documents with the path. Its functions `inferSchema` and
 * `valueKind` do this in TypeScript. `SCHEMA_PROGRAM` is one Vex program that gives the same records, with the ops of
 * `JsonDomain` and the list ops.
 *
 * The walk `leaves(d, 3)` goes into an object that is not empty at a depth under 3. It records an empty object, or an
 * object at the depth 3, with the kind `object`. It does not go into an array. The kind of an array is `array<k1|k2>`,
 * from the distinct kinds of its items, or `array` when it is empty.
 */
import { app, axes, call, each, evaluate, fn, let_, lit, rec, space, v, vexList, type AnyDomain, type Expr, type ItemNames } from "@mark1russell7/vex";
import { BoolDomain, JsonDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";

/** The schema of one field path: its distinct kinds in the order that they first occur, and the number of documents with the path. */
export interface FieldSchema {
  readonly path: string;
  readonly kinds: readonly string[];
  readonly count: number;
}

/** The domains of the program. `JsonDomain` is last, so `eq`, `concat` and `gt` go to the domains of numbers and texts. */
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

/** The program of the schema. It reads the documents from the variable `docs`, and it gives an array of `FieldSchema`. */
export const SCHEMA_PROGRAM: Expr = let_({ arrayKind }, let_({ notes }, records));

/** This function gives the schema of the documents with Vex. It throws when the program gives an error. */
export function schemaOf(docs: readonly unknown[]): readonly FieldSchema[] {
  const r = evaluate(SCHEMA_PROGRAM, { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs } });
  if (!r.ok) throw new Error(`the schema program gave ${r.error.code}: ${r.error.message}`);
  return r.value as readonly FieldSchema[];
}

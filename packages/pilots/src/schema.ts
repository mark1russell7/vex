/**
 * The schema pilot (EXAMPLE.SCHEMA). The app Graph shows the schema of a collection. For each field path of up to 20
 * sample documents, it shows the kinds of the values and the number of documents with the path. Its functions `inferSchema` and
 * `valueKind` do this in TypeScript. `SCHEMA_PROGRAM` is one Vex program that gives the same records, with the ops of
 * `JsonDomain`.
 *
 * The walk goes into an object that is not empty at a depth under 3. It records an empty object, or an object at the
 * depth 3, with the kind `object`. It does not go into an array. The kind of an array is `array<k1|k2>`, from the
 * distinct kinds of its items, or `array` when it is empty.
 *
 * A function of Vex cannot call itself, so the program has one function for each level of the walk.
 */
import { app, axes, call, each, evaluate, fn, fold, let_, lit, rec, space, v, vexList, type AnyDomain, type Expr, type ItemNames } from "@mark1russell7/vex";
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
/** A list with one item. */
const one = (x: Expr): Expr => app("fill", lit(1), x);
const text = (...parts: Expr[]): Expr => parts.reduce((a, b) => app("concat", a, b));
const field = (o: Expr, k: Expr | string): Expr => app("field", o, typeof k === "string" ? lit(k) : k);

/** The distinct values of the list `xs`, in the order that they first occur. */
const distinct = fn(
  ["xs"],
  fold(axes.list(v("xs")), { acc: EMPTY }, { acc: app("if", app("ifError", app("gte", app("indexOf", v("acc"), v("x")), lit(0)), lit(false)), v("acc"), app("append", v("acc"), one(v("x")))) }, v("acc"), undefined, ["x"]),
);

/** The texts of the list `ks`, joined with `|`. */
const joinBar = fn(["ks"], fold(axes.list(v("ks")), { s: lit("") }, { s: app("if", app("eq", v("i"), lit(0)), v("k"), text(v("s"), lit("|"), v("k"))) }, v("s"), undefined, ["k", "i"]));

/** The kind of the array `a`: `array<k1|k2>` from the distinct kinds of its items, or `array` when it is empty. */
const arrayKind = fn(["a"], let_({ ks: call("distinct", app("kinds", v("a"))) }, app("if", app("eq", app("count", v("ks")), lit(0)), lit("array"), text(lit("array<"), call("joinBar", v("ks")), lit(">")))));

/** The note of the field `k` of `o` at the path `p`, as a list with one record. `kd` is the kind of the field. */
const note = fn(["p", "kd", "o", "k"], one(rec({ path: v("p"), kind: app("if", app("eq", v("kd"), lit("array")), call("arrayKind", field(v("o"), v("k"))), v("kd")) })));

/**
 * One level of the walk: the notes of the fields of `o`. The path of a field is its key after the prefix and a dot, or
 * only its key after an empty prefix, as in Graph. `inner` is the function of the next level, or `undefined` at the
 * depth 3.
 */
function level(inner: string | undefined): Expr {
  const here = call("note", v("p"), v("kd"), v("o"), v("k"));
  const deeper = inner === undefined ? here : app("if", app("and", app("eq", v("kd"), lit("object")), app("gt", app("count", app("fields", field(v("o"), v("k")))), lit(0))), call(inner, field(v("o"), v("k")), v("p")), here);
  const path = app("if", app("eq", v("prefix"), lit("")), v("k"), text(v("prefix"), lit("."), v("k")));
  return fn(["o", "prefix"], let_({ ks: app("kinds", v("o")) }, app("flat", loop(app("fields", v("o")), ["k", "i"], let_({ p: path, kd: app("nth", v("ks"), v("i")) }, deeper)))));
}

/** The notes of each document that is an object, with the position of the document. */
const notes = app(
  "flat",
  loop(v("docs"), ["d", "i"], loop(app("if", app("ifError", app("eq", app("kind", v("d")), lit("object")), lit(false)), call("level1", v("d"), lit("")), EMPTY), ["n"], rec({ path: field(v("n"), "path"), kind: field(v("n"), "kind"), doc: v("i") }))),
);

/** The records of the schema: for each distinct path, the distinct kinds of its notes and the count of its documents. */
const records = let_(
  { paths: call("distinct", loop(v("notes"), ["n"], field(v("n"), "path"))) },
  app(
    "values",
    loop(
      v("paths"),
      ["p"],
      let_(
        { mine: app("flat", loop(v("notes"), ["n"], app("if", app("eq", field(v("n"), "path"), v("p")), one(v("n")), EMPTY))) },
        rec({
          path: v("p"),
          kinds: app("values", call("distinct", loop(v("mine"), ["n"], field(v("n"), "kind")))),
          count: app("count", call("distinct", loop(v("mine"), ["n"], field(v("n"), "doc")))),
        }),
      ),
    ),
  ),
);

/** The program of the schema. It reads the documents from the variable `docs`, and it gives an array of `FieldSchema`. */
export const SCHEMA_PROGRAM: Expr = let_(
  { distinct, joinBar },
  let_({ arrayKind }, let_({ note }, let_({ level3: level(undefined) }, let_({ level2: level("level3") }, let_({ level1: level("level2") }, let_({ notes }, records)))))),
);

/** This function gives the schema of the documents with Vex. It throws when the program gives an error. */
export function schemaOf(docs: readonly unknown[]): readonly FieldSchema[] {
  const r = evaluate(SCHEMA_PROGRAM, { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs } });
  if (!r.ok) throw new Error(`the schema program gave ${r.error.code}: ${r.error.message}`);
  return r.value as readonly FieldSchema[];
}

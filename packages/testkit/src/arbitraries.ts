/**
 * fast-check arbitraries for Vex: spaces, addresses, axes and expressions. The generators are hostile on
 * purpose: they make prototype names, missing fields, non-finite numbers, records that throw, and ops that do
 * not exist.
 */
import { space, type Axis, type Expr, type Move, type Space } from "@mark1russell7/vex";
import * as fc from "fast-check";

/** The options of the arbitraries. */
export interface ArbOptions {
  /** The values of the domain fields of a record. */
  readonly domainValue: fc.Arbitrary<unknown>;
  /** The op names that the expressions use, in addition to the list ops and the special forms. */
  readonly ops: readonly string[];
  /** The maximum depth of an expression. The default is 4. */
  readonly maxDepth?: number;
}

/** The keys of generated record spaces. */
export const RECORD_KEYS: readonly string[] = ["A", "B", "C", "D"];

/** The field names of generated records. */
export const FIELDS: readonly string[] = ["p", "q", "n", "s", "b", "nested", "list"];

/** Field paths for references, with some that do not exist and some that are prototype names. */
export const PATHS: readonly (readonly string[])[] = [
  ["p"], ["q"], ["n"], ["s"], ["b"], ["nested"], ["nested", "x"], ["nested", "y"], ["missing"], ["__proto__"], ["constructor"],
  ["p", "toString"], [], ["list", "0"],
];

const throwingRecord = (): object =>
  Object.defineProperty({}, "p", {
    enumerable: true,
    get(): never {
      throw new Error("a getter that throws");
    },
  });

/** A record with a sample of fields. */
export const arbRecord = (domainValue: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> =>
  fc.oneof(
    { weight: 8, arbitrary: fc.record(
      {
        p: domainValue,
        q: domainValue,
        n: fc.oneof(fc.integer({ min: -10, max: 10 }), fc.double()),
        s: fc.constantFrom("x", "y", "name"),
        b: fc.boolean(),
        nested: fc.record({ x: fc.integer({ min: -5, max: 5 }), y: fc.constant(null) }),
        list: fc.array(fc.integer(), { maxLength: 3 }),
      },
      { requiredKeys: [] },
    ) },
    { weight: 1, arbitrary: fc.constant(null) },
    { weight: 1, arbitrary: fc.constant(Object.create(null) as object) },
    { weight: 1, arbitrary: fc.constant(0).map(throwingRecord) },
  );

/** The input of a tree space: the records by key, and the parent of each key (`null` for a root). */
export interface TreeInput {
  readonly records: Readonly<Record<string, unknown>>;
  readonly parents: Readonly<Record<string, string | null>>;
}

/** The input of a tree space with up to 6 keys. The parent of a key is `null` or a key before it, so there is no cycle. */
export const arbTreeInput = (domainValue: fc.Arbitrary<unknown>): fc.Arbitrary<TreeInput> =>
  fc.uniqueArray(fc.constantFrom("A", "B", "C", "D", "E", "F"), { minLength: 1, maxLength: 6 }).chain((keys) =>
    fc
      .tuple(
        fc.tuple(...keys.map(() => arbRecord(domainValue))),
        fc.tuple(...keys.map((_, i) => (i === 0 ? fc.constant(null) : fc.option(fc.constantFrom(...keys.slice(0, i)), { nil: null })))),
      )
      .map(([recs, ps]) => ({
        records: Object.fromEntries(keys.map((k, i) => [k, recs[i]])),
        parents: Object.fromEntries(keys.map((k, i) => [k, ps[i] ?? null])),
      })),
  );

/** The input of a graph space: the records by key, and the edges from each key. The edges can make cycles. */
export interface GraphInput {
  readonly records: Readonly<Record<string, unknown>>;
  readonly edges: Readonly<Record<string, readonly string[]>>;
}

/** A graph input with 1 to 6 keys and random edges, also edges to the key itself and twice the same edge. */
export const arbGraphInput = (domainValue: fc.Arbitrary<unknown>): fc.Arbitrary<GraphInput> =>
  fc.uniqueArray(fc.constantFrom("A", "B", "C", "D", "E", "F"), { minLength: 1, maxLength: 6 }).chain((keys) =>
    fc
      .tuple(fc.tuple(...keys.map(() => arbRecord(domainValue))), fc.tuple(...keys.map(() => fc.array(fc.constantFrom(...keys), { maxLength: 4 }))))
      .map(([recs, es]) => ({
        records: Object.fromEntries(keys.map((k, i) => [k, recs[i]])),
        edges: Object.fromEntries(keys.map((k, i) => [k, es[i] ?? []])),
      })),
  );

/** A record, array, grid, tree or graph space. */
export const arbSpace = (domainValue: fc.Arbitrary<unknown>): fc.Arbitrary<Space> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.uniqueArray(fc.constantFrom(...RECORD_KEYS), { minLength: 1, maxLength: 4 }).chain((keys) =>
      fc.tuple(...keys.map(() => arbRecord(domainValue))).map((recs) => space.record(Object.fromEntries(keys.map((k, i) => [k, recs[i]])))),
    ) },
    { weight: 1, arbitrary: fc.array(arbRecord(domainValue), { minLength: 1, maxLength: 4 }).map((xs) => space.array(xs) as Space) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 3 }).chain((rows) =>
      fc.array(fc.array(arbRecord(domainValue), { minLength: 1, maxLength: 3 }), { minLength: rows, maxLength: rows }).map((g) => space.grid(g) as Space),
    ) },
    { weight: 1, arbitrary: arbTreeInput(domainValue).map((t) => space.tree(t.records, t.parents)) },
    { weight: 1, arbitrary: arbGraphInput(domainValue).map((g) => space.graph(g.records, g.edges)) },
  );

/** A move of an address. */
export const arbMove: fc.Arbitrary<Move> = fc.oneof(
  fc.constantFrom(...RECORD_KEYS, "Z", "0", "1", "0,0", "1,1").map((key): Move => ({ t: "key", key })),
  fc.integer({ min: -1, max: 4 }).map((i): Move => ({ t: "index", i })),
  fc.constant<Move>({ t: "other" }),
  fc.constant<Move>({ t: "origin" }),
  fc.constant<Move>({ t: "parent" }),
  fc.oneof(fc.tuple(fc.integer({ min: -1, max: 1 })), fc.tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))).map((d): Move => ({ t: "offset", d })),
);

/** A literal value: numbers (also non-finite), strings, booleans, null, small arrays and records, and domain values. */
export const arbLiteral = (domainValue: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.integer({ min: -10, max: 10 }),
    fc.double(),
    fc.constantFrom("p", "x", ""),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.integer({ min: -3, max: 3 }), { maxLength: 3 }),
    fc.constant({ strict: true }),
    domainValue,
  );

const LIST_OPS = ["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors"];
const FORMS = ["if", "and", "or", "ifError"];
const NAMES = ["a", "b"];

/** An expression of the IR, from the whole grammar. */
export function arbExpr(opts: ArbOptions): fc.Arbitrary<Expr> {
  const ops = [...opts.ops, ...LIST_OPS, ...FORMS, "nope", "toString", "constructor"];
  const { expr } = fc.letrec<{ expr: Expr; axis: Axis }>((tie) => ({
    expr: fc.oneof(
      { depthSize: "small", withCrossShrink: true, maxDepth: opts.maxDepth ?? 4 },
      arbLiteral(opts.domainValue).map((value): Expr => ({ tag: "lit", value })),
      fc.tuple(fc.constantFrom(...PATHS), fc.option(fc.array(arbMove, { maxLength: 2 }), { nil: undefined })).map(([path, at]): Expr =>
        at === undefined || at.length === 0 ? { tag: "ref", path } : { tag: "ref", path, at },
      ),
      fc.constantFrom(...NAMES, "c").map((name): Expr => ({ tag: "var", name })),
      fc.tuple(fc.constantFrom(...ops), fc.array(tie("expr"), { maxLength: 3 })).map(([op, args]): Expr => ({ tag: "app", op, args })),
      fc.tuple(fc.subarray([...NAMES], { minLength: 1 }), tie("expr"), tie("expr"), tie("expr")).map(([names, first, second, body]): Expr => ({
        tag: "let",
        bind: Object.fromEntries(names.map((n, i) => [n, i === 0 ? first : second])),
        body,
      })),
      fc.tuple(tie("expr"), tie("expr")).map(([x, y]): Expr => ({ tag: "rec", fields: { x, y } })),
      fc.tuple(tie("axis"), tie("expr"), fc.option(fc.array(arbMove, { maxLength: 2 }), { nil: undefined })).map(([axis, body, at]): Expr =>
        at === undefined || at.length === 0 ? { tag: "each", axis, body } : { tag: "each", axis, body, at },
      ),
    ),
    axis: fc.oneof(
      { depthSize: "small", maxDepth: 2 },
      fc.constantFrom<Axis>(
        { t: "all" },
        { t: "others" },
        { t: "other" },
        { t: "neighbors", n: 4 },
        { t: "neighbors", n: 8 },
        { t: "children" },
        { t: "ancestors" },
        { t: "descendants" },
        { t: "siblings" },
        { t: "window", from: -1, to: 0 },
        { t: "window", from: -2, to: 2 },
        { t: "table", name: "T" },
        { t: "table", name: "missing" },
        { t: "successors" },
        { t: "predecessors" },
        { t: "reachable" },
      ),
      fc.tuple(tie("axis"), tie("expr")).map(([axis, test]): Axis => ({ t: "where", axis, test })),
    ),
  }));
  return expr;
}

/** A key of a space, or a key that is not in it. */
export const arbOrigin = (s: Space): fc.Arbitrary<string> => fc.oneof({ weight: 5, arbitrary: fc.constantFrom(...s.keys) }, { weight: 1, arbitrary: fc.constant("Z") });

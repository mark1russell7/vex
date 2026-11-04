/**
 * fast-check arbitraries for Vex: spaces, addresses, axes and expressions. The generators are hostile on
 * purpose: they make prototype names, missing fields, non-finite numbers, records that throw, and ops that do
 * not exist.
 */
import { app, axes, call, each, fix, fn, last, let_, lit, ref, space, toDocument, v, vexList, type AnyDomain, type Axis, type Expr, type FixedMove, type FixJoin, type Move, type Space } from "@mark1russell7/vex";
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
      .tuple(...keys.map((k) => fc.tuple(fc.constant(k), arbRecord(domainValue), fc.array(fc.constantFrom(...keys), { maxLength: 4 }))))
      .map((nodes) => ({
        records: Object.fromEntries(nodes.map(([k, rec]) => [k, rec])),
        edges: Object.fromEntries(nodes.map(([k, , to]) => [k, to])),
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

/** A fixed move of an address: a move with no expression. */
export const arbMove: fc.Arbitrary<FixedMove> = fc.oneof(
  fc.constantFrom(...RECORD_KEYS, "Z", "0", "1", "0,0", "1,1").map((key): FixedMove => ({ t: "key", key })),
  fc.integer({ min: -1, max: 4 }).map((i): FixedMove => ({ t: "index", i })),
  fc.constant<FixedMove>({ t: "other" }),
  fc.constant<FixedMove>({ t: "origin" }),
  fc.constant<FixedMove>({ t: "parent" }),
  fc.oneof(fc.tuple(fc.integer({ min: -1, max: 1 })), fc.tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))).map((d): FixedMove => ({ t: "offset", d })),
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

const LIST_OPS = ["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors", "sortBy", "take", "nth", "setNth", "drop", "append", "flat", "without", "get", "indexOf", "fill", "distinct", "group", "join"];
const FORMS = ["if", "and", "or", "ifError"];
const NAMES = ["a", "b"];

/** An expression of the IR, from the whole grammar. */
/** The base axes of the random programs: each axis but where and reverse. */
const BASE_AXES: readonly Axis[] = [
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
];

export function arbExpr(opts: ArbOptions): fc.Arbitrary<Expr> {
  const ops = [...opts.ops, ...LIST_OPS, ...FORMS, "nope", "toString", "constructor"];
  // The list literals (LIST.LITERAL): the empty list, and lists with one key of the space or a key that is not in it.
  const literalLists: readonly Expr[] = [
    { tag: "lit", value: vexList([]) },
    { tag: "lit", value: vexList([{ key: "A", result: { ok: true, value: 1 } }]) },
    { tag: "lit", value: vexList([{ key: "Z", result: { ok: true, value: true } }]) },
  ];
  const { expr } = fc.letrec<{ expr: Expr; axis: Axis; move: Move; list: Expr }>((tie) => ({
    expr: fc.oneof(
      { depthSize: "small", withCrossShrink: true, maxDepth: opts.maxDepth ?? 4 },
      arbLiteral(opts.domainValue).map((value): Expr => ({ tag: "lit", value })),
      fc.tuple(fc.constantFrom(...PATHS), fc.option(fc.array(tie("move"), { maxLength: 2 }), { nil: undefined })).map(([path, at]): Expr =>
        at === undefined || at.length === 0 ? { tag: "ref", path } : { tag: "ref", path, at },
      ),
      fc.constantFrom(...NAMES, "c", "f").map((name): Expr => ({ tag: "var", name })),
      fc.tuple(fc.constantFrom(...ops), fc.array(tie("expr"), { maxLength: 3 })).map(([op, args]): Expr => ({ tag: "app", op, args })),
      fc.tuple(fc.subarray([...NAMES], { minLength: 1 }), tie("expr"), tie("expr"), tie("expr")).map(([names, first, second, body]): Expr => ({
        tag: "let",
        bind: Object.fromEntries(names.map((n, i) => [n, i === 0 ? first : second])),
        body,
      })),
      // Functions (FN.*): a binding f, g or b with parameters from a and b, beside a value a, and calls with zero to two
      // arguments. A function b has the name of a parameter and of a name of a loop, which hide it.
      // The body of the let is often a call of the function with the right number of arguments.
      fc
        .tuple(fc.constantFrom("f", "g", "b"), fc.subarray([...NAMES]), tie("expr"), fc.option(tie("expr"), { nil: undefined }), tie("expr"), fc.boolean(), tie("expr"), tie("expr"))
        .map(([name, params, fnBody, other, body, exact, x, y]): Expr => ({
          tag: "let",
          bind: { [name]: { tag: "fn", params, body: fnBody }, ...(other === undefined ? {} : { a: other }) },
          body: exact ? { tag: "call", fn: name, args: [x, y].slice(0, params.length) } : body,
        })),
      fc.tuple(fc.constantFrom("f", "g", "a", "b"), fc.array(tie("expr"), { maxLength: 2 })).map(([name, args]): Expr => ({ tag: "call", fn: name, args })),
      fc.tuple(tie("expr"), tie("expr")).map(([x, y]): Expr => ({ tag: "rec", fields: { x, y } })),
      // The ops on the order of a list (LIST.TAKE, LIST.NTH), with a position that can be wrong.
      fc
        .tuple(fc.constantFrom("take", "nth", "values"), tie("list"), fc.integer({ min: -1, max: 3 }))
        .map(([op, list, n]): Expr => ({ tag: "app", op, args: [list, { tag: "lit", value: n }] })),
      fc.tuple(tie("axis"), tie("expr"), fc.option(fc.array(tie("move"), { maxLength: 2 }), { nil: undefined })).map(([axis, body, at]): Expr =>
        at === undefined || at.length === 0 ? { tag: "each", axis, body } : { tag: "each", axis, body, at },
      ),
      // The loops (LOOP.NAMES): the names a and b, a step for some of them, and a result that reads them.
      fc
        .tuple(tie("axis"), fc.boolean(), tie("expr"), tie("expr"), tie("expr"), tie("expr"), tie("expr"), fc.option(fc.array(tie("move"), { maxLength: 1 }), { nil: undefined }))
        .map(([axis, two, a, b, nextA, nextB, result, at]): Expr => {
          const init: Readonly<Record<string, Expr>> = two ? { a, b } : { a };
          // With two names, only a has a step, so b keeps its value.
          const step: Readonly<Record<string, Expr>> = two && nextB.tag === "lit" ? { a: nextA } : two ? { a: nextA, b: nextB } : { a: nextA };
          return at === undefined || at.length === 0 ? { tag: "fold", axis, init, step, result } : { tag: "fold", axis, init, step, result, at };
        }),
      fc
        .tuple(fc.integer({ min: 0, max: 4 }), fc.boolean(), tie("expr"), tie("expr"), tie("expr"), fc.option(tie("expr"), { nil: undefined }))
        .map(([limit, two, init, step, result, until]): Expr => {
          const loop: Expr = { tag: "iterate", limit, init: two ? { a: init, b: init } : { a: init }, step: { a: step }, result };
          return until === undefined ? loop : { ...loop, until };
        }),
      // A limit from the data (ITERATE.LIMIT.DATA). Most limits read a base axis, which tier 2 takes. Some read each axis of a fold.
      fc
        .tuple(fc.oneof({ weight: 3, arbitrary: fc.constantFrom(...BASE_AXES) }, { weight: 1, arbitrary: tie("axis") }), tie("expr"), tie("expr"), tie("expr"), fc.option(tie("expr"), { nil: undefined }))
        .map(([axis, init, step, result, until]): Expr => {
          const loop: Expr = { tag: "iterate", limit: { axis }, init: { a: init }, step: { a: step }, result };
          return until === undefined ? loop : { ...loop, until };
        }),
      // A list as the name of a loop (LOOP.LIST): the step pushes a list onto a, or it removes the first item of a.
      fc
        .tuple(fc.integer({ min: 0, max: 3 }), tie("list"), fc.boolean(), tie("list"), tie("expr"))
        .map(([limit, init, push, more, result]): Expr => {
          const a: Expr = { tag: "var", name: "a" };
          const step: Expr = push ? { tag: "app", op: "append", args: [more, a] } : { tag: "app", op: "drop", args: [a, { tag: "lit", value: 1 }] };
          return { tag: "iterate", limit, init: { a: init }, step: { a: step }, result };
        }),
      // One item of a list as a name of a loop (LOOP.LIST, LIST.SETNTH): the step gives one position a new value.
      fc
        .tuple(fc.integer({ min: 0, max: 3 }), tie("list"), fc.integer({ min: -1, max: 3 }), tie("expr"), tie("expr"))
        .map(([limit, init, i, value, result]): Expr => {
          const a: Expr = { tag: "var", name: "a" };
          return { tag: "iterate", limit, init: { a: init }, step: { a: { tag: "app", op: "setNth", args: [a, { tag: "lit", value: i }, value] } }, result };
        }),
      // The value at a key of a list (LIST.GET): a key of the records, a key of an array or a grid, or no key.
      fc
        .tuple(tie("list"), fc.constantFrom(...RECORD_KEYS, "0", "1,1", "Z"))
        .map(([list, k]): Expr => ({ tag: "app", op: "get", args: [list, { tag: "lit", value: k }] })),
    ),
    axis: fc.oneof(
      { depthSize: "small", maxDepth: 2 },
      fc.constantFrom(...BASE_AXES),
      // The reverse order of a base axis (AXIS.REVERSE). The axis table has no reverse order.
      fc.constantFrom(...BASE_AXES.filter((a) => a.t !== "table")).map((axis): Axis => ({ t: "reverse", axis })),
      fc.tuple(tie("axis"), tie("expr")).map(([axis, test]): Axis => ({ t: "where", axis, test })),
      // The items of a list as targets (AXIS.LIST), in its order or in the reverse order.
      tie("list").map((list): Axis => ({ t: "list", list })),
      tie("list").map((list): Axis => ({ t: "reverse", axis: { t: "list", list } })),
    ),
    // A list (LIST.VALUE, LIST.BUILD): an each, a sorted list, the first items or the other items of a list, two lists
    // in one, a list without the keys of another, the lists of the targets of an axis in one list, or any expression.
    list: fc.oneof(
      { depthSize: "small", maxDepth: 2 },
      fc.tuple(tie("axis"), tie("expr")).map(([axis, body]): Expr => ({ tag: "each", axis, body })),
      tie("list").map((list): Expr => ({ tag: "app", op: "sortBy", args: [list] })),
      fc.tuple(tie("list"), fc.integer({ min: -1, max: 3 })).map(([list, n]): Expr => ({ tag: "app", op: "take", args: [list, { tag: "lit", value: n }] })),
      fc.tuple(tie("list"), fc.integer({ min: -1, max: 3 })).map(([list, n]): Expr => ({ tag: "app", op: "drop", args: [list, { tag: "lit", value: n }] })),
      fc.tuple(tie("list"), fc.integer({ min: -1, max: 3 }), tie("expr")).map(([list, i, value]): Expr => ({ tag: "app", op: "setNth", args: [list, { tag: "lit", value: i }, value] })),
      fc.tuple(tie("list"), tie("list")).map(([list, other]): Expr => ({ tag: "app", op: "append", args: [list, other] })),
      fc.tuple(tie("list"), tie("list")).map(([list, other]): Expr => ({ tag: "app", op: "without", args: [list, other] })),
      fc.tuple(tie("axis"), tie("list")).map(([axis, body]): Expr => ({ tag: "app", op: "flat", args: [{ tag: "each", axis, body }] })),
      // A list literal (LIST.LITERAL): the empty list, or a list with one key of the space or a key that is not in it.
      fc.constantFrom(...literalLists),
      tie("expr"),
    ),
    // A fixed move, or a computed move (NAV.COMPUTED): a literal key or position, or any expression.
    move: fc.oneof(
      { weight: 4, arbitrary: arbMove },
      { weight: 1, arbitrary: fc.integer({ min: -1, max: 4 }).map((i): Move => ({ t: "index", i: { tag: "lit", value: i } })) },
      { weight: 1, arbitrary: fc.constantFrom(...RECORD_KEYS, "0", "Z").map((k): Move => ({ t: "key", key: { tag: "lit", value: k } })) },
      { weight: 1, arbitrary: tie("expr").map((i): Move => ({ t: "index", i })) },
      { weight: 1, arbitrary: tie("expr").map((key): Move => ({ t: "key", key })) },
    ),
  }));
  return expr;
}

/** The axes of a generated column. Each has targets that do not depend on the order of the rows. */
const FIX_AXES: readonly Axis[] = [axes.predecessors, axes.successors, axes.reachable, axes.all, axes.others, axes.where(axes.all, ref("b"))];

/** This function generates a `fix` from the parts. */
const arbFix = (join: FixJoin, init: fc.Arbitrary<Expr>, step: fc.Arbitrary<Expr>, name = "x"): fc.Arbitrary<Expr> => fc.tuple(init, step).map(([a, b]): Expr => fix(name, join, a, b));

/** This function generates a column of numbers and a column of booleans, each of the name `x`. */
function arbFixColumns(maxDepth: number): { readonly numbers: fc.Arbitrary<Expr>; readonly booleans: fc.Arbitrary<Expr> } {
  const axis = fc.constantFrom(...FIX_AXES);
  const number = (depth: number): fc.Arbitrary<Expr> => {
    const inner = fc.constant(null).chain(() => number(depth - 1));
    const leaf = fc.oneof({ weight: 3, arbitrary: fc.constant<Expr>(last("x")) }, fc.integer({ min: -4, max: 4 }).map((n): Expr => app("add", last("x"), lit(n))));
    if (depth <= 0) return leaf;
    return fc.oneof(
      leaf,
      fc.tuple(inner, inner, fc.constantFrom("min", "max")).map(([a, b, op]): Expr => app(op, a, b)),
      fc.tuple(inner, fc.integer({ min: -4, max: 4 })).map(([a, n]): Expr => app("min", a, lit(n))),
      fc.tuple(inner, inner).map(([a, b]): Expr => app("if", ref("b"), a, b)),
      fc.tuple(inner, axis, fc.constantFrom("min", "max"), fc.integer({ min: -4, max: 4 })).map(([a, on, op, n]): Expr => app("ifError", app(op, each(on, a)), lit(n))),
    );
  };
  const boolean = (depth: number): fc.Arbitrary<Expr> => {
    const inner = fc.constant(null).chain(() => boolean(depth - 1));
    if (depth <= 0) return fc.constant<Expr>(last("x"));
    return fc.oneof(
      fc.constant<Expr>(last("x")),
      fc.tuple(inner, inner, fc.constantFrom("and", "or")).map(([a, b, op]): Expr => app(op, a, b)),
      fc.tuple(inner, inner).map(([a, b]): Expr => app("if", ref("b"), a, b)),
      fc.tuple(inner, axis, fc.constantFrom("any", "all")).map(([a, on, op]): Expr => app(op, each(on, a))),
      fc.tuple(inner, axis).map(([a, on]): Expr => app("none", each(on, app("not", a)))),
    );
  };
  const start = fc.constantFrom<Expr>(ref("n"), lit(0), lit(9), app("if", ref("b"), lit(0), lit(9)));
  const flag = fc.constantFrom<Expr>(ref("b"), lit(false), lit(true), app("not", ref("b")));
  return {
    numbers: fc.oneof(arbFix("max", start, number(maxDepth)), arbFix("min", start, number(maxDepth))),
    booleans: fc.oneof(arbFix("or", flag, boolean(maxDepth)), arbFix("and", flag, boolean(maxDepth))),
  };
}

/**
 * This function gives `depth` doublings of `leaf`. Each level is one object at two places of the next level, so the
 * tree of the program has `2 ** depth` leaves and the program has `depth + 1` objects.
 */
export function doubling(leaf: Expr, depth: number): Expr {
  let e = leaf;
  for (let i = 0; i < depth; i++) e = app("add", e, e);
  return e;
}

/** This function generates a doubling of a number with a depth of `maxDepth` or less. A name reads the variable `a` of a program. */
export const arbDoubling = (maxDepth = 6): fc.Arbitrary<Expr> => fc.tuple(fc.constantFrom<Expr>(ref("n"), v("a"), lit(1)), fc.integer({ min: 0, max: maxDepth })).map(([leaf, depth]) => doubling(leaf, depth));

/**
 * This function generates a program with one `fix` that the check accepts (FIX.MONOTONE). Each read of the fields in the
 * records of `arbFixGraph` works. The ops ignore the order of the rows, so a test can reverse the rows (FIX.ORDER).
 */
export function arbFixExpr(maxDepth = 3): fc.Arbitrary<Expr> {
  const { numbers, booleans } = arbFixColumns(maxDepth);
  return fc.oneof(numbers, booleans);
}

/** A value that is an error at each row where `n` is 0. */
const FIX_ERROR: Expr = app("divide", lit(8), ref("n"));

/** A boolean that is an error at each row where `n` is 0. */
const FIX_ERROR_FLAG: Expr = app("gt", FIX_ERROR, lit(1));

/**
 * This function generates a program for the differential test of the tiers (COMPILE.FIX). The check accepts each one
 * (FIX.MONOTONE). A step of the column `y` reads its last round and moves it with an op. A step can also read a column
 * of the name `x`, or give an error value at some rows. A first value can have the wrong kind (FIX.KIND). A step can add 1 at each
 * round, so a program can reach the round limit (FIX.LIMIT).
 */
export function arbFixProgram(maxDepth = 2): fc.Arbitrary<Expr> {
  const { numbers, booleans } = arbFixColumns(1);
  const axis = fc.constantFrom(...FIX_AXES);
  const y = last("y");
  const move = fc.integer({ min: -1, max: 1 });
  const number = (depth: number): fc.Arbitrary<Expr> => {
    const leaf = fc.oneof(fc.constant<Expr>(y), move.map((k): Expr => app("add", y, lit(k))));
    if (depth <= 0) return leaf;
    const inner = fc.constant(null).chain(() => number(depth - 1));
    return fc.oneof(
      leaf,
      fc.tuple(inner, numbers).map(([a, c]): Expr => app("max", a, c)),
      fc.tuple(inner, numbers).map(([a, c]): Expr => let_({ c }, app("min", a, v("c")))),
      inner.map((a): Expr => app("min", a, FIX_ERROR)),
      fc.tuple(inner, axis, fc.constantFrom("min", "max")).map(([a, on, op]): Expr => app(op, each(on, a))),
      fc.tuple(inner, inner).map(([a, b]): Expr => app("if", ref("b"), a, b)),
      fc.tuple(inner, move).map(([a, k]): Expr => app("ifError", a, lit(k))),
    );
  };
  const boolean = (depth: number): fc.Arbitrary<Expr> => {
    const leaf = fc.oneof(fc.constant<Expr>(y), fc.constantFrom("and", "or").map((op): Expr => app(op, y, ref("b"))));
    if (depth <= 0) return leaf;
    const inner = fc.constant(null).chain(() => boolean(depth - 1));
    return fc.oneof(
      leaf,
      fc.tuple(inner, booleans).map(([a, c]): Expr => app("or", a, c)),
      fc.tuple(inner, booleans).map(([a, c]): Expr => let_({ c }, app("and", a, v("c")))),
      inner.map((a): Expr => app("and", a, FIX_ERROR_FLAG)),
      fc.tuple(inner, axis, fc.constantFrom("any", "all")).map(([a, on, op]): Expr => app(op, each(on, a))),
      fc.tuple(inner, inner).map(([a, b]): Expr => app("if", ref("b"), a, b)),
      inner.map((a): Expr => app("ifError", a, lit(false))),
    );
  };
  const start = fc.constantFrom<Expr>(ref("n"), lit(0), lit(9), FIX_ERROR, ref("b"));
  const flag = fc.constantFrom<Expr>(ref("b"), lit(false), lit(true), FIX_ERROR_FLAG, ref("n"));
  const column = fc.oneof(
    arbFix("max", start, number(maxDepth), "y"),
    arbFix("min", start, number(maxDepth), "y"),
    arbFix("or", flag, boolean(maxDepth), "y"),
    arbFix("and", flag, boolean(maxDepth), "y"),
  );
  return fc.oneof(
    { weight: 6, arbitrary: column },
    { weight: 1, arbitrary: column.map((c): Expr => app("ifError", c, lit(0))) },
    { weight: 1, arbitrary: column.map((c): Expr => let_({ z: c }, v("z"))) },
    { weight: 1, arbitrary: column.map((c): Expr => app("count", each(axes.all, c))) },
    { weight: 1, arbitrary: column.map((c): Expr => let_({ f: fn([], c) }, call("f"))) },
  );
}

/** The records and the edges of a graph for `arbFixExpr`. A test makes the space, so it can reverse the rows. */
export interface FixGraph {
  readonly records: Readonly<Record<string, { readonly n: number; readonly b: boolean }>>;
  readonly edges: Readonly<Record<string, readonly string[]>>;
}

/** The arbitrary of a graph of 1 to 6 records for `arbFixExpr`, with cycles and with keys that have no edge. */
export const arbFixGraph: fc.Arbitrary<FixGraph> = /* @__PURE__ */ fc.integer({ min: 1, max: 6 }).chain((size) => {
  const keys = Array.from({ length: size }, (_, i) => String(i));
  const row = fc.record({ n: fc.integer({ min: -4, max: 4 }), b: fc.boolean() });
  const ends = fc.uniqueArray(fc.constantFrom(...keys), { maxLength: 3 });
  return fc.tuple(fc.array(row, { minLength: size, maxLength: size }), fc.array(ends, { minLength: size, maxLength: size })).map(([rows, targets]) => ({
    records: Object.fromEntries(keys.map((k, i) => [k, rows[i] as FixGraph["records"][string]])),
    edges: Object.fromEntries(keys.map((k, i) => [k, targets[i] as readonly string[]])),
  }));
});

/** A key of a space, or a key that is not in it. */
export const arbOrigin = (s: Space): fc.Arbitrary<string> => fc.oneof({ weight: 5, arbitrary: fc.constantFrom(...s.keys) }, { weight: 1, arbitrary: fc.constant("Z") });

/** The keys of each value inside a JSON value, the root first. */
function pathsOf(u: unknown): (readonly (string | number)[])[] {
  const out: (readonly (string | number)[])[] = [];
  const todo: { readonly u: unknown; readonly at: readonly (string | number)[] }[] = [{ u, at: [] }];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    out.push(item.at);
    const here = item;
    if (Array.isArray(here.u)) here.u.forEach((x: unknown, i) => todo.push({ u: x, at: [...here.at, i] }));
    else if (typeof here.u === "object" && here.u !== null) for (const [k, x] of Object.entries(here.u)) todo.push({ u: x, at: [...here.at, k] });
  }
  return out;
}

/** This function gives a copy of a JSON value with another value at a path. */
function replaced(u: unknown, at: readonly (string | number)[], next: unknown): unknown {
  const [k, ...rest] = at;
  if (k === undefined) return next;
  if (Array.isArray(u)) return u.map((x: unknown, i) => (i === k ? replaced(x, rest, next) : x));
  return { ...(u as Readonly<Record<string, unknown>>), [k]: replaced((u as Readonly<Record<string, unknown>>)[k], rest, next) };
}

/** This function gives the parts that a changed document can get: JSON data, and documents of each kind of Vex, valid or not. */
const arbPart = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.jsonValue({ maxDepth: 2 }),
    fc.constantFrom(
      { type: "ref", value: ["self", "p"] },
      { type: "ref", value: ["names", "a"] },
      { type: "ref", value: ["self", { type: ["moves", "key"], value: "A" }, "n"] },
      { type: ["axes", "all"], value: {} },
      { type: ["axes", "where"], value: { axis: { type: ["axes", "others"], value: {} }, test: true } },
      { type: ["moves", "parent"], value: null },
      { type: ["moves", "index"], value: 1 },
      { type: "fn", value: { params: ["a"], body: 1 } },
      { type: "lit", value: { type: "ref", value: ["self"] } },
      { type: ["ops", "add"], value: [1, 2] },
      { type: "record", value: { a: 1 } },
      "A",
      0,
      null,
      [],
      {},
    ),
  );

/**
 * A document of Vex that a random change can make not valid. It is the document of a random expression, through JSON
 * text, with one value at a random path replaced. Each literal of the expression needs a JSON form with the domains.
 */
export const arbChangedDocument = (opts: ArbOptions, domains: readonly AnyDomain[]): fc.Arbitrary<unknown> =>
  fc.tuple(arbExpr(opts), fc.nat(), arbPart(), fc.boolean()).map(([e, i, part, change]) => {
    const d = toDocument(e, domains);
    if (!d.ok) throw new Error(d.error.message);
    const json: unknown = JSON.parse(JSON.stringify(d.value));
    if (!change) return json;
    const paths = pathsOf(json);
    return replaced(json, paths[i % paths.length] ?? [], part);
  });

/** This function makes a literal number. */
const num = (value: number): Expr => ({ tag: "lit", value });

/** A record space of records with a number `n`, with 1 to 4 keys. Some records have no `n`. */
export const arbNumberSpace: fc.Arbitrary<Space> = /* @__PURE__ */ fc.uniqueArray(fc.constantFrom(...RECORD_KEYS), { minLength: 1, maxLength: 4 }).chain((keys) =>
  fc
    .tuple(...keys.map(() => fc.oneof({ weight: 9, arbitrary: fc.integer({ min: -9, max: 9 }).map((n) => ({ n })) }, { weight: 1, arbitrary: fc.constant({}) })))
    .map((recs) => space.record(Object.fromEntries(keys.map((k, i) => [k, recs[i]])))),
);

/**
 * A program over the numbers of `arbNumberSpace` that most often gives a value, for the differential tests of values.
 * It has ops of `NumDomain`, list ops over axes, the special forms, lets, functions and loops. The hostile programs of
 * `arbExpr` mostly give errors, so they rarely compare two values.
 */
export function arbNumberExpr(maxDepth = 4): fc.Arbitrary<Expr> {
  const { expr } = fc.letrec<{ expr: Expr; axis: Axis; list: Expr }>((tie) => ({
    expr: fc.oneof(
      { depthSize: "small", withCrossShrink: true, maxDepth },
      fc.integer({ min: -5, max: 5 }).map(num),
      fc.option(fc.constantFrom<FixedMove>({ t: "origin" }, { t: "key", key: "A" }, { t: "index", i: 0 }, { t: "other" }), { nil: undefined }).map((m): Expr => (m === undefined ? { tag: "ref", path: ["n"] } : { tag: "ref", path: ["n"], at: [m] })),
      fc.tuple(fc.constantFrom("add", "subtract", "multiply", "min", "max"), tie("expr"), tie("expr")).map(([op, a, b]): Expr => ({ tag: "app", op, args: [a, b] })),
      fc.tuple(fc.constantFrom("sum", "count", "min", "max", "mean", "first"), tie("list")).map(([op, l]): Expr => ({ tag: "app", op, args: [l] })),
      fc.tuple(tie("list"), fc.integer({ min: 0, max: 2 })).map(([l, i]): Expr => ({ tag: "app", op: "nth", args: [l, num(i)] })),
      fc.tuple(tie("expr"), tie("expr"), tie("expr")).map(([a, b, c]): Expr => ({ tag: "app", op: "if", args: [{ tag: "app", op: "gt", args: [a, b] }, b, c] })),
      fc.tuple(tie("expr"), tie("expr")).map(([a, b]): Expr => ({ tag: "app", op: "ifError", args: [a, b] })),
      fc.tuple(tie("expr"), tie("expr")).map(([a, body]): Expr => ({ tag: "let", bind: { x: a }, body: { tag: "app", op: "add", args: [{ tag: "var", name: "x" }, body] } })),
      fc.tuple(tie("expr"), tie("expr")).map(([body, a]): Expr => ({ tag: "let", bind: { f: { tag: "fn", params: ["k"], body: { tag: "app", op: "add", args: [{ tag: "var", name: "k" }, body] } } }, body: { tag: "call", fn: "f", args: [a] } })),
      fc.tuple(tie("axis"), tie("expr")).map(([axis, step]): Expr => ({ tag: "fold", axis, init: { s: num(0) }, step: { s: { tag: "app", op: "add", args: [{ tag: "var", name: "s" }, step] } }, result: { tag: "var", name: "s" } })),
      fc.tuple(fc.integer({ min: 0, max: 3 }), tie("expr")).map(([limit, start]): Expr => ({ tag: "iterate", limit, init: { x: start }, step: { x: { tag: "app", op: "add", args: [{ tag: "var", name: "x" }, num(1)] } }, result: { tag: "var", name: "x" } })),
      fc.tuple(tie("axis"), tie("expr")).map(([axis, start]): Expr => ({ tag: "iterate", limit: { axis }, init: { x: start }, step: { x: { tag: "app", op: "add", args: [{ tag: "var", name: "x" }, num(1)] } }, result: { tag: "var", name: "x" } })),
    ),
    axis: fc.oneof(
      { depthSize: "small", maxDepth: 2 },
      fc.constantFrom<Axis>({ t: "all" }, { t: "others" }, { t: "reverse", axis: { t: "all" } }),
      fc.tuple(tie("axis"), tie("expr")).map(([axis, e]): Axis => ({ t: "where", axis, test: { tag: "app", op: "gt", args: [e, num(0)] } })),
      tie("list").map((list): Axis => ({ t: "list", list })),
    ),
    list: fc.oneof(
      { depthSize: "small", maxDepth: 2 },
      fc.tuple(tie("axis"), tie("expr")).map(([axis, body]): Expr => ({ tag: "each", axis, body })),
      tie("list").map((list): Expr => ({ tag: "app", op: "sortBy", args: [list] })),
      fc.tuple(tie("list"), fc.integer({ min: 0, max: 3 })).map(([list, n]): Expr => ({ tag: "app", op: "take", args: [list, num(n)] })),
    ),
  }));
  return expr;
}

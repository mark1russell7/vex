/**
 * Test support of the formula language: fast-check generators of syntax trees and of tables, and a printer of
 * syntax trees. The tests of this package and the tests of the Lab reader use them. The package gives this module
 * as `@vex/formula/testing`, so the app does not load fast-check.
 */
import { space, type Space } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { AGGREGATES, AXES, type AggregateName, type Ast, type BinaryOp, type Nav } from "./syntax.ts";

const NO_SPAN = { start: 0, end: 0 } as const;
const BINARY: readonly BinaryOp[] = ["+", "-", "*", "/", "^", "&", "=", "<>", "<", "<=", ">", ">="];
const CALLS: readonly (readonly [string, number, number])[] = [
  ["IF", 2, 3],
  ["IFERROR", 2, 2],
  ["AND", 1, 3],
  ["or", 1, 3],
  ["NOT", 1, 1],
  ["abs", 1, 1],
  ["Max", 2, 2],
  ["MIN", 2, 2],
  ["round", 1, 1],
  ["UPPER", 1, 1],
  ["RANK", 1, 1],
];

/** A random step of navigation: `this.`, `parent.` or `row(n).`. */
export const arbNav: fc.Arbitrary<Nav> = fc.oneof(fc.constant<Nav>({ t: "this" }), fc.constant<Nav>({ t: "parent" }), fc.integer({ min: -2, max: 2 }).map((n): Nav => ({ t: "row", n })));

/** A random syntax tree that reads the columns `names`. The spans of the nodes are empty. */
export const arbAst = (names: readonly string[]): fc.Arbitrary<Ast> =>
  fc.letrec<{ ast: Ast }>((tie) => ({
    ast: fc.oneof(
      { depthSize: "small", maxDepth: 4, withCrossShrink: true },
      fc.oneof(fc.integer({ min: 0, max: 20 }), fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })).map((v): Ast => ({ k: "num", v, span: NO_SPAN })),
      fc.string({ maxLength: 4 }).map((v): Ast => ({ k: "str", v, span: NO_SPAN })),
      fc.boolean().map((v): Ast => ({ k: "bool", v, span: NO_SPAN })),
      fc.tuple(fc.array(arbNav, { maxLength: 2 }), fc.constantFrom(...names)).map(([nav, name]): Ast => ({ k: "name", nav, name, span: NO_SPAN })),
      tie("ast").map((arg): Ast => ({ k: "neg", arg, span: NO_SPAN })),
      fc.tuple(fc.constantFrom(...BINARY), tie("ast"), tie("ast")).map(([op, left, right]): Ast => ({ k: "binary", op, left, right, span: NO_SPAN })),
      fc
        .constantFrom(...CALLS)
        .chain(([fn, min, max]) => fc.array(tie("ast"), { minLength: min, maxLength: max }).map((args): Ast => ({ k: "call", fn, fnSpan: NO_SPAN, args, span: NO_SPAN }))),
      fc
        .tuple(
          fc.constantFrom(...(Object.keys(AGGREGATES) as AggregateName[])),
          fc.array(arbNav, { maxLength: 1 }),
          fc.constantFrom(...AXES),
          fc.option(tie("ast"), { nil: undefined }),
          tie("ast"),
          fc.boolean(),
        )
        .map(([fn, nav, axis, where, body, noBody]): Ast => ({
          k: "agg",
          fn,
          fnSpan: NO_SPAN,
          nav,
          axis,
          ...(where === undefined ? {} : { where }),
          ...(fn === "COUNT" && noBody ? {} : { body }),
          span: NO_SPAN,
        })),
    ),
  })).ast;

const navText = (ns: readonly Nav[]): string => ns.map((n) => (n.t === "row" ? `row(${n.n}).` : `${n.t}.`)).join("");

/** This function gives the text of a syntax tree. Each operator has parentheses, so the text has the structure of the tree. */
export function printAst(a: Ast): string {
  switch (a.k) {
    case "num":
      return String(a.v);
    case "str":
      return `"${a.v.replaceAll('"', '""')}"`;
    case "bool":
      return a.v ? "TRUE" : "false";
    case "name":
      return `${navText(a.nav)}[${a.name}]`;
    case "neg":
      return `(-${printAst(a.arg)})`;
    case "binary":
      return `(${printAst(a.left)} ${a.op} ${printAst(a.right)})`;
    case "call":
      return `${a.fn}(${a.args.map(printAst).join(", ")})`;
    case "agg":
      return `${a.fn}(${navText(a.nav)}${a.axis}${a.where === undefined ? "" : ` WHERE ${printAst(a.where)}`}${a.body === undefined ? "" : `, ${printAst(a.body)}`})`;
  }
}

/** The value columns of `arbTable`: `a` (a number, or sometimes the text "x"), `b` (a number), `label` and `on`. */
export const TABLE_COLUMNS = ["a", "b", "label", "on"] as const;

/** A random table: a tree space of up to 6 rows. A value of `a` is sometimes a text, so errors also occur. */
export const arbTable: fc.Arbitrary<Space> = fc.uniqueArray(fc.constantFrom("r0", "r1", "r2", "r3", "r4", "r5"), { minLength: 1, maxLength: 6 }).chain((keys) =>
  fc
    .tuple(
      fc.tuple(
        ...keys.map(() =>
          fc.record({
            a: fc.oneof(fc.integer({ min: -5, max: 5 }), fc.constant("x")),
            b: fc.integer({ min: -5, max: 5 }),
            label: fc.constantFrom("", "ab", "Q"),
            on: fc.boolean(),
          }),
        ),
      ),
      fc.tuple(...keys.map((_, i) => (i === 0 ? fc.constant(null) : fc.option(fc.constantFrom(...keys.slice(0, i)), { nil: null })))),
    )
    .map(([records, parents]): Space => space.tree(Object.fromEntries(keys.map((k, i) => [k, records[i]])), Object.fromEntries(keys.map((k, i) => [k, parents[i] ?? null])))),
);

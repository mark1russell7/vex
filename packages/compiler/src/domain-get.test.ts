import { app, axes, each, evaluate, fold, iterate, let_, lit, ok, rec, ref, space, v, vexList, type Expr, type Space } from "@mark1russell7/vex";
import { LiftedNDVectorDomain, NDVector, NDVectorDomain, NumDomain, NumRecordDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tiered, type GenerateOptions } from "./tiers.ts";

/**
 * The differential test of the op `get` of a domain. The name `get` is also the name of a list op, and the receiver
 * selects the op at run time. Thus `get` of `NDVectorDomain` stays in tier 2, and tier 2 gives the result of tier 1.
 */
const PLAIN: GenerateOptions = { domains: [NumDomain, TextDomain, NumRecordDomain, NDVectorDomain] };
const FIRST: GenerateOptions = { domains: [NDVectorDomain, NumRecordDomain, NumDomain, TextDomain] };
const LIFTED: GenerateOptions = { domains: [NumDomain, TextDomain, NumRecordDomain, LiftedNDVectorDomain] };
const SETS: readonly (readonly [string, GenerateOptions])[] = [
  ["the domain is last", PLAIN],
  ["the domain is first", FIRST],
  ["the lifted domain", LIFTED],
];

const LIST = vexList([{ key: "x", result: ok(7) }]);
const S = space.array([
  { v: new NDVector({ x: 3, y: 4 }), n: 1, key: "x", bad: new NDVector({ x: Number.NaN }), mixed: new NDVector({ x: 9 }) },
  { v: new NDVector({ x: 5 }), n: 2, key: "y", bad: new NDVector({ x: Number.POSITIVE_INFINITY }), mixed: LIST },
  { v: new NDVector({ y: -1 }), n: 3, key: "z", bad: new NDVector({ x: 0 }), mixed: "text" },
]);

const vx = app("get", ref("v"), lit("x"));
/** The insets of a box, as one vector. */
const insets = app("toNDVector", rec({ left: ref("n"), right: lit(4) }));
const left = app("get", v("b"), lit("left"));
const right = app("get", v("b"), lit("right"));

/** This function asserts that the tiered program gives the result of tier 1 at each record, and that tier 2 gives the program. */
function same(e: Expr, fast: boolean, options: GenerateOptions, sp: Space = S): void {
  const p = tiered(e, options);
  expect(p.reason).toBeUndefined();
  expect(p.tier).toBe(2);
  for (const k of sp.keys) {
    const run = { space: sp, origin: k };
    expect(fromCore(p.run(run))).toStrictEqual(fromCore(evaluate(e, { ...options, ...run })));
  }
  expect(p.stats.fallbacks === 0).toBe(fast);
}

/** A case: its title, its program and the answer to the question "does tier 2 give the result". */
type Case = readonly [string, Expr, boolean];

const values: readonly Case[] = [
  ["a field", vx, true],
  ["a key that the vector does not have", app("get", ref("v"), lit("zz")), true],
  ["a key from a field", app("get", ref("v"), ref("key")), true],
  ["a corner: the sum of two insets", let_({ b: insets }, app("add", left, right)), true],
  ["an inset of a scaled box", let_({ b: insets }, app("get", app("scale", v("b"), lit(2)), lit("right"))), true],
  ["a loop over the records", app("sum", each(axes.all, vx)), true],
  ["a list of the values", app("values", each(axes.all, vx)), true],
  ["a fold with a vector", fold(axes.all, { a: insets }, { a: app("add", v("a"), ref("v")) }, app("get", v("a"), lit("x"))), true],
  ["an iteration with a vector", iterate(3, { a: insets }, { a: app("set", v("a"), lit("left"), app("add", app("get", v("a"), lit("left")), lit(1))) }, app("get", v("a"), lit("left"))), true],
  ["the list op and the op of the domain in one program", app("add", app("get", each(axes.all, ref("n")), lit("0")), vx), true],
];

const errors: readonly Case[] = [
  ["a value that is NaN or infinite", app("get", ref("bad"), lit("x")), true],
  ["a key that is not a text", app("get", ref("v"), lit(1)), true],
  ["a receiver with an error", app("get", ref("nope"), lit("x")), true],
  ["a key with an error", app("get", ref("v"), ref("nope")), true],
  ["two arguments with errors", app("get", ref("nope"), ref("nope2")), true],
  ["no key", app("get", ref("v")), true],
  ["a receiver that is a number", app("get", ref("n"), lit("x")), true],
  ["a receiver that is a text", app("get", ref("key"), lit("x")), true],
  ["ifError catches a bad value", app("ifError", app("get", ref("bad"), lit("x")), lit(-1)), true],
  ["ifError catches a bad key", app("ifError", app("get", ref("v"), lit(1)), lit(-1)), true],
  ["a loop skips a bad value", app("sum", each(axes.all, app("get", ref("bad"), lit("x")))), true],
  ["a loop skips a bad key", app("count", each(axes.all, app("get", ref("v"), lit(1)))), true],
  ["strict gives the first bad value", app("sum", each(axes.all, app("get", ref("bad"), lit("x"))), lit({ strict: true })), true],
];

const keys = fc.constantFrom("x", "y", "z");
const part = fc.oneof(fc.double(), fc.constant(0), fc.integer({ min: -9, max: 9 }));
const vector = fc.record({ x: part, y: part }, { requiredKeys: ["x"] });
/** This function gives the record of a random vector. */
const rowOf = (c: Readonly<Record<string, number>>): { readonly v: NDVector } => ({ v: new NDVector(c) });

describe.each(SETS)("COMPILE.LIST.VALUE COMPILE.TIERED: the op get of a domain in tier 2, %s", (_title, options) => {
  it.each(values)("the value: %s", (_case, e, fast) => expect(() => same(e, fast, options)).not.toThrow());
  it.each(errors)("the error: %s", (_case, e, fast) => expect(() => same(e, fast, options)).not.toThrow());

  it("the receiver selects the op at each run: a vector, a list or a text", () => {
    expect(() => same(app("get", ref("mixed"), lit("x")), true, options)).not.toThrow();
  });

  it("LIST.ARRAY: an array at the same site goes to tier 1", () => {
    const sp = space.array([{ m: new NDVector({ x: 1 }) }, { m: [8] }]);
    expect(() => same(app("get", ref("m"), lit("0")), false, options, sp)).not.toThrow();
  });

  it("a random vector, also with NaN and infinite parts, gives the result of tier 1", () => {
    const random = fc.property(fc.array(vector, { minLength: 1, maxLength: 4 }), keys, (rows, key) => {
      const sp = space.array(rows.map(rowOf));
      const at = app("get", ref("v"), lit(key));
      same(app("add", at, app("get", app("scale", ref("v"), lit(2)), lit(key))), true, options, sp);
      same(app("sum", each(axes.all, at)), true, options, sp);
    });
    expect(() => fc.assert(random)).not.toThrow();
  });
});

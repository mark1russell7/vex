import { app, axes, compile, defineDomain, each, evaluate, fold, iterate, let_, lit, ref, space, v, type Expr, type FreeFn, type ListOp } from "@mark1russell7/vex";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

/**
 * The tests of a list op of tier 2 on an array (COMPILE.LIST.ARRAY). For each program, the tiered program gives the bits
 * of the interpreter and of the reference tier. The argument `fast` tells if tier 2 gives each result.
 */
const OPTIONS: GenerateOptions = { domains: [NumDomain, TextDomain] };
const S = space.array([{ n: 3, fr: [1, 2] }, { n: 1, fr: [] }, { n: 2, fr: [1, null] }]);
const strict = { strict: true };
const VARS = {
  nums: [3, 1, 2],
  texts: ["p", "q", "p"],
  flags: [true, false],
  none: [],
  holes: [4, undefined, 6],
  // oxlint-disable-next-line no-sparse-arrays -- a position without a value is the case of this test
  sparse: [1, , 3],
  nulls: [null, 5],
  allHoles: [null, undefined],
  frozen: Object.freeze([2, 1]),
  frozenItems: Object.freeze([Object.freeze([1]), Object.freeze([2, 3])]),
  nested: [[1, 2], [3, null], []],
  records: [{ x: 1 }, { x: 2 }],
};
type Name = keyof typeof VARS;
const NAMES = Object.keys(VARS) as readonly Name[];
const HOLES: readonly Name[] = ["holes", "sparse", "nulls", "allHoles"];

/** This function runs a program at each record, and it gives the number of its fallbacks. Each result agrees with tier 1 and the kernel. */
function agree(e: Expr, options: GenerateOptions = OPTIONS): number {
  const p = tiered(e, options);
  expect(p.tier).toBe(2);
  for (const origin of S.keys) {
    const run = { ...options, space: S, origin, vars: VARS };
    const expected = evaluate(e, run);
    expect(p.run({ space: S, origin, vars: VARS })).toStrictEqual(expected);
    expect(fromReference(referenceEvaluate(e, run))).toStrictEqual(fromCore(expected));
  }
  return p.stats.fallbacks;
}

/** This function tells if a program agrees with tier 1 and the kernel, and if the argument `fast` tells its fallbacks. */
function same(e: Expr, fast: boolean, options: GenerateOptions = OPTIONS): boolean {
  const none = agree(e, options) === 0;
  return none === fast;
}

const isArray = (u: unknown): u is readonly unknown[] => Array.isArray(u);
const atFirst = (e: Expr, options: GenerateOptions): unknown => tiered(e, options).run({ space: S, origin: "0", vars: VARS });

/** A list op and its arguments after the receiver. */
type Case = readonly [ListOp, readonly unknown[]];
const OPS: readonly Case[] = [
  ["count", []],
  ["sum", []],
  ["mean", []],
  ["min", []],
  ["max", []],
  ["any", []],
  ["all", []],
  ["none", []],
  ["first", []],
  ["values", []],
  ["keys", []],
  ["reduce", ["add"]],
  ["sortBy", []],
  ["take", [1]],
  ["take", ["x"]],
  ["drop", [1]],
  ["nth", [0]],
  ["nth", [9]],
  ["append", [[7, null]]],
  ["append", [3]],
  ["flat", []],
  ["without", [[0]]],
  ["get", ["0"]],
  ["get", ["z"]],
  ["get", [1]],
  ["indexOf", [1]],
  ["indexOf", [null]],
  ["distinct", []],
  ["group", [["a", "b", "c"]]],
  ["group", [[null, "b"]]],
  ["group", [3]],
  ["join", ["-"]],
];
const CASES = NAMES.flatMap((name) => OPS.map(([op, rest]) => [op, name, rest] as const));

/** This function gives a fold whose array grows at each step: LOOP.SIZE refuses it. */
const growing = (name: Name): Expr => fold(axes.all, { a: v(name) }, { a: app("append", v("a"), v("a")) }, app("count", v("a")));

describe("COMPILE.LIST.ARRAY: tier 2 gives a list op on an array", () => {
  it.each(CASES)("COMPILE.LIST.ARRAY: %s of %s, %j gives the result of tier 1 with no fallback", (op, name, rest) => {
    const args = rest.map((x) => lit(x));
    expect(same(app(op, v(name), ...args), true)).toBe(true);
    // LIST.LENIENT: the option comes after the arguments of the op, and it gives the error of a hole at the call.
    expect(same(app(op, v(name), ...args, lit(strict)), true)).toBe(true);
  });

  it.each(HOLES)("COMPILE.LIST.ARRAY: a strict list op over %s gives the error of the hole, at the call", (name) => {
    for (const e of [app("sum", v(name), lit(strict)), app("take", v(name), lit(1), lit(strict)), app("nth", app("append", lit([1]), v(name), lit(strict)), lit(0)), app("add", lit(1), app("first", v(name), lit(strict)))]) expect(same(e, true)).toBe(true);
    const r = tiered(app("add", lit(1), app("first", v(name), lit(strict))), OPTIONS).run({ space: S, origin: "0", vars: VARS });
    expect(r).toMatchObject({ ok: false, error: { kind: "missing-field", origin: "0", focus: "0", path: [1] } });
  });

  it("COMPILE.LIST.ARRAY: a hole of a second list or of an inner array follows the rule of the first list", () => {
    for (const e of [app("append", v("nums"), v("holes")), app("append", v("nums"), v("holes"), lit(strict)), app("without", v("nums"), v("nulls"), lit(strict)), app("flat", v("nested")), app("flat", v("nested"), lit(strict)), app("group", v("nums"), v("holes"), lit(strict))]) expect(same(e, true)).toBe(true);
  });

  it("COMPILE.LIST.ARRAY: an array in a field gives the result at each record, also in the body of a list op", () => {
    for (const e of [app("sum", ref("fr")), app("sum", ref("fr"), lit(strict)), app("sum", each(axes.all, app("sum", ref("fr")))), app("values", each(axes.all, app("count", ref("fr")))), app("sum", each(axes.all, app("sum", ref("fr"), lit(strict))))]) expect(same(e, true)).toBe(true);
  });

  it("COMPILE.LIST.ARRAY LIST.ARRAY: the op of a domain, a method and a function of the host come before the list op", () => {
    const Own = defineDomain({ name: "Own", is: isArray, ops: { count: { fn: (): number => 41 } } });
    const Wide = defineDomain({ name: "Wide", methods: "all", is: isArray, ops: {} });
    const Other = defineDomain({ name: "Other", is: isArray, ops: { other: { fn: (): number => 1 } } });
    const fns: Readonly<Record<string, FreeFn>> = { sum: () => 42, count: () => 43 };
    expect(same(app("count", v("nums")), true, { domains: [Own] })).toBe(true);
    expect(same(app("sum", v("nums")), true, { domains: [Own], fns })).toBe(true);
    expect(same(app("count", v("nums")), true, { domains: [Own], fns })).toBe(true);
    expect(same(app("sum", v("nums")), true, { ...OPTIONS, fns })).toBe(true);
    // An array has the method `join`, so that method comes first. An array has no method `count`, so the list op gives it.
    expect(same(app("join", v("nums"), lit("+")), true, { domains: [Wide] })).toBe(true);
    expect(same(app("count", v("nums")), true, { domains: [Wide] })).toBe(true);
    // A domain that accepts the array but has no such op does not stop the list op.
    expect(same(app("count", v("nums")), true, { domains: [Other] })).toBe(true);
    expect(atFirst(app("count", v("nums")), { domains: [Own] })).toStrictEqual({ ok: true, value: 41 });
    expect(atFirst(app("sum", v("nums")), { ...OPTIONS, fns })).toStrictEqual({ ok: true, value: 42 });
  });

  it("COMPILE.LIST.ARRAY: a frozen array and frozen items stay as they are, and a value of a list op is frozen", () => {
    for (const e of [app("values", v("frozen")), app("sortBy", v("frozen")), app("flat", v("frozenItems")), app("first", v("frozenItems"))]) expect(same(e, true)).toBe(true);
    const first = tiered(app("first", v("frozenItems")), OPTIONS).run({ space: S, origin: "0", vars: VARS });
    expect(first.ok ? first.value : undefined).toBe(VARS.frozenItems[0]);
    const values = tiered(app("values", v("nums")), OPTIONS).run({ space: S, origin: "0", vars: VARS });
    expect(values.ok && Object.isFrozen(values.value)).toBe(true);
  });

  it("LOOP.SIZE COMPILE.LIST.ARRAY: tier 2 refuses a program with a growing array, as tier 1 does", () => {
    const refused = growing("nums");
    const generated = generate(refused, OPTIONS);
    expect(generated.ok ? "" : generated.reason).toMatch(/LOOP.SIZE|size|grow/iu);
    const p = tiered(refused, OPTIONS);
    expect(p.tier).toBe(1);
    const run = { space: S, origin: "0", vars: VARS };
    expect(p.run(run)).toStrictEqual(compile(refused, OPTIONS).run(run));
    expect(p.run(run).ok).toBe(false);
    // A loop with a fixed count has a bound, so both tiers give it.
    expect(same(iterate(2, { a: v("nums") }, { a: app("drop", v("a"), lit(1)) }, app("count", v("a"))), true)).toBe(true);
  });
});

describe("COMPILE.LIST.ARRAY: `errors` of an array", () => {
  it.each(NAMES.filter((n) => !HOLES.includes(n)))("COMPILE.LIST.ARRAY: errors of %s, with no hole at its top, stays in tier 2", (name) => {
    expect(same(app("errors", v(name)), true)).toBe(true);
    expect(same(app("count", each(axes.all, app("errors", v(name)))), true)).toBe(true);
  });

  it.each(HOLES)("V-064 COMPILE.LIST.ARRAY: tier 1 gives errors of %s, the values have the position of the call, and no item drops", (name) => {
    const errors = app("errors", v(name));
    expect(same(errors, false)).toBe(true);
    expect(same(app("values", each(axes.all, errors)), false)).toBe(true);
    // With FALLBACK in place of the exception, the loop of count skips each item, and the count is 0.
    const count = app("count", each(axes.all, errors));
    expect(same(count, false)).toBe(true);
    expect(tiered(count, OPTIONS).run({ space: S, origin: "0", vars: VARS })).toStrictEqual({ ok: true, value: 3 });
    // The other contexts that catch an error: the first argument of ifError, a local and the body of a fold.
    expect(same(app("ifError", errors, lit(-1)), false)).toBe(true);
    expect(same(let_({ x: errors }, lit(1)), false)).toBe(true);
    expect(same(fold(axes.all, { s: lit(0) }, { s: app("add", v("s"), app("ifError", app("count", errors), lit(100))) }, v("s")), false)).toBe(true);
  });

  it("V-064 COMPILE.LIST.ARRAY: a strict errors over a hole is an error of the op, so it stays in tier 2", () => {
    expect(same(app("errors", v("holes"), lit(strict)), true)).toBe(true);
    expect(same(app("count", each(axes.all, app("errors", v("holes"), lit(strict)))), true)).toBe(true);
  });
});

const ARRAYS = fc.constantFrom<Expr>(v("nums"), v("none"), v("nested"), v("frozen"), ref("fr"), lit([]), v("holes"), v("sparse"), v("nulls"), v("allHoles"), lit([1, null]));
const ERRORS: Case = ["errors", []];
const LIST_OP = fc.oneof({ weight: 2, arbitrary: fc.constantFrom(...OPS) }, { weight: 1, arbitrary: fc.constant(ERRORS) });
/** A list op on an array. The option strict is in one program of four. */
const ARRAY_OP = fc.tuple(LIST_OP, ARRAYS, fc.nat(3)).map(([[op, rest], a, n]): Expr => app(op, a, ...rest.map((x) => lit(x)), ...(n === 0 ? [lit(strict)] : [])));

/** A list op on an array at the top of a program, and in each context that catches an error. */
const PROGRAM = fc.oneof(
  ARRAY_OP,
  fc.tuple(fc.constantFrom("count", "sum", "values", "first"), ARRAY_OP).map(([outer, x]): Expr => app(outer, each(axes.all, x))),
  ARRAY_OP.map((x): Expr => app("count", each(axes.all, x), lit(strict))),
  ARRAY_OP.map((x): Expr => app("ifError", x, lit(-1))),
  ARRAY_OP.map((x): Expr => let_({ x }, lit(1))),
  ARRAY_OP.map((x): Expr => fold(axes.all, { s: lit(0) }, { s: app("add", v("s"), app("ifError", app("count", x), lit(100))) }, v("s"))),
  fc.tuple(ARRAYS, ARRAY_OP).map(([a, x]): Expr => app("count", each(axes.list(a), x))),
);

describe("P17 COMPILE.LIST.ARRAY: on programs with list ops on arrays, a tiered program gives the result of the interpreter and of the kernel", () => {
  it("P17 V-064 COMPILE.LIST.ARRAY: each result agrees, and the generator reaches the exception of the runtime", () => {
    const tally = { programs: 0, fallbacks: 0 };
    fc.assert(
      fc.property(PROGRAM, (e) => {
        tally.programs++;
        if (agree(e) > 0) tally.fallbacks++;
      }),
      { numRuns: 400 },
    );
    expect(tally.fallbacks).toBeGreaterThan(0);
    expect(tally.fallbacks / tally.programs).toBeLessThan(0.5);
  });
});

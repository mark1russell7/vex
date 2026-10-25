/**
 * Arrays as lists (LIST.ARRAY), and the list ops `indexOf` (LIST.INDEXOF) and `fill` (LIST.FILL). A JSON array of a name
 * or of a field reads as a list where a list is needed. Each test compares tier 1 with the kernel (EVAL.REFERENCE).
 */
import { describe, expect, it } from "vitest";
import { defineDomain, type AnyDomain } from "./domain.ts";
import { evaluate, type CompileOptions, type FreeFn } from "./evaluate.ts";
import { app, axes, each, fold, let_, lit, ref, v, type Expr } from "./ir.ts";
import { isVexList, vexList, type ListItem } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import { ok, type Result } from "./result.ts";
import { space } from "./space.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"] },
    subtract: { fn: (a: number, b: number): number => a - b, params: ["number"] },
    multiply: { fn: (a: number, b: number): number => a * b, params: ["number"] },
    divide: { fn: (a: number, b: number): number => a / b, params: ["number"] },
    max: { fn: (a: number, b: number): number => Math.max(a, b), params: ["number"] },
    gte: { fn: (a: number, b: number): boolean => a >= b, params: ["number"] },
  },
});

const FR = [0.2, 0.3, 0.5] as const;
const rows = space.array([{ fr: [0.2, 0.3, 0.5], w: 1 }, { fr: [], w: 2 }, { w: 3 }]);

interface Run {
  readonly vars?: Readonly<Record<string, unknown>>;
  readonly origin?: string;
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, FreeFn>>;
}

/** This function gives a value without the location of each error in it: only tier 1 gives the location. */
const bare = (u: unknown): unknown => {
  if (Array.isArray(u)) return u.map(bare);
  const e = u as { code?: unknown; kind?: unknown; message?: unknown } | null;
  return typeof e?.code === "string" && typeof e.kind === "string" ? { code: e.code, kind: e.kind, message: e.message } : u;
};

/** This function gives the value of a result, or its code. A list gives each item as a key and a value or a code. */
function plain(r: Result<unknown>): unknown {
  if (!r.ok) return r.error.code;
  if (!isVexList(r.value)) return bare(r.value);
  return r.value.items.map((item) => [item.key, item.result.ok ? bare(item.result.value) : item.result.error.code]);
}

/** This function gives the result of tier 1. */
const tier1 = (e: Expr, { vars = { fr: FR }, origin = "0", domains = [Num], fns }: Run = {}): Result<unknown> =>
  evaluate(e, { space: rows, origin, domains, vars, ...(fns === undefined ? {} : { fns }) });

/** This function gives the result of tier 1, and checks that the kernel gives the same value or code. */
function both(e: Expr, run: Run = {}): unknown {
  const { vars = { fr: FR }, origin = "0", domains = [Num], fns } = run;
  const opts: CompileOptions = { domains, ...(fns === undefined ? {} : { fns }) };
  const expected = plain(tier1(e, run));
  expect(plain(kernelPlan(e, opts).run({ space: rows, origin, vars }))).toEqual(expected);
  return expected;
}

/** This function gives the code, the message and the kind of the error of tier 1 and of the kernel. */
function errorsOf(e: Expr, run: Run = {}): readonly unknown[] {
  const { vars = { fr: FR }, origin = "0", domains = [Num] } = run;
  const r = tier1(e, run);
  const k = kernelPlan(e, { domains }).evaluate({ space: rows, origin, vars });
  return [r.ok ? "a value" : [r.error.code, r.error.message, r.error.kind], k.ok ? "a value" : [k.error.code, k.error.reason, (k.error.cause as { kind?: string } | undefined)?.kind]];
}

/** This function makes a list literal with a value for each key. */
const listLit = (...pairs: readonly (readonly [string, unknown])[]): Expr => lit(vexList(pairs.map(([key, x]): ListItem => ({ key, result: ok(x) }))));
const fr = v("fr");

describe("arrays as lists", () => {
  it("LIST.ARRAY: a list op reads an array of a name as a list, with the positions as keys", () => {
    expect(both(app("count", fr))).toBe(3);
    expect(both(app("sum", fr))).toBe(1);
    expect(both(app("keys", fr))).toEqual(["0", "1", "2"]);
    expect(both(app("values", fr))).toEqual([0.2, 0.3, 0.5]);
    expect(both(app("first", fr))).toBe(0.2);
    expect(both(app("min", fr))).toBe(0.2);
    expect(both(app("max", fr))).toBe(0.5);
    expect(both(app("take", fr, lit(2)))).toEqual([["0", 0.2], ["1", 0.3]]);
    expect(both(app("drop", fr, lit(1)))).toEqual([["1", 0.3], ["2", 0.5]]);
    expect(both(app("nth", fr, lit(1)))).toBe(0.3);
    expect(both(app("nth", fr, lit(3)))).toBe("#N/A");
    expect(both(app("get", fr, lit("2")))).toBe(0.5);
    expect(both(app("sortBy", lit([3, 1, 2])))).toEqual([["1", 1], ["2", 2], ["0", 3]]);
    expect(both(app("reduce", lit([1, 2, 3]), lit("add")))).toBe(6);
    expect(both(app("any", lit([false, true])))).toBe(true);
    expect(both(app("count", lit([])))).toBe(0);
    // A list op of an array gives the list of a list op, so an op can read the list of another op.
    expect(both(app("sum", app("take", fr, lit(2))))).toBe(0.5);
  });

  it("LIST.ARRAY: a list op reads an array of a field as a list", () => {
    expect(both(app("sum", ref("fr")))).toBe(1);
    expect(both(app("count", ref("fr")), { origin: "1" })).toBe(0);
    expect(both(app("count", ref("fr")), { origin: "2" })).toBe("#N/A");
  });

  it("LIST.ARRAY LIST.BUILD: the second list of append and without, and each list of flat, can be an array", () => {
    expect(both(app("append", fr, lit([7])))).toEqual([["0", 0.2], ["1", 0.3], ["2", 0.5], ["0", 7]]);
    expect(both(app("append", listLit(["a", 1]), fr))).toEqual([["a", 1], ["0", 0.2], ["1", 0.3], ["2", 0.5]]);
    expect(both(app("without", fr, lit([9])))).toEqual([["1", 0.3], ["2", 0.5]]);
    expect(both(app("flat", lit([[1, 2], [3]])))).toEqual([["0", 1], ["1", 2], ["0", 3]]);
    expect(both(app("flat", each(axes.all, ref("fr"))), { origin: "0" })).toEqual([["0", 0.2], ["1", 0.3], ["2", 0.5]]);
    expect(errorsOf(app("append", fr, lit(5)))).toEqual([
      ["#VALUE!", '"append" needs a list as its second argument, not a number', "kind-mismatch"],
      ["#VALUE!", '"append" needs a list as its second argument, not a number', "kind-mismatch"],
    ]);
    expect(errorsOf(app("flat", lit([[1], 2])))).toEqual([
      ["#VALUE!", '"flat" needs a list as the value of each item, but an item is a number', "kind-mismatch"],
      ["#VALUE!", '"flat" needs a list as the value of each item, but an item is a number', "kind-mismatch"],
    ]);
  });

  it("LIST.ARRAY AXIS.LIST: the axis list over an array has the positions as targets, in order", () => {
    expect(both(app("values", each(axes.list(fr), ref("w"))))).toEqual([1, 2, 3]);
    expect(both(app("values", each(axes.reverse(axes.list(fr)), ref("w"))))).toEqual([3, 2, 1]);
    expect(both(app("values", each(axes.list(app("take", fr, lit(2))), ref("w"))))).toEqual([1, 2]);
    // A fold over the axis counts the items, so its step reads the value at each position with nth.
    const running = fold(axes.list(fr), { i: lit(0), at: lit(0) }, { i: app("add", v("i"), lit(1)), at: app("add", v("at"), app("nth", fr, v("i"))) }, v("at"));
    expect(both(running)).toBe(1);
    // A position without a value gives an error item for its target.
    expect(both(each(axes.list(lit([5, null])), ref("w")))).toEqual([["0", 1], ["1", "#N/A"]]);
    expect(errorsOf(each(axes.list(lit("ab")), ref("w")))).toEqual([
      ["#VALUE!", 'the axis "list" needs a list, not a string', "kind-mismatch"],
      ["#VALUE!", 'the axis "list" needs a list, not a string', "kind-mismatch"],
    ]);
  });

  it("LIST.ARRAY REF.MISSING: a position without a value, or with null, is an error item of #N/A, and strict gives it", () => {
    const holes: unknown[] = [];
    holes[2] = 3;
    expect(both(app("count", lit([1, null, 3])))).toBe(2);
    expect(both(app("count", v("h")), { vars: { h: holes } })).toBe(1);
    expect(both(app("keys", v("h")), { vars: { h: holes } })).toEqual(["2"]);
    expect(both(app("errors", v("h")), { vars: { h: holes } })).toEqual([
      { code: "#N/A", kind: "missing-field", message: "the array has no value at the position 0" },
      { code: "#N/A", kind: "missing-field", message: "the array has no value at the position 1" },
    ]);
    const strict = errorsOf(app("first", lit([null, 1]), lit({ strict: true })));
    expect(strict).toEqual([
      ["#N/A", "the array has no value at the position 0", "missing-field"],
      ["#N/A", "the array has no value at the position 0", "missing-field"],
    ]);
    // Tier 1 gives the location of the node in the error item.
    const r = tier1(app("errors", lit([null])));
    expect(r).toMatchObject({ ok: true, value: [{ path: [], origin: "0", focus: "0" }] });
  });

  it("LIST.ARRAY: a domain or a function of the host with the op comes first, so each result of before stays", () => {
    const Arr = defineDomain({ name: "Arr", is: (u: unknown): u is readonly unknown[] => Array.isArray(u), ops: { count: { fn: (): number => 99 } } });
    expect(both(app("count", lit([1, 2])), { domains: [Arr, Num] })).toBe(99);
    // The domain accepts the array, but it has no op sum. Thus sum reads the array as a list.
    expect(both(app("sum", lit([1, 2])), { domains: [Arr, Num] })).toBe(3);
    expect(both(app("sum", lit([1, 2])), { fns: { sum: (): number => 42 } })).toBe(42);
    // An op that is not a list op, and a list op on a value that is not an array, keep their errors.
    expect(errorsOf(app("nope", lit([1])))).toEqual([
      ["#VALUE!", 'no domain accepts the receiver of "nope" (array)', "not-instance"],
      ["#VALUE!", 'no domain accepts the receiver of "nope" (array)', "not-instance"],
    ]);
    expect(both(app("count", lit(5)))).toBe("#NAME?");
    expect(both(app("count", lit("ab")), { domains: [] })).toBe("#VALUE!");
    expect(both(app("count", lit({ length: 2 })), { domains: [] })).toBe("#VALUE!");
  });

  it("LIST.ARRAY: an array gives the result of the list with its positions as keys, for each list op", () => {
    const arrays: readonly (readonly unknown[])[] = [[], [2], [3, 1, 2], [0.5, -1, 0.5], ["b", "a"], [true, false], [[1], [2, 3]]];
    const ops: readonly (readonly [string, ...Expr[]])[] = [
      ["count"], ["sum"], ["mean"], ["min"], ["max"], ["any"], ["all"], ["none"], ["values"], ["keys"], ["first"], ["errors"], ["sortBy"],
      ["take", lit(2)], ["drop", lit(1)], ["nth", lit(1)], ["get", lit("1")], ["flat"], ["append", lit([9])], ["without", lit([0])],
      ["reduce", lit("add")], ["indexOf", lit(2)], ["indexOf", lit("a")],
    ];
    for (const a of arrays) {
      const asList = listLit(...a.map((x, i): readonly [string, unknown] => [String(i), x]));
      for (const [op, ...rest] of ops) expect([op, a, both(app(op, lit(a), ...rest))]).toEqual([op, a, plain(tier1(app(op, asList, ...rest)))]);
    }
  });
});

describe("indexOf and fill", () => {
  it("LIST.INDEXOF: indexOf gives the position of the first item with the value, from 0", () => {
    expect(both(app("indexOf", fr, lit(0.3)))).toBe(1);
    expect(both(app("indexOf", lit(["a", "b", "a"]), lit("a")))).toBe(0);
    expect(both(app("indexOf", lit(["a", "b", "a"]), lit("b")))).toBe(1);
    expect(both(app("indexOf", lit([false, true]), lit(true)))).toBe(1);
    expect(both(app("indexOf", each(axes.all, ref("w")), lit(3)))).toBe(2);
    // The position of the value is the position of nth, so nth gives the value again.
    const at = app("indexOf", lit(["x", "y", "z"]), lit("z"));
    expect(both(app("nth", lit(["x", "y", "z"]), at))).toBe("z");
  });

  it("LIST.INDEXOF LIST.LENIENT: an error item is not a position, and strict gives the first error", () => {
    expect(both(app("indexOf", lit([null, 5]), lit(5)))).toBe(0);
    expect(both(app("indexOf", lit([null, 5]), lit(5), lit({ strict: true })))).toBe("#N/A");
    expect(both(app("indexOf", lit([4, 5]), lit(5), lit({ strict: true })))).toBe(1);
  });

  it("LIST.INDEXOF: a value that no item has gives #N/A, and a value that is not a number, a text or a boolean gives #VALUE!", () => {
    expect(errorsOf(app("indexOf", fr, lit("z")))).toEqual([
      ["#N/A", 'the list has no item with the value "z"', "missing-field"],
      ["#N/A", 'the list has no item with the value "z"', "missing-field"],
    ]);
    expect(both(app("indexOf", lit([1]), lit("1")))).toBe("#N/A");
    expect(both(app("indexOf", lit([Number.NaN]), lit(Number.NaN)))).toBe("#N/A");
    expect(errorsOf(app("indexOf", fr, lit(null)))).toEqual([
      ["#VALUE!", '"indexOf" needs a number, a text or a boolean, not a null', "kind-mismatch"],
      ["#VALUE!", '"indexOf" needs a number, a text or a boolean, not a null', "kind-mismatch"],
    ]);
    expect(both(app("indexOf", lit([[1]]), lit([1])))).toBe("#VALUE!");
    expect(both(app("indexOf", fr))).toBe("#VALUE!");
  });

  it("LIST.FILL: fill(n, value) gives n items with the value, and the positions as keys", () => {
    expect(both(app("fill", lit(3), lit(0.5)))).toEqual([["0", 0.5], ["1", 0.5], ["2", 0.5]]);
    expect(both(app("fill", lit(0), lit(1)))).toEqual([]);
    expect(both(app("fill", lit(1), lit("a")))).toEqual([["0", "a"]]);
    expect(both(app("sum", app("fill", lit(4), lit(0.25))))).toBe(1);
    expect(both(app("count", app("fill", lit(100_000), lit(1))))).toBe(100_000);
    expect(both(app("count", app("fill", lit(2), listLit(["k", 1]))))).toBe(2);
    // The value is the same for each item: the equal shares of a stack.
    expect(both(let_({ n: lit(4) }, app("values", app("fill", v("n"), app("divide", lit(1), v("n"))))))).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("LIST.FILL: a count that is not a whole number from 0 to 100000, or no value, gives #VALUE!", () => {
    for (const bad of [-1, 1.5, 100_001, 2 ** 53, Number.NaN]) {
      expect(errorsOf(app("fill", lit(bad), lit(1)))).toEqual([
        ["#VALUE!", '"fill" needs a whole number from 0 to 100000, not number', "kind-mismatch"],
        ["#VALUE!", '"fill" needs a whole number from 0 to 100000, not number', "kind-mismatch"],
      ]);
    }
    expect(both(app("fill", lit("3"), lit(1)))).toBe("#VALUE!");
    expect(errorsOf(app("fill", lit(2)))).toEqual([
      ["#VALUE!", '"fill" needs argument 2', "bad-expression"],
      ["#VALUE!", '"fill" needs argument 2', "bad-expression"],
    ]);
    expect(both(app("fill"))).toBe("#VALUE!");
  });

  it("LIST.FILL: a domain or a function of the host with the op fill comes first", () => {
    const Paint = defineDomain({ name: "Paint", is: (u: unknown): u is number => typeof u === "number", ops: { fill: { fn: (a: number): number => a * 10 } } });
    expect(both(app("fill", lit(3), lit(1)), { domains: [Paint] })).toBe(30);
    expect(both(app("fill", lit(3), lit(1)), { fns: { fill: (): string => "host" } })).toBe("host");
  });
});

describe("the stack of a layout", () => {
  // The study of Graph: bounds (300, 220), the gap 10 and the fractions 0.2, 0.3 and 0.5, on the vertical axis.
  const stack = space.array([{ key: "head" }, { key: "body" }, { key: "foot" }, { key: "side" }]);
  const vars = { fr: FR, keys: ["head", "body", "foot"], height: 220, gap: 10 };
  // The length of the axis without the gaps: 220 - 10 * (3 - 1) = 200.
  const total = app("subtract", v("height"), app("multiply", v("gap"), app("max", lit(0), app("subtract", app("count", fr), lit(1)))));
  // The cursor of the stack: for each fraction before the slot, max(0, f) * total + gap, in the order of the code of Graph.
  const offset = fold(axes.list(app("take", fr, v("s"))), { i: lit(0), at: lit(0) }, { i: app("add", v("i"), lit(1)), at: app("add", v("at"), app("add", app("multiply", app("max", lit(0), app("nth", fr, v("i"))), v("total")), v("gap"))) }, v("at"));
  const span = app("multiply", app("max", lit(0), app("nth", fr, v("s"))), v("total"));
  const slot = app("indexOf", v("keys"), ref("key"));
  const at = (body: Expr): Expr => let_({ total }, let_({ s: slot }, body));
  const run = (e: Expr, origin: string): unknown => {
    const opts = { space: stack, origin, domains: [Num], vars };
    const r = plain(evaluate(e, opts));
    expect(plain(kernelPlan(e, { domains: [Num] }).run(opts))).toEqual(r);
    return r;
  };

  it("LIST.ARRAY LIST.INDEXOF: the offsets are 0, 50 and 120, and the spans are 40, 60 and 100", () => {
    expect(["0", "1", "2"].map((k) => run(at(offset), k))).toEqual([0, 50, 120]);
    expect(["0", "1", "2"].map((k) => run(at(span), k))).toEqual([40, 60, 100]);
    // A key that the stack does not have gives #N/A, so the item gets no slot.
    expect(run(at(offset), "3")).toBe("#N/A");
  });

  it("LIST.FILL: without fractions, fill gives equal shares", () => {
    const shares = app("fill", lit(4), app("divide", lit(1), lit(4)));
    expect(run(let_({ fr: shares }, app("values", fr)), "0")).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(run(let_({ fr: shares }, app("count", fr)), "0")).toBe(4);
  });
});

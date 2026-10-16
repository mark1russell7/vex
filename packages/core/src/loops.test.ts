import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { evaluate, explain, type EvalOptions } from "./evaluate.ts";
import { app, axes, children, each, fold, isExpr, iterate, let_, lit, offset, ref, rec, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { ok } from "./result.ts";
import { space } from "./space.ts";

const rows = space.array([
  { n: 1, w: 10 },
  { n: 2, w: 20 },
  { n: 3, w: 30 },
]);

/** Free functions for the tests: numbers and texts, without a domain. */
const FNS = {
  add: (a: unknown, b: unknown) => (a as number) + (b as number),
  mul: (a: unknown, b: unknown) => (a as number) * (b as number),
  half: (a: unknown) => (a as number) / 2,
  gt: (a: unknown, b: unknown) => (a as number) > (b as number),
  join: (a: unknown, b: unknown) => `${String(a)}${String(b)}`,
};

/** This function gives the value of an expression at an origin, or its error. */
function run(e: Expr, origin = "0", extra: Partial<EvalOptions> = {}): unknown {
  const r = evaluate(e, { space: rows, origin, domains: [], fns: FNS, ...extra });
  return r.ok ? r.value : r.error;
}

const add = (a: Expr, b: Expr): Expr => app("add", a, b);
/** An iteration that doubles x from `from` until x is above `above`. */
const doubling = (limit: number, from: number, above: number): Expr => iterate(limit, { x: lit(from) }, { x: app("mul", v("x"), lit(2)) }, v("x"), app("gt", v("x"), lit(above)));
const join = (a: Expr, b: Expr): Expr => app("join", a, b);

describe("iteration (LOOP.*, FOLD.*, ITERATE.*)", () => {
  it("LOOP.NAMES: each name of step reads the values before the step, and the result reads the last values", () => {
    // A swap: each step reads the old a and the old b.
    const swap = iterate(3, { a: lit(1), b: lit(2) }, { a: v("b"), b: v("a") }, rec({ a: v("a"), b: v("b") }));
    expect(run(swap)).toEqual({ a: 2, b: 1 });
    // A name without a step keeps its value. A name of the loop hides a name outside, only inside the loop.
    const keep = let_({ k: lit(100) }, rec({ loop: iterate(2, { k: lit(1), s: lit(0) }, { s: add(v("s"), v("k")) }, v("s")), after: v("k") }));
    expect(run(keep)).toEqual({ loop: 2, after: 100 });
    // A name of step that is not a name of init is not valid.
    expect(isExpr({ tag: "iterate", limit: 1, init: {}, step: { x: lit(1) }, result: lit(0) })).toBe(false);
    expect(isExpr({ tag: "fold", axis: axes.all, init: { x: lit(0) }, step: { y: lit(1) }, result: lit(0) })).toBe(false);
    for (const bad of [{ init: [], step: {} }, { init: {}, step: [] }, { init: null, step: {} }, { init: { x: 1 }, step: {} }]) {
      expect(isExpr({ tag: "iterate", limit: 1, ...bad, result: lit(0) })).toBe(false);
    }
  });

  it("FOLD.ORDER: a fold makes one step at each target in the order of the axis, and the focus of a step is the target", () => {
    const text = fold(axes.all, { s: lit("") }, { s: join(v("s"), ref("n")) }, v("s"));
    expect(run(text)).toBe("123");
    // init and result evaluate at the node. The origin stays the same in each step.
    const sums = fold(axes.all, { s: ref("w"), o: lit(0) }, { s: add(v("s"), ref("n")), o: add(v("o"), ref("w", [{ t: "origin" }])) }, rec({ s: v("s"), o: v("o"), here: ref("w") }));
    expect(run(sums, "1")).toEqual({ s: 26, o: 60, here: 20 });
    // A target that a test removes has no step, and an axis with no targets gives the first values.
    expect(run(fold(axes.where(axes.all, app("gt", ref("n"), lit(1))), { s: lit("") }, { s: join(v("s"), ref("n")) }, v("s")))).toBe("23");
    expect(run(fold(axes.where(axes.all, lit(false)), { s: lit(7) }, { s: lit(0) }, v("s")))).toBe(7);
    // An address gives the start of the targets.
    expect(run(fold(axes.window(0, 1), { s: lit("") }, { s: join(v("s"), ref("n")) }, v("s"), [offset(1)]))).toBe("23");
    // The axis table: the step reads the space of the table, and the origin there is the target.
    const T = space.array([{ x: 4 }, { x: 5 }]);
    expect(run(fold(axes.table("T"), { s: lit(0) }, { s: add(v("s"), ref("x", [{ t: "origin" }])) }, v("s")), "0", { tables: { T } })).toBe(9);
  });

  it("FOLD.ERROR: the first error of a value, of a test or of result is the value of the fold", () => {
    const step = { s: add(v("s"), ref("n")) };
    expect(run(fold(axes.all, { s: ref("missing") }, step, v("s")))).toMatchObject({ code: "#N/A", path: [0] });
    // The step fails at the second target.
    const second = fold(axes.all, { s: lit(0) }, { s: app("if", app("gt", ref("n"), lit(1)), ref("missing"), v("s")) }, v("s"));
    expect(run(second)).toMatchObject({ code: "#N/A" });
    expect(run(fold(axes.where(axes.all, ref("missing")), { s: lit(0) }, step, v("s")))).toMatchObject({ code: "#N/A" });
    expect(run(fold(axes.where(axes.all, ref("n")), { s: lit(0) }, step, v("s")))).toMatchObject({ code: "#VALUE!", kind: "kind-mismatch" });
    expect(run(fold(axes.all, { s: lit(0) }, step, ref("missing")))).toMatchObject({ code: "#N/A", path: [2] });
    expect(run(fold(axes.all, { s: lit(0) }, step, v("s"), [offset(5)]))).toMatchObject({ code: "#REF!" });
    expect(run(fold(axes.table("T"), { s: lit(0) }, step, v("s")))).toMatchObject({ code: "#REF!", kind: "no-table" });
    expect(run(fold(axes.children, { s: lit(0) }, step, v("s")))).toMatchObject({ code: "#REF!" });
    // init comes before the address.
    expect(run(fold(axes.all, { s: ref("missing") }, step, v("s"), [offset(5)]))).toMatchObject({ code: "#N/A" });
  });

  it("ITERATE.LIMIT: an iteration makes limit steps at the position of the node", () => {
    expect(run(iterate(5, { x: lit(1) }, { x: app("mul", v("x"), lit(2)) }, v("x")))).toBe(32);
    expect(run(iterate(0, { x: lit(1) }, { x: lit(9) }, v("x")))).toBe(1);
    expect(run(iterate(2, { x: lit(0) }, { x: add(v("x"), ref("n")) }, v("x")), "2")).toBe(6);
    // The limit is a whole number from 0 to 100000.
    for (const limit of [-1, 1.5, 100_001, "3"]) expect(isExpr({ tag: "iterate", limit, init: {}, step: {}, result: lit(0) })).toBe(false);
    expect(isExpr(iterate(100_000, {}, {}, lit(0)))).toBe(true);
  });

  it("ITERATE.UNTIL: the test evaluates before each step and after the last step, and no true test gives #NUM!", () => {
    expect(run(doubling(100, 1, 50))).toBe(64);
    expect(run(doubling(10, 100, 50))).toBe(100);
    // After the last step: 1, 2, 4, 8, and 8 > 7.
    expect(run(doubling(3, 1, 7))).toBe(8);
    expect(run(doubling(3, 1, 8))).toMatchObject({ code: "#NUM!", kind: "limit", message: '"iterate" made its 3 steps, and its test "until" is not true', path: [] });
    const notBoolean = iterate(3, { x: lit(1) }, { x: v("x") }, v("x"), v("x"));
    expect(run(notBoolean)).toMatchObject({ code: "#VALUE!", kind: "kind-mismatch", path: [2] });
  });

  it("ITERATE.ERROR: the first error of a value, of the test or of result is the value of the iteration", () => {
    expect(run(iterate(3, { x: ref("missing") }, { x: v("x") }, v("x")))).toMatchObject({ code: "#N/A", path: [0] });
    expect(run(iterate(3, { x: lit(1) }, { x: ref("missing") }, v("x")))).toMatchObject({ code: "#N/A", path: [1] });
    expect(run(iterate(3, { x: lit(1) }, { x: v("x") }, v("x"), ref("missing")))).toMatchObject({ code: "#N/A", path: [2] });
    expect(run(iterate(3, { x: lit(1) }, { x: v("x") }, ref("missing")))).toMatchObject({ code: "#N/A", path: [2] });
    expect(run(iterate(3, { x: lit(1) }, { x: v("x") }, ref("missing"), lit(false)))).toMatchObject({ code: "#NUM!" });
  });

  it("a bisection with two names finds a root, and the trace, deps and JSON have each part", () => {
    // The root of x * x - 2 between 0 and 2, after 50 steps.
    const mid = app("half", add(v("lo"), v("hi")));
    const below = app("gt", lit(2), app("mul", mid, mid));
    const root = iterate(50, { lo: lit(0), hi: lit(2) }, { lo: app("if", below, mid, v("lo")), hi: app("if", below, v("hi"), mid) }, v("hi"));
    expect(run(root)).toBeCloseTo(Math.SQRT2, 12);
    expect(children(root)).toHaveLength(5);
    const text = serialize(fold(axes.all, { s: lit(-0) }, { s: add(v("s"), lit(Number.NaN)) }, v("s")));
    expect(text.ok ? parse(text.value) : text).toEqual(ok(fold(axes.all, { s: lit(-0) }, { s: add(v("s"), lit(Number.NaN)) }, v("s"))));
    const until = iterate(2, { x: lit(1) }, { x: lit(Number.POSITIVE_INFINITY) }, lit(-0), app("gt", v("x"), lit(Number.NEGATIVE_INFINITY)));
    const untilText = serialize(until);
    expect(untilText.ok ? parse(untilText.value) : untilText).toEqual(ok(until));
    // The values of init and the result are outside the axis of a fold. The step and the tests are inside.
    const e = fold(axes.where(axes.all, ref("t")), { s: ref("a") }, { s: ref("b") }, ref("c"), [{ t: "index", i: ref("d") }]);
    expect(deps(e).map((d) => [d.path[0], d.axes])).toEqual([
      ["a", []],
      ["b", ["where"]],
      ["t", ["where"]],
      ["d", []],
      ["c", []],
    ]);
    const labels = explain(fold(axes.all, { s: lit(0) }, { s: add(v("s"), ref("n")) }, v("s")), { space: rows, origin: "0", domains: [], fns: FNS }).events.map((x) => x.label);
    expect(labels.at(-1)).toBe("fold all");
    expect(labels.filter((l) => l === "add")).toHaveLength(3);
    expect(explain(iterate(1, {}, {}, lit(1)), { space: rows, origin: "0", domains: [] }).events.map((x) => x.label)).toEqual(["1", "iterate 1"]);
    expect(each(axes.all, lit(1)).tag).toBe("each");
  });
});

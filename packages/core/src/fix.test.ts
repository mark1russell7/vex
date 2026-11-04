/**
 * The fixed-point column (FIX.ROUNDS and the rules after it). Each test of a value compares the closure tier with the
 * reference tier of the kernel. The tests of tier 2 and of the modules are in the compiler.
 */
import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { fromDocument, toDocument, type Envelope } from "./document.ts";
import { defineDomain, type AnyDomain, type OpSpec } from "./domain.ts";
import { vexError } from "./errors.ts";
import { compile, evaluate, explain, formatTrace, labelOf, type EvalOptions } from "./evaluate.ts";
import { fixRounds, fixValueError, joinKind, joinValues, worstRow } from "./fix.ts";
import { app, axes, call, children, each, ext, fix, fn, fold, index, iterate, last, let_, lit, origin, rec, ref, shapeError, v, type Expr, type FixJoin } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { toVexResult, VEX_WORLD } from "./kernel.ts";
import { isVexList } from "./list.ts";
import { monotoneError } from "./monotone.ts";
import { kernelPlan } from "./plan.ts";
import { fail, ok, type Result } from "./result.ts";
import { cell, SheetRun } from "./sheet.ts";
import { sizeError } from "./size.ts";
import { space, type Space } from "./space.ts";
import { programStep, stepError } from "./steps.ts";
import { error, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  size: "fixed",
  primitive: "number",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"], returns: "number", monotone: ["up", "up"] },
    subtract: { fn: (a: number, b: number): number => a - b, params: ["number"], returns: "number", monotone: ["up", "down"] },
    negate: { fn: (a: number): number => -a, returns: "number", monotone: ["down"] },
    multiply: { fn: (a: number, b: number): number => a * b, params: ["number"], returns: "number" },
    min: { fn: (a: number, b: number): number => Math.min(a, b), params: ["number"], returns: "number", monotone: ["up", "up"] },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"], returns: "boolean" },
    eq: { fn: (a: number, b: number): boolean => a === b, params: ["number"], returns: "boolean" },
    div: { fn: (a: number, b: number): number => a / b, params: ["number"], returns: "number" },
  },
});
const Bool = defineDomain({
  name: "Bool",
  size: "fixed",
  primitive: "boolean",
  is: (u: unknown): u is boolean => typeof u === "boolean",
  ops: {
    not: { fn: (a: boolean): boolean => !a, returns: "boolean", monotone: ["down"] },
  },
});
const Text = defineDomain({
  name: "Text",
  size: "fixed",
  primitive: "string",
  is: (u: unknown): u is string => typeof u === "string",
  ops: {
    eq: { fn: (a: string, b: string): boolean => a === b, params: ["string"], returns: "boolean" },
  },
});
const DOMAINS: readonly AnyDomain[] = [Num, Bool, Text];

/** The graph has a cycle 0 1 2, an exit to 3, a loop at 4, a cycle 5 6 and a pair 7 8. */
const EDGES = { "0": ["1"], "1": ["2"], "2": ["0", "3"], "3": [], "4": ["4"], "5": ["6", "3"], "6": ["3", "5"], "7": ["8"], "8": [] } as const;
const KEYS = Object.keys(EDGES);
const recordsOf = (keys: readonly string[]): Record<string, { readonly id: string; readonly n: number }> => Object.fromEntries(keys.map((k) => [k, { id: k, n: Number(k) }]));
const GRAPH = space.graph(recordsOf(KEYS), EDGES);
/** The chain 0 to 4 has one path through all its rows. */
const CHAIN = space.graph(recordsOf(["0", "1", "2", "3", "4"]), { "0": ["1"], "1": ["2"], "2": ["3"], "3": ["4"], "4": [] });
const ROWS = space.array([{ n: 1 }, { n: 2 }, { n: 3 }]);

/** This function gives the result of the closure tier, after a check that the reference tier gives the same code or value. */
function run(e: Expr, opts: Partial<EvalOptions> = {}): Result<unknown> {
  const at: EvalOptions = { space: GRAPH, origin: "0", domains: DOMAINS, ...opts };
  const r = evaluate(e, at);
  const reference = toVexResult(kernelPlan(e, { domains: at.domains ?? [] }).reference(at));
  expect(reference.ok ? reference.value : reference.error.code).toEqual(r.ok ? r.value : r.error.code);
  return r;
}

const itemsOf = (r: Result<unknown>): readonly unknown[] => {
  const list = value(r);
  if (!isVexList(list)) throw new TypeError("the result is not a list");
  return list.items.map((x) => (x.result.ok ? x.result.value : x.result.error.code));
};
const column = (e: Expr, opts: Partial<EvalOptions> = {}): readonly unknown[] => itemsOf(run(each(axes.all, e), opts));

const isOrigin = app("eq", ref("id"), ref("id", [origin]));
const anyIn = app("any", each(axes.predecessors, last("reach")));
/** A row is true when a path of zero or more edges from the origin reaches it. */
const reach = fix("reach", "or", isOrigin, anyIn);
/** A row is true when a path of one or more edges from the origin reaches it. */
const after = fix("reach", "or", lit(false), app("or", app("any", each(axes.predecessors, isOrigin)), anyIn));
const BIG = 1_000_000;
/** The number of edges of a shortest path from the origin, or `BIG`. */
const distance = fix("d", "min", app("if", isOrigin, lit(0), lit(BIG)), app("ifError", app("min", each(axes.predecessors, app("add", last("d"), lit(1)))), lit(BIG)));

/** A step that rises in each round, so it has no fixed point. */
const rising = (name: string): Expr => fix(name, "max", lit(0), app("add", last(name), lit(1)));

/** This function counts the rounds of a `fix` in a trace, without round 0. */
const roundsOf = (e: Expr, opts: Partial<EvalOptions> = {}): number => explain(e, { space: GRAPH, origin: "0", domains: DOMAINS, ...opts }).events.filter((x) => (x.round?.index ?? 0) > 0).length;

const reasonOf = (step: Expr, join: FixJoin = "max", opts: Partial<EvalOptions> = {}): string | undefined => monotoneError(fix("x", join, join === "max" || join === "min" ? lit(0) : lit(false), step), { domains: DOMAINS, ...opts });
const check = (step: Expr, join: FixJoin = "max", opts: { readonly fns?: Readonly<Record<string, unknown>>; readonly domains?: readonly AnyDomain[] } = {}): string | undefined => monotoneError(fix("x", join, join === "max" || join === "min" ? lit(0) : lit(false), step), { domains: DOMAINS, ...opts });
const shared = (monotone?: OpSpec<unknown>["monotone"]) => defineDomain({ name: "Any", size: "fixed", is: (u: unknown): u is number => typeof u === "number", ops: { grow: { fn: (a: number): number => a, ...(monotone === undefined ? {} : { monotone }) } } });
const plainFn = (a: number): number => a;
const capped = (cap: number): Expr => fix("x", "max", lit(0), app("min", app("add", last("x"), lit(1)), lit(cap)));
const deep = (): Result<unknown> => fail(vexError("depth", "the call stack is full"));
const atRow = (n: number, part: Expr, other: Expr): Expr => app("if", app("gt", ref("n"), lit(n)), part, other);
const failed = (code: string): { readonly code: string } => ({ code });
const fixDoc = (fields: object): Envelope => ({ type: "fix", value: { name: "x", join: "or", init: false, step: false, ...fields } });

describe("the rounds of a column (FIX.ROUNDS)", () => {
  it("FIX.ROUNDS: the rounds reach the set of the rows that the origin reaches, in a graph with cycles", () => {
    expect(column(reach)).toEqual([true, true, true, true, false, false, false, false, false]);
    expect(column(reach, { origin: "5" })).toEqual([false, false, false, true, false, true, true, false, false]);
    expect(column(reach, { origin: "4" })).toEqual([false, false, false, false, true, false, false, false, false]);
    expect(column(reach, { origin: "7" })).toEqual([false, false, false, false, false, false, false, true, true]);
  });

  it("FIX.ROUNDS: a path of one or more edges gives the rows on a cycle with the origin", () => {
    const onCycle = KEYS.map((k) => value(run(after, { origin: k })));
    expect(onCycle).toEqual([true, true, true, false, true, true, true, false, false]);
  });

  it("FIX.ROUNDS: a shortest path of the graph is the least fixed point below the start", () => {
    expect(column(distance)).toEqual([0, 1, 2, 3, BIG, BIG, BIG, BIG, BIG]);
    expect(column(distance, { origin: "6" })).toEqual([BIG, BIG, BIG, 1, BIG, 1, 0, BIG, BIG]);
  });

  it("FIX.ROUNDS: the value of the node is the row of the focus", () => {
    expect(value(run(reach))).toBe(true);
    expect(itemsOf(run(each(axes.successors, reach), { origin: "2" }))).toEqual([true, true]);
  });

  it("FIX.ROUNDS: the first round without a change ends the rounds, and a step reads only the last round", () => {
    // The chain moves one row in each round. A step that read the new values of the same round stops in fewer rounds.
    const walk = fix("reach", "or", app("eq", ref("n"), lit(0)), app("any", each(axes.predecessors, last("reach"))));
    expect(roundsOf(walk, { space: CHAIN })).toBe(5);
    expect(roundsOf(fix("x", "or", lit(true), lit(false)))).toBe(1);
  });

  it("FIX.ROUNDS: a space with no row gives #REF! at the origin of the run, as each read does", () => {
    expect(error(evaluate(reach, { space: space.array([]), origin: "0", domains: DOMAINS })).kind).toBe("unknown-key");
    expect(fixRounds(0)).toBe(1);
  });
});

describe("the rows of a column (FIX.ROWS)", () => {
  it("FIX.ROWS: the rows are the keys of the space where the node evaluates, also in a table", () => {
    const tables: Readonly<Record<string, Space>> = { t: ROWS };
    const empty = fix("s", "max", ref("n"), app("max", each(axes.window(-1, -1), last("s"))));
    const safe = fix("s", "max", ref("n"), app("ifError", app("max", each(axes.window(-1, -1), last("s"))), lit(0)));
    expect(itemsOf(run(each(axes.table("t"), safe), { tables, origin: "0" }))).toEqual([1, 2, 3]);
    expect(error(run(empty, { space: ROWS })).kind).toBe("empty");
  });

  it("FIX.ROWS: the node keeps the origin, so a read of the origin is the same at each row", () => {
    expect(column(fix("x", "max", ref("n", [origin]), lit(0)), { origin: "6" })).toEqual(KEYS.map(() => 6));
  });

  it("FIX.ROWS DEPS.READS: deps puts the axis all around the reads of the start and of the step", () => {
    const reads = deps(fix("x", "max", ref("n"), ref("m")));
    expect(reads.map((x) => [x.path, x.axes])).toEqual([
      [["n"], ["all"]],
      [["m"], ["all"]],
    ]);
  });
});

describe("the join (FIX.JOIN)", () => {
  it("FIX.JOIN: the join gives each next value to the old value, so a row moves one way", () => {
    expect(column(fix("x", "max", ref("n"), lit(4)))).toEqual([4, 4, 4, 4, 4, 5, 6, 7, 8]);
    expect(column(fix("x", "min", ref("n"), lit(4)))).toEqual([0, 1, 2, 3, 4, 4, 4, 4, 4]);
    expect(column(fix("x", "or", app("gt", ref("n"), lit(3)), lit(false)))).toEqual([false, false, false, false, true, true, true, true, true]);
    expect(column(fix("x", "and", app("gt", ref("n"), lit(3)), lit(true)))).toEqual([false, false, false, false, true, true, true, true, true]);
  });

  it("FIX.JOIN: a column with the join and falls to the greatest fixed point below the start", () => {
    // A row stays true while no path from it goes to the row 3, so each row with such a path falls.
    const safe = fix("safe", "and", app("not", app("eq", ref("n"), lit(3))), app("all", each(axes.successors, last("safe"))));
    expect(column(safe)).toEqual([false, false, false, false, true, false, false, true, true]);
  });

  it("FIX.JOIN: the function of the join gives the four results", () => {
    expect([joinValues("or", false, false), joinValues("or", false, true), joinValues("or", true, false)]).toEqual([false, true, true]);
    expect([joinValues("and", true, true), joinValues("and", false, true), joinValues("and", true, false)]).toEqual([true, false, false]);
    expect([joinValues("max", 1, 2), joinValues("min", 1, 2)]).toEqual([2, 1]);
    expect((["or", "and", "max", "min"] as const).map(joinKind)).toEqual(["boolean", "boolean", "number", "number"]);
  });
});

describe("the kinds of the values (FIX.KIND)", () => {
  it("FIX.KIND: a value of the wrong kind gives #VALUE!, in the start and in the step", () => {
    expect(error(run(fix("x", "or", lit(1), lit(false)))).code).toBe("#ARGS");
    expect(error(run(fix("x", "or", lit(1), lit(false)), { space: space.array([{}]) })).code).toBe("#VALUE!");
    expect(error(run(fix("x", "max", lit(true), lit(0)), { space: space.array([{}]) })).message).toBe('the "fix" "x" with the join "max" needs a number, not a boolean');
    expect(error(run(fix("x", "and", lit(true), lit(0)), { space: space.array([{}]) })).message).toBe('the "fix" "x" with the join "and" needs a boolean, not a number');
    expect(error(run(fix("x", "max", lit(0), lit("a")), { space: space.array([{}]) })).kind).toBe("kind-mismatch");
  });

  it("FIX.KIND: a number that is not finite gives #NUM!", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = error(run(fix("x", "max", lit(bad), lit(0)), { space: space.array([{}]) }));
      expect([r.code, r.kind, r.message]).toEqual(["#NUM!", "not-finite", `the "fix" "x" gave the value ${String(bad)}, not a finite number`]);
    }
    expect(fixValueError("x", "max", 1)).toBeUndefined();
    expect(fixValueError("x", "or", true)).toBeUndefined();
  });
});

describe("the read of the last round (FIX.LAST)", () => {
  it("FIX.LAST: a read has its own names, so a name of a let and a name of a fix do not meet", () => {
    const named = let_({ x: lit(7) }, fix("x", "max", v("x"), app("add", v("x"), lit(1))));
    expect(column(named)).toEqual(KEYS.map(() => 8));
  });

  it("FIX.LAST: the inner fix of a name hides the outer fix of that name", () => {
    const inner = fix("x", "max", lit(1), lit(2));
    expect(column(fix("x", "max", inner, last("x")))).toEqual(KEYS.map(() => 2));
    expect(column(fix("x", "max", lit(0), fix("x", "max", lit(5), last("x"))))).toEqual(KEYS.map(() => 5));
    expect(column(fix("x", "max", lit(0), fix("y", "max", lit(5), last("y"))))).toEqual(KEYS.map(() => 5));
  });

  it("FIX.LAST: an axis moves the read to another row", () => {
    const shift = fix("x", "max", ref("n"), app("max", each(axes.window(0, 1), last("x"))));
    expect(column(shift, { space: ROWS })).toEqual([3, 3, 3]);
  });

  it("FIX.LAST: a read at a key that is not a row gives #REF!", () => {
    const items = each(axes.list(each(axes.table("t"), lit(true))), last("x"));
    const e = fix("x", "or", lit(false), app("any", items));
    const at = { space: space.array([{}]), tables: { t: space.record({ a: {} }) } };
    // The list op skips a failed item, so the column stays false, and the trace has the error of the read.
    expect(value(run(e, at))).toBe(false);
    const read = explain(e, { ...at, origin: "0", domains: DOMAINS }).events.find((x) => x.tag === "last");
    expect(read?.result).toMatchObject({ ok: false, error: { code: "#REF!", kind: "unknown-key", message: 'the "fix" "x" has no row "a"' } });
  });

  it("FIX.LAST: a read with no fix of its name around it is not valid", () => {
    expect(monotoneError(last("x"), { domains: DOMAINS })).toBe('the read "last" of "x" has no "fix" of that name around it');
    expect(monotoneError(fix("x", "max", last("x"), lit(0)), { domains: DOMAINS })).toBe('the read "last" of "x" has no "fix" of that name around it');
    expect(monotoneError(app("add", fix("x", "max", lit(0), lit(0)), last("x")), { domains: DOMAINS })).toContain("has no");
    expect(monotoneError(fix("x", "max", lit(0), last("y")), { domains: DOMAINS })).toContain('"y"');
    expect(error(run(last("x")))).toMatchObject({ kind: "bad-expression" });
    expect(error(run(fix("x", "max", lit(0), last("y"))))).toMatchObject({ kind: "bad-expression" });
  });
});

describe("the check of the steps (FIX.MONOTONE)", () => {
  const REASON = 'the step of the "fix" "x" does not move one way: ';
  const up = last("x");

  it("FIX.MONOTONE: a step that moves against the last round has no proof, for each join", () => {
    expect(reasonOf(app("negate", up))).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(app("negate", up), "min")).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(app("not", up), "or")).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(app("not", up), "and")).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(app("subtract", lit(1), up))).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(app("negate", app("negate", up)))).toBeUndefined();
  });

  it("FIX.MONOTONE: a program without a proof gives an error before a run, also in the reference tier", () => {
    const refused = fix("x", "max", lit(0), app("negate", last("x")));
    const r = error(evaluate(refused, { space: ROWS, origin: "0", domains: DOMAINS }));
    expect([r.kind, r.message]).toEqual(["bad-expression", `${REASON}it moves against the last round`]);
    expect(toVexResult(kernelPlan(refused, { domains: DOMAINS }).reference({ space: ROWS, origin: "0" }))).toMatchObject({ ok: false });
    expect(evaluate(fix("x", "max", lit(0), lit(1)), { space: ROWS, origin: "0", domains: DOMAINS })).toEqual(ok(1));
  });

  it("FIX.MONOTONE: a step that mixes the two directions has no proof", () => {
    expect(reasonOf(app("subtract", up, up))).toBe(`${REASON}the op "subtract" reads the last round in both directions`);
    expect(reasonOf(app("and", up, app("not", up)), "or")).toBe(`${REASON}the op "and" reads the last round in both directions`);
    expect(reasonOf(app("if", ref("ok"), up, app("negate", up)))).toBe(`${REASON}the op "if" reads the last round in both directions`);
  });

  it("FIX.MONOTONE: a test of if must not read the last round, and a branch can", () => {
    expect(reasonOf(app("if", up, lit(true), lit(false)), "or")).toBe(`${REASON}the test of "if" reads the last round`);
    expect(reasonOf(app("if", ref("ok"), up, lit(0)))).toBeUndefined();
    expect(reasonOf(app("if", ref("ok"), lit(0), up))).toBeUndefined();
  });

  it("FIX.MONOTONE: a loop, a record or a move of a reference that reads the last round has no proof", () => {
    expect(reasonOf(fold(axes.all, { s: lit(0) }, { s: up }, v("s")))).toBe(`${REASON}a node "fold" reads the last round`);
    expect(reasonOf(iterate(2, { s: up }, {}, v("s")))).toBe(`${REASON}a node "iterate" reads the last round`);
    expect(reasonOf(rec({ a: up }))).toBe(`${REASON}a node "rec" reads the last round`);
    expect(reasonOf(ref("n", [index(up)]))).toBe(`${REASON}a node "ref" reads the last round`);
    expect(reasonOf(each(axes.where(axes.all, up), lit(1)))).toBe(`${REASON}an axis reads the last round`);
    expect(reasonOf(each(axes.list(each(axes.all, up)), lit(1)))).toBe(`${REASON}an axis reads the last round`);
    expect(reasonOf(app("max", each(axes.table("t"), up)))).toBe(`${REASON}the axis table leaves the rows of the column`);
    expect(reasonOf(app("max", each(axes.where(axes.table("t"), lit(true)), up)))).toBe(`${REASON}the axis table leaves the rows of the column`);
    expect(reasonOf(app("max", each(axes.all, up)))).toBeUndefined();
  });

  it("FIX.MONOTONE: a function that reads the last round has no proof", () => {
    const f = fn(["a"], v("a"));
    expect(reasonOf(let_({ f }, call("f", up)))).toBe(`${REASON}an argument of the function "f" reads the last round`);
    expect(reasonOf(let_({ f: fn([], up) }, call("f")))).toBe(`${REASON}the function "f" reads the last round`);
    expect(reasonOf(let_({ f }, call("f", lit(1))))).toBeUndefined();
  });

  it("FIX.MONOTONE: a function with a parameter of the name of a value that reads the last round reads the parameter", () => {
    expect(reasonOf(let_({ y: up, f: fn(["y"], app("negate", v("y"))) }, call("f", lit(1))))).toBeUndefined();
    expect(reasonOf(let_({ y: up }, let_({ f: fn(["z"], v("y")) }, call("f", lit(1)))))).toBe(`${REASON}the function "f" reads the last round`);
  });

  it("FIX.MONOTONE: a name carries its direction through a let, and a loop item hides a name", () => {
    expect(reasonOf(let_({ y: app("negate", up) }, app("add", lit(0), v("y"))))).toBe(`${REASON}it moves against the last round`);
    expect(reasonOf(let_({ y: up }, v("y")))).toBeUndefined();
    expect(reasonOf(let_({ y: app("negate", up) }, app("max", each(axes.list(lit([1])), v("y"), undefined, ["y"]))))).toBeUndefined();
  });

  it("FIX.MONOTONE: an inner fix must not read the last round of the outer fix", () => {
    expect(monotoneError(fix("x", "max", lit(0), fix("y", "max", last("x"), lit(0))), { domains: DOMAINS })).toBe(`${REASON}the start of the "fix" "y" reads the last round`);
    expect(monotoneError(fix("x", "max", lit(0), fix("y", "max", lit(0), last("x"))), { domains: DOMAINS })).toBe(`${REASON}the step of the "fix" "y" reads the last round`);
    expect(monotoneError(fix("x", "max", lit(0), fix("x", "max", lit(0), last("x"))), { domains: DOMAINS })).toBeUndefined();
    // After the inner fix of the same name, a read of the name reads the outer fix again.
    expect(monotoneError(fix("x", "max", lit(0), app("add", last("x"), fix("x", "max", lit(0), last("x")))), { domains: DOMAINS })).toBeUndefined();
    expect(monotoneError(fix("x", "max", lit(0), app("subtract", fix("x", "max", lit(0), last("x")), last("x"))), { domains: DOMAINS })).toBe(`${REASON}it moves against the last round`);
  });

  it("FIX.MONOTONE: the check examines a fix inside a part that the check of the outer node does not follow", () => {
    expect(monotoneError(rec({ a: fix("y", "max", lit(0), app("negate", last("y"))) }), { domains: DOMAINS })).toContain('"y"');
    expect(monotoneError(lit(1), { domains: DOMAINS })).toBeUndefined();
    expect(monotoneError(lit(1), {})).toBeUndefined();
  });
});

describe("the rules of the ops (FIX.OPS)", () => {
  const up = last("x");
  const REASON = 'the step of the "fix" "x" does not move one way: ';

  it("FIX.OPS: an op has a direction for each argument, and the data of the domain states it", () => {
    expect(check(app("add", up, ref("w")))).toBeUndefined();
    expect(check(app("subtract", up, ref("w")))).toBeUndefined();
    expect(check(app("subtract", lit(1), up))).toBe(`${REASON}it moves against the last round`);
    expect(check(app("gt", up, lit(1)))).toBe(`${REASON}the op "gt" has no rule of direction`);
    expect(check(app("subtract", lit(1), app("negate", up)))).toBeUndefined();
  });

  it("FIX.OPS: an op without a rule cannot take a value that reads the last round", () => {
    expect(check(app("multiply", up, lit(2)))).toBe(`${REASON}the op "multiply" has no rule of direction`);
    expect(check(app("eq", up, lit(2)), "or")).toBe(`${REASON}the op "eq" has no rule of direction`);
    expect(check(app("nope", up))).toBe(`${REASON}the op "nope" has no rule of direction`);
    expect(check(app("multiply", ref("w"), lit(2)))).toBeUndefined();
  });

  it("FIX.OPS: a list op has its rule when its list reads the last round", () => {
    const list = each(axes.predecessors, up);
    for (const op of ["min", "max"]) expect(check(app(op, list))).toBeUndefined();
    for (const op of ["any", "all"]) expect(check(app(op, list), "or")).toBeUndefined();
    expect(check(app("none", list), "or")).toBe(`${REASON}it moves against the last round`);
    expect(check(app("none", each(axes.predecessors, app("not", up))), "or")).toBeUndefined();
    for (const op of ["sum", "first", "last", "count", "nth", "sortBy", "take"]) expect(check(app(op, list))).toBe(`${REASON}the op "${op}" has no rule of direction`);
    expect(check(app("toString", list))).toBe(`${REASON}the op "toString" has no rule of direction`);
    expect(check(app("constructor", list))).toBe(`${REASON}the op "constructor" has no rule of direction`);
  });

  it("FIX.OPS: an argument of a list op with no direction must not read the last round", () => {
    expect(check(app("max", each(axes.all, lit(1)), up))).toBe(`${REASON}the argument 2 of the op "max" reads the last round`);
  });

  it("FIX.OPS: a receiver of unknown kind does not decide the op, so the check has no rule", () => {
    expect(check(app("add", ref("w"), up))).toBe(`${REASON}the kind of the first argument of the op "add" does not decide the op. Put an argument of a known kind first`);
    expect(check(app("add", lit(1), up))).toBeUndefined();
    expect(check(app("add", app("add", lit(1), up), up))).toBeUndefined();
    expect(check(app("add", app("if", ref("ok"), lit(1), up), up))).toBeUndefined();
    expect(check(app("add", app("if", ref("ok"), lit(true), up), up))).toContain("does not decide the op");
  });

  it("FIX.OPS: a domain with no primitive kind and a function of the host can state a rule", () => {
    expect(check(app("grow", up), "max", { domains: [shared(["up"])] })).toBeUndefined();
    expect(check(app("grow", up), "max", { domains: [shared()] })).toBe(`${REASON}the op "grow" has no rule of direction`);
    expect(check(app("grow", up), "max", { domains: [shared(["up"]), Num] })).toBeUndefined();
    const up1 = Object.assign((a: number): number => a, { monotone: ["up"] });
    expect(check(app("host", up), "max", { fns: { host: up1 } })).toBeUndefined();
    expect(check(app("host", up), "max", { fns: { host: plainFn } })).toBe(`${REASON}the op "host" has no rule of direction`);
    expect(check(app("host", up), "max", { domains: [shared(["up"])], fns: { host: up1 } })).toBeUndefined();
  });

  it("FIX.OPS: two ops that the data decides among must have one rule", () => {
    const flip = defineDomain({ name: "Flip", size: "fixed", is: (u: unknown): u is number => typeof u === "number", ops: { grow: { fn: (a: number): number => -a, monotone: ["down"] } } });
    const keep = defineDomain({ name: "Keep", size: "fixed", is: (u: unknown): u is number => typeof u === "number", ops: { grow: { fn: (a: number): number => a, monotone: ["up"] } } });
    expect(check(app("grow", up), "max", { domains: [flip, keep] })).toBe(`${REASON}the op "grow" has two rules, and the data decides among them`);
    expect(check(app("grow", up), "max", { domains: [keep, Bool, keep] })).toBeUndefined();
  });
});

describe("the limit of the rounds (FIX.LIMIT)", () => {

  it("FIX.LIMIT: a column of n rows has n + 1 rounds at most, and a value past the limit gives #NUM! of the kind limit", () => {
    const r = error(run(rising("x"), { space: ROWS }));
    expect([r.code, r.kind, r.message]).toEqual(["#NUM!", "limit", 'the "fix" "x" made its 4 rounds, and its values still change']);
    expect(fixRounds(3)).toBe(4);
    expect(fixRounds(100_000)).toBe(100_000);
    expect(fixRounds(99_998)).toBe(99_999);
  });

  it("FIX.LIMIT: the last allowed round can end the rounds, and one rise more gives the limit", () => {
    expect(column(capped(3), { space: ROWS })).toEqual([3, 3, 3]);
    expect(error(run(capped(4), { space: ROWS })).kind).toBe("limit");
    expect(roundsOf(capped(3), { space: ROWS })).toBe(4);
  });

  it("FIX.LIMIT: a path through each row of the column stops in the limit", () => {
    const longest = fix("d", "max", lit(0), app("ifError", app("max", each(axes.predecessors, app("add", last("d"), lit(1)))), lit(0)));
    expect(column(longest, { space: CHAIN })).toEqual([0, 1, 2, 3, 4]);
  });

  it("FIX.LIMIT FORM.IFERROR: ifError catches the limit, and the column has no partial values", () => {
    expect(value(run(app("ifError", rising("x"), lit(-1)), { space: ROWS }))).toBe(-1);
  });
});

describe("the errors of a column (FIX.ERROR)", () => {
  const opts: Partial<EvalOptions> = { space: ROWS };

  it("FIX.ERROR: one failed row gives its error, and the column fails", () => {
    expect(error(run(fix("x", "max", atRow(2, ref("missing"), lit(0)), lit(0)), opts)).kind).toBe("missing-field");
    expect(error(run(fix("x", "max", lit(0), atRow(2, ref("missing"), lit(0))), opts)).kind).toBe("missing-field");
  });

  it("FIX.ERROR: two failed rows give #ARGS with each error as a cause, in the start and in a round", () => {
    const start = error(run(fix("x", "max", atRow(1, ref("missing"), lit(0)), lit(0)), opts));
    expect([start.code, start.causes?.map((x) => x.kind)]).toEqual(["#ARGS", ["missing-field", "missing-field"]]);
    const round = error(run(fix("x", "max", lit(0), atRow(1, ref("missing"), lit(0))), opts));
    expect([round.code, round.causes?.length]).toEqual(["#ARGS", 2]);
  });

  it("FIX.ERROR: an error in a later round fails the column, and the rows after the error run", () => {
    const fails = fix("x", "or", lit(false), app("or", last("x"), app("gt", ref("missing"), lit(0))));
    expect(error(run(fails, opts)).causes?.length).toBe(3);
    // A chain reaches the bad row in its fourth round. The rounds before it have no error.
    const late = fix("d", "max", lit(0), app("if", app("eq", ref("n"), lit(4)), app("div", lit(1), ref("missing")), app("ifError", app("max", each(axes.predecessors, app("add", last("d"), lit(1)))), lit(0))));
    expect(error(run(late, { space: CHAIN })).kind).toBe("missing-field");
  });

  it("FIX.ERROR: a row catches its own error with ifError", () => {
    expect(column(fix("x", "max", lit(0), app("ifError", atRow(1, ref("missing"), lit(5)), lit(9))), opts)).toEqual([5, 9, 9]);
  });

  it("FIX.ERROR EVAL.DEPTH: #DEPTH! wins over each other error, and ifError cannot hide it", () => {
    const options: Partial<EvalOptions> = { ...opts, extensions: { deep } };
    const inStart = fix("x", "max", atRow(1, ext("deep", null), ref("missing")), lit(0));
    const inRound = fix("x", "max", lit(0), atRow(1, ext("deep", null), ref("missing")));
    for (const e of [inStart, inRound]) {
      expect(error(evaluate(e, { ...options, origin: "0", space: ROWS, domains: DOMAINS })).code).toBe("#DEPTH!");
      expect(error(evaluate(app("ifError", e, lit(0)), { ...options, origin: "0", space: ROWS, domains: DOMAINS })).code).toBe("#DEPTH!");
    }
  });

  it("FIX.ERROR: the function of the rows gives the error that stands for them", () => {
    expect(worstRow([failed("#N/A")])).toEqual(failed("#N/A"));
    expect(worstRow([failed("#N/A"), failed("#REF!")])).toBeUndefined();
    expect(worstRow([failed("#N/A"), failed("#CYCLE!"), failed("#DEPTH!")])).toEqual(failed("#DEPTH!"));
    expect(worstRow([failed("#N/A"), failed("#CYCLE!")])).toEqual(failed("#CYCLE!"));
  });

  it("FIX.ERROR SHEET.CYCLE STEP.CYCLE: a cell that reads itself through a column gives #CYCLE!, at one row and at more rows", () => {
    const formula = fix("x", "or", lit(false), app("or", last("x"), cell("a")));
    for (const s of [space.array([{}]), ROWS]) {
      const sheet = new SheetRun(new Map([["a", formula]]), { space: s, domains: DOMAINS });
      expect(error(sheet.cell("a", "0")).code).toBe("#CYCLE!");
    }
  });
});

describe("the order of the rows (FIX.ORDER)", () => {
  it("FIX.ORDER: the column has the same value at each key for each order of the rows", () => {
    const backward = space.graph(recordsOf(KEYS.toReversed()), EDGES);
    for (const e of [reach, after, distance]) {
      for (const k of KEYS) expect(evaluate(e, { space: backward, origin: k, domains: DOMAINS })).toEqual(evaluate(e, { space: GRAPH, origin: k, domains: DOMAINS }));
    }
  });

  it("FIX.ORDER FIX.OPS: an op that reads the order of the rows has no rule, and a sum of floats depends on that order", () => {
    const reader = fix("x", "max", lit(0), app("first", each(axes.all, last("x"))));
    expect(monotoneError(reader, { domains: DOMAINS })).toContain('the op "first" has no rule');
    expect(monotoneError(fix("x", "max", lit(0), app("sum", each(axes.all, last("x")))), { domains: DOMAINS })).toContain('the op "sum" has no rule');
  });
});

describe("the rounds in a trace (FIX.TRACE)", () => {
  it("FIX.TRACE: a trace has an event for each round, with its count, the rows that it changed and the column", () => {
    const trace = explain(reach, { space: GRAPH, origin: "0", domains: DOMAINS });
    const rounds = trace.events.filter((x) => x.round !== undefined);
    expect(rounds.map((x) => [x.round?.index, x.round?.changed])).toEqual([
      [0, KEYS],
      [1, ["1"]],
      [2, ["2"]],
      [3, ["3"]],
      [4, []],
    ]);
    expect(rounds[2]?.label).toBe("fix reach or: round 2, 1 rows changed");
    expect(rounds[0]?.label).toBe("fix reach or: round 0, 9 rows changed");
    expect(itemsOf(rounds[4]?.result ?? ok(null))).toEqual([true, true, true, true, false, false, false, false, false]);
    expect(rounds.every((x) => x.tag === "fix" && x.origin === "0" && x.focus === "0" && x.path.length === 0)).toBe(true);
    expect(trace.events.at(-1)?.round).toBeUndefined();
    expect(trace.events.at(-1)?.result).toEqual(ok(true));
  });

  it("FIX.TRACE: a run without a trace gives the same value, and the text of a trace names each round", () => {
    expect(evaluate(reach, { space: GRAPH, origin: "0", domains: DOMAINS })).toEqual(ok(true));
    const text = formatTrace(explain(reach, { space: GRAPH, origin: "0", domains: DOMAINS }), DOMAINS);
    expect(text).toContain("round 3, 1 rows changed");
  });

  it("FIX.TRACE: the labels of the nodes name the fix and the read", () => {
    expect(labelOf(reach)).toBe("fix reach or");
    expect(labelOf(last("reach"))).toBe("last reach");
  });
});

describe("the steps and the documents of a column (STEP.LADDER, DOC.CONSTRUCT)", () => {
  it("STEP.LADDER STEP.MAX STEP.VALUE: a program with a fix has step B, and a host at step A refuses it", () => {
    expect(programStep(reach)).toMatchObject({ step: "B", construct: "fix", path: [] });
    expect(programStep(app("add", lit(1), reach)).path).toEqual([1]);
    expect(stepError(reach, { maxStep: "A" })).toContain("step B");
    expect(stepError(reach, { maxStep: "B" })).toBeUndefined();
    const at = { space: GRAPH, origin: "0", domains: DOMAINS };
    expect(evaluate(reach, { ...at, maxStep: "C" })).toEqual(evaluate(reach, { ...at, maxStep: "B" }));
    expect(error(evaluate(reach, { ...at, maxStep: "A" })).kind).toBe("bad-expression");
  });

  it("DOC.CONSTRUCT IR.JSON: a column has its document and its text, and each gives the same expression", () => {
    const doc = value(toDocument(reach));
    expect(doc).toMatchObject({ type: "fix", value: { name: "reach", join: "or" } });
    expect(toDocument(last("x"))).toEqual(ok({ type: "last", value: "x" }));
    expect(fromDocument(doc)).toEqual(ok(reach));
    expect(parse(value(serialize(reach)))).toEqual(ok(reach));
    expect(evaluate(doc, { space: GRAPH, origin: "0", domains: DOMAINS })).toEqual(ok(true));
  });

  it("DOC.CONSTRUCT: a document of a column with a bad field gives the error of the shape", () => {
    expect(fromDocument(fixDoc({}))).toEqual(ok(fix("x", "or", lit(false), lit(false))));
    for (const fields of [{ join: "xor" }, { name: 1 }, { extra: 1 }]) expect(fromDocument(fixDoc(fields)).ok).toBe(false);
    expect(fromDocument({ type: "last", value: 1 }).ok).toBe(false);
    expect(Object.keys(VEX_WORLD.kinds)).toEqual(expect.arrayContaining(["fix", "last"]));
  });

  it("IR.JSON: the check of the shape reads the fields of a column", () => {
    const okay = { tag: "fix", name: "x", join: "max", init: lit(0), step: last("x") };
    expect(shapeError(okay)).toBeUndefined();
    expect(shapeError({ ...okay, join: "xor" })).toBeDefined();
    expect(shapeError({ ...okay, name: 1 })).toBeDefined();
    expect(shapeError({ ...okay, init: {} })).toBeDefined();
    expect(shapeError({ ...okay, step: {} })).toBeDefined();
    expect(shapeError({ tag: "last", name: 1 })).toBeDefined();
    expect(shapeError(last("x"))).toBeUndefined();
    expect(children(reach)).toEqual([reach.init, reach.step]);
    expect(children(last("x"))).toEqual([]);
  });

  it("LOOP.SIZE: a column gives a boolean or a number, so a list cannot grow through it", () => {
    expect(sizeError(reach, { domains: DOMAINS })).toBeUndefined();
    expect(sizeError(fix("x", "max", lit(0), last("x")), { domains: DOMAINS })).toBeUndefined();
    expect(compile(reach, { domains: DOMAINS }).run({ space: GRAPH, origin: "0" })).toEqual(ok(true));
  });
});

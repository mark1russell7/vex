/**
 * The limit of `iterate` from the size of the data (ITERATE.LIMIT.DATA, ITERATE.LIMIT.ERROR). Each test compares the
 * closure tier with the reference tier of the kernel. The tests of tier 2 and of the modules are in the compiler.
 */
import { describe, expect, it } from "vitest";
import { vex } from "./builder.ts";
import { fromDocument, toDocument, type Envelope } from "./document.ts";
import { defineDomain, type AnyDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
import { compile, evaluate, labelOf, type EvalOptions } from "./evaluate.ts";
import { deps } from "./deps.ts";
import { app, axes, children, dataLimit, each, ext, fold, iterate, let_, limitAxis, lit, offset, ref, shapeError, splitLimit, v, type Axis, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { toVexResult, VEX_WORLD } from "./kernel.ts";
import { worstError } from "./limit-error.ts";
import { kernelPlan } from "./plan.ts";
import { fail, type Result } from "./result.ts";
import { cell, SheetRun } from "./sheet.ts";
import { sizeError } from "./size.ts";
import { space, type Space } from "./space.ts";
import { programStep, stepError } from "./steps.ts";
import { error, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  size: "fixed",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"] },
    gt: { fn: (a: number, b: number): boolean => a > b, params: ["number"] },
  },
});
const DOMAINS: readonly AnyDomain[] = [Num];

const records = space.array([{ n: 1, ok: true }, { n: 2, ok: false }, { n: 3, ok: true }]);
const tree = space.tree({ r: {}, a: {}, b: {} }, { r: null, a: "r", b: "r" });

/** This function gives the result of the closure tier, after a check that the reference tier gives the same code or value. */
function run(e: Expr, opts: Partial<EvalOptions> = {}): Result<unknown> {
  const at: EvalOptions = { space: records, origin: "0", domains: DOMAINS, ...opts };
  const r = evaluate(e, at);
  const reference = toVexResult(kernelPlan(e, { domains: at.domains ?? [] }).reference(at));
  expect(reference.ok ? reference.value : reference.error.code).toEqual(r.ok ? r.value : r.error.code);
  return r;
}

const count = (axis: Axis): Expr => iterate(dataLimit(axis), { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i"));
/** A limit that is not valid must give `#NUM!` with the kind `limit`, in both tiers. */
const invalid = (axis: Axis, opts: Partial<EvalOptions> = {}): readonly unknown[] => {
  const r = error(run(count(axis), opts));
  return [r.code, r.kind];
};
const LIMIT = ["#NUM!", "limit"];
const stop = (limit: number): Expr => iterate(dataLimit(axes.all), { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i"), app("gt", v("i"), lit(limit)));
const part = (x: Expr): string => (x.tag === "ref" ? x.path.join(".") : x.tag);
const iterateOf = (limit: unknown): unknown => ({ type: "iterate", value: { limit, init: {}, step: {}, result: 1 } });

describe("the limit of iterate from the data (ITERATE.LIMIT.DATA)", () => {
  it("ITERATE.LIMIT.DATA: the limit is the number of targets of the axis, the steps of a fold over that axis", () => {
    expect(value(run(count(axes.all)))).toBe(3);
    expect(value(run(count(axes.others)))).toBe(2);
    expect(value(run(count({ t: "reverse", axis: axes.all })))).toBe(3);
    expect(value(run(count(axes.where(axes.all, ref("ok")))))).toBe(2);
    expect(value(run(count(axes.where(axes.where(axes.all, ref("ok")), app("gt", ref("n"), lit(1))))))).toBe(1);
    expect(value(run(count(axes.children), { space: tree, origin: "r" }))).toBe(2);
    expect(value(run(count(axes.children), { space: tree, origin: "a" }))).toBe(0);
    const fold3 = fold(axes.all, { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i"));
    expect(run(fold3)).toEqual(run(count(axes.all)));
  });

  it("ITERATE.LIMIT.DATA AXIS.LIST: the axis list gives the count of a list", () => {
    expect(value(run(count(axes.list(lit([1, 2, 3, 4])))))).toBe(4);
    expect(value(run(count(axes.list(each(axes.all, ref("n"))))))).toBe(3);
    expect(value(run(count(axes.list(lit([])))))).toBe(0);
    expect(value(run(count(axes.list(app("fill", lit(5), lit(0))))))).toBe(5);
  });

  it("ITERATE.LIMIT.DATA AXIS.TABLE: the axis table gives the number of records of a table of the run", () => {
    const tables: Readonly<Record<string, Space>> = { t: space.array([{ a: 1 }, { a: 2 }]) };
    expect(value(run(count(axes.table("t")), { tables }))).toBe(2);
  });

  it("ITERATE.UNTIL ITERATE.LIMIT.DATA: a data limit with until stops at a true test, and gives #NUM! with no true test", () => {
    expect(value(run(stop(1)))).toBe(2);
    const r = error(run(stop(9)));
    expect([r.code, r.kind, r.message]).toEqual(["#NUM!", "limit", '"iterate" made its 3 steps, and its test "until" is not true']);
    // With a limit of 0, the test evaluates one time.
    const none = iterate(dataLimit(axes.list(lit([]))), { i: lit(5) }, { i: v("i") }, v("i"), app("gt", v("i"), lit(0)));
    expect(value(run(none))).toBe(5);
  });

  it("ITERATE.LIMIT.DATA: the limit evaluates after init and before the steps, and it reads the names outside the loop", () => {
    // An error of init comes first, so the error of the limit does not show.
    const bad = axes.list(lit(1));
    const first = error(run(iterate(dataLimit(bad), { i: ref("z") }, {}, v("i"))));
    expect(first.kind).not.toBe("limit");
    // The limit comes before the first test of until and the first step.
    const beforeUntil = error(run(iterate(dataLimit(bad), { i: lit(0) }, { i: lit("x") }, v("i"), lit("not a test"))));
    expect(beforeUntil.kind).toBe("limit");
    // The name xs of the loop hides the list only in its steps, its test and its result. The limit reads the outer list.
    const outer = let_({ xs: lit([1, 2]) }, iterate(dataLimit(axes.list(v("xs"))), { xs: lit(0) }, { xs: app("add", v("xs"), lit(1)) }, v("xs")));
    expect(value(run(outer))).toBe(2);
    // The limit evaluates one time, so a step that removes the items of the list does not change it.
    const once = iterate(dataLimit(axes.list(v("xs"))), { ys: v("xs"), n: lit(0) }, { ys: app("drop", v("ys"), lit(1)), n: app("add", v("n"), lit(1)) }, v("n"));
    expect(value(run(let_({ xs: lit([1, 2, 3]) }, once)))).toBe(3);
  });

  it("ITERATE.LIMIT: a limit that is a number has the behavior and the document of step A", () => {
    const e = iterate(2, { i: lit(0) }, { i: app("add", v("i"), lit(1)) }, v("i"));
    expect(value(run(e))).toBe(2);
    expect(limitAxis(e)).toBeUndefined();
    expect(splitLimit(e)).toBeUndefined();
    expect(value(toDocument(e)).value).toMatchObject({ limit: 2 });
    expect(labelOf(e)).toBe("iterate 2");
  });
});

describe("the error of a limit that is not valid (ITERATE.LIMIT.ERROR)", () => {
  it("ITERATE.LIMIT.ERROR: a list that is not a list, an error, a missing field or an error item gives one error", () => {
    expect(invalid(axes.list(lit(3)))).toEqual(LIMIT);
    expect(invalid(axes.list(lit("text")))).toEqual(LIMIT);
    expect(invalid(axes.list(ref("missing")))).toEqual(LIMIT);
    expect(invalid(axes.list(ref("n", [offset(9)])))).toEqual(LIMIT);
    expect(invalid(axes.list(app("unknown-op", lit(1))))).toEqual(LIMIT);
    expect(invalid(axes.list(each(axes.all, ref("missing"))))).toEqual(LIMIT);
    expect(invalid({ t: "reverse", axis: axes.list(lit(3)) })).toEqual(LIMIT);
  });

  it("ITERATE.LIMIT.ERROR: a test that fails or that is not a boolean gives one error, and a test of a removed item does not run", () => {
    expect(invalid(axes.where(axes.all, ref("missing")))).toEqual(LIMIT);
    expect(invalid(axes.where(axes.all, ref("n")))).toEqual(LIMIT);
    expect(invalid(axes.where(axes.list(lit(3)), lit(true)))).toEqual(LIMIT);
    expect(invalid(axes.where(axes.where(axes.all, ref("missing")), lit(true)))).toEqual(LIMIT);
    expect(value(run(count(axes.where(axes.where(axes.all, ref("ok")), app("gt", ref("n"), lit(0))))))).toBe(2);
  });

  it("ITERATE.LIMIT.ERROR: an axis that is not valid for the run gives one error", () => {
    expect(invalid(axes.table("none"))).toEqual(LIMIT);
    expect(invalid(axes.table("none"), { tables: { other: records } })).toEqual(LIMIT);
    expect(invalid(axes.children)).toEqual(LIMIT);
  });

  it("ITERATE.LIMIT.ERROR: the error keeps its cause and the place of the node", () => {
    const r = error(evaluate(app("add", lit(1), count(axes.list(lit(3)))), { space: records, origin: "0", domains: DOMAINS }));
    expect([r.code, r.kind, r.message, r.path, r.origin, r.focus]).toEqual(["#NUM!", "limit", 'the data limit of "iterate" is not valid', [1], "0", "0"]);
    expect(r.causes?.map((c) => c.code)).toEqual(["#VALUE!"]);
    const test = error(evaluate(count(axes.where(axes.all, ref("missing"))), { space: records, origin: "1", domains: DOMAINS }));
    expect(test.causes?.map((c) => c.code)).toEqual(["#N/A"]);
    const table = error(evaluate(count(axes.table("none")), { space: records, origin: "0", domains: DOMAINS }));
    expect(table.causes?.map((c) => c.kind)).toEqual(["no-table"]);
  });

  it("ITERATE.LIMIT.ERROR: a count above 100000 gives one error, and the cap itself is valid", () => {
    const cap = app("fill", lit(100_000), lit(0));
    const above = axes.list(app("append", cap, lit([1])));
    const r = error(run(iterate(dataLimit(above), {}, {}, lit(1))));
    expect([r.code, r.kind, r.message]).toEqual(["#NUM!", "limit", 'the data limit of "iterate" is 100001, above the cap of 100000']);
    expect(value(run(iterate(dataLimit(axes.list(cap)), {}, {}, lit(1))))).toBe(1);
  });

  it("ITERATE.LIMIT.ERROR FORM.IFERROR: ifError catches the error of a limit", () => {
    expect(value(run(app("ifError", count(axes.list(lit(3))), lit(-1))))).toBe(-1);
  });

  it("ITERATE.LIMIT.ERROR EVAL.DEPTH: #DEPTH! stays as it is, and it wins over an earlier error of an item", () => {
    const deep = fail(vexError("depth", "the call stack is full"));
    const other = fail(vexError("missing-field", "no field"));
    const extensions = { deep: () => deep, other: () => other };
    const opts = { space: records, origin: "0", domains: DOMAINS, extensions };
    expect(error(evaluate(count(axes.list(ext("deep", null))), opts)).code).toBe("#DEPTH!");
    expect(error(evaluate(app("ifError", count(axes.list(ext("deep", null))), lit(0)), opts)).code).toBe("#DEPTH!");
    const items = axes.list(each(axes.all, app("if", app("gt", ref("n"), lit(1)), ext("deep", null), ext("other", null))));
    expect(error(evaluate(count(items), opts)).code).toBe("#DEPTH!");
    expect(worstError([vexError("limit", "a"), vexError("depth", "b")])).toMatchObject({ code: "#DEPTH!" });
    expect(worstError([vexError("limit", "a"), vexError("kind-mismatch", "b")])).toMatchObject({ kind: "limit" });
    expect(worstError([])).toBeUndefined();
  });

  it("ITERATE.LIMIT.ERROR SHEET.CYCLE: #CYCLE! stays as it is, so a cell on a cycle reports the cycle", () => {
    const columns = new Map<string, Expr>([["a", iterate(dataLimit(axes.list(cell("a"))), {}, {}, lit(1))]]);
    const run2 = new SheetRun(columns, { space: records, domains: DOMAINS });
    expect(error(run2.cell("a", "0")).code).toBe("#CYCLE!");
    const reader = new Map<string, Expr>([
      ["a", app("add", cell("b"), lit(0))],
      ["b", app("add", cell("a"), lit(0))],
      ["c", iterate(dataLimit(axes.list(cell("a"))), {}, {}, lit(1))],
    ]);
    expect(error(new SheetRun(reader, { space: records, domains: DOMAINS }).cell("c", "0")).code).toBe("#CYCLE!");
  });
});

describe("the step of a data limit (STEP.LADDER, STEP.MAX)", () => {
  const e = count(axes.all);

  it("STEP.LADDER STEP.LOWEST ITERATE.LIMIT.DATA: a program with a data limit is of step B, with the reason", () => {
    expect(programStep(e)).toEqual({ step: "B", reason: 'the node "iterate.size" at the root needs step B', construct: "iterate.size", path: [] });
    expect(programStep(app("add", lit(1), e))).toMatchObject({ step: "B", construct: "iterate.size", path: [1] });
    expect(programStep(iterate(1, { i: lit(0) }, {}, v("i"))).step).toBe("A");
  });

  it("STEP.MAX ITERATE.LIMIT.DATA: maxStep A refuses a data limit, and the default takes it", () => {
    const reason = 'the program needs step B, and the host accepts the steps up to A: the node "iterate.size" at the root needs step B (STEP.MAX)';
    expect(stepError(e, { maxStep: "A" })).toBe(reason);
    expect(stepError(e)).toBeUndefined();
    expect(stepError(e, { maxStep: "B" })).toBeUndefined();
    expect(error(compile(e, { domains: DOMAINS, maxStep: "A" }).run({ space: records, origin: "0" })).message).toBe(reason);
    expect(error(evaluate(e, { space: records, origin: "0", domains: DOMAINS, maxStep: "A" })).message).toBe(reason);
    expect(value(evaluate(e, { space: records, origin: "0", domains: DOMAINS, maxStep: "B" }))).toBe(3);
    expect(value(evaluate(iterate(1, { i: lit(0) }, {}, v("i")), { space: records, origin: "0", domains: DOMAINS, maxStep: "A" }))).toBe(0);
  });

  it("STEP.VALUE: each accepted program gives the same value at each step", () => {
    for (const maxStep of ["B", "C"] as const) expect(value(evaluate(e, { space: records, origin: "0", domains: DOMAINS, maxStep }))).toBe(3);
  });
});

describe("the size of a loop with a data limit (LOOP.SIZE)", () => {
  const opts = { domains: DOMAINS };
  const xs = v("xs");
  const push = app("append", xs, lit([1]));

  it("LOOP.SIZE ITERATE.LIMIT.DATA: a step that grows a list by a constant is valid, and a step that doubles is not", () => {
    expect(sizeError(iterate(dataLimit(axes.all), { xs: lit([]) }, { xs: push }, xs), opts)).toBeUndefined();
    expect(sizeError(iterate(dataLimit(axes.all), { xs: lit([]) }, { xs: app("append", xs, xs) }, xs), opts)).toContain("xs");
  });

  it("LOOP.SIZE ITERATE.LIMIT.DATA: an inner limit that reads a name of an outer loop counts as a use of that name", () => {
    // Each outer step adds as many items as xs has, so xs doubles at each outer step.
    const inner = iterate(dataLimit(axes.list(xs)), { ys: xs }, { ys: app("append", v("ys"), lit([1])) }, v("ys"));
    expect(sizeError(fold(axes.all, { xs: lit([1]) }, { xs: inner }, xs), opts)).toContain("xs");
    // A limit from outside the loops is a constant of the size of the input.
    const steady = iterate(dataLimit(axes.all), { ys: xs }, { ys: app("append", v("ys"), lit([1])) }, v("ys"));
    expect(sizeError(fold(axes.all, { xs: lit([1]) }, { xs: steady }, xs), opts)).toBeUndefined();
    expect(sizeError(iterate(dataLimit(axes.list(lit([1, 2]))), { ys: lit([]) }, { ys: app("append", v("ys"), lit([1])) }, v("ys")), opts)).toBeUndefined();
  });

  it("LOOP.SIZE ITERATE.LIMIT.DATA: the check reads the list and the tests of the axis of a limit", () => {
    const grow = iterate(2, { ys: lit([1]) }, { ys: app("append", v("ys"), v("ys")) }, v("ys"));
    expect(sizeError(iterate(dataLimit(axes.list(grow)), {}, {}, lit(1)), opts)).toContain("ys");
    expect(sizeError(iterate(dataLimit(axes.where(axes.all, app("gt", app("count", grow), lit(0)))), {}, {}, lit(1)), opts)).toContain("ys");
  });

  it("LOOP.SIZE ITERATE.LIMIT.DATA: the steps of iterate have no item, so the kinds of a list do not reach the names", () => {
    const e = iterate(dataLimit(axes.list(lit(["a", "b"]))), { n: lit(0) }, { n: app("add", v("n"), lit(1)) }, v("n"));
    expect(sizeError(e, opts)).toBeUndefined();
  });
});

describe("the forms of a data limit (ITERATE.LIMIT.DATA)", () => {
  const e = iterate(dataLimit(axes.where(axes.list(lit([1, 2])), ref("ok"))), { i: ref("n") }, { i: ref("m") }, ref("r"), ref("u"));

  it("ITERATE.LIMIT.DATA EVAL.LOCATION: the children of a data limit come after the steps and before until", () => {
    expect(children(e).map(part)).toEqual(["n", "m", "lit", "ok", "u", "r"]);
    const [targets, rest] = splitLimit(e) ?? [];
    expect(targets).toEqual(each(axes.where(axes.list(lit([1, 2])), ref("ok")), lit(0)));
    expect(rest).toEqual({ ...e, limit: 0 });
  });

  it("DOC.LIMIT DOC.ROUND-TRIP: the document has the kind size, and it reads back as the same expression", () => {
    const d = value(toDocument(count(axes.all)));
    expect(d.value).toMatchObject({ limit: { type: "size", value: { axis: { type: ["axes", "all"], value: {} } } } });
    expect(value(fromDocument(d))).toEqual(count(axes.all));
    expect(value(fromDocument(value(toDocument(e))))).toEqual(e);
  });

  it("ITERATE.LIMIT DOC.LIMIT: an envelope of the kind limit is the number, and the writer gives the bare number", () => {
    const doc: Envelope = { type: "iterate", value: { limit: { type: "limit", value: 3 }, init: {}, step: {}, result: 1 } };
    const read = value(fromDocument(doc));
    expect(read).toEqual(iterate(3, {}, {}, lit(1)));
    expect(value(toDocument(read)).value).toMatchObject({ limit: 3 });
    const bad: Envelope = { type: "iterate", value: { limit: { type: "limit", value: -1 }, init: {}, step: {}, result: 1 } };
    expect(error(fromDocument(bad)).code).toBe("#VALUE!");
  });

  it("DOC.LIMIT DOC.ERROR: a size with a bad axis or a limit of another kind is not valid", () => {
    for (const limit of [{ type: "size", value: {} }, { type: "size", value: { axis: 1 } }, { type: "lit", value: 1 }, { type: "size", value: { axis: { type: ["axes", "all"], value: {} }, at: [] } }, null]) {
      expect(error(fromDocument(iterateOf(limit))).code).toBe("#VALUE!");
    }
  });

  it("ITERATE.LIMIT.DATA DOC.CHECK: the world has the kinds of a limit, each with an evaluator of its own", () => {
    expect(VEX_WORLD.kinds["limit"]).toMatchObject({ verbs: { eval: "vex.limit" } });
    expect(VEX_WORLD.kinds["size"]).toMatchObject({ verbs: { eval: "vex.size" } });
  });

  it("ITERATE.LIMIT.DATA IR.JSON: serialize and parse keep a data limit and its expressions", () => {
    const withList = iterate(dataLimit(axes.where(axes.list(lit([1, 2])), lit(true))), {}, {}, lit(1));
    expect(value(parse(value(serialize(withList))))).toEqual(withList);
    expect(value(parse(value(serialize(iterate(2, {}, {}, lit(1))))))).toEqual(iterate(2, {}, {}, lit(1)));
  });

  it("ITERATE.LIMIT.DATA EVAL.SHAPE: the shape check reads the axis of a data limit", () => {
    const bare = { tag: "iterate", init: {}, step: {}, result: lit(1) };
    expect(shapeError({ ...bare, limit: { axis: { t: "all" } } })).toBeUndefined();
    expect(shapeError({ ...bare, limit: { axis: { t: "nope" } } })).toBeDefined();
    expect(shapeError({ ...bare, limit: {} })).toBeDefined();
    expect(shapeError({ ...bare, limit: { axis: { t: "list", list: 1 } } })).toBeDefined();
    expect(shapeError({ ...bare, limit: null })).toBeDefined();
    expect(shapeError({ tag: "iterate", limit: { axis: { t: "all" } }, step: {}, result: lit(1) })).toBeDefined();
  });

  it("ITERATE.LIMIT.DATA TRACE.EVENTS: the label of an iteration names the axis of its limit", () => {
    expect(labelOf(count(axes.all))).toBe("iterate size of all");
    expect(labelOf(count(axes.where(axes.all, lit(true))))).toBe("iterate size of where");
  });

  it("DEPS.READS ITERATE.LIMIT.DATA: the reads of a limit come after init, and a test of the axis reads inside the axis", () => {
    const d = deps(iterate(dataLimit(axes.where(axes.all, ref("a"))), { i: ref("b") }, {}, v("i")));
    expect(d.map((x) => [x.path, x.axes])).toEqual([
      [["b"], []],
      [["a"], ["where"]],
    ]);
    const l = deps(iterate(dataLimit(axes.list(ref("a"))), {}, {}, lit(1)));
    expect(l.map((x) => [x.path, x.axes])).toEqual([[["a"], []]]);
  });

  it("SHEET.ORDER ITERATE.LIMIT.DATA: a test of a limit reads the cell of its target, and the order keeps the value", () => {
    // Each row reads the rows before it through a test of the axis of its limit, so the order must be from the first key.
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const earlier = axes.window(-1, -1);
    const running = iterate(dataLimit(axes.where(earlier, app("gt", cell("a"), lit(-1)))), { s: ref("v") }, { s: app("add", v("s"), ifCell()) }, v("s"));
    const sheet = new SheetRun(new Map([["a", running]]), { space: rows, domains: DOMAINS });
    expect(["0", "1", "2"].map((k) => value(sheet.cell("a", k)))).toEqual([1, 3, 6]);
  });
});

/** This function gives a cell of the row before, or 0 at the first row. */
function ifCell(): Expr {
  return app("ifError", cell("a", [offset(-1)]), lit(0));
}

describe("the builder (BUILD.LIMIT)", () => {
  const rows = vex(Num).over(records);
  const ns = rows.start(0).each((c) => c.from("n"));

  it("BUILD.LIMIT: a DataLimit is a limit of iterate", () => {
    const steps = rows.start(0).iterate(dataLimit(axes.all), { i: 0 }, ({ i }) => ({ i: i._.add(1) }), ({ i }) => i);
    expect(steps.program).toMatchObject({ tag: "iterate", limit: { axis: axes.all } });
    expect(value(steps.result("0"))).toBe(3);
  });

  it("BUILD.LIMIT: a list chain is a limit of iterate, and the limit is the count of the list", () => {
    const steps = rows.start(0).iterate(ns, { i: 0 }, ({ i }) => ({ i: i._.add(2) }), ({ i }) => i);
    expect(steps.program).toMatchObject({ tag: "iterate", limit: { axis: { t: "list", list: ns.program } } });
    expect(value(steps.result("1"))).toBe(6);
  });

  it("BUILD.LIMIT BUILD.LIST.LOOP: a data limit with a list result gives a list chain", () => {
    const built = rows.start(0).iterate(ns, { acc: rows.list<number>() }, ({ acc }) => ({ acc: acc.append(ns) }), ({ acc }) => acc);
    expect(value(built.count().result("0"))).toBe(9);
  });
});

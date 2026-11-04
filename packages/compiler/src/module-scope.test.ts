/**
 * The scope of a name in a standalone module and in tier 2. One name can have two meanings at two places of a program,
 * so a key of the printer must hold the meaning of a read, and a shared object of a program must not join two places.
 * Each test compares the module and tier 2 with the interpreter (P17).
 */
import { app, axes, type Axis, call, each, evaluate, fn, fold, iterate, let_, lit, rec, ref, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const SCHEMA = { fields: { n: "number" }, vars: { a: "number", v0: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const RECORDS = [{ n: 1 }, { n: -2 }];
const VARS = { a: 2, v0: 30 };
const n = ref("n");
const X = v("x");
const Y = v("y");
const add = (...args: Expr[]): Expr => app("add", ...args);
const ten = (x: Expr): Expr => add(x, lit(10));
/** The sum of `n` over all the records, so a binding is not a literal. */
const TOTAL = app("sum", each(axes.all, n));
/** Two names with one variable: both values are one constant of the run. */
const FIVES = { x: lit(5), y: lit(5) };

/** This function gives a function with the parameter `x` and the body `body`, and a call of it. */
const local = (body: Expr): Expr => let_({ h: fn(["x"], body) }, call("h", lit(1)));
/** These functions give the parts of a call whose function has a column in the step of a fold. */
const near = (x: Expr, u: Expr): Axis => axes.where(axes.all, app("eq", n, add(x, u)));
const steps = (term: Expr): Expr => fold(axes.all, { s: lit(0) }, { s: add(n, term) }, v("s"));
const called = (body: Expr): Expr => let_({ g: fn(["u"], body) }, call("g", lit(0)));
const unread = (body: Expr): Expr => let_({ h: fn(["x"], lit(1)) }, body);

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function compares a module and tier 2 with the interpreter at each key of the records. A failure of one does not hide the other. */
function expectSame(e: Expr): void {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  const loaded = make(m.source);
  const s = space.array(RECORDS);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: DOMAINS }));
  const fast = tiered(e, { domains: DOMAINS, schema: SCHEMA });
  expect.soft(fast.tier).toBe(2);
  expect.soft(s.keys.map((origin) => fromCore(fast.run({ space: s, origin, vars: VARS })))).toStrictEqual(results.map((r) => fromCore(r)));
  expect.soft(loaded.run(structuredClone(RECORDS), VARS)).toStrictEqual(results.map((r) => (r.ok ? r.value : loaded.VEX_ERROR)));
}

describe("V-078 COMPILE.MODULE: a name that an expression binds is not a name of the place of the expression", () => {
  it("V-078: a let hides one of two names with one variable", () => {
    expectSame(let_(FIVES, rec({ p: let_({ x: lit(1) }, ten(X)), q: let_({ x: lit(1) }, ten(Y)), r: n })));
  });

  it("V-078: a name is an alias of another name", () => {
    expectSame(let_({ x: TOTAL }, let_({ y: X }, rec({ p: let_({ x: lit(1), y: lit(2) }, ten(X)), q: let_({ x: lit(1), y: lit(2) }, ten(Y)), r: n }))));
  });

  it("V-078: two scopes bind two names to one constant", () => {
    expectSame(rec({ p: let_({ x: TOTAL }, let_({ x: lit(1) }, ten(X))), q: let_({ y: TOTAL }, let_({ x: lit(1) }, ten(Y))), r: n }));
  });

  it("V-078: an iteration hides a name", () => {
    const loop = (result: Expr): Expr => iterate(1, { x: lit(1), y: lit(2) }, { x: add(X, lit(1)), y: add(Y, lit(2)) }, result);
    expectSame(let_(FIVES, rec({ p: loop(X), q: loop(Y), r: n })));
  });

  it("V-078: a fold hides a name in its steps and in its result", () => {
    const loop = (result: Expr): Expr => fold(axes.all, { x: lit(0), y: lit(0) }, { x: add(X, n), y: add(Y, lit(1)) }, result);
    expectSame(let_(FIVES, rec({ p: loop(X), q: loop(Y), r: n })));
  });

  it("V-078: the name of an item hides a name in the body of an each", () => {
    const items = lit(vexList([{ key: "0", result: { ok: true, value: 1 } }]));
    const over = (body: Expr): Expr => app("sum", each(axes.list(items), body, undefined, ["x"]));
    expectSame(let_(FIVES, rec({ p: over(ten(X)), q: over(ten(Y)), r: n })));
  });

  it("V-078: a parameter hides a name in the body of a function", () => {
    expectSame(let_(FIVES, rec({ p: local(ten(X)), q: local(ten(Y)), r: n })));
  });

  it("V-078: a name of the schema has the text of the code of another variable", () => {
    // The first variable of the schema that a module reads has the code `v0`, and the schema has a variable named `v0`.
    expectSame(let_({ x: v("a") }, rec({ p: add(X, lit(1)), q: add(v("v0"), lit(1)), r: n })));
  });
});

describe("V-080 COMPILE.MODULE: an object that a program uses at two places has a meaning at each place", () => {
  it("V-080: a key of a node of the memo is not the read of a name that a let hides", () => {
    const shared = v("a");
    expectSame(app("sum", each(axes.all, add(add(n, shared), let_({ a: lit(7) }, shared)))));
  });

  it("V-080: a key from a binding is not the read of a name that a let hides", () => {
    const shared = v("x");
    const origin = ref("n", [{ t: "origin" }]);
    expectSame(let_({ x: origin }, app("sum", each(axes.where(axes.all, app("eq", n, shared)), let_({ x: lit(7) }, shared)))));
  });
});

/** This function gives the count of the functions of the memo in a module. */
function memos(e: Expr): number {
  const m = emitModule(e, OPTIONS);
  return m.ok ? [...m.source.matchAll(/\bconst m\d+ = /g)].length : Number.NaN;
}

describe("V-080 COMPILE.MODULE: a shared list and the memo", () => {
  const originOf = ref("n", [{ t: "origin" }]);
  const shared = each(axes.where(axes.all, app("eq", n, originOf)), ref("n"));

  it("V-080 COMPILE.MODULE: one shared list at several places of one scope has one memo", () => {
    const take = app("take", shared, lit(1));
    const sum = app("sum", shared);
    const uses = [rec({ a: take, b: app("take", shared, lit(1)) }), rec({ a: sum, b: app("sum", shared), c: add(app("sum", shared), lit(1)) })];
    expect(uses.map((e) => memos(e))).toStrictEqual([1, 1]);
    expect(uses.map((e) => emitModule(e, OPTIONS))).toStrictEqual(uses.map((e) => emitModule(JSON.parse(JSON.stringify(e)) as Expr, OPTIONS)));
    for (const e of uses) expectSame(e);
  });

  it("V-080 COMPILE.MODULE: a shared list with a key from a name has a value for each scope", () => {
    const keyed = each(axes.where(axes.all, app("eq", n, v("x"))), ref("n"));
    const take = app("take", keyed, lit(1));
    expectSame(let_({ x: originOf }, rec({ a: take, b: let_({ x: add(originOf, lit(1)) }, take) })));
  });
});

/** This function gives the count of the items near a value. */
const count = (x: Expr): Expr => app("sum", each(near(x, v("u")), lit(1)));

describe("V-081 COMPILE.MODULE: a read of the pack of a column of a call keeps the markers of the column", () => {
  const origin = ref("n", [{ t: "origin" }]);

  it("V-081: a column of a call reads the origin", () => {
    expectSame(called(steps(count(origin))));
  });

  it("V-081: a strict sum in a column of a call reads the origin", () => {
    expectSame(called(steps(app("sum", each(near(origin, v("u")), lit(1)), lit({ strict: true })))));
  });

  it("V-081: a column of a call reads a binding of the focus of the function", () => {
    expectSame(called(let_({ y: n }, steps(count(v("y"))))));
  });

  it("V-081: a call at the focus of a second print has an argument that its function does not read", () => {
    expectSame(unread(called(steps(add(call("h", origin), count(v("u")))))));
  });

  it("V-081: a safe value drops the print of a column of a call that reads the origin", () => {
    expectSame(called(app("ifError", lit(0), steps(count(origin)))));
  });

  it("V-086 COMPILE.MODULE.FUSE.OFF: with fuse false, a dropped print leaves no read of a name without a declaration", () => {
    // The setup of the tests fails this call on a read of a name without a declaration.
    expect(emitModule(called(app("ifError", lit(0), steps(count(origin)))), { ...OPTIONS, fuse: false }).ok).toBe(true);
  });
});

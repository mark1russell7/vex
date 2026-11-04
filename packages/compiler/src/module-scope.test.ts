/**
 * The scope of a name in a standalone module and in tier 2. One name can have two meanings at two places of a program,
 * so a key of the printer must hold the meaning of a read, and a shared object of a program must not join two places.
 * Each test compares the module and tier 2 with the interpreter (P17).
 */
import { app, axes, call, each, evaluate, fn, fold, iterate, let_, lit, rec, ref, space, v, vexList, type Expr } from "@mark1russell7/vex";
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
  expect.soft(loaded.run(structuredClone(RECORDS), VARS)).toStrictEqual(results.map((r) => (r.ok ? r.value : loaded.VEX_ERROR)));
  const fast = tiered(e, { domains: DOMAINS, schema: SCHEMA });
  expect.soft(fast.tier).toBe(2);
  expect.soft(s.keys.map((origin) => fromCore(fast.run({ space: s, origin, vars: VARS })))).toStrictEqual(results.map((r) => fromCore(r)));
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

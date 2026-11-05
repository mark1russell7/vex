/**
 * The read of a column of a call in a second print of a standalone module. A fold in a function prints twice, and each
 * print must hold the markers of the first print. Each test compares the module and tier 2 with the interpreter (P17).
 */
import { app, axes, call, each, evaluate, fn, fold, let_, lit, ref, space, v, type Expr } from "@mark1russell7/vex";
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
const origin = ref("n", [{ t: "origin" }]);
const add = (...args: Expr[]): Expr => app("add", ...args);
const near = (x: Expr, u: Expr): Expr => axes.where(axes.all, app("eq", n, add(x, u)));
const count = (x: Expr): Expr => app("sum", each(near(x, v("u")), lit(1)));
const steps = (term: Expr): Expr => fold(axes.all, { s: lit(0) }, { s: add(n, term) }, v("s"));
const called = (body: Expr): Expr => let_({ g: fn(["u"], body) }, call("g", lit(0)));

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
  const results = s.keys.map((key) => evaluate(e, { space: s, origin: key, vars: VARS, domains: DOMAINS }));
  const fast = tiered(e, { domains: DOMAINS, schema: SCHEMA });
  expect.soft(fast.tier).toBe(2);
  expect.soft(s.keys.map((key) => fromCore(fast.run({ space: s, origin: key, vars: VARS })))).toStrictEqual(results.map((r) => fromCore(r)));
  expect.soft(loaded.run(structuredClone(RECORDS), VARS)).toStrictEqual(results.map((r) => (r.ok ? r.value : loaded.VEX_ERROR)));
}

describe("V-081 COMPILE.MODULE: a read of the pack of a column of a call keeps the markers of the column", () => {
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
    const unread = (body: Expr): Expr => let_({ h: fn(["x"], lit(1)) }, body);
    expectSame(unread(called(steps(add(call("h", origin), count(v("u")))))));
  });
});

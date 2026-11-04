/**
 * Names of loops that start with the empty list in a standalone module (COMPILE.MODULE.LOOP.EMPTY). The empty literal has
 * no kind of items, so the steps of the loop decide that kind. A program that no part decides stays refused.
 */
import { app, axes, each, evaluate, fold, isVexList, iterate, let_, lit, ref, rec, SheetRun, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions, type SheetModuleOptions } from "./module.ts";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";

interface Loaded {
  readonly run: (...args: readonly unknown[]) => unknown;
  readonly VEX_ERROR: unknown;
}

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: { fields: { n: "number" }, vars: {} } };
const RECORDS = [{ n: 2 }, { n: -3 }, { n: 1 }, { n: 0 }];
const NONE = lit(vexList([]));
const DECIDE_REASON = 'the kinds of the items of "sortBy" do not decide the op "negate" of the option by';
const FIT_REASON = 'a step of a loop gives the name "out" a list that does not fit its first list';

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const out = v("out");
const one = (x: Expr): Expr => op("fill", lit(1), x);
const sorted = (l: Expr): Expr => op("sortBy", l, lit({ by: "negate" }));
const grown = op("append", out, one(n));
/** This function gives a fold over all records. Its name `out` starts with the empty list, and its value is `result`. */
const sweep = (step: Expr, result: Expr = out): Expr => fold(axes.all, { out: NONE }, { out: step }, result);

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr): string {
  const m = emitModule(e, OPTIONS);
  return m.ok ? "" : m.reason;
}

/** This function gives a value of the interpreter in the form of a module, also in the items of a list. */
function asModule(value: unknown, error: unknown): unknown {
  if (!isVexList(value)) return value;
  return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
}

/** This function compares the module of a program with the interpreter at each key, with and without fusion (P17). */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): void {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, domains: DOMAINS }));
  for (const fuse of [true, false]) {
    const m = make(sourceOf(e, { ...OPTIONS, fuse }));
    expect(m.run(structuredClone(records), {})).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
  }
}

describe("COMPILE.MODULE.LOOP.EMPTY: a loop name that starts with the empty list", () => {
  it("COMPILE.MODULE.LOOP.EMPTY: the step of a fold decides the kind of the items for the option by (P17)", () => {
    expectSame(sorted(sweep(grown)));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: an op in the step reads the kind that the step gives (P17)", () => {
    expectSame(sweep(sorted(grown), op("count", out)));
    expectSame(sweep(sorted(grown)));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: the step of an iteration decides the kind of the items (P17)", () => {
    const i = v("i");
    expectSame(sorted(iterate(3, { out: NONE, i: lit(0) }, { out: op("append", out, one(i)), i: op("add", i, lit(1)) }, out)));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: an op on a get of the name reads the kind that the step gives (P17)", () => {
    expectSame(sweep(grown, op("add", op("get", out, lit("0")), lit(1))));
    expectSame(iterate(2, { out: NONE }, { out: grown }, op("add", op("get", out, lit("0")), lit(1))));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a step that gives the empty list or the name does not hide the kind of another branch (P17)", () => {
    expectSame(sorted(sweep(op("if", op("gt", n, lit(0)), grown, out))));
    expectSame(sorted(sweep(op("if", op("gt", n, lit(0)), grown, NONE))));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a name takes the kind of a name that the same loop decides first (P17)", () => {
    const steps = { out: op("append", out, v("b")), b: one(n) };
    expectSame(sorted(fold(axes.all, { out: NONE, b: NONE }, steps, out)));
    expectSame(sorted(fold(axes.all, { b: NONE, c: NONE, out: NONE }, { out: op("append", out, v("c")), c: op("append", NONE, v("b")), b: one(n) }, out)));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a step that reads the items of its name gets the kind from its other parts (P17)", () => {
    const [b, m] = [v("b"), v("m")];
    const still = op("flat", each(axes.list(out), op("if", op("gt", b, m), one(b), NONE), undefined, ["b"]));
    expectSame(sorted(sweep(let_({ m: n }, op("append", still, one(m))))));
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a part that only the search skips stays a reason in the last print", () => {
    const wrong = op("append", op("flat", each(axes.list(out), one(lit("a")), undefined, ["b"])), one(n));
    expect(reasonOf(sorted(sweep(wrong)))).toBe(FIT_REASON);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a step decides a list of lists (P17)", () => {
    const pairs = sweep(op("append", out, one(one(n))));
    expectSame(op("count", pairs));
    expectSame(pairs);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a sheet takes the kind from the step too (P17)", () => {
    const columns = new Map([["sorted", sorted(sweep(grown))]]);
    const options: SheetModuleOptions = OPTIONS;
    const m = emitSheetModule(columns, options);
    if (!m.ok) throw new Error(m.reason);
    const module = make(m.source);
    const s = space.array(RECORDS);
    const run = new SheetRun(columns, { space: s, domains: DOMAINS });
    const expected = s.keys.map((k) => {
      const r = run.cell("sorted", k);
      return r.ok ? asModule(r.value, module.VEX_ERROR) : module.VEX_ERROR;
    });
    expect(module.run(structuredClone(RECORDS), {})).toStrictEqual({ sorted: expected });
  });

  it("COMPILE.MODULE.LOOP.EMPTY: the module gives the interpreter's sorted values for each set of records (P17)", () => {
    const e = sorted(sweep(op("if", op("gt", n, lit(0)), grown, out)));
    const records = fc.array(fc.record({ n: fc.integer({ min: -9, max: 9 }) }), { maxLength: 5 });
    fc.assert(fc.property(records, (rs) => expectSame(e, rs)), { timeout: propertyTimeout(60_000) });
    expect(reasonOf(e)).toBe("");
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a program without a deciding step stays refused", () => {
    expect(reasonOf(sorted(sweep(out)))).toBe(DECIDE_REASON);
    expect(reasonOf(sorted(sweep(NONE)))).toBe(DECIDE_REASON);
    expect(reasonOf(sorted(sweep(op("append", out, NONE))))).toBe(DECIDE_REASON);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: steps that give two kinds of items stay refused", () => {
    const mixed = op("if", op("gt", n, lit(0)), grown, op("append", out, one(lit("a"))));
    expect(reasonOf(sorted(sweep(mixed)))).toBe(DECIDE_REASON);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a first list that is not empty keeps the kind of its items", () => {
    const e = sorted(fold(axes.all, { out: one(lit("a")) }, { out: grown }, out));
    expect(reasonOf(e)).toBe(FIT_REASON);
    expect(sourceOf(sorted(fold(axes.all, { out: one(lit(1)) }, { out: grown }, out)))).toContain("run");
  });

  it("COMPILE.MODULE.LOOP.EMPTY: the checks of the steps prove a kind, so one step in two kinds stays refused", () => {
    const looped = sweep(op("append", out, one(v("x"))));
    const e = rec({ a: let_({ x: lit(1) }, sorted(looped)), b: let_({ x: lit("a") }, looped) });
    expect(reasonOf(e)).toBe(FIT_REASON);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: a program that the first print accepts does not use the kinds of its steps", () => {
    const looped = sweep(op("append", out, one(v("x"))));
    const e = rec({ a: let_({ x: lit(1) }, op("count", looped)), b: let_({ x: lit("a") }, op("count", looped)) });
    expect(reasonOf(e)).toBe("");
    expectSame(e);
  });

  it("COMPILE.MODULE.LOOP.EMPTY: each loop decides its own name (P17)", () => {
    expectSame(rec({ a: sorted(sweep(grown)), b: sorted(sweep(op("append", out, one(op("add", n, lit(1)))))) }));
  });
});

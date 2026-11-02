/**
 * Scans in standalone modules (COMPILE.MODULE.SCAN). A fold over the targets before the origin evaluates the value of
 * each target once and each step once for each run. The module gives the values and the errors of the interpreter.
 */
import { app, axes, cell, evaluate, fold, lit, ref, SheetRun, space, v, type Expr } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const OPTIONS: ModuleOptions = { domains: [NumDomain], schema: { fields: { n: "number", w: "number" }, vars: { a: "number" } } };
const O = [{ t: "origin" }] as const;
/** Forty records: `n` from 0 to 6 in an order that is not sorted, and `w` 0 at each tenth record. */
const MANY = Array.from({ length: 40 }, (_x, i) => ({ n: (i * 3) % 7, w: i % 10 === 0 ? 0 : (i % 3) + 1 }));
const SORTED = MANY.toSorted((a, b) => a.n - b.n);
const NO_ZERO = SORTED.map((r) => ({ ...r, w: r.w === 0 ? 4 : r.w }));

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function compares the values of a module with the interpreter at each key (P17), and gives the source. */
function expectSame(e: Expr, records: readonly unknown[]): string {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: [NumDomain] }));
  const off = emitModule(e, { ...OPTIONS, fuse: false });
  for (const source of [m.source, off.ok ? off.source : ""]) {
    const loaded = make(source);
    expect(loaded.run(structuredClone(records), { a: 2 })).toStrictEqual(results.map((r) => (r.ok ? r.value : loaded.VEX_ERROR)));
  }
  return m.source;
}

/** This function gives a fold over the targets that the test `test` keeps, with the sum of `w`. */
const sumOf = (test: Expr, step: Expr = app("add", v("s"), ref("w"))): Expr => fold(axes.where(axes.all, test), { s: lit(0) }, { s: step }, v("s"));
/** This function gives `1 / r`, an error when `r` is 0. */
const inverse = (r: Expr): Expr => app("divide", lit(1), r);
const before = app("lt", ref("n"), ref("n", O));

describe("COMPILE.MODULE.SCAN: a fold over the targets before the origin", () => {
  it("[COMPILE.MODULE.SCAN] gives the values of the interpreter with the tests <, <=, > and >=, sorted or not", () => {
    const tests = [before, app("lte", ref("n"), ref("n", O)), app("gt", ref("n", O), ref("n")), app("gte", ref("n", O), ref("n"))];
    for (const test of tests) {
      for (const records of [MANY, SORTED, NO_ZERO, [], [{ n: 1, w: 1 }]]) expect(expectSame(sumOf(test), records)).toContain("PF(n,");
    }
  });

  it("[COMPILE.MODULE.SCAN] gives the values of the interpreter for a fold with more than one name", () => {
    const e = fold(axes.where(axes.all, before), { s: lit(0), c: lit(1) }, { s: app("add", v("s"), v("c")), c: app("multiply", v("c"), lit(2)) }, app("add", v("s"), v("c")));
    for (const records of [MANY, SORTED]) expect(expectSame(e, records)).toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] gives the errors of the interpreter: an error of a step, a value, a key and a first value", () => {
    const cases = [
      sumOf(before, app("add", v("s"), inverse(ref("w")))),
      sumOf(app("lt", inverse(ref("w")), ref("n", O))),
      sumOf(app("lt", ref("n"), inverse(ref("w", O)))),
      fold(axes.where(axes.all, before), { s: inverse(lit(0)) }, { s: app("add", v("s"), ref("w")) }, v("s")),
    ];
    for (const e of cases) for (const records of [MANY, SORTED, NO_ZERO, [{ n: 1, w: 0 }]]) expect(expectSame(e, records)).toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] keeps the loop for another test, and the module gives the values of the interpreter", () => {
    const cases = [sumOf(app("gt", ref("n"), ref("n", O))), sumOf(app("lt", ref("n"), v("a"))), sumOf(before, app("add", v("s"), ref("w", O)))];
    for (const e of cases) expect(expectSame(e, MANY)).not.toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] evaluates each step at most once for each record of a run", () => {
    const m = emitModule(sumOf(before), OPTIONS);
    if (!m.ok) throw new Error(m.reason);
    const source = m.source.replace("pa.push(step(", "pa.push((globalThis.__steps++, step)(");
    const g = globalThis as { __steps?: number };
    for (const records of [SORTED, NO_ZERO]) {
      g.__steps = 0;
      make(source).run(structuredClone(records), { a: 2 });
      expect(g.__steps).toBeLessThan(records.length);
    }
    delete g.__steps;
  });

  it("[COMPILE.MODULE.SCAN] gives the values of SheetRun in a sheet whose step reads a cell", () => {
    const columns = new Map<string, Expr>([["A", sumOf(before)], ["B", sumOf(before, app("add", v("s"), cell("A")))]]);
    const m = emitSheetModule(columns, { domains: [NumDomain], schema: { fields: { n: "number", w: "number" } }, kinds: { A: "number", B: "number" } });
    if (!m.ok) throw new Error(m.reason);
    expect(m.source).toContain("PF(n,");
    for (const records of [MANY, SORTED]) {
      const loaded = make(m.source);
      const s = space.array(records);
      const run = new SheetRun(columns, { space: s, domains: [NumDomain] });
      const expected = Object.fromEntries(["A", "B"].map((c) => [c, s.keys.map((k) => {
        const r = run.cell(c, k);
        return r.ok ? r.value : loaded.VEX_ERROR;
      })]));
      expect(loaded.run(structuredClone(records), {})).toStrictEqual(expected);
    }
  });
});

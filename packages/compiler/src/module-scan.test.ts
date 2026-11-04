/**
 * Scans in standalone modules (COMPILE.MODULE.SCAN). A fold over the targets before the origin evaluates the value of
 * each target once and each step once for each run. The module gives the values and the errors of the interpreter.
 */
import { app, axes, cell, defineDomain, evaluate, fold, let_, lit, offset, ref, SheetRun, space, v, type AnyDomain, type Expr, type PrimitiveKind } from "@mark1russell7/vex";
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
function expectSame(e: Expr, records: readonly unknown[], options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: options.domains ?? [] }));
  const off = emitModule(e, { ...options, fuse: false });
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

/** The records of the tests with a text `s` and a boolean `b`, and the options for them. */
const MIXED = MANY.map((r, i) => ({ ...r, s: String.fromCodePoint(97 + ((i * 5) % 9)), b: i % 3 === 0 }));
const MIXED_SCHEMA = { fields: { n: "number", w: "number", s: "string", b: "boolean" }, vars: { a: "number" } } as const;

/** This function makes a function from its source, so the test decides the text that the printer reads. */
// oxlint-disable-next-line typescript/no-implied-eval -- the test decides the source of each function.
const fnOf = (src: string): unknown => new Function(`return (${src});`)();

/** This function gives the list of one value (LIST.FILL). */
const one = (x: Expr): Expr => app("fill", lit(1), x);

/** This function makes a domain of one primitive kind, with ops from their sources and the kinds of their results. */
function domainOf(name: string, primitive: PrimitiveKind, ops: Readonly<Record<string, readonly [string, PrimitiveKind]>>, valid?: string): AnyDomain {
  return defineDomain({
    name,
    is: (u: unknown): u is unknown => typeof u === primitive,
    primitive,
    ops: Object.fromEntries(Object.entries(ops).map(([op, [src, returns]]) => [op, { fn: fnOf(src) as (self: unknown, ...args: never[]) => unknown, returns }])),
    ...(valid === undefined ? {} : { valid: fnOf(valid) as (x: unknown) => boolean }),
  }) as AnyDomain;
}

/** A domain of texts with the test `before`, and a domain of booleans with the same test. */
const TEXTS = domainOf("Texts", "string", { before: ["(a, b) => a < b", "boolean"] });
const FLAGS = domainOf("Flags", "boolean", { before: ["(a, b) => a < b", "boolean"] });

describe("COMPILE.MODULE.SCAN: the conditions of a scan", () => {
  it("[COMPILE.MODULE.SCAN] keeps the loop for a fold with two tests, an address or a test that is not an op", () => {
    const cases = [
      fold(axes.where(axes.where(axes.all, before), app("gt", ref("w"), lit(1))), { s: lit(0) }, { s: app("add", v("s"), ref("w")) }, v("s")),
      fold(axes.where(axes.all, before), { s: lit(0) }, { s: app("add", v("s"), ref("w")) }, v("s"), [offset(1)]),
      sumOf(let_({ k: ref("n", O) }, app("lt", ref("n"), v("k")))),
    ];
    for (const e of cases) for (const records of [MANY, SORTED]) expect(expectSame(e, records)).not.toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] keeps the loop for a test that does not read the target, or whose sides both read the target", () => {
    const cases = [sumOf(app("lt", lit(3), ref("n", O))), sumOf(app("lt", app("add", ref("n"), ref("n", O)), lit(6))), sumOf(app("lt", ref("n"), app("add", ref("n"), ref("n", O))))];
    for (const e of cases) for (const records of [MANY, SORTED]) expect(expectSame(e, records)).not.toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] keeps the loop when a value reads the origin, or when the first state reads the origin", () => {
    const cases = [
      sumOf(app("lt", app("add", ref("n"), ref("w", O)), ref("n", O))),
      fold(axes.where(axes.all, before), { s: ref("w", O) }, { s: app("add", v("s"), ref("w")) }, v("s")),
    ];
    for (const e of cases) for (const records of [MANY, SORTED]) expect(expectSame(e, records)).not.toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] keeps the loop for a list in a name or in the result", () => {
    // A name that appends to its own list has an owner. A name that takes a new list at each step has none.
    for (const s of [app("append", v("s"), one(ref("w"))), one(ref("w"))]) {
      const listName = fold(axes.where(axes.all, before), { s: one(lit(0)), c: lit(0) }, { s, c: app("add", v("c"), ref("w")) }, v("c"));
      for (const records of [MANY, SORTED]) expect(expectSame(listName, records)).not.toContain("PF(n,");
    }
    const listResult = emitModule(fold(axes.where(axes.all, before), { s: lit(0) }, { s: app("add", v("s"), ref("w")) }, one(v("s"))), OPTIONS);
    expect(listResult.ok && listResult.source).not.toContain("PF(n,");
    expect(listResult.ok).toBe(true);
  });

  it("[COMPILE.MODULE.SCAN] scans a test of two texts, and keeps the loop for a test of two booleans", () => {
    const options: ModuleOptions = { domains: [NumDomain, TEXTS, FLAGS], schema: MIXED_SCHEMA };
    expect(expectSame(sumOf(app("before", ref("s"), ref("s", O))), MIXED, options)).toContain("PF(n,");
    expect(expectSame(sumOf(app("before", ref("b"), ref("b", O))), MIXED, options)).not.toContain("PF(n,");
  });

  it("[COMPILE.MODULE.SCAN] keeps the loop for an op that no domain has, an op with a result that is not a boolean, and a boolean with a check", () => {
    const numbers = domainOf("Numbers", "number", { below: ["(a, b) => a < b", "number"], inside: ["(a, b) => { return a < b; }", "boolean"] });
    const strictFlags = domainOf("True", "boolean", {}, "(x) => typeof x === 'boolean'");
    const cases: readonly (readonly [Expr, ModuleOptions])[] = [
      [sumOf(app("or", ref("n"), ref("n", O))), OPTIONS],
      [sumOf(app("inside", ref("n"), ref("n", O))), { ...OPTIONS, domains: [numbers, NumDomain] }],
      [sumOf(before), { ...OPTIONS, domains: [NumDomain, strictFlags] }],
    ];
    for (const [e, options] of cases) expect(expectSame(e, MANY, options)).not.toContain("PF(n,");
    // The domain says that `below` gives a number, so the module checks each result as a number, and only the text tells.
    const below = emitModule(sumOf(app("below", ref("n"), ref("n", O))), { ...OPTIONS, domains: [numbers, NumDomain] });
    expect(below.ok && below.source).not.toContain("PF(n,");
    expect(below.ok).toBe(true);
  });

  it("[COMPILE.MODULE.SCAN] prints the functions of the scan as arrows, with a comma after each function but the last", () => {
    const source = expectSame(sumOf(before), MANY);
    expect(source).toMatch(/\n {4}\(j\d+\) => R\[j\d+\]\["n"\],\n {4}\(t, q\) => \(t\) < \(q\),\n/u);
    expect(source).toMatch(/\n {4}\}\n {2}\);\n/u);
  });

  it("[COMPILE.MODULE.SCAN] can fail, so ifError gives its second value for an error of a step", () => {
    const e = app("ifError", sumOf(before, app("add", v("s"), inverse(ref("w")))), lit(-1));
    for (const records of [MANY, SORTED]) expect(expectSame(e, records)).toContain("PF(n,");
  });
});

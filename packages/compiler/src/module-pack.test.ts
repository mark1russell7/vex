/**
 * The fast sum of a standalone module. A sum, a mean, a min or a max over all the records whose term reads values of
 * the record only through columns of the run reads the packs of these columns. One try covers all the items. Each test
 * compares the module with the interpreter (P17).
 */
import { app, axes, call, each, evaluate, fn, fold, let_, lit, rec, ref, space, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", w: "number" }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
/** Records without an error in the column of the need. */
const CLEAN = [
  { n: 3, w: 1 },
  { n: -1, w: 2 },
  { n: 2, w: 2.5 },
  { n: 0, w: -1 },
];
/** Thirty records. Where `w` is 0, the need of the record is an error. */
const MANY = Array.from({ length: 30 }, (_x, i) => ({ n: (i % 7) - 2, w: i % 6 === 0 ? 0 : (i % 4) + 0.5 }));

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr): string {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function compares the values of the module with the interpreter at each key (P17), and gives the source. */
function expectSame(e: Expr, records: readonly unknown[] = MANY): string {
  const source = sourceOf(e);
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: DOMAINS }));
  const m = make(source);
  expect(m.run(structuredClone(records), { a: 2 })).toStrictEqual(results.map((r) => (r.ok ? r.value : m.VEX_ERROR)));
  // Each pack in a loop is a read of the term: a pack that only a column read is not in the code.
  for (const [, local] of source.matchAll(/const (pk\d+) = /g)) expect(source).toContain(`${local as string}[`);
  return source;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const r = v("r");
/** The need of a record: enough work for a column of the run. `n / w` is an error where `w` is 0. */
const NEED = op("add", op("add", op("multiply", n, w), op("divide", n, w)), op("multiply", w, w));
/**
 * The functions of the tests, in three lets: a binding sees the functions of the lets outside it only. The step of a
 * record is an error for `r` = 1 only.
 */
const NEED_FN = { need: fn([], NEED) };
const STEP_FN = { step: fn(["r"], op("divide", call("need"), op("subtract", r, lit(1)))) };
const FNS: Readonly<Record<string, Expr>> = {
  total: fn(["r"], op("sum", each(axes.all, call("step", r)))),
  avg: fn(["r"], op("mean", each(axes.all, call("step", r)))),
  low: fn(["r"], op("min", each(axes.all, call("step", r)))),
  high: fn(["r"], op("max", each(axes.all, call("step", r)))),
  strict: fn(["r"], op("sum", each(axes.all, call("step", r)), lit({ strict: true }))),
};
const withFns = (body: Expr, fns: Readonly<Record<string, Expr>> = FNS): Expr => let_(NEED_FN, let_(STEP_FN, let_(fns, body)));
const packs = (source: string): number => [...source.matchAll(/QA\(n, col\d+\)/g)].length;

describe("the fast sum: a loop over the packs of the columns of the run", () => {
  it("a sum over all the records whose term reads a column through a call reads the pack of the column", () => {
    const source = expectSame(withFns(rec({ a: call("total", lit(3)), b: call("total", op("add", n, lit(3))) })));
    expect(source).toContain("function QA(n, f) {");
    expect(source).toMatch(/const (pk\d+) = (PK\d+) \|\| \(\2 = QA\(n, col\d+\)\);\n\s*for \(let (j\d+) = 0; \3 < n; \3\+\+\) \{\n\s*try \{\n\s*for \(; \3 < n; \3\+\+\) \{\n[^\n]*G\(\1\[\3\]\)/);
    expect(source).toContain("} catch {}");
    // The call of the step is the body of the step at the place of the call.
    expect(source).not.toMatch(/x\d+ = fn\d+\(/);
  });

  it("one pack of a column serves each loop and each parameter of a run", () => {
    const source = expectSame(withFns(rec({ a: call("total", lit(3)), b: call("avg", lit(4)), c: call("total", op("add", n, lit(4))) })));
    expect([...source.matchAll(/let PK\d+;/g)]).toHaveLength(1);
    expect(packs(source)).toBe(2);
  });

  it("a mean, a min and a max read the pack too, and an error item is not a value of them", () => {
    const source = expectSame(withFns(rec({ m: call("avg", lit(3)), lo: call("low", lit(3)), hi: call("high", op("add", n, lit(3))) })));
    expect(packs(source)).toBe(3);
    expectSame(withFns(rec({ m: call("avg", lit(3)), lo: call("low", lit(3)), hi: call("high", lit(-2)) })), CLEAN);
  });

  it("an error item of the column is skipped, and with strict it is an error of the sum", () => {
    const source = expectSame(withFns(rec({ a: call("total", lit(3)), s: call("strict", lit(3)) })));
    expect(source).toMatch(/try \{\n\s*for \(let (j\d+) = 0; \1 < n; \1\+\+\) \{\n[^]*?\} catch \{\n\s*F\(\);/);
    // Without an error item, the strict sum has a value.
    expectSame(withFns(rec({ s: call("strict", lit(3)) })), CLEAN);
  });

  it("a term that is an error for one parameter only skips each item at that parameter", () => {
    // At r = 1, each item is an error: the sum is 0, and the mean, the min and the max have no value.
    expectSame(withFns(rec({ a: call("total", lit(1)), b: call("total", lit(3)), m: call("avg", lit(1)), lo: call("low", lit(1)), s: call("strict", lit(1)) })), CLEAN);
    // The parameter of the origin is 1 at the record with n = -2 only.
    expectSame(withFns(rec({ a: call("total", op("add", n, lit(3))), m: call("high", op("add", n, lit(3))) })));
  });

  it("an empty collection gives no key, and the run does not fail", () => {
    const e = withFns(rec({ a: call("total", lit(3)), m: call("avg", lit(3)) }));
    expectSame(e, []);
    // A constant of the run evaluates at the start of the run, also with no record.
    expectSame(withFns(op("add", n, call("total", lit(3)))), []);
  });

  it("a sum at the key of the run and in a constant of the run reads the pack too", () => {
    const source = expectSame(rec({ a: op("sum", each(axes.all, NEED)), b: op("add", n, op("max", each(axes.all, NEED))) }));
    expect(packs(source)).toBe(2);
    expect([...source.matchAll(/let PK\d+;/g)]).toHaveLength(1);
  });

  it("each argument of a call evaluates once at the place of the call", () => {
    // A safe argument, a stored argument and a read of a parameter that can hold an error.
    const mix = { mix: fn(["p", "q", "s"], op("add", op("multiply", call("need"), v("p")), op("subtract", v("q"), v("s")))) };
    const sum3 = { sum3: fn(["r"], op("sum", each(axes.all, call("mix", lit(2), op("divide", lit(1), r), r)))) };
    const source = expectSame(let_(NEED_FN, let_(mix, let_(sum3, rec({ a: call("sum3", lit(4)), b: call("sum3", lit(0)), c: call("sum3", op("divide", lit(1), op("subtract", n, lit(1)))) })))));
    expect(packs(source)).toBe(1);
  });

  it("a column whose code reads other columns is one pack", () => {
    const outer = op("add", op("multiply", NEED, NEED), op("subtract", NEED, op("divide", lit(1), w)));
    const source = expectSame(rec({ a: op("sum", each(axes.all, outer)), b: op("sum", each(axes.all, op("multiply", outer, lit(3)))) }));
    expect(source).toMatch(/const pk\d+ = /);
  });
});

describe("the fast sum does not apply: the loop keeps a try for each item", () => {
  // Each term reads the parameter `r`, so the term is not a column itself. The need is a column in each case.
  const term = op("multiply", NEED, r);
  const cases: readonly (readonly [string, Expr])[] = [
    ["a term that reads the record outside a column", op("sum", each(axes.all, op("add", NEED, op("multiply", n, r))))],
    ["a term with no column", op("sum", each(axes.all, op("multiply", n, r)))],
    ["an axis with a test", op("sum", each(axes.where(axes.all, op("gt", n, lit(0))), term))],
    ["the reverse order: the order of a sum of numbers is a part of its value", op("sum", each(axes.reverse(axes.all), term))],
    ["the axis others", op("sum", each(axes.others, term))],
    ["reduce", op("reduce", each(axes.all, term), lit("add"))],
    ["count", op("count", each(axes.all, term))],
    ["a term with a loop", op("sum", each(axes.all, op("add", term, fold(axes.window(-1, 0), { s: lit(0) }, { s: op("add", v("s"), w) }, v("s")))))],
    ["a term with a function of its own", op("sum", each(axes.all, let_({ f: fn([], NEED) }, op("multiply", call("f"), r))))],
    ["a term of booleans", op("count", each(axes.where(axes.all, op("gt", term, lit(1))), n))],
  ];
  for (const [name, e] of cases) {
    it(name, () => {
      const source = expectSame(let_({ g: fn(["r"], e) }, rec({ a: call("g", lit(2)), b: call("g", lit(-1)) })));
      expect(source).not.toContain("QA(");
      expect(source).not.toContain("let PK");
    });
  }

  it("a call of a function at the place of its binding", () => {
    // The function reads the name `k`, which depends on the key, so it is at the place of its binding.
    const e = let_({ k: op("multiply", n, lit(2)) }, let_({ g: fn([], op("add", NEED, v("k"))) }, op("sum", each(axes.all, call("g")))));
    const source = expectSame(rec({ a: e }));
    expect(source).not.toContain("QA(");
  });

  it("a term whose column is in a function of a call", () => {
    // The column of `need * r` is a column of the call of `deep`: its value changes with r, so it has no pack.
    const fns = { deep: fn(["r"], op("sum", each(axes.all, op("add", op("multiply", NEED, r), op("sum", each(axes.all, op("multiply", NEED, r))))))) };
    const source = expectSame(let_(fns, rec({ a: call("deep", lit(2)) })), CLEAN);
    expect(source).not.toContain("QA(");
  });

  it("the second print puts at most 64 calls at their place, so a chain of calls stays linear", () => {
    // Each function calls the one before twice. With the call of need, the term of h5 has 64 calls, and h40 has more than 2 ** 40.
    const chain = (depth: number, term: (h: (i: number) => Expr) => Expr): Expr => {
      const h = (i: number): Expr => call(`h${String(i)}`, call("need"), r);
      let body: Expr = let_({ g: fn(["r"], op("sum", each(axes.all, term(h)))) }, rec({ a: call("g", lit(3)), b: call("g", lit(-2)) }));
      for (let i = depth; i >= 1; i--) {
        const before = (): Expr => call(`h${String(i - 1)}`, v("x"), r);
        body = let_({ [`h${String(i)}`]: fn(["x", "r"], op("add", before(), before())) }, body);
      }
      return let_(NEED_FN, let_({ h0: fn(["x", "r"], op("divide", v("x"), r)) }, body));
    };
    // 64 calls are not too many: the sum reads the pack.
    expect(expectSame(chain(5, (h) => h(5)), CLEAN)).toContain("QA(");
    // 65 calls are too many: the sum is the loop of today.
    expect(expectSame(chain(5, (h) => op("add", h(5), h(0))), CLEAN)).not.toContain("QA(");
    expect(expectSame(chain(40, (h) => h(40)), CLEAN)).not.toContain("QA(");
  });
});

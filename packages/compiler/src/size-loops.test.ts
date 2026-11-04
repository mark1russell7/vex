/**
 * The soundness of the check of sizes (LOOP.SIZE). The tests make programs, run each step, and compare the size of the
 * value with the bound. A family of steps that double stays refused, and tier 2 and the modules give the values of the
 * interpreter for the steps that the check accepts (P17).
 */
import { app, axes, call, each, evaluate, fn, fold, isVexList, iterate, let_, lit, rec, ref, sizeError, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, JsonDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

const DOMAINS = [NumDomain, BoolDomain, TextDomain, JsonDomain];
const RECORDS = Array.from({ length: 6 }, (_x, i) => ({ n: i }));
const DATA = space.array(RECORDS);
const NONE = lit(vexList([]));
const BIG = app("gt", ref("n"), lit(3));
/** A test that is true at each record, and that the check does not read. */
const ALWAYS = app("gt", ref("n"), lit(-1));
/** The number of steps of a run. A step that doubles gives 2^20 times the first size. */
const STEPS = 20;

const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const one = (x: Expr): Expr => app("fill", lit(1), x);
const row = (a: unknown, b: unknown): unknown => ({ a, b });
const nth = (x: Expr, i: number): Expr => app("nth", x, lit(i));
const at = (o: Expr, k: string): Expr => app("field", o, lit(k));
/** A list of rows. Each row has a list in the field `a` and a row in the field `b`. */
const ROWS = vexList([item("0", row(vexList([item("0", 1)]), row(vexList([item("0", 1)]), 2))), item("1", row(vexList([item("0", 2)]), row(vexList([]), 3)))]);
/** A list of lists. */
const LISTS = vexList([item("0", vexList([item("0", 1)])), item("1", vexList([item("0", 2), item("1", 3)])), item("2", vexList([]))]);

/** This function gives the size of a value: the number of its items, fields and characters at each level. */
function sizeOf(u: unknown): number {
  if (typeof u === "string") return u.length;
  if (typeof u !== "object" || u === null) return 0;
  if (isVexList(u)) return u.items.reduce((sum, x) => sum + 1 + x.key.length + (x.result.ok ? sizeOf(x.result.value) : 0), 0);
  return Object.entries(u).reduce((sum, [k, x]) => sum + 1 + k.length + sizeOf(x), 0);
}

/**
 * This function does the steps one at a time, without the check of the loop, and gives the largest size of the values.
 * The run stops at the first error, or when the size is above `cap`.
 */
function peak(start: Readonly<Record<string, unknown>>, steps: Readonly<Record<string, Expr>>, cap: number): number {
  let state = start;
  let largest = sizeOf(state);
  for (let t = 1; t <= STEPS && largest <= cap; t += 1) {
    const step = let_(Object.fromEntries(Object.entries(state).map(([name, value]) => [name, lit(value)])), rec(steps));
    const r = evaluate(step, { space: DATA, origin: String(t % RECORDS.length), domains: DOMAINS });
    if (!r.ok) return largest;
    state = r.value as Readonly<Record<string, unknown>>;
    largest = Math.max(largest, sizeOf(state));
  }
  return largest;
}

/** This function gives the arbitrary list and row of each depth up to `depth`. Each expression reads the names of the loop. */
function grammar(names: readonly string[], depth: number): fc.Arbitrary<Expr> {
  const name = fc.constantFrom(...names).map((x) => v(x));
  const index = fc.constantFrom(0, 1);
  let lists: fc.Arbitrary<Expr> = name;
  let rows: fc.Arbitrary<Expr> = fc.tuple(name, index).map(([x, i]) => nth(x, i));
  for (let d = 1; d <= depth; d += 1) {
    const L = lists;
    const R = rows;
    const element = `i${String(d)}`;
    const acc = `c${String(d)}`;
    rows = fc.oneof(
      fc.tuple(L, index).map(([x, i]) => nth(x, i)),
      L.map((x) => app("first", x)),
      fc.tuple(R, R).map(([a, b]) => rec({ a: at(a, "a"), b: at(b, "b") })),
      fc.tuple(R, R).map(([a, b]) => rec({ a: at(a, "a"), b })),
      fc.tuple(L, R).map(([a, b]) => rec({ a, b: at(b, "b") })),
      fc.tuple(R, R).map(([a, b]) => rec({ a: app("append", at(a, "a"), one(lit(1))), b: at(b, "b") })),
      R.map((x) => at(x, "b")),
    );
    lists = fc.oneof(
      name,
      fc.tuple(L, L).map(([a, b]) => app("append", a, b)),
      fc.tuple(L, R).map(([a, b]) => app("append", a, one(b))),
      fc.tuple(L, fc.constantFrom(1, 2, 3)).map(([x, k]) => app("take", x, lit(k))),
      L.map((x) => app("drop", x, lit(1))),
      fc.tuple(L, index, R).map(([x, i, value]) => app("setNth", x, lit(i), value)),
      fc.tuple(fc.constantFrom(1, 2), R).map(([k, x]) => app("fill", lit(k), x)),
      fc.tuple(L, L).map(([a, b]) => app("if", BIG, a, b)),
      L.map((x) => fold(axes.list(x), { [acc]: NONE }, { [acc]: app("append", v(acc), one(v(element))) }, v(acc), undefined, [element])),
      L.map((x) => each(axes.list(x), rec({ a: at(v(element), "a"), b: at(v(element), "b") }), undefined, [element])),
      fc.tuple(L, L).map(([a, b]) => app("append", a, app("take", b, lit(1)))),
    );
  }
  return lists;
}

/** The steps of a loop with the names `x` and `z`. */
const arbSteps = fc.record({ x: grammar(["x", "z"], 3), z: grammar(["x", "z"], 3) });
const arbStart = fc.constantFrom(ROWS, ROWS, vexList([]));

/** Steps that make a value of two copies of the old value, or of a part of it. */
const DOUBLES: readonly ((x: Expr) => Expr)[] = [
  (x) => app("append", x, x),
  (x) => app("fill", lit(2), x),
  (x) => app("append", x, one(x)),
  (x) => app("append", x, app("values", x)),
  (x) => app("append", x, app("keys", x)),
  (x) => app("append", x, app("take", x, app("count", x))),
  (x) => app("append", app("if", BIG, x, x), x),
  (x) => app("setNth", x, lit(0), app("append", nth(x, 0), nth(x, 0))),
  (x) => app("setNth", x, lit(0), rec({ a: nth(x, 0), b: nth(x, 0) })),
  (x) => app("append", x, fold(axes.list(x), { acc: NONE }, { acc: app("append", v("acc"), one(v("it"))) }, v("acc"), undefined, ["it"])),
  (x) => fold(axes.list(x), { acc: NONE }, { acc: app("append", app("append", v("acc"), one(v("it"))), one(v("it"))) }, v("acc"), undefined, ["it"]),
  (x) => app("flat", each(axes.list(x), app("fill", lit(2), v("it")), undefined, ["it"])),
  (x) => let_({ y: x }, app("append", x, v("y"))),
  (x) => let_({ f: fn(["p", "q"], app("append", v("p"), v("q"))) }, call("f", x, x)),
];
/** Forms that keep the two copies of the value. */
const WRAPS: readonly ((e: Expr, x: Expr) => Expr)[] = [
  (e) => e,
  (e) => let_({ y: e }, v("y")),
  (e) => let_({ f: fn(["p"], v("p")) }, call("f", e)),
  (e, x) => app("if", ALWAYS, e, x),
  (e, x) => app("ifError", e, x),
  (e) => app("append", e, one(lit(1))),
];

/** Programs with one name for each class that the check accepts. The modules read them. */
const ACCEPTED: Readonly<Record<string, Expr>> = {
  copy: fold(axes.all, { xs: app("fill", lit(0), lit(0)) }, { xs: fold(axes.list(app("append", v("xs"), one(ref("n")))), { acc: app("fill", lit(0), lit(0)) }, { acc: app("append", v("acc"), one(v("it"))) }, v("acc"), undefined, ["it"]) }, app("sum", v("xs"))),
  takes: fold(axes.all, { x: app("fill", lit(2), one(ref("n"))) }, { x: app("append", app("take", v("x"), lit(2)), app("take", v("x"), lit(3))) }, app("count", v("x"))),
  more: fold(axes.all, { x: app("fill", lit(2), one(ref("n"))) }, { x: app("append", v("x"), app("take", v("x"), lit(1))) }, app("count", v("x"))),
  item: fold(axes.all, { x: app("fill", lit(2), ref("n")) }, { x: app("append", app("append", v("x"), one(app("first", v("x")))), one(nth(v("x"), 1))) }, app("sum", v("x"))),
  swap: fold(axes.all, { a: one(ref("n")), b: app("fill", lit(2), ref("n")) }, { a: app("if", BIG, v("b"), v("a")), b: app("if", BIG, v("a"), v("b")) }, app("sum", v("a"))),
};

/** This function makes the module of a source with `new Function`. */
function make(source: string): (records: unknown, vars: unknown) => unknown {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn run;`)() as (records: unknown, vars: unknown) => unknown;
}

describe("the bound of the values of a loop (LOOP.SIZE)", () => {
  it("LOOP.SIZE: the size of each value of an accepted step stays under the bound", () => {
    let accepted = 0;
    fc.assert(
      fc.property(arbSteps, arbStart, (steps, start) => {
        const state = { x: start, z: start };
        const e = iterate(STEPS, { x: lit(start), z: lit(start) }, steps, v("x"));
        if (sizeError(e, { domains: DOMAINS }) !== undefined) return;
        accepted += 1;
        // Two names can each add the other at each step, so the bound has a power of the number of steps.
        const bound = (sizeOf(state) + 8) * (STEPS + 1) ** 3;
        expect(peak(state, steps, bound)).toBeLessThanOrEqual(bound);
      }),
      { numRuns: 120 },
    );
    expect(accepted).toBeGreaterThan(20);
  });

  it("LOOP.SIZE: the check refuses each step that doubles a value, and each step of the family doubles a value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DOUBLES), fc.constantFrom(...WRAPS), (double, wrap) => {
        const step = wrap(double(v("x")), v("x"));
        expect(sizeError(iterate(STEPS, { x: lit(LISTS) }, { x: step }, v("x")), { domains: DOMAINS })).toContain("(LOOP.SIZE)");
        expect(peak({ x: LISTS }, { x: step }, 2 ** 14)).toBeGreaterThan(2 ** 14);
      }),
      { numRuns: 80 },
    );
  });
});

describe("the steps that the check accepts in the tiers (P17)", () => {
  it("P17 LOOP.SIZE: tier 2 gives the values of the interpreter for each accepted step", () => {
    fc.assert(
      fc.property(arbSteps, arbStart, (steps, start) => {
        const e = iterate(4, { x: lit(start), z: lit(start) }, steps, v("x"));
        const program = tiered(e, { domains: DOMAINS });
        for (const origin of ["0", "5"]) expect(program.run({ space: DATA, origin })).toEqual(evaluate(e, { space: DATA, origin, domains: DOMAINS }));
      }),
      { numRuns: 60 },
    );
  });

  it.each(Object.keys(ACCEPTED))("P17 LOOP.SIZE.COPY LOOP.SIZE.PART: the module of the class %s gives the values of the interpreter", (name) => {
    const e = ACCEPTED[name];
    const options: ModuleOptions = { domains: DOMAINS, schema: { fields: { n: "number" } } };
    expect(sizeError(e, { domains: DOMAINS })).toBeUndefined();
    const emitted = emitModule(e, options);
    if (!emitted.ok) throw new Error(emitted.reason);
    const values = DATA.keys.map((origin) => evaluate(e, { space: DATA, origin, domains: DOMAINS }));
    expect(make(emitted.source)(RECORDS, {})).toStrictEqual(values.map((r) => (r.ok ? r.value : undefined)));
  });
});

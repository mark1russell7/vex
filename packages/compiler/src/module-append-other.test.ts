/**
 * More steps that append to the list of their name in a standalone module (COMPILE.MODULE.APPEND.OTHER,
 * COMPILE.MODULE.APPEND.LATE). A branch of a step can give another list, and a `let` can give the list to a new name
 * that the body appends to. A step of another name can read the list after the step of the name. Then the module prints
 * the step of the name after that read. The values and the errors stay those of the interpreter (P17).
 */
import { app, axes, each, evaluate, fold, isVexList, iterate, let_, lit, rec, ref, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const VARS = { a: 1 };

/** The records of the tests. The record with `w` 0 gives an error of `divide`. */
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true },
  { id: "2", n: -1, w: 0, b: false },
  { id: "0", n: 2, w: 2.5, b: true },
  { id: "x", n: 0, w: -1, b: false },
];
/** Twelve records with no zero `w`. Some steps of `b` give another list, and the other steps append. */
const MANY = Array.from({ length: 12 }, (_x, i) => ({ id: String(i), n: (i % 5) - 1, w: (i % 3) + 1, b: i % 4 === 0 }));

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, fuse = true): string {
  const m = emitModule(e, { ...OPTIONS, fuse });
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/**
 * This function compares the values of a module with the interpreter at each key (P17). It runs the module two times
 * on the same input, and the input must not change. It gives the source of the module.
 */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS, fuse = true): string {
  const source = sourceOf(e, fuse);
  const m = make(source);
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars: VARS, domains: OPTIONS.domains ?? [] });
    return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
  });
  const input = structuredClone(records);
  expect(m.run(input, VARS)).toStrictEqual(expected);
  expect(m.run(input, VARS)).toStrictEqual(expected);
  expect(input).toStrictEqual(records);
  return source;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const b = ref("b");
const acc = v("acc");
const base = v("base");
const strict = lit({ strict: true });
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });
/** The list of one value (LIST.FILL), and an empty list of numbers. */
const one = (x: Expr): Expr => op("fill", lit(1), x);
const NONE = op("fill", lit(0), lit(0));
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const BAD = lit(vexList([item("a", 1), errorItem("b"), item("c", 4)]));
/** The values of each record, with an error item where `w` is 0. */
const inv = each(axes.all, op("divide", lit(1), w));
/** The items of a list that are more than 1, as `keep` of the shapes pilot: a filter by `flat` over an each. */
const kept = (l: Expr): Expr => op("flat", each(axes.list(l), op("if", op("gt", v("y"), lit(1)), one(v("y")), NONE), undefined, ["y"]));
/** The sum of a list by a fold over the axis `list`. */
const sumOf = (l: Expr): Expr => fold(axes.list(l), { s: lit(0) }, { s: op("add", v("s"), v("x")) }, v("s"), undefined, ["x"]);
/** A fold over all records with the one name `acc`. */
const folded = (init: Expr, step: Expr, result: Expr = acc): Expr => fold(axes.all, { acc: init }, { acc: step }, result);
/** A fold over all records whose step of `acc` comes before the step of `r`. Thus `r` reads the list after the step. */
const readAfter = (init: Expr, step: Expr, reader: Expr, first: Expr = lit(0)): Expr => fold(axes.all, { acc: init, r: first }, { acc: step, r: reader }, rec({ acc, r: v("r") }));

/** The lists of a branch that give another list. Each one reads the old list in another way. */
const OTHERS: readonly Expr[] = [kept(acc), op("take", acc, lit(2)), each(axes.list(acc), op("multiply", v("y"), lit(2)), undefined, ["y"]), op("sortBy", acc), LIT, NONE];
/** The readers of a later step: each value is a number (COMPILE.MODULE.APPEND.READ). */
const READERS: readonly Expr[] = [op("count", acc), op("ifError", op("first", acc), lit(-1)), op("ifError", op("nth", acc, lit(1)), lit(-1)), sumOf(acc), op("add", op("count", acc, strict), sumOf(acc))];

/** The count of the appends of the source into the array of a loop: an `AO` or `AOC` into `wN`, or a push into `wN`. */
const owned = (source: string): number => (source.match(/\(w\d+ = AOC?\(|\.push\(\[0, .*?\]\), w\d+\)/g) ?? []).length;
/** The source copies a list into the output of a fused chain: a loop that pushes each item of an array. */
const copies = (source: string): boolean => /for \(let i = 0; i < \w+\.length; i\+\+\) o\d+\.push\(\w+\[i\]\);/.test(source);

describe("COMPILE.MODULE.APPEND.OTHER: a branch of the step gives another list", () => {
  it("COMPILE.MODULE.APPEND.OTHER: a branch that reads the old list, and a let whose body appends to the new name, append into the array (P17)", () => {
    // With fuse false, each form keeps the print of the version before fusion (COMPILE.MODULE.FUSE.OFF).
    // The open list of the sweep of the shapes pilot: a filter at a new position, and an append at each start.
    const sweep = folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("if", op("gt", n, lit(-1)), op("append", base, one(n)), base)));
    const forms: Record<string, Expr> = {
      ...Object.fromEntries(OTHERS.map((x, i) => [`branch${String(i)}`, folded(NONE, op("if", b, x, op("append", acc, one(n))))])),
      ...Object.fromEntries(OTHERS.map((x, i) => [`relay${String(i)}`, folded(LIT, let_({ base: op("if", b, x, acc) }, op("if", op("gt", n, lit(0)), op("append", base, one(n)), base)))])),
      sweep,
      errors: folded(inv, let_({ base: op("if", b, op("take", acc, lit(1)), acc) }, op("append", base, BAD))),
      strict: folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("append", base, one(op("divide", lit(1), w)), strict))),
      chain: folded(NONE, op("append", op("if", b, kept(acc), op("append", acc, one(w))), one(n))),
      iterated: iterate(5, { acc: LIT }, { acc: let_({ base: op("if", op("gt", op("count", LIT), lit(9)), kept(acc), acc) }, op("append", base, one(lit(4)))) }, acc),
    };
    for (const [name, e] of Object.entries(forms)) {
      for (const fuse of [true, false]) for (const records of [RECORDS, MANY, []]) expect({ name, fuse, owns: owned(expectSame(e, records, fuse)) > 0 }).toStrictEqual({ name, fuse, owns: fuse });
    }
    // A branch can give another list, so an append keeps the check of its array (COMPILE.MODULE.FUSE.ADOPT).
    const source = sourceOf(sweep);
    expect(source).toMatch(/\(w\d+ = AOC\(/);
    expect(source).not.toMatch(/\(l\d+\.push\(\[0, .*?\]\), w\d+\)/);
    expect(copies(source)).toBe(false);
  });

  it("COMPILE.MODULE.APPEND.OTHER: a step with no append, a test that reads the name and a body that reads the old list keep the old print", () => {
    const sameName = folded(NONE, let_({ acc: op("if", b, kept(acc), acc) }, op("append", acc, one(n))));
    const fallBacks: Record<string, Expr> = {
      noAppend: folded(LIT, op("if", b, kept(acc), acc)),
      test: folded(NONE, op("if", op("gt", op("count", acc), lit(2)), kept(acc), op("append", acc, one(n)))),
      sameName,
      readsBody: folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("append", base, one(op("count", acc))))),
      // No branch reads the name, so the step does not read it. A column outside the loop then prints the step.
      noRead: folded(NONE, op("append", let_({ base: NONE }, op("if", b, op("append", base, one(n)), base)), one(n))),
    };
    for (const [name, e] of Object.entries(fallBacks)) {
      for (const records of [RECORDS, MANY]) expect({ name, owns: owned(expectSame(e, records)) }).toStrictEqual({ name, owns: 0 });
    }
    // A let that binds the name itself is not a relay. Its append keeps the fused copy.
    expect(copies(sourceOf(sameName))).toBe(true);
  });
});

describe("COMPILE.MODULE.APPEND.LATE: a step after the step of the name reads the list", () => {
  it("COMPILE.MODULE.APPEND.LATE: the step of the name prints after the read, and it appends into the array (P17)", () => {
    const steps = [op("append", acc, one(n)), op("if", b, kept(acc), op("append", acc, one(w))), let_({ base: op("if", b, op("take", acc, lit(1)), acc) }, op("append", base, one(n)))];
    for (const [i, reader] of READERS.entries()) {
      for (const [j, step] of steps.entries()) {
        for (const init of [NONE, LIT, inv]) {
          const e = readAfter(init, step, reader);
          for (const fuse of [true, false]) for (const records of [RECORDS, MANY, []]) expect({ i, j, fuse, owns: owned(expectSame(e, records, fuse)) > 0 }).toStrictEqual({ i, j, fuse, owns: fuse });
        }
      }
    }
    // The count of the step `r` comes before the append in the text of the loop.
    const source = sourceOf(readAfter(NONE, op("append", acc, one(n)), op("count", acc)));
    const read = source.search(/const t\d+ = \(?l\d+\.length\)?;/);
    expect(read).toBeGreaterThan(0);
    expect(source.indexOf(".push([0, ")).toBeGreaterThan(read);
    const iterated = iterate(4, { acc: LIT, r: lit(0) }, { acc: op("append", acc, one(v("r"))), r: op("add", v("r"), sumOf(acc)) }, rec({ acc, r: v("r") }));
    expect(owned(expectSame(iterated))).toBeGreaterThan(0);
  });

  it("COMPILE.MODULE.APPEND.LATE: a later read that holds the list, a read in until and an order that breaks another owner keep the copy", () => {
    const step = op("append", acc, one(n));
    const fallBacks: Record<string, Expr> = {
      holds: readAfter(NONE, step, acc, NONE),
      take: readAfter(NONE, step, op("take", acc, lit(1)), NONE),
      each: readAfter(NONE, step, each(axes.list(acc), v("y"), undefined, ["y"]), NONE),
      until: iterate(4, { acc: LIT, r: lit(0) }, { acc: op("append", acc, one(lit(1))), r: op("count", acc) }, rec({ acc, r: v("r") }), op("gt", op("count", acc), lit(5))),
    };
    for (const [name, e] of Object.entries(fallBacks)) {
      for (const records of [RECORDS, MANY]) expect({ name, owns: owned(expectSame(e, records)) }).toStrictEqual({ name, owns: 0 });
    }
    // `q` reads `p` before the step of `p`, and `r` reads `q` after the step of `q`. Thus `q` cannot print last, and only `p` appends in place.
    const q = v("q");
    const p = v("p");
    const e = fold(axes.all, { q: NONE, p: NONE, r: lit(0) }, { q: op("append", q, one(op("count", p))), p: op("append", p, one(n)), r: op("count", q) }, rec({ q, p, r: v("r") }));
    for (const records of [RECORDS, MANY]) expect(owned(expectSame(e, records))).toBe(1);
    // `s` reads `r` after the step of `r`, so `r` prints last. `r` reads `a`, so `a` cannot push before it, and only `r` appends in place.
    const [rr, aa] = [v("r"), v("a")];
    const order = fold(axes.all, { r: NONE, a: NONE, s: lit(0) }, { r: op("append", rr, one(op("count", aa))), a: op("if", b, kept(aa), op("append", aa, one(n))), s: op("count", rr) }, rec({ r: rr, a: aa, s: v("s") }));
    for (const records of [RECORDS, MANY]) expect(owned(expectSame(order, records))).toBe(1);
  });
});

describe("COMPILE.MODULE.APPEND.OTHER COMPILE.MODULE.APPEND.LATE P17: random steps and readers", () => {
  it("COMPILE.MODULE.APPEND.OTHER COMPILE.MODULE.APPEND.LATE P17: random branches, lets and later readers give the values of the interpreter", () => {
    const X = [one(n), one(op("divide", lit(1), w)), LIT, BAD, inv];
    const steps = fc.letrec<{ step: Expr }>((tie) => ({
      step: fc.oneof(
        { maxDepth: 3, depthSize: "small" },
        fc.constant(acc),
        fc.constantFrom(...OTHERS),
        { arbitrary: fc.tuple(tie("step"), fc.constantFrom(...X), fc.boolean()).map(([h, x, s]) => op("append", h, x, ...(s ? [strict] : []))), weight: 3 },
        fc.tuple(fc.constantFrom(b, op("gt", n, lit(0))), tie("step"), tie("step")).map(([c, yes, no]) => op("if", c, yes, no)),
        { arbitrary: fc.tuple(tie("step"), fc.constantFrom(...X)).map(([x, y]) => let_({ base: x }, op("if", b, op("append", base, y), base))), weight: 2 },
      ),
    })).step;
    const readers = fc.constantFrom(lit(0), ...READERS);
    const loops = fc.tuple(fc.boolean(), fc.boolean(), fc.constantFrom(NONE, LIT, BAD, inv), readers, steps).map(([isFold, late, init, reader, step]) => {
      const names = late ? { acc: step, r: reader } : { r: reader, acc: step };
      return isFold ? fold(axes.all, { r: lit(0), acc: init }, names, rec({ acc, r: v("r") })) : iterate(3, { r: lit(0), acc: init }, names, rec({ acc, r: v("r") }));
    });
    let modules = 0;
    let runs = 0;
    fc.assert(
      fc.property(loops, fc.constantFrom(RECORDS, MANY), (e, records) => {
        runs++;
        if (!emitModule(e, OPTIONS).ok) return;
        modules++;
        expectSame(e, records);
        expectSame(e, records, false);
      }),
    );
    expect(modules).toBeGreaterThan(runs / 2);
  });
});

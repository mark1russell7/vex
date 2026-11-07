/**
 * More steps that append to the list of their name in a standalone module (COMPILE.MODULE.APPEND.OTHER,
 * COMPILE.MODULE.APPEND.LATE). A branch of a step can give another list, and a `let` can give the list to a new name
 * that the body appends to. A step of another name can read the list after the step of the name. Then the module prints
 * the step of the name after that read. A filter of the list in a branch works in place (COMPILE.MODULE.APPEND.KEEP).
 * The values and the errors stay those of the interpreter (P17).
 */
import { app, axes, call, defineDomain, each, fn, evaluate, fold, isVexList, iterate, let_, lit, rec, ref, space, v, vexList, type Expr, type ListItem, type VexList } from "@mark1russell7/vex";
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
/** A domain whose op `weigh` takes a list after its receiver (COMPILE.MODULE.LIST.ARG). It adds the values of the items to the receiver. */
const WeighDomain = defineDomain({
  name: "Weigh",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  fromScalar: (x: number): number => x,
  ops: { weigh: { fn: (a: number, l: VexList): number => l.items.reduce((s, x) => s + (x.result.ok ? (x.result.value as number) : -1), a), params: ["any"], returns: "number" } },
});
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain, WeighDomain], schema: SCHEMA };
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

/**
 * The count of the appends of the source into the array of a loop: an `AO`, `AOC`, `AI` or `AIC` into `wN`, a push into
 * `wN`, or a target of the pushes of COMPILE.MODULE.APPEND.PUSH: `AW`, `AWC` or the list of the name.
 */
const owned = (source: string): number => (source.match(/\(w\d+ = A[OI]C?\(|\.push\(\[0, .*?\]\), w\d+\)|const o\d+ = (?:AWC?\(|l\d+;)/g) ?? []).length;
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
    // A branch can give another list, so an append keeps the check of its array (COMPILE.MODULE.FUSE.ADOPT). AIC pushes
    // the one item, and fill makes no list (COMPILE.MODULE.APPEND.PUSH).
    const source = sourceOf(sweep);
    expect(source).toMatch(/\(w\d+ = AIC\(t\d+, \[0, /);
    expect(source).not.toContain("FI(");
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

describe("COMPILE.MODULE.APPEND.PUSH: an append of an owner pushes the items of a list that a fused loop pushes", () => {
  it("COMPILE.MODULE.APPEND.PUSH: fill(1, x), a chain of append and an if put their items into the target, with no list of their own (P17)", () => {
    const fails = one(op("divide", lit(1), w));
    const rights: Record<string, Expr> = {
      one: one(n),
      fails,
      chain: op("append", one(n), one(w)),
      chainFails: op("append", one(n), fails),
      // A node with more work can be a column of the run, so it keeps its array (#stageOf). This branch has less work.
      branch: op("if", b, one(n), NONE),
      window: op("flat", each(axes.window(-1, 1), one(n))),
    };
    for (const [name, x] of Object.entries(rights)) {
      for (const s of [[], [strict]]) {
        const add = (l: Expr): Expr => op("append", l, x, ...s);
        const forms: Record<string, Expr> = {
          own: folded(NONE, add(acc)),
          other: folded(NONE, op("if", b, kept(acc), add(acc))),
          relay: folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("if", op("gt", n, lit(-1)), add(base), base))),
          literal: folded(LIT, op("if", b, op("take", acc, lit(2)), add(acc))),
          errors: folded(inv, let_({ base: op("if", b, op("take", acc, lit(1)), acc) }, add(base))),
          bad: folded(BAD, add(acc)),
          iterated: iterate(4, { acc: LIT }, { acc: let_({ base: op("if", op("gt", n, lit(0)), kept(acc), acc) }, add(base)) }, acc),
        };
        for (const [form, e] of Object.entries(forms)) {
          for (const records of [RECORDS, MANY, []]) {
            const source = expectSame(e, records);
            // fill makes no list at the append, and no append copies its two lists with concat.
            expect({ name, form, owns: owned(source) > 0, fill: source.includes("FI("), concat: source.includes(".concat(") }).toStrictEqual({ name, form, owns: true, fill: false, concat: false });
            expectSame(e, records, false);
          }
        }
      }
    }
  });

  it("COMPILE.MODULE.APPEND.PUSH: a first list that is another array gets one copy, and the array of the loop gets each push", () => {
    // The sweep of the shapes pilot: the filter is the array w (COMPILE.MODULE.APPEND.KEEP), but AIC keeps its check of w.
    const sweep = folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("if", op("gt", n, lit(-1)), op("append", base, one(n)), base)));
    expect(sourceOf(sweep)).toMatch(/\(w\d+ = AIC\(t\d+, \[0, R\[j\d+\]\["n"\]\], w\d+\)\)/);
    // A chain of two items prints its pushes into the target of AWC, and the target goes into w after the last push.
    const chain = sourceOf(folded(NONE, op("if", b, kept(acc), op("append", acc, op("append", one(n), one(w))))));
    expect(chain).toMatch(/const (o\d+) = AWC\(l\d+, (w\d+)\);\n\s*\1\.push\(\[0, R\[j\d+\]\["n"\]\]\);\n\s*\1\.push\(\[0, R\[j\d+\]\["w"\]\]\);\n\s*\2 = \1;/);
    // A list with error items gets the copy of AW without them, or with strict the error.
    const errors = sourceOf(folded(inv, op("if", b, op("take", acc, lit(1)), op("append", acc, one(n), strict))));
    expect(errors).toMatch(/\(w\d+ = AI\(l\d+, \[0, R\[j\d+\]\["n"\]\], true, w\d+\)\)/);
    for (const records of [RECORDS, MANY]) expectSame(folded(inv, op("if", b, op("take", acc, lit(1)), op("append", acc, one(n), strict))), records);
    // The step of a name that takes its first list is sure, so its pushes need no target of AWC.
    const sure = sourceOf(folded(NONE, op("append", acc, op("append", one(n), one(w)))));
    expect(sure).not.toMatch(/AWC?\(/);
    expect(sure).toMatch(/const (o\d+) = l\d+;\n\s*\1\.push\(\[0, /);
  });
});

/** This function gives a filter of the list `l`: an item `y` that passes `test` gives the list `body`, and each other item none. */
const keep = (l: Expr, test: Expr, body: Expr = one(v("y")), ...s: Expr[]): Expr => op("flat", each(axes.list(l), op("if", test, body, NONE), undefined, ["y"]), ...s);
const y = v("y");
/** The tests of a filter: none of the items, some of them and each of them pass. */
const PASS: Readonly<Record<"none" | "some" | "all", Expr>> = { none: op("gt", y, lit(99)), some: op("gt", y, lit(1)), all: op("gt", y, lit(-99)) };
/** A filter in place: the output of the filter starts as the array of the loop, and KS sets its length after the loop. */
const inPlace = (source: string): boolean => /const (o\d+) = (l\d+) === w\d+ \? \2 : \[\];/.test(source) && source.includes("KS(");

describe("COMPILE.MODULE.APPEND.KEEP: a filter of the list of the name in a branch of the step works in place", () => {
  it("COMPILE.MODULE.APPEND.KEEP: a filter that keeps none, some or each item moves the kept items down in the array of the loop (P17)", () => {
    const bodies: Readonly<Record<string, Expr>> = {
      // The item keeps its pair, because the key of fill is the key of the item.
      item: one(y),
      value: one(op("multiply", y, lit(2))),
      fails: one(op("divide", lit(1), op("subtract", y, lit(2)))),
      literal: lit(vexList([item("k", 7)])),
      branch: op("if", op("gt", y, lit(3)), one(y), lit(vexList([item("k", 5)]))),
    };
    for (const [pass, test] of Object.entries(PASS)) {
      for (const [name, body] of Object.entries(bodies)) {
        for (const s of [[], [strict]]) {
          const filter = keep(acc, test, body, ...s);
          const forms: Record<string, Expr> = {
            sweep: folded(NONE, let_({ base: op("if", b, filter, acc) }, op("if", op("gt", n, lit(-1)), op("append", base, one(n)), base))),
            branch: folded(NONE, op("if", b, filter, op("append", acc, one(n)))),
            errors: folded(inv, let_({ base: op("if", b, filter, acc) }, op("append", base, BAD))),
            literal: folded(LIT, let_({ base: op("if", op("gt", n, lit(0)), filter, acc) }, op("append", base, one(n)))),
            iterated: iterate(6, { acc: LIT }, { acc: let_({ base: op("if", op("gt", n, lit(0)), filter, acc) }, op("append", base, one(lit(4)))) }, acc),
          };
          for (const [form, e] of Object.entries(forms)) {
            for (const records of [RECORDS, MANY, []]) {
              expect({ pass, name, form, place: inPlace(expectSame(e, records)) }).toStrictEqual({ pass, name, form, place: true });
              // With fuse false, the filter makes a new array (COMPILE.MODULE.FUSE.OFF).
              expect({ pass, name, form, place: inPlace(expectSame(e, records, false)) }).toStrictEqual({ pass, name, form, place: false });
            }
          }
        }
      }
    }
  });

  it("COMPILE.MODULE.APPEND.KEEP: the filter of the sweep puts the kept pair at the next position, with no undo and no copy", () => {
    const sweep = folded(NONE, let_({ base: op("if", b, kept(acc), acc) }, op("if", op("gt", n, lit(-1)), op("append", base, one(n)), base)));
    const source = sourceOf(sweep);
    expect(source).toMatch(/const (o\d+) = (l\d+) === (w\d+) \? \2 : \[\];\n\s*let (n\d+) = 0;[\s\S]*?\1\[\4\+\+\] = \2\[q\d+\]\[0\] === 0 \? \2\[q\d+\] : \[0, y\d+\];[\s\S]*?KS\(\1, \4\);/);
    expect(source).not.toMatch(/\.length = m\d+;/);
    // A new value of the item gets a new pair. A value that can fail increments n after the put, as the old undo.
    const value = (x: Expr): string => sourceOf(folded(NONE, op("if", b, keep(acc, PASS.some, one(x)), op("append", acc, one(n)))));
    expect(value(op("multiply", y, lit(2)))).toMatch(/(o\d+)\[(n\d+)\] = \[0, k_number\(.*\]; \2\+\+;/);
    expect(value(lit(5))).toMatch(/o\d+\[n\d+\+\+\] = \[0, 5\];/);
    // The item of a literal list is a pair of its array, so the filter puts that pair.
    const literal = sourceOf(folded(NONE, op("if", b, keep(acc, PASS.some, lit(vexList([item("k", 7)]))), op("append", acc, one(n)))));
    expect(literal).toMatch(/(o\d+)\[(n\d+)\+\+\] = (c\d+)\[i\];/);
    expect(literal).not.toMatch(/o\d+\.push\(c\d+\[i\]\)/);
    // With fuse false, the print has no filter in place.
    const off = sourceOf(sweep, false);
    expect(off).not.toContain("KS(");
    expect(off).not.toMatch(/=== w\d+ \?/);
  });

  it("COMPILE.MODULE.APPEND.KEEP: a filter of another list, a read of the old list in the step and a body of many items make a new array", () => {
    const filter = kept(acc);
    const forms: Record<string, Expr> = {
      // The filter goes over another list, so its output is a new array.
      other: folded(NONE, let_({ base: op("if", b, kept(op("take", acc, lit(3))), acc) }, op("append", base, one(n)))),
      literal: folded(NONE, let_({ base: op("if", b, kept(LIT), acc) }, op("append", base, one(n)))),
      // The step reads the old list after the filter, so the name is not an owner.
      after: folded(NONE, op("append", op("if", b, filter, acc), one(op("count", acc)))),
      body: folded(NONE, let_({ base: op("if", b, filter, acc) }, op("append", base, one(op("count", acc))))),
      // The body of the filter reads the old list, or it is a list op with at most one item.
      reads: folded(NONE, op("if", b, keep(acc, op("gt", y, op("count", acc))), op("append", acc, one(n)))),
      take: folded(NONE, op("if", b, keep(acc, PASS.some, op("take", LIT, lit(1))), op("append", acc, one(n)))),
      // A filter in a let of the step is not a branch of another list.
      bound: folded(NONE, let_({ k: filter }, op("if", b, v("k"), op("append", acc, one(n))))),
    };
    for (const [name, e] of Object.entries(forms)) {
      for (const records of [RECORDS, MANY, []]) expect({ name, place: inPlace(expectSame(e, records)) }).toStrictEqual({ name, place: false });
    }
    // A function with the parameter acc shares the node of the filter. Only the step puts the items in place.
    const shared = let_({ f: fn(["acc"], filter) }, fold(axes.all, { acc: NONE }, { acc: op("if", b, filter, op("append", acc, one(n))) }, rec({ acc, f: call("f", LIT) })));
    for (const records of [RECORDS, MANY]) expect(expectSame(shared, records).match(/KS\(o\d+/g)).toHaveLength(1);
  });

  it("COMPILE.MODULE.APPEND.KEEP V-096: a read of the array with get or in an argument before a filter in place reads the kept items", () => {
    // A branch reads the array of the loop with the index of get or the vex.list of an argument. A later filter
    // compacts the array, and a push brings back the count. KS removes the two caches, so the reads see the new items.
    const all = v("all");
    const later = op("if", op("gt", n, lit(1)), lit(vexList([item("c", 5)])), one(n));
    const tests: Readonly<Record<string, Expr>> = {
      get: op("gt", op("ifError", op("get", all, lit("c")), lit(-1)), lit(4)),
      first: op("gt", op("ifError", op("get", all, lit("0")), lit(-1)), lit(2)),
      argument: op("gt", op("weigh", lit(0), all), lit(6)),
    };
    const records = Array.from({ length: 30 }, (_x, i) => ({ id: String(i), n: (i * 7) % 5, w: 1, b: i % 3 === 2 }));
    for (const [name, test] of Object.entries(tests)) {
      const step = op("if", b, kept(acc), let_({ all: op("append", acc, later) }, op("if", test, op("take", all, lit(3)), all)));
      const e = folded(NONE, step, rec({ l: acc, s: op("weigh", lit(0), acc) }));
      for (const x of [RECORDS, MANY, records]) expect({ name, place: inPlace(expectSame(e, x)) }).toStrictEqual({ name, place: true });
      expectSame(e, records, false);
    }
  });
});

/**
 * Appends to the list of a name of a loop in a standalone module (COMPILE.MODULE.APPEND.OWN). A step that appends to
 * its own list copies the list once and then adds to the copy. Thus a fold that appends costs O(n), not O(n squared).
 * Also, `count` and `first` read the items with values that `nth` keeps (COMPILE.MODULE.NTH.INDEX).
 */
import { app, axes, call, each, evaluate, fn, fold, isVexList, iterate, let_, lit, rec, ref, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean", xs: { list: "number" } }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const VARS = { a: 1 };

/** This function gives a good item of a list, as plain data. */
const plain = (key: string, value: unknown): object => ({ key, result: { ok: true, value } });
/** This function gives an error item of a list, as plain data. */
const plainBad = (key: string): object => ({ key, result: { ok: false, error: { code: "#VALUE!", kind: "value", message: "no value", path: [] } } });
/** This function gives a `vex.list` of items, as plain data. */
const list = (...items: object[]): object => ({ kind: "vex.list", items });

/** The records of the tests. The record with `w` 0 gives an error item in `inv`, and a list of `xs` has an error item. */
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true, xs: list(plain("a", 3), plain("b", 1)) },
  { id: "2", n: -1, w: 0, b: false, xs: list(plain("a", 5), plainBad("b"), plain("c", -1)) },
  { id: "0", n: 2, w: 2.5, b: true, xs: list() },
  { id: "x", n: 0, w: -1, b: false, xs: list(plain("only", 7)) },
];
/** Twelve records with no zero `w`, so a fold over them has no error of a step. */
const MANY = Array.from({ length: 12 }, (_x, i) => ({ id: String(i), n: (i % 5) - 2, w: (i % 3) + 1, b: i % 2 === 0, xs: list(plain("k", i), ...(i % 4 === 0 ? [plainBad("e")] : [])) }));

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
const xs = ref("xs");
const acc = v("acc");
const strict = lit({ strict: true });
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });
/** The list of one value (LIST.FILL), and an empty list of numbers. */
const one = (x: Expr): Expr => op("fill", lit(1), x);
const NONE = op("fill", lit(0), lit(0));
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const BAD = lit(vexList([item("a", 1), errorItem("b"), item("c", 4)]));
const LEADING = lit(vexList([errorItem("z"), item("a", 5)]));
/** The values of each record, with an error item where `w` is 0. */
const inv = each(axes.all, op("divide", lit(1), w));
const guard = (e: Expr, x = -1): Expr => op("ifError", e, lit(x));
/** A fold over all records with the one name `acc`. */
const folded = (init: Expr, step: Expr, result: Expr = acc): Expr => fold(axes.all, { acc: init }, { acc: step }, result);

/**
 * This function runs `body` and gives the sum of `measure` over each call of `Array.prototype.filter` and
 * `Array.prototype.some`. These are the two scans of the items of a list. An assertion calls them too, so `body` has no
 * assertion.
 */
function scanReads(body: () => void, measure: (l: readonly unknown[]) => number): number {
  const saved = (["filter", "some"] as const).map((name) => [name, Object.getOwnPropertyDescriptor(Array.prototype, name) as PropertyDescriptor] as const);
  let sum = 0;
  for (const [name, d] of saved) {
    const original = d.value as (...args: unknown[]) => unknown;
    // oxlint-disable-next-line eslint/no-extend-native -- the test counts the scans of a list, and it restores them.
    Object.defineProperty(Array.prototype, name, {
      ...d,
      value(this: readonly unknown[], ...args: unknown[]): unknown {
        sum += measure(this);
        return Reflect.apply(original, this, args);
      },
    });
  }
  try {
    body();
  } finally {
    // oxlint-disable-next-line eslint/no-extend-native -- the test puts back the scans of the array.
    for (const [name, d] of saved) Object.defineProperty(Array.prototype, name, d);
  }
  return sum;
}

/**
 * The source must have an append into the list of a name, or must not have one. `AOC` is its clean form. A direct push of
 * one item into the array `wN` is also such an append (COMPILE.MODULE.FUSE.ADOPT). So are `AI`, `AIC`, `AW` and `AWC`
 * (COMPILE.MODULE.APPEND.PUSH).
 */
const owns = (source: string): boolean => /\bA[OIW]C?\(|\.push\(\[0, .*?\]\), w\d+\)/.test(source);

describe("COMPILE.MODULE.APPEND.OWN: a step that appends to the list of its name", () => {
  it("COMPILE.MODULE.APPEND.OWN LOOP.LIST: the forms of the step append into the list of the name, with the values of the interpreter (P17)", () => {
    const forms: Record<string, Expr> = {
      plain: folded(NONE, op("append", acc, one(n))),
      literal: folded(LIT, op("append", acc, one(n))),
      errorsFirst: folded(inv, op("append", acc, one(w))),
      errorsInX: folded(NONE, op("append", acc, BAD)),
      strict: folded(NONE, op("append", acc, one(n), strict)),
      strictInit: folded(inv, op("append", acc, one(n), strict)),
      strictX: folded(LIT, op("append", acc, BAD, strict)),
      branch: folded(NONE, op("if", b, op("append", acc, one(n)), acc)),
      both: folded(LIT, op("if", op("gt", n, lit(0)), op("append", acc, one(n)), op("append", acc, LIT))),
      nested: folded(NONE, op("append", op("append", acc, one(n)), one(w))),
      inLet: folded(NONE, let_({ y: op("multiply", n, lit(2)) }, op("append", acc, one(v("y"))))),
      headIf: folded(NONE, op("append", op("if", b, acc, op("append", acc, LIT)), one(n))),
      counted: folded(NONE, op("append", acc, one(n)), op("count", acc)),
      readAfter: folded(LIT, op("append", acc, one(n)), rec({ c: op("count", acc), f: guard(op("first", acc)), s: op("sum", acc), k: guard(op("nth", acc, lit(2))) })),
      input: op("add", op("count", folded(xs, op("append", acc, one(n)))), op("count", xs)),
      iterated: iterate(4, { acc: LIT }, { acc: op("append", acc, one(n)) }, acc),
      iterateUntil: iterate(6, { acc: NONE, i: lit(0) }, { acc: op("append", acc, one(v("i"))), i: op("add", v("i"), lit(1)) }, acc, op("gt", v("i"), lit(2))),
      twoNames: fold(axes.all, { p: NONE, q: LIT }, { p: op("append", v("p"), one(n)), q: op("append", v("q"), one(w)) }, rec({ p: v("p"), q: v("q") })),
      inner: iterate(2, { acc: NONE }, { acc: op("append", acc, folded(LIT, op("append", acc, one(n)))) }, acc),
    };
    for (const [name, e] of Object.entries(forms)) {
      // The clean form (COMPILE.MODULE.FUSE.CLEAN) and the form of fuse false give the same values.
      for (const fuse of [true, false]) for (const records of [RECORDS, MANY, []]) expect({ name, fuse, owns: owns(expectSame(e, records, fuse)) }).toStrictEqual({ name, fuse, owns: true });
    }
    // An error in the step at one key is the value of the loop at that key only.
    const errorInStep = iterate(3, { acc: NONE }, { acc: op("append", acc, one(op("divide", lit(1), w))) }, acc);
    expect(owns(expectSame(errorInStep))).toBe(true);
    // A strict append fails at an error item of the list of the name: the first append still copies through V.
    const strictLater = iterate(2, { acc: inv }, { acc: op("append", acc, one(n), strict) }, guard(op("count", acc), -5));
    expect(owns(expectSame(strictLater))).toBe(true);
  });

  it("COMPILE.MODULE.APPEND.OWN: a step that another part of the loop reads keeps the copy of each append", () => {
    const fallBacks: Record<string, Expr> = {
      otherName: fold(axes.all, { acc: NONE, c: NONE }, { acc: op("append", acc, one(n)), c: acc }, rec({ acc, c: v("c") })),
      inX: folded(LIT, op("append", acc, one(op("count", acc)))),
      inTest: folded(NONE, op("if", op("gt", op("count", acc), lit(1)), acc, op("append", acc, one(n)))),
      inBind: folded(NONE, let_({ y: op("count", acc) }, op("append", acc, one(v("y"))))),
      until: iterate(6, { acc: NONE }, { acc: op("append", acc, one(n)) }, acc, op("gt", op("count", acc), lit(2))),
      inIfError: folded(NONE, op("ifError", op("append", acc, one(op("divide", lit(1), w))), acc)),
      shadow: folded(LIT, let_({ acc: NONE }, op("append", acc, one(n)))),
    };
    for (const [name, e] of Object.entries(fallBacks)) {
      for (const records of [RECORDS, MANY]) {
        const source = expectSame(e, records);
        expect({ name, owns: owns(source) }).toStrictEqual({ name, owns: false });
        expect(source).not.toContain("let undefined");
      }
    }
    // A count after the step and a branch of another list or of a literal keep the copy with fuse false. With fuse, they append in place
    // (COMPILE.MODULE.APPEND.LATE and COMPILE.MODULE.APPEND.OTHER).
    const wide = [fold(axes.all, { acc: NONE, c: lit(0) }, { acc: op("append", acc, one(n)), c: op("count", acc) }, v("c")), fold(axes.all, { acc: NONE, c: LIT }, { acc: op("if", b, op("append", acc, one(n)), v("c")), c: v("c") }, acc), folded(NONE, op("if", b, op("append", acc, one(n)), LIT))];
    for (const e of wide) for (const fuse of [true, false]) expect(owns(expectSame(e, RECORDS, fuse))).toBe(fuse);
    // LOOP.SIZE: a step that appends the list to itself doubles it at each step, so the module refuses it.
    expect(() => sourceOf(iterate(3, { acc: LIT }, { acc: op("append", acc, acc) }, acc))).toThrow("(LOOP.SIZE)");
    // The name `acc` appends to its own list, and the name `c` reads only itself, so `acc` still appends in place.
    const still = fold(axes.all, { acc: NONE, c: lit(0) }, { acc: op("append", acc, one(n)), c: op("add", v("c"), n) }, rec({ acc, c: v("c") }));
    expect(owns(expectSame(still, MANY))).toBe(true);
  });

  it("COMPILE.MODULE.APPEND.OWN FN.BIND: a function that shares the append node of a step copies the list", () => {
    // The body of the function reads its own parameter `acc`, so its append copies. The step appends in place, also
    // where it calls the function. The result calls the function after the loop.
    const shared = op("append", acc, one(n));
    const step = op("if", b, shared, op("append", acc, call("f", LIT)));
    const e = let_({ f: fn(["acc"], shared) }, folded(NONE, step, rec({ acc, f: call("f", LIT) })));
    for (const records of [RECORDS, MANY]) expect(owns(expectSame(e, records))).toBe(true);
  });

  it("COMPILE.MODULE.APPEND.OWN ITERATE.LIMIT: 20000 appends to the list of a name read the items O(n) times", () => {
    // The interpreter copies the list at each append, so the test compares the count only. An append in place reads
    // each new item about once, and a copy at each append reads n squared / 2 items: 200 million here.
    const plainLoop = iterate(20_000, { acc: NONE }, { acc: op("append", acc, one(lit(1))) }, op("count", acc));
    const nestedLoop = iterate(10_000, { acc: NONE }, { acc: op("append", op("append", acc, one(lit(1))), one(n)) }, op("count", acc));
    for (const [e, fuse] of [plainLoop, nestedLoop].flatMap((x) => [[x, true], [x, false]] as const)) {
      const m = make(sourceOf(e, fuse));
      let got: unknown;
      const read = scanReads(
        () => {
          got = m.run([RECORDS[0]], VARS);
        },
        (l) => l.length,
      );
      expect(got).toStrictEqual([20_000]);
      // The clean form counts the length of the array, so it scans no items (COMPILE.MODULE.FUSE.CLEAN).
      expect(read > 0).toBe(!fuse);
      expect(read).toBeLessThan(100_000);
    }
  });

  it("COMPILE.MODULE.APPEND.OWN P17: random steps that append to the list of the name give the values of the interpreter", () => {
    const X = [one(n), one(w), one(op("divide", lit(1), w)), LIT, BAD, NONE, inv, xs];
    const CONDS = [b, op("gt", n, lit(0)), op("gt", op("divide", lit(1), w), lit(0))];
    const steps = fc.letrec<{ step: Expr }>((tie) => ({
      step: fc.oneof(
        { maxDepth: 3, depthSize: "small" },
        fc.constant(acc),
        { arbitrary: fc.tuple(tie("step"), fc.constantFrom(...X), fc.boolean()).map(([h, x, s]) => op("append", h, x, ...(s ? [strict] : []))), weight: 3 },
        fc.tuple(fc.constantFrom(...CONDS), tie("step"), tie("step")).map(([c, yes, no]) => op("if", c, yes, no)),
        tie("step").map((body) => let_({ y: n }, body)),
      ),
    })).step;
    const inits = fc.constantFrom(NONE, LIT, BAD, inv, xs);
    const results = fc.constantFrom(acc, op("count", acc), guard(op("first", acc)), op("sum", acc), guard(op("nth", acc, lit(1))));
    const loops = fc.tuple(fc.boolean(), inits, steps, results).map(([isFold, init, step, result]) => (isFold ? folded(init, step, result) : iterate(3, { acc: init }, { acc: step }, result)));
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

/** A fold over all records with the names `r` and `acc`. The step of `r` comes first, so it reads the list before the append. */
const readFirst = (reader: Expr, init: Expr, step: Expr, result: Expr = rec({ acc, r: v("r") })): Expr => fold(axes.all, { r: lit(0), acc: init }, { r: reader, acc: step }, result);
/** The sum of the list of the name by a fold over the axis `list`. */
const sumOf = (l: Expr): Expr => fold(axes.list(l), { s: lit(0) }, { s: op("add", v("s"), v("x")) }, v("s"), undefined, ["x"]);
/** The readers of the list of `acc` that COMPILE.MODULE.APPEND.READ takes: each value is a number. */
const READERS: readonly Expr[] = [op("count", acc), guard(op("first", acc)), guard(op("nth", acc, lit(1))), sumOf(acc), op("add", op("count", acc, strict), sumOf(acc))];
/** A body of a let of COMPILE.MODULE.APPEND.LET that gives a shorter list for a long list. */
const shorter = (all: Expr): Expr => op("if", op("gt", op("count", all), lit(3)), op("take", all, lit(2)), all);
/** The bodies of a let of COMPILE.MODULE.APPEND.LET over the new name `all`. Some bodies give another list. */
const bodies = (all: Expr): readonly Expr[] => [
  all,
  shorter(all),
  op("if", op("gt", op("count", all), lit(2)), each(axes.list(all), op("multiply", v("y"), lit(2)), undefined, ["y"]), all),
  op("if", op("gt", op("count", all), lit(5)), NONE, op("append", all, one(lit(9)))),
  op("if", op("gt", op("count", all), lit(2)), op("take", all, op("divide", lit(1), w)), all),
];

describe("COMPILE.MODULE.APPEND.LET and COMPILE.MODULE.APPEND.READ: more steps append to the list of the name", () => {
  it("COMPILE.MODULE.APPEND.LET: a let binds the append to a new name, and the step appends into the list of the name (P17)", () => {
    const forms: Record<string, Expr> = {
      ...Object.fromEntries(bodies(v("all")).map((body, i) => [`body${String(i)}`, folded(NONE, let_({ all: op("append", acc, one(n)) }, body))])),
      ...Object.fromEntries(bodies(acc).map((body, i) => [`same${String(i)}`, folded(LIT, let_({ acc: op("append", acc, one(n)) }, body))])),
      branch: folded(NONE, op("if", b, acc, let_({ y: n, all: op("append", op("append", acc, one(w)), LIT) }, op("if", op("gt", op("count", v("all")), lit(4)), op("take", v("all"), lit(1)), v("all"))))),
      errors: folded(inv, let_({ all: op("append", acc, BAD) }, op("if", op("gt", op("count", v("all")), lit(6)), op("take", v("all"), lit(3)), v("all")))),
      strict: folded(NONE, let_({ all: op("append", acc, one(op("divide", lit(1), w)), strict) }, op("if", b, v("all"), op("take", v("all"), lit(2))))),
      iterated: iterate(5, { acc: NONE }, { acc: let_({ all: op("append", acc, one(n)) }, op("if", op("gt", op("count", v("all")), lit(2)), op("take", v("all"), lit(1)), v("all"))) }, acc),
    };
    for (const [name, e] of Object.entries(forms)) {
      for (const fuse of [true, false]) for (const records of [RECORDS, MANY, []]) expect({ name, fuse, owns: owns(expectSame(e, records, fuse)) }).toStrictEqual({ name, fuse, owns: true });
    }
    // The body of the let can give another list, so a push of one item keeps the check l === w of AIC
    // (COMPILE.MODULE.FUSE.ADOPT, COMPILE.MODULE.APPEND.PUSH).
    const source = sourceOf(folded(NONE, let_({ all: op("append", acc, one(n)) }, shorter(v("all")))));
    expect(source).toMatch(/\(w\d+ = AIC\(l\d+, \[0, /);
    expect(source).not.toMatch(/\(l\d+\.push\(\[0, .*?\]\), w\d+\)/);
  });

  it("COMPILE.MODULE.APPEND.LET: a let whose body or second binding reads the old list keeps the copy of each append", () => {
    const fallBacks: Record<string, Expr> = {
      bodyReads: folded(NONE, let_({ all: op("append", acc, one(n)) }, op("if", op("gt", op("count", acc), lit(1)), v("all"), acc))),
      twoBindings: folded(NONE, let_({ all: op("append", acc, one(n)), c: op("count", acc) }, op("append", v("all"), one(v("c"))))),
      notAForm: folded(NONE, let_({ all: op("take", acc, lit(2)) }, op("append", v("all"), one(n)))),
      inX: folded(NONE, let_({ all: op("append", acc, one(op("count", acc))) }, v("all"))),
    };
    for (const [name, e] of Object.entries(fallBacks)) {
      for (const records of [RECORDS, MANY]) expect({ name, owns: owns(expectSame(e, records)) }).toStrictEqual({ name, owns: false });
    }
  });

  it("COMPILE.MODULE.APPEND.READ: a step before the step of the name reads the list by count, nth, first or a fold, and the step appends into the list (P17)", () => {
    const steps = [op("append", acc, one(n)), op("if", b, op("append", acc, LIT), acc), let_({ all: op("append", acc, one(w)) }, op("if", op("gt", op("count", v("all")), lit(4)), op("take", v("all"), lit(2)), v("all")))];
    for (const [i, reader] of READERS.entries()) {
      for (const [j, step] of steps.entries()) {
        for (const init of [NONE, LIT, inv]) {
          const e = readFirst(reader, init, step);
          for (const fuse of [true, false]) for (const records of [RECORDS, MANY, []]) expect({ i, j, fuse, owns: owns(expectSame(e, records, fuse)) }).toStrictEqual({ i, j, fuse, owns: true });
        }
      }
    }
    const iterated = iterate(4, { r: lit(0), acc: LIT }, { r: op("add", v("r"), sumOf(acc)), acc: op("append", acc, one(v("r"))) }, rec({ acc, r: v("r") }));
    expect(owns(expectSame(iterated))).toBe(true);
  });

  it("COMPILE.MODULE.APPEND.READ: a step after the step of the name, or a read that can hold the list, keeps the copy of each append", () => {
    const step = op("append", acc, one(n));
    const fallBacks: Record<string, Expr> = {
      holds: fold(axes.all, { r: NONE, acc: NONE }, { r: acc, acc: step }, rec({ acc, r: v("r") })),
      take: fold(axes.all, { r: NONE, acc: NONE }, { r: op("take", acc, lit(1)), acc: step }, rec({ acc, r: v("r") })),
      each: fold(axes.all, { r: NONE, acc: NONE }, { r: each(axes.list(acc), v("y"), undefined, ["y"]), acc: step }, rec({ acc, r: v("r") })),
      foldInit: readFirst(fold(axes.list(acc), { s: acc }, { s: v("s") }, op("count", v("s")), undefined, ["x"]), NONE, step),
      fn: readFirst(let_({ f: fn(["z"], op("add", v("z"), op("count", acc))) }, call("f", lit(1))), NONE, step),
      reverse: readFirst(fold(axes.reverse(axes.list(acc)), { s: lit(0) }, { s: op("add", v("s"), v("x")) }, v("s"), undefined, ["x"]), NONE, step),
    };
    for (const [name, e] of Object.entries(fallBacks)) {
      for (const records of [RECORDS, MANY]) expect({ name, owns: owns(expectSame(e, records)) }).toStrictEqual({ name, owns: false });
    }
    // A count after the step keeps the copy with fuse false. With fuse, the step prints last (COMPILE.MODULE.APPEND.LATE).
    const after = fold(axes.all, { acc: NONE, r: lit(0) }, { acc: step, r: op("count", acc) }, rec({ acc, r: v("r") }));
    for (const fuse of [true, false]) expect(owns(expectSame(after, RECORDS, fuse))).toBe(fuse);
  });

  it("COMPILE.MODULE.APPEND.LET COMPILE.MODULE.APPEND.READ: a pack of places reads its list in one step and appends to it in a let of another step", () => {
    // The shape of `pack` of the tree pilot: the place reads the packed list, and a long list becomes a shorter list.
    const packed = v("packed");
    const e = fold(
      axes.all,
      { place: lit(0), places: NONE, packed: NONE },
      {
        place: op("add", sumOf(packed), op("count", packed)),
        places: op("append", v("places"), one(v("place"))),
        packed: op("if", b, packed, let_({ all: op("append", packed, one(n)) }, op("if", op("gt", op("count", v("all")), lit(3)), each(axes.list(op("take", v("all"), lit(2))), v("y"), undefined, ["y"]), v("all")))),
      },
      rec({ places: v("places"), packed }),
    );
    const many = Array.from({ length: 40 }, (_x, i) => ({ ...(MANY[i % MANY.length] as object), id: String(i) }));
    for (const fuse of [true, false]) for (const records of [RECORDS, MANY, many]) expectSame(e, records, fuse);
    // Both names append in place, and no append copies the packed list at each step.
    const source = sourceOf(e);
    expect(source.match(/\(w\d+ = A[OI]C?\(l\d+, /g)).toHaveLength(1);
    expect(source).not.toMatch(/\bAP\(l\d+/);
  });

  it("COMPILE.MODULE.APPEND.LET COMPILE.MODULE.APPEND.READ P17: random readers and lets of the step give the values of the interpreter", () => {
    const X = [one(n), one(op("divide", lit(1), w)), LIT, BAD, inv];
    const steps = fc.letrec<{ step: Expr }>((tie) => ({
      step: fc.oneof(
        { maxDepth: 3, depthSize: "small" },
        fc.constant(acc),
        { arbitrary: fc.tuple(tie("step"), fc.constantFrom(...X), fc.boolean()).map(([h, x, s]) => op("append", h, x, ...(s ? [strict] : []))), weight: 3 },
        fc.tuple(fc.constantFrom(b, op("gt", n, lit(0))), tie("step"), tie("step")).map(([c, yes, no]) => op("if", c, yes, no)),
        { arbitrary: fc.tuple(tie("step"), fc.constantFrom(...bodies(v("all")).map((_x, i) => (all: Expr) => bodies(all).at(i) ?? all)), fc.boolean()).map(([x, body, same]) => (same ? let_({ acc: x }, body(acc)) : let_({ all: x }, body(v("all"))))), weight: 2 },
      ),
    })).step;
    const readers = fc.constantFrom(lit(0), ...READERS);
    const loops = fc.tuple(fc.boolean(), fc.constantFrom(NONE, LIT, BAD, inv, xs), readers, steps).map(([isFold, init, reader, step]) =>
      isFold ? readFirst(reader, init, step) : iterate(3, { r: lit(0), acc: init }, { r: reader, acc: step }, rec({ acc, r: v("r") })),
    );
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

describe("COMPILE.MODULE.NTH.INDEX: count and first read the items with values of the list", () => {
  it("COMPILE.MODULE.NTH.INDEX: count and first give the values of the interpreter, also with strict and error items", () => {
    const e = rec({
      count: op("count", inv),
      countStrict: guard(op("count", inv, strict)),
      first: guard(op("first", inv)),
      firstStrict: guard(op("first", inv, strict)),
      leading: op("first", LEADING),
      leadingStrict: guard(op("first", LEADING, strict)),
      empty: guard(op("first", NONE), -2),
      emptyCount: op("count", NONE),
      input: op("add", op("count", xs), guard(op("first", xs))),
      inputStrict: guard(op("count", xs, strict)),
    });
    const source = expectSame(e);
    expectSame(e, MANY);
    expect(source).toContain("CT(");
    expect(source).toContain("FS(");
  });

  it("COMPILE.MODULE.NTH.INDEX: count, first and nth of one list filter the list once", () => {
    // The list is the same array at each key. The first op keeps its items with values, and each later op reads them.
    const e = let_({ ys: inv }, op("sum", each(axes.all, op("add", op("add", op("count", v("ys")), guard(op("first", v("ys")), 0)), guard(op("nth", v("ys"), op("abs", n)), 0)))));
    expectSame(e, MANY);
    const clean = Array.from({ length: 300 }, (_x, i) => ({ id: String(i), n: i % 7, w: 1, b: i % 2 === 0, xs: list() }));
    const m = make(sourceOf(e));
    let got: readonly unknown[] = [];
    // The check of the input can call filter too, so the bound is small, not 1. One filter at each key gives 300.
    const calls = scanReads(
      () => {
        got = m.run(clean, VARS);
      },
      () => 1,
    );
    expect(got).toHaveLength(300);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(5);
  });
});

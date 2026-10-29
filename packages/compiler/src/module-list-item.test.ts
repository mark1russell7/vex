/**
 * The names `as` of a loop over the axis `list` in a standalone module (COMPILE.MODULE.LIST.ITEM). The first name holds
 * the value of each item, and the second name holds its index (AXIS.LIST.ITEM, AXIS.LIST.INDEX). Only the body or the
 * step sees the names (AXIS.LIST.SCOPE). The module gives the values and the errors of the interpreter.
 */
import { app, axes, call, cell, each, evaluate, fn, fold, isVexList, let_, lit, rec, ref, SheetRun, space, v, vexList, type Axis, type Expr, type ItemNames, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean", xs: { list: "number" } }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const VARS = { a: 2 };

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
/** Twelve records, with an error item in each fourth list of `xs`. */
const MANY = Array.from({ length: 12 }, (_x, i) => ({ id: String(i), n: (i % 5) - 2, w: i % 6 === 0 ? 0 : (i % 3) + 1, b: i % 2 === 0, xs: list(plain("k", i), ...(i % 4 === 0 ? [plainBad("e")] : []), plain("m", -i)) }));

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

/** This function gives the values of the interpreter at each key, in the form of a module. */
function interpret(e: Expr, records: readonly unknown[], error: unknown): readonly unknown[] {
  const s = space.array(records);
  return s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars: VARS, domains: DOMAINS });
    return r.ok ? asModule(r.value, error) : error;
  });
}

/** This function compares the values of a module with the interpreter at each key (P17), and gives the source. */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): string {
  const source = sourceOf(e);
  // The module of fuse false gives the same values (COMPILE.MODULE.FUSE.CLEAN).
  for (const m of [make(source), make(sourceOf(e, false))]) {
    const input = structuredClone(records);
    expect(m.run(input, VARS)).toStrictEqual(interpret(e, records, m.VEX_ERROR));
    expect(input).toStrictEqual(records);
  }
  return source;
}

/** This function compares each form with the interpreter on each set of records, and names the form that fails. */
function expectAll(forms: Readonly<Record<string, Expr>>, sets: readonly (readonly unknown[])[]): void {
  for (const [name, e] of Object.entries(forms)) {
    for (const records of sets) {
      try {
        expectSame(e, records);
      } catch (error) {
        throw new Error(`the form "${name}" with ${String(records.length)} records: ${String(error)}`, { cause: error });
      }
    }
  }
}

/** This function gives the values of the module at each key. */
const runOf = (e: Expr, records: readonly unknown[] = RECORDS): unknown => make(sourceOf(e)).run(structuredClone(records), VARS);

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const b = ref("b");
const xs = ref("xs");
const x = v("x");
const i = v("i");
const a = v("a");
const strict = lit({ strict: true });
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });
const guard = (e: Expr, value = -1): Expr => op("ifError", e, lit(value));
/** The list of one value (LIST.FILL), and an empty list of numbers. */
const one = (e: Expr): Expr => op("fill", lit(1), e);
const NONE = op("fill", lit(0), lit(0));
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const BAD = lit(vexList([item("a", 1), errorItem("b"), item("c", 4)]));
const LEADING = lit(vexList([errorItem("z"), item("a", 5)]));
/** The values `n` of the records, and the values of each record with an error item where `w` is 0. */
const NS = each(axes.all, n);
const inv = each(axes.all, op("divide", lit(1), w));
/** The lists `xs` of the records: a list of lists. */
const XS = each(axes.all, xs);
const ITEM: ItemNames = ["x"];
const BOTH: ItemNames = ["x", "i"];
/** This function gives a loop over the items of a list, with the names `as`. */
const over = (l: Expr, body: Expr, as: ItemNames = ITEM, wrap: (axis: Axis) => Axis = (axis) => axis): Expr => each(wrap(axes.list(l)), body, undefined, as);
const reversed = (axis: Axis): Axis => axes.reverse(axis);

/**
 * The source must have an append into the list of a name, or must not have one. A direct push of one item into the
 * array `wN` is also such an append (COMPILE.MODULE.FUSE.ADOPT).
 */
const owns = (source: string): boolean => /\bAOC?\(|\.push\(\[0, .*?\]\), w\d+\)/.test(source);

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

describe("COMPILE.MODULE.LIST.ITEM: the names of the items of a loop over the axis list", () => {
  it("COMPILE.MODULE.LIST.ITEM AXIS.LIST.ITEM AXIS.LIST.INDEX: each and fold read the item and its index", () => {
    const sum = op("sum", over(LIT, op("multiply", x, i), BOTH));
    expect(runOf(sum)).toStrictEqual([8, 8, 8, 8]);
    expectSame(sum);
    const digits = fold(axes.reverse(axes.list(LIT)), { s: lit(0) }, { s: op("add", op("multiply", v("s"), lit(10)), x) }, v("s"), undefined, ITEM);
    expect(runOf(digits)).toStrictEqual([321, 321, 321, 321]);
    expectSame(digits);
    const indexes = fold(axes.reverse(axes.list(LIT)), { s: lit(0) }, { s: op("add", op("multiply", v("s"), lit(10)), i) }, v("s"), undefined, BOTH);
    expect(runOf(indexes)).toStrictEqual([210, 210, 210, 210]);
    expectSame(indexes);
    const forms: Record<string, Expr> = {
      values: over(LIT, op("add", x, a)),
      pairs: over(LIT, rec({ x, i }), BOTH),
      reverse: over(LIT, rec({ x, i }), BOTH, reversed),
      records: over(NS, op("add", op("multiply", x, i), n), BOTH),
      recordsReverse: over(NS, rec({ x, i, w }), BOTH, reversed),
      onlyIndex: op("sum", over(NS, i, ["y", "i"])),
      max: guard(op("max", over(inv, op("subtract", x, i), BOTH))),
      first: guard(op("first", over(BAD, op("multiply", x, lit(10)), ITEM, reversed))),
      inFold: fold(axes.list(NS), { s: lit(0) }, { s: op("subtract", op("multiply", v("s"), lit(2)), op("multiply", x, i)) }, v("s"), undefined, BOTH),
      foldRecord: fold(axes.list(NS), { s: lit(0) }, { s: op("add", v("s"), op("multiply", x, w)) }, v("s"), undefined, ITEM),
    };
    expectAll(forms, [RECORDS, MANY, []]);
  });

  it("COMPILE.MODULE.LIST.ITEM LIST.NTH: the index is the position that nth reads, also in the reverse order", () => {
    for (const wrap of [(axis: Axis): Axis => axis, reversed]) {
      for (const l of [LIT, BAD, LEADING, inv]) {
        const e = let_({ L: l }, op("all", over(v("L"), op("eq", op("nth", v("L"), i), x), BOTH, wrap)));
        expect(runOf(e, MANY)).toStrictEqual(MANY.map(() => true));
        expectSame(e, MANY);
      }
    }
  });

  it("COMPILE.MODULE.LIST.ITEM AXIS.LIST.SCOPE: a where test does not see the names, and the index counts the items that it skips", () => {
    const kept = over(NS, rec({ x, i }), BOTH, (axis) => axes.where(axis, op("gt", n, lit(0))));
    expect(runOf(kept)).toStrictEqual(RECORDS.map(() => list(plain("0", { x: 3, i: 0 }), plain("2", { x: 2, i: 2 }))));
    expectSame(kept);
    expectSame(kept, MANY);
    expectSame(over(NS, rec({ x, i }), BOTH, (axis) => axes.where(axes.reverse(axis), b)), MANY);
    // The test reads the name `x` outside the loop, and the body reads the item.
    const outer = let_({ x: lit(100) }, rec({ inner: op("sum", over(LIT, op("add", x, lit(1)), ITEM, (axis) => axes.where(axis, op("gt", x, lit(50))))), outer: x }));
    expect(runOf(outer)).toStrictEqual(RECORDS.map(() => ({ inner: 9, outer: 100 })));
    expectSame(outer);
    expectSame(let_({ x: lit(2) }, over(inv, i, BOTH, (axis) => axes.where(axis, op("gt", op("divide", x, w), lit(0))))), MANY);
  });

  it("COMPILE.MODULE.LIST.ITEM AXIS.LIST.SCOPE: the names hide the names outside in the body and in the step only", () => {
    const folded = let_({ x: lit(10) }, fold(axes.list(LIT), { s: x }, { s: op("add", v("s"), x) }, op("add", v("s"), x), undefined, ITEM));
    expect(runOf(folded)).toStrictEqual([26, 26, 26, 26]);
    expectSame(folded);
    // The list of the loop is the name `x` outside, and the body reads the item `x`.
    const own = let_({ x: LIT }, rec({ l: over(x, op("multiply", x, lit(2))), c: op("count", over(x, x)), outside: op("count", x) }));
    expect(runOf(own)).toStrictEqual(RECORDS.map(() => ({ l: list(plain("a", 2), plain("b", 4), plain("a", 6)), c: 3, outside: 3 })));
    expectSame(own);
    // The item hides a name of a fold outside, so the step of that fold reads its own name again after the loop.
    const hidden = fold(axes.all, { t: lit(0) }, { t: op("add", v("t"), op("sum", over(LIT, op("multiply", v("t"), lit(2)), ["t"]))) }, v("t"));
    expect(runOf(hidden)).toStrictEqual([48, 48, 48, 48]);
    expectSame(hidden, MANY);
    // A function sees its own parameter, and a call in the body gets the item.
    const called = let_({ f: fn(["k"], op("multiply", v("k"), lit(3))) }, op("sum", over(LIT, call("f", x))));
    expect(runOf(called)).toStrictEqual([18, 18, 18, 18]);
    expectSame(called);
    const index = let_({ i: lit(7) }, rec({ in: op("sum", over(LIT, i, BOTH)), out: i }));
    expect(runOf(index)).toStrictEqual(RECORDS.map(() => ({ in: 3, out: 7 })));
    expectSame(index);
  });

  it("COMPILE.MODULE.LIST.ITEM LIST.LENIENT: an error item of the list is an error item of the loop, and it fails a fold", () => {
    const failed = guard(fold(axes.list(BAD), { s: lit(0) }, { s: op("add", v("s"), x) }, v("s"), undefined, ITEM));
    const forms: Record<string, Expr> = {
      inv: over(inv, op("multiply", x, lit(2))),
      invIndex: over(inv, rec({ x, i }), BOTH),
      leading: over(LEADING, op("add", x, i), BOTH),
      bad: over(BAD, rec({ x, i }), BOTH, reversed),
      xs: over(xs, op("add", x, i), BOTH),
      sum: op("sum", over(inv, op("add", x, i), BOTH)),
      fold: failed,
      foldInv: guard(fold(axes.list(inv), { s: lit(0) }, { s: op("add", v("s"), i) }, v("s"), undefined, BOTH)),
      bodyError: over(LIT, op("divide", lit(1), op("subtract", x, lit(2)))),
    };
    expectAll(forms, [RECORDS, MANY]);
    expect(runOf(failed)).toStrictEqual([-1, -1, -1, -1]);
    const m = make(sourceOf(over(BAD, op("multiply", x, i), BOTH)));
    expect(m.run(structuredClone(RECORDS), VARS)).toStrictEqual(RECORDS.map(() => list(plain("a", 0), { key: "b", result: { ok: false, error: m.VEX_ERROR } }, plain("c", 4))));
  });

  it("COMPILE.MODULE.LIST.ITEM LIST.LENIENT: a strict op fails at an error item of the loop", () => {
    const e = rec({
      lenient: op("sum", over(BAD, x)),
      strict: guard(op("sum", over(BAD, x), strict)),
      count: guard(op("count", over(BAD, i, BOTH), strict)),
      clean: op("count", over(LIT, i, BOTH), strict),
      first: guard(op("first", over(LEADING, x), strict), -2),
    });
    expect(runOf(e)).toStrictEqual(RECORDS.map(() => ({ lenient: 5, strict: -1, count: -1, clean: 3, first: -2 })));
    expectSame(e);
    expectSame(rec({ s: guard(op("sum", over(inv, op("add", x, i), BOTH), strict)), c: guard(op("count", over(xs, x), strict)) }), MANY);
  });

  it("COMPILE.MODULE.LIST.ITEM COMPILE.MODULE.APPEND.OWN: a fold with the names appends into the list of its name", () => {
    const appended = fold(axes.list(LIT), { acc: NONE }, { acc: op("append", v("acc"), one(op("multiply", x, i))) }, v("acc"), undefined, BOTH);
    expect(runOf(appended)).toStrictEqual(RECORDS.map(() => list(plain("0", 0), plain("0", 2), plain("0", 6))));
    for (const e of [appended, fold(axes.reverse(axes.list(xs)), { acc: LIT }, { acc: op("append", v("acc"), one(op("add", x, i))) }, op("count", v("acc")), undefined, BOTH)]) {
      for (const records of [RECORDS, MANY]) expect(owns(expectSame(e, records))).toBe(true);
    }
    // The interpreter copies the list at each append, so the test compares the count only. An append in place reads
    // each new item about once, and a copy at each append reads n squared / 2 items: 50 million here.
    const long = fold(axes.list(op("fill", lit(10_000), lit(1))), { acc: NONE }, { acc: op("append", v("acc"), one(op("add", x, i))) }, op("count", v("acc")), undefined, BOTH);
    for (const fuse of [true, false]) {
      const m = make(sourceOf(long, fuse));
      let got: unknown;
      const read = scanReads(
        () => {
          got = m.run([RECORDS[0]], VARS);
        },
        (l) => l.length,
      );
      expect(got).toStrictEqual([10_000]);
      // The clean form counts the length of the array, so it scans no items (COMPILE.MODULE.FUSE.CLEAN).
      expect(read > 0).toBe(!fuse);
      expect(read).toBeLessThan(100_000);
    }
  });

  it("COMPILE.MODULE.LIST.ITEM LIST.FLAT: an item that is a list is a list in the body", () => {
    const counts = over(XS, op("count", x));
    const outerCount = op("count", over(XS, x));
    const forms: Record<string, Expr> = {
      counts,
      outerCount,
      flat: op("flat", over(XS, x)),
      sums: over(XS, op("sum", x), BOTH, reversed),
      nested: over(XS, op("sum", over(x, op("multiply", v("y"), v("j")), ["y", "j"])), BOTH),
      nestedFlat: op("flat", over(XS, over(x, op("add", v("y"), i), ["y"]), BOTH)),
      fold: fold(axes.list(XS), { s: lit(0) }, { s: op("add", v("s"), op("count", x)) }, v("s"), undefined, ITEM),
      outer: let_({ L: LIT }, op("count", over(XS, v("L")))),
    };
    expectAll(forms, [RECORDS, MANY]);
    expect(runOf(outerCount)).toStrictEqual([4, 4, 4, 4]);
    expect(runOf(counts)).toStrictEqual(RECORDS.map(() => list(plain("0", 2), plain("1", 2), plain("2", 0), plain("3", 1))));
  });

  it("COMPILE.MODULE.LIST.ITEM: a name of an item is a plain local, and a part that reads it stays in the loop", () => {
    // The inner loop reads the item in its test, so it evaluates again for each item.
    const memo = over(LIT, op("count", each(axes.where(axes.all, op("gt", n, x)), n)));
    expect(runOf(memo)).toStrictEqual(RECORDS.map(() => list(plain("a", 2), plain("b", 1), plain("a", 0))));
    expectSame(memo);
    expectSame(memo, MANY);
    for (const e of [memo, over(LIT, op("add", op("multiply", x, a), i), BOTH)]) expect(sourceOf(e)).not.toMatch(/G\(y\d+\)/);
  });

  it("COMPILE.MODULE.LIST.ITEM COMPILE.FALLBACK: a module and a sheet module have the loops that tier 2 refuses", () => {
    // These loops are the cases of tiers.test.ts. That test gets the domains that Stryker mutates, so the modules are here.
    const sorted = op("sortBy", NS);
    const cases: readonly Expr[] = [
      op("sum", each(axes.list(sorted), op("add", x, i), undefined, BOTH)),
      fold(axes.reverse(axes.list(sorted)), { s: lit(0) }, { s: op("add", v("s"), x) }, v("s"), undefined, ITEM),
      let_({ y: op("sum", each(axes.where(axes.list(sorted), lit(true)), x, undefined, ITEM)) }, v("y")),
    ];
    for (const e of cases) {
      expectSame(e);
      expect(emitSheetModule(new Map([["c", e]]), OPTIONS).ok).toBe(true);
    }
  });

  it("COMPILE.MODULE.LIST.ITEM: a body that reads a record at a key of a literal still gives a reason", () => {
    expect(emitModule(op("sum", over(LIT, op("add", x, n))), OPTIONS)).toStrictEqual({ ok: false, reason: 'the axis "list" reads a record at a key of a literal or of "fill"' });
  });

  it("COMPILE.MODULE.LIST.ITEM COMPILE.MODULE.SHEET: a column of a sheet has the names of the items", () => {
    const columns = new Map<string, Expr>([
      ["s", op("sum", over(LIT, op("multiply", x, a)))],
      ["t", op("add", cell("s"), op("sum", over(NS, op("multiply", x, i), BOTH, reversed)))],
    ]);
    const m = emitSheetModule(columns, OPTIONS);
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const s = space.array(MANY);
    const sheet = new SheetRun(columns, { space: s, domains: DOMAINS, vars: VARS });
    const expected = Object.fromEntries(
      [...columns.keys()].map((c) => [
        c,
        s.keys.map((k) => {
          const r = sheet.cell(c, k);
          return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
        }),
      ]),
    );
    expect(loaded.run(structuredClone(MANY), VARS)).toStrictEqual(expected);
  });

  it("COMPILE.MODULE.LIST.ITEM P17: random loops with the names give the values of the interpreter", () => {
    const LISTS = [LIT, BAD, LEADING, NS, inv, xs, op("take", NS, lit(2)), each(axes.where(axes.all, b), w)];
    const TESTS: readonly (Expr | undefined)[] = [undefined, b, op("gt", a, lit(0)), op("gt", x, lit(0))];
    const bodies = fc.letrec<{ body: Expr }>((tie) => ({
      body: fc.oneof(
        { maxDepth: 2, depthSize: "small" },
        fc.constantFrom(x, i, a, lit(3)),
        fc.tuple(fc.constantFrom("add", "subtract", "multiply", "divide"), tie("body"), tie("body")).map(([name, l, r]) => op(name, l, r)),
        fc.tuple(tie("body"), tie("body")).map(([yes, no]) => op("if", op("gt", x, i), yes, no)),
      ),
    })).body;
    const loops = fc.record({ l: fc.constantFrom(...LISTS), test: fc.constantFrom(...TESTS), reverse: fc.boolean(), body: bodies, form: fc.constantFrom("each", "sum", "count", "max", "first", "fold"), strict: fc.boolean() }).map(({ l, test, reverse, body, form, strict: s }) => {
      const base = reverse ? axes.reverse(axes.list(l)) : axes.list(l);
      const axis = test === undefined ? base : axes.where(base, test);
      const options = s ? [strict] : [];
      const inner = form === "fold" ? fold(axis, { s: lit(1) }, { s: op("add", op("multiply", v("s"), lit(2)), body) }, v("s"), undefined, BOTH) : each(axis, body, undefined, BOTH);
      return let_({ x: lit(2) }, form === "each" || form === "fold" ? guard(inner, -9) : guard(op(form, inner, ...options), -9));
    });
    let modules = 0;
    let runs = 0;
    fc.assert(
      fc.property(loops, fc.constantFrom(RECORDS, MANY), (e, records) => {
        runs++;
        if (!emitModule(e, OPTIONS).ok) return;
        modules++;
        expectSame(e, records);
      }),
      { numRuns: 60 },
    );
    expect(modules).toBeGreaterThan(runs / 2);
  });
});

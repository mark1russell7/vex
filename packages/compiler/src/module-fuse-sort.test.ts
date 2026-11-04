/**
 * The sort of a fresh list (docs/COMPILER.md §7.6, step 8). A list of 64 items or fewer gets an insertion sort, and a
 * longer list gets the sort of the engine (COMPILE.MODULE.FUSE.SORT). Each test compares the module of `fuse` true and
 * the module of `fuse` false with the interpreter (P17), at the limit and around it.
 */
import * as fc from "fast-check";
import { app, defineDomain, evaluate, isVexList, lit, ref, space, vexList, type AnyDomain, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

/** The limit of the insertion sort. */
const LIMIT = 64;
/** The sizes of the lists of the tests: the small lists, the limit, and the sizes around the limit. */
const SIZES = [0, 1, 2, 3, 63, 64, 65, 66, 130] as const;

/**
 * This domain gives the sort values that the other domains do not give. `mixed` gives a number or a text, `flag` gives a
 * boolean, and `lost` gives NaN. The kind "string" has no check in a module, so these values reach the check of the
 * helper. `big` gives an infinite number, which the check of its kind stops, and the op `fails` throws.
 */
const KeyDomain = defineDomain({
  name: "Key",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  ops: {
    mixed: { fn: (a: number): unknown => (a > 2 ? "big" : a), returns: "string" },
    flag: { fn: (a: number): boolean => a > 2, returns: "boolean" },
    big: { fn: (a: number): number => (a > 2 ? Number.POSITIVE_INFINITY : a < -2 ? Number.NEGATIVE_INFINITY : a), returns: "number" },
    lost: { fn: (a: number): unknown => (a > 2 ? Number.NaN : a), returns: "string" },
    fails: { fn: (a: number): number => (a > 2 ? a.toFixed(-1).length : a), returns: "number" },
  },
});

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, KeyDomain];
const SCHEMA = { fields: { n: "number", s: "string", xs: { list: "number" }, ts: { list: "string" } } } as const;
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const by = (name: string): Expr => lit({ by: name });
/** A fresh and clean list of numbers: one item of the record, and then the items of the input with values. */
const NUMBERS = op("append", op("fill", lit(1), ref("n")), ref("xs"));
/** A fresh and clean list of texts: one item of the record, and then the items of the input with values. */
const TEXTS = op("append", op("fill", lit(1), ref("s")), ref("ts"));

const NONE = lit(vexList([]));

/** An item of an input list. The value `undefined` gives an error item. */
function inputItem(value: number | string | undefined, i: number): object {
  return { key: `k${String(i)}`, result: value === undefined ? { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } : { ok: true, value } };
}

/** A list of the input. */
const input = (values: readonly (number | string | undefined)[]): object => ({ kind: "vex.list", items: values.map(inputItem) });
/**
 * One record, with the first number of `xs` in `n` and the first text of `ts` in `s`. The list of a sort has one item
 * for each number of `xs`, and one item for an empty `xs`.
 */
function recordOf(xs: readonly (number | undefined)[], ts: readonly (string | undefined)[] = []): object {
  return { n: xs[0] ?? 0, s: ts[0] ?? "", xs: input(xs.slice(1)), ts: input(ts.slice(1)) };
}

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** This function gives the source of a module with the option `fuse`, and fails the test for a program with no module. */
function sourceOf(e: Expr, fuse: boolean, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, { ...options, fuse });
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

const LOADED = new Map<Expr, readonly Loaded[]>();

/** This function gives the modules of `fuse` true and `fuse` false of a program, once for each program. */
function modulesOf(e: Expr): readonly Loaded[] {
  const known = LOADED.get(e);
  if (known !== undefined) return known;
  const loaded = [make(sourceOf(e, true)), make(sourceOf(e, false))];
  LOADED.set(e, loaded);
  return loaded;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (!isVexList(value)) return value;
  return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: x.result.value } : { ok: false, error } })) };
}

/** This function compares the two modules of a program with the interpreter at each record (P17). */
function expectSame(e: Expr, records: readonly unknown[]): void {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: {}, domains: DOMAINS }));
  for (const m of modulesOf(e)) expect(m.run(records, {})).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
}

/** This function adds one error item to the numbers of a list. */
const failed = (xs: readonly number[]): (number | undefined)[] => [...xs, undefined];

/** This function gives the count of the calls of the sort of the engine in a run of a module. */
function sortsOf(e: Expr, records: readonly unknown[]): number {
  const sort = vi.spyOn(Array.prototype, "sort");
  try {
    make(sourceOf(e, true)).run(records, {});
    return sort.mock.calls.length;
  } finally {
    sort.mockRestore();
  }
}

/** This function gives the keys of the items of a value of a module, in order. */
function keysOf(value: unknown): readonly string[] {
  return (value as { readonly items: readonly { readonly key: string }[] }).items.map((x) => x.key);
}

/** This function gives the keys that a stable sort gives for the list of `recordOf(xs)`. The first number has the key 0. */
function stableKeys(xs: readonly number[]): readonly string[] {
  const items = xs.map((x, i) => ({ x, key: i === 0 ? "0" : `k${String(i - 1)}` }));
  return items.toSorted((a, b) => a.x - b.x).map((y) => y.key);
}

/** The orders of the numbers of a test. Each order has ties, and `flip` also has 0 and -0. */
const ORDERS: readonly { readonly name: string; readonly of: (i: number, size: number) => number }[] = [
  { name: "rising", of: (i) => i % 7 },
  { name: "sorted", of: (i) => i },
  { name: "falling", of: (i, size) => size - i },
  { name: "ties", of: () => 1 },
  { name: "flip", of: (i) => (i % 3 === 0 ? (i % 2 === 0 ? 0 : -0) : i % 2 === 0 ? -1 : 1) },
];

/** This function gives the numbers of an order, with a size in items. */
const numbersOf = (order: (i: number, size: number) => number, size: number): number[] => Array.from({ length: size }, (_x, i) => order(i, size));

const FIRST_NUMBER_SORT = op("sortBy", NUMBERS);
const FIRST_TEXT_SORT = op("sortBy", TEXTS);
/** The programs over a fresh list of numbers: the sort with no option, and the sort values of each kind. */
const NUMBER_SORTS: readonly Expr[] = [FIRST_NUMBER_SORT, ...["abs", "negate", "big", "mixed", "flag", "lost", "fails", "sqrt"].map((x) => op("sortBy", NUMBERS, by(x)))];
/** The programs over a fresh list of texts: the sort with no option, and the sort values of a number and of a text. */
const TEXT_SORTS: readonly Expr[] = [FIRST_TEXT_SORT, op("sortBy", TEXTS, by("length")), op("sortBy", TEXTS, by("upper"))];

describe("COMPILE.MODULE.FUSE.SORT: the sort of a fresh list", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("COMPILE.MODULE.FUSE.SORT: the programs of this file sort in place", () => {
    for (const e of [FIRST_NUMBER_SORT, FIRST_TEXT_SORT]) expect(sourceOf(e, true)).toContain("function SBI(l) {");
    for (const e of [...NUMBER_SORTS.slice(1), ...TEXT_SORTS.slice(1)]) expect(sourceOf(e, true)).toContain("function SKI(l, f) {");
    expect(sourceOf(FIRST_NUMBER_SORT, false)).not.toContain("SBI");
  });

  it("COMPILE.MODULE.FUSE.SORT: a list of 64 items or fewer calls no sort of the engine, and a longer list calls it once", () => {
    for (const e of [op("sortBy", NUMBERS), op("sortBy", NUMBERS, by("abs"))]) {
      for (const size of [1, 2, 63, LIMIT]) expect(sortsOf(e, [recordOf(numbersOf((i) => -i, size))])).toBe(0);
      for (const size of [LIMIT + 1, LIMIT + 2]) expect(sortsOf(e, [recordOf(numbersOf((i) => -i, size))])).toBe(1);
    }
  });

  it("COMPILE.MODULE.FUSE.SORT: the limit counts the items with values, because the list has no error item at the sort", () => {
    for (const e of [op("sortBy", NUMBERS), op("sortBy", NUMBERS, by("abs"))]) {
      expect(sortsOf(e, [recordOf(failed(numbersOf((i) => -i, LIMIT)))])).toBe(0);
      expect(sortsOf(e, [recordOf(failed(numbersOf((i) => -i, LIMIT + 1)))])).toBe(1);
    }
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT: a list of numbers gets the order of the interpreter at each size", () => {
    for (const { of } of ORDERS) for (const size of SIZES) for (const e of NUMBER_SORTS) expectSame(e, [recordOf(numbersOf(of, size))]);
    // A stable sort of the numbers with their places is the second reference, and it does not use the interpreter.
    for (const size of SIZES.filter((x) => x > 0)) {
      const xs = numbersOf((i) => i % 7, size);
      const [m] = modulesOf(FIRST_NUMBER_SORT);
      expect(keysOf(m?.run([recordOf(xs)], {})[0])).toStrictEqual(stableKeys(xs));
    }
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT.BY: a list of equal items keeps its order, and an empty list gives an empty list", () => {
    const filled = op("fill", ref("n"), ref("n"));
    for (const e of [op("sortBy", filled), op("sortBy", filled, by("abs")), op("sortBy", filled, by("lost")), op("sortBy", filled, by("flag"))]) {
      expect(sourceOf(e, true)).toMatch(/S[BK]I\(/);
      for (const size of SIZES) expectSame(e, [{ n: size, s: "", xs: input([]), ts: input([]) }]);
    }
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT: texts compare by their code units, and equal texts keep their order", () => {
    // The first text has a surrogate pair, so its first code unit is smaller than the code unit of the last text.
    const words = ["😀", "￿", "b", "B", "a", "", "bb", "é", "é"];
    const list = (size: number): string[] => Array.from({ length: size }, (_x, i) => words[(i * 5) % words.length] ?? "");
    for (const size of SIZES) for (const e of TEXT_SORTS) expectSame(e, [recordOf([], list(size))]);
    expect(sourceOf(FIRST_TEXT_SORT, true)).toContain("SBI(");
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT: a number and a text in one list are an error at each place of the list", () => {
    for (const size of [LIMIT - 1, LIMIT, LIMIT + 1]) {
      for (const at of [0, Math.floor(size / 2), size - 1]) {
        const items = Array.from({ length: size }, (_x, i): ListItem => ({ key: String(i), result: { ok: true, value: i === at ? "a" : size - i } }));
        const mixed = op("append", op("fill", lit(1), ref("n")), lit(vexList(items)));
        expect(sourceOf(op("sortBy", mixed), true)).toContain("SBI(");
        expectSame(op("sortBy", mixed), [recordOf([0]), recordOf([1])]);
        expectSame(op("ifError", op("sortBy", mixed), NONE), [recordOf([0])]);
      }
    }
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT: NaN in an item is an error, also with no option by", () => {
    // The op `lost` declares the kind "string", so NaN reaches the check of the sort in the module.
    const lost = op("fill", lit(2), op("lost", ref("n")));
    const sorted = op("sortBy", lost);
    expect(sourceOf(sorted, true)).toContain("SBI(");
    for (const e of [sorted, op("ifError", sorted, NONE)]) expectSame(e, [recordOf([5]), recordOf([1])]);
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.SORT.BY: a sort value that fails is the error of the sort, also in the last item", () => {
    for (const size of [LIMIT - 1, LIMIT, LIMIT + 1]) {
      const low = numbersOf((i) => i % 3, size);
      for (const at of [0, Math.floor(size / 2), size - 1]) {
        const xs = low.map((x, i) => (i === at ? 5 : x));
        for (const name of ["fails", "mixed", "flag", "lost"]) {
          expectSame(op("sortBy", NUMBERS, by(name)), [recordOf(xs)]);
          expectSame(op("ifError", op("sortBy", NUMBERS, by(name)), NONE), [recordOf(xs)]);
        }
      }
    }
    expect(sourceOf(op("sortBy", NUMBERS, by("fails")), true)).toContain("SKI(");
  });

  it("COMPILE.MODULE.FUSE.SORT LIST.LENIENT: an error item of the input is not in the sort, at each size", () => {
    for (const size of SIZES) {
      const xs = numbersOf((i, all) => (all - i) % 5, size).map((x, i) => (i % 4 === 1 ? undefined : x));
      for (const e of NUMBER_SORTS) expectSame(e, [recordOf(xs)]);
    }
    expect(sourceOf(op("sortBy", NUMBERS), true)).not.toContain("=== E");
  });

  it("P17 COMPILE.MODULE.FUSE.SORT: random lists around the limit give the results of the interpreter", () => {
    const number = fc.oneof({ weight: 8, arbitrary: fc.integer({ min: -4, max: 4 }) }, { weight: 2, arbitrary: fc.constantFrom(0, -0, 0.5, -0.5, 1e21) }, { weight: 1, arbitrary: fc.constant(undefined) });
    const text = fc.oneof({ weight: 8, arbitrary: fc.constantFrom("", "a", "aa", "A", "b", "😀", "￿") }, { weight: 1, arbitrary: fc.constant(undefined) });
    const size = fc.constantFrom(0, 1, 2, 3, 8, 62, 63, 64, 65, 66, 67);
    const lists = size.chain((length) => fc.record({ xs: fc.array(number, { minLength: length, maxLength: length }), ts: fc.array(text, { minLength: length, maxLength: length }) }));
    const programs = [...NUMBER_SORTS, ...TEXT_SORTS];
    fc.assert(
      fc.property(lists, fc.constantFrom(...programs), ({ xs, ts }, e) => {
        expectSame(e, [recordOf(xs, ts)]);
      }),
      { seed: 20261103, numRuns: 400 },
    );
    expect(programs.every((e) => /S[BK]I\(/.test(sourceOf(e, true)))).toBe(true);
  });
});

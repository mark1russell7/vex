/**
 * An each that gives its list again (COMPILE.MODULE.EACH.SAME). The axis is `list`, and the body is a read of the name
 * of the item. With `fuse`, the module gives the array of the list, with no copy. The value is not fresh, so no op
 * changes that array in place. The values and the errors stay those of the interpreter (P17).
 */
import { app, axes, each, evaluate, fold, isVexList, iterate, let_, lit, offset, rec, ref, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";
import { emitModule, listFactsOf, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", w: "number", b: "boolean", xs: { list: "number" }, nest: { list: { list: "number" } } }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const VARS = { a: 1 };

/** This function gives a good item of a list, as plain data. */
const good = (key: string, value: unknown): object => ({ key, result: { ok: true, value } });
/** This function gives an error item of a list, as plain data. */
const bad = (key: string): object => ({ key, result: { ok: false, error: { code: "#VALUE!", kind: "value", message: "no value", path: [] } } });
/** This function gives a `vex.list` of items, as plain data. */
const list = (...items: object[]): object => ({ kind: "vex.list", items });

/** The records of the tests. The record with `w` 0 gives an error of `divide`, and some lists have error items. */
const RECORDS = [
  { n: 3, w: 1, b: true, xs: list(good("a", 3), good("b", 1), good("c", 2)), nest: list(good("0", list(good("a", 1), good("b", 2))), good("1", list())) },
  { n: -1, w: 0, b: false, xs: list(good("a", 5), bad("b"), good("c", -1)), nest: list(good("k", list(bad("z"), good("y", 4)))) },
  { n: 2, w: 2.5, b: true, xs: list(), nest: list() },
  { n: 0, w: -1, b: false, xs: list(good("only", 7)), nest: list(bad("e"), good("f", list(good("g", 0)))) },
];

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

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr): string {
  const m = emitModule(e, OPTIONS);
  return m.ok ? "" : m.reason;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/**
 * This function compares the values of a module with the interpreter at each key, with `fuse` on and off (P17). It runs
 * each module two times on the same input, and the input must not change. It gives the source of the module of `fuse`.
 */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): string {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: OPTIONS.domains ?? [] }));
  for (const fuse of [true, false]) {
    const m = make(sourceOf(e, fuse));
    const expected = results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR));
    const input = structuredClone(records);
    expect(m.run(input, VARS)).toStrictEqual(expected);
    expect(m.run(input, VARS)).toStrictEqual(expected);
    expect(input).toStrictEqual(records);
  }
  return sourceOf(e);
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const b = ref("b");
const xs = ref("xs");
const nest = ref("nest");
const acc = v("acc");
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
/** The each of this rule: the axis `list`, and a body that reads the item. */
const same = (l: Expr, as: readonly [string] | readonly [string, string] = ["y"]): Expr => each(axes.list(l), v(as[0]), undefined, as);
/** A fold over all records with the one name `acc`. */
const folded = (init: Expr, step: Expr, result: Expr = acc): Expr => fold(axes.all, { acc: init }, { acc: step }, result);

/**
 * The source copies a list item by item: a loop whose body is the item. The loop of a clean list pushes the item, and
 * the loop of another list gives the item in a `try`.
 */
const COPY = /const (y\d+) = A\d+\[q\d+\]\[1\];\n(?:\s*const i\d+ = z\d+\+\+;\n)?\s*(?:L\d+\.push\(\[j\d+, \1\]\);|x\d+ = \1;)/;
/**
 * The count of the appends of the source into the array of a loop: an `AO`, `AOC`, `AI` or `AIC` into `wN`, a push into
 * `wN`, or a target of the pushes of COMPILE.MODULE.APPEND.PUSH: `AW`, `AWC` or the list of the name.
 */
const owned = (source: string): number => (source.match(/\(w\d+ = A[OI]C?\(|\.push\(\[0, .*?\]\), w\d+\)|const o\d+ = (?:AWC?\(|l\d+;)/g) ?? []).length;

/** The programs of the rule. Each one has at least one each of the rule. */
const FORMS: Readonly<Record<string, Expr>> = {
  input: same(xs),
  index: same(xs, ["y", "k"]),
  twice: same(same(xs)),
  literal: same(LIT),
  errorItems: same(BAD),
  records: same(inv),
  fill: same(op("fill", lit(2), n)),
  empty: same(NONE),
  inner: same(op("nth", nest, lit(0))),
  // nth past the end gives an error, so the list of the each is an error.
  failed: same(op("nth", nest, lit(5))),
  nested: same(nest),
  count: op("count", same(xs)),
  strictCount: op("count", same(xs), strict),
  sum: op("sum", same(inv)),
  flat: op("flat", same(nest)),
  appended: op("append", same(xs), same(BAD)),
  sorted: op("sortBy", same(xs)),
  taken: op("take", same(inv), lit(2)),
  keyed: op("ifError", op("get", same(LIT), lit("b")), lit(-1)),
  mapped: each(axes.list(same(BAD)), op("multiply", v("z"), lit(2)), undefined, ["z"]),
  record: rec({ s: same(xs), t: op("count", same(xs)) }),
  bound: let_({ l: same(xs) }, op("append", v("l"), same(v("l")))),
};

describe("COMPILE.MODULE.EACH.SAME: an each that gives its list again", () => {
  it("COMPILE.MODULE.EACH.SAME: with fuse, the module gives the array of the list, with no copy (P17)", () => {
    for (const [name, e] of Object.entries(FORMS)) {
      const source = expectSame(e);
      expect({ name, copy: COPY.test(source) }).toStrictEqual({ name, copy: false });
      // With fuse false, the module keeps the copy of the version before this rule (COMPILE.MODULE.FUSE.OFF).
      expect({ name, copy: COPY.test(sourceOf(e, false)) }).toStrictEqual({ name, copy: true });
    }
  });

  it("COMPILE.MODULE.EACH.SAME: an error item stays an error item, and a list that fails gives the error", () => {
    const m = make(sourceOf(same(xs)));
    expect(m.run(structuredClone(RECORDS), VARS)[1]).toStrictEqual({
      kind: "vex.list",
      items: [
        { key: "a", result: { ok: true, value: 5 } },
        { key: "b", result: { ok: false, error: m.VEX_ERROR } },
        { key: "c", result: { ok: true, value: -1 } },
      ],
    });
    const failed = make(sourceOf(FORMS["failed"] ?? NONE));
    expect(failed.run(structuredClone(RECORDS), VARS)).toStrictEqual(RECORDS.map(() => failed.VEX_ERROR));
  });

  it("COMPILE.MODULE.EACH.SAME: each other each over a list keeps its loop (P17)", () => {
    const others: Readonly<Record<string, Expr>> = {
      // The test of where reads the record at the key of each item (AXIS.LIST.SCOPE).
      where: each(axes.where(axes.list(inv), op("gt", n, lit(0))), v("y"), undefined, ["y"]),
      reverse: each(axes.reverse(axes.list(xs)), v("y"), undefined, ["y"]),
      index: each(axes.list(xs), v("k"), undefined, ["y", "k"]),
      outer: let_({ z: lit(4) }, each(axes.list(xs), v("z"), undefined, ["y"])),
      // Without the names "as", the body reads the variable "a" at each target.
      noNames: each(axes.list(xs), v("a")),
      op: each(axes.list(xs), op("add", v("y"), lit(0)), undefined, ["y"]),
    };
    for (const [name, e] of Object.entries(others)) {
      const source = expectSame(e);
      expect({ name, loop: /for \(let q\d+ = /.test(source) }).toStrictEqual({ name, loop: true });
    }
  });

  it("COMPILE.MODULE.EACH.SAME: an each with an address keeps the reason of the axis list", () => {
    expect(reasonOf(each(axes.list(xs), v("y"), [offset(1)], ["y"]))).toBe('the axis "list" with an address');
  });

  it("COMPILE.MODULE.EACH.SAME: a loop over the keys of a literal reads no record there, as for its list", () => {
    const reason = 'the axis "list" reads a record at a key of a literal or of "fill"';
    expect(reasonOf(each(axes.list(LIT), n))).toBe(reason);
    expect(reasonOf(each(axes.list(same(LIT)), n))).toBe(reason);
    expect(reasonOf(each(axes.list(same(op("fill", lit(2), n))), n))).toBe(reason);
    // The keys of the records stay the keys of the records, so a loop over them reads each record.
    expectSame(op("sum", each(axes.list(same(inv)), n)));
  });

  it("COMPILE.MODULE.EACH.SAME COMPILE.MODULE.LOOP.EMPTY: the each of a name that starts empty decides no kind in a search (P17)", () => {
    const out = v("out");
    const sorted = (l: Expr): Expr => op("sortBy", l, lit({ by: "negate" }));
    const sweep = (step: Expr): Expr => fold(axes.all, { out: lit(vexList([])) }, { out: step }, out);
    expect(reasonOf(sorted(sweep(same(out))))).toBe('the kinds of the items of "sortBy" do not decide the op "negate" of the option by');
    expect(COPY.test(expectSame(sorted(sweep(op("append", same(out), one(n))))))).toBe(false);
    expect(COPY.test(expectSame(sorted(sweep(op("if", b, same(out), op("append", out, one(n)))))))).toBe(false);
  });

  it("COMPILE.MODULE.EACH.SAME: the facts of the each are the facts of its list, and the list is not fresh", () => {
    const factOf = (e: ReturnType<typeof same>): { readonly clean: boolean; readonly fresh: boolean } | undefined => listFactsOf(() => emitModule(op("count", e), OPTIONS)).facts.get(e);
    expect(factOf(same(LIT))).toMatchObject({ clean: true, fresh: false });
    expect(factOf(same(op("fill", lit(2), n)))).toMatchObject({ clean: true, fresh: false });
    expect(factOf(same(BAD))).toMatchObject({ clean: false, fresh: false });
    expect(factOf(same(xs))).toMatchObject({ clean: false, fresh: false });
  });
});

describe("COMPILE.MODULE.EACH.SAME: no op changes the array of the list", () => {
  it("COMPILE.MODULE.EACH.SAME: a sort, an append and a first list of a loop copy the array, and the list does not change (P17)", () => {
    const l = v("l");
    const forms: Readonly<Record<string, Expr>> = {
      // sortBy sorts a fresh list in place (COMPILE.MODULE.FUSE), so a list that a name holds must keep its order.
      sort: let_({ l: xs }, rec({ s: op("sortBy", same(l)), l })),
      sortFill: let_({ l: op("fill", lit(3), n) }, rec({ s: op("sortBy", same(l), lit({ by: "negate" })), l })),
      sortLit: let_({ l: lit(vexList([item("a", 3), item("b", 1), item("c", 2)])) }, rec({ s: op("sortBy", same(l)), l })),
      append: let_({ l: xs }, rec({ s: op("append", same(l), one(n)), l })),
      // An append into the array of a loop takes only a fresh first list (COMPILE.MODULE.FUSE.ADOPT).
      first: let_({ l: LIT }, rec({ r: folded(same(l), op("append", acc, one(n))), l })),
      firstFill: let_({ l: op("fill", lit(2), n) }, rec({ r: folded(same(l), op("append", acc, one(n))), l })),
      firstDirect: rec({ r: folded(same(op("fill", lit(2), n)), op("append", acc, one(n))) }),
    };
    for (const [name, e] of Object.entries(forms)) expect({ name, copy: COPY.test(expectSame(e)) }).toStrictEqual({ name, copy: false });
  });

  it("COMPILE.MODULE.EACH.SAME COMPILE.MODULE.APPEND.OTHER: the each of the list of a loop keeps the values of each step (P17)", () => {
    const base = v("base");
    const many = Array.from({ length: 9 }, (_x, i) => ({ ...(RECORDS[i % 4] as object), n: (i % 5) - 1, w: (i % 3) + 1, b: i % 3 === 0 }));
    const forms: Readonly<Record<string, Expr>> = {
      branch: folded(NONE, op("if", b, same(acc), op("append", acc, one(n)))),
      relay: folded(LIT, let_({ base: op("if", b, same(acc), acc) }, op("if", op("gt", n, lit(0)), op("append", base, one(n)), base))),
      // The each reads the list before the push, and the step gives the old list again after the push.
      snapshot: folded(LIT, let_({ base: op("if", b, same(acc), acc) }, op("append", base, one(op("count", acc))))),
      later: fold(axes.all, { acc: LIT, r: NONE }, { acc: op("append", acc, one(n)), r: same(acc) }, rec({ acc, r: v("r") })),
      result: folded(LIT, op("append", acc, one(n)), rec({ a: same(acc), b: op("append", acc, one(lit(9))) })),
      read: folded(LIT, op("append", same(acc), one(n))),
      iterated: iterate(4, { acc: LIT }, { acc: let_({ base: op("if", op("gt", op("count", acc), lit(4)), same(acc), acc) }, op("append", base, one(lit(4)))) }, acc),
    };
    for (const [name, e] of Object.entries(forms)) {
      expectSame(e);
      expectSame(e, many);
      expect({ name, copy: COPY.test(sourceOf(e)) }).toStrictEqual({ name, copy: false });
    }
    // A branch of the rule is another list, so the loop still appends into its array (COMPILE.MODULE.APPEND.OTHER).
    expect(owned(sourceOf(forms["relay"] ?? NONE))).toBeGreaterThan(0);
    expect(owned(sourceOf(forms["branch"] ?? NONE))).toBeGreaterThan(0);
  });

  it("COMPILE.MODULE.EACH.SAME: the module gives the values of the interpreter for each set of records (P17)", () => {
    const programs = [...Object.values(FORMS), folded(LIT, let_({ base: op("if", b, same(acc), acc) }, op("append", v("base"), one(n))))];
    const records = fc.array(
      fc.record({
        n: fc.integer({ min: -3, max: 3 }),
        w: fc.integer({ min: 0, max: 2 }),
        b: fc.boolean(),
        xs: fc.array(fc.option(fc.integer({ min: -5, max: 5 }), { nil: undefined }), { maxLength: 4 }).map((ys) => list(...ys.map((y, i) => (y === undefined ? bad(String(i)) : good(String(i), y))))),
        nest: fc.array(fc.array(fc.integer({ min: -5, max: 5 }), { maxLength: 3 }), { maxLength: 3 }).map((yss) => list(...yss.map((ys, i) => good(String(i), list(...ys.map((y, j) => good(String(j), y))))))),
      }).map((r) => ({ ...r })),
      { maxLength: 4 },
    );
    fc.assert(
      fc.property(records, fc.integer({ min: 0, max: programs.length - 1 }), (rs, i) => {
        expectSame(programs[i] ?? NONE, rs);
      }),
      { timeout: propertyTimeout(60_000) },
    );
  });
});

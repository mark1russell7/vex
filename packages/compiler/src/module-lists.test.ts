/**
 * Lists in standalone modules (docs/COMPILER.md §8.3, design E, block 3). A module has the list ops that build a list,
 * `get`, `indexOf`, list literals, lists through a let and lists as the state of a loop (COMPILE.MODULE.LIST).
 */
import { app, axes, each, evaluate, fold, iterate, let_, lit, rec, ref, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number", k: "string" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
/** The field `id` names the key of a record, as in the force pilot. The key "x" is not in the space. */
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true },
  { id: "2", n: -1, w: 0, b: false },
  { id: "0", n: 2, w: 2.5, b: true },
  { id: "x", n: 0, w: -1, b: false },
];
const VARS = { a: 1, k: "1" };

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

/** This function compares the values of a module with the interpreter at each key. */
function expectSame(m: Loaded, e: Expr, records: readonly unknown[] = RECORDS, vars: Readonly<Record<string, unknown>> = VARS): void {
  const got = m.run(structuredClone(records), vars);
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars, domains: OPTIONS.domains ?? [] });
    return r.ok ? r.value : m.VEX_ERROR;
  });
  expect(got).toStrictEqual(expected);
}

/** This function checks a golden file of a module and its values at each key. */
async function expectGolden(name: string, e: Expr): Promise<void> {
  const source = sourceOf(e);
  await expect(source).toMatchFileSnapshot(`./__golden__/module-${name}.js`);
  const m = make(source);
  expectSame(m, e);
  expectSame(m, e, RECORDS.slice(0, 2));
  expectSame(m, e, []);
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const id = ref("id");
const strict = lit({ strict: true });
const guard = (e: Expr): Expr => op("ifError", e, lit(-1));
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });
/** The lists of the tests: the values of each record, with an error item where `w` is 0, and literals. */
const ns = each(axes.all, n);
const inv = each(axes.all, op("divide", lit(1), w));
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const BAD = lit(vexList([item("a", 1), errorItem("b"), item("c", 4)]));
const EMPTY = lit(vexList([]));
/** A list of lists: the values of the window of each record. */
const nested = (axis = axes.window(0, 1)): Expr => each(axes.all, each(axis, n));
const undecided = (name: string): string => `the kinds of the values of "${name}" do not decide its op`;

describe("COMPILE.MODULE.LIST: the list ops of design E in a module", () => {
  it("COMPILE.MODULE.LIST LIST.GET LIST.DROP LIST.APPEND LIST.WITHOUT LIST.FLAT LIST.INDEXOF LIST.LITERAL: a module gives the values and the errors of the interpreter", async () => {
    const e = rec({
      // LIST.GET: the first item of a key, LIST.LENIENT, strict, a key that is not a text and a missing key.
      own: guard(op("get", ns, id)),
      first: op("get", LIT, lit("a")),
      missing: guard(op("get", LIT, lit("z"))),
      notText: guard(op("get", ns, lit(1))),
      lenient: op("get", BAD, lit("c")),
      strictGet: guard(op("get", BAD, lit("c"), strict)),
      errorKey: guard(op("get", BAD, lit("b"))),
      noKey: guard(op("get", ns)),
      byVar: guard(op("get", inv, v("k"))),
      // LIST.DROP
      dropped: op("sum", op("drop", ns, lit(1))),
      dropAll: op("count", op("drop", ns, lit(10))),
      dropBad: guard(op("count", op("drop", ns, lit(-1)))),
      dropNone: guard(op("count", op("drop", ns))),
      dropStrict: guard(op("count", op("drop", inv, lit(0), strict))),
      dropKey: guard(op("get", op("drop", ns, lit(1)), lit("0"))),
      // LIST.APPEND: the items of the first list come first, and two items can have one key.
      appended: op("sum", op("append", ns, LIT)),
      appendFirst: op("get", op("append", LIT, ns), lit("1")),
      appendStrict: guard(op("count", op("append", ns, inv, strict))),
      appendLenient: op("count", op("append", inv, BAD)),
      appendEmpty: op("count", op("append", EMPTY, op("append", ns, EMPTY))),
      // LIST.WITHOUT: the keys of the other list, as texts. An error item of the other list removes no key.
      without: op("sum", op("without", ns, op("take", ns, lit(2)))),
      withoutLit: op("count", op("without", op("append", LIT, ns), LIT)),
      withoutLenient: op("count", op("without", ns, inv)),
      withoutStrict: guard(op("count", op("without", ns, inv, strict))),
      // LIST.FLAT: the items of the lists of the items, in order, with their keys.
      flat: op("sum", op("flat", nested(axes.window(-1, 0)))),
      flatKey: guard(op("get", op("flat", nested()), lit("2"))),
      flatErrors: op("count", op("flat", each(axes.all, inv))),
      flatStrict: guard(op("count", op("flat", each(axes.all, inv)), strict)),
      flatEmpty: op("count", op("flat", EMPTY)),
      // LIST.INDEXOF: the position among the items with a value, from 0.
      index: guard(op("indexOf", ns, n)),
      indexLit: op("indexOf", LIT, lit(2)),
      indexMissing: guard(op("indexOf", ns, lit(99))),
      indexBad: guard(op("indexOf", ns, lit(null))),
      indexNone: guard(op("indexOf", ns)),
      indexStrict: guard(op("indexOf", inv, lit(1), strict)),
      indexLenient: guard(op("indexOf", inv, lit(1))),
      // A list of lists: first, nth and get give a list, which a let binds.
      nestedFirst: let_({ y: op("first", nested()) }, op("sum", v("y"))),
      nestedCount: op("count", nested()),
      nestedNth: let_({ y: op("nth", nested(), lit(1)) }, op("count", v("y"))),
      nestedGet: guard(let_({ y: op("get", each(axes.all, each(axes.window(-1, 0), w)), id) }, op("sum", v("y")))),
      // A literal with sortBy, and a list op over a let (LIST.VALUE). A builder sheet prints sum(let($0 = 0, each(…))).
      sortedLit: op("first", op("sortBy", LIT)),
      sheet: op("sum", let_({ $0: lit(0) }, each(axes.all, op("add", n, v("$0"))))),
      sheetStrict: guard(op("sum", let_({ z: lit(1) }, each(axes.all, op("divide", v("z"), w))), strict)),
      sheetNested: op("count", let_({ z: lit(1) }, let_({ y: lit(2) }, each(axes.where(axes.all, ref("b")), op("add", v("z"), v("y")))))),
      nthLet: op("nth", let_({ z: lit(1) }, op("sortBy", ns)), lit(0)),
      getLet: guard(op("get", let_({ z: lit(1) }, each(axes.all, op("add", n, v("z")))), id)),
    });
    await expectGolden("list-build", e);
  });

  it("COMPILE.MODULE.LIST LOOP.LIST: a name of iterate and of fold holds a list, and a step reads the old values with get", async () => {
    // The force pilot in one dimension: each step moves each record by the old values of the others, by their keys.
    const old = (x: Expr): Expr => op("get", v("p"), x);
    const step = each(axes.all, op("add", old(id), op("multiply", lit(0.5), op("sum", each(axes.others, op("subtract", old(id), n))))));
    const layout = iterate(3, { p: each(axes.all, w) }, { p: step }, v("p"));
    const e = rec({
      layout: guard(op("get", layout, id)),
      count: op("count", layout),
      // A stack: push the value of each target, and pop the top when b is false. The first list is empty.
      stack: fold(axes.all, { st: EMPTY }, { st: op("append", each(axes.window(0, 0), n), op("drop", v("st"), op("if", ref("b"), lit(0), lit(1)))) }, op("sum", v("st"))),
      // A step with a literal gives the name the keys of the literal. A fold gives its list to a list op.
      seen: op("count", fold(axes.all, { s: EMPTY }, { s: op("append", v("s"), LIT) }, v("s"))),
      // iterate with until, and a name of a list next to a name of a number.
      until: iterate(10, { s: ns, c: lit(0) }, { s: op("drop", v("s"), lit(1)), c: op("add", v("c"), lit(1)) }, v("c"), op("lt", op("count", v("s")), lit(2))),
      // A loop over the items of a loop list (AXIS.LIST), and a list of each key.
      overList: fold(axes.list(iterate(1, { p: ns }, { p: op("drop", v("p"), lit(1)) }, v("p"))), { d: lit(0) }, { d: op("add", v("d"), w) }, v("d")),
      perKey: iterate(2, { p: each(axes.window(-1, 1), n) }, { p: op("append", v("p"), each(axes.window(0, 0), w)) }, op("sum", v("p"))),
      // A list of lists as the state of a loop.
      lists: iterate(2, { q: nested() }, { q: op("drop", v("q"), lit(1)) }, op("count", op("flat", v("q")))),
      // An error of a step is the value of the loop.
      error: guard(iterate(2, { p: ns }, { p: each(axes.all, op("get", v("p"), lit("nope"))) }, op("sum", v("p")))),
    });
    await expectGolden("list-loops", e);
  });

  it("COMPILE.MODULE.LIST: a construct that a module does not have gives a precise reason", () => {
    const record = lit(vexList([item("a", { x: 1 })]));
    expect(reasonOf(op("count", record))).toBe("a literal is not a number, a text, a boolean or null");
    // The focus of the axis list is the position of a record, so a list with the keys of a literal gives a reason.
    expect(reasonOf(op("count", each(axes.list(LIT), n)))).toBe('the axis "list" over a list with the keys of a literal');
    expect(reasonOf(fold(axes.list(op("append", ns, LIT)), { d: lit(0) }, { d: n }, v("d")))).toBe('the axis "list" over a list with the keys of a literal');
    expect(reasonOf(op("count", op("flat", ns)))).toBe('"flat" over a list whose items are not lists');
    expect(reasonOf(op("count", op("append", nested(), ns)))).toBe('"append" of a list of lists and a list of values');
    expect(reasonOf(op("count", op("append", ns, nested())))).toBe('"append" of a list of lists and a list of values');
    expect(reasonOf(op("count", op("append", ns)))).toBe("a list op on a value that is not a list");
    expect(reasonOf(op("count", op("without", ns, lit(1))))).toBe("a list op on a value that is not a list");
    // A list is a value only at a place that takes a list. The value of the program is such a place
    // (COMPILE.MODULE.LIST.RESULT).
    expect(reasonOf(iterate(2, { p: ns }, { p: ns }, v("p")))).toBe("");
    expect(reasonOf(op("first", nested()))).toBe("");
    expect(reasonOf(LIT)).toBe("");
    expect(reasonOf(op("add", op("get", nested(), id), lit(1)))).toBe("a list is a value of the program");
    expect(reasonOf(op("add", op("first", nested()), lit(1)))).toBe("a list is a value of the program");
    // A step keeps the kind of the name and the kind of its items. A literal under another name gives keys of a literal.
    expect(reasonOf(iterate(2, { p: ns }, { p: each(axes.all, ref("b")) }, op("count", v("p"))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(iterate(2, { p: ns }, { p: op("append", v("p"), each(axes.all, id)) }, op("count", v("p"))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(let_({ l: LIT }, iterate(2, { p: ns }, { p: op("append", v("p"), v("l")) }, op("count", v("p")))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(iterate(2, { p: ns }, { p: nested() }, op("count", v("p"))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(iterate(2, { p: nested() }, { p: ns }, op("count", v("p"))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(iterate(2, { p: nested(), q: ns }, { p: each(axes.all, each(axes.all, ref("b"))) }, op("count", v("p"))))).toBe('a step of a loop gives the name "p" a list that does not fit its first list');
    expect(reasonOf(iterate(2, { p: ns }, { p: lit(1) }, lit(0)))).toBe('a step of a loop changes the kind of the name "p"');
    expect(reasonOf(iterate(2, { p: lit(1) }, { p: ns }, lit(0)))).toBe('a step of a loop changes the kind of the name "p"');
    // The first list fixes the kind of the items. The empty literal has no kind, so get gives a value of no kind.
    expect(reasonOf(iterate(2, { p: EMPTY }, { p: op("append", v("p"), ns) }, op("add", op("get", v("p"), lit("0")), lit(1))))).toBe(undecided("add"));
    // A domain op with the name of a list op on a value that is not a list is a domain op.
    expect(reasonOf(op("count", op("drop", n, lit(1))))).toBe(undecided("drop"));
    expect(reasonOf(op("get", n, lit(1)))).toBe(undecided("get"));
  });

  it("COMPILE.MODULE.LIST LIST.GET: a step that reads each key of a list builds the index of the list once", () => {
    // The index of the keys stays on the array, so the run reads each list once for each step, not once for each key.
    const e = op("sum", iterate(4, { p: ns }, { p: each(axes.all, op("add", op("get", v("p"), id), lit(1))) }, v("p")));
    const source = sourceOf(e);
    expect(source).toContain("function GT(l, k, s) {");
    expect(source.match(/GT\(/g)?.length).toBe(2);
    const many = Array.from({ length: 300 }, (_x, i) => ({ id: String(299 - i), n: i % 7, w: 1, b: true }));
    expectSame(make(source), e, many);
  });

  it("COMPILE.MODULE.NTH.INDEX LIST.NTH: a loop that reads each item of a list with nth filters the list once", () => {
    // The items with values stay on the array, so each nth after the first does not read the list again. The strict nth
    // and the lenient nth share them, and an error item still fails the strict nth.
    const lenient = op("ifError", op("nth", v("xs"), n), lit(-1));
    const strictNth = op("ifError", op("nth", v("xs"), n, strict), lit(-2));
    const e = let_({ xs: inv }, op("add", op("sum", each(axes.all, lenient)), op("sum", each(axes.list(v("xs")), strictNth))));
    const source = sourceOf(e);
    expect(source).toContain("l.vw = o;");
    const many = Array.from({ length: 300 }, (_x, i) => ({ id: String(i), n: i % 7, w: i % 50 === 0 ? 0 : (i % 3) + 1, b: true }));
    const clean = many.map((r) => ({ ...r, w: 1 }));
    const m = make(source);
    for (const records of [many, clean, RECORDS]) expectSame(m, e, records);
    // The run of 300 keys calls filter once for the one list, not once for each key.
    const filter = vi.spyOn(Array.prototype, "filter");
    try {
      m.run(clean, VARS);
      expect(filter).toHaveBeenCalledTimes(1);
    } finally {
      filter.mockRestore();
    }
    // The list of the let is a key of a node of the memo. A list that changes at each key is a key of its function.
    const window = let_({ xs: each(axes.window(-1, 1), w) }, op("sum", each(axes.all, op("ifError", op("nth", v("xs"), n), lit(0)))));
    const twice = let_({ xs: inv, ys: ns }, op("add", op("sum", each(axes.all, op("ifError", op("nth", v("xs"), n), lit(0)))), op("sum", each(axes.all, op("nth", v("ys"), op("abs", n))))));
    for (const p of [window, twice]) for (const records of [many, RECORDS]) expectSame(make(sourceOf(p)), p, records);
  });
});

/** A record of the property: an id that names a key, or not. */
const record = fc.record({
  id: fc.constantFrom("0", "1", "2", "x"),
  n: fc.integer({ min: -3, max: 3 }),
  w: fc.constantFrom(0, 1, -1, 2.5),
  b: fc.boolean(),
});
const records = fc.array(record, { maxLength: 6 });

describe("COMPILE.MODULE.LIST P17: random programs with lists", { timeout: 60_000 }, () => {
  // The lists: from an axis, with error items and literals, and from the list ops that build a list.
  const base = fc.constantFrom<Expr>(ns, each(axes.all, w), inv, each(axes.where(axes.all, ref("b")), n), each(axes.window(-1, 1), n), each(axes.reverse(axes.all), w), LIT, BAD, EMPTY);
  const opts = fc.boolean().map((s) => (s ? [strict] : []));
  const built: fc.Arbitrary<Expr> = fc.oneof(
    base,
    fc.tuple(base, fc.integer({ min: -1, max: 3 }), opts).map(([l, k, o]) => op("drop", l, lit(k), ...o)),
    fc.tuple(base, base, opts).map(([l, m, o]) => op("append", l, m, ...o)),
    fc.tuple(base, base, opts).map(([l, m, o]) => op("without", l, m, ...o)),
    fc.tuple(base, fc.integer({ min: 0, max: 2 })).map(([l, k]) => op("take", op("sortBy", op("append", l, ns)), lit(k))),
    fc.tuple(fc.constantFrom(axes.window(-1, 0), axes.all, axes.where(axes.all, ref("b"))), opts).map(([a, o]) => op("flat", each(axes.all, each(a, op("divide", n, w))), ...o)),
  );
  const list: fc.Arbitrary<Expr> = fc.oneof(built, fc.tuple(built, built).map(([l, m]) => op("append", op("drop", l, lit(1)), m)));
  const keys = fc.constantFrom<Expr>(id, v("k"), lit("a"), lit("0"), lit(1), ref("n"));
  const values = fc.constantFrom<Expr>(n, lit(1), lit("a"), ref("b"), lit(null));
  const uses: fc.Arbitrary<(l: Expr) => Expr> = fc.oneof(
    fc.tuple(fc.constantFrom("count", "sum", "first", "max", "mean"), opts).map(([o, s]) => (l: Expr) => op(o, l, ...s)),
    fc.tuple(keys, opts).map(([k, s]) => (l: Expr) => op("get", l, k, ...s)),
    fc.tuple(values, opts).map(([x, s]) => (l: Expr) => op("indexOf", l, x, ...s)),
    // The list through a let, as a builder sheet prints it.
    fc.constant((l: Expr) => op("sum", let_({ $0: lit(1) }, l))),
    // The list as the state of a loop: a stack, a queue and a layout that reads the old values with get.
    fc.integer({ min: 0, max: 3 }).map((k) => (l: Expr) => let_({ xs: l }, iterate(k, { p: v("xs") }, { p: op("append", op("drop", v("p"), lit(1)), v("xs")) }, op("count", v("p"))))),
    fc.constant((l: Expr) => let_({ xs: l }, fold(axes.all, { st: v("xs") }, { st: op("without", v("st"), each(axes.window(0, 0), n)) }, op("count", v("st"))))),
    fc.integer({ min: 0, max: 3 }).map((k) => (l: Expr) => let_({ xs: l }, op("get", iterate(k, { p: v("xs") }, { p: op("append", each(axes.all, op("get", v("p"), ref("id"))), v("p")) }, v("p")), id))),
  );
  const programs = fc.tuple(list, uses).map(([l, use]) => use(l));

  it("P17 COMPILE.MODULE.LIST LOOP.LIST: a module with the list ops of design E gives the value of the interpreter at each key", () => {
    fc.assert(
      fc.property(programs, records, fc.constantFrom("0", "1", "a", "x"), (e, rs, k) => {
        expectSame(make(sourceOf(e)), e, rs, { a: 1, k });
      }),
    );
  });
});

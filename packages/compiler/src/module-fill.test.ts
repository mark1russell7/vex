/**
 * `fill` in standalone modules (COMPILE.MODULE.FILL). Without a domain with the op, `fill(n, value)` gives a list of `n`
 * items with the value, and the keys "0" to "n - 1" (LIST.FILL). The module gives the values and the errors of the
 * interpreter.
 */
import { app, axes, call, cell, defineDomain, each, evaluate, fn, fold, isVexList, iterate, let_, lit, rec, ref, SheetRun, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { factsOf } from "./facts.ts";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, parents?: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** A domain of numbers with the op `fill`. The op of a domain comes first, so `fill` gives a number. */
const FillOps = defineDomain({
  name: "FillOps",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  ops: { fill: { fn: (a: number, b: number): number => a * 10 + b, params: ["number"], returns: "number" } },
});

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true },
  { id: "2", n: -1, w: 0, b: false },
  { id: "0", n: 2, w: 2.5, b: true },
  { id: "x", n: 0, w: -1, b: false },
];
/** Forty records: `n` from 0 to 6 with a negative value at each ninth record, and `w` 0 at each tenth record. */
const MANY = Array.from({ length: 40 }, (_x, i) => ({ id: String(i), n: i % 9 === 4 ? -2 : i % 7, w: i % 10 === 0 ? 0 : (i % 3) + 1, b: i % 2 === 0 }));

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function compares the values of a module with the interpreter at each key (P17), and gives the source. */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: options.domains ?? [] }));
  // The module of fuse false gives the same values (COMPILE.MODULE.FUSE.CLEAN).
  const off = emitModule(e, { ...options, fuse: false });
  for (const source of [m.source, off.ok ? off.source : ""]) {
    const loaded = make(source);
    expect(loaded.run(structuredClone(records), { a: 2 })).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR)));
  }
  return m.source;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const guard = (e: Expr): Expr => op("ifError", e, lit(-1));
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const ns = each(axes.all, n);
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const EMPTY = lit(vexList([]));
const READS = 'the axis "list" reads a record at a key of a literal or of "fill"';

describe("COMPILE.MODULE.FILL: fill in a module", () => {
  it("COMPILE.MODULE.FILL LIST.FILL: the list ops read the list of fill, with the values and the errors of the interpreter", () => {
    const e = rec({
      count: op("count", op("fill", lit(3), n)),
      sum: guard(op("sum", op("fill", n, lit(2)))),
      nth: op("nth", op("fill", lit(2), w), lit(1)),
      // The items have the kind of the value, so an op on an item has a static site.
      added: op("add", op("nth", op("fill", lit(2), n), lit(1)), lit(1)),
      get: op("get", op("fill", lit(3), n), lit("1")),
      missing: guard(op("get", op("fill", lit(3), n), lit("3"))),
      indexOf: op("indexOf", op("fill", lit(3), n), n),
      sorted: op("first", op("sortBy", op("append", op("fill", lit(1), n), op("fill", lit(2), w)))),
      taken: op("count", op("take", op("fill", lit(4), ref("b")), lit(2))),
      without: op("count", op("without", op("append", op("fill", lit(2), n), ns), op("fill", lit(1), n))),
      reduced: op("reduce", op("fill", lit(3), w), lit("add")),
      // A list of lists: each item holds the list of the value.
      flat: op("sum", op("flat", op("fill", lit(2), ns))),
      inner: op("sum", op("flat", op("take", op("fill", lit(2), ns), lit(1)))),
      // A count of 0 gives an empty list.
      empty: op("count", op("fill", lit(0), n)),
      negZero: op("count", op("fill", lit(-0), n)),
    });
    for (const records of [RECORDS, RECORDS.slice(0, 1), [], MANY]) expectSame(e, records);
  });

  it("COMPILE.MODULE.FILL LIST.FILL: the largest count gives 100000 items", () => {
    // One record only: the interpreter makes 100000 items at each record, and the mutation lane runs it instrumented.
    expectSame(rec({ largest: op("count", op("fill", lit(100_000), lit(1))) }), RECORDS.slice(0, 1));
  });

  it("COMPILE.MODULE.FILL LIST.FILL: a bad count, a missing value and an error of an argument give the error of the interpreter", () => {
    const e = rec({
      negative: guard(op("count", op("fill", lit(-1), n))),
      fraction: guard(op("count", op("fill", lit(1.5), n))),
      large: guard(op("count", op("fill", lit(100_001), n))),
      text: guard(op("count", op("fill", lit("2"), n))),
      boolean: guard(op("count", op("fill", ref("b"), n))),
      infinite: guard(op("count", op("fill", op("divide", lit(1), lit(0)), n))),
      nan: guard(op("count", op("fill", op("divide", lit(0), lit(0)), n))),
      // The count of a field: a negative count at some records.
      field: guard(op("count", op("fill", n, w))),
      noValue: guard(op("count", op("fill", lit(2)))),
      noCount: guard(op("count", op("fill"))),
      // An error of the count or of the value is the error of fill. An argument after the value evaluates too.
      badCount: guard(op("count", op("fill", op("divide", lit(1), w), n))),
      badValue: guard(op("count", op("fill", lit(2), op("divide", lit(1), w)))),
      extra: guard(op("count", op("fill", lit(2), n, op("divide", lit(1), w)))),
      ignored: op("count", op("fill", lit(2), n, lit(5))),
      // A list is not a count.
      listCount: guard(op("count", op("fill", ns, lit(1)))),
    });
    for (const records of [RECORDS, MANY]) expectSame(e, records);
  });

  it("COMPILE.MODULE.FILL COMPILE.MODULE.LIST.RESULT: the value of the program, a field and a branch can be the list of fill", () => {
    for (const body of [op("fill", lit(2), n), op("fill", n, w), op("fill", lit(0), n), op("fill", lit(2), op("fill", lit(2), w)), op("fill", lit(-1), n)]) {
      for (const records of [RECORDS, MANY]) expectSame(body, records);
    }
    expectSame(rec({ l: op("fill", lit(2), w), c: op("if", ref("b"), op("fill", lit(1), n), EMPTY) }), MANY);
    // The list of fill is an argument of a function, and the value of a call.
    expectSame(let_({ f: fn(["x"], op("append", op("fill", lit(1), v("x")), op("fill", lit(1), lit(0)))) }, op("sum", call("f", n))), MANY);
    expectSame(let_({ f: fn(["l"], op("fill", lit(2), v("l"))) }, call("f", ns)));
  });

  it("COMPILE.MODULE.FILL LOOP.LIST: a name of a loop holds the list of fill, also after a first empty list", () => {
    // A step with fill can give the name the keys of fill, so the empty literal fits.
    const grow = fold(axes.all, { l: EMPTY }, { l: op("append", v("l"), op("fill", lit(1), n)) }, op("sum", v("l")));
    expectSame(grow, MANY);
    // fill(0, value) gives an empty list whose items have a kind, so sortBy with the option by reads it.
    const sorted = fold(axes.all, { l: op("fill", lit(0), n) }, { l: op("append", v("l"), op("fill", lit(1), n)) }, op("first", op("sortBy", v("l"))));
    expectSame(sorted, MANY);
    const doubled = iterate(3, { l: op("fill", lit(1), lit(1)) }, { l: op("append", v("l"), v("l")) }, op("count", v("l")), lit(false));
    expectSame(doubled);
  });

  it("COMPILE.MODULE.FILL AXIS.LIST: the axis list goes over the keys of fill and of a literal when it reads no record at them", () => {
    const e = rec({
      sum: op("sum", each(axes.list(op("fill", n, lit(2))), lit(3))),
      count: op("count", each(axes.list(op("fill", lit(3), n)), v("a"))),
      // The keys of fill can be larger than the number of records.
      far: op("count", each(axes.list(op("fill", lit(50), n)), lit(1))),
      literal: op("sum", each(axes.list(LIT), lit(2))),
      // A body that reads the origin or a name outside reads no record at the target.
      origin: op("sum", each(axes.list(op("fill", lit(2), n)), ref("w", [{ t: "origin" }]))),
      folded: fold(axes.list(op("fill", lit(4), w)), { i: lit(0), s: lit(0) }, { i: op("add", v("i"), lit(1)), s: op("add", v("s"), v("i")) }, v("s")),
      tested: op("count", each(axes.where(axes.list(op("fill", lit(4), n)), ref("b", [{ t: "origin" }])), lit(1))),
      reversed: op("first", each(axes.reverse(axes.list(op("append", op("fill", lit(1), n), op("fill", lit(1), w)))), v("a"))),
    });
    for (const records of [RECORDS, MANY]) expectSame(e, records);
    // An each over the keys of fill gives a list with those keys, also as the value of the program.
    expectSame(each(axes.list(op("fill", lit(3), n)), lit(7)), MANY);
    expectSame(each(axes.list(LIT), v("a")));
  });

  it("COMPILE.MODULE.FILL AXIS.LIST: the axis list over the keys of fill or of a literal that reads a record at a target gives a reason", () => {
    expect(reasonOf(op("sum", each(axes.list(op("fill", lit(3), n)), n)))).toBe(READS);
    expect(reasonOf(each(axes.list(op("fill", lit(3), n)), w))).toBe(READS);
    expect(reasonOf(op("count", each(axes.where(axes.list(LIT), ref("b")), lit(1))))).toBe(READS);
    expect(reasonOf(op("count", each(axes.where(axes.list(op("fill", lit(2), n)), ref("b")), lit(1))))).toBe(READS);
    expect(reasonOf(each(axes.where(axes.list(LIT), ref("b")), lit(1)))).toBe(READS);
    expect(reasonOf(fold(axes.list(op("fill", lit(2), n)), { s: lit(0) }, { s: op("add", v("s"), w) }, v("s")))).toBe(READS);
    expect(reasonOf(fold(axes.where(axes.list(LIT), ref("b")), { s: lit(0) }, { s: v("s") }, v("s")))).toBe(READS);
    // A nested axis starts at the target, so it reads at the target too.
    expect(reasonOf(op("sum", each(axes.list(op("fill", lit(2), n)), op("count", each(axes.others, lit(1))))))).toBe(READS);
    // The list of an each over such keys has the keys too.
    expect(reasonOf(op("sum", each(axes.list(each(axes.list(LIT), lit(1))), n)))).toBe(READS);
    // The positions of records stay positions.
    expectSame(op("sum", each(axes.list(ns), w)), MANY);
  });

  it("COMPILE.MODULE.FILL: a domain with the op fill comes first, and a list at a place that takes no list gives a reason", () => {
    const options: ModuleOptions = { domains: [...DOMAINS, FillOps], schema: SCHEMA };
    expectSame(rec({ own: op("fill", lit(2), n), bad: guard(op("fill", lit(2), lit("x"))) }), MANY, options);
    // The op of the domain gives no list.
    expect(reasonOf(op("count", op("fill", lit(2), n)), options)).toBe("a list op on a value that is not a list");
    expect(reasonOf(op("and", ref("b"), op("fill", lit(2), n)))).toBe("a list is a value of the program");
    expect(reasonOf(op("abs", op("fill", lit(2), n)))).toBe('a list as the receiver of the op "abs"');
  });

  it("COMPILE.MODULE.FILL: fill decides its op only when no domain and no function of the host has it", () => {
    expect(factsOf({ domains: DOMAINS }).own("fill")).toBe(true);
    expect(factsOf({}).own("fill")).toBe(true);
    expect(factsOf({ domains: [...DOMAINS, FillOps] }).own("fill")).toBe(false);
    expect(factsOf({ fns: { fill: () => 1 } }).own("fill")).toBe(false);
    expect(factsOf({ fns: { other: () => 1 } }).own("fill")).toBe(true);
    // Each method of a value of such a domain is an op, so it can have fill.
    const methods = defineDomain({ name: "Methods", is: (u: unknown): u is object => typeof u === "object", ops: {}, methods: "all" });
    expect(factsOf({ domains: [methods] }).own("fill")).toBe(false);
  });

  it("COMPILE.MODULE.FILL COMPILE.MODULE.SHEET.LIST: a column of a sheet holds the lists of fill", () => {
    // The list of a node: its own value, then the lists of its children.
    const columns = new Map<string, Expr>([
      ["l", op("append", op("fill", lit(1), n), op("flat", each(axes.children, cell("l"))))],
      ["s", op("add", op("sum", cell("l")), op("count", op("fill", n, cell("l"))))],
    ]);
    const m = emitSheetModule(columns, { domains: DOMAINS, schema: SCHEMA, space: "tree", kinds: { l: { list: "number", texts: true } } });
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const parents = [-1, 0, 0, 1, 1, -1, 5];
    const records = parents.map((_p, i) => ({ id: String(i), n: i === 6 ? -1 : i * 2, w: 1, b: true }));
    const s = space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
    const sheet = new SheetRun(columns, { space: s, domains: DOMAINS, vars: { a: 2 } });
    const expected = Object.fromEntries(
      [...columns.keys()].map((c) => [
        c,
        s.keys.map((k) => {
          const r = sheet.cell(c, k);
          return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
        }),
      ]),
    );
    expect(loaded.run(structuredClone(records), { a: 2 }, parents)).toStrictEqual(expected);
  });
});

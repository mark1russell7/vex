/**
 * Lists in the input of a standalone module (COMPILE.MODULE.LIST.INPUT). A field of the schema can have a list kind.
 * The record then holds a `vex.list`, and the program uses the field as a list. The check of the run reads each list
 * once, and an input against the kind is an error of the contract.
 */
import { app, axes, call, cell, defineDomain, each, evaluate, fn, fold, isVexList, iterate, let_, lit, ref, rec, SheetRun, space, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, XYDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { generate, tiered } from "./index.ts";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", xs: { list: "number" }, ps: { list: "domain:XY" }, nest: { list: { list: "number" } } }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain, XYDomain], schema: SCHEMA };

/** This function gives a good item of a list. */
const item = (key: string, value: unknown): object => ({ key, result: { ok: true, value } });
/** This function gives an error item of a list. The interpreter skips it in a list op, unless it is `#DEPTH!`. */
const bad = (key: string, kind = "value"): object => ({ key, result: { ok: false, error: { code: kind === "depth" ? "#DEPTH!" : "#VALUE!", kind, message: "no value", path: [] } } });
/** This function gives a `vex.list` of items, as plain data. */
const list = (...items: object[]): object => ({ kind: "vex.list", items });

const RECORDS = [
  { n: 1, xs: list(item("a", 3), item("b", 1), item("c", 2)), ps: list(item("p", { x: 1, y: 2 }), item("q", { x: -1, y: 0.5 })), nest: list(item("0", list(item("a", 1), item("b", 2))), item("1", list())) },
  { n: 2, xs: list(item("a", 5), bad("b"), item("c", -1)), ps: list(bad("p")), nest: list(item("k", list(bad("z"), item("y", 4)))) },
  { n: 0, xs: list(), ps: list(), nest: list() },
  { n: -3, xs: list(item("only", 7)), ps: list(item("p", { x: 3, y: 4 })), nest: list(bad("e"), item("f", list(item("g", 0)))) },
];

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

/**
 * This function gives a value of the interpreter in the form of a module. A list is a `vex.list` whose error items have
 * the error `VEX_ERROR`, also in a field of a record.
 */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function compares the values of a module with the interpreter at each key (P17). */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS, options: ModuleOptions = OPTIONS): Loaded {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: options.domains ?? [] }));
  // The module of fuse false gives the same values (COMPILE.MODULE.FUSE.CLEAN).
  const [m, off] = [make(sourceOf(e, options)), make(sourceOf(e, { ...options, fuse: false }))] as const;
  for (const x of [m, off]) expect(x.run(structuredClone(records), { a: 2 })).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, x.VEX_ERROR) : x.VEX_ERROR)));
  return m;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const xs = ref("xs");
const nest = ref("nest");
const ps = ref("ps");
const add1 = (name: string): Expr => op("add", v(name), lit(1));

describe("COMPILE.MODULE.LIST.INPUT: a list in a field of the input", () => {
  it("COMPILE.MODULE.LIST.INPUT: the list ops read a list of the input, with the results of the interpreter (P17)", () => {
    expectSame(
      rec({
        count: op("count", xs),
        sum: op("sum", xs),
        min: op("min", xs),
        max: op("max", xs),
        mean: op("ifError", op("mean", xs), lit(-1)),
        first: op("ifError", op("first", xs), lit(-1)),
        take: op("take", xs, lit(2)),
        drop: op("drop", xs, lit(1)),
        sorted: op("sortBy", xs),
        twice: op("append", xs, xs),
        nth: op("ifError", op("nth", xs, lit(1)), lit(-1)),
        get: op("ifError", op("get", xs, lit("c")), lit(-1)),
        flat: op("flat", nest),
        flatSum: op("sum", op("flat", nest)),
      }),
    );
  });

  it("COMPILE.MODULE.LIST.INPUT: a list of the input is a value: a result, a field of a record, a name, an argument and a branch", () => {
    expectSame(rec({ xs, ps, nest, n: ref("n") }));
    expectSame(xs);
    expectSame(nest);
    expectSame(let_({ l: xs }, op("add", op("count", v("l")), op("sum", v("l")))));
    expectSame(op("count", let_({ k: lit(1) }, xs)));
    expectSame(let_({ f: fn(["l"], op("sum", v("l"))) }, call("f", xs)));
    expectSame(let_({ f: fn(["l"], v("l")) }, op("count", call("f", nest))));
    expectSame(op("if", op("gt", ref("n"), lit(0)), xs, op("take", xs, lit(0))));
    expectSame(op("ifError", op("take", xs, lit(-1)), xs));
  });

  it("COMPILE.MODULE.LIST.INPUT: a loop over a list of the input reads its items, and a read of another record gives its list", () => {
    // The body of the axis list has the focus at the key of an item, so a name holds the list.
    expectSame(op("sum", each(axes.list(xs), v("a"))));
    expectSame(let_({ l: xs }, fold(axes.list(v("l")), { i: lit(0), s: lit(0) }, { i: add1("i"), s: op("add", v("s"), op("ifError", op("nth", v("l"), v("i")), lit(100))) }, v("s"))));
    expectSame(fold(axes.list(op("flat", nest)), { i: lit(0) }, { i: add1("i") }, v("i")));
    expectSame(iterate(3, { l: xs }, { l: op("drop", v("l"), lit(1)) }, op("count", v("l"))));
    expectSame(rec({ origin: op("sum", ref("xs", [{ t: "origin" }])), next: op("ifError", op("count", ref("xs", [{ t: "offset", d: [1] }])), lit(-1)) }));
    expectSame(each(axes.all, op("count", xs)));
    expectSame(op("sum", op("flat", each(axes.all, xs))));
  });

  it("COMPILE.MODULE.LIST.INPUT: the items of a list of a domain go to the ops of the domain", () => {
    expectSame(rec({ x: op("ifError", op("x", op("first", ps)), lit(-1)), count: op("count", ps), ps: op("drop", ps, lit(1)) }));
    expectSame(let_({ l: ps }, fold(axes.list(v("l")), { i: lit(0), s: lit(0) }, { i: add1("i"), s: op("ifError", op("add", v("s"), op("length", op("nth", v("l"), v("i")))), v("s")) }, v("s"))));
  });

  it("COMPILE.MODULE.LIST.INPUT: a module of forty records keeps the lists of each record", () => {
    const many = Array.from({ length: 40 }, (_x, i) => ({
      n: i,
      xs: list(...Array.from({ length: i % 5 }, (_y, k) => (k === 2 && i % 3 === 0 ? bad(`k${String(k)}`) : item(`k${String(k)}`, (i * 7 + k) % 11)))),
      ps: list(),
      nest: list(item("0", list(item("a", i)))),
    }));
    expectSame(rec({ sum: op("sum", xs), first: op("ifError", op("first", xs), lit(-1)), all: op("count", op("flat", each(axes.all, xs))), nest: op("sum", op("flat", nest)) }), many);
  });

  it("COMPILE.MODULE.LIST.INPUT: the check of the run reads each list once, also for a field that the program reads twice", () => {
    const source = sourceOf(op("add", op("count", xs), op("sum", xs)));
    expect(source.match(/const LF\d+ = \[\];/g)).toHaveLength(1);
    expect(source).toContain('LF0[i] = LI(r["xs"], 0, is_number)');
    // The check of a list that the program does not read keeps no array, and it still checks the kind.
    expect(source).toContain('LI(r["ps"], 0, is_3) === undefined');
    expect(source).toContain('LI(r["nest"], 1, is_number) === undefined');
    expectSame(op("add", op("count", xs), op("sum", xs)));
  });
});

describe("COMPILE.MODULE.LIST.INPUT: an input against the kind of a list", () => {
  const m = make(sourceOf(op("count", xs)));
  const good = { n: 1, xs: list(item("a", 1)), ps: list(item("p", { x: 0, y: 0 })), nest: list(item("0", list(item("a", 1)))) };
  const error = { code: "#VALUE!", kind: "value", message: "no value", path: [] };

  it("COMPILE.MODULE.LIST.INPUT: a good input passes the check", () => {
    expect(m.run([good, { ...good, xs: list(bad("e")) }, { ...good, xs: list() }], { a: 2 })).toStrictEqual([1, 0, 0]);
  });

  it.each([
    ["a number", 5],
    ["null", null],
    ["an array of items", [item("a", 1)]],
    ["another kind", { kind: "other", items: [] }],
    ["items that are no array", { kind: "vex.list", items: {} }],
    ["an item that is no object", list(5 as unknown as object)],
    ["an item that is null", list(null as unknown as object)],
    ["a result that is no object", list({ key: "a", result: 5 })],
    ["a result that is null", list({ key: "a", result: null })],
    ["a key that is no text", list({ key: 1, result: { ok: true, value: 1 } })],
    ["an item of the wrong kind", list(item("a", "1"))],
    ["an item without a value", list({ key: "a", result: { ok: true } })],
    ["an error item of #DEPTH!", list(bad("a", "depth"))],
    ["a result that is not ok or not ok", list({ key: "a", result: { ok: "no", error } })],
    ["an error that is no object", list({ key: "a", result: { ok: false, error: "no" } })],
    ["an error that is null", list({ key: "a", result: { ok: false, error: null } })],
    ["an error without a code", list({ key: "a", result: { ok: false, error: { ...error, code: 1 } } })],
    ["an error without a kind", list({ key: "a", result: { ok: false, error: { ...error, kind: 1 } } })],
    ["an error without a message", list({ key: "a", result: { ok: false, error: { ...error, message: 1 } } })],
    ["an error without a path", list({ key: "a", result: { ok: false, error: { ...error, path: "" } } })],
  ])("COMPILE.MODULE.LIST.INPUT: a list of numbers with %s is against the schema", (_name, value) => {
    expect(() => m.run([good, { ...good, xs: value }], { a: 2 })).toThrow("the record 1 does not keep the schema");
  });

  it("COMPILE.MODULE.LIST.INPUT: a list that the program does not read is checked too, also in its depth and in its domain", () => {
    expect(() => m.run([{ ...good, ps: list(item("p", { x: 0 })) }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    expect(() => m.run([{ ...good, nest: list(item("0", 1)) }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    expect(() => m.run([{ ...good, nest: list(item("0", list(item("a", list())))) }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    expect(() => m.run([{ ...good, nest: list(item("0", list(bad("a", "depth")))) }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    expect(m.run([{ ...good, nest: list(bad("0"), item("1", list(bad("a")))) }], { a: 2 })).toStrictEqual([1]);
  });

  it("COMPILE.MODULE.LIST.INPUT: the test of a domain takes each value that its is accepts, also undefined", () => {
    const Maybe = defineDomain({ name: "Maybe", is: (u: unknown): u is number | undefined => u === undefined || typeof u === "number", samples: () => [1, 2], ops: {} });
    const options: ModuleOptions = { domains: [NumDomain, Maybe], schema: { fields: { ms: { list: "domain:Maybe" } } } };
    const maybe = make(sourceOf(op("count", ref("ms")), options));
    // The interpreter has no list with an item of the value undefined, so the check refuses it before the test.
    expect(() => maybe.run([{ ms: list({ key: "a", result: { ok: true, value: undefined } }) }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    expect(maybe.run([{ ms: list(item("a", 1)) }], { a: 2 })).toStrictEqual([1]);
  });
});

describe("COMPILE.MODULE.LIST.INPUT: the reasons of a program with lists of the input that cannot be a module", () => {
  it("COMPILE.MODULE.LIST.INPUT: a list of the input at a place that takes no list, as the receiver of an op of a domain, and in keys", () => {
    expect(reasonOf(op("add", xs, lit(1)))).toBe('a list as the receiver of the op "add"');
    // An op of a domain with a parameter "any" takes a list as an argument (COMPILE.MODULE.LIST.ARG).
    expectSame(op("ifError", op("add", lit(1), xs), lit(-1)));
    expect(reasonOf(op("keys", xs))).toBe('the list op "keys"');
    expect(reasonOf(op("values", nest))).toBe('the list op "values"');
  });

  it("COMPILE.MODULE.LIST.INPUT: the axis list cannot read a record at a key of a list of the input, also of a list in a list", () => {
    const reason = 'the axis "list" reads a record at a key of a literal or of "fill"';
    expect(reasonOf(op("sum", each(axes.list(xs), ref("n"))))).toBe(reason);
    expect(reasonOf(op("sum", each(axes.list(op("flat", nest)), ref("n"))))).toBe(reason);
    expect(reasonOf(let_({ l: xs }, fold(axes.list(v("l")), { s: lit(0) }, { s: op("add", v("s"), op("count", xs)) }, v("s"))))).toBe(reason);
  });

  it("COMPILE.MODULE.LIST.INPUT: a kind of items that no domain has, and a field that is not in the schema", () => {
    expect(reasonOf(op("count", xs), { domains: [NumDomain], schema: { fields: { xs: { list: "domain:Nothing" } } } })).toBe("the schema has the kind domain:Nothing, and no domain has it");
    expect(reasonOf(op("count", ref("x")), { domains: [NumDomain], schema: {} })).toBe('a read of a field that is not in the schema: "x"');
    expect(reasonOf(op("count", ref("xs.a")))).toBe('a read of a field that is not in the schema: "xs.a"');
    expect(reasonOf(op("count", ref("__proto__")))).toBe('a read of a field that is not in the schema: "__proto__"');
  });
});

describe("COMPILE.MODULE.LIST.INPUT: tier 2 with a list in the schema", () => {
  it("COMPILE.MODULE.LIST.INPUT: tier 2 does not check the kind of a list field, so it keeps the semantics", () => {
    const options = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number", xs: { list: "number" } } } } as const;
    const s = space.array(RECORDS);
    expect(generate(op("add", ref("n"), lit(1)), options).ok).toBe(true);
    for (const e of [op("add", ref("n"), lit(1)), op("count", xs), op("sum", each(axes.all, op("count", xs)))]) {
      const t = tiered(e, options);
      for (const origin of s.keys) expect(t.run({ space: s, origin })).toStrictEqual(evaluate(e, { space: s, origin, domains: options.domains }));
    }
  });
});

describe("COMPILE.MODULE.LIST.INPUT: a list of the input in a module of a sheet", () => {
  it("COMPILE.MODULE.LIST.INPUT: a column reads a list of the input, and a later column reads the list of that column", () => {
    const columns = new Map<string, Expr>([
      ["count", op("count", xs)],
      ["head", op("take", xs, lit(2))],
      ["total", op("add", op("sum", cell("head")), op("sum", op("flat", nest)))],
      ["up", op("ifError", op("count", ref("xs", [{ t: "parent" }])), lit(-1))],
    ]);
    const parents = [-1, 0, 0, 1];
    const m = emitSheetModule(columns, { ...OPTIONS, space: "tree", name: "run" });
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source) as unknown as { run: (records: unknown, vars: unknown, parents: unknown) => Record<string, unknown[]>; VEX_ERROR: unknown };
    const s = space.tree(Object.fromEntries(RECORDS.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
    const sheet = new SheetRun(columns, { space: s, domains: OPTIONS.domains ?? [], vars: { a: 2 } });
    const expected = Object.fromEntries([...columns.keys()].map((c) => [c, s.keys.map((k) => {
      const r = sheet.cell(c, k);
      return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
    })]));
    expect(loaded.run(structuredClone(RECORDS), { a: 2 }, parents)).toStrictEqual(expected);
  });
});

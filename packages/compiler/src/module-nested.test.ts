/**
 * Lists of lists in a standalone module (COMPILE.MODULE.LIST.NESTED) and lists in the variables of a run
 * (COMPILE.MODULE.LIST.VAR). `nth`, `first` and `get` read an item of a list of lists, and such an item is a list. A
 * variable of the schema can hold a list. Thus a list of the run needs no field of a record.
 */
import { app, axes, call, cell, each, evaluate, fn, fold, isVexList, iterate, let_, lit, rec, ref, SheetRun, space, v, vexList, type Expr, type VexList } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generate, tiered } from "./index.ts";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const add1 = (name: string): Expr => op("add", v(name), lit(1));
const a = ref("a");

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: { fields: { a: "number" }, vars: { z: "number" } } };
const RECORDS = [{ a: 1 }, { a: 2 }, { a: 4 }];
const VARS = { z: 2 };

/** A list of lists: one row of the values of `a` for each record. */
const ROWS = each(axes.all, each(axes.all, a));
/** A list of lists of lists. */
const CUBE = each(axes.all, ROWS);

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

/** This function gives a value of the interpreter in the form of a module. The keys are text, and an error item has `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function compares a module, with and without fuse, with the interpreter at each key (P17). */
function expectSame(e: Expr, vars: Readonly<Record<string, unknown>> = VARS, options: ModuleOptions = OPTIONS, records: readonly unknown[] = RECORDS): void {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars, domains: options.domains ?? [] }));
  for (const fuse of [true, false]) {
    const m = make(sourceOf(e, { ...options, fuse }));
    expect(m.run(structuredClone(records), vars)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
  }
}

/** This function gives a good item of a list. */
const item = (key: string, value: unknown): VexList["items"][number] => ({ key, result: { ok: true, value } });
/** This function gives an error item of a list. */
const bad = (key: string, kind: "kind-mismatch" | "depth" = "kind-mismatch"): VexList["items"][number] => ({ key, result: { ok: false, error: { code: kind === "depth" ? "#DEPTH!" : "#VALUE!", kind, message: "no value", path: [] } } });
/** This function gives a `vex.list` of numbers. */
const nums = (...values: number[]): VexList => vexList(values.map((x, i) => item(`k${String(i)}`, x)));

const IN_FIELDS: ModuleOptions = { domains: DOMAINS, schema: { fields: { a: "number", xs: { list: "number" }, nest: { list: { list: "number" } }, cube: { list: { list: { list: "number" } } } }, vars: { z: "number" } } };
const nest0 = vexList([item("r", nums(1, 2)), item("s", vexList([bad("e"), item("f", 5)])), bad("t"), item("u", vexList([]))]);
const FIELD_RECORDS = [
  { a: 1, xs: nums(3, 1), nest: nest0, cube: vexList([item("c", nest0)]) },
  { a: 2, xs: nums(), nest: vexList([]), cube: vexList([]) },
  { a: 0, xs: nums(7), nest: vexList([bad("b"), item("v", nums(9))]), cube: vexList([item("d", vexList([item("w", nums(4, 4, 4))])), bad("e")]) },
];

/** The list ops over a list `l`, each with a fallback for an error. */
const OVER: readonly ((l: Expr) => Expr)[] = [
  (l) => op("count", l),
  (l) => op("sum", l),
  (l) => op("ifError", op("mean", l), lit(-1)),
  (l) => op("ifError", op("min", l), lit(-1)),
  (l) => op("ifError", op("max", l), lit(-1)),
  (l) => op("ifError", op("first", l), lit(-1)),
  (l) => op("ifError", op("nth", l, lit(1)), lit(-1)),
  (l) => op("ifError", op("get", l, lit("1")), lit(-1)),
  (l) => op("indexOf", l, lit(2)),
  (l) => op("count", op("drop", l, lit(1))),
  (l) => op("take", l, lit(1)),
  (l) => op("sortBy", l),
  (l) => op("append", l, l),
  (l) => op("without", l, l),
  (l) => op("sum", each(axes.list(l), add1("$x"), undefined, ["$x"])),
  (l) => fold(axes.list(l), { s: lit(0) }, { s: op("add", v("s"), v("$x")) }, v("s"), undefined, ["$x"]),
];

/** The reads of an item of a list of lists `l`, each at a position that exists at each key of `RECORDS`. */
const ITEMS: readonly ((l: Expr) => Expr)[] = [(l) => op("nth", l, lit(0)), (l) => op("first", l), (l) => op("get", l, lit("1"))];

describe("V-074 COMPILE.MODULE.LIST.NESTED: a list op over an item of a list of lists", () => {
  it("V-074 COMPILE.MODULE.LIST.NESTED: the interpreter and tier 2 take the program of the pilot, and a module gives their result", () => {
    const e = op("count", op("nth", ROWS, lit(0)));
    const s = space.array(RECORDS);
    expect(generate(e, { domains: DOMAINS }).ok).toBe(true);
    const plan = tiered(e, { domains: DOMAINS });
    expect(plan.tier).toBe(2);
    for (const origin of s.keys) {
      const r = evaluate(e, { space: s, origin, domains: DOMAINS });
      expect(r).toStrictEqual({ ok: true, value: 3 });
      expect(plan.run({ space: s, origin })).toStrictEqual(r);
    }
    expect(reasonOf(e)).toBe("");
    expectSame(e);
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: each list op takes the item that nth, first and get read", () => {
    for (const read of ITEMS) for (const use of OVER) expectSame(use(read(ROWS)));
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: each form of a list of lists gives its levels", () => {
    const row = each(axes.all, a);
    const c = op("gt", ref("a"), lit(1));
    const forms: readonly Expr[] = [
      ROWS,
      op("sortBy", ROWS),
      op("take", ROWS, lit(2)),
      op("drop", ROWS, lit(1)),
      op("without", ROWS, ROWS),
      op("append", ROWS, ROWS),
      op("append", op("fill", lit(0), row), ROWS),
      op("fill", lit(2), row),
      op("flat", CUBE),
      op("nth", CUBE, lit(0)),
      op("first", CUBE),
      op("if", c, ROWS, op("take", ROWS, lit(1))),
      op("ifError", op("take", ROWS, lit(-1)), ROWS),
      let_({ k: lit(1) }, ROWS),
      fold(axes.all, { l: op("fill", lit(0), row) }, { l: op("append", v("l"), op("fill", lit(1), row)) }, v("l")),
      iterate(2, { l: ROWS }, { l: op("drop", v("l"), lit(0)) }, v("l")),
      call("rows"),
      let_({ l: ROWS }, v("l")),
      each(axes.list(ROWS), v("$r"), undefined, ["$r"]),
      each(axes.where(axes.list(ROWS), lit(true)), v("$r"), undefined, ["$r"]),
    ];
    for (const form of forms) expectSame(let_({ rows: fn([], ROWS) }, op("count", op("nth", form, lit(0)))));
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: a row in a let, a parameter, a call and a body of an each is a list", () => {
    const row = op("nth", ROWS, lit(1));
    expectSame(let_({ r: row }, op("sum", v("r"))));
    expectSame(let_({ r: ROWS }, let_({ s: op("nth", v("r"), lit(2)) }, rec({ n: op("count", v("s")), f: op("first", v("s")) }))));
    expectSame(op("count", let_({ r: row }, v("r"))));
    expectSame(op("count", let_({ r: ROWS }, op("nth", v("r"), lit(0)))));
    expectSame(let_({ f: fn(["l"], op("sum", v("l"))) }, call("f", row)));
    expectSame(let_({ f: fn(["l"], op("sum", op("nth", v("l"), lit(0)))) }, call("f", ROWS)));
    expectSame(let_({ f: fn(["l"], op("nth", v("l"), lit(0))) }, op("count", call("f", ROWS))));
    expectSame(each(axes.list(ROWS), op("sum", op("nth", ROWS, lit(0)))));
    expectSame(op("sum", each(axes.list(ROWS), op("sum", v("$r")), undefined, ["$r"])));
    expectSame(op("sum", each(axes.list(CUBE), op("count", op("nth", v("$r"), lit(0))), undefined, ["$r"])));
    expectSame(op("flat", each(axes.list(CUBE), op("nth", v("$r"), lit(0)), undefined, ["$r"])));
    expectSame(op("first", each(axes.list(CUBE), op("nth", v("$r"), lit(0)), undefined, ["$r"])));
    expectSame(let_({ r: ROWS }, each(axes.all, op("count", op("nth", v("r"), lit(1))))));
    expectSame(let_({ r: ROWS }, each(axes.all, op("sum", op("nth", v("r"), op("subtract", ref("a"), ref("a")))))));
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: a list of three levels takes two reads, and a third read gives a value", () => {
    expectSame(op("count", op("nth", op("nth", CUBE, lit(0)), lit(1))));
    expectSame(op("sum", op("first", op("first", CUBE))));
    expectSame(op("nth", op("nth", op("nth", CUBE, lit(0)), lit(1)), lit(2)));
    expectSame(op("add", op("first", op("first", op("first", CUBE))), lit(1)));
    expectSame(let_({ f: fn(["l"], op("first", op("first", v("l")))) }, op("count", call("f", CUBE))));
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: an item that fails, a position after the last item and an error item give the error of the interpreter", () => {
    expectSame(op("count", op("nth", ROWS, lit(9))));
    expectSame(op("ifError", op("sum", op("nth", ROWS, lit(9))), lit(-1)));
    expectSame(op("ifError", op("count", op("get", ROWS, lit("x"))), lit(-1)));
    expectSame(op("sum", op("nth", each(axes.all, each(axes.all, op("divide", lit(1), op("subtract", a, lit(2))))), lit(0))));
    expectSame(op("sum", op("nth", each(axes.all, each(axes.all, op("divide", lit(1), op("subtract", a, lit(2))))), lit(0)), lit({ strict: true })));
    const empty = each(axes.where(axes.all, lit(false)), each(axes.all, a));
    expectSame(op("count", op("first", empty)));
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED COMPILE.MODULE.LIST.INPUT: a field of a list of lists gives its items as lists, with error items", () => {
    const nest = ref("nest");
    const cube = ref("cube");
    for (const read of ITEMS) {
      for (const use of OVER) {
        expectSame(use(read(nest)), VARS, IN_FIELDS, FIELD_RECORDS);
        expectSame(use(read(read(cube))), VARS, IN_FIELDS, FIELD_RECORDS);
      }
    }
    expectSame(op("ifError", op("count", op("flat", op("first", cube))), lit(-2)), VARS, IN_FIELDS, FIELD_RECORDS);
    // The item of a list of lists of each record: the field at the first key.
    expectSame(op("ifError", op("count", op("first", ref("nest", [{ t: "index", i: 0 }]))), lit(-2)), VARS, IN_FIELDS, FIELD_RECORDS);
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED COMPILE.MODULE.SHEET.LIST: a cell of a list of lists gives its items as lists", () => {
    const columns = new Map<string, Expr>([
      ["rows", ROWS],
      ["n", op("count", op("nth", cell("rows"), lit(0)))],
      ["again", op("sum", op("first", cell("rows", [{ t: "origin" }])))],
    ]);
    const m = emitSheetModule(columns, { domains: DOMAINS, schema: { fields: { a: "number" } } });
    if (!m.ok) throw new Error(m.reason);
    const run = make(m.source).run as unknown as (records: unknown, vars: unknown) => Readonly<Record<string, readonly unknown[]>>;
    const s = space.array(RECORDS);
    const sheet = new SheetRun(columns, { space: s, domains: DOMAINS });
    const out = run(RECORDS, {});
    for (const [i, key] of s.keys.entries()) {
      expect(sheet.cell("n", key)).toStrictEqual({ ok: true, value: out["n"]?.[i] });
      expect(sheet.cell("again", key)).toStrictEqual({ ok: true, value: out["again"]?.[i] });
    }
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: an item of a list of values is not a list, so the reason of before stays", () => {
    const NO_LIST = 'the kinds of the values of "count" do not decide its op';
    const row = each(axes.all, a);
    for (const read of [op("nth", row, lit(0)), op("first", row), op("get", row, lit("1"))]) expect(reasonOf(op("count", read))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("nth", op("nth", ROWS, lit(0)), lit(0))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("nth", lit(vexList([item("a", 1)])), lit(0))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("nth", op("fill", lit(2), lit(0)), lit(0))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("nth", op("flat", ROWS), lit(0))))).toBe(NO_LIST);
    expect(reasonOf(let_({ x: fn(["l"], v("l")) }, op("count", op("nth", call("x", row), lit(0)))))).toBe(NO_LIST);
    expect(reasonOf(let_({ l: row }, op("count", op("nth", v("l"), lit(0)))))).toBe(NO_LIST);
    expect(reasonOf(op("sum", each(axes.list(row), op("count", op("nth", row, lit(0))))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("first", each(axes.list(row), v("$i"), undefined, ["$x", "$i"]))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("first", op("append", row, row))))).toBe(NO_LIST);
    expect(reasonOf(op("count", op("first", op("sortBy", row))))).toBe(NO_LIST);
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: each form of a list of values has one level, so an item of the form is not a list", () => {
    const NO_LIST = 'the kinds of the values of "count" do not decide its op';
    const row = each(axes.all, a);
    const SCHEMA: ModuleOptions = { domains: DOMAINS, schema: { fields: { a: "number", xs: { list: "number" } }, vars: { ys: { list: "number" } } } };
    const forms: readonly Expr[] = [
      let_({ x: row }, v("x")),
      let_({ t: ROWS }, let_({ t: row }, v("t"))),
      fold(axes.all, { l: row }, { l: v("l") }, v("l")),
      op("if", op("gt", a, lit(1)), row, row),
      op("ifError", row, row),
      ref("xs"),
      v("ys"),
      each(axes.list(row), v("$x"), undefined, ["$x"]),
      let_({ t: ROWS }, each(axes.list(row), v("t"), undefined, ["$x", "t"])),
      op("without", row, ROWS),
    ];
    for (const form of forms) expect(reasonOf(op("count", op("first", form)), SCHEMA)).toBe(NO_LIST);
    const columns = new Map<string, Expr>([
      ["row", row],
      ["n", op("count", op("first", cell("row")))],
    ]);
    expect(emitSheetModule(columns, { domains: DOMAINS, schema: { fields: { a: "number" } } })).toMatchObject({ ok: false, reason: NO_LIST });
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: a function reads a list of lists outside its parameters, and a let of a read keeps the place of the read", () => {
    expectSame(let_({ t: ROWS }, let_({ f: fn(["p"], op("first", v("t"))) }, op("count", call("f", lit(1))))));
    expectSame(op("count", op("first", let_({ x: ROWS }, v("x")))));
    expect(reasonOf(op("if", op("first", let_({ x: ROWS }, v("x"))), lit(1), lit(2)))).toBe("a list is a value of the program");
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: an empty list literal takes the levels of the other list of append", () => {
    expectSame(op("count", op("first", op("append", lit(vexList([])), ROWS))));
    expectSame(op("count", op("first", op("append", ROWS, lit(vexList([]))))));
    const MIXED = '"append" of a list of lists and a list of values';
    expect(reasonOf(op("count", op("first", op("append", each(axes.all, a), ROWS))))).toBe(MIXED);
    expect(reasonOf(op("count", op("first", op("append", ROWS, each(axes.all, a)))))).toBe(MIXED);
  });

  it("V-074 COMPILE.MODULE.LIST.NESTED: a key of a node of the memo has the levels of its list", () => {
    const fromOrigin = op("fill", lit(2), ref("a", [{ t: "origin" }]));
    const memo = (key: Expr): Expr => op("sum", each(axes.where(axes.all, op("lt", op("count", op("nth", key, a)), lit(1))), a));
    expect(reasonOf(memo(fromOrigin))).toBe('the kinds of the values of "count" do not decide its op');
    const nested = memo(op("fill", lit(2), fromOrigin));
    expect(sourceOf(nested)).toMatch(/function M\d*\(/);
    expectSame(nested);
  });
});

describe("COMPILE.MODULE.LIST.VAR: a list in a variable of the run", () => {
  const nestVar = vexList([item("r", nums(1, 2)), bad("s"), item("t", vexList([bad("e"), item("f", 5)]))]);
  const LIST_VARS = { z: 2, xs: nums(3, 1, 2), nest: nestVar, zs: vexList([item("a", 1), bad("b"), item("c", 4)]) };
  const SCHEMA = { fields: { a: "number" }, vars: { z: "number", xs: { list: "number" }, nest: { list: { list: "number" } }, zs: { list: "number" } } } as const;
  const WITH: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
  const xs = v("xs");
  const nest = v("nest");

  it("COMPILE.MODULE.LIST.VAR: the list ops read a list of the variables, with the results of the interpreter (P17)", () => {
    for (const use of OVER) {
      expectSame(use(xs), LIST_VARS, WITH);
      expectSame(use(v("zs")), LIST_VARS, WITH);
    }
    for (const read of ITEMS) for (const use of OVER) expectSame(use(read(nest)), LIST_VARS, WITH);
    expectSame(op("flat", nest), LIST_VARS, WITH);
    expectSame(op("sum", op("flat", nest)), LIST_VARS, WITH);
  });

  it("COMPILE.MODULE.LIST.VAR: a list of the variables is a value: a result, a field of a record, a name, an argument and a branch", () => {
    expectSame(xs, LIST_VARS, WITH);
    expectSame(nest, LIST_VARS, WITH);
    expectSame(rec({ xs, nest }), LIST_VARS, WITH);
    expectSame(let_({ l: xs }, op("add", op("count", v("l")), op("sum", v("l")))), LIST_VARS, WITH);
    expectSame(let_({ f: fn(["l"], op("sum", v("l"))) }, call("f", xs)), LIST_VARS, WITH);
    expectSame(let_({ f: fn(["l"], v("l")) }, op("count", call("f", nest))), LIST_VARS, WITH);
    expectSame(let_({ f: fn([], op("sum", xs)) }, call("f")), LIST_VARS, WITH);
    expectSame(op("if", op("gt", a, lit(1)), xs, op("take", xs, lit(0))), LIST_VARS, WITH);
    expectSame(each(axes.all, op("count", xs)), LIST_VARS, WITH);
    expectSame(op("sum", op("flat", each(axes.all, xs))), LIST_VARS, WITH);
  });

  it("COMPILE.MODULE.LIST.VAR: a loop reads a list of the variables, and a name can hide the list", () => {
    expectSame(fold(axes.list(xs), { s: lit(0) }, { s: op("add", v("s"), v("$x")) }, v("s"), undefined, ["$x"]), LIST_VARS, WITH);
    expectSame(iterate(2, { l: xs }, { l: op("drop", v("l"), lit(1)) }, op("count", v("l"))), LIST_VARS, WITH);
    expectSame(op("sum", each(axes.list(xs), v("z"))), LIST_VARS, WITH);
    expectSame(let_({ xs: lit(1) }, op("add", v("xs"), lit(1))), LIST_VARS, WITH);
    expectSame(let_({ nest: xs }, op("count", v("nest"))), LIST_VARS, WITH);
    expectSame(let_({ f: fn(["nest"], op("count", v("nest"))) }, call("f", xs)), LIST_VARS, WITH);
    expectSame(each(axes.all, op("add", a, op("count", xs))), LIST_VARS, WITH);
    expectSame(op("sum", each(axes.all, op("add", a, op("sum", op("first", nest))))), LIST_VARS, WITH);
  });

  it("COMPILE.MODULE.LIST.VAR: the axis list cannot read a record at a key of a list of the variables", () => {
    expect(reasonOf(op("sum", each(axes.list(xs), a)), WITH)).toBe('the axis "list" reads a record at a key of a literal or of "fill"');
  });

  it("COMPILE.MODULE.LIST.VAR: a list at a place that takes no list, and a function with the name of a list, give a reason", () => {
    expect(reasonOf(op("if", xs, lit(1), lit(2)), WITH)).toBe("a list is a value of the program");
    expect(reasonOf(op("add", xs, lit(1)), WITH)).toBe('a list as the receiver of the op "add"');
    expect(reasonOf(let_({ xs: fn([], lit(1)) }, op("count", xs)), WITH)).toBe('the name "xs" is a function, not a value');
    expect(reasonOf(op("count", v("ys")), WITH)).toBe('a variable that is not in the schema: "ys"');
  });

  it("COMPILE.MODULE.LIST.VAR: an input against the kind is an error of the contract, also for a list that the program does not read", () => {
    const { run } = make(sourceOf(op("count", xs), WITH));
    expect(run(RECORDS, LIST_VARS)).toStrictEqual([3, 3, 3]);
    const fails = (vars: Readonly<Record<string, unknown>>): void => {
      expect(() => run(RECORDS, { ...LIST_VARS, ...vars })).toThrow("the variables do not keep the schema");
    };
    fails({ xs: [1, 2] });
    fails({ xs: 1 });
    fails({ xs: undefined });
    fails({ xs: vexList([item("a", "text")]) });
    fails({ xs: vexList([bad("a", "depth")]) });
    fails({ nest: nums(1) });
    fails({ nest: vexList([item("a", vexList([item("b", "text")]))]) });
    fails({ zs: 1 });
  });

  it("COMPILE.MODULE.LIST.VAR: the check of the run reads each list once, and a variable of a value keeps its plain read", () => {
    const source = sourceOf(rec({ a: op("count", xs), b: op("sum", xs), c: op("add", v("z"), lit(1)) }), WITH);
    expect(source.match(/LI\(vars\["xs"\]/g)).toHaveLength(1);
    expect(source).toContain("let v0;");
    expect(source).toContain('(v0 = LI(vars["xs"], 0, is_number)) === undefined');
    expect(source).toContain('const v1 = vars["z"];');
    expect(source).not.toContain('const v0 = vars["xs"]');
    expect(source).toContain('LI(vars["nest"], 1, is_number) === undefined');
  });

  it("COMPILE.MODULE.LIST.VAR COMPILE.MODULE.LIST.PLAIN: the option lists reads a plain array", () => {
    const e = rec({ n: op("count", xs), s: op("sum", op("first", nest)) });
    const plain = { ...WITH, lists: "plain" as const };
    const { run, VEX_ERROR } = make(sourceOf(e, plain));
    const vars = { z: 2, xs: [3, 1, 2], nest: [[1, 2], VEX_ERROR], zs: [] };
    const repeated = (x: unknown): readonly unknown[] => RECORDS.map(() => x);
    expect(run(RECORDS, vars)).toStrictEqual(repeated({ n: 3, s: 3 }));
    expect(() => run(RECORDS, { ...vars, xs: LIST_VARS.xs })).toThrow("the variables do not keep the schema");
    expect(make(sourceOf(xs, plain)).run(RECORDS, { ...vars, nest: [] })).toStrictEqual(repeated([3, 1, 2]));
  });

  it("COMPILE.MODULE.LIST.VAR: tier 2 takes the schema, and a tiered program gives the result of the interpreter", () => {
    const s = space.array(RECORDS);
    const e = rec({ n: op("count", xs), s: op("sum", op("first", nest)) });
    const plan = tiered(e, { domains: DOMAINS, schema: SCHEMA });
    expect(plan.tier).toBe(2);
    for (const origin of s.keys) expect(plan.run({ space: s, origin, vars: LIST_VARS })).toStrictEqual(evaluate(e, { space: s, origin, vars: LIST_VARS, domains: DOMAINS }));
    expect(plan.stats.fallbacks).toBe(0);
  });

  it("COMPILE.MODULE.LIST.VAR COMPILE.MODULE.KEYS: a key of a list of the variables stays its key, in a module with the keys of the records", () => {
    const e = rec({ k: op("get", xs, lit("k1")), w: op("count", op("without", xs, each(axes.all, a))) });
    const keys = ["k1", "p", "q"];
    const { run } = make(sourceOf(e, { ...WITH, keys: true }));
    const s = space.record(Object.fromEntries(keys.map((k, i) => [k, RECORDS[i]])));
    const want = keys.map((origin) => evaluate(e, { space: s, origin, vars: LIST_VARS, domains: DOMAINS }));
    expect(want[0]).toStrictEqual({ ok: true, value: { k: 1, w: 2 } });
    const keyed = run as unknown as (records: unknown, vars: unknown, k: readonly string[]) => readonly unknown[];
    expect(keyed(structuredClone(RECORDS), LIST_VARS, keys)).toStrictEqual(want.map((r) => (r.ok ? r.value : undefined)));
  });

  it("COMPILE.MODULE.LIST.VAR COMPILE.MODULE.SHEET: a formula of a sheet reads a list of the variables", () => {
    const columns = new Map<string, Expr>([["n", op("add", a, op("sum", xs))], ["m", op("add", cell("n"), op("count", op("first", nest)))]]);
    const m = emitSheetModule(columns, WITH);
    if (!m.ok) throw new Error(m.reason);
    const run = make(m.source).run as unknown as (records: unknown, vars: unknown) => Readonly<Record<string, readonly unknown[]>>;
    expect(run(RECORDS, LIST_VARS)).toStrictEqual({ n: [7, 8, 10], m: [9, 10, 12] });
  });
});

describe("P17 V-074: random lists of lists", () => {
  const SCHEMA = { fields: { a: "number", nest: { list: { list: "number" } } }, vars: { z: "number", vnest: { list: { list: "number" } } } } as const;
  const WITH: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
  const big = op("gt", a, lit(1));
  const inverse = op("divide", lit(1), op("subtract", a, lit(2)));

  /** The list of the values of `a`, in some forms. Some lists have error items. */
  const rows = fc.constantFrom(each(axes.all, a), each(axes.reverse(axes.all), a), each(axes.where(axes.all, big), a), each(axes.all, inverse), each(axes.window(-1, 1), a), op("sortBy", each(axes.all, a)), op("fill", lit(2), a));

  /** A list of lists. */
  const table: fc.Arbitrary<Expr> = fc.oneof(
    fc.constantFrom(ref("nest"), v("vnest")),
    rows.map((r) => each(axes.all, r)),
    rows.map((r) => each(axes.where(axes.all, big), r)),
    rows.map((r) => op("fill", lit(2), r)),
    fc.tuple(rows, rows).map(([x, y]) => op("append", op("fill", lit(1), x), op("fill", lit(1), y))),
    rows.map((r) => let_({ l: each(axes.all, r) }, op("take", v("l"), lit(2)))),
    rows.map((r) => op("drop", each(axes.all, r), lit(1))),
    rows.map((r) => op("if", big, each(axes.all, r), op("take", each(axes.all, r), lit(1)))),
    rows.map((r) => fold(axes.all, { l: op("fill", lit(0), r) }, { l: op("append", v("l"), op("fill", lit(1), r)) }, v("l"))),
    rows.map((r) => op("flat", each(axes.all, each(axes.all, r)))),
    rows.map((r) => op("nth", each(axes.all, each(axes.all, r)), lit(0))),
  );

  /** The reads of an item. Some positions and keys are not in the list. */
  const read = fc.oneof(
    fc.integer({ min: -1, max: 3 }).map((i) => (l: Expr) => op("nth", l, lit(i))),
    fc.constant((l: Expr) => op("first", l)),
    fc.constantFrom("0", "1", "x").map((k) => (l: Expr) => op("get", l, lit(k))),
  );

  /** The places of the item: at the op itself, in a let, as an argument, and over a name of a list of lists. */
  const place = fc.constantFrom(
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => u(r(l)),
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => let_({ row: r(l) }, u(v("row"))),
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => let_({ t: l }, u(r(v("t")))),
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => let_({ f: fn(["p"], u(v("p"))) }, call("f", r(l))),
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => let_({ f: fn(["p"], r(v("p"))) }, u(call("f", l))),
    (l: Expr, r: (x: Expr) => Expr, u: (x: Expr) => Expr) => each(axes.all, u(r(l))),
  );

  const value = fc.oneof({ weight: 5, arbitrary: fc.integer({ min: -2, max: 3 }) }, { weight: 1, arbitrary: fc.constant(undefined) });
  const row = fc.oneof({ weight: 5, arbitrary: fc.array(value, { maxLength: 3 }) }, { weight: 1, arbitrary: fc.constant(undefined) });
  const nested = fc.array(row, { maxLength: 3 }).map((xs) =>
    vexList(
      xs.map((x, i) => {
        const inner = (y: readonly (number | undefined)[]): VexList => vexList(y.map((z, j) => (z === undefined ? bad(String(j)) : item(String(j), z))));
        return x === undefined ? bad(String(i)) : item(String(i), inner(x));
      }),
    ),
  );
  const records = fc.array(fc.record({ a: fc.integer({ min: -2, max: 3 }), nest: nested }), { maxLength: 4 });

  it("P17 V-074 COMPILE.MODULE.LIST.NESTED COMPILE.MODULE.LIST.VAR: a module over an item of a list of lists gives the value of the interpreter at each key", () => {
    fc.assert(
      fc.property(table, read, place, fc.constantFrom(...OVER), records, nested, (l, r, at, use, rs, vnest) => {
        expectSame(at(l, r, use), { z: 2, vnest }, WITH, rs);
      }),
    );
  });
});

/**
 * Calls whose value is a list, in standalone modules (COMPILE.MODULE.LIST.CALL). The body of a function can give a list,
 * and the place of the call takes it as a list: the list ops, the axis `list`, a field of a record and an argument.
 */
import { app, axes, call, cell, defineDomain, each, evaluate, fn, fold, isVexList, let_, lit, rec, ref, SheetRun, space, v, vexList, type Expr, type ListItem, type VexList } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, parents?: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/**
 * A domain of numbers with an op that takes a list after the receiver, and an op whose value is a list. `weigh` adds
 * the values of the items. `spread` gives a `vex.list`, and a kind of a result cannot tell a list.
 */
const ListOps = defineDomain({
  name: "ListOps",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  fromScalar: (x: number): number => x,
  ops: {
    weigh: { fn: (a: number, l: VexList): number => l.items.reduce((s, x) => s + (x.result.ok && typeof x.result.value === "number" ? x.result.value : -1), a), params: ["any"], returns: "number" },
    spread: { fn: (a: number): VexList => vexList([{ key: "0", result: { ok: true, value: a } }]), returns: "any" },
  },
});

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain, TextDomain, ListOps];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true },
  { id: "2", n: -1, w: 0, b: false },
  { id: "0", n: 2, w: 2.5, b: true },
  { id: "x", n: 0, w: -1, b: false },
];
/** Forty records, with an error item in the list of `1 / w` at each tenth record. */
const MANY = Array.from({ length: 40 }, (_x, i) => ({ id: String(i), n: i % 7, w: i % 10 === 0 ? 0 : (i % 3) + 1, b: i % 2 === 0 }));

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

/** This function compares the values of a module with the interpreter at each key (P17). */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): string {
  const source = sourceOf(e);
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a: 2 }, domains: DOMAINS }));
  // The module of fuse false gives the same values (COMPILE.MODULE.FUSE.CLEAN).
  for (const m of [make(source), make(sourceOf(e, false))]) expect(m.run(structuredClone(records), { a: 2 })).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
  return source;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const ns = each(axes.all, n);
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const EMPTY = lit(vexList([]));

/** The functions of the tests. Each body gives a list. */
const FNS: Readonly<Record<string, Expr>> = {
  // The values of the records plus x: the list of an axis, which reads the targets.
  plus: fn(["x"], each(axes.all, op("add", n, v("x")))),
  // The inverse of w at the records near the focus: an error item where w is 0.
  near: fn([], each(axes.window(-1, 1), op("divide", lit(1), w))),
  // A list that takes a list: the first c items of the list, in order.
  firsts: fn(["l", "c"], op("take", op("sortBy", v("l")), v("c"))),
  // The identity: the facts of its list are the facts of its argument.
  same: fn(["l"], v("l")),
  // A list from a let, from a branch and from a fold.
  named: fn(["x"], let_({ l: op("drop", ns, v("x")) }, op("append", v("l"), v("l")))),
  branch: fn(["c"], op("if", v("c"), ns, EMPTY)),
  folded: fn([], fold(axes.all, { l: EMPTY }, { l: op("append", v("l"), each(axes.window(0, 0), w)) }, v("l"))),
  // A list that fails: take with a negative count.
  fails: fn([], op("take", ns, lit(-1))),
};
const withFns = (body: Expr): Expr => let_(FNS, body);

describe("COMPILE.MODULE.LIST.CALL: a call whose value is a list", () => {
  it("COMPILE.MODULE.LIST.CALL: the list ops, the axis list, a field and an argument take the list of a call", () => {
    const e = withFns(
      rec({
        count: op("count", call("plus", n)),
        sum: op("sum", call("near")),
        strict: op("ifError", op("sum", call("near"), lit({ strict: true })), lit(-7)),
        nth: op("nth", call("plus", lit(1)), lit(2)),
        get: op("get", call("same", LIT), lit("b")),
        first: op("first", call("firsts", ns, lit(2))),
        indexOf: op("indexOf", call("plus", lit(0)), n),
        each: op("sum", each(axes.list(call("plus", w)), op("multiply", n, lit(2)))),
        sorted: op("sortBy", call("near")),
        appended: op("append", call("named", lit(1)), call("branch", ref("b"))),
        without: op("without", call("plus", lit(0)), ns),
        folded: fold(axes.list(call("folded")), { s: lit(0) }, { s: op("add", v("s"), w) }, v("s")),
        reduced: op("reduce", call("plus", lit(1)), lit("add")),
        // A field and an argument of an op get the list as a vex.list.
        field: call("firsts", ns, lit(3)),
        weigh: op("weigh", n, call("near")),
        // A list that fails is the error of the call, and of the op that reads it.
        failed: op("ifError", op("count", call("fails")), lit(-5)),
        empty: op("count", call("branch", lit(false))),
      }),
    );
    for (const records of [RECORDS, RECORDS.slice(0, 1), [], MANY]) expectSame(e, records);
  });

  it("COMPILE.MODULE.LIST.CALL COMPILE.MODULE.LIST.RESULT: the value of the program can be the list of a call", () => {
    for (const body of [call("plus", n), call("near"), call("same", LIT), call("same", EMPTY), call("fails"), call("same", each(axes.all, call("plus", n)))]) {
      for (const records of [RECORDS, MANY]) expectSame(withFns(body), records);
    }
  });

  it("COMPILE.MODULE.LIST.CALL: each kind of the arguments has its own function, with the facts of its list", () => {
    // A list of numbers, a list with keys of text, a list of lists and an empty list give four functions of same. The
    // function plus makes the list of lists.
    const lists = each(axes.all, call("plus", n));
    const e = withFns(
      rec({ numbers: op("sum", call("same", ns)), texts: op("get", call("same", LIT), lit("a")), flat: op("count", op("flat", call("same", lists))), empty: op("count", call("same", EMPTY)) }),
    );
    const source = expectSame(e, MANY);
    expect(source.match(/const fn\d+ =/g)).toHaveLength(5);
    // The keys of a literal go through the call, so a read of a record at such a key gives a reason.
    expect(reasonOf(withFns(op("sum", each(axes.list(call("same", LIT)), n))))).toBe('the axis "list" reads a record at a key of a literal or of "fill"');
    expectSame(withFns(op("sum", each(axes.list(call("same", ns)), n))));
  });

  it("COMPILE.MODULE.LIST.CALL: a list of a call in a loop over the records, in a constant of the run and in a chain of calls", () => {
    // A call in the body of an each gives a list of lists, and flat reads it.
    expectSame(withFns(op("count", each(axes.all, call("plus", n)))), MANY);
    expectSame(withFns(op("sum", op("flat", each(axes.all, call("firsts", ns, n))))), MANY);
    expectSame(withFns(each(axes.all, op("nth", call("plus", ref("n")), lit(0)))));
    // A call with constant arguments is a constant of the run.
    expectSame(withFns(op("add", op("sum", call("plus", lit(1))), n)), MANY);
    // A function calls a function of the place of its binding, and reads a list of a name outside.
    const chain = let_({ xs: ns }, let_({ f: fn(["l"], op("sortBy", v("l"))) }, let_({ g: fn(["y"], call("f", op("append", v("xs"), call("f", v("y"))))) }, op("nth", call("g", ns), lit(1)))));
    expectSame(chain, MANY);
    // A function of a let in the head of a list op, and a parameter that holds a list.
    expectSame(op("nth", let_({ h: fn(["l"], op("drop", v("l"), lit(1))) }, call("h", ns)), lit(0)));
    expectSame(op("count", let_({ k: lit(1) }, let_({ h: fn(["l"], v("l")) }, call("h", ns)))));
    // The body reads a list of the place of its binding. A let in the head sees the names and the functions outside it.
    expectSame(let_({ xs: ns }, let_({ f: fn([], v("xs")) }, op("count", call("f")))));
    expectSame(let_({ xs: ns }, op("nth", let_({ k: lit(1) }, v("xs")), lit(1))));
    expectSame(let_({ f: fn(["l"], v("l")) }, op("nth", let_({ k: lit(1) }, call("f", ns)), lit(1))));
  });

  it("COMPILE.MODULE.LIST.CALL COMPILE.MODULE.SHEET.LIST: a cell holds the list of a call, and a call reads the lists of the children", () => {
    // The list of a node: its own value, then the lists of its children. The column s counts the list.
    const own = fn(["x"], op("append", each(axes.window(0, 0), v("x")), op("flat", each(axes.children, cell("l")))));
    const columns = new Map<string, Expr>([
      ["l", let_({ own }, call("own", n))],
      ["s", let_({ own }, op("add", op("count", cell("l")), op("count", call("own", lit(0)))))],
    ]);
    const m = emitSheetModule(columns, { domains: DOMAINS, schema: SCHEMA, space: "tree", kinds: { l: { list: "number" } } });
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const parents = [-1, 0, 0, 1, 1, -1];
    const records = parents.map((_p, i) => ({ id: String(i), n: i * 2, w: 1, b: true }));
    const s = space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
    const sheet = new SheetRun(columns, { space: s, domains: DOMAINS, vars: { a: 2 } });
    const expected = Object.fromEntries([...columns.keys()].map((c) => [c, s.keys.map((k) => {
      const r = sheet.cell(c, k);
      return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
    })]));
    expect(loaded.run(structuredClone(records), { a: 2 }, parents)).toStrictEqual(expected);
  });

  it("COMPILE.MODULE.LIST.CALL: a call of a list at a place that takes no list, and a call of no function, give a reason", () => {
    expect(reasonOf(withFns(op("and", ref("b"), call("plus", n))))).toBe("a list is a value of the program");
    expect(reasonOf(withFns(op("abs", call("plus", n))))).toBe('a list as the receiver of the op "abs"');
    expect(reasonOf(withFns(op("count", call("nope", ns))))).toBe('a call of "nope", which is not a function');
    expect(reasonOf(op("nth", let_({ f: ns }, call("f")), lit(0)))).toBe('a call of "f", which is not a function');
    // A parameter that holds no list gives no list.
    expect(reasonOf(withFns(op("count", call("same", n))))).toBe('the kinds of the values of "count" do not decide its op');
  });

  it("COMPILE.MODULE.LIST.CALL: an op of a domain whose value is a list gives a reason", () => {
    // A kind of a result cannot tell a list, so the module does not know the facts of the list.
    expect(reasonOf(op("count", op("spread", n)))).toBe('the op "spread" does not declare the kind of its result');
  });
});

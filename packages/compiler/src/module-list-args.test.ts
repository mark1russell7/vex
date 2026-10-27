/**
 * Lists as arguments of ops and calls, and as fields of records, in standalone modules (COMPILE.MODULE.LIST.ARG,
 * COMPILE.MODULE.LIST.FIELD). An op of a domain gets each list as a frozen `vex.list`, as in the interpreter. A record
 * keeps each list of its fields as a `vex.list` too.
 */
import { app, axes, call, defineDomain, each, evaluate, fn, fold, isVexList, let_, lit, rec, ref, space, v, vexList, type AnyDomain, type Expr, type ListItem, type VexList } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, XYDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { factsOf } from "./facts.ts";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** A record of the shapes of ireko: two lists of numbers. */
interface Shape {
  readonly rows: VexList;
  readonly columns: VexList;
}

/**
 * A domain of numbers whose ops take a list or a record after the receiver (`any`). `weigh` adds the weights of the
 * items, `keysOf` joins the keys, and `frozen` tells if the list cannot change. `area` reads the two lists of a shape.
 * `glue` has an inline form, and `pick` takes only a value of its domain.
 * The functions read only their parameters, so a module copies them.
 */
const ListOps = defineDomain({
  name: "ListOps",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  fromScalar: (x: number): number => x,
  ops: {
    weigh: { fn: (a: number, l: VexList): number => l.items.reduce((s, x) => s + (x.result.ok ? (typeof x.result.value === "number" ? x.result.value : 100) : -1), a), params: ["any"], returns: "number", liftScalar: true },
    keysOf: { fn: (a: number, l: VexList): string => `${a}:${l.items.map((x) => x.key).join(",")}`, params: ["any"], returns: "string" },
    frozen: { fn: (a: number, l: VexList): boolean => Object.isFrozen(l) && Object.isFrozen(l.items) && a === a, params: ["any"], returns: "boolean" },
    depth: { fn: (a: number, l: VexList): number => l.items.reduce((s, x) => s + (x.result.ok && typeof x.result.value === "object" ? (x.result.value as VexList).items.length : 0), a), params: ["any"], returns: "number" },
    area: { fn: (a: number, s: Shape): number => a + s.rows.items.length * s.columns.items.length, params: ["any"], returns: "number" },
    glue: { fn: (a: number, b: string): string => a + b, params: ["any"], returns: "string" },
    pick: { fn: (a: number, b: number): number => a + b, params: ["domain"], returns: "number" },
  },
});

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain, ListOps], schema: SCHEMA };
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
  const m = make(sourceOf(e, options));
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars: { a: 2 }, domains: options.domains ?? [] });
    return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
  });
  expect(m.run(structuredClone(records), { a: 2 })).toStrictEqual(expected);
  return m;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const ns = each(axes.all, n);
const inv = each(axes.all, op("divide", lit(1), w));
const LIT = lit(vexList([item("a", 1), item("b", 2), item("a", 3)]));
const MIXED = lit(vexList([item("a", 1), item("b", "x")]));
const EMPTY = lit(vexList([]));
const nested = each(axes.all, each(axes.window(0, 1), n));

/** This function gives the reason for an op of the domain Leaky that reads a name outside itself. */
const leaks = (name: string): string => `the op "${name}" of the domain Leaky reads a name outside itself, so a module cannot copy it`;

describe("COMPILE.MODULE.LIST.ARG: a list as an argument of an op or of a call", () => {
  it("COMPILE.MODULE.LIST.ARG: an op of a domain gets a frozen vex.list, with the keys and the error items of the interpreter", () => {
    const e = rec({
      own: op("weigh", n, ns),
      errors: op("weigh", lit(0), inv),
      literal: op("weigh", n, LIT),
      empty: op("weigh", n, EMPTY),
      mixed: op("weigh", n, MIXED),
      // The keys are the positions of the records as text, or the keys of a literal.
      keys: op("keysOf", n, op("append", LIT, op("take", op("sortBy", ns), lit(2)))),
      frozen: op("frozen", n, ns),
      nested: op("depth", n, nested),
      // A list from a let, from a branch, from a window at each key and from a fold.
      named: let_({ xs: op("drop", ns, lit(1)) }, op("weigh", v("a"), v("xs"))),
      branch: op("weigh", n, op("if", ref("b"), ns, inv)),
      window: op("weigh", n, each(axes.window(-1, 1), w)),
      folded: op("weigh", n, fold(axes.all, { l: EMPTY }, { l: op("append", v("l"), each(axes.window(0, 0), n)) }, v("l"))),
      // A list that fails is the error of the op, as an argument that fails is.
      failed: op("ifError", op("weigh", n, op("take", ns, lit(-1))), lit(-5)),
    });
    for (const records of [RECORDS, RECORDS.slice(0, 1), [], MANY]) expectSame(e, records);
  });

  it("COMPILE.MODULE.LIST.ARG: a parameter of a kind gives the error of the interpreter for a list", () => {
    // add of NumDomain takes a number, and pick of ListOps takes a value of its domain, so a list is an error.
    for (const e of [op("add", n, ns), op("add", lit(1), op("take", ns, lit(1))), op("pick", n, ns)]) expectSame(e);
    expect(sourceOf(op("add", n, ns))).not.toContain("LV(");
  });

  it("COMPILE.MODULE.LIST.ARG: a constant list gives one vex.list for all the keys, and a list is not in an inline form", () => {
    const loop = op("sum", each(axes.all, op("weigh", n, ns)));
    const source = sourceOf(loop);
    expect(source).toContain("l.vl = o;");
    expectSame(loop, MANY);
    // The same list gives the same object at each key.
    const m = expectSame(each(axes.all, rec({ l: ns })));
    const first = m.run(RECORDS, { a: 2 })[0] as VexList;
    const values = first.items.map((x) => (x.result.ok ? (x.result.value as { readonly l: unknown }).l : undefined));
    expect(values[0]).toBe(values[1]);
    // glue has an inline form for numbers. A list gives the call of its function, in each order of the sites.
    for (const e of [rec({ a: op("glue", n, n), b: op("glue", n, ns) }), rec({ a: op("glue", n, ns), b: op("glue", n, n) })]) expectSame(e);
  });

  it("COMPILE.MODULE.LIST.ARG FN.CALL: a call takes a list, and each kind of list has its own function", () => {
    const f = fn(["l"], op("add", op("sum", v("l")), op("weigh", n, v("l"))));
    const e = let_({ f }, rec({ own: call("f", ns), again: call("f", op("drop", ns, lit(1))), literal: call("f", LIT), empty: call("f", EMPTY) }));
    for (const records of [RECORDS, [], MANY]) expectSame(e, records);
    const source = sourceOf(e);
    // Three kinds of lists give three functions: a list of numbers, a list with keys of text and an empty list.
    expect(source.match(/const fn\d+ =/g)).toHaveLength(3);
    // The value of a call can be a list too (COMPILE.MODULE.LIST.CALL, module-list-calls.test.ts).
    expectSame(let_({ f: fn(["l"], v("l")) }, op("sum", call("f", ns))));
  });

  it("COMPILE.MODULE.LIST.ARG: a list as the receiver of an op, and a parameter that the kinds do not decide, give a reason", () => {
    expect(reasonOf(op("abs", ns))).toBe('a list as the receiver of the op "abs"');
    expect(reasonOf(op("keys", ns))).toBe('the list op "keys"');
    expect(reasonOf(op("add", op("first", nested), lit(1)))).toBe('a list as the receiver of the op "add"');
    // The test `is` of a domain without a primitive type can accept a list.
    const xy: ModuleOptions = { domains: [NumDomain, XYDomain], schema: { fields: { p: "domain:XY", n: "number" } } };
    expect(reasonOf(op("add", ref("p"), ns), xy)).toBe('the kinds of the values of "add" do not decide its op');
    // The other places that take no list keep the reason.
    expect(reasonOf(op("and", ref("b"), ns))).toBe("a list is a value of the program");
    expect(reasonOf(op("get", ns, each(axes.all, n)))).toBe("a list is a value of the program");
  });

  it("COMPILE.MODULE.LIST.ARG: the facts of a site decide a list after the receiver", () => {
    const facts = factsOf({ domains: [NumDomain, ListOps, XYDomain] });
    const lists = new Set([1]);
    expect(facts.staticSite("weigh", ["number", undefined], lists)).toEqual({ t: "fn", domain: 1, bad: false, returns: "number" });
    // Without the facts of the list, the lifted position of weigh does not decide the op.
    expect(facts.staticSite("weigh", ["number", undefined])).toBeUndefined();
    expect(facts.staticSite("add", ["number", undefined], lists)).toEqual({ t: "fn", domain: 0, bad: true, returns: "number" });
    expect(facts.staticSite("pick", ["number", undefined], lists)).toEqual({ t: "fn", domain: 1, bad: true, returns: "number" });
    expect(facts.staticSite("add", ["domain:XY", undefined], lists)).toBeUndefined();
  });

  it("COMPILE.MODULE.LIST.ARG: a copy of an op takes samples of each list: no items, values of the kind of the items, and an error item", () => {
    const outside = { k: 1 };
    const peek = (test: string): ((a: number, l: VexList) => number) => {
      // The op reads a name outside itself only for one sample, so only that sample finds it.
      // oxlint-disable-next-line typescript/no-implied-eval -- the test makes the source of each op from its test.
      const f = new Function("outside", `return (a, l) => (${test} ? outside.k : a);`) as (o: unknown) => (a: number, l: VexList) => number;
      return f(outside);
    };
    const Leaky = defineDomain({
      name: "Leaky",
      is: (u: unknown): u is number => typeof u === "number",
      primitive: "number",
      ops: {
        none: { fn: peek("l.items.length === 0"), params: ["any"], returns: "number" },
        error: { fn: peek("l.items.some((it) => !it.result.ok)"), params: ["any"], returns: "number" },
        text: { fn: peek('l.items.some((it) => it.result.ok && typeof it.result.value === "string")'), params: ["any"], returns: "number" },
        number: { fn: peek('l.items.some((it) => it.result.ok && typeof it.result.value === "number")'), params: ["any"], returns: "number" },
        list: { fn: peek('l.items.some((it) => it.result.ok && typeof it.result.value === "object")'), params: ["any"], returns: "number" },
      },
    }) as AnyDomain;
    const options: ModuleOptions = { ...OPTIONS, domains: [NumDomain, BoolDomain, TextDomain, Leaky] };
    const texts = each(axes.all, ref("id"));
    expect(reasonOf(op("none", n, ns), options)).toBe(leaks("none"));
    expect(reasonOf(op("error", n, ns), options)).toBe(leaks("error"));
    expect(reasonOf(op("text", n, texts), options)).toBe(leaks("text"));
    expect(reasonOf(op("text", n, ns), options)).toBe("");
    // A list without a kind of its items has numbers as samples, and a list of lists has lists.
    expect(reasonOf(op("number", n, MIXED), options)).toBe(leaks("number"));
    expect(reasonOf(op("number", n, texts), options)).toBe("");
    expect(reasonOf(op("list", n, nested), options)).toBe(leaks("list"));
    expect(reasonOf(op("list", n, ns), options)).toBe("");
  });
});

describe("COMPILE.MODULE.LIST.FIELD: a list as a field of a record", () => {
  const shape = rec({ rows: ns, columns: op("take", op("sortBy", ns), lit(2)) });

  it("COMPILE.MODULE.LIST.FIELD: a record keeps each list as a vex.list, also in a list and in a record", () => {
    const programs: readonly Expr[] = [
      shape,
      rec({ errors: inv, literal: LIT, empty: EMPTY, nested, n }),
      rec({ inner: rec({ rows: each(axes.window(-1, 0), n) }), w }),
      each(axes.all, rec({ own: each(axes.window(0, 1), w) })),
      op("if", ref("b"), rec({ l: ns }), rec({ l: inv })),
      let_({ s: rec({ l: ns }) }, rec({ s: v("s"), t: v("s") })),
    ];
    for (const e of programs) for (const records of [RECORDS, [], MANY]) expectSame(e, records);
  });

  it("COMPILE.MODULE.LIST.FIELD: an op of a domain reads the lists of the fields of a record", () => {
    const e = rec({
      area: op("area", n, shape),
      named: let_({ s: shape }, op("add", op("area", lit(1), v("s")), op("area", n, v("s")))),
      each: op("sum", each(axes.all, op("area", n, rec({ rows: each(axes.window(-1, 1), n), columns: LIT })))),
      folded: fold(axes.all, { t: lit(0) }, { t: op("area", v("t"), rec({ rows: each(axes.window(0, 1), w), columns: inv })) }, v("t")),
    });
    for (const records of [RECORDS, RECORDS.slice(0, 1), [], MANY]) expectSame(e, records);
  });
});

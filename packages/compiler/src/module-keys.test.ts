/**
 * The keys of the records in a standalone module (COMPILE.MODULE.KEYS). With the option `keys`, a run takes the keys of
 * its records as its last argument. The interpreter over a space with these keys is the reference. A program that reads
 * no key prints the text of a module without the option.
 */
import { app, axes, each, evaluate, fold, index, isVexList, key, let_, lit, offset, parent, rec, ref, SheetRun, space, v, vexList, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions, type SheetModuleOptions } from "./module.ts";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";

interface Loaded {
  readonly run: (...args: readonly unknown[]) => readonly unknown[];
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new () => Error;
}

const SCHEMA = { fields: { n: "number", id: "string" }, vars: {} } as const;
const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA, keys: true };
const PLAIN_OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const KEYS = ["a", "b", "c"] as const;
const RECORDS = [
  { n: 1, id: "b" },
  { n: 2, id: "c" },
  { n: 3, id: "zz" },
];

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR, VexContractError };`)() as Loaded;
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

/** This function gives a value of the interpreter in the form of a module, also in the fields of a record. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function gives the record of each key, for a space of the interpreter. */
const byKey = (keys: readonly string[], records: readonly unknown[]): Readonly<Record<string, unknown>> => Object.fromEntries(keys.map((k, i) => [k, records[i]]));

/** This function compares a module with the interpreter over the space `s` at each key, with `fuse` on and off (P17). */
function expectSameIn(e: Expr, s: Space, records: readonly unknown[], args: readonly unknown[], options: ModuleOptions = OPTIONS): void {
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, domains: DOMAINS }));
  for (const fuse of [true, false]) {
    const m = make(sourceOf(e, { ...options, fuse }));
    expect(m.run(structuredClone(records), {}, ...args)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
  }
}

/** This function compares a module with the interpreter over a record space with the keys `keys` (P17). */
function expectSame(e: Expr, keys: readonly string[] = KEYS, records: readonly unknown[] = RECORDS): void {
  expectSameIn(e, space.record(byKey(keys, records)), records, [keys]);
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const ifError = (e: Expr, fallback: Expr): Expr => op("ifError", e, fallback);
const LIST = each(axes.all, ref("n"));
const FAILED = each(axes.all, op("if", op("gt", ref("n"), lit(1)), ref("n"), ref("n", [key("missing")])));
const item = (k: string, value: unknown): { readonly key: string; readonly result: { readonly ok: true; readonly value: unknown } } => ({ key: k, result: { ok: true, value } });
const LITERAL = lit(vexList([item("a", 7), item("0", 8)]));

describe("COMPILE.MODULE.KEYS: the keys of the records in a run", () => {
  it("COMPILE.MODULE.KEYS: get finds an item by the key of its record, and a text of a position finds no item", () => {
    expectSame(op("get", LIST, lit("b")));
    expectSame(op("get", LIST, ref("id")));
    expectSame(op("get", LIST, lit("0")));
    const m = make(sourceOf(op("get", LIST, lit("b"))));
    expect(m.run(RECORDS, {}, KEYS)).toStrictEqual([2, 2, 2]);
    const missing = make(sourceOf(op("get", LIST, lit("1"))));
    expect(missing.run(RECORDS, {}, KEYS)).toStrictEqual([missing.VEX_ERROR, missing.VEX_ERROR, missing.VEX_ERROR]);
  });

  it("COMPILE.MODULE.KEYS: the host keys are in the order of the records, also when a key is the text of another position", () => {
    const shuffled = ["2", "0", "1"];
    const s: Space = { kind: "record", keys: shuffled, records: RECORDS, has: (k): k is string => shuffled.includes(k), get: (k) => RECORDS[shuffled.indexOf(k)], coords: () => undefined, keyAt: () => undefined };
    expectSameIn(op("get", LIST, lit("2")), s, RECORDS, [shuffled]);
    expectSameIn(LIST, s, RECORDS, [shuffled]);
    expect(make(sourceOf(op("get", LIST, lit("2")))).run(RECORDS, {}, shuffled)).toStrictEqual([1, 1, 1]);
  });

  it("COMPILE.MODULE.KEYS: a list of the run has the keys of its records, also an error item, in each form of the envelope", () => {
    expectSame(LIST);
    expectSame(FAILED);
    expectSame(each(axes.others, ref("n")));
    expectSame(each(axes.all, each(axes.all, ref("n"))));
    expectSame(op("sortBy", each(axes.reverse(axes.all), ref("n"))));
    expectSame(op("take", LIST, lit(2)));
    expectSame(op("drop", LIST, lit(1)));
    expectSame(op("append", LIST, LIST));
    expect(make(sourceOf(LIST)).run(RECORDS, {}, ["x", "y", "z"])[0]).toMatchObject({ items: [{ key: "x" }, { key: "y" }, { key: "z" }] });
  });

  it("COMPILE.MODULE.KEYS: a list in a field keeps the keys of its records", () => {
    expectSame(rec({ all: LIST, n: ref("n") }));
    expectSame(rec({ all: FAILED }));
  });

  it("COMPILE.MODULE.KEYS: without compares the keys of the host", () => {
    expectSame(op("without", LIST, each(axes.where(axes.all, op("gt", ref("n"), lit(2))), ref("n"))));
    expectSame(op("without", FAILED, LITERAL));
  });

  it("COMPILE.MODULE.KEYS: a key of a literal and of fill stays its own key, and it does not match a record", () => {
    expectSame(op("get", op("append", LIST, LITERAL), lit("a")));
    expectSame(op("get", op("append", LITERAL, LIST), lit("a")));
    expectSame(op("get", op("append", op("fill", lit(1), lit(9)), LIST), lit("0")));
    expectSame(op("get", op("append", LIST, op("fill", lit(1), lit(9))), lit("0")));
    expectSame(op("append", LIST, op("fill", lit(2), lit(9))), ["0", "1", "2"].map((k) => `k${k}`));
    expect(make(sourceOf(op("get", op("append", LIST, op("fill", lit(1), lit(9))), lit("0")))).run(RECORDS, {}, KEYS)).toStrictEqual([9, 9, 9]);
  });

  it("COMPILE.MODULE.KEYS: the move key finds the position of a key of the host", () => {
    expectSame(ref("n", [key("c")]));
    expectSame(ref("n", [key("0")]));
    expectSame(ref("n", [key("missing")]));
    expectSame(ref("n", [key(ref("id"))]));
    expectSame(ref("n", [key(ref("n"))]));
    expectSame(ifError(ref("n", [key(ref("id"))]), lit(-1)));
    expectSame(ref("n", [key("b"), index(0)]));
    expectSame(ifError(op("add", ref("n", [index(ref("n"))]), ref("n", [key("a")])), lit(-1)));
    expectSame(each(axes.all, ref("n", [key("a")])));
    expect(make(sourceOf(ref("n", [key("c")]))).run(RECORDS, {}, KEYS)).toStrictEqual([3, 3, 3]);
  });

  it("COMPILE.MODULE.KEYS: the axis list reads the record of each item at its key, and the items keep their keys", () => {
    const reads = each(axes.list(LIST), ref("n"));
    expectSame(reads);
    expectSame(op("get", reads, lit("b")));
    expectSame(fold(axes.list(LIST), { s: lit(0) }, { s: op("add", v("s"), ref("n")) }, v("s")));
    expectSame(let_({ l: op("take", LIST, lit(2)) }, op("get", each(axes.list(v("l")), op("add", ref("n"), ref("n"))), lit("b"))));
  });

  it("COMPILE.MODULE.KEYS: the axis list over the keys of a literal keeps these keys, and the print refuses a read at them", () => {
    expectSame(each(axes.list(LITERAL), lit(1)));
    expect(reasonOf(each(axes.list(LITERAL), ref("n")))).toContain('reads a record at a key of a literal or of "fill"');
  });

  it("COMPILE.MODULE.KEYS: a plain list reads the keys of the host in get, and the plain result has no keys", () => {
    const options: ModuleOptions = { ...OPTIONS, lists: "plain" };
    expect(make(sourceOf(op("get", LIST, lit("b")), options)).run(RECORDS, {}, KEYS)).toStrictEqual([2, 2, 2]);
    expect(sourceOf(LIST, options)).toBe(sourceOf(LIST, { ...PLAIN_OPTIONS, lists: "plain" }));
  });

  it("COMPILE.MODULE.KEYS: a tree space takes the keys after the parents, and its moves and axes keep the results", () => {
    const keys = ["root", "left", "right"];
    const s = space.tree(byKey(keys, RECORDS), { left: "root", right: "root" });
    const options: ModuleOptions = { ...OPTIONS, space: "tree" };
    expect(sourceOf(LIST, options)).toContain("export function run(records, vars, parents, keys) {");
    for (const e of [each(axes.children, ref("n")), op("get", each(axes.siblings, ref("n")), lit("right")), ref("n", [key("right"), parent]), ifError(ref("n", [offset(1)]), lit(-1)), ifError(op("get", LIST, ref("id")), lit(-1))]) {
      expectSameIn(e, s, RECORDS, [[-1, 0, 0], keys], options);
    }
  });

  it("COMPILE.MODULE.KEYS: a graph space takes the keys after the edges", () => {
    const keys = ["x", "y", "z"];
    const s = space.graph(byKey(keys, RECORDS), { x: ["y", "z"], y: ["z"] });
    const options: ModuleOptions = { ...OPTIONS, space: "graph" };
    expect(sourceOf(LIST, options)).toContain("export function run(records, vars, edges, keys) {");
    for (const e of [each(axes.successors, ref("n")), op("get", each(axes.predecessors, ref("n")), lit("x")), ref("n", [key("z")])]) {
      expectSameIn(e, s, RECORDS, [[[1, 2], [2], []], keys], options);
    }
  });

  it("COMPILE.MODULE.KEYS: a sheet takes the keys, and a column of lists has them", () => {
    const columns = new Map<string, Expr>([["all", LIST], ["v", op("get", LIST, ref("id"))]]);
    const m = emitSheetModule(columns, OPTIONS);
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const s = space.record(byKey(KEYS, RECORDS));
    const run = new SheetRun(columns, { space: s, domains: DOMAINS });
    const expected = (c: string): readonly unknown[] => s.keys.map((k) => {
      const r = run.cell(c, k);
      return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
    });
    expect(loaded.run(RECORDS, {}, KEYS)).toStrictEqual({ all: expected("all"), v: expected("v") });
  });

  it("P17 COMPILE.MODULE.KEYS: random keys and random programs give the values of the interpreter", { timeout: propertyTimeout(60_000) }, () => {
    const program = fc.oneof(
      fc.constantFrom<Expr>(LIST, FAILED, op("sortBy", LIST), op("append", LIST, LITERAL), op("take", LIST, lit(1)), each(axes.list(LIST), ref("n")), each(axes.others, ref("n"))),
      fc.constantFrom("a", "b", "0", "1", "k0", "k1").chain((k) => fc.constantFrom<Expr>(op("get", LIST, lit(k)), op("get", op("append", LITERAL, FAILED), lit(k)), ref("n", [key(k)]), op("without", LIST, op("fill", lit(1), lit(k))), op("get", op("append", LIST, op("fill", lit(2), lit(5))), lit(k)))),
    );
    const keys = fc.uniqueArray(fc.constantFrom("a", "b", "c", "k0", "k1", "k2"), { minLength: 0, maxLength: 4 });
    fc.assert(
      fc.property(program, keys, (e, ks) => {
        const records = ks.map((_k, i) => ({ n: i + 1, id: ks[(i + 1) % ks.length] as string }));
        expectSame(e, ks, records);
      }),
      { numRuns: 100 },
    );
  });
});

describe("COMPILE.MODULE.KEYS: a program that reads no key", () => {
  // These programs read no key of a record, so the option changes no text.
  const programs: readonly (readonly [string, Expr])[] = [
    ["a field", ref("n")],
    ["a sum", op("sum", LIST)],
    ["a count", op("count", LIST)],
    ["a move by position", ref("n", [index(1)])],
    ["an offset", ifError(ref("n", [offset(-1)]), lit(0))],
    ["the axis window", op("sum", each(axes.window(-1, 1), ref("n")))],
    ["a fold", fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), ref("n")) }, v("s"))],
    ["a list that stays in the run", op("sum", op("sortBy", LIST))],
    ["a nth", op("nth", LIST, lit(0))],
    ["flat", op("sum", op("flat", each(axes.all, op("fill", lit(2), ref("n")))))],
  ];

  it.each(programs)("COMPILE.MODULE.KEYS: the option keeps the text of %s, and the run ignores the keys", (_title, e) => {
    const source = sourceOf(e);
    expect(source).toBe(sourceOf(e, PLAIN_OPTIONS));
    expect(source).toContain("export function run(records, vars) {");
    expect(source).not.toMatch(/\bK[CMP]\b/);
    const s = make(source);
    expect(s.run(RECORDS, {}, ["bad", "bad"])).toStrictEqual(s.run(RECORDS, {}));
  });

  it("COMPILE.MODULE.KEYS: a key of a literal alone reads no key of a record, so the text stays", () => {
    const e = op("get", LITERAL, lit("a"));
    expect(sourceOf(e)).toBe(sourceOf(e, PLAIN_OPTIONS));
    const values = op("fill", lit(2), lit(1));
    expect(sourceOf(values)).toBe(sourceOf(values, PLAIN_OPTIONS));
  });

  it("COMPILE.MODULE.KEYS: without the option, a program with keys keeps the keys of the positions, and the run ignores more arguments", () => {
    const m = make(sourceOf(op("get", LIST, lit("1")), PLAIN_OPTIONS));
    expect(m.run(RECORDS, {}, KEYS)).toStrictEqual([2, 2, 2]);
    expect(sourceOf(LIST, { ...PLAIN_OPTIONS, keys: false })).toBe(sourceOf(LIST, PLAIN_OPTIONS));
    const moved = make(sourceOf(ref("n", [key("1")]), PLAIN_OPTIONS));
    expect(moved.run(RECORDS, {})).toStrictEqual([2, 2, 2]);
    expect(sourceOf(ref("n", [key(ref("id"))]), PLAIN_OPTIONS)).toContain("K(");
  });

  it("COMPILE.MODULE.KEYS: a program that reads a key prints only the code of its reads", () => {
    const source = sourceOf(op("get", LIST, lit("b")));
    expect(source).toContain("export function run(records, vars, keys) {");
    expect(source).toContain("const KM = KC(keys, n);");
    expect(source).not.toContain("function KP");
    const moved = sourceOf(ref("n", [key("b")]));
    expect(moved).toContain('KP(KM, "b")');
    expect(moved).not.toContain("keys[");
  });
});

describe("COMPILE.MODULE.KEYS: the limits of the option", () => {
  it("COMPILE.MODULE.KEYS: a value of the option that is not a boolean gives a reason", () => {
    expect(reasonOf(ref("n"), { ...PLAIN_OPTIONS, keys: "yes" as never })).toBe('the option "keys" is yes, not true or false');
  });

  it("COMPILE.MODULE.KEYS: a run with keys that are not a key for each record is against the contract", () => {
    const m = make(sourceOf(op("get", LIST, lit("b"))));
    for (const bad of [undefined, "abc", ["a", "b"], ["a", "b", "c", "d"]]) {
      expect(() => m.run(RECORDS, {}, bad)).toThrow(m.VexContractError);
      expect(() => m.run(RECORDS, {}, bad)).toThrow("the keys are not an array with one key for each record");
    }
    expect(() => m.run(RECORDS, {}, ["a", 1, "c"])).toThrow("the key 1 is not a text of its own");
    expect(() => m.run(RECORDS, {}, ["a", "b", "a"])).toThrow("the key 2 is not a text of its own");
    expect(() => m.run(RECORDS, {}, ["a", "b", "a"])).toThrow(m.VexContractError);
  });

  it("COMPILE.MODULE.KEYS: an array space with keys has no offset when the program reads a key, as a record space has none", () => {
    const reason = 'an offset or the axis "window" in an array space with the option "keys"';
    expect(reasonOf(op("add", ref("n", [offset(1)]), op("get", LIST, lit("b"))))).toBe(reason);
    expect(reasonOf(op("add", op("sum", each(axes.window(0, 1), ref("n"))), op("get", LIST, lit("b"))))).toBe(reason);
    expect(reasonOf(op("add", ref("n", [offset(1)]), op("get", LIST, lit("b"))), PLAIN_OPTIONS)).toBe("");
  });

  it("COMPILE.MODULE.KEYS: a sheet with formulas of cells gives a reason, because the keys of the cells are positions", () => {
    const columns = new Map<string, Expr>([["c", ref("n")]]);
    const cells = new Map([["c", new Map([["0", lit(1)]])]]);
    const options: SheetModuleOptions = { domains: DOMAINS, schema: SCHEMA, cells };
    expect(emitSheetModule(columns, { ...options, keys: true })).toStrictEqual({ ok: false, reason: 'the option "keys" with formulas of cells' });
    expect(emitSheetModule(columns, options).ok).toBe(true);
    expect(emitSheetModule(columns, { ...options, cells: new Map(), keys: true }).ok).toBe(true);
  });
});

/**
 * Standalone modules (docs/COMPILER.md §4.4). A module gives the value of the interpreter at each key, `VEX_ERROR` for
 * an error of Vex, and a `VexContractError` for an input against the schema (COMPILE.MODULE).
 */
import { app, axes, call, defineDomain, each, evaluate, ext, fn, fold, index, iterate, key, let_, lit, offset, rec, ref, space, v, type AnyDomain, type Axis, type Expr, type PrimitiveKind } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new (m: string) => Error;
}

const SCHEMA = { fields: { n: "number", w: "number", s: "string", b: "boolean" }, vars: { a: "number", t: "string" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const RECORDS = [
  { n: 1, w: 4, s: "x", b: true },
  { n: -2, w: 0, s: "yz", b: false },
  { n: 3, w: 2.5, s: "", b: true },
];
/** More than 12 records, so the key "12" is in the space. */
const MANY = Array.from({ length: 14 }, (_v, i) => ({ n: ((i * 7) % 5) - 2, w: ((i * 5) % 7) / 2 - 1, s: "xyz".slice(0, i % 3), b: i % 3 !== 1 }));
const VARS = { a: 2, t: "x" };

const dir = mkdtempSync(join(tmpdir(), "vex-module-"));
let files = 0;

/** This function imports the source of a module from a file, as a host imports it. */
async function load(source: string): Promise<Loaded> {
  const file = join(dir, `m${files++}.mjs`);
  writeFileSync(file, source);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Loaded;
}

/** This function makes the module of a source with `new Function`, for the many programs of a property. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
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

/**
 * This function compares the values of a module with the interpreter at each key. The module gets a copy of the
 * records, so a module that changes its input gives other values.
 */
function expectSame(m: Loaded, e: Expr, records: readonly unknown[] = RECORDS, vars: Readonly<Record<string, unknown>> = VARS, options: ModuleOptions = OPTIONS): void {
  const got = m.run(structuredClone(records), vars);
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars, ...(options.domains === undefined ? {} : { domains: options.domains }) });
    return r.ok ? r.value : m.VEX_ERROR;
  });
  expect(got).toStrictEqual(expected);
}

/** This function makes a function from its source, so the test decides the text that the printer reads. */
function fnOf(src: string, outside?: unknown): (...a: never[]) => unknown {
  // oxlint-disable-next-line typescript/no-implied-eval -- the test decides the source of the function.
  return new Function("OUTSIDE", `return (${src});`)(outside) as (...a: never[]) => unknown;
}

/** This function makes a domain of one primitive kind, with the ops of some sources and their kinds of result. */
function domainOf(name: string, primitive: PrimitiveKind, ops: Readonly<Record<string, readonly [string, PrimitiveKind]>>, valid?: string): AnyDomain {
  return defineDomain({
    name,
    is: (u: unknown): u is unknown => typeof u === primitive,
    primitive,
    ops: Object.fromEntries(Object.entries(ops).map(([op, [src, returns]]) => [op, { fn: fnOf(src) as (self: unknown, ...args: never[]) => unknown, returns }])),
    ...(valid === undefined ? {} : { valid: fnOf(valid) as (x: unknown) => boolean }),
  }) as AnyDomain;
}

const n = ref("n");
const w = ref("w");
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
/** The keys of the origin, for the nodes of the memo. */
const K = ref("n", [{ t: "origin" }]);
const KW = ref("w", [{ t: "origin" }]);
const column = op("mod", K, lit(2));

/** This function gives the axis all with each test, the first test inside. */
const allWhere = (...tests: Expr[]): Axis => tests.reduce<Axis>((a, t) => axes.where(a, t), axes.all);
/** The reasons of the printer. */
const field = (path: string): string => `a read of a field that is not in the schema: "${path}"`;
const undecided = (name: string): string => `the kinds of the values of "${name}" do not decide its op`;
const badOptions = (name: string): string => `the options of "${name}" are not a literal with strict`;
const copy = (name: string, what: string): string => `the op "probe" of the domain ${name} ${what}`;

/** A list op over the items whose test against the key `k` is true. */
const where = (test: Expr, body: Expr, o = "count"): Expr => op(o, each(axes.where(axes.all, test), body));

describe("COMPILE.MODULE: a standalone module", () => {
  it("is an ES module without imports that gives the value of the interpreter at each key", async () => {
    const e = rec({ x: op("add", n, v("a")), y: op("sum", each(axes.others, w)), z: op("upper", ref("s")) });
    const source = sourceOf(e);
    expect(source).not.toContain("import");
    const m = await load(source);
    expectSame(m, e);
    // A record of a module is a new object, not frozen.
    expect(Object.isFrozen(m.run(RECORDS, VARS)[0])).toBe(false);
  });

  it("checks the schema once and throws a VexContractError for an input against it", async () => {
    const m = await load(sourceOf(op("add", n, v("a"))));
    expect(() => m.run("not records", VARS)).toThrow(m.VexContractError);
    expect(() => m.run("not records", VARS)).toThrow("the records are not an array");
    expect(() => m.run([null], VARS)).toThrow("the record 0 does not keep the schema");
    expect(() => m.run([{ ...RECORDS[0], n: "1" }], VARS)).toThrow("the record 0 does not keep the schema");
    expect(() => m.run(RECORDS, { a: "2", t: "x" })).toThrow("the variables do not keep the schema");
    expect(() => m.run(RECORDS, null)).toThrow(m.VexContractError);
    expect(m.run([], VARS)).toEqual([]);
  });

  it("gives VEX_ERROR at each key with an error, and ifError, the list ops and the bindings catch the errors as the interpreter does", async () => {
    const cases: readonly Expr[] = [
      op("divide", n, lit(0)),
      op("ifError", op("divide", n, op("subtract", w, w)), lit(-1)),
      let_({ bad: op("divide", lit(1), lit(0)), good: op("add", n, lit(1)) }, op("multiply", v("good"), lit(2))),
      let_({ bad: op("divide", lit(1), lit(0)) }, op("if", ref("b"), v("bad"), lit(0))),
      op("sum", each(axes.all, op("divide", lit(1), w))),
      op("sum", each(axes.all, op("divide", lit(1), w)), lit({ strict: true })),
      op("mean", each(axes.where(axes.all, op("gt", n, lit(5))), n)),
      op("max", each(axes.where(axes.others, ref("b")), w)),
      op("min", each(axes.window(-1, 1), n)),
      op("first", each(axes.window(1, 2), ref("s"))),
      op("count", each(axes.where(axes.all, op("eq", ref("s"), lit("x"))), w)),
      op("and", op("any", each(axes.all, ref("b"))), op("not", op("all", each(axes.all, ref("b"))))),
      op("none", each(axes.all, op("lt", n, lit(-5)))),
      op("sum", each(axes.all, ref("s"))),
      op("any", each(axes.all, n)),
      op("if", n, lit(1), lit(2)),
      op("or", ref("b"), op("gt", op("divide", lit(1), lit(0)), lit(0))),
      // An argument of a kind that the op does not accept, a branch of each kind, and the literal -0.
      op("add", n, lit("x")),
      op("eq", n, lit("x")),
      op("if", ref("b"), n, ref("s")),
      op("divide", lit(1), lit(-0)),
      // A binding that the body does not read: its error and its key do not matter.
      let_({ x: op("add", n, lit("x")) }, lit(1)),
      let_({ x: n }, lit(1)),
      // A value that is not a boolean before the stop of and and or.
      op("and", n, ref("b")),
      op("or", n, ref("b")),
      // The items of a list op whose kind the printer does not know, and a sum that is not finite.
      op("sum", each(axes.all, op("if", ref("b"), n, ref("s")))),
      op("any", each(axes.all, op("if", ref("b"), ref("b"), n))),
      op("sum", each(axes.all, op("multiply", w, lit(1e308)))),
      // A test of the key with one argument, and an address of the axis all that can fail.
      where(op("eq", K), w),
      op("count", each(axes.where(axes.all, op("eq", n, K)), w, [index(5)])),
    ];
    for (const e of cases) expectSame(await load(sourceOf(e)), e);
  });

  it("COMPILE.MODULE V-051: the axis all with an address that fails at some keys gives the error at those keys", () => {
    // V-051: the module did not evaluate the address of the axis all, so it gave a value at each key.
    for (const at of [[offset(1)], [offset(-1)], [index(1)], [index(5)], [{ t: "origin" as const }]]) {
      const e = op("count", each(axes.all, n, at));
      expectSame(make(sourceOf(e)), e);
    }
  });

  it("needs no domains and no schema for a program of literals", () => {
    const m = make(sourceOf(rec({ a: lit(1), b: op("if", lit(true), lit("x"), lit(false)) }), { schema: {} }));
    expect(m.run([{}, {}], {})).toEqual([{ a: 1, b: "x" }, { a: 1, b: "x" }]);
    // Without domains, the check of a number is that it is finite.
    const sum = op("sum", each(axes.all, lit(1)));
    expectSame(make(sourceOf(sum, { schema: {} })), sum, [{}, {}], {}, { schema: {} });
  });

  it("reads the record at each address of an array space", async () => {
    const at = (m: Parameters<typeof ref>[1]): Expr => op("ifError", ref("n", m), lit(99));
    const e = rec({
      prev: at([offset(-1)]),
      next: at([offset(1)]),
      half: at([offset(0.5)]),
      grid: at([offset(1, 1)]),
      origin: at([{ t: "origin" }]),
      first: at([index(0)]),
      third: at([index(2)]),
      far: at([index(7)]),
      neg: at([index(-1)]),
      k1: at([key("1")]),
      k9: at([key("9")]),
      k12: at([key("12")]),
      bad: at([key("01")]),
      other: at([{ t: "other" }]),
      parent: at([{ t: "parent" }]),
      sum: op("sum", each(axes.others, n, [offset(1)])),
      // NAV.COMPUTED: a position or a key from an expression. A position that is not whole, or a key that is not the
      // text of an index, has no record.
      byN: at([index(n)]),
      byW: at([index(w)]),
      byText: at([key(ref("s"))]),
      byNumber: at([key(n)]),
      keyOne: at([key(lit("1"))]),
      keyZero: at([key(op("if", ref("b"), lit("0"), lit("01")))]),
      afterIndex: at([index(lit(0)), offset(1)]),
      fromN: op("ifError", op("sum", each(axes.others, n, [index(op("add", n, lit(1)))])), lit(-1)),
    });
    const m = make(sourceOf(e));
    expectSame(m, e);
    // A space of two keys has the move other.
    expectSame(m, e, RECORDS.slice(0, 2));
    expectSame(m, e, MANY);
  });

  it("evaluates a node of the memo once for each value of its keys, and nodes with the same expression share a function", () => {
    const group = (k: Expr): Expr => op("max", each(axes.where(axes.all, op("eq", op("mod", n, lit(2)), k)), w));
    const e = op("add", group(column), op("multiply", group(column), lit(2)));
    const source = sourceOf(e);
    // The two groups share one function. The nodes above them have no loop of their own, so they have no function.
    expect(source.match(/= (?:M1?|S)\(/g)).toHaveLength(1);
    expectSame(make(source), e);
    const records = Array.from({ length: 40 }, (_v, i) => ({ n: i, w: i % 7, s: "", b: true }));
    expectSame(make(source), e, records);
    // Two nodes with other keys of the same kind share the function too.
    const others = op("add", group(column), group(op("mod", KW, lit(2))));
    expect(sourceOf(others).match(/= (?:M1?|S)\(/g)).toHaveLength(1);
    expectSame(make(sourceOf(others)), others, MANY);
    // Two groups that differ only by 0 and -0 have two functions: -0 + 0 is 0, but -0 + -0 is -0.
    const signed = (zero: number): Expr => op("max", each(axes.where(axes.all, op("eq", op("mod", n, lit(2)), column)), op("add", w, lit(zero))));
    const zeros = rec({ plus: signed(0), minus: signed(-0) });
    expect(sourceOf(zeros).match(/= (?:M1?|S)\(/g)).toHaveLength(2);
    expectSame(make(sourceOf(zeros)), zeros, [{ n: 0, w: -0, s: "", b: true }, { n: 1, w: -0, s: "", b: true }]);
    // The offsets [1, 1] and [11] are not the same, so the nodes do not share a function.
    const moved = (d: readonly number[]): Expr => op("ifError", op("max", each(axes.where(axes.all, op("eq", n, K)), op("ifError", ref("w", [offset(...d)]), lit(0)))), lit(-1));
    const offsets = rec({ two: moved([1, 1]), one: moved([11]) });
    expect(sourceOf(offsets).match(/= (?:M1?|S)\(/g)).toHaveLength(2);
    expectSame(make(sourceOf(offsets)), offsets, MANY);
  });

  it("gives a reason for a program that cannot be a module", () => {
    expect(reasonOf(ref("missing"))).toBe(field("missing"));
    expect(reasonOf(ref(["n", "x"]))).toBe(field("n.x"));
    expect(reasonOf(ref([]))).toBe(field(""));
    expect(reasonOf(n, { schema: {} })).toBe(field("n"));
    expect(reasonOf(v("free"))).toBe('a variable that is not in the schema: "free"');
    expect(reasonOf(v("a"), { schema: {} })).toBe('a variable that is not in the schema: "a"');
    expect(reasonOf(each(axes.all, n))).toBe("a list is a value of the program");
    expect(reasonOf(ext("note", null))).toBe('the extension "note"');
    expect(reasonOf(op("add", n, lit(null)))).toBe(undecided("add"));
    expect(reasonOf(op("count"))).toBe(undecided("count"));
    // The branches of the if have two kinds, so the kind of the if is not known.
    expect(reasonOf(op("add", op("if", ref("b"), n, ref("s")), lit(1)))).toBe(undecided("add"));
    expect(reasonOf(op("count", each(axes.children, n)))).toBe('the axis "children"');
    expect(reasonOf(op("count", each(axes.window(0.5, 1), n)))).toBe('the axis "window" with a bound that is not an integer');
    expect(reasonOf(op("count", each(axes.window(0, 1.5), n)))).toBe('the axis "window" with a bound that is not an integer');
    for (const o of [lit("x"), lit(1), lit(null), lit({ strict: true, other: 1 }), v("a")]) expect(reasonOf(op("count", each(axes.all, n), o))).toBe(badOptions("count"));
    expect(reasonOf(op("count", each(axes.all, n), lit({ strict: true }), lit(1)))).toBe('"count" with more than one option');
    expect(reasonOf(lit(Number.NaN))).toBe("a literal is a number that is not finite");
    expect(reasonOf(lit({ x: 1 }))).toBe("a literal is not a number, a text, a boolean or null");
    expect(reasonOf(op("if", ref("b"), n))).toBe("an if without three arguments");
    expect(reasonOf(op("if", ref("b"), n, w, n))).toBe("an if without three arguments");
    expect(reasonOf(op("ifError", n))).toBe("an ifError without two arguments");
    expect(reasonOf(op("ifError", n, w, n))).toBe("an ifError without two arguments");
    expect(reasonOf(op("and"))).toBe("an and without arguments");
    expect(reasonOf(op("or"))).toBe("an or without arguments");
    expect(reasonOf(op("date", n, lit(1), lit(1)))).toBe('the op "date" does not declare the kind of its result');
    expect(reasonOf(op("add", n, lit(1)), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toBe(undecided("add"));
    expect(reasonOf(op("sum", each(axes.all, n)), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toBe("a domain without a primitive type comes before the domain of a number");
    expect(reasonOf(n, { ...OPTIONS, name: "not a name" })).toBe('the name "not a name" is not a JavaScript name');
    // A node of the memo that keeps its items gives the reasons of a list op too.
    expect(reasonOf(where(op("eq", n, K), w, "keys"))).toBe("a list is a value of the program");
    expect(reasonOf(op("count", each(axes.where(axes.children, op("eq", n, K)), w)))).toBe('the axis "children"');
    expect(reasonOf(op("sum", each(axes.where(axes.all, op("eq", n, K)), w), lit("x")))).toBe(badOptions("sum"));
    expect(reasonOf(op("count", each(axes.where(axes.where(axes.all, op("and")), op("eq", n, K)), w)))).toBe("an and without arguments");
    expect(reasonOf(where(op("lt", op("if", ref("b"), n, ref("s")), K), w))).toBe(undecided("lt"));
  });

  it("copies only a function whose source is an expression that reads no name outside itself", () => {
    const outside = "reads a name outside itself, so a module cannot copy it";
    const none = "has no source that a module can copy";
    // The op concat of TextDomain calls a function of its module, so its copy would throw.
    expect(reasonOf(op("concat", ref("s"), v("t")))).toBe('the op "concat" of the domain Text reads a name outside itself, so a module cannot copy it');
    // Only the values of a known kind are samples, and a value of another kind is not one.
    expect(reasonOf(op("concat", ref("s"), op("if", ref("b"), n, ref("s"))))).toBe('the op "concat" of the domain Text reads a name outside itself, so a module cannot copy it');
    const native = defineDomain({ name: "Native", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { probe: { fn: Math.hypot, returns: "number" } } });
    expect(reasonOf(op("probe", n, w), { domains: [native], schema: SCHEMA })).toBe(copy("Native", none));
    // An arrow function with super has a source, but the source does not compile alone.
    const withSuper = ({ make(): (a: number) => number {
      return (a: number): number => a + Number(super.valueOf === undefined);
    } }).make();
    const odd = defineDomain({ name: "Odd", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { probe: { fn: withSuper, returns: "number" } } });
    expect(reasonOf(op("probe", n), { domains: [odd], schema: SCHEMA })).toBe(copy("Odd", none));
    // A method has a source, but the source is not an expression.
    // oxlint-disable-next-line typescript/unbound-method -- the test needs the source of a method.
    const method = defineDomain({ name: "Method", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { probe: { fn: { probe(a: number): number { return a; } }.probe, returns: "number" } } });
    expect(reasonOf(op("probe", n), { domains: [method], schema: SCHEMA })).toBe(copy("Method", none));
    // Each function reads a name outside itself at one sample only, and gives undefined there. Thus only that sample
    // tells the copy from the function.
    const samples: readonly (readonly [PrimitiveKind, string, Expr])[] = [
      ["number", "-1", n],
      ["number", "-0", n],
      ["number", "-7", n],
      ["string", '""', ref("s")],
      ["string", '"a"', ref("s")],
      ["string", '"ab c"', ref("s")],
      ["boolean", "true", ref("b")],
      ["boolean", "false", ref("b")],
    ];
    for (const [kind, sample, x] of samples) {
      const probe = domainOf("Probe", kind, { probe: [`(x) => (Object.is(x, ${sample}) ? OUTSIDE : x)`, kind] });
      expect({ sample, reason: reasonOf(op("probe", x), { domains: [probe], schema: SCHEMA }) }).toEqual({ sample, reason: copy("Probe", outside) });
    }
  });

  it("gives an exception of the printer that is not a reason to the caller", () => {
    const schema = {
      get fields(): never {
        throw new Error("a defect");
      },
    };
    expect(() => emitModule(n, { schema })).toThrow("a defect");
  });
});

/** This function compares a module with its golden file and the interpreter (docs/COMPILER.md §10). */
async function expectGolden(name: string, e: Expr, options: ModuleOptions = OPTIONS): Promise<void> {
  const source = sourceOf(e, options);
  await expect(source).toMatchFileSnapshot(`./__golden__/module-${name}.js`);
  const m = make(source);
  expectSame(m, e, RECORDS, VARS, options);
  expectSame(m, e, MANY, VARS, options);
}

/**
 * The golden files of the modules. The text of a module is a part of a host, for example the core of ireko, and its
 * size and its speed come from the text. Thus a change of the text shows as a readable diff in review. To accept a
 * change, run `vitest run -u` and commit the new files.
 */
describe("COMPILE.MODULE: the text of a module", () => {
  it("the forms: literals, reads, ops, constants of the run, if, and, or, ifError and bindings", async () => {
    const safe = (x: Expr, d: Expr = lit(0)): Expr => op("ifError", x, d);
    const e = rec({
      lit: rec({ x: lit(1.5), z: lit(-0), s: lit('q"x'), b: lit(true), u: lit(null) }),
      refs: rec({
        origin: K,
        prev: safe(ref("n", [offset(-1)])),
        k1: safe(ref("w", [key("1")])),
        k12: safe(ref("w", [key("12")])),
        k01: safe(ref("w", [key("01")])),
        i0: safe(ref("w", [index(0)])),
        neg: safe(ref("w", [index(-1)])),
        frac: safe(ref("w", [index(1.5)])),
        half: safe(ref("w", [offset(0.5)])),
        two: safe(ref("w", [offset(1, 1)])),
        other: safe(ref("w", [{ t: "other" }])),
        parent: safe(ref("w", [{ t: "parent" }])),
      }),
      ops: rec({
        inline: safe(op("add", n, w)),
        cmp: op("gt", n, v("a")),
        called: op("length", ref("s")),
        upper: op("upper", ref("s")),
        bad: safe(op("add", n, lit("x"))),
        badEq: safe(op("eq", n, lit("x")), lit(false)),
        clamp: safe(op("clamp", w, lit(0), v("a"))),
        neg: op("negate", n),
      }),
      consts: rec({
        once: op("add", v("a"), lit(1)),
        again: op("multiply", op("add", v("a"), lit(1)), lit(2)),
        div: op("divide", lit(1), v("a")),
        caught: safe(op("divide", v("a"), lit(0))),
        fixed: safe(op("add", ref("w", [index(0)]), lit(1))),
      }),
      ifs: rec({
        plain: op("if", ref("b"), n, w),
        stmts: op("if", op("gt", n, lit(0)), safe(op("divide", lit(1), n)), lit(1)),
        unknown: safe(op("if", op("ifError", ref("b"), ref("s")), lit(1), lit(2))),
        nb: safe(op("if", n, lit(1), lit(2))),
      }),
      andOr: rec({
        and: op("and", ref("b"), op("gt", n, lit(0))),
        or: op("or", ref("b"), op("gt", safe(op("divide", lit(1), n)), lit(0))),
        and3: op("and", ref("b"), op("gt", safe(op("divide", lit(1), n)), lit(0)), op("lt", w, lit(3))),
        nb: safe(op("or", n, ref("b")), lit(false)),
      }),
      ifError: rec({ safe: safe(n), unsafe: safe(op("divide", n, w), lit(-1)) }),
      lets: let_({ k: op("add", v("a"), lit(1)), x: op("divide", lit(1), w), y: n }, let_({ z: v("x") }, rec({ k: v("k"), z: safe(op("add", v("z"), v("y"))) }))),
      unused: let_({ u: op("divide", n, lit(0)) }, lit(1)),
    });
    await expectGolden("forms", e);
  });

  it("the list ops over the axes all, others and window", async () => {
    const e = rec({
      count: op("count", each(axes.all, n)),
      countStrict: op("count", each(axes.all, n), lit({ strict: true })),
      countTest: op("count", each(axes.where(axes.all, ref("b")), n)),
      countUnsafe: op("count", each(axes.all, op("divide", lit(1), w))),
      sum: op("sum", each(axes.all, w)),
      sumStrict: op("ifError", op("sum", each(axes.all, op("divide", lit(1), w)), lit({ strict: true })), lit(0)),
      mean: op("ifError", op("mean", each(axes.where(axes.others, op("gt", w, lit(0))), n)), lit(0)),
      min: op("min", each(axes.window(-1, 1), n)),
      max: op("ifError", op("max", each(axes.all, op("if", ref("b"), n, ref("s")))), lit(0)),
      any: op("any", each(axes.all, ref("b"))),
      all: op("all", each(axes.all, op("gt", n, lit(0)))),
      none: op("ifError", op("none", each(axes.all, op("if", ref("b"), ref("b"), n))), lit(false)),
      first: op("ifError", op("first", each(axes.window(1, 2), ref("s"))), lit("")),
      from: op("ifError", op("sum", each(axes.others, n, [offset(1)])), lit(0)),
      fromOrigin: op("sum", each(axes.others, n, [{ t: "origin" }])),
      nested: op("count", each(axes.all, op("count", each(axes.all, ref("s")), lit({ strict: true })))),
      outer: op("sum", each(axes.all, op("multiply", n, ref("w", [{ t: "origin" }])))),
      constant: op("sum", each(axes.all, v("a"))),
      big: op("ifError", op("sum", each(axes.all, op("multiply", w, lit(1e308)))), lit(0)),
    });
    await expectGolden("lists", e);
  });

  it("COMPILE.MODULE V-052: a move before a fixed key or the origin can fail, so the module evaluates it", async () => {
    // V-052: the printer kept only the code of the last fixed move, so the module read a record where the interpreter
    // gives #REF!. A move from the focus that fails makes the read fail too.
    const safe = (at: Parameters<typeof ref>[1]): Expr => op("ifError", ref("n", at), lit(99));
    const e = rec({
      key: safe([offset(1), key("0")]),
      index: safe([offset(-1), index(0)]),
      origin: safe([offset(1), { t: "origin" }]),
      computed: safe([offset(1), index(lit(0))]),
      twice: safe([{ t: "origin" }, offset(2), key("1")]),
      list: op("ifError", op("count", each(axes.all, n, [offset(1), key("0")])), lit(-1)),
    });
    expectSame(make(sourceOf(e)), e);
    expectSame(make(sourceOf(e)), e, MANY);
    // An offset or other after a move that can fail reads the index of that move, so it needs no other check. The origin cannot
    // fail, so a fixed key after it needs no check, and the read is a constant of the run.
    const checks = rec({
      offsets: safe([offset(1), offset(1)]),
      computed: safe([index(n), offset(-1)]),
      origin: safe([{ t: "origin" }, key("1")]),
      last: safe([key("0"), offset(1)]),
      other: safe([offset(1), { t: "other" }]),
    });
    await expectGolden("checks", checks);
  });

  it("LOOP.NAMES: fold and iterate are for loops with a variable for each name", async () => {
    const mid = op("divide", op("add", v("lo"), v("hi")), lit(2));
    const below = op("gt", lit(2), op("multiply", mid, mid));
    const e = rec({
      // A fold in the order of the axis, which depends on no key: a constant of the run.
      digits: fold(axes.all, { s: lit(0) }, { s: op("add", op("multiply", v("s"), lit(10)), n) }, v("s")),
      // A fold from the key, and a fold with a test and a result at the node.
      window: op("ifError", fold(axes.window(0, 1), { s: lit(0) }, { s: op("add", v("s"), w) }, v("s"), [offset(1)]), lit(-1)),
      tested: fold(axes.where(axes.others, ref("b")), { s: lit(0), k: K }, { s: op("add", v("s"), op("multiply", n, v("k"))) }, op("add", v("s"), n)),
      // A bisection with two names: a constant of the run. A swap of two names at each key.
      root: iterate(30, { lo: lit(0), hi: lit(2) }, { lo: op("if", below, mid, v("lo")), hi: op("if", below, v("hi"), mid) }, v("hi")),
      swap: iterate(3, { a: w, b: n }, { a: v("b"), b: v("a") }, op("subtract", v("a"), v("b"))),
      // An iteration that a test stops, and one whose test is never true.
      until: iterate(10, { x: lit(1) }, { x: op("multiply", v("x"), lit(2)) }, v("x"), op("gt", v("x"), K)),
      never: op("ifError", iterate(2, { x: lit(1) }, { x: v("x") }, v("x"), op("gt", v("x"), lit(5))), lit(-1)),
    });
    await expectGolden("loops", e);
    // A name needs a kind, and a step keeps the kind of its name.
    expect(reasonOf(iterate(1, { x: op("if", ref("b"), n, ref("s")) }, {}, lit(0)))).toBe('the first value of the name "x" of a loop has no kind');
    expect(reasonOf(iterate(1, { x: lit(0) }, { x: ref("b") }, lit(0)))).toBe('a step of a loop changes the kind of the name "x"');
    expect(reasonOf(fold(axes.children, { x: lit(0) }, {}, v("x")))).toBe('the axis "children"');
  });

  it("a part that cannot fail needs no try: and and or of safe booleans, a count of the records, and a list from the origin", async () => {
    const e = rec({
      and: let_({ x: op("and", ref("b"), op("not", ref("b"))) }, op("if", v("x"), n, w)),
      or: let_({ x: op("or", op("not", ref("b")), ref("b")) }, op("if", v("x"), n, w)),
      count: op("count", each(axes.all, ref("b"))),
      origin: let_({ x: op("count", each(axes.all, ref("b"), [{ t: "origin" }])) }, op("add", v("x"), n)),
      moved: op("ifError", op("count", each(axes.all, ref("b"), [offset(1)])), lit(-1)),
      // The option strict: false is the default: a list op skips each item with an error.
      lax: op("sum", each(axes.all, op("divide", lit(1), n)), lit({ strict: false })),
    });
    await expectGolden("safe", e);
  });

  it("COMPILE.GROUP: the nodes of the memo with keys, at the edges of the items that a node keeps", async () => {
    const e = rec({
      // Two keys vary, so the function of the node takes both. A key that can fail is a name with an error.
      two: op("add", op("count", each(axes.where(axes.all, op("and", op("eq", n, K), op("lt", w, KW))), n)), lit(1)),
      failing: let_({ k: op("divide", lit(6), n) }, op("count", each(allWhere(op("eq", w, v("k"))), n))),
      sum: op("sum", each(allWhere(op("eq", n, K)), w)),
      // The axis others, a body that reads the key, a second test that reads the key, and a test with one argument do not
      // keep their items.
      others: op("count", each(axes.where(axes.others, op("eq", n, K)), n)),
      body: op("sum", each(allWhere(op("eq", n, K)), op("add", w, K))),
      second: op("count", each(allWhere(op("eq", n, K), op("gt", w, K)), n)),
      single: op("count", each(allWhere(op("not", op("eq", n, K))), n)),
    });
    await expectGolden("keys", e);
  });

  it("LOOP.NAMES: a fold and an iteration that read a name of the origin depend on the origin", () => {
    // The step, the test and the result of a fold read the name o of the origin, so the loop is not a constant of the run.
    const e = let_(
      { o: n },
      rec({
        step: fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), op("multiply", w, v("o"))) }, v("s")),
        test: fold(axes.where(axes.all, op("gt", n, v("o"))), { s: lit(0) }, { s: op("add", v("s"), w) }, v("s")),
        result: fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), w) }, op("add", v("s"), v("o"))),
        iterate: iterate(2, { s: lit(0) }, { s: op("add", v("s"), v("o")) }, v("s")),
      }),
    );
    expectSame(make(sourceOf(e)), e);
    expectSame(make(sourceOf(e)), e, MANY);
  });

  it("two constants of the run with the same structure but other names do not share one value", () => {
    const plus = op("multiply", op("add", v("x"), lit(1)), n);
    const e = rec({ p: let_({ x: v("a") }, plus), q: let_({ x: op("multiply", v("a"), lit(10)) }, plus) });
    expectSame(make(sourceOf(e)), e);
  });

  it("each helper of a module brings the helpers that it needs", async () => {
    // In these programs, the helper F comes only from the helper that needs it: X, I, K or U.
    const programs: Readonly<Record<string, Expr>> = {
      offset: ref("s", [offset(1)]),
      index: ref("s", [index(n)]),
      key: ref("s", [key(ref("s"))]),
      any: op("any", each(axes.all, ref("b"))),
      first: op("first", each(axes.all, ref("s"))),
    };
    const lines = Object.entries(programs).map(([name, e]) => {
      const source = sourceOf(e);
      expectSame(make(source), e);
      const helpers = source.split("\n").flatMap((l) => /^(?:function|const) ([A-Z]\d?)\b/.exec(l)?.[1] ?? []);
      return `${name}: ${helpers.join(" ")}`;
    });
    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot("./__golden__/module-helpers.txt");
  });

  it("two constants of the run with one structure share one value, and a constant that can fail keeps its error", async () => {
    // With the variable a = 2, the quotient 1 / (a - 2) is not finite, so its constant holds the error.
    const e = rec({
      x: op("multiply", op("add", v("a"), lit(1)), n),
      y: op("subtract", n, op("add", v("a"), lit(1))),
      z: op("subtract", n, op("add", v("a"), lit(2))),
      q: op("add", n, op("divide", lit(1), op("subtract", v("a"), lit(2)))),
      r: op("ifError", op("add", n, op("divide", lit(1), op("subtract", v("a"), lit(2)))), lit(-1)),
    });
    const source = sourceOf(e);
    expect(source.match(/const c\d+ = /g)).toHaveLength(3);
    await expectGolden("constants", e);
  });

  it("a part of a loop over the targets that depends only on the target is a column of the run", async () => {
    // The part has enough work, so each run computes it once for each record. Two loops share the column.
    const heavy = op("max", op("abs", op("subtract", w, op("divide", n, lit(2)))), op("abs", op("add", w, op("multiply", n, lit(3)))));
    const e = rec({
      loop: iterate(3, { x: lit(0) }, { x: op("add", v("x"), op("sum", each(axes.all, heavy))) }, v("x")),
      again: op("ifError", op("max", each(axes.others, heavy)), lit(0)),
      // A light part, and a part that reads the origin, are not columns.
      light: op("sum", each(axes.all, op("add", w, lit(1)))),
      origin: op("sum", each(axes.all, op("max", heavy, K))),
    });
    const source = sourceOf(e);
    expect(source.match(/= Q\(/g)).toHaveLength(1);
    await expectGolden("columns", e);
    // The edges of the decision. A part with a work of 10 is a column, and a part with a work of 9 is not. A node of the
    // memo and a constant of the run count as one read. A name from the origin, and a node of the memo with keys, stop a
    // column.
    const nine = op("add", op("multiply", w, n), op("subtract", w, op("divide", n, lit(2))));
    const constant = op("multiply", op("add", v("a"), lit(1)), op("subtract", op("multiply", v("a"), lit(3)), lit(2)));
    const edges = rec({
      ten: op("sum", each(axes.all, op("abs", nine))),
      nine: op("sum", each(axes.all, nine)),
      memo: op("sum", each(axes.all, op("add", w, op("sum", each(axes.all, heavy))))),
      constant: op("sum", each(axes.all, op("add", w, constant))),
      outside: let_({ o: n }, op("sum", each(axes.all, op("add", heavy, v("o"))))),
      keyed: op("sum", each(axes.all, op("add", heavy, let_({ t: n }, op("count", each(axes.where(axes.all, op("eq", n, v("t"))), n)))))),
    });
    await expectGolden("columns-edges", edges);
  });

  it("KIND.DOMAIN: a value of a domain without a primitive type has the kind of its domain, so a kernel is in a module", async () => {
    type Span = { readonly lo: number; readonly hi: number };
    const Interval = defineDomain({
      name: "Interval",
      is: (u: unknown): u is Span => typeof u === "object" && u !== null && typeof (u as Partial<Span>).lo === "number" && typeof (u as Partial<Span>).hi === "number",
      ops: {
        span: { fn: (i: Span): number => i.hi - i.lo, returns: "number" },
        grow: { fn: (i: Span, d: number): Span => ({ lo: i.lo - d, hi: i.hi + d }), params: ["number"], returns: "domain" },
        merge: { fn: (a: Span, b: Span): Span => ({ lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) }), params: ["domain"], returns: "domain" },
      },
      samples: (): readonly Span[] => [{ lo: 0, hi: 1 }, { lo: -2, hi: 5 }],
    });
    const options: ModuleOptions = { domains: [NumDomain, Interval], schema: { fields: { iv: "domain:Interval", n: "number" } } };
    const rows = [{ iv: { lo: 0, hi: 2 }, n: 1 }, { iv: { lo: -3, hi: -1 }, n: 2 }, { iv: { lo: 5, hi: 6 }, n: 0.5 }];
    const iv = ref("iv");
    const e = rec({
      span: op("span", op("grow", iv, ref("n"))),
      // A fold builds an interval of all the rows, and a constant of the run keeps it.
      all: fold(axes.all, { u: ref("iv", [index(0)]) }, { u: op("merge", v("u"), iv) }, op("span", v("u"))),
    });
    const m = make(sourceOf(e, options));
    expectSame(m, e, rows, {}, options);
    // A record against the kind of the domain is against the schema.
    expect(() => m.run([{ iv: { lo: 0 }, n: 1 }], {})).toThrow(m.VexContractError);
    // A domain needs samples, and an op of a kernel must not read a name outside itself.
    const noSamples = defineDomain({ name: "Interval", is: Interval.is, ops: Interval.ops });
    expect(reasonOf(op("span", iv), { ...options, domains: [NumDomain, noSamples] })).toBe("the domain Interval gives no samples, so a module cannot check a copy of its op");
    const outside = { lo: 0 };
    const leaky = defineDomain({ ...Interval, ops: { span: { fn: (i: Span): number => i.hi - outside.lo, returns: "number" } } });
    expect(reasonOf(op("span", iv), { ...options, domains: [NumDomain, leaky] })).toBe('the op "span" of the domain Interval reads a name outside itself, so a module cannot copy it');
    expect(reasonOf(iv, { ...options, schema: { fields: { iv: "domain:Nope" } } })).toBe("the schema has the kind domain:Nope, and no domain has it");
    // A domain without a primitive type before the domain of the value can accept it, so the kinds do not decide the op.
    expect(reasonOf(op("span", iv), { ...options, domains: [Vec2Domain, Interval] })).toBe(undecided("span"));
    // An op that the domain of the value does not have can be a method of the value, or an op of a later domain.
    expect(reasonOf(op("nope", iv), options)).toBe(undecided("nope"));
    // A domain with valid checks each result of its kind. A variable can have the kind of a domain too.
    const checked = defineDomain({ ...Interval, valid: (i: Span): boolean => i.lo <= i.hi });
    const withVar: ModuleOptions = { domains: [NumDomain, checked], schema: { fields: { iv: "domain:Interval", n: "number" }, vars: { base: "domain:Interval" } } };
    const grown = rec({ grown: op("span", op("grow", iv, ref("n"))), merged: op("span", op("merge", v("base"), iv)) });
    const mv = make(sourceOf(grown, withVar));
    expectSame(mv, grown, [...rows, { iv: { lo: 0, hi: 1 }, n: -2 }], { base: { lo: 10, hi: 11 } }, withVar);
    expect(() => mv.run(rows, { base: 3 })).toThrow(mv.VexContractError);
    await expect(sourceOf(grown, withVar)).toMatchFileSnapshot("./__golden__/module-kernel.js");
    // The copy of an op must give the same structure at each sample: not another prototype, not null for a record, not a
    // record for null, not other fields, not another function, and not an object for a text. OUTSIDE is a name of the
    // original only.
    const copies = [
      "(i, d) => (typeof OUTSIDE === 'undefined' ? { lo: i.lo, hi: i.hi } : Object.assign(Object.create(null), { lo: i.lo, hi: i.hi }))",
      "(i, d) => (typeof OUTSIDE === 'undefined' ? { lo: i.lo, hi: i.hi } : null)",
      "(i, d) => (typeof OUTSIDE === 'undefined' ? null : { lo: i.lo, hi: i.hi })",
      "(i, d) => ({ lo: typeof OUTSIDE === 'undefined' ? i.lo : i.hi, hi: i.hi })",
      "(i, d) => () => i",
      // A text and a text object have the same prototype and the same JSON text.
      "(i, d) => (typeof OUTSIDE === 'undefined' ? Object('x') : 'x')",
    ];
    // A domain without a primitive type before the domain of booleans can accept a boolean result, so its check is not known.
    expect(reasonOf(op("gt", n, lit(1)), { domains: [NumDomain, Vec2Domain, BoolDomain], schema: SCHEMA })).toBe("a domain without a primitive type comes before the domain of a boolean");
    for (const src of copies) {
      const other = defineDomain({ ...Interval, ops: { ...Interval.ops, grow: { fn: fnOf(src, 1) as (i: Span, d: number) => Span, params: ["number"], returns: "domain" } } });
      expect(reasonOf(op("span", op("grow", iv, ref("n"))), { ...options, domains: [NumDomain, other] })).toBe('the op "grow" of the domain Interval reads a name outside itself, so a module cannot copy it');
    }
  });

  it("AXIS.REVERSE: a module loops over the reverse order of all and of a window from the end", () => {
    const e = rec({
      // A step that depends on the order, a list op with a test, and the first item of the reverse order.
      digits: fold(axes.reverse(axes.all), { s: lit(0) }, { s: op("add", op("multiply", v("s"), lit(10)), n) }, v("s")),
      window: op("sum", each(axes.where(axes.reverse(axes.window(-1, 1)), op("gt", w, lit(0))), w)),
      first: op("first", each(axes.reverse(axes.all), n)),
    });
    const source = sourceOf(e);
    expect(source).toContain("--) {");
    expectSame(make(source), e);
    expectSame(make(source), e, MANY);
  });

  it("FN.CALL: a module calls a printed function, with the names of the place of its binding", () => {
    const bind = { plus: fn(["x", "y"], op("add", v("x"), op("multiply", v("y"), n))), k: lit(10) };
    const parts: Readonly<Record<string, Expr>> = {
      once: call("plus", w, v("a")),
      loop: op("sum", each(axes.all, call("plus", n, v("k")))),
      fold: fold(axes.reverse(axes.all), { s: lit(0) }, { s: call("plus", v("s"), lit(1)) }, v("s")),
      // The body of g sees k of the place of its binding. The name a of the call does not change the variable a of the body.
      nested: let_({ g: fn(["z"], call("plus", v("z"), op("add", v("k"), v("a")))) }, let_({ k: lit(1000), a: lit(5) }, call("g", lit(2)))),
      // A name of a loop hides the function plus.
      hidden: iterate(2, { plus: lit(1) }, { plus: op("add", v("plus"), lit(1)) }, v("plus")),
    };
    const e = let_(bind, rec(parts));
    const m = make(sourceOf(e));
    expectSame(m, e);
    expectSame(m, e, MANY);
    // A call that is not valid is not a module.
    expect(reasonOf(let_(bind, call("plus", lit(1))))).toBe('a call of "plus" with 1 arguments, not 2');
    expect(reasonOf(let_(bind, call("k")))).toBe('a call of "k", which is not a function');
    expect(reasonOf(let_(bind, iterate(1, { plus: lit(0) }, { plus: lit(1) }, call("plus", lit(1), lit(2)))))).toBe('a call of "plus", which is not a function');
    expect(reasonOf(let_(bind, v("plus")))).toBe('the name "plus" is a function, not a value');
    expect(reasonOf(op("add", lit(1), fn(["x"], v("x"))))).toBe("the expression has a function outside the bindings of a let, or a function with parameters that are not distinct names");
    // Two functions with one name are two functions, so two calls with the same text do not share one constant.
    const named = rec({
      a: let_({ f: fn(["x"], op("add", v("x"), lit(10))) }, op("add", n, call("f", lit(1)))),
      b: let_({ f: fn(["x"], op("multiply", v("x"), lit(10))) }, op("add", n, call("f", lit(1)))),
      c: let_({ k: lit(2) }, let_({ f: fn(["x"], op("add", v("x"), v("k"))) }, op("add", n, call("f", lit(1))))),
      d: let_({ k: lit(3) }, let_({ f: fn(["x"], op("add", v("x"), v("k"))) }, op("add", n, call("f", lit(1))))),
    });
    expectSame(make(sourceOf(named)), named);
    // A part of a loop with a call is a column of the run only if the names that the function reads are constants.
    const big = op("add", op("multiply", w, w), op("subtract", op("multiply", n, w), op("add", n, lit(1))));
    const inner = op("sum", each(axes.all, let_({ k: w }, let_({ f: fn(["x"], op("add", v("x"), v("k"))) }, call("f", big)))));
    expectSame(make(sourceOf(inner)), inner);
    expectSame(make(sourceOf(inner)), inner, MANY);
    // The levels of a call: of each argument, of the focus and the origin that the body reads, and of the names of the
    // binding. Each of these calls depends on the key, so none is a constant of the run.
    const levels = let_(
      { one: fn(["x"], lit(1)), here: fn([], n), there: fn([], ref("n", [{ t: "origin" }])), m: w },
      let_(
        { local: fn(["x"], op("add", v("x"), v("m"))) },
        rec({ arg: call("one", n), focus: call("here"), origin: call("there"), binding: call("local", lit(1)) }),
      ),
    );
    expectSame(make(sourceOf(levels)), levels);
    expectSame(make(sourceOf(levels)), levels, MANY);
    // The arguments: a safe value with statements, a value with statements that can fail, and one function for each
    // kind of its arguments. A function of a let hides a value of an outer let with its name.
    const args = let_(
      { id: fn(["x"], v("x")), f: lit(1) },
      let_(
        { f: fn(["x"], op("add", v("x"), lit(1))) },
        rec({
          safe: call("f", op("count", each(axes.where(axes.window(-1, 1), ref("b")), n))),
          unsafe: op("ifError", call("f", op("sum", each(axes.window(-1, 1), op("divide", lit(1), w)))), lit(-1)),
          number: op("add", call("id", n), lit(1)),
          text: op("length", call("id", ref("s"))),
          hidden: call("f", lit(1)),
        }),
      ),
    );
    expectSame(make(sourceOf(args)), args);
    expectSame(make(sourceOf(args)), args, MANY);
    // A part of a loop that calls a function at its binding is not a column, also when the call is deeper in the part.
    const deeper = op("sum", each(axes.all, let_({ k: w }, let_({ f: fn(["x"], op("add", v("x"), v("k"))) }, op("multiply", call("f", big), lit(2))))));
    expectSame(make(sourceOf(deeper)), deeper);
    expectSame(make(sourceOf(deeper)), deeper, MANY);
    // A part of a loop that calls a function at the start of a run is a column, also when its arguments are not columns.
    const atStart = let_({ f: fn(["x", "y", "z"], op("add", op("multiply", v("x"), v("y")), v("z"))) }, op("sum", each(axes.all, call("f", op("add", w, n), op("multiply", w, n), op("subtract", w, n)))));
    expect(sourceOf(atStart)).toMatch(/const col\d+ = /);
    expectSame(make(sourceOf(atStart)), atStart);
    // A function is printed once for each signature of its arguments, also for many calls.
    const calls = let_({ f: fn(["x"], op("add", v("x"), n)) }, rec(Object.fromEntries(Array.from({ length: 300 }, (_x, i) => [`c${String(i)}`, call("f", lit(i))]))));
    const many = sourceOf(calls);
    expect(many.match(/const fn\d+ =/g)).toHaveLength(1);
    expectSame(make(many), calls);
    // The text grows with the number of functions, not with the calls: each function calls the one before it twice, so
    // the program puts the body of f1 in 2 ** 14 places, and the module has 15 functions.
    let chain: Expr = call("f15", lit(0));
    for (let i = 15; i >= 1; i--) chain = let_({ [`f${String(i)}`]: fn(["x"], i === 1 ? op("add", v("x"), lit(1)) : call(`f${String(i - 1)}`, call(`f${String(i - 1)}`, v("x")))) }, chain);
    expect(sourceOf(chain).match(/const fn\d+ =/g)).toHaveLength(15);
    expectSame(make(sourceOf(chain)), chain);
  });

  it("COMPILE.MODULE: a part of a loop in a loop of a function that reads a parameter and no name of a loop is a column of the call", () => {
    // The part reads the parameter r and the target of the inner loop. The body has a loop in a loop, so each call keeps
    // the part for each target, at the start of the body.
    const part = (r: Expr): Expr => op("add", op("multiply", r, w), op("subtract", op("multiply", n, r), op("add", w, lit(1))));
    const nested = let_({ f: fn(["r"], op("sum", each(axes.all, op("sum", each(axes.all, op("add", part(v("r")), n)))))) }, call("f", v("a")));
    const nestedSource = sourceOf(nested);
    expect(nestedSource).toMatch(/const fn\d+ = \(p\d+\) => \{\n\s*const col\d+ = Q\(/);
    expectSame(make(nestedSource), nested);
    expectSame(make(nestedSource), nested, MANY);
    // A body with one loop reads each part once in a call, so the part is no column of the call.
    const single = let_({ f: fn(["r"], op("sum", each(axes.all, op("add", part(v("r")), n)))) }, call("f", v("a")));
    expect(sourceOf(single)).not.toMatch(/=> \{\n\s*const col\d+ = Q\(/);
    expectSame(make(sourceOf(single)), single);
    // A binding at the root of the body is at the start of the body, so a column of the call reads it.
    const root = let_({ f: fn(["r"], let_({ s: op("multiply", v("r"), lit(2)) }, op("sum", each(axes.all, op("sum", each(axes.all, part(v("s")))))))) }, call("f", v("a")));
    expect(sourceOf(root)).toMatch(/const col\d+ = Q\(/);
    expectSame(make(sourceOf(root)), root);
    expectSame(make(sourceOf(root)), root, MANY);
    // A binding in a branch is in a block of the body, so a column at the start of the body cannot read it.
    const branch = let_({ f: fn(["r"], op("if", op("gt", v("r"), lit(0)), let_({ s: op("multiply", v("r"), lit(2)) }, op("sum", each(axes.all, op("sum", each(axes.all, part(v("s"))))))), lit(0))) }, call("f", v("a")));
    expectSame(make(sourceOf(branch)), branch);
    expectSame(make(sourceOf(branch)), branch, MANY);
    expectSame(make(sourceOf(branch)), branch, RECORDS, { a: -1, t: "x" });
    const atStart = /=> \{\n\s*const col\d+ = Q\(/;
    const loops = (body: Expr): Expr => op("sum", each(axes.all, op("sum", each(axes.all, body))));
    const check = (e: Expr, atCall: boolean): void => {
      const source = sourceOf(e);
      expect(atStart.test(source)).toBe(atCall);
      expectSame(make(source), e);
      expectSame(make(source), e, MANY);
    };
    // A fold and an iteration are loops too, so an axis in one is a loop in a loop.
    const step = (r: Expr): Readonly<Record<string, Expr>> => ({ s: op("add", v("s"), op("sum", each(axes.all, part(r)))) });
    check(let_({ f: fn(["r"], fold(axes.all, { s: lit(0) }, step(v("r")), v("s"))) }, call("f", v("a"))), true);
    check(let_({ f: fn(["r"], iterate(3, { s: lit(0) }, step(v("r")), v("s"))) }, call("f", v("a"))), true);
    // A part that also reads the origin is a column of the call: the origin does not change in a call.
    const withOrigin = op("add", op("multiply", v("r"), K), op("subtract", op("multiply", w, K), op("add", w, lit(1))));
    check(let_({ f: fn(["r"], loops(withOrigin)) }, call("f", v("a"))), true);
    // A part at the root of the body evaluates once in a call, so it is no column.
    check(let_({ f: fn(["r"], op("add", part(v("r")), loops(op("add", v("r"), w)))) }, call("f", v("a"))), false);
    // A part that reads no parameter is a column of the run, or no column. Two functions with the same part reading the
    // origin each compute it, because a column of one call is not a variable of the other function.
    const noParam = op("add", op("multiply", K, w), op("subtract", op("multiply", n, K), op("add", w, lit(1))));
    check(let_({ f: fn(["r"], op("add", v("r"), loops(part(lit(3))))) }, call("f", v("a"))), false);
    expect(sourceOf(let_({ f: fn(["r"], op("add", v("r"), loops(part(lit(3))))) }, call("f", v("a"))))).toMatch(/const col\d+ = Q\(/);
    check(let_({ f: fn(["r"], op("add", v("r"), loops(noParam))), g: fn(["r"], op("multiply", v("r"), loops(noParam))) }, rec({ f: call("f", v("a")), g: call("g", v("a")) })), false);
    // The bindings of a let at the root of the body of another let at the root are at the start of the body too.
    check(let_({ f: fn(["r"], let_({ s: op("multiply", v("r"), lit(2)) }, let_({ u: op("add", v("s"), lit(1)) }, loops(part(v("u")))))) }, call("f", v("a"))), true);
    // A function that the body calls is printed before the loops of the body, and the loops still see their own function.
    check(let_({ g: fn(["x"], op("add", v("x"), lit(1))) }, let_({ f: fn(["r"], op("add", call("g", v("r")), loops(part(v("r"))))) }, call("f", v("a")))), true);
  });

  it("V-055: a constant that reads a lazy constant or calls a function with a loop is lazy too", () => {
    // The name $x holds a loop, so it is lazy. The sum reads it, so it waits for its first read too, and a run that takes
    // the other branch starts no loop.
    const reads = let_({ $x: iterate(10, { x: lit(1) }, { x: op("multiply", v("x"), lit(2)) }, v("x")) }, op("if", op("gt", n, lit(100)), op("add", v("$x"), v("a")), n));
    const readsSource = sourceOf(reads);
    expect(readsSource).toMatch(/const c\d+ = L\(\(\) => \{\n\s*return [^\n]*c\d+\(\)/);
    expect(readsSource).not.toMatch(/= T\(\(\) => [^\n]*\bc\d+\(\)/);
    expectSame(make(readsSource), reads);
    expectSame(make(readsSource), reads, MANY);
    // A call of a function with a loop in its body is lazy, also when the call itself has no loop.
    const calls = let_({ f: fn(["y"], iterate(10, { x: v("y") }, { x: op("add", v("x"), lit(1)) }, v("x"))) }, op("if", op("gt", n, lit(100)), call("f", v("a")), n));
    const callsSource = sourceOf(calls);
    expect(callsSource).toMatch(/const c\d+ = L\(\(\) => \{\n\s*return fn\d+\(/);
    expect(callsSource).not.toMatch(/= T\(\(\) => [^\n]*fn\d+\(/);
    expectSame(make(callsSource), calls);
    // The names of the constants and of the functions can have more than one digit.
    const pad = (e: Expr): Expr => let_({ id: fn(["x"], v("x")) }, rec({ p1: call("id", lit(1)), p2: call("id", lit("x")), p3: call("id", op("gt", n, lit(1))), x: e }));
    expect(sourceOf(pad(reads))).toMatch(/const c\d\d = L\(\(\) => \{\n\s*return [^\n]*c\d\d\(\)/);
    expectSame(make(sourceOf(pad(reads))), pad(reads));
    expect(sourceOf(pad(calls))).toMatch(/const c\d+ = L\(\(\) => \{\n\s*return fn\d\d\(/);
    expectSame(make(sourceOf(pad(calls))), pad(calls));
    // A constant that reads neither stays eager.
    const plain = op("if", op("gt", n, lit(100)), op("multiply", v("a"), op("add", v("a"), lit(1))), n);
    expect(sourceOf(plain)).not.toMatch(/= L\(/);
    expectSame(make(sourceOf(plain)), plain);
  });

  it("V-054: the work of a call counts the body of its function, so a costly call is a column of the run", () => {
    const big = op("add", op("multiply", w, w), op("subtract", op("multiply", n, w), op("add", n, lit(1))));
    // The work of a call adds the work of the body. A body of nine nodes is not a column itself, but its call is, so the
    // body evaluates once for each record.
    const nine = let_({ f: fn([], op("add", op("multiply", w, w), op("subtract", op("multiply", n, w), lit(1)))) }, op("sum", each(axes.all, op("add", call("f"), n))));
    const nineSource = sourceOf(nine);
    expect(nineSource).toMatch(/const col\d+ = Q\(\((\w+)\) => \{\n\s*return fn\d+\(\1\);/);
    expectSame(make(nineSource), nine);
    expectSame(make(nineSource), nine, MANY);
    // A body that is a column of the run is one read, so its call is not a second column of the same value.
    const columned = let_({ f: fn([], big) }, op("sum", each(axes.all, op("add", call("f"), n))));
    const columnedSource = sourceOf(columned);
    expect(columnedSource).toMatch(/const col\d+ = /);
    expect(columnedSource).not.toMatch(/return fn\d+\(\w+\);/);
    expectSame(make(columnedSource), columned);
    // A light body costs less than the read of a column, so its call stays a call.
    const light = let_({ f: fn([], op("add", n, lit(1))) }, op("sum", each(axes.all, op("add", call("f"), w))));
    expect(sourceOf(light)).not.toMatch(/const col\d+ = /);
    expectSame(make(sourceOf(light)), light);
    // The work of each body counts once, so a chain of functions that each call the one before twice prints at once.
    let chain: Expr = op("sum", each(axes.all, call("f40")));
    for (let i = 40; i >= 1; i--) chain = let_({ [`f${String(i)}`]: fn([], op("add", call(`f${String(i - 1)}`), call(`f${String(i - 1)}`))) }, chain);
    expect(sourceOf(let_({ f0: fn([], n) }, chain))).toMatch(/const col\d+ = /);
    // So does a chain of bodies that read only their parameter, which are no columns.
    let params: Expr = op("sum", each(axes.all, op("add", call("g40", w), n)));
    for (let i = 40; i >= 1; i--) params = let_({ [`g${String(i)}`]: fn(["x"], op("add", call(`g${String(i - 1)}`, v("x")), call(`g${String(i - 1)}`, v("x")))) }, params);
    expect(sourceOf(let_({ g0: fn(["x"], op("multiply", v("x"), lit(2))) }, params))).toMatch(/const col\d+ = /);
  });

  it("FN.CALL: the text of a module with functions: one function for each signature, at the start of a run or at its binding", async () => {
    const e = let_(
      { k: lit(3), f: fn(["x"], op("add", v("x"), n)), g: fn(["x", "y"], op("multiply", v("x"), v("y"))), first: fn(["x"], v("x")) },
      let_(
        // h calls f, reads k of its binding and the field n at the origin. The function of the name m reads w at the key of the run, so it is at its binding.
        { h: fn(["x"], op("add", call("f", v("x")), op("add", v("k"), ref("n", [{ t: "origin" }])))), m: w },
        let_(
          { local: fn(["x"], op("subtract", v("x"), v("m"))) },
          rec({
            // The calls of f with numbers share one function, also a call with a value that can hold an error.
            a: op("add", call("f", lit(1)), call("f", n)),
            b: call("f", op("divide", lit(1), w)),
            // g reads no position, so its calls with constants are a constant of the run.
            c: call("g", lit(2), lit(5)),
            d: op("sum", each(axes.all, call("h", w))),
            e: call("local", call("first", w)),
          }),
        ),
      ),
    );
    await expectGolden("functions", e);
    const source = sourceOf(e);
    // The function of local reads m, a name of the key of the run, so it comes after the binding of m.
    expect(source.indexOf("const fn")).toBeLessThan(source.indexOf("for (let o = 0"));
    expect(source.lastIndexOf("const fn")).toBeGreaterThan(source.indexOf("for (let o = 0"));
  });

  it("LIST.VALUE AXIS.LIST: a module keeps a list as an array, with the order and the errors of the interpreter", async () => {
    const strict = lit({ strict: true });
    const sorted = op("sortBy", each(axes.all, n));
    const e = let_(
      // A list of the run evaluates once, before the keys. A list of a window depends on the key.
      { xs: sorted, near: each(axes.window(-1, 1), w), inv: each(axes.all, op("divide", lit(1), w)) },
      rec({
        // The axis list goes over the order of the list, also from its end and with a test.
        firstW: op("first", each(axes.list(v("xs")), w)),
        lastW: op("first", each(axes.reverse(axes.list(v("xs"))), w)),
        digits: fold(axes.list(v("xs")), { d: lit(0) }, { d: op("add", op("multiply", v("d"), lit(10)), n) }, v("d")),
        tested: op("count", each(axes.where(axes.list(v("xs")), op("gt", w, lit(0))), n)),
        // The list ops over a name of a list, and over sortBy and take.
        sum: op("sum", v("near")),
        mean: op("mean", v("near")),
        top: op("max", op("take", v("xs"), lit(2))),
        second: op("nth", v("xs"), lit(1)),
        texts: op("first", op("sortBy", each(axes.all, ref("s")))),
        // An error item: 1 / 0 is not finite. A lenient op skips it, and strict gives the error.
        lenient: op("count", op("sortBy", v("inv"))),
        strict: op("ifError", op("count", op("sortBy", v("inv"), strict)), lit(-1)),
        nth: op("ifError", op("nth", v("inv"), lit(0), strict), lit(-1)),
        errorItem: op("ifError", fold(axes.list(v("inv")), { c: lit(0) }, { c: op("add", v("c"), lit(1)) }, v("c")), lit(-1)),
        // A value that is not a list, a wrong count and values of two kinds give an error.
        badCount: op("ifError", op("count", op("take", v("xs"), lit(-1))), lit(-1)),
        badKind: op("ifError", op("count", op("sortBy", each(axes.all, ref("b")))), lit(-1)),
        noCount: op("ifError", op("count", op("take", v("xs"))), lit(-1)),
        noPosition: op("ifError", op("nth", v("xs")), lit(-1)),
        strictCount: op("ifError", op("count", v("inv"), strict), lit(-1)),
        // A count or a position with statements, and the axis list over fewer items than the records.
        counted: op("count", op("take", v("xs"), op("count", each(axes.window(-1, 0), n)))),
        positioned: op("nth", v("xs"), op("count", each(axes.window(0, 1), n))),
        listCount: op("count", each(axes.list(op("take", v("xs"), lit(2))), n)),
        records: op("add", op("count", each(axes.all, n)), lit(1)),
        // A list of each key, a list with error items of the axis list, a list with a safe test, and a list of others.
        // A call is opaque to the memo, so the list of each key gets its levels from its body.
        perKey: let_({ o: fn([], ref("n", [{ t: "origin" }])) }, let_({ ps: each(axes.all, op("add", n, call("o"))) }, op("sum", v("ps")))),
        withErrors: let_({ ys: each(axes.list(v("inv")), n) }, op("count", v("ys"))),
        safeTest: let_({ zs: each(axes.where(axes.all, ref("b")), n) }, op("sum", v("zs"))),
        others: let_({ os: each(axes.others, n) }, op("sum", v("os"))),
      }),
    );
    await expectGolden("list-values", e);
    // A list is a value only at a place that takes one.
    expect(reasonOf(each(axes.all, n))).toBe("a list is a value of the program");
    expect(reasonOf(let_({ xs: sorted }, v("xs")))).toBe("a list is a value of the program");
    expect(reasonOf(op("add", lit(1), op("take", sorted, lit(1))))).toBe("a list is a value of the program");
    expect(reasonOf(op("nth", let_({ a: lit(1) }, sorted), lit(0)))).toBe("a list is a value of the program");
    expect(reasonOf(op("count", op("sortBy", lit(5))))).toBe("a list op on a value that is not a list");
    expect(reasonOf(op("count", v("a")))).toBe('the kinds of the values of "count" do not decide its op');
    // A list of each key in a loop: the memo does not follow the axis list, so each key has its own list.
    const memo = let_({ xs: each(axes.window(-1, 1), n) }, op("sum", each(axes.all, op("count", each(axes.list(v("xs")), w)))));
    expectSame(make(sourceOf(memo)), memo);
    expectSame(make(sourceOf(memo)), memo, MANY);
    // A node of the memo with a list as its value keeps the list: here the sorted values of each group of b.
    const grouped = op("sum", each(axes.all, op("nth", op("sortBy", each(axes.where(axes.all, op("eq", ref("b"), ref("b", [{ t: "origin" }]))), w)), lit(0))));
    expectSame(make(sourceOf(grouped)), grouped);
    expectSame(make(sourceOf(grouped)), grouped, MANY);
    // nth over the items of an axis, and an op on the order of a list without a list.
    const nthOfItems = op("nth", each(axes.all, w), lit(1));
    expectSame(make(sourceOf(nthOfItems)), nthOfItems);
    expect(reasonOf(op("count", app("sortBy")))).toBe(undecided("sortBy"));
    expect(reasonOf(op("sum", each(axes.list(sorted), n, [offset(1)])))).toBe('the axis "list" with an address');
  });

  it("KIND.RETURNS: the grid in 2D with vectors as plain data is a standalone module", async () => {
    // The op xy of NumDomain gives a value of XYDomain (returns: "domain:XY"), so each op on the vectors has a static site.
    const xy = (a: Expr, b: Expr): Expr => op("xy", a, b);
    const e = let_(
      // The cell: the component-wise maximum of the sizes, at least 1 by 1. The module has no reduce, so a fold gives it.
      { cell: op("max", fold(axes.all, { c: xy(lit(0), lit(0)) }, { c: op("max", v("c"), xy(ref("w"), ref("h"))) }, v("c")), xy(lit(1), lit(1))) },
      let_(
        { pitch: op("add", v("cell"), xy(v("gap"), v("gap"))) },
        let_(
          { corner: op("multiply", xy(op("mod", ref("i"), v("cols")), op("floor", op("divide", ref("i"), v("cols")))), v("pitch")) },
          rec({ left: op("x", v("corner")), top: op("y", v("corner")), width: ref("w"), height: ref("h") }),
        ),
      ),
    );
    const options: ModuleOptions = { domains: [NumDomain, XYDomain, BoolDomain], schema: { fields: { w: "number", h: "number", i: "number" }, vars: { gap: "number", cols: "number" } } };
    const source = sourceOf(e, options);
    await expect(source).toMatchFileSnapshot("./__golden__/module-grid-xy.js");
    const m = make(source);
    expectSame(m, e, [{ w: 10, h: 20, i: 0 }, { w: 30, h: 5, i: 1 }, { w: 7, h: 7, i: 2 }], { gap: 12, cols: 2 }, options);
    const items = fc.array(fc.record({ w: fc.integer({ min: 0, max: 400 }), h: fc.double({ min: 0, max: 400, noNaN: true }) }), { maxLength: 12 });
    fc.assert(
      fc.property(items, fc.integer({ min: 1, max: 5 }), fc.integer({ min: 0, max: 40 }), (rs, cols, gap) => {
        expectSame(m, e, rs.map((r, i) => ({ ...r, i })), { gap, cols }, options);
      }),
    );
  });

  it("NAV.COMPUTED: the moves with a position or a key from an expression", async () => {
    const safe = (x: Expr): Expr => op("ifError", x, lit(-1));
    const e = rec({
      position: safe(ref("w", [index(n)])),
      key: safe(ref("w", [key(ref("s"))])),
      origin: safe(ref("w", [index(op("add", K, lit(1)))])),
      run: safe(ref("w", [index(v("a"))])),
      list: safe(op("sum", each(axes.window(0, 1), w, [index(n)]))),
      body: op("sum", each(axes.all, safe(ref("w", [index(n)])))),
    });
    await expectGolden("computed", e);
  });

  it("the nodes of the memo: a group, a prefix, a scan, one key, two keys and no key", async () => {
    const e = rec({
      group: where(op("eq", op("mod", n, lit(2)), column), w, "max"),
      again: op("multiply", where(op("eq", op("mod", n, lit(2)), column), w, "max"), lit(2)),
      shared: where(op("eq", op("mod", n, lit(2)), op("mod", KW, lit(2))), w, "max"),
      prefix: where(op("lt", n, K), w, "sum"),
      keyFirst: where(op("gt", K, n), w),
      scan: where(op("gt", n, K), w),
      body: op("sum", each(axes.all, op("multiply", w, K))),
      two: op("sum", each(axes.where(axes.all, op("lt", n, K)), op("multiply", w, KW))),
      nested: where(op("lt", w, op("add", K, n)), w),
      twice: op("count", each(axes.where(axes.where(axes.all, op("lt", n, K)), op("gt", w, K)), w)),
      constant: op("sum", each(axes.all, op("add", w, v("a")))),
      notList: op("max", where(op("eq", n, K), w, "sum"), lit(1)),
      first: op("ifError", op("add", where(op("eq", n, K), w, "first"), lit(1)), lit(0)),
      anyNot: op("not", where(op("eq", n, K), ref("b"), "any")),
      text: where(op("eq", ref("s"), ref("s", [{ t: "origin" }])), w),
      contains: where(op("contains", ref("s"), ref("s", [{ t: "origin" }])), w),
    });
    await expectGolden("memo", e);
  });

  it("the nodes that keep their items: strict, the kind of the items and the tests before and after the key", async () => {
    const before = op("gt", op("ifError", op("divide", lit(1), w), lit(0)), lit(0));
    const all = rec({
      strict: op("ifError", op("sum", each(axes.where(axes.where(axes.where(axes.all, before), op("eq", op("mod", n, lit(2)), column)), op("lt", n, lit(2))), op("divide", lit(1), n)), lit({ strict: true })), lit(0)),
      ok: op("ifError", where(op("lt", n, K), op("if", ref("b"), w, ref("s")), "max"), lit(0)),
      pre: op("count", each(axes.where(axes.where(axes.all, ref("b")), op("eq", n, K)), w)),
      and: op("count", each(axes.where(axes.all, op("and", ref("b"), op("gt", w, lit(0)), op("eq", n, K))), w)),
      mean: op("ifError", where(op("eq", n, K), w, "mean"), lit(0)),
      min: op("ifError", where(op("lte", n, K), w, "min"), lit(0)),
      all: where(op("gte", K, n), ref("b"), "all"),
      none: where(op("eq", n, K), ref("b"), "none"),
    });
    await expectGolden("items-all", all);
    // Each part of the helper S comes only with the nodes that need it.
    const strict = op("ifError", op("sum", each(axes.where(axes.all, op("eq", n, K)), op("divide", lit(1), w)), lit({ strict: true })), lit(0));
    await expectGolden("items-strict", strict);
    const ok = op("ifError", where(op("eq", n, K), op("if", ref("b"), w, ref("s")), "sum"), lit(0));
    await expectGolden("items-ok", ok);
  });

  it("the inline forms of the ops, and the ops that the module calls", async () => {
    const forms = domainOf("Forms", "number", {
      tight: ["(a,b)=>a+b", "number"],
      loose: ["(  a  ,  b  )  =>  a  -  b", "number"],
      bare: ["a => -a", "number"],
      square: ["(a) => a * a", "number"],
      finite: ["(a) => Number.isFinite(a)", "boolean"],
      decimal: ["(a) => a * 2.5 + .5", "number"],
      // Loose tests and a group after a parameter are inline forms too.
      looseEq: ["(a, b) => a == b", "boolean"],
      looseNe: ["(a, b) => a != b", "boolean"],
      grouped: ["(a) => a + (1)", "number"],
      ...Object.fromEntries(["abs", "ceil", "floor", "round", "trunc", "sign", "sqrt", "cbrt", "exp", "log", "log10", "log2", "sin", "cos", "tan"].map((f) => [f, [`(a) => Math.${f}(a)`, "number"] as const])),
      ...Object.fromEntries(["min", "max", "pow", "hypot", "atan2"].map((f) => [f, [`(a) => Math.${f}(a, 2)`, "number"] as const])),
      // The module calls these ops.
      quoted: ['(a) => "a" + a', "string"],
      assign: ["(a) => (a = 5)", "number"],
      increment: ["(a) => a++", "number"],
      call: ["(a) => !a(1)", "boolean"],
      group: ["(a) => !(a)(1)", "boolean"],
      spacedCall: ["(a) => !a (1)", "boolean"],
      spacedGroup: ["(a) => !(a) (1)", "boolean"],
      unused: ["(a, b) => a", "number"],
      exponent: ["(a) => a * 1e3", "number"],
      member: ["(a) => a.toFixed(1)", "string"],
      fn: ["function (a) { return a + 1; }", "number"],
      none: ["() => 1", "number"],
      arrow: ["(a) => (b) => a", "number"],
    });
    const options: ModuleOptions = { domains: [forms, NumDomain, BoolDomain], schema: SCHEMA };
    const safe = (x: Expr): Expr => op("ifError", x, lit(0));
    const e = rec({
      tight: op("tight", n, w),
      loose: op("loose", n, w),
      bare: op("bare", n),
      square: rec({ plain: op("square", v("a")), read: op("square", n) }),
      finite: op("finite", n),
      decimal: op("decimal", n),
      math: rec(Object.fromEntries(["abs", "ceil", "floor", "round", "trunc", "sign", "sqrt", "cbrt", "exp", "log", "log10", "log2", "sin", "cos", "tan", "min", "max", "pow", "hypot", "atan2"].map((f) => [f, safe(op(f, w))]))),
      quoted: op("quoted", n),
      assign: rec({ value: op("assign", n), n }),
      increment: rec({ value: op("increment", n), n }),
      call: let_({ x: op("call", n) }, lit(1)),
      group: let_({ x: op("group", n) }, lit(1)),
      spacedCall: let_({ x: op("spacedCall", n) }, lit(1)),
      spacedGroup: let_({ x: op("spacedGroup", n) }, lit(1)),
      looseEq: op("looseEq", n, w),
      looseNe: op("looseNe", n, w),
      grouped: op("grouped", n),
      unused: safe(op("unused", n, op("divide", lit(1), w))),
      exponent: op("exponent", n),
      member: op("member", n),
      fn: op("fn", n),
      none: op("none", n),
      // A call with more arguments than the form has parameters, and a call with fewer, use the function.
      more: op("tight", n, w, lit(1)),
      fewer: safe(op("tight", n)),
    });
    await expectGolden("inline", e, options);
  });

  it("the checks of the results: a domain with valid, and a valid that is only the check of a finite number", async () => {
    const positive = domainOf("Positive", "number", {}, "(x) => Number.isFinite(x) && typeof x === 'number' && x > -100");
    const e = rec({ sum: op("ifError", op("sum", each(axes.all, op("multiply", w, lit(40)))), lit(0)), x: op("ifError", op("multiply", n, lit(60)), lit(0)) });
    await expectGolden("valid", e, { domains: [positive, NumDomain, BoolDomain], schema: SCHEMA });
    for (const finite of ["x=>Number.isFinite(x)", "( x )  =>  Number.isFinite( x )"]) expect(sourceOf(e, { domains: [domainOf("Finite", "number", {}, finite), NumDomain], schema: SCHEMA })).not.toContain("v_0");
    for (const other of ["(x) => Number.isFinite(x + 1)", "(x) => Number.isFinite(x) || x > 0", "(x) => Number.isFinite(1)"]) {
      const options: ModuleOptions = { domains: [domainOf("Other", "number", {}, other), NumDomain], schema: SCHEMA };
      expect(sourceOf(e, options)).toContain("v_0");
      expectSame(make(sourceOf(e, options)), e, MANY, VARS, options);
    }
    // A text is not a number, so the check of a text keeps the check of its domain.
    const text = rec({ s: op("ifError", op("upper", ref("s")), lit("!")) });
    const textOptions: ModuleOptions = { domains: [domainOf("Finite", "string", {}, "(x) => Number.isFinite(x)"), TextDomain], schema: SCHEMA };
    expect(sourceOf(text, textOptions)).toContain("v_0");
    expectSame(make(sourceOf(text, textOptions)), text, MANY, VARS, textOptions);
    // A check of a boolean: a node of the memo with a test checks it, so the node does not keep its items.
    const strictBool = domainOf("True", "boolean", {}, "(x) => x");
    const memo = rec({ count: where(op("eq", n, K), w), not: op("ifError", op("not", ref("b")), lit(true)) });
    await expectGolden("valid-boolean", memo, { domains: [NumDomain, strictBool, BoolDomain], schema: SCHEMA });
    // A check that reads a name outside itself gives a reason, also when only the values of its kind tell it.
    const limit = defineDomain({ name: "Limit", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: {}, valid: fnOf("(x) => (typeof x === 'number' ? x < OUTSIDE : true)", 100) as (x: unknown) => boolean });
    expect(reasonOf(e, { domains: [limit, NumDomain], schema: SCHEMA })).toBe('the check "valid" of the domain Limit reads a name outside itself, so a module cannot copy it');
  });
});

/** A program over numbers, texts and booleans from the whole part of the language that a module has. */
const program = fc.letrec<{ num: Expr; bool: Expr }>((tie) => ({
  num: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    fc.integer({ min: -3, max: 3 }).map((x) => lit(x)),
    fc.constantFrom(n, w, v("a"), ref("n", [{ t: "origin" }]), ref("w", [offset(-1)]), ref("n", [offset(1)]), ref("w", [index(n)]), ref("n", [index(v("a"))]), ref("w", [offset(1), key("0")]), ref("n", [offset(-1), { t: "origin" }])),
    tie("num").map((x) => ref("w", [index(x)])),
    fc.tuple(fc.constantFrom("add", "subtract", "multiply", "divide", "max", "min", "mod"), tie("num"), tie("num")).map(([o, a, b]) => op(o, a, b)),
    fc.tuple(tie("bool"), tie("num"), tie("num")).map(([c, a, b]) => op("if", c, a, b)),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => op("ifError", a, b)),
    fc
      .tuple(fc.constantFrom("sum", "count", "max", "mean"), fc.constantFrom(axes.all, axes.others, axes.window(-1, 0), axes.reverse(axes.all), axes.reverse(axes.window(-1, 0))), tie("num"), fc.option(tie("bool"), { nil: undefined }), fc.boolean(), fc.constantFrom(undefined, [offset(1)], [index(1)], [{ t: "origin" as const }], [index(n)], [index(v("a"))], [offset(1), index(0)]))
      .map(([o, a, body, test, strict, at]) => op(o, each(test === undefined ? a : axes.where(a, test), body, at), ...(strict ? [lit({ strict: true })] : []))),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ x: a }, op("add", v("x"), b))),
    fc.constant(op("length", ref("s"))),
    // The loops: a name s with a first value and a step, as an iteration or as a fold over an axis.
    fc.tuple(fc.integer({ min: 0, max: 3 }), tie("num"), tie("num")).map(([k, init, step]) => iterate(k, { s: init }, { s: op("add", v("s"), step) }, v("s"))),
    fc
      .tuple(fc.constantFrom(axes.all, axes.others, axes.window(-1, 0), axes.reverse(axes.all), axes.reverse(axes.window(-1, 0))), tie("num"), tie("num"), fc.constantFrom(undefined, [offset(1)]))
      // The step depends on the order of the targets, so a loop in the wrong order gives another value.
      .map(([a, init, step, at]) => fold(a, { s: init }, { s: op("subtract", step, v("s")) }, v("s"), at)),
  ),
  bool: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    fc.constantFrom(ref("b"), lit(true), op("eq", ref("s"), v("t"))),
    fc.tuple(fc.constantFrom("gt", "lt", "eq"), tie("num"), tie("num")).map(([o, a, b]) => op(o, a, b)),
    fc.tuple(fc.constantFrom("and", "or"), tie("bool"), tie("bool")).map(([o, a, b]) => op(o, a, b)),
    tie("bool").map((x) => op("not", x)),
    fc.tuple(fc.constantFrom("any", "all", "none"), tie("bool")).map(([o, body]) => op(o, each(axes.all, body))),
  ),
}));

const records = fc.array(
  fc.record({
    n: fc.integer({ min: -4, max: 4 }),
    w: fc.oneof(fc.integer({ min: -3, max: 3 }), fc.double({ noNaN: true, min: -10, max: 10 }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e308)),
    s: fc.constantFrom("", "x", "abc"),
    b: fc.boolean(),
  }),
  { maxLength: 6 },
);

const S_ORIGIN = ref("s", [{ t: "origin" }]);

/**
 * A list op whose test reads a key of the origin: a node of the memo that keeps its items. The value T, the key, the
 * other tests and the body can fail, and the list op can be strict.
 */
const keyed: fc.Arbitrary<Expr> = fc
  .record({
    op: fc.constantFrom("count", "sum", "mean", "min", "max", "any", "all", "none", "first"),
    test: fc.oneof(
      fc.record({
        cmp: fc.constantFrom("eq", "lt", "lte", "gt", "gte"),
        t: fc.constantFrom<Expr>(n, w, op("mod", n, lit(2)), op("divide", lit(1), w)),
        key: fc.constantFrom<Expr>(K, column, op("divide", lit(1), KW)),
      }),
      // A test of texts, a test whose op is not a test of the key, a test of the wrong kind, and a test that is not a
      // boolean.
      fc.record({ cmp: fc.constantFrom("eq", "contains"), t: fc.constant<Expr>(ref("s")), key: fc.constant<Expr>(S_ORIGIN) }),
      fc.record({ cmp: fc.constant("eq"), t: fc.constant<Expr>(ref("s")), key: fc.constant<Expr>(K) }),
      fc.record({ cmp: fc.constant("add"), t: fc.constant<Expr>(n), key: fc.constant<Expr>(K) }),
    ),
    keyFirst: fc.boolean(),
    before: fc.array(fc.constantFrom<Expr>(ref("b"), op("gt", w, lit(0)), op("gt", op("divide", lit(1), w), lit(0)), op("gt", op("ifError", op("divide", lit(1), w), lit(0)), lit(0)), op("and", ref("b"), op("gt", n, lit(0)))), { maxLength: 2 }),
    // The test of the key and the tests before it in one test and.
    and: fc.boolean(),
    after: fc.option(fc.constantFrom<Expr>(ref("b"), op("lt", n, lit(2)), op("gt", op("divide", lit(1), n), lit(0))), { nil: undefined }),
    numBody: fc.constantFrom<Expr>(w, n, op("divide", lit(1), n), op("add", w, KW)),
    boolBody: fc.constantFrom<Expr>(ref("b"), op("gt", w, lit(1)), op("gt", op("divide", lit(1), w), lit(0)), w),
    anyBody: fc.constantFrom<Expr>(ref("s"), ref("b"), w),
    strict: fc.boolean(),
  })
  .map((r) => {
    const keyTest = r.keyFirst ? op(r.test.cmp, r.test.key, r.test.t) : op(r.test.cmp, r.test.t, r.test.key);
    const front = r.and && r.before.length > 0 ? [op("and", ...r.before, keyTest)] : [...r.before, keyTest];
    const tests = [...front, ...(r.after === undefined ? [] : [r.after])];
    const axis = tests.reduce<Axis>((a, t) => axes.where(a, t), axes.all);
    const body = ["any", "all", "none"].includes(r.op) ? r.boolBody : ["count", "first"].includes(r.op) ? r.anyBody : r.numBody;
    return op(r.op, each(axis, body), ...(r.strict ? [lit({ strict: true })] : []));
  });

describe("COMPILE.MODULE: the text of the modules of a fixed set of random programs", () => {
  it("each module gives the value of the interpreter, and the golden file has the hash of the text of each module", async () => {
    // A change of the printer changes the text of some of these modules. Thus the file finds a change of a decision that
    // keeps the values, for example a constant that a module computes twice, or a column of the run that it does not make.
    const programs = fc.sample(fc.oneof(program.num, program.bool, keyed, fc.tuple(keyed, keyed).map(([a, b]) => rec({ a, b }))), { seed: 20261016, numRuns: 60 });
    const lines = programs.map((e, i) => {
      const source = sourceOf(e);
      expectSame(make(source), e, MANY);
      return `${String(i)} ${String(source.length)} ${createHash("sha256").update(source).digest("hex").slice(0, 16)}`;
    });
    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot("./__golden__/module-corpus.txt");
  });
});

describe("COMPILE.MODULE: random programs", () => {
  it("P17 COMPILE.MODULE: a node of the memo that keeps its items gives the value of the interpreter at each key", () => {
    let cached = 0;
    fc.assert(
      fc.property(keyed, records, (e, rs) => {
        const source = sourceOf(e);
        if (source.includes("= S(n, ")) cached++;
        expectSame(make(source), e, rs, VARS);
      }),
    );
    // Most of these programs have a node that keeps its items.
    expect(cached).toBeGreaterThan(30);
  });

  it("P17 COMPILE.MODULE: two nodes that keep their items share the helper, with the parts of each node", () => {
    fc.assert(
      fc.property(keyed, keyed, records, (a, b, rs) => {
        const e = rec({ a, b });
        expectSame(make(sourceOf(e)), e, rs, VARS);
      }),
    );
  });

  it("P17 COMPILE.MODULE LIST.VALUE: a module with lists gives the value of the interpreter at each key", () => {
    // A list from an axis, sorted or not, and the first items of a list. Some lists have error items, texts or NaN.
    const base = fc.constantFrom(each(axes.all, n), each(axes.all, w), each(axes.all, ref("s")), each(axes.where(axes.all, ref("b")), w), each(axes.window(-1, 1), n), each(axes.all, op("divide", lit(1), w)), each(axes.reverse(axes.all), n));
    const list: fc.Arbitrary<Expr> = fc.oneof(
      base,
      fc.tuple(base, fc.boolean()).map(([l, strict]) => op("sortBy", l, ...(strict ? [lit({ strict: true })] : []))),
      fc.tuple(base, fc.integer({ min: -1, max: 3 }), fc.boolean()).map(([l, k, sort]) => op("take", sort ? op("sortBy", l) : l, lit(k))),
    );
    const uses: readonly ((l: Expr, i: number, opts: readonly Expr[]) => Expr)[] = [
      ...["count", "sum", "first", "max", "mean"].map((o) => (l: Expr, _i: number, opts: readonly Expr[]) => op(o, l, ...opts)),
      (l, i, opts) => let_({ xs: l }, op("nth", v("xs"), lit(i), ...opts)),
      (l, _i, opts) => let_({ xs: l }, op("sum", each(axes.where(axes.list(v("xs")), op("gt", w, lit(-1))), w), ...opts)),
      (l) => let_({ xs: l }, fold(axes.list(v("xs")), { d: lit(0) }, { d: op("subtract", n, v("d")) }, v("d"))),
      (l, _i, opts) => let_({ xs: l }, op("first", each(axes.reverse(axes.list(v("xs"))), op("add", n, w)), ...opts)),
    ];
    const lists = fc.tuple(list, fc.constantFrom(...uses), fc.integer({ min: -1, max: 3 }), fc.boolean()).map(([l, use, i, strict]) => use(l, i, strict ? [lit({ strict: true })] : []));
    fc.assert(
      fc.property(lists, records, (e, rs) => {
        expectSame(make(sourceOf(e)), e, rs, VARS);
      }),
    );
  });

  it("P17 COMPILE.MODULE FN.CALL: a module with functions gives the value of the interpreter at each key", () => {
    // A function f with a body that reads the record at the call, and a function g that calls f. The forms call them at
    // the node, in a list op, in the step of a fold, under a name a of the call, and under a name of a loop that hides f.
    const forms: readonly ((arg: Expr, other: Expr) => Expr)[] = [
      (arg) => call("f", arg),
      (arg) => op("sum", each(axes.all, call("f", arg))),
      (arg) => fold(axes.reverse(axes.all), { s: arg }, { s: call("f", v("s")) }, v("s")),
      (_arg, other) => let_({ a: other }, call("g", v("a"))),
      (arg, other) => iterate(2, { f: arg }, { f: op("add", v("f"), other) }, v("f")),
      (arg) => call("g", call("f", arg)),
    ];
    const withFns = fc
      .tuple(program.num, program.num, program.num, fc.constantFrom("add", "subtract", "multiply", "max"), fc.constantFrom(...forms))
      .map(([body, arg, other, o, form]) => let_({ f: fn(["x"], op(o, v("x"), body)), k: other }, let_({ g: fn(["y"], call("f", op("add", v("y"), v("k")))) }, form(arg, other))));
    fc.assert(
      fc.property(withFns, records, fc.integer({ min: -3, max: 3 }), (e, rs, a) => {
        expectSame(make(sourceOf(e)), e, rs, { a, t: "x" });
      }),
    );
  });

  it("P17 COMPILE.MODULE: a module gives the value of the interpreter at each key, or VEX_ERROR", () => {
    fc.assert(
      fc.property(fc.oneof(program.num, program.bool), records, fc.integer({ min: -3, max: 3 }), fc.constantFrom("x", "y"), (e, rs, a, t) => {
        expectSame(make(sourceOf(e)), e, rs, { a, t });
      }),
    );
  });
});

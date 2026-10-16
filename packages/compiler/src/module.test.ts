/**
 * Standalone modules (docs/COMPILER.md §4.4). A module gives the value of the interpreter at each key, `VEX_ERROR` for
 * an error of Vex, and a `VexContractError` for an input against the schema (COMPILE.MODULE).
 */
import { app, axes, defineDomain, each, evaluate, ext, fold, index, iterate, key, let_, lit, offset, rec, ref, space, v, type AnyDomain, type Axis, type Expr, type PrimitiveKind } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
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

  it("COMPILE.MODULE V-052: a move before a fixed key or the origin can fail, so the module evaluates it", () => {
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
  });

  it("KIND.DOMAIN: a value of a domain without a primitive type has the kind of its domain, so a kernel is in a module", () => {
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
      ...Object.fromEntries(["abs", "ceil", "floor", "round", "trunc", "sign", "sqrt", "cbrt", "exp", "log", "log10", "log2", "sin", "cos", "tan"].map((f) => [f, [`(a) => Math.${f}(a)`, "number"] as const])),
      ...Object.fromEntries(["min", "max", "pow", "hypot", "atan2"].map((f) => [f, [`(a) => Math.${f}(a, 2)`, "number"] as const])),
      // The module calls these ops.
      quoted: ['(a) => "a" + a', "string"],
      assign: ["(a) => (a = 5)", "number"],
      increment: ["(a) => a++", "number"],
      call: ["(a) => !a(1)", "boolean"],
      group: ["(a) => !(a)(1)", "boolean"],
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
      unused: safe(op("unused", n, op("divide", lit(1), w))),
      exponent: op("exponent", n),
      member: op("member", n),
      fn: op("fn", n),
      none: op("none", n),
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
      .tuple(fc.constantFrom("sum", "count", "max", "mean"), fc.constantFrom(axes.all, axes.others, axes.window(-1, 0)), tie("num"), fc.option(tie("bool"), { nil: undefined }), fc.boolean(), fc.constantFrom(undefined, [offset(1)], [index(1)], [{ t: "origin" as const }], [index(n)], [index(v("a"))], [offset(1), index(0)]))
      .map(([o, a, body, test, strict, at]) => op(o, each(test === undefined ? a : axes.where(a, test), body, at), ...(strict ? [lit({ strict: true })] : []))),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ x: a }, op("add", v("x"), b))),
    fc.constant(op("length", ref("s"))),
    // The loops: a name s with a first value and a step, as an iteration or as a fold over an axis.
    fc.tuple(fc.integer({ min: 0, max: 3 }), tie("num"), tie("num")).map(([k, init, step]) => iterate(k, { s: init }, { s: op("add", v("s"), step) }, v("s"))),
    fc
      .tuple(fc.constantFrom(axes.all, axes.others, axes.window(-1, 0)), tie("num"), tie("num"), fc.constantFrom(undefined, [offset(1)]))
      .map(([a, init, step, at]) => fold(a, { s: init }, { s: op("max", v("s"), step) }, v("s"), at)),
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

  it("P17 COMPILE.MODULE: a module gives the value of the interpreter at each key, or VEX_ERROR", () => {
    fc.assert(
      fc.property(fc.oneof(program.num, program.bool), records, fc.integer({ min: -3, max: 3 }), fc.constantFrom("x", "y"), (e, rs, a, t) => {
        expectSame(make(sourceOf(e)), e, rs, { a, t });
      }),
    );
  });
});

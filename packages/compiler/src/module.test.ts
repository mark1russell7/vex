/**
 * Standalone modules (docs/COMPILER.md §4.4). A module gives the value of the interpreter at each key, `VEX_ERROR` for
 * an error of Vex, and a `VexContractError` for an input against the schema (COMPILE.MODULE).
 */
import { app, axes, defineDomain, each, evaluate, ext, index, key, let_, lit, offset, rec, ref, space, v, type Axis, type Expr } from "@mark1russell7/vex";
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

/** This function compares the values of a module with the interpreter at each key. */
function expectSame(m: Loaded, e: Expr, records: readonly unknown[] = RECORDS, vars: Readonly<Record<string, unknown>> = VARS, options: ModuleOptions = OPTIONS): void {
  const got = m.run(records, vars);
  const s = space.array(records);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars, ...(options.domains === undefined ? {} : { domains: options.domains }) });
    return r.ok ? r.value : m.VEX_ERROR;
  });
  expect(got).toStrictEqual(expected);
}

const n = ref("n");
const w = ref("w");
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);

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
      op("if", ref("b"), n, ref("s")),
      op("divide", lit(1), lit(-0)),
    ];
    for (const e of cases) expectSame(await load(sourceOf(e)), e);
  });

  it("needs no domains and no schema for a program of literals", () => {
    const m = make(sourceOf(rec({ a: lit(1), b: op("if", lit(true), lit("x"), lit(false)) }), { schema: {} }));
    expect(m.run([{}, {}], {})).toEqual([{ a: 1, b: "x" }, { a: 1, b: "x" }]);
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
      bad: at([key("01")]),
      other: at([{ t: "other" }]),
      parent: at([{ t: "parent" }]),
      sum: op("sum", each(axes.others, n, [offset(1)])),
    });
    const m = make(sourceOf(e));
    expectSame(m, e);
    // A space of two keys has the move other.
    expectSame(m, e, RECORDS.slice(0, 2));
  });

  it("evaluates a node of the memo once for each value of its keys, and nodes with the same expression share a function", () => {
    const column = op("mod", ref("n", [{ t: "origin" }]), lit(2));
    const group = (): Expr => op("max", each(axes.where(axes.all, op("eq", op("mod", n, lit(2)), column)), w));
    const e = op("add", group(), op("multiply", group(), lit(2)));
    const source = sourceOf(e);
    // The two groups share one function. The nodes above them have no loop of their own, so they have no function.
    expect(source.match(/= (?:M1?|S)\(/g)).toHaveLength(1);
    expectSame(make(source), e);
    const records = Array.from({ length: 40 }, (_v, i) => ({ n: i, w: i % 7, s: "", b: true }));
    expectSame(make(source), e, records);
    // Two groups that differ only by 0 and -0 have two functions: -0 + 0 is 0, but -0 + -0 is -0.
    const signed = (zero: number): Expr => op("max", each(axes.where(axes.all, op("eq", op("mod", n, lit(2)), column)), op("add", w, lit(zero))));
    const zeros = rec({ plus: signed(0), minus: signed(-0) });
    expect(sourceOf(zeros).match(/= (?:M1?|S)\(/g)).toHaveLength(2);
    expectSame(make(sourceOf(zeros)), zeros, [{ n: 0, w: -0, s: "", b: true }, { n: 1, w: -0, s: "", b: true }]);
  });

  it("gives a reason for a program that cannot be a module", () => {
    const reasons = (e: Expr, options: ModuleOptions = OPTIONS): string => {
      const m = emitModule(e, options);
      return m.ok ? "" : m.reason;
    };
    expect(reasons(ref("missing"))).toContain("not in the schema");
    expect(reasons(ref("n.x"))).toContain("not in the schema");
    expect(reasons(v("free"))).toContain("not in the schema");
    expect(reasons(each(axes.all, n))).toContain("a list");
    expect(reasons(ext("note", null))).toContain("the extension");
    expect(reasons(op("add", n, lit(null)))).toContain("do not decide");
    expect(reasons(op("count", each(axes.children, n)))).toContain('the axis "children"');
    expect(reasons(op("count", each(axes.all, n), lit("x")))).toContain("options");
    expect(reasons(op("count", each(axes.all, n), lit({ strict: true }), lit(1)))).toContain("more than one option");
    expect(reasons(lit(Number.NaN))).toContain("not finite");
    expect(reasons(lit({ x: 1 }))).toContain("a literal");
    expect(reasons(op("if", ref("b"), n))).toContain("three arguments");
    expect(reasons(op("ifError", n))).toContain("two arguments");
    expect(reasons(op("and"))).toContain("without arguments");
    expect(reasons(op("date", n, lit(1), lit(1)))).toContain("does not declare");
    expect(reasons(op("add", n, lit(1)), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toContain("do not decide");
    expect(reasons(op("sum", each(axes.all, n)), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toContain("comes before");
    // The op concat of TextDomain calls a function of its module, so its copy would throw.
    expect(reasons(op("concat", ref("s"), v("t")))).toContain("reads a name outside itself");
    const native = defineDomain({ name: "Native", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { hypot: { fn: Math.hypot, returns: "number" } } });
    expect(reasons(op("hypot", n, w), { domains: [native], schema: SCHEMA })).toContain("no source");
    expect(reasons(n, { ...OPTIONS, name: "not a name" })).toContain("not a JavaScript name");
    expect(reasons(ref([]))).toContain("not in the schema");
    expect(reasons(op("count", each(axes.all, n), v("a")))).toContain("options");
    // An arrow function with super has a source, but the source does not compile alone.
    const withSuper = ({ make(): (a: number) => number {
      return (a: number): number => a + Number(super.valueOf === undefined);
    } }).make();
    const odd = defineDomain({ name: "Odd", is: (u: unknown): u is number => typeof u === "number", primitive: "number", ops: { odd: { fn: withSuper, returns: "number" } } });
    expect(reasons(op("odd", n), { domains: [odd], schema: SCHEMA })).toContain("no source");
  });
});

/** A program over numbers, texts and booleans from the whole part of the language that a module has. */
const program = fc.letrec<{ num: Expr; bool: Expr }>((tie) => ({
  num: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    fc.integer({ min: -3, max: 3 }).map((x) => lit(x)),
    fc.constantFrom(n, w, v("a"), ref("n", [{ t: "origin" }]), ref("w", [offset(-1)]), ref("n", [offset(1)])),
    fc.tuple(fc.constantFrom("add", "subtract", "multiply", "divide", "max", "min", "mod"), tie("num"), tie("num")).map(([o, a, b]) => op(o, a, b)),
    fc.tuple(tie("bool"), tie("num"), tie("num")).map(([c, a, b]) => op("if", c, a, b)),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => op("ifError", a, b)),
    fc.tuple(fc.constantFrom("sum", "count", "max", "mean"), fc.constantFrom(axes.all, axes.others, axes.window(-1, 0)), tie("num"), fc.option(tie("bool"), { nil: undefined }), fc.boolean()).map(([o, a, body, test, strict]) =>
      op(o, each(test === undefined ? a : axes.where(a, test), body), ...(strict ? [lit({ strict: true })] : [])),
    ),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ x: a }, op("add", v("x"), b))),
    fc.constant(op("length", ref("s"))),
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
  fc.record({ n: fc.integer({ min: -4, max: 4 }), w: fc.oneof(fc.integer({ min: -3, max: 3 }), fc.double({ noNaN: true, min: -10, max: 10 }), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)), s: fc.constantFrom("", "x", "abc"), b: fc.boolean() }),
  { maxLength: 6 },
);

/**
 * A list op whose test reads a key of the origin: a node of the memo that keeps its items. The value T, the key, the
 * other tests and the body can fail, and the list op can be strict.
 */
const keyed: fc.Arbitrary<Expr> = fc
  .record({
    op: fc.constantFrom("count", "sum", "mean", "min", "max", "any", "all", "none", "first"),
    cmp: fc.constantFrom("eq", "lt", "lte", "gt", "gte"),
    keyFirst: fc.boolean(),
    t: fc.constantFrom<Expr>(n, w, op("mod", n, lit(2)), op("divide", lit(1), w)),
    key: fc.constantFrom<Expr>(ref("n", [{ t: "origin" }]), op("mod", ref("n", [{ t: "origin" }]), lit(2)), op("divide", lit(1), ref("w", [{ t: "origin" }]))),
    before: fc.option(fc.constantFrom<Expr>(ref("b"), op("gt", w, lit(0)), op("gt", op("divide", lit(1), w), lit(0))), { nil: undefined }),
    after: fc.option(fc.constantFrom<Expr>(ref("b"), op("lt", n, lit(2)), op("gt", op("divide", lit(1), n), lit(0))), { nil: undefined }),
    numBody: fc.constantFrom<Expr>(w, n, op("divide", lit(1), n), op("add", w, ref("w", [{ t: "origin" }]))),
    boolBody: fc.constantFrom<Expr>(ref("b"), op("gt", w, lit(1)), op("gt", op("divide", lit(1), w), lit(0)), w),
    strict: fc.boolean(),
  })
  .map((r) => {
    const keyTest = r.keyFirst ? op(r.cmp, r.key, r.t) : op(r.cmp, r.t, r.key);
    const tests = [...(r.before === undefined ? [] : [r.before]), keyTest, ...(r.after === undefined ? [] : [r.after])];
    const axis = tests.reduce<Axis>((a, t) => axes.where(a, t), axes.all);
    const body = ["any", "all", "none"].includes(r.op) ? r.boolBody : r.numBody;
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
    expect(cached).toBeGreaterThan(50);
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

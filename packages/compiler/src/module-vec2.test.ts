/**
 * A program over `Vec2Domain` in each tier (COMPILE.MODULE.FORM). A module holds a vector as plain data, the data of
 * `toJSON`, because it has no import. Each test compares tier 2 and a module with the interpreter (P17). The comparison of
 * a module reads each `Vec2` of the interpreter as its plain data.
 */
import { app, axes, defineDomain, each, evaluate, fold, iterate, let_, lit, rec, ref, space, v, vexList, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { Angle, AngleDomain, BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { factsOf, type Schema } from "./facts.ts";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new (m: string) => Error;
}

const SCHEMA: Schema = { fields: { p: "domain:Vec2", q: "domain:Vec2", n: "number", s: "string" }, vars: { k: "number" } };
const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, Vec2Domain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const VARS = { k: 2 };
/** A module of these options reads only the field `p` of a record. */
const ONLY_P: ModuleOptions = { domains: DOMAINS, schema: { fields: { p: "domain:Vec2" } } };

const RECORDS = [
  { p: new Vec2(3, 4), q: new Vec2(1, 2), n: 2, s: "a" },
  { p: new Vec2(-1.5, 0), q: new Vec2(0, -3), n: 0.5, s: "b" },
  { p: new Vec2(0, 0), q: new Vec2(5, 5), n: 0, s: "" },
  { p: new Vec2(-0, 2), q: new Vec2(2, -0), n: -3, s: "c" },
  { p: new Vec2(Number.MIN_VALUE, 0), q: new Vec2(1e300, 1e300), n: 1e300, s: "d" },
];
/** These records have components that are not finite. An op that reads one gives an error in each tier. */
const NOT_FINITE = [
  { p: new Vec2(Number.NaN, 1), q: new Vec2(1, 2), n: 1, s: "x" },
  { p: new Vec2(1, Number.POSITIVE_INFINITY), q: new Vec2(1, 2), n: 1, s: "y" },
];

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const p = ref("p");
const q = ref("q");
const n = ref("n");
const s = ref("s");
const vec = (x: number, y: number): Expr => lit(new Vec2(x, y));

/** This function gives the value of the interpreter as the plain data of a module: a `Vec2` is its `toJSON`. */
function plainOf(x: unknown): unknown {
  if (x instanceof Vec2) return x.toJSON();
  if (Array.isArray(x)) return x.map(plainOf);
  return typeof x === "object" && x !== null ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, plainOf(y)])) : x;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
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
 * This function compares tier 2 and a module with the interpreter at each key (P17), and gives the module results. The
 * module takes the vectors as `Vec2` values and as plain data, and it gives the same results.
 */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS, options: ModuleOptions = OPTIONS): readonly unknown[] {
  const { domains = [] } = options;
  const rows = space.array(records);
  const results = rows.keys.map((origin) => evaluate(e, { space: rows, origin, vars: VARS, domains }));
  const program = tiered(e, { domains, schema: options.schema });
  expect(rows.keys.map((origin) => fromCore(program.run({ space: rows, origin, vars: VARS })))).toStrictEqual(results.map((r) => fromCore(r)));
  const m = make(sourceOf(e, options));
  const expected = results.map((r) => (r.ok ? plainOf(r.value) : m.VEX_ERROR));
  const out = m.run(structuredClone(records), VARS);
  expect(out).toStrictEqual(expected);
  expect(plainOf(m.run(records, VARS))).toStrictEqual(plainOf(expected));
  return out;
}

/** This function gives an argument of each parameter of an op: a vector for `domain`, and a number for `number`. */
const argsOf = (name: string): readonly Expr[] => (Vec2Domain.ops[name as keyof typeof Vec2Domain.ops].params ?? []).map((x) => (x === "domain" ? q : n));

const OPS = Object.keys(Vec2Domain.ops);

describe("each op of Vec2Domain in tier 1, tier 2 and a module (P17 COMPILE.MODULE.FORM)", () => {
  it("COMPILE.MODULE.FORM: the table has each op of the domain", () => {
    expect(OPS).toHaveLength(45);
    expect(OPS).toEqual(expect.arrayContaining(["x", "y", "add", "select", "normalize", "allGreaterThan"]));
  });

  for (const name of OPS) {
    it(`P17 COMPILE.MODULE.FORM: the op ${name}, on finite values and on values that are not finite`, () => {
      const e = op(name, p, ...argsOf(name));
      expect(expectSame(e)).toHaveLength(RECORDS.length);
      expect(expectSame(e, NOT_FINITE)).toHaveLength(NOT_FINITE.length);
    });
  }

  it("COMPILE.MODULE.FORM: a module gives the values of the arithmetic, in numbers", () => {
    expect(expectSame(op("add", p, q)).slice(0, 2)).toStrictEqual([{ x: 4, y: 6 }, { x: -1.5, y: -3 }]);
    expect(expectSame(op("x", op("normalize", p))).slice(0, 2)).toStrictEqual([0.6000000000000001, -1]);
    expect(expectSame(op("select", p, p, q)).slice(0, 2)).toStrictEqual([{ x: 3, y: 4 }, { x: -1.5, y: -3 }]);
  });

  it("P17 COMPILE.MODULE.FORM: a chain of ops on a value of `vec2`, and a value of a chain in a record", () => {
    const made = op("vec2", n, lit(1));
    expect(expectSame(op("rotate", op("scale", op("add", p, made), n), lit(0.5)))).toHaveLength(RECORDS.length);
    expect(expectSame(rec({ a: op("swap", q), b: op("length", made), c: p }))).toHaveLength(RECORDS.length);
    expect(expectSame(let_({ w: op("max", p, q) }, op("area", op("subtract", v("w"), p))))).toHaveLength(RECORDS.length);
    expect(expectSame(op("if", op("anyZero", p), op("negate", q), p))).toHaveLength(RECORDS.length);
  });

  it("P17 COMPILE.MODULE.FORM: random chains of ops on random vectors", () => {
    const num = fc.oneof(fc.integer({ min: -4, max: 4 }), fc.constantFrom(-0, 0.25, 1e-300));
    const row = fc.record({ p: fc.tuple(num, num), q: fc.tuple(num, num), n: num, s: fc.constant("") }).map((r) => ({ ...r, p: new Vec2(...r.p), q: new Vec2(...r.q) }));
    const { chain } = fc.letrec<{ chain: Expr }>((tie) => ({
      chain: fc.oneof(
        { depthSize: "small", withCrossShrink: true },
        fc.constantFrom(p, q, vec(1, -2)),
        fc.tuple(fc.constantFrom("add", "subtract", "multiply", "divide", "min", "max"), tie("chain"), tie("chain")).map(([name, a, b]) => op(name, a, b)),
        fc.tuple(fc.constantFrom("negate", "halve", "abs", "swap", "normalize", "floor"), tie("chain")).map(([name, a]) => op(name, a)),
        fc.tuple(fc.constantFrom("scale", "rotate"), tie("chain")).map(([name, a]) => op(name, a, n)),
      ),
    }));
    fc.assert(
      fc.property(chain, fc.array(row, { minLength: 1, maxLength: 3 }), (e, rows) => {
        expect(expectSame(e, rows)).toHaveLength(rows.length);
      }),
    );
  });
});

describe("a failing op and a wrong kind in each tier (P17 COMPILE.MODULE.FORM)", () => {
  it("VEC2.FINITE COMPILE.MODULE.FORM: an op that gives a component that is not finite gives the error", () => {
    const records = [{ p: new Vec2(1, 2), q: new Vec2(0, 1), n: 1, s: "" }];
    const m = make(sourceOf(op("divide", p, q)));
    expect(m.run(records, VARS)).toStrictEqual([m.VEX_ERROR]);
    expect(expectSame(op("divide", p, q), records)).toHaveLength(1);
    expect(expectSame(op("divide", p, op("vec2", lit(0), lit(0))))).toHaveLength(RECORDS.length);
    expect(expectSame(op("lengthSq", op("scale", q, n)))).toHaveLength(RECORDS.length);
  });

  it("COMPILE.MODULE.FORM: `ifError` catches the error of an op", () => {
    expect(expectSame(op("ifError", op("divide", p, q), vec(7, 8)))).toHaveLength(RECORDS.length);
    expect(expectSame(op("ifError", op("x", op("divide", p, q)), lit(-1)))).toHaveLength(RECORDS.length);
  });

  it("COMPILE.MODULE.FORM: an argument of a wrong kind gives the error of the interpreter", () => {
    expect(expectSame(op("scale", p, s))).toHaveLength(RECORDS.length);
    expect(expectSame(op("add", p, s))).toHaveLength(RECORDS.length);
    expect(expectSame(op("dot", p, n))).toHaveLength(RECORDS.length);
    expect(expectSame(op("scale", p, q))).toHaveLength(RECORDS.length);
  });

  it("COMPILE.MODULE.FORM: an input against the schema throws the error of the contract", () => {
    const m = make(sourceOf(op("swap", p), ONLY_P));
    expect(() => m.run([{ p: { x: "1", y: 2 } }], VARS)).toThrow(m.VexContractError);
    expect(() => m.run([{ p: { x: 1 } }], VARS)).toThrow(m.VexContractError);
    expect(() => m.run([{ p: 1 }], VARS)).toThrow(m.VexContractError);
    expect(() => m.run([{ p: null }], VARS)).toThrow(m.VexContractError);
    expect(m.run([{ p: { x: 1, y: 2 } }], VARS)).toStrictEqual([{ x: 2, y: 1 }]);
  });
});

describe("the ops of Vec2Domain in a loop (P17 COMPILE.MODULE.FORM)", () => {
  const sum = fold(axes.all, { c: vec(0, 0) }, { c: op("add", v("c"), p) }, v("c"));

  it("P17 COMPILE.MODULE.FORM: a fold with a literal, and a fold from `vec2`", () => {
    const records = RECORDS.slice(0, 4);
    expect(expectSame(sum, records)).toStrictEqual(records.map(() => ({ x: 1.5, y: 6 })));
    expect(expectSame(fold(axes.all, { c: op("vec2", lit(1), lit(1)) }, { c: op("max", v("c"), op("scale", q, n)) }, op("length", v("c"))))).toHaveLength(RECORDS.length);
  });

  it("P17 COMPILE.MODULE.FORM: a fold with an error in a step, and a failing step that `ifError` catches", () => {
    const failing = fold(axes.all, { c: vec(1, 1) }, { c: op("divide", v("c"), p) }, v("c"));
    expect(expectSame(failing)).toHaveLength(RECORDS.length);
    expect(expectSame(op("ifError", failing, vec(9, 9)))).toHaveLength(RECORDS.length);
  });

  it("P17 COMPILE.MODULE.FORM: an iteration", () => {
    expect(expectSame(iterate(4, { c: p }, { c: op("add", op("rotate", v("c"), lit(1)), q) }, v("c")))).toHaveLength(RECORDS.length);
  });

  it("P17 COMPILE.MODULE.REDUCE COMPILE.MODULE.FORM: `reduce` with the op of the domain, and its identity for no items", () => {
    const list = each(axes.all, p);
    const none = each({ t: "where", axis: axes.all, test: lit(false) }, p);
    expect(expectSame(app("reduce", list, lit("add")))).toHaveLength(RECORDS.length);
    expect(expectSame(app("reduce", list, lit("multiply"), lit({ domain: "Vec2" })))).toHaveLength(RECORDS.length);
    expect(expectSame(app("reduce", none, lit("add"), lit({ domain: "Vec2" })), RECORDS.slice(0, 1))).toStrictEqual([{ x: 0, y: 0 }]);
    expect(expectSame(app("reduce", none, lit("multiply"), lit({ domain: "Vec2" })), RECORDS.slice(0, 1))).toStrictEqual([{ x: 1, y: 1 }]);
  });

  it("P17 COMPILE.MODULE.FORM: a list of vectors, the list ops, and a list literal of vectors", () => {
    const list = each(axes.all, op("add", p, q));
    expect(expectSame(list)).toHaveLength(RECORDS.length);
    expect(expectSame(app("first", list))).toHaveLength(RECORDS.length);
    expect(expectSame(app("sum", each(axes.all, op("length", p))))).toHaveLength(RECORDS.length);
    expect(expectSame(app("sum", each(axes.all, p)))).toHaveLength(RECORDS.length);
    expect(expectSame(app("sortBy", each(axes.all, q), lit({ by: "lengthSq" })), RECORDS.slice(0, 4))).toHaveLength(4);
    const literal = lit(vexList([{ key: "a", result: { ok: true, value: new Vec2(1, 2) } }, { key: "b", result: { ok: true, value: new Vec2(-0, 4) } }]));
    expect(expectSame(literal)).toHaveLength(RECORDS.length);
    expect(expectSame(app("reduce", literal, lit("add")))).toHaveLength(RECORDS.length);
  });

  it("COMPILE.MODULE.LIST.INPUT COMPILE.MODULE.FORM: a field of the schema can hold a list of vectors", () => {
    const options = { domains: DOMAINS, schema: { fields: { l: { list: "domain:Vec2" } } } } as const;
    const l = vexList([{ key: "0", result: { ok: true, value: new Vec2(1, 2) } }, { key: "1", result: { ok: true, value: new Vec2(3, 4) } }]);
    expect(expectSame(app("reduce", ref("l"), lit("add")), [{ l }], options)).toStrictEqual([{ x: 4, y: 6 }]);
    const m = make(sourceOf(app("reduce", ref("l"), lit("add")), options));
    expect(() => m.run([{ l: vexList([{ key: "0", result: { ok: true, value: 1 } }]) }], VARS)).toThrow(m.VexContractError);
  });
});

describe("the form of a value in a module (COMPILE.MODULE.FORM)", () => {
  it("COMPILE.MODULE.FORM: the result of an op is plain data, also for a `Vec2` as the input", () => {
    const m = make(sourceOf(op("normalize", p), ONLY_P));
    const [zero, unit] = m.run([{ p: new Vec2(0, -0) }, { p: new Vec2(3, 4) }], VARS);
    expect(zero).toStrictEqual({ x: 0, y: -0 });
    expect(unit).toStrictEqual({ x: 0.6000000000000001, y: 0.8 });
    expect(zero).not.toBeInstanceOf(Vec2);
  });

  it("COMPILE.MODULE.FORM: a field that the program only reads stays the value of the host", () => {
    const value = new Vec2(1, 2);
    const m = make(sourceOf(p, ONLY_P));
    expect(m.run([{ p: value }], VARS)[0]).toBe(value);
  });

  it("COMPILE.MODULE.FORM: a module of a vector has no name of the class and no import", () => {
    const source = sourceOf(op("add", op("vec2", ref("n"), lit(1)), vec(-0, 2.5)), { domains: DOMAINS, schema: { fields: { n: "number" } } });
    expect(source).not.toMatch(/Vec2/);
    expect(source).not.toContain("import ");
    expect(source).toContain("-0");
    expect(make(source).run([{ n: 3 }], VARS)).toStrictEqual([{ x: 3, y: 3.5 }]);
  });

  it("COMPILE.MODULE.FORM: a literal of a vector is one constant of the run", () => {
    const m = make(sourceOf(rec({ a: vec(1, 2) }), ONLY_P));
    const [a, b] = m.run([{ p: { x: 0, y: 0 } }, { p: { x: 0, y: 0 } }], VARS) as readonly { readonly a: unknown }[];
    expect(a?.a).toBe(b?.a);
    expect(a?.a).toStrictEqual({ x: 1, y: 2 });
  });

  it("COMPILE.MODULE.FORM: a literal that is not finite gives a reason, and a literal without its domain gives a reason", () => {
    expect(reasonOf(vec(Number.NaN, 1))).toBe("a literal is a number that is not finite");
    expect(reasonOf(vec(1, 2), { domains: [NumDomain], schema: SCHEMA })).toBe("a literal is not a number, a text, a boolean or null");
  });

  it("COMPILE.MODULE.FORM: a program without a vector prints the same text with the form of NumDomain and without it", () => {
    const { moduleForm: _form, ...rest } = NumDomain;
    const e = op("add", ref("n"), lit(1));
    const schema: Schema = { fields: { n: "number" } };
    const with_ = sourceOf(e, { domains: [NumDomain, BoolDomain], schema });
    expect(sourceOf(e, { domains: [rest as AnyDomain, BoolDomain], schema })).toBe(with_);
    expect(sourceOf(e, { domains: [NumDomain, BoolDomain, Vec2Domain], schema })).toBe(with_);
  });

  it("COMPILE.MODULE.FORM: a document of a program with a literal of a vector is a module too", () => {
    expect(make(sourceOf(op("add", p, vec(1, 1)), ONLY_P)).run([{ p: new Vec2(1, 2) }], VARS)).toStrictEqual([{ x: 2, y: 3 }]);
  });
});

describe("the limits of a module of vectors (COMPILE.MODULE.FORM)", () => {
  const undecided = (name: string): string => `the kinds of the values of "${name}" do not decide its op`;

  it("COMPILE.MODULE.FORM: a number that the op lifts keeps the dispatch of the runtime, so a module gives a reason", () => {
    expect(reasonOf(op("add", p, lit(1)))).toBe(undecided("add"));
    expect(reasonOf(op("add", p, n))).toBe(undecided("add"));
    expect(reasonOf(op("select", p, n, q))).toBe(undecided("select"));
  });

  it("COMPILE.MODULE.FORM: a domain without a primitive type before the domain of a number gives a reason", () => {
    expect(reasonOf(op("add", n, lit(1)), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toBe(undecided("add"));
    expect(reasonOf(op("length", p), { domains: [Vec2Domain, NumDomain], schema: SCHEMA })).toBe("a domain without a primitive type comes before the domain of a number");
  });

  it("COMPILE.MODULE.FORM: an op that gives a vector of a class gives a reason", () => {
    const options = { domains: [NumDomain, BoolDomain, AngleDomain, Vec2Domain], schema: { fields: { a: "domain:Angle" } } } as const;
    expect(new Angle(0)).toBeInstanceOf(Angle);
    expect(reasonOf(op("toVec2", ref("a"), lit(1)), options)).toBe(undecided("toVec2"));
  });

  it("COMPILE.MODULE.FORM: a second domain of plain data with the same fields does not share a module yet", () => {
    expect(reasonOf(op("add", ref("w"), ref("w")), { domains: [NumDomain, Vec2Domain, XYDomain], schema: { fields: { w: "domain:XY" } } })).toBe(undecided("add"));
  });
});

describe("the form of another domain (COMPILE.MODULE.FORM)", () => {
  /** A value of a class, with a form of plain data. */
  class Box {
    readonly w: number;
    constructor(w: number) {
      this.w = w;
    }
    grow(by: Box): Box {
      return new Box(this.w + by.w);
    }
  }
  const BoxDomain = defineDomain({
    name: "Box",
    is: (u: unknown): u is Box => u instanceof Box,
    moduleForm: {
      is: (u: unknown): boolean => typeof u === "object" && u !== null && typeof (u as Box).w === "number",
      samples: (): readonly unknown[] => [{ w: 0 }, { w: 2 }],
      literal: (u: unknown): { readonly w: number } | undefined => (u instanceof Box ? { w: u.w } : undefined),
      ops: { grow: { fn: (a: Box, b: Box): unknown => ({ w: a.w + b.w }) } },
    },
    ops: { grow: { params: ["domain"], returns: "domain" }, width: { fn: (a: Box): number => a.w, returns: "number" } },
  });
  const options = { domains: [NumDomain, BoolDomain, BoxDomain], schema: { fields: { b: "domain:Box" } } } as const;

  it("COMPILE.MODULE.FORM: a form replaces the part of the domain, and an op without a form keeps its function", () => {
    const m = make(sourceOf(op("width", op("grow", ref("b"), lit(new Box(2)))), options));
    expect(m.run([{ b: { w: 3 } }], {})).toStrictEqual([5]);
  });

  it("COMPILE.MODULE.FORM: a form without ops keeps each op of the domain", () => {
    const Tagged = defineDomain({
      name: "Tagged",
      is: (u: unknown): u is { readonly t: number } => typeof u === "object",
      moduleForm: { samples: (): readonly unknown[] => [{ t: 1 }] },
      ops: { tag: { fn: (a: { readonly t: number }): number => a.t, returns: "number" } },
    });
    const m = make(sourceOf(op("tag", ref("o")), { domains: [NumDomain, Tagged], schema: { fields: { o: "domain:Tagged" } } }));
    expect(m.run([{ o: { t: 4 } }], {})).toStrictEqual([4]);
  });

  it("COMPILE.MODULE.FORM: a function of a form that reads a name outside itself gives a reason", () => {
    const Bad = defineDomain({
      name: "Bad",
      is: (u: unknown): u is Box => u instanceof Box,
      moduleForm: { samples: (): readonly unknown[] => [{ w: 1 }], ops: { grow: { fn: (a: Box, b: Box): Box => new Box(a.w + b.w) } } },
      ops: { grow: { params: ["domain"], returns: "domain" } },
    });
    expect(reasonOf(op("grow", ref("b"), ref("b")), { domains: [NumDomain, Bad], schema: { fields: { b: "domain:Bad" } } })).toBe('the op "grow" of the domain Bad reads a name outside itself, so a module cannot copy it');
  });
});

describe("the facts of a lifted op (KIND.STATIC)", () => {
  const Lifted = defineDomain({
    name: "Lifted",
    is: (u: unknown): u is { readonly v: number } => typeof u === "object",
    fromScalar: (x: number): { readonly v: number } => ({ v: x }),
    ops: { plus: { fn: (a: { readonly v: number }, b: { readonly v: number }): { readonly v: number } => ({ v: a.v + b.v }), liftScalar: true, params: ["domain"], returns: "domain" } },
  });
  const facts = factsOf({ domains: [Lifted] });

  it("KIND.STATIC: a value of the domain at a lifted position decides the op, because the interpreter lifts only a number", () => {
    expect(facts.staticSite("plus", ["domain:Lifted", "domain:Lifted"])).toMatchObject({ t: "fn", domain: 0, bad: false });
  });

  it("KIND.STATIC: a number and a value of an unknown kind at a lifted position keep the dispatch of the runtime", () => {
    expect(facts.staticSite("plus", ["domain:Lifted", "number"])).toBeUndefined();
    expect(facts.staticSite("plus", ["domain:Lifted", undefined])).toBeUndefined();
  });

  it("KIND.STATIC: a text at a lifted position does not lift, so the site gives the error of the arguments", () => {
    expect(facts.staticSite("plus", ["domain:Lifted", "string"])).toMatchObject({ t: "fn", bad: true });
  });
});

/**
 * The domain `InsetsDomain` in each tier. An op of the domain lifts a number, so a module needs KIND.LIFT. `XYDomain` is a
 * second domain of plain objects, so a module needs KIND.FIELDS. Each test compares tier 2 and a module with the
 * interpreter (P17). This comparison includes values that are not finite and values of a wrong kind.
 */
import { app, axes, defineDomain, each, evaluate, fold, let_, lit, ref, space, v, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { BoolDomain, InsetsDomain, JsonDomain, NumDomain, NumRecordDomain, Vec2, Vec2Domain, XYDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { factsOf } from "./facts.ts";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", p: "domain:XY", s: "domain:XY", i: "domain:Insets" }, vars: { k: "number" } } as const;
const XY_FIRST: readonly AnyDomain[] = [NumDomain, XYDomain, InsetsDomain, BoolDomain];
const INSETS_FIRST: readonly AnyDomain[] = [NumDomain, InsetsDomain, XYDomain, BoolDomain];

const sides = (startX: number, startY: number, endX: number, endY: number): unknown => ({ startX, startY, endX, endY });
const point = (x: number, y: number): unknown => ({ x, y });

/** This function makes a domain of objects that declares field names. */
const named = (name: string, fields: readonly string[]): AnyDomain => defineDomain({ name, fields, is: (u: unknown): u is object => typeof u === "object", ops: {} });

/** These records have finite values. */
const CLEAN = [
  { n: 8, p: point(10, 20), s: point(100, 50), i: sides(1, 2, 3, 4) },
  { n: -0.5, p: point(0, 0), s: point(4, 4), i: sides(0, 0, 0, 0) },
  { n: 0, p: point(-3, 7), s: point(1, 2), i: sides(5, 5, 5, 5) },
];
/** These records have values that are not finite, in a number field and in a side. */
const NOT_FINITE = [
  { n: Number.NaN, p: point(1, 2), s: point(3, 4), i: sides(1, 2, 3, 4) },
  { n: Number.POSITIVE_INFINITY, p: point(1, 2), s: point(3, 4), i: sides(1, 2, 3, 4) },
  { n: Number.NEGATIVE_INFINITY, p: point(1, 2), s: point(3, 4), i: sides(1, 2, 3, 4) },
  { n: 1, p: point(1, 2), s: point(3, 4), i: sides(Number.NaN, 2, 3, 4) },
  { n: 1, p: point(1, 2), s: point(3, 4), i: sides(1, Number.POSITIVE_INFINITY, 3, 4) },
  { n: 1, p: point(1, 2), s: point(3, 4), i: sides(1, 2, Number.NEGATIVE_INFINITY, 4) },
  { n: 1, p: point(1, 2), s: point(3, 4), i: sides(1, 2, 3, Number.NaN) },
  { n: 1e308, p: point(1, 2), s: point(3, 4), i: sides(1e308, 1e308, 1e308, 1e308) },
];

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const p = ref("p");
const s = ref("s");
const i = ref("i");
const MADE = op("insets", n, lit(2), lit(3), lit(4));

/** The programs of the comparison. Each of them is a module. */
const LIFTED = op("add", i, n);
const CORNER = op("add", p, op("start", i));
const SIZE = op("subtract", op("subtract", s, op("start", i)), op("end", i));

const PROGRAMS: Readonly<Record<string, Expr>> = {
  "the side startX": op("startX", i),
  "the side startY": op("startY", i),
  "the side endX": op("endX", i),
  "the side endY": op("endY", i),
  "the op insets": MADE,
  "the sides of a new value": op("endY", MADE),
  "the pair start": op("start", i),
  "the pair end": op("end", i),
  "the sum of two values": op("add", i, MADE),
  "a lifted literal": op("add", i, lit(8)),
  "a lifted field": LIFTED,
  "a lifted variable": op("add", i, v("k")),
  "a lifted result": op("add", MADE, op("multiply", n, lit(2))),
  "a scale": op("scale", i, n),
  "the corner of a box": CORNER,
  "the size of a box": SIZE,
  "the far corner of a box": op("subtract", op("add", p, s), op("end", i)),
  "a caught error": op("ifError", op("startX", op("add", i, n)), lit(-1)),
  "a let": let_({ a: op("add", i, n) }, op("add", op("start", v("a")), op("end", v("a")))),
};

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, options: ModuleOptions): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function compares tier 2 and the module with the interpreter at each key (P17), and gives the module results. */
function expectSame(e: Expr, records: readonly unknown[], domains: readonly AnyDomain[] = XY_FIRST): readonly unknown[] {
  const vars = { k: 2 };
  const options = { domains, schema: SCHEMA };
  const rows = space.array(records);
  const results = rows.keys.map((origin) => evaluate(e, { space: rows, origin, vars, domains }));
  const program = tiered(e, options);
  expect(rows.keys.map((origin) => fromCore(program.run({ space: rows, origin, vars })))).toStrictEqual(results.map((r) => fromCore(r)));
  const m = make(sourceOf(e, options));
  const out = m.run(structuredClone(records), vars) as readonly unknown[];
  expect(out).toStrictEqual(results.map((r) => (r.ok ? r.value : m.VEX_ERROR)));
  return out;
}

describe("InsetsDomain in tier 2 and in a module (P17)", () => {
  for (const [name, e] of Object.entries(PROGRAMS)) {
    it(`P17 KIND.LIFT KIND.FIELDS: ${name}, on finite values and on values that are not finite`, () => {
      expect(expectSame(e, CLEAN)).toHaveLength(CLEAN.length);
      expect(expectSame(e, NOT_FINITE)).toHaveLength(NOT_FINITE.length);
      expect(expectSame(e, CLEAN, INSETS_FIRST)).toHaveLength(CLEAN.length);
    });
  }

  it("P17 INSETS.ARITH KIND.LIFT: the values of a box inset, in numbers", () => {
    expect(expectSame(CORNER, CLEAN)).toStrictEqual([point(11, 22), point(0, 0), point(2, 12)]);
    expect(expectSame(SIZE, CLEAN)).toStrictEqual([point(96, 44), point(4, 4), point(-9, -8)]);
    expect(expectSame(LIFTED, CLEAN)).toStrictEqual([sides(9, 10, 11, 12), sides(-0.5, -0.5, -0.5, -0.5), sides(5, 5, 5, 5)]);
  });

  it("P17 INSETS.FINITE: a side that is not finite gives an error in each tier", () => {
    const e = op("add", i, n);
    const rows = space.array(NOT_FINITE);
    expect(rows.keys.map((origin) => evaluate(e, { space: rows, origin, vars: { k: 2 }, domains: XY_FIRST }).ok)).toEqual(NOT_FINITE.map(() => false));
    const m = make(sourceOf(e, { domains: XY_FIRST, schema: SCHEMA }));
    expect(m.run(structuredClone(NOT_FINITE), { k: 2 })).toStrictEqual(NOT_FINITE.map(() => m.VEX_ERROR));
  });

  it("P17 KIND.LIFT: a reduce, a fold and each over values of the domain", () => {
    const summed = fold(axes.all, { c: op("insets", lit(0), lit(0), lit(0), lit(0)) }, { c: op("add", v("c"), op("add", i, n)) }, v("c"));
    expect(expectSame(summed, CLEAN)).toStrictEqual(CLEAN.map(() => sides(13.5, 14.5, 15.5, 16.5)));
    const widest = op("max", each(axes.all, op("startX", op("add", i, n))));
    expect(expectSame(widest, CLEAN)).toStrictEqual(CLEAN.map(() => 9));
  });

  it("P17 KIND.LIFT: a wrong kind in an argument gives an error in each tier, and an input against the schema stops a module", () => {
    // A boolean and a text do not lift, and an op of XYDomain does not take a value of InsetsDomain.
    const records = CLEAN.map((r) => ({ ...r }));
    for (const e of [op("add", i, lit(true)), op("add", i, lit("8")), op("add", i, p), op("add", p, i), op("scale", i, lit(true)), op("scale", i, i), op("insets", n, lit("2"), lit(3), lit(4))]) {
      const out = expectSame(e, records);
      expect(new Set(out)).toHaveLength(1);
    }
    // A field against the schema goes to tier 1, and a module gives the error of its contract.
    const wrong = [{ n: "3", p: point(1, 2), s: point(3, 4), i: sides(1, 2, 3, 4) }, { n: 1, p: point(1, 2), s: point(3, 4), i: 8 }, { n: 1, p: point(1, 2), s: point(3, 4), i: point(1, 2) }];
    const rows = space.array(wrong);
    const program = tiered(op("add", i, n), { domains: XY_FIRST, schema: SCHEMA });
    const run = (origin: string): unknown => fromCore(program.run({ space: rows, origin, vars: { k: 2 } }));
    expect(rows.keys.map((origin) => run(origin))).toStrictEqual(rows.keys.map((origin) => fromCore(evaluate(op("add", i, n), { space: rows, origin, vars: { k: 2 }, domains: XY_FIRST }))));
    const m = make(sourceOf(op("add", i, n), { domains: XY_FIRST, schema: SCHEMA }));
    for (const record of wrong) expect(() => m.run([record], { k: 2 })).toThrow("the record 0 does not keep the schema");
  });

  it("P17 INSETS.VEC2: startVec2 and endVec2 give Vec2 values in tier 2, and a module refuses them with a reason", () => {
    const domains = [NumDomain, Vec2Domain, XYDomain, InsetsDomain, BoolDomain];
    const e = op("add", op("startVec2", i), op("endVec2", i));
    const rows = space.array(CLEAN);
    const program = tiered(e, { domains, schema: SCHEMA });
    const direct = rows.keys.map((origin) => evaluate(e, { space: rows, origin, vars: { k: 2 }, domains }));
    expect(rows.keys.map((origin) => fromCore(program.run({ space: rows, origin, vars: { k: 2 } })))).toStrictEqual(direct.map((r) => fromCore(r)));
    expect(direct[0]).toMatchObject({ ok: true, value: new Vec2(4, 6) });
    expect(emitModule(op("startVec2", i), { domains: XY_FIRST, schema: SCHEMA })).toEqual({ ok: false, reason: 'the op "startVec2" of the domain Insets reads a name outside itself, so a module cannot copy it' });
    expect(emitModule(op("endVec2", i), { domains: XY_FIRST, schema: SCHEMA })).toEqual({ ok: false, reason: 'the op "endVec2" of the domain Insets reads a name outside itself, so a module cannot copy it' });
  });
});

describe("KIND.LIFT: a module lifts a number with a copy of fromScalar", () => {
  it("KIND.LIFT: the module has one copy of the lift, and a site of two domain values has none", () => {
    const options = { domains: XY_FIRST, schema: SCHEMA };
    const lifted = sourceOf(op("add", op("add", i, lit(8)), n), options);
    expect(lifted.match(/const lift_2 = /g)).toHaveLength(1);
    expect(lifted.match(/lift_2\(R\[o\]\["n"\]\)/g)).toHaveLength(1);
    expect(lifted.match(/lift_2\(8\)/g)).toHaveLength(1);
    expect(sourceOf(op("add", i, i), options)).not.toContain("lift_");
  });

  it("KIND.LIFT: a fromScalar that reads a name outside itself gives a reason, and a thrown lift gives an error", () => {
    const shared = { scale: 2 };
    const Outer = defineDomain({
      name: "Outer",
      is: (u: unknown): u is { readonly a: number } => typeof u === "object" && u !== null,
      fromScalar: (a: number): { readonly a: number } => ({ a: a * shared.scale }),
      samples: () => [{ a: 1 }],
      ops: { plus: { fn: (x: { readonly a: number }, y: { readonly a: number }): { readonly a: number } => ({ a: x.a + y.a }), liftScalar: true, params: ["domain"], returns: "domain" } },
    });
    expect(emitModule(op("plus", ref("o"), lit(1)), { domains: [NumDomain, Outer], schema: { fields: { o: "domain:Outer" } } })).toEqual({ ok: false, reason: "the lift of the domain Outer reads a name outside itself, so a module cannot copy it" });
    const Fussy = defineDomain({
      name: "Fussy",
      is: (u: unknown): u is { readonly a: number } => typeof u === "object" && u !== null,
      fromScalar: (a: number): { readonly a: number } => {
        if (a < -1e9) throw new Error("too small");
        return { a };
      },
      samples: () => [{ a: 1 }],
      ops: { plus: { fn: (x: { readonly a: number }, y: { readonly a: number }): { readonly a: number } => ({ a: x.a + y.a }), liftScalar: true, params: ["domain"], returns: "domain" } },
    });
    const e = op("plus", ref("o"), n);
    const records = [{ n: 2, o: { a: 1 } }, { n: -2e9, o: { a: 1 } }];
    const rows = space.array(records);
    const domains = [NumDomain, Fussy];
    const m = make(sourceOf(e, { domains, schema: { fields: { n: "number", o: "domain:Fussy" } } }));
    expect(m.run(structuredClone(records), {})).toStrictEqual(rows.keys.map((origin) => {
      const r = evaluate(e, { space: rows, origin, domains });
      return r.ok ? r.value : m.VEX_ERROR;
    }));
  });

  it("KIND.LIFT: a number at a position that the op does not lift stays a number", () => {
    const Mixed = defineDomain({
      name: "Mixed",
      is: (u: unknown): u is { readonly a: number } => typeof u === "object" && u !== null,
      fromScalar: (a: number): { readonly a: number } => ({ a }),
      samples: () => [{ a: 1 }, { a: -2 }],
      ops: { mix: { fn: (x: { readonly a: number }, k: number, y: { readonly a: number }): { readonly a: number } => ({ a: x.a * k + y.a }), liftScalar: [false, true], params: ["number", "domain"], returns: "domain" } },
    });
    const e = op("mix", ref("o"), lit(3), n);
    const records = [{ n: 2, o: { a: 5 } }, { n: -1, o: { a: 0 } }];
    const rows = space.array(records);
    const domains = [NumDomain, Mixed];
    const m = make(sourceOf(e, { domains, schema: { fields: { n: "number", o: "domain:Mixed" } } }));
    expect(m.run(structuredClone(records), {})).toStrictEqual(rows.keys.map((origin) => (evaluate(e, { space: rows, origin, domains }) as { value: unknown }).value));
  });

  it("KIND.LIFT: a site asks for the lift, and tier 2 keeps the dispatch of a number", () => {
    const facts = factsOf({ domains: XY_FIRST });
    expect(facts.staticSite("add", ["domain:Insets", "number"])).toBeUndefined();
    expect(facts.staticSite("add", ["domain:Insets", "number"], new Set(), true)).toEqual({ t: "fn", domain: 2, bad: false, returns: "domain:Insets", lifted: [0] });
    // An argument of an unknown kind can be a number, so the site keeps the dispatch.
    expect(facts.staticSite("add", ["domain:Insets", undefined], new Set(), true)).toBeUndefined();
    // A value of the domain does not lift, so the site is static without the lift.
    expect(facts.staticSite("add", ["domain:Insets", "domain:Insets"])).toEqual({ t: "fn", domain: 2, bad: false, returns: "domain:Insets" });
    expect(facts.staticSite("add", ["domain:Insets", "domain:XY"])).toEqual({ t: "fn", domain: 2, bad: true, returns: "domain:Insets" });
    expect(facts.staticSite("add", ["domain:Insets", "boolean"])).toEqual({ t: "fn", domain: 2, bad: true, returns: "domain:Insets" });
    // A site of a domain without fromScalar lifts nothing.
    expect(facts.staticSite("add", ["domain:XY", "number"], new Set(), true)).toEqual({ t: "fn", domain: 1, bad: true, returns: "domain:XY" });
  });
});

describe("KIND.FIELDS: two domains with different fields have no common value", () => {
  it("KIND.FIELDS: a domain with other fields does not stop the search for the domain of a kind", () => {
    const facts = factsOf({ domains: XY_FIRST });
    expect(facts.checkOf("domain:Insets")).toBe(2);
    expect(facts.checkOf("domain:XY")).toBe(1);
    expect(factsOf({ domains: INSETS_FIRST }).checkOf("domain:XY")).toBe(2);
    expect(facts.staticSite("start", ["domain:Insets"])).toEqual({ t: "fn", domain: 2, bad: false, returns: "domain:XY" });
    expect(facts.staticSite("x", ["domain:XY"])).toEqual({ t: "fn", domain: 1, bad: false, returns: "number" });
  });

  it("KIND.FIELDS: a domain without fields can accept the value, so the search stops there", () => {
    expect(factsOf({ domains: [NumDomain, JsonDomain, InsetsDomain] }).checkOf("domain:Insets")).toBeUndefined();
    expect(factsOf({ domains: [NumDomain, NumRecordDomain, InsetsDomain] }).staticSite("startX", ["domain:Insets"])).toBeUndefined();
    expect(factsOf({ domains: [NumDomain, Vec2Domain, InsetsDomain] }).checkOf("domain:Insets")).toBeUndefined();
    // A kind that no domain of the list has is not a kind with other fields.
    expect(factsOf({ domains: [NumDomain, XYDomain] }).checkOf("domain:Insets")).toBeUndefined();
    expect(emitModule(op("startX", i), { domains: [NumDomain, JsonDomain, InsetsDomain, XYDomain], schema: SCHEMA })).toMatchObject({ ok: false });
  });

  it("KIND.FIELDS: the same names in another order are not different, and a longer list with the same start is", () => {
    const ab = named("AB", ["a", "b"]);
    expect(factsOf({ domains: [ab, named("BA", ["b", "a"])] }).checkOf("domain:BA")).toBeUndefined();
    expect(factsOf({ domains: [ab, named("ABC", ["a", "b", "c"])] }).checkOf("domain:ABC")).toBe(1);
    expect(factsOf({ domains: [named("ABC", ["a", "b", "c"]), ab] }).checkOf("domain:AB")).toBe(1);
    expect(factsOf({ domains: [ab, named("AC", ["a", "c"])] }).checkOf("domain:AC")).toBe(1);
  });
});

/**
 * The result of an op in a standalone module (COMPILE.MODULE.RESULT, V-070). The declaration `returns` tells the kind of
 * a value. An op with such a declaration can also give `undefined`, `null` or a number that is not finite. These results
 * are errors of the interpreter (CALL.RESULT), so they are errors of the module. Each test compares the module with the
 * interpreter (P17).
 */
import { app, axes, defineDomain, each, evaluate, fold, let_, lit, ref, SheetRun, space, v, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";

interface Loaded {
  readonly run: (records: unknown, vars: unknown, parents?: unknown) => unknown;
  readonly VEX_ERROR: unknown;
}

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the arrow function of a source. Its text is the source, as the text of the op of a domain is. */
function arrow(src: string): (...a: never[]) => unknown {
  // oxlint-disable-next-line typescript/no-implied-eval -- the sources are the sources of this test.
  return new Function(`return (${src});`)() as (...a: never[]) => unknown;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const s = ref("s");
const RECORDS = [
  { n: -1, s: "a" },
  { n: 0, s: "b" },
  { n: 1, s: "c" },
  { n: 2.5, s: "d" },
];
const SCHEMA = { fields: { n: "number", s: "string" } } as const;
const PARENTS = [-1, 0, 0, 2];

/** A value of a domain with no primitive type and with no check `valid`. */
const Tag = defineDomain({ name: "Tag", is: (u: unknown): u is { tag: number } => typeof u === "object" && u !== null && "tag" in u, samples: () => [{ tag: 1 }], ops: {} });

/** The same domain, with a check `valid` that takes `NaN`, an infinite number and `undefined`, as the check of a band takes them. */
const Lax = defineDomain({ name: "Tag", is: Tag.is, samples: () => [{ tag: 1 }], valid: (x: { tag: number } | undefined): boolean => x === undefined || x.tag !== 2, ops: {} });

/** The same domain, with a check `valid` that refuses each result that is not a value: it gives false or it throws. */
const Strict = defineDomain({ name: "Tag", is: Tag.is, samples: () => [{ tag: 1 }], valid: (x: { tag: number }): boolean => Number.isFinite(x.tag), ops: {} });

/** This function gives the domains of a program whose op `probe` of a number has a source. */
function domainsOf(src: string, returns: "number" | "boolean" | "string" | "domain:Tag", tag: AnyDomain = Tag): readonly AnyDomain[] {
  const ops = { ...NumDomain.ops, probe: { fn: arrow(src), params: [], returns } };
  return [{ ...NumDomain, ops } as unknown as AnyDomain, BoolDomain, TextDomain, tag];
}

const valueOf = (r: ReturnType<typeof evaluate>, error: unknown): unknown => (r.ok ? r.value : error);

/** This function compares each form of the module and tier 2 with the interpreter at each key, and gives the first source. */
function expectSame(e: Expr, domains: readonly AnyDomain[]): string {
  const data = space.array(RECORDS);
  const options: ModuleOptions = { domains, schema: SCHEMA };
  const results = data.keys.map((origin) => evaluate(e, { space: data, origin, domains }));
  let first: string | undefined;
  for (const form of [{}, { fuse: false }, { lists: "plain" }] as const) {
    const m = emitModule(e, { ...options, ...form });
    if (!m.ok) throw new Error(m.reason);
    first ??= m.source;
    const loaded = make(m.source);
    expect(loaded.run(structuredClone(RECORDS), {})).toStrictEqual(results.map((r) => valueOf(r, loaded.VEX_ERROR)));
  }
  const parents = Object.fromEntries(PARENTS.map((p, i) => [String(i), p < 0 ? null : String(p)]));
  const tree = space.tree(Object.fromEntries(RECORDS.map((r, i) => [String(i), r])), parents);
  const inTree = emitModule(e, { ...options, space: "tree" });
  if (!inTree.ok) throw new Error(inTree.reason);
  const loadedTree = make(inTree.source);
  expect(loadedTree.run(structuredClone(RECORDS), {}, PARENTS)).toStrictEqual(tree.keys.map((origin) => valueOf(evaluate(e, { space: tree, origin, domains }), loadedTree.VEX_ERROR)));
  const program = tiered(e, options);
  expect(data.keys.map((origin) => fromCore(program.run({ space: data, origin })))).toStrictEqual(results.map((r) => fromCore(r)));
  return first as string;
}

/** This function gives the result of the module of a sheet of one column, and the result of `SheetRun`. */
function sheetResults(e: Expr, kind: "number" | "boolean" | "string", domains: readonly AnyDomain[]): readonly [unknown, unknown] {
  const m = emitSheetModule(new Map([["A", e]]), { domains, schema: SCHEMA, kinds: { A: kind } });
  if (!m.ok) throw new Error(m.reason);
  const loaded = make(m.source);
  const data = space.array(RECORDS);
  const sheet = new SheetRun(new Map([["A", e]]), { space: data, domains });
  return [loaded.run(structuredClone(RECORDS), {}), { A: data.keys.map((k) => valueOf(sheet.cell("A", k), loaded.VEX_ERROR)) }];
}

/** The places of an op of each kind. Some places keep the error, some skip the item, and some drop the binding. */
const PLACES: readonly ((c: Expr) => Expr)[] = [
  (c) => c,
  (c) => op("ifError", let_({ x: c }, lit(1)), lit(-1)),
  (c) => op("ifError", let_({ x: c }, op("first", op("fill", lit(1), ref("n")))), lit(-1)),
  (c) => op("count", each(axes.all, c)),
  (c) => op("ifError", op("count", each(axes.all, c), lit({ strict: true })), lit(-1)),
  (c) => op("ifError", op("first", each(axes.all, c)), c),
];

const BAD: Readonly<Record<string, string>> = { infinite: "Infinity", negative: "-Infinity", "not a number": "NaN", undefined: "undefined", null: "null" };
const KINDS = ["string", "boolean", "domain:Tag"] as const;
const GOOD = { string: `"x"`, boolean: "true", "domain:Tag": "({ tag: a })" };

describe("V-070 COMPILE.MODULE.RESULT: a result that is not a value", () => {
  for (const kind of KINDS) {
    for (const [name, code] of Object.entries(BAD)) {
      it(`V-070 COMPILE.MODULE.RESULT CALL.RESULT: an op that declares ${kind} and gives ${name} gives the error of the interpreter`, () => {
        const domains = domainsOf(`(a) => (a > 0 ? ${code} : ${GOOD[kind]})`, kind);
        for (const place of PLACES) expectSame(place(op("probe", n)), domains);
      });
    }
  }

  it("V-070 COMPILE.MODULE.RESULT CALL.RESULT: a test of each kind of place stops at the error, not at the truth of the value", () => {
    for (const code of Object.values(BAD)) {
      const domains = domainsOf(`(a) => (a > 0 ? ${code} : false)`, "boolean");
      const c = op("probe", n);
      for (const e of [op("if", c, lit(1), lit(2)), op("ifError", op("if", c, lit(1), lit(2)), lit(3)), op("and", c, lit(true)), op("or", c, lit(false)), op("not", c), op("count", each(axes.where(axes.all, c), n))]) expectSame(e, domains);
    }
  });

  it("V-070 COMPILE.MODULE.RESULT COMPILE.MODULE.LIST.RESULT: a list of a plain module has the sentinel at an item that is not a value", () => {
    const e = each(axes.all, op("probe", n));
    const domains = domainsOf(`(a) => (a > 0 ? NaN : "x")`, "string");
    const m = emitModule(e, { domains, schema: SCHEMA, lists: "plain" });
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const result = loaded.run(structuredClone(RECORDS), {}) as readonly (readonly unknown[])[];
    expect(result[0]).toStrictEqual(["x", "x", loaded.VEX_ERROR, loaded.VEX_ERROR]);
  });

  it("V-070 COMPILE.MODULE.RESULT COMPILE.MODULE.SHEET: a column of a sheet has the error at each such cell", () => {
    for (const code of Object.values(BAD)) {
      const [text, textWanted] = sheetResults(op("probe", n), "string", domainsOf(`(a) => (a > 0 ? ${code} : "x")`, "string"));
      expect(text).toStrictEqual(textWanted);
      const [truth, truthWanted] = sheetResults(op("probe", n), "boolean", domainsOf(`(a) => (a > 0 ? ${code} : true)`, "boolean"));
      expect(truth).toStrictEqual(truthWanted);
    }
  });

  it("V-070 COMPILE.MODULE.RESULT COMPILE.MODULE.REDUCE COMPILE.MODULE.SORT.BY: the op of a step and of the option by has the check", () => {
    const ops = { ...TextDomain.ops, join: { fn: arrow(`(a, b) => (b === "c" ? NaN : a + b)`), params: ["string"], returns: "string" }, rank: { fn: arrow(`(a) => (a === "c" ? undefined : a)`), params: [], returns: "string" } };
    const domains = [NumDomain, BoolDomain, { ...TextDomain, ops } as unknown as AnyDomain, Tag];
    expectSame(op("ifError", op("reduce", each(axes.all, s), lit("join")), lit("error")), domains);
    expectSame(op("ifError", op("first", op("sortBy", each(axes.all, s), lit({ by: "rank" }))), lit("error")), domains);
  });

  it("V-070 COMPILE.MODULE.RESULT: an honest op of a domain of numbers overflows to the error of the interpreter", () => {
    // The law checker accepts this op: each value of `Amount` is a number, and an infinite number is such a value.
    const Amount = defineDomain({ name: "Amount", is: (u: unknown): u is number => typeof u === "number", samples: () => [1, 2], ops: { scale: { fn: (a: number, b: number): number => a * b, params: ["domain"], returns: "domain" } } });
    const domains = [Amount, BoolDomain, TextDomain];
    const e = op("scale", ref("a"), ref("a"));
    const options = { domains, schema: { fields: { a: "domain:Amount" } } } as const;
    const m = emitModule(e, options);
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source);
    const records = [{ a: 2 }, { a: 1e308 }];
    const data = space.array(records);
    expect(loaded.run(records, {})).toStrictEqual(data.keys.map((origin) => valueOf(evaluate(e, { space: data, origin, domains }), loaded.VEX_ERROR)));
    expect(loaded.run(records, {})).toStrictEqual([4, loaded.VEX_ERROR]);
  });

  it("V-070 COMPILE.MODULE.RESULT: an op of a text that reads a table gives the error of the interpreter for a missing entry", () => {
    const ops = { ...TextDomain.ops, label: { fn: (a: string): string => ({ a: "first", b: "second" })[a] as string, params: [], returns: "string" } };
    const domains = [NumDomain, BoolDomain, { ...TextDomain, ops } as unknown as AnyDomain];
    expectSame(op("label", s), domains);
    expectSame(op("ifError", op("label", s), lit("none")), domains);
  });
});

/** This function gives the source of a module with the op `probe`. */
function sourceOf(src: string, returns: "number" | "boolean" | "string" | "domain:Tag", tag: AnyDomain = Tag): string {
  const m = emitModule(op("probe", n), { domains: domainsOf(src, returns, tag), schema: SCHEMA });
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

describe("V-070 COMPILE.MODULE.RESULT: the code of the check", () => {
  it("V-070 COMPILE.MODULE.RESULT: a body that gives a boolean or an object at each input has no check", () => {
    for (const src of ["(a) => a > 0", "(a) => a <= 0", "(a) => a === 0", "(a) => a !== 0", "(a) => a == 0", "(a) => a != 0", "(a) => a >= 0", "(a) => a < 0", "a => a > 0", "(a) => !a", "(a) => !!a", "(a) => !(a + 1)", "(a) => ! a.b", "($) => !$", "(a) => a > 0 && !a", "(a) => (a > 0)", "(a) => a > 0 && a < 2", "(a) => a > 0 || a < -1 || a === 0", "(a) => !a && a === 0", "(a) => a > (0, NaN)", "(a) => [a][0] > 0", "(a) => ({ b: a }).b > 0"]) expect([src, sourceOf(src, "boolean")]).not.toContain("k_value(");
    for (const src of ["(a) => ({ tag: a })", "(a) => (({ tag: a, more: [a, { b: a }] }))"]) expect(sourceOf(src, "domain:Tag")).not.toContain("k_value(");
  });

  it("V-070 COMPILE.MODULE.RESULT: each other body has the check", () => {
    const sources = [
      "(a) => undefined",
      "(a) => a",
      "(a) => a > 0 ? true : NaN",
      "(a) => a > 0 && NaN",
      "(a) => a > 0 || NaN",
      "(a) => NaN || a > 0",
      "(a) => a > 0 ?? NaN",
      "(a) => (a > 0, NaN)",
      "(a) => (a > 0) && NaN",
      "(a) => a << 1",
      "(a) => a >> 1",
      "(a) => a >>> 1",
      "(a) => a <<= 1",
      "(a) => a >>= 1",
      "(a) => a >>>= 1",
      "(a) => a = 1",
      "(a) => a & 1",
      "(a) => a | 1",
      "(a) => a ^ 1",
      "(a) => !a + 1",
      "(a) => { return a > 0; }",
      "(a) => { a > 0; }",
      "function (a) { const f = (x) => x > 0; return f(a) ? NaN : true; }",
      "(a = 1) => a > 0",
      `(a) => a > 0 /* ( */ ? NaN : true`,
      `(a) => "(" ? NaN : a > 0`,
      `(a) => '(' ? NaN : a > 0`,
      "(a) => `(` ? NaN : a > 0",
      "(a) => /[(]/ ? NaN : a > 0",
      "(a) => a / 0 > 0 ? NaN : true",
    ];
    for (const src of sources) expect([src, sourceOf(src, "boolean").includes("k_value(")]).toStrictEqual([src, true]);
    for (const src of ["(a) => ({ tag: a }).tag", "(a) => ({ tag: a }, NaN)", "(a) => ({ tag: a }) && NaN", "(a) => { return { tag: a }; }"]) expect([src, sourceOf(src, "domain:Tag").includes("k_value(")]).toStrictEqual([src, true]);
    expect(sourceOf(`(a) => "x" + a`, "string")).toContain("k_value(");
  });

  it("V-070 COMPILE.MODULE.RESULT: a result of the kind number needs no other check, and a check valid that refuses each such result needs none", () => {
    expect(sourceOf("(a) => undefined", "number")).not.toContain("k_value(");
    expect(sourceOf("(a) => (a > 0 ? NaN : { tag: a })", "domain:Tag", Strict)).not.toContain("k_value(");
    // The check takes undefined and NaN, so the module needs the check of a value too.
    const lax = sourceOf("(a) => (a > 0 ? NaN : { tag: a })", "domain:Tag", Lax);
    expect(lax).toContain("k_domain_Tag(k_value(");
  });

  it("V-070 COMPILE.MODULE.RESULT: the inline form of an op keeps its check, and a loop over it keeps its try", () => {
    const domains = domainsOf("(a) => a / 0", "boolean");
    expect(sourceOf("(a) => a / 0", "boolean")).toContain("k_value((");
    expectSame(op("count", each(axes.all, op("probe", n))), domains);
  });

  it("V-070 COMPILE.MODULE.RESULT COMPILE.MODULE.SCAN: a test of a key whose text proves no value does not use the search", () => {
    const [num] = domainsOf("(a) => a", "boolean");
    const probe = { fn: arrow("(a, b) => a > b ? a / 0 : a > a"), params: ["number"], returns: "boolean" };
    const domains = [{ ...num, ops: { ...num?.ops, probe } } as unknown as AnyDomain, BoolDomain, TextDomain, Tag];
    expectSame(op("count", each(axes.where(axes.all, op("probe", n, ref("n", [{ t: "origin" }]))), n)), domains);
    expectSame(op("sum", each(axes.where(axes.all, op("probe", ref("n", [{ t: "origin" }]), n)), n)), domains);
  });

  it("V-070 COMPILE.MODULE.RESULT COMPILE.MODULE.EXIT: a fast sum and a fold with an exit keep the error of such a result", () => {
    const domains = domainsOf("(a) => (a > 0 ? NaN : a < 0)", "boolean");
    const c = op("probe", n);
    expectSame(op("sum", each(axes.all, op("if", c, n, lit(1)))), domains);
    expectSame(op("ifError", fold(axes.all, { ok: lit(true) }, { ok: op("and", v("ok"), c) }, v("ok")), lit(false)), domains);
  });
});

/** The bodies of the property: each one gives a value of its kind, or a result that is not a value. */
const notValue = fc.constantFrom("undefined", "null", "NaN", "Infinity", "-Infinity", "a / 0", "Math.log(a < 0 ? a : -a)");
const test_ = fc.constantFrom("a > 0", "a <= 1", "a === 0", "a !== 1", "!a", "a < 0 && a > -2", "a > 2 || a === 0");

/** This function gives the bodies over some values of a kind, with the operators that can hide a result that is not a value. */
const bodies = (leaf: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc.letrec<{ body: string }>((tie) => ({
    body: fc.oneof(
      { depthSize: "small" },
      { arbitrary: leaf, weight: 3 },
      { arbitrary: notValue, weight: 2 },
      fc.tuple(tie("body"), tie("body")).map(([x, y]) => `(${x} && ${y})`),
      fc.tuple(tie("body"), tie("body")).map(([x, y]) => `(${x} || ${y})`),
      fc.tuple(tie("body"), tie("body")).map(([x, y]) => `(${x}, ${y})`),
      fc.tuple(test_, tie("body"), tie("body")).map(([c, x, y]) => `${c} ? ${x} : ${y}`),
    ),
  })).body;

const programs = fc.record({
  kind: fc.constantFrom(...KINDS),
  place: fc.constantFrom(...PLACES),
  tag: fc.constantFrom<AnyDomain>(Tag, Lax, Strict),
  seed: fc.nat(),
});

describe("V-070 P17 COMPILE.MODULE.RESULT: random bodies of an op", { timeout: propertyTimeout(60_000) }, () => {
  const leaves = { string: fc.constantFrom(`"x"`, "`t${a}`", "String(a)"), boolean: test_, "domain:Tag": fc.constantFrom("({ tag: a })", "({ tag: 1 })") };

  it("V-070 P17 COMPILE.MODULE.RESULT: each module and tier 2 give the result of the interpreter for each body", () => {
    fc.assert(
      fc.property(programs, ({ kind, place, tag, seed }) => {
        const [body] = fc.sample(bodies(leaves[kind]), { seed, numRuns: 1 });
        expectSame(place(op("probe", n)), domainsOf(`(a) => ${body}`, kind, tag));
      }),
      { numRuns: 150 },
    );
  });
});

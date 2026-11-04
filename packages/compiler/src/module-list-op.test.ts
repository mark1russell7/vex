/**
 * An op of a domain with a list as its result, in each tier (TEXT.CODEPOINTS, KIND.RETURNS.LIST, COMPILE.MODULE.LIST.OP).
 * The op `codePoints` of `TextDomain` is the case of the tests. Each program gives the same value in the interpreter, the
 * reference tier, tier 2 and a module.
 */
import { app, axes, call, defineDomain, each, evaluate, fn, fold, isVexList, iterate, let_, lit, ref, rec, sizeError, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: { fields: { label: "string" }, vars: { z: "number" } } };
const POINTS = app("codePoints", ref("label"));
const LABELS = ["", "a", "A b", "😀", "a😀b", "\ud83d", "\ude00", "\ude00\ud83d", "😀\ud83d", "⺀"];
const RECORDS = LABELS.map((label) => ({ label }));

type Run = (records: unknown, vars: unknown) => readonly unknown[];

/** This function makes the run of a module of a program, and fails the test for a program that cannot be a module. */
function moduleRun(e: Expr, options: ModuleOptions = OPTIONS): Run {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn run;`)() as Run;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr, options: ModuleOptions = OPTIONS): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

/** This function gives the value of the interpreter at each record, or the code of its error. */
function interpreted(e: Expr, records: readonly object[], options: ModuleOptions = OPTIONS): readonly unknown[] {
  const s = space.array(records);
  return s.keys.map((origin) => {
    const r = evaluate(e, { domains: options.domains ?? [], space: s, origin, vars: { z: 2 } });
    return r.ok ? r.value : r.error.code;
  });
}

/** This function gives the value of the module at each record. */
function moduled(e: Expr, records: readonly object[], options: ModuleOptions = OPTIONS): readonly unknown[] {
  return moduleRun(e, options)(records, { z: 2 });
}

/** This function tells if a value of a module is an error of Vex. */
const isError = (u: unknown): boolean => typeof u === "object" && u !== null && "vexError" in u;

/** This function tells if tier 2, with no fallback, and the reference tier give the value of the interpreter at each record. */
function tiersAgree(e: Expr, records: readonly object[]): boolean {
  const s = space.array(records);
  const p = tiered(e, { domains: DOMAINS });
  const same = s.keys.every((origin) => {
    const run = { domains: DOMAINS, space: s, origin, vars: { z: 2 } };
    const expected = evaluate(e, run);
    return JSON.stringify(p.run({ space: s, origin, vars: { z: 2 } })) === JSON.stringify(expected) && JSON.stringify(fromReference(referenceEvaluate(e, run))) === JSON.stringify(fromCore(expected));
  });
  return same && p.tier === 2 && p.stats.fallbacks === 0;
}

const SUM = fold(axes.list(POINTS), { n: lit(0) }, { n: app("add", v("n"), v("c")) }, v("n"), undefined, ["c"]);

const PROGRAMS: readonly (readonly [string, Expr])[] = [
  ["a list as the result", POINTS],
  ["a fold over the axis list", SUM],
  ["each over the axis list", each(axes.list(POINTS), lit(1))],
  ["list ops", rec({ c: app("count", POINTS), s: app("sum", POINTS), m: app("ifError", app("max", POINTS), lit(-1)), t: app("take", POINTS, lit(1)), d: app("drop", POINTS, lit(1)) })],
  ["a name of a let", let_({ cs: POINTS }, app("add", app("count", v("cs")), app("sum", v("cs"))))],
  ["a name of a loop", fold(axes.list(POINTS), { xs: POINTS, n: lit(0) }, { xs: app("drop", v("xs"), lit(1)), n: app("add", v("n"), app("count", v("xs"))) }, rec({ xs: v("xs"), n: v("n") }))],
  ["a step that gives the list", iterate(2, { xs: app("fill", lit(1), lit(0)) }, { xs: POINTS }, app("sum", v("xs")))],
  ["a call", let_({ f: fn(["t"], app("codePoints", v("t"))) }, app("sum", call("f", ref("label"))))],
  ["a branch of if", app("count", app("if", app("eq", ref("label"), lit("")), lit(vexList([])), POINTS))],
  ["a text of a program", app("sum", app("codePoints", lit("ab")))],
  ["a list in an each over the records", each(axes.all, app("count", POINTS))],
  ["an append of two lists", app("count", app("append", POINTS, app("codePoints", lit("ab"))))],
];

describe("TEXT.CODEPOINTS: the op codePoints", () => {
  it("TEXT.CODEPOINTS: each code point is one item, with its position as its key", () => {
    expect(evaluate(POINTS, { domains: DOMAINS, space: space.array([{ label: "a😀" }]), origin: "0" })).toStrictEqual({
      ok: true,
      value: vexList([
        { key: "0", result: { ok: true, value: 0x61 } },
        { key: "1", result: { ok: true, value: 0x1f600 } },
      ]),
    });
  });

  it("TEXT.CODEPOINTS: the empty text gives the empty list, and a lone surrogate is an item with its own value", () => {
    const values = interpreted(app("values", POINTS), RECORDS);
    expect(values[LABELS.indexOf("")]).toEqual([]);
    expect(values[LABELS.indexOf("\ude00\ud83d")]).toEqual([0xde00, 0xd83d]);
    expect(values[LABELS.indexOf("😀\ud83d")]).toEqual([0x1f600, 0xd83d]);
  });

  it("TEXT.CODEPOINTS: a receiver that is not a text has no op", () => {
    expect(interpreted(app("codePoints", lit(1)), RECORDS.slice(0, 1))).toEqual(["#NAME?"]);
  });

  it.each(PROGRAMS)("TEXT.CODEPOINTS P17: tier 2 and the reference tier give the value of the interpreter for %s", (_name, e) => {
    expect(tiersAgree(e, RECORDS)).toBe(true);
  });

  it("TEXT.CODEPOINTS P17: on generated texts, the tiers give the value of the interpreter", () => {
    const text = fc.string({ unit: fc.constantFrom("\ud83d", "\ude00", "😀", "a", " ", "⺀"), maxLength: 6 });
    fc.assert(
      fc.property(fc.array(text, { minLength: 1, maxLength: 3 }), (labels) => {
        const records = labels.map((label) => ({ label }));
        expect(tiersAgree(POINTS, records)).toBe(true);
        expect(moduled(SUM, records)).toEqual(interpreted(SUM, records));
      }),
    );
  });
});

describe("LOOP.SIZE.OPS: the size rule of codePoints", () => {
  it("LOOP.SIZE.OPS: a step can read the list of a text of the loop one time", () => {
    const step = iterate(4, { t: lit("ab"), n: lit(0) }, { t: app("concat", v("t"), lit("c")), n: app("sum", app("codePoints", v("t"))) }, v("n"));
    expect(sizeError(step, { domains: DOMAINS })).toBeUndefined();
    expect(sizeError(SUM, { domains: DOMAINS })).toBeUndefined();
  });

  it("LOOP.SIZE: the keys of the list are new parts, so the JSON text of the list in a step of the text is refused", () => {
    const grown = iterate(12, { t: lit("ab") }, { t: app("concat", lit(""), app("codePoints", v("t"))) }, v("t"));
    expect(sizeError(grown, { domains: DOMAINS })).toContain('whose step gives the name "t" a value');
  });

  it("LOOP.SIZE KIND.RETURNS.LIST: the kind of the result selects the list ops, so a step that appends the list has a bound", () => {
    const grows = fold(axes.all, { xs: lit(vexList([])) }, { xs: app("append", v("xs"), POINTS) }, v("xs"));
    expect(sizeError(grows, { domains: DOMAINS })).toBeUndefined();
    const twice = iterate(12, { xs: POINTS }, { xs: app("append", v("xs"), v("xs")) }, v("xs"));
    expect(sizeError(twice, { domains: DOMAINS })).toContain('at the op "append"');
  });
});

/** A domain with ops that declare a list and do not keep the declaration, or give an error item. */
const Loose = defineDomain({
  name: "Loose",
  is: (u: unknown): u is string => typeof u === "string",
  primitive: "string",
  ops: {
    none: { fn: (_a: string): unknown => undefined, returns: "list:number", size: { size: [1] } },
    text: { fn: (a: string): unknown => a, returns: "list:number", size: { size: [1] } },
    words: { fn: (a: string): unknown => ({ kind: "vex.list", items: [{ key: "w", result: { ok: true, value: a } }] }), returns: "list:string", size: { size: [1] } },
    broken: {
      fn: (_a: string): unknown => ({
        kind: "vex.list",
        items: [
          { key: "e", result: { ok: false, error: { code: "#N/A", kind: "not-found", message: "no", path: [] } } },
          { key: "f", result: { ok: true, value: 4 } },
        ],
      }),
      returns: "list:number",
      size: { size: [1] },
    },
    repeated: { fn: (a: string, n: number): unknown => a.repeat(n), params: ["number"], returns: "list:number", size: { size: [1, 0] } },
  },
});
const LOOSE: ModuleOptions = { domains: [NumDomain, Loose], schema: { fields: { label: "string" } } };

describe("COMPILE.MODULE.LIST.OP: a module has an op with a list as its result", () => {
  it.each(PROGRAMS)("COMPILE.MODULE.LIST.OP: the module gives the value of the interpreter for %s", (_name, e) => {
    expect(moduled(e, RECORDS)).toEqual(interpreted(e, RECORDS));
  });

  it("COMPILE.MODULE.LIST.OP: the value of the op in a module is a list of the interpreter", () => {
    expect(isVexList(moduled(POINTS, RECORDS)[1])).toBe(true);
  });

  it("COMPILE.MODULE.LIST.OP: a plain list of a result is an array of the code points", () => {
    expect(moduleRun(POINTS, { ...OPTIONS, lists: "plain" })([{ label: "a😀" }, { label: "" }], { z: 2 })).toEqual([[0x61, 0x1f600], []]);
  });

  it("COMPILE.MODULE.LIST.OP: an item has the kind of the declaration, so an op on the item has a static site", () => {
    const e = fold(axes.list(POINTS), { n: lit(0) }, { n: app("add", v("n"), app("if", app("gte", v("c"), lit(0x2e80)), lit(1), lit(0))) }, v("n"), undefined, ["c"]);
    expect(moduled(e, RECORDS)).toEqual(interpreted(e, RECORDS));
  });

  it("COMPILE.MODULE.LIST.OP: the axis list cannot read a record at a key of the list", () => {
    expect(reasonOf(each(axes.list(POINTS), ref("label")))).toBe('the axis "list" reads a record at a key of a literal or of "fill"');
  });

  it("COMPILE.MODULE.LIST.OP: a step can give a name the keys of the list, so the axis list over the name cannot read a record", () => {
    const e = iterate(1, { xs: each(axes.all, lit(1)) }, { xs: POINTS }, each(axes.list(v("xs")), ref("label")));
    expect(reasonOf(e)).toBe('the axis "list" reads a record at a key of a literal or of "fill"');
  });

  it("COMPILE.MODULE.LIST.OP: a parameter of the wrong kind gives an error, as in the interpreter", () => {
    const e = app("count", app("repeated", lit("a"), lit("x")));
    expect(interpreted(e, RECORDS.slice(0, 1), LOOSE)).toEqual(["#VALUE!"]);
    expect(moduled(e, RECORDS.slice(0, 1), LOOSE).map(isError)).toEqual([true]);
  });

  it("COMPILE.MODULE.RESULT COMPILE.MODULE.LIST.OP: a result that is not a list is an error of Vex", () => {
    expect(moduled(app("count", app("none", ref("label"))), RECORDS.slice(0, 1), LOOSE).map(isError)).toEqual([true]);
    expect(moduled(app("count", app("text", ref("label"))), RECORDS.slice(0, 1), LOOSE).map(isError)).toEqual([true]);
  });

  it("COMPILE.MODULE.LIST.OP: the items keep their keys, and an error item stays an error item", () => {
    const broken = app("broken", ref("label"));
    expect(moduled(app("sum", broken), RECORDS.slice(0, 1), LOOSE)).toEqual(interpreted(app("sum", broken), RECORDS.slice(0, 1), LOOSE));
    const [list] = moduled(broken, RECORDS.slice(0, 1), LOOSE) as readonly { readonly items: readonly { readonly key: string; readonly result: { readonly ok: boolean } }[] }[];
    expect(list?.items.map((x) => [x.key, x.result.ok])).toEqual([
      ["e", false],
      ["f", true],
    ]);
  });

  it("KIND.RETURNS.LIST COMPILE.MODULE.LIST.OP: the kind of the items can be another primitive type", () => {
    const e = app("first", app("words", ref("label")));
    expect(moduled(e, [{ label: "a" }], LOOSE)).toEqual(["a"]);
  });

  it("COMPILE.MODULE.LIST.OP: an op of an earlier domain with the same name gives a reason at the place of a list", () => {
    const First = defineDomain({ name: "First", is: (u: unknown): u is string => typeof u === "string", primitive: "string", ops: { codePoints: { fn: (a: string): number => a.length, returns: "number" } } });
    const options: ModuleOptions = { domains: [NumDomain, First, TextDomain], schema: { fields: { label: "string" } } };
    expect(reasonOf(app("count", app("codePoints", ref("label"))), options)).toBe("a list op on a value that is not a list");
    expect(moduled(app("codePoints", ref("label")), [{ label: "ab" }], options)).toEqual([2]);
  });
});

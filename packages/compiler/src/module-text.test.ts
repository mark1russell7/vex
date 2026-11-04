/**
 * The texts of a program in a standalone module (V-079). A text pass reads printed code, and a string literal of a
 * program can hold the code that the pass looks for. A pass can count such a text, but it cannot change it. Each test
 * compares the module with the interpreter (P17), in both forms of `faults`.
 */
import { app, axes, call, each, evaluate, fn, fold, isVexList, let_, lit, rec, ref, space, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";
import { emitModule, type ModuleOptions } from "./module.ts";
import { aliases, inlineOps, keepFaults, onceCells } from "./module-tidy.ts";

vi.mock("./module-tidy.ts", { spy: true });

interface Loaded {
  readonly run: (records: unknown, vars: unknown) => unknown;
  readonly VEX_ERROR: unknown;
}

/** A program with a place for a text. */
type Shape = (text: string) => Expr;

const SCHEMA = { fields: { n: "number", w: "number", b: "boolean", s: "string", xs: { list: "number" } }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const items = (...values: readonly number[]): object => ({ kind: "vex.list", items: values.map((x, i) => ({ key: String(i), result: { ok: true, value: x } })) });
const RECORDS = [
  { n: 3, w: 1, b: true, s: "x", xs: items(1, 2) },
  { n: -1, w: 0, b: false, s: "catch {", xs: items() },
  { n: 0, w: 2, b: true, s: "c0", xs: items(4) },
];
const VARS = { a: 2 };

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const SUM = op("sum", each(axes.all, n));
const SUM2 = op("sum", each(axes.all, w));
const COUNT = fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, v("s"));
/** A function with a loop. A `let` of its call that no code reads prints a lazy cell with no read. */
const LOOP_FN = { f: fn([], COUNT) };
const TOTAL_FN = { total: fn(["r"], op("sum", each(axes.all, op("add", n, v("r"))))) };
/** The need of a record: enough work for a column of the run, so a fast sum reads a pack of that column. */
const NEED = op("add", op("add", op("multiply", n, w), op("divide", n, w)), op("multiply", w, w));
const r = v("r");
const STEP = fn(["r"], op("divide", call("need"), op("subtract", r, lit(1))));
const TOTAL = fn(["r"], op("sum", each(axes.all, call("step", r))));
const CALLS = { a: call("total", lit(3)), b: call("total", op("add", n, lit(3))) };

/** This function gives the length of a text. The value of the term does not depend on the printed name of the text. */
const len = (t: string): Expr => op("length", lit(t));

/** This function gives a program with a fast sum: a function with two calls reads a pack of a column in a loop. */
const packed = (total: Expr, step: Expr, fields: Readonly<Record<string, Expr>>, need: Expr = NEED): Expr => let_({ need: fn([], need) }, let_({ step }, let_({ total }, rec({ ...CALLS, ...fields }))));

/** The programs, by name. Each holds a text at a place where a text pass reads the printed line. */
const SHAPES = {
  lit: (t) => lit(t),
  rec: (t) => rec({ s: lit(t), c: n }),
  key: (t) => rec({ [t]: n, c: lit(1) }),
  each: (t) => each(axes.all, lit(t)),
  if: (t) => op("if", ref("b"), lit(t), lit("no")),
  contains: (t) => op("if", op("contains", lit(t), ref("s")), n, w),
  deadCell: (t) => rec({ c: op("count", op("fill", lit(0), SUM)), s: lit(t) }),
  deadCell2: (t) => rec({ c: op("count", op("fill", lit(0), op("add", SUM, SUM2))), d: op("add", n, SUM2), s: lit(t) }),
  deadKey: (t) => rec({ c: op("count", op("fill", lit(0), SUM)), [t]: n }),
  unreadCall: (t) => let_(LOOP_FN, let_({ z: call("f") }, rec({ t: lit(t) }))),
  unreadCallArg: (t) => let_(TOTAL_FN, let_({ z: call("total", COUNT) }, rec({ t: lit(t) }))),
  cell: (t) => rec({ a: op("add", SUM, n), s: lit(t) }),
  cellIf: (t) => op("if", ref("b"), rec({ a: op("add", n, SUM), s: lit(t) }), rec({ a: n, s: lit("z") })),
  sumText: (t) => op("sum", each(axes.all, op("add", n, len(t)))),
  pack: (t) => packed(TOTAL, STEP, { s: lit(t) }),
  packKey: (t) => packed(TOTAL, STEP, { [t]: n }),
  packTerm: (t) => packed(fn(["r"], op("sum", each(axes.all, op("add", call("step", r), len(t))))), STEP, {}),
  packStep: (t) => packed(TOTAL, fn(["r"], op("divide", call("need"), op("subtract", r, len(t)))), {}),
  packNeed: (t) => packed(TOTAL, STEP, {}, op("add", NEED, len(t))),
  fold: (t) => fold(axes.all, { s: lit(0), t: lit(t) }, { s: op("add", v("s"), n), t: v("t") }, rec({ s: v("s"), t: v("t") })),
  foldExit: (t) => fold(axes.all, { s: lit(true), u: lit(0) }, { s: op("and", v("s"), op("gt", n, lit(-5))), u: op("add", v("u"), len(t)) }, rec({ s: v("s"), u: v("u") })),
  foldPack: (t) => let_({ need: fn([], op("add", op("multiply", n, w), op("divide", n, w))) }, fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), op("add", call("need"), len(t))) }, op("ifError", v("s"), lit(-1)))),
  listLoop: (t) => op("sum", each(axes.list(ref("xs")), len(t))),
  listFold: (t) => fold(axes.list(ref("xs")), { s: lit(0) }, { s: op("add", v("s"), len(t)) }, v("s")),
  list: (t) => op("append", each(axes.all, lit(t)), each(axes.all, n)),
  others: (t) => op("sum", each(axes.others, op("add", n, len(t)))),
} as const satisfies Readonly<Record<string, Shape>>;

/** The programs as a list. */
const ALL_SHAPES: readonly Shape[] = Object.values(SHAPES);

/** The texts that a pass looks for with no name of a module. */
const FIXED_TEXTS: readonly string[] = ["catch {", "} catch {", "catch ($f) { FK($f);", "FK(", "FW(", "try {", "=>", "=> {", "function", "for (", "while (", "L(() => {", "T(() => ", "  });", "  }", "RC(", "x === E", "$&", "$1", "$f", '"', "'", "`", "\\", "${", "\n", " "];

/** The forms of a name of a module that a pass looks for. */
const NAME_FORMS: readonly ((name: string) => string)[] = [(x) => x, (x) => `${x}(`, (x) => `G(${x}())`, (x) => `G(${x})`, (x) => `${x}[`, (x) => `const a0 = ${x};`, (x) => `${x}(y1)`];

/** The names that a pass reads: the fresh names of the printer and the functions of the ops. */
const PASS_NAME = /\b(?:(?:c|fn|col|pk|PK|j|q|o)\d+|op_\w+|k_\w+)\b/g;

/** This function gives the source of a module, or `undefined` for a program that it refuses. */
function sourceOf(e: Expr, options: ModuleOptions): string | undefined {
  const m = emitModule(e, options);
  return m.ok ? m.source : undefined;
}

/**
 * This function gives each text that a pass looks for in the module of a program. Each name is a name of that module.
 * The tidy pass removes a cell with no read, so the print does not show its name: this list has each number up to the
 * largest number of a cell in the print, and the number after it.
 */
function textsOf(shape: Shape): readonly string[] {
  const source = sourceOf(shape("x"), { ...OPTIONS, fuse: false, faults: "value" }) ?? "";
  const shown = source.match(PASS_NAME) ?? [];
  const cells = shown.flatMap((x) => (/^c\d+$/.test(x) ?[Number(x.slice(1))] : []));
  const removed = Array.from({ length: Math.max(0, ...cells) + 2 }, (_, i) => `c${String(i)}`);
  return [...FIXED_TEXTS, ...new Set([...shown, ...removed])].flatMap((x) => (FIXED_TEXTS.includes(x) ? [x] : NAME_FORMS.map((form) => form(x))));
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  return value;
}

/** This function gives the results of the module of a program, and the results of the interpreter in the same form. */
function resultsOf(e: Expr, options: ModuleOptions): { readonly got: unknown; readonly want: unknown } {
  const source = sourceOf(e, options);
  if (source === undefined) throw new Error("the module refuses the program");
  const s = space.array(RECORDS);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: options.domains ?? [] }));
  const m = make(source);
  return { got: m.run(structuredClone(RECORDS), VARS), want: results.map((x) => (x.ok ? asModule(x.value, m.VEX_ERROR) : m.VEX_ERROR)) };
}

/** This function compares the module of a program with the interpreter, in each form of `faults` and of `fuse`. */
function expectSame(e: Expr): void {
  for (const faults of ["value", "throw"] as const) {
    for (const fuse of [true, false]) {
      const { got, want } = resultsOf(e, { ...OPTIONS, faults, fuse });
      expect(got).toStrictEqual(want);
    }
  }
}

/** This function gives the count of a pattern in a text. */
const hits = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;

/** This function gives the count of the pattern of `narrowCatches` in the input of that pass, for a program. */
function catchHits(e: Expr): number {
  sourceOf(e, { ...OPTIONS, faults: "throw" });
  const parts = vi.mocked(keepFaults).mock.lastCall?.[0];
  return hits([...(parts?.decls.values() ?? []), ...(parts?.lines ?? [])].join("\n"), /catch \{/g);
}

/** A pass, a program and a text. `plain` counts the mark of the pass with a plain text, and `hit` counts it with that text. */
interface Reach {
  readonly pass: string;
  readonly shape: Shape;
  readonly text: string;
  readonly mark: RegExp;
  readonly plain: number;
  readonly hit: number;
}

/** Each pass that a text reaches. The names come from the printer, so the first test of this file also checks them. */
const REACHES: readonly Reach[] = [
  { pass: "onceCells", shape: SHAPES.unreadCall, text: "G(c6())", mark: / = L\(/g, plain: 0, hit: 2 },
  { pass: "deadConstants", shape: SHAPES.unreadCall, text: "c6", mark: /const c\d+/g, plain: 1, hit: 2 },
  { pass: "deadConstants", shape: SHAPES.each, text: "c3", mark: /const c\d+/g, plain: 1, hit: 2 },
  { pass: "#defers", shape: SHAPES.unreadCall, text: "c6(", mark: / = L\(/g, plain: 0, hit: 2 },
  { pass: "aliases", shape: SHAPES.others, text: "f1", mark: /const f\d+ = o;/g, plain: 0, hit: 1 },
  { pass: "liveDecls", shape: SHAPES.unreadCall, text: "L", mark: /^function L\(/gm, plain: 0, hit: 1 },
];

/** The programs whose print has a fast sum. */
const PACKS: readonly (keyof typeof SHAPES)[] = ["pack", "packKey", "packTerm", "packStep", "packNeed", "foldPack"];

/** The lines of a lazy cell with one `return`. */
const cell = (name: string, value: string): readonly string[] => [`  const ${name} = L(() => {`, `    return ${value};`, "  });"];

/** This function gives the result of `inlineOps` for one declaration of `op_1` and one line. */
function inlined(decl: string, line: string): { readonly left: boolean; readonly line: string } {
  const { decls, lines } = inlineOps({ decls: new Map([["op_1", decl]]), lines: [line], kept: "", globals: new Set() });
  return { left: decls.has("op_1"), line: lines.join(" ") };
}

describe("V-079: a text pass does not change a text of the program", () => {
  it("V-079 P17: a text that holds the read of a lazy cell keeps its value, with faults at value", () => {
    // The printer gives this name to the cell. The tidy pass removes a cell with no read, and a text with its name counts
    // as a read, so this print shows the name. The test shows the case while the name stays.
    expect(sourceOf(SHAPES.unreadCall("c6"), { ...OPTIONS, fuse: false, faults: "value" })).toContain("const c6 = L(");
    const e = SHAPES.unreadCall("G(c6())");
    for (const faults of ["value", "throw"] as const) {
      const { got, want } = resultsOf(e, { ...OPTIONS, faults });
      expect(got).toStrictEqual(want);
      expect(got).toStrictEqual(RECORDS.map(() => ({ t: "G(c6())" })));
    }
    expectSame(e);
  });

  it("V-079 COMPILE.MODULE.FAULT P17: a text that holds a catch keeps its value, with faults at throw", () => {
    const options = { ...OPTIONS, faults: "throw" } as const;
    expect(resultsOf(lit("catch {"), options).got).toStrictEqual(RECORDS.map(() => "catch {"));
    expect(resultsOf(rec({ "} catch {": n }), options).got).toStrictEqual(RECORDS.map((x) => ({ "} catch {": x.n })));
    expect(resultsOf(op("contains", lit("catch {"), ref("s")), options).got).toStrictEqual([false, true, false]);
    for (const e of [lit("catch {"), rec({ "} catch {": n }), op("length", lit("try { } catch { }"))]) expectSame(e);
  });

  it("V-079 COMPILE.MODULE.FAULT P17: each program with a catch in a literal and in a key keeps its value, with faults at throw", () => {
    const cases = ALL_SHAPES.flatMap((shape) => ["catch {", "} catch {"].flatMap((text) => [shape(text), rec({ [text]: shape("x") })]));
    expect(cases).toHaveLength(ALL_SHAPES.length * 4);
    for (const e of cases) expectSame(e);
  });

  it("V-079 COMPILE.MODULE.FAULT: the pass narrows each catch of the code in a line with a text, and in a declaration", () => {
    const { decls, lines } = keepFaults({ decls: new Map([["A", 'const A = () => { try { f("catch {"); } catch { g(); } };'], ["B", "const B = (x) => /catch {/.test(x) || /'/.test(x);"]]), lines: ['  } catch { use("catch {", 1); try { x(); } catch { y("a"); }', 'catch { use("a"); }'] }, new Set());
    expect(lines).toStrictEqual(['  } catch ($f) { FK($f); use("catch {", 1); try { x(); } catch ($f) { FK($f); y("a"); }', 'catch ($f) { FK($f); use("a"); }']);
    expect(decls.get("A")).toBe('const A = () => { try { f("catch {"); } catch ($f) { FK($f); g(); } };');
    expect(decls.get("B")).toBe("const B = (x) => /catch {/.test(x) || /'/.test(x);");
  });

  it.each(Object.keys(SHAPES) as (keyof typeof SHAPES)[])("V-079 COMPILE.MODULE.FAULT: a catch in a literal and in a key of the program %s reaches the pass", (name) => {
    const shape = SHAPES[name];
    expect(catchHits(shape("catch {"))).toBeGreaterThan(catchHits(shape("x")));
    expect(catchHits(rec({ "catch {": shape("x") }))).toBeGreaterThan(catchHits(rec({ x: shape("x") })));
  });

  it.each(PACKS)("V-079: the print of the program %s has a fast sum, so a text is in a second print", (name) => {
    expect(sourceOf(SHAPES[name]("catch {"), { ...OPTIONS, faults: "throw" })).toMatch(/QA\(n, col\d+\)/);
    expect(sourceOf(SHAPES[name]("x"), { ...OPTIONS, faults: "value" })).toMatch(/QA\(n, col\d+\)/);
  });

  it.each(REACHES)("V-079: a text reaches $pass, and the pass counts it", ({ shape, text, mark, plain, hit }) => {
    const options = { ...OPTIONS, faults: "value" } as const;
    expect(hits(sourceOf(shape("x"), options) ?? "", mark)).toBe(plain);
    expect(hits(sourceOf(shape(text), options) ?? "", mark)).toBe(hit);
    expectSame(shape(text));
  });

  it("V-079 COMPILE.MODULE.SIZE.ONCE: the pass finds the read of a cell in code, and it keeps a cell that only a text names", () => {
    for (const quoted of ['"G(c1())"', "'G(c1())'", "`G(c1())`"]) {
      const lines = [...cell("c1", "f(x)"), `  use(${quoted});`];
      expect(onceCells(lines)).toStrictEqual(lines);
    }
    expect(onceCells([...cell("c1", "f(x)"), '  use("a", G(c1()), "b");'])).toStrictEqual(['  use("a", G(f(x)), "b");']);
    expect(onceCells([...cell("c1", '"$&$1"'), "G(c1());"])).toStrictEqual(['G("$&$1");']);
  });

  it("V-079 COMPILE.MODULE.SIZE.INLINE: the pass finds a call in code, for each kind of literal", () => {
    const op1 = "const op_1 = a=>a+1;";
    for (const line of ["  use('op_1(y1)');", "  use(`op_1(y1)`);", "  use('\"', \"op_1(y1)\");", "  use(/op_1(y1)/);"]) expect(inlined(op1, line)).toStrictEqual({ left: true, line });
    expect(inlined(op1, "  use('\"', op_1(y1), \"a\");")).toStrictEqual({ left: false, line: "  use('\"', (y1+1), \"a\");" });
  });

  it("V-079 COMPILE.MODULE.SIZE.ALIAS: the pass renames each read in code, and no text", () => {
    expect(aliases(["  const a2 = b1;", "  use(a2, \"a2\", 'a2', `a2`, a2);"])).toStrictEqual(["  use(b1, \"a2\", 'a2', `a2`, b1);"]);
    expect(aliases(["  const a2 = b1;", "  use({ a2: a2, b: a2 }, [...a2], x.a2, x?.a2, 1e2, a2x);"])).toStrictEqual(["  use({ a2: b1, b: b1 }, [...b1], x.a2, x?.a2, 1e2, a2x);"]);
    expect(aliases(["  const a2 = b1;", "  use(ba2, $a2, a2$, 0xa2, { b: 0, a2 : a2 }, t ? a2 : 0, `a2${a2}`);"])).toStrictEqual(["  use(ba2, $a2, a2$, 0xa2, { b: 0, a2 : b1 }, t ? b1 : 0, `a2${b1}`);"]);
  });

  it("V-079 P17: each text that a pass looks for keeps its value in each program", { timeout: propertyTimeout(120_000) }, () => {
    const cases = ALL_SHAPES.flatMap((shape) => textsOf(shape).map((text) => shape(text))).filter((e) => emitModule(e, OPTIONS).ok);
    expect(cases.length).toBeGreaterThan(ALL_SHAPES.length * FIXED_TEXTS.length * 0.9);
    for (const e of cases) {
      for (const faults of ["value", "throw"] as const) {
        const { got, want } = resultsOf(e, { ...OPTIONS, faults });
        expect(got).toStrictEqual(want);
      }
    }
  });

  it("V-079 P17: a random program with a text that a pass looks for gives the value of the interpreter", { timeout: propertyTimeout(60_000) }, () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_SHAPES), fc.nat(), fc.constantFrom("", " ", "x"), (shape, i, around) => {
        const texts = textsOf(shape);
        const e = shape(`${around}${texts[i % texts.length]}${around}`);
        fc.pre(emitModule(e, OPTIONS).ok);
        expectSame(e);
      }),
    );
  });
});

/**
 * Plain lists in standalone modules (COMPILE.MODULE.LIST.PLAIN). With the option `lists: "plain"`, a list of the input
 * is an array of the values of its items, and a list of the result is an array too. The key of an item of the input is
 * its position, and the result has no keys. The value `VEX_ERROR` of the module is an error item in both directions.
 */
import { createHash } from "node:crypto";
import { app, axes, cell, defineDomain, each, evaluate, isVexList, let_, lit, rec, ref, SheetRun, space, v, vexList, type Expr, type ListItem, type VexError } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, XYDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { NODE_SCHEMA, NODE_SHAPE, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA } from "../../pilots/src/ireko-shapes.ts";
import { emitModule, emitSheetModule, type Emitted, type ModuleOptions, type SheetModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, parents?: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", xs: { list: "number" }, ps: { list: "domain:XY" }, nest: { list: { list: "number" } } }, vars: { a: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain, XYDomain], schema: SCHEMA };
const PLAIN: ModuleOptions = { ...OPTIONS, lists: "plain" };
/** The depth of the lists of each list field of the schema: 0 for a list of values. */
const DEPTHS: Readonly<Record<string, number>> = { xs: 0, ps: 0, nest: 1 };

/** This function gives the records of the tests in the plain form, with the error item `X`. */
const recordsOf = (X: unknown): readonly Record<string, unknown>[] => [
  { n: 1, xs: [3, 1, 2], ps: [{ x: 1, y: 2 }, { x: -1, y: 0.5 }], nest: [[1, 2], []] },
  { n: 2, xs: [5, X, -1], ps: [X], nest: [[X, 4]] },
  { n: 0, xs: [], ps: [], nest: [] },
  { n: -3, xs: [7], ps: [{ x: 3, y: 4 }], nest: [X, [0]] },
];

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string, name = "run"): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run: ${name}, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a module, and fails the test for a program that cannot be a module. */
function sourceOf(m: Emitted): string {
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the first 16 digits of the hash of a source. */
const hash = (source: string): string => createHash("sha256").update(source).digest("hex").slice(0, 16);

/** The error of an error item of the input of the interpreter. */
const error: VexError = { code: "#N/A", kind: "missing-field", message: "no value", path: [] };

/** This function gives the text of the helper `name` of a module. */
const helper = (s: string, name: string): string => (new RegExp(`^function ${name}\\(.*?^}$|^function ${name}\\(.*$`, "ms").exec(s) as RegExpExecArray)[0];

/** This function gives forty records in the plain form, with the error item `X`. */
const many = (X: unknown): readonly Record<string, unknown>[] =>
  Array.from({ length: 40 }, (_x, i) => ({ n: i, xs: Array.from({ length: i % 5 }, (_y, k) => (k === 2 && i % 3 === 0 ? X : (i * 7 + k) % 11)), ps: [], nest: [[i], X] }));

/**
 * This function gives a plain list as the interpreter reads it: a `vex.list` with the text of the position of each item
 * as its key. The value `X` is an error item. The depth `h` is the number of the levels of lists in the items.
 */
function envelopeOf(l: readonly unknown[], h: number, X: unknown): unknown {
  return vexList(l.map((x, i): ListItem => ({ key: String(i), result: x === X ? { ok: false, error } : { ok: true, value: h > 0 ? envelopeOf(x as readonly unknown[], h - 1, X) : x } })));
}

/** This function gives the records of the interpreter for the plain records of a module. */
const envelopesOf = (records: readonly Record<string, unknown>[], X: unknown): readonly unknown[] =>
  records.map((r) => Object.fromEntries(Object.entries(r).map(([f, x]) => [f, f in DEPTHS ? envelopeOf(x as readonly unknown[], DEPTHS[f] ?? 0, X) : x])));

/** This function gives a value of the interpreter in the form of a module: a list in a record is a `vex.list`. */
function asModule(value: unknown, X: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, X) } : { ok: false, error: X } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, X)]));
}

/** This function gives a value of the interpreter in the plain form: a list is an array, and an error item is `X`. */
function plainOf(value: unknown, X: unknown): unknown {
  return isVexList(value) ? value.items.map((x) => (x.result.ok ? plainOf(x.result.value, X) : X)) : asModule(value, X);
}

/** This function compares the plain values of a module with the interpreter at each key (P17), with fuse on and off. */
function expectSame(e: Expr, records: (X: unknown) => readonly Record<string, unknown>[] = recordsOf, options: ModuleOptions = PLAIN): void {
  for (const fuse of [true, false]) {
    const m = make(sourceOf(emitModule(e, { ...options, fuse })));
    const plain = records(m.VEX_ERROR);
    const s = space.array(envelopesOf(plain, m.VEX_ERROR));
    const expected = s.keys.map((origin) => {
      const r = evaluate(e, { space: s, origin, vars: { a: 2 }, domains: options.domains ?? [] });
      return r.ok ? plainOf(r.value, m.VEX_ERROR) : m.VEX_ERROR;
    });
    expect(m.run(plain, { a: 2 })).toStrictEqual(expected);
  }
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const xs = ref("xs");
const nest = ref("nest");
const ps = ref("ps");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error } });
/** A list literal with the keys of texts and an error item. */
const KEYED = lit(vexList([item("a", 1), errorItem("b"), item("c", 4)]));

describe("COMPILE.MODULE.LIST.PLAIN: the option lists", () => {
  const programs: readonly Expr[] = [xs, op("take", xs, lit(2)), each(axes.all, n), each(axes.all, xs), rec({ xs, k: op("count", nest) }), op("sum", xs)];

  it("COMPILE.MODULE.LIST.PLAIN: the default is envelope, and envelope prints the same module", () => {
    for (const e of programs) expect(sourceOf(emitModule(e, { ...OPTIONS, lists: "envelope" }))).toBe(sourceOf(emitModule(e, OPTIONS)));
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const shapes: SheetModuleOptions = { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf" };
    expect(sourceOf(emitModule(NODE_SHAPE, { ...node, lists: "envelope" }))).toBe(sourceOf(emitModule(NODE_SHAPE, node)));
    expect(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, lists: "envelope" }))).toBe(sourceOf(emitSheetModule(SHAPE_COLUMNS, shapes)));
    // The hash of the module of the sheet of ireko with fuse false, as COMPILE.MODULE.FUSE.OFF pins it.
    expect(hash(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, fuse: false, lists: "envelope" })))).toBe("91a25086213c18bd");
  });

  it("COMPILE.MODULE.LIST.PLAIN: a value of lists that is not envelope or plain gives a reason", () => {
    expect(emitModule(xs, { ...OPTIONS, lists: "flat" as unknown as "plain" })).toStrictEqual({ ok: false, reason: 'the option "lists" is flat, not "envelope" or "plain"' });
    expect(emitSheetModule(new Map([["c", lit(1)]]), { domains: [NumDomain], schema: {}, lists: 0 as unknown as "plain" })).toStrictEqual({ ok: false, reason: 'the option "lists" is 0, not "envelope" or "plain"' });
  });

  it("COMPILE.MODULE.LIST.PLAIN: the module of a small list program reads and gives arrays, with no vex.list", () => {
    // The list of the input can hold error items, so the module gives it with LP.
    const e = xs;
    const plain = sourceOf(emitModule(e, PLAIN));
    const envelope = sourceOf(emitModule(e, OPTIONS));
    expect(plain).toContain('LA(r["xs"], 0, is_number)');
    expect(plain).toContain('LA(r["nest"], 1, is_number) === undefined');
    expect(plain).toContain("out.push(LP(");
    expect(plain).toContain("function LP(l, h) { return l.map((x) => (x[1] === E ? VEX_ERROR : h > 0 ? LP(x[1], h - 1) : x[1])); }");
    expect(plain).not.toContain("vex.list");
    expect(plain).not.toMatch(/\bL[IO]C?\(/);
    expect(envelope).toContain('LI(r["xs"], 0, is_number)');
    expect(envelope).toContain("out.push(LO(");
    expect(envelope).not.toMatch(/\bL[AP]C?\(/);
    // A list that the facts prove clean gives the clean form, also for a list of lists.
    const clean = sourceOf(emitModule(each(axes.all, each(axes.window(0, 1), n)), PLAIN));
    expect(clean).toContain("out.push(LPC(");
    expect(clean).toContain(", 1));");
    expect(clean).toContain("function LPC(l, h) { return l.map(h > 0 ? (x) => LPC(x[1], h - 1) : (x) => x[1]); }");
    expect(clean).not.toContain("function LP(");
    // With fuse false, no list is clean.
    expect(sourceOf(emitModule(each(axes.all, n), { ...PLAIN, fuse: false }))).toContain("out.push(LP(");
  });

  it("COMPILE.MODULE.LIST.PLAIN: the module of NODE_SHAPE replaces LI and LOC, and its text is in a golden file", async () => {
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const plain = sourceOf(emitModule(NODE_SHAPE, { ...node, lists: "plain" }));
    const envelope = sourceOf(emitModule(NODE_SHAPE, node));
    await expect(plain).toMatchFileSnapshot("./__golden__/module-plain.js");
    // Only the helpers of the lists change: LA reads the input, and LPC gives the result.
    const swapped = envelope.replace(helper(envelope, "LI"), helper(plain, "LA")).replace(helper(envelope, "LOC"), helper(plain, "LPC")).replaceAll("LI(r[", "LA(r[").replaceAll("out.push(LOC(", "out.push(LPC(");
    expect(swapped).toBe(plain);
    expect(plain).toContain('(LF3[i] = LA(r["rows"], 0, is_3)) === undefined');
    expect(plain).toContain("out.push(LPC(G(c136()), 1));");
  });
});

describe("COMPILE.MODULE.LIST.PLAIN: the values of the interpreter in the plain form (P17)", () => {
  it("COMPILE.MODULE.LIST.PLAIN: a list of the input is a result, with its error items as VEX_ERROR", () => {
    for (const e of [xs, ps, nest, op("take", xs, lit(2)), op("drop", xs, lit(1)), op("sortBy", xs), op("append", xs, xs), op("flat", nest), op("take", nest, lit(1))]) expectSame(e);
  });

  it("COMPILE.MODULE.LIST.PLAIN: the key of an item of the input is the text of its position", () => {
    for (const e of [op("ifError", op("get", xs, lit("1")), lit(-1)), op("ifError", op("get", xs, lit("a")), lit(-1)), op("without", xs, op("take", xs, lit(1))), op("count", op("without", nest, op("drop", nest, lit(1))))]) expectSame(e);
    const m = make(sourceOf(emitModule(op("ifError", op("get", xs, lit("2")), lit(-1)), PLAIN)));
    expect(m.run([{ n: 0, xs: [4, 5, 6], ps: [], nest: [] }], { a: 2 })).toStrictEqual([6]);
  });

  it("COMPILE.MODULE.LIST.PLAIN: the lists of the program, also with keys of texts, error items, no items and lists of lists", () => {
    const programs: readonly Expr[] = [
      each(axes.all, n),
      each(axes.all, op("divide", lit(1), n)),
      each(axes.all, xs),
      each(axes.all, each(axes.window(0, 1), n)),
      each(axes.all, each(axes.window(0, 1), op("divide", lit(1), n))),
      KEYED,
      op("append", KEYED, xs),
      lit(vexList([])),
      op("take", xs, lit(0)),
      op("fill", lit(2), n),
      op("fill", lit(2), xs),
      op("take", xs, lit(-1)),
      op("if", op("gt", n, lit(0)), xs, op("take", xs, lit(0))),
      let_({ l: op("sortBy", xs) }, op("append", v("l"), v("l"))),
    ];
    for (const e of programs) expectSame(e);
  });

  it("COMPILE.MODULE.LIST.PLAIN: an error item and an error value are VEX_ERROR itself, never a value", () => {
    const m = make(sourceOf(emitModule(each(axes.all, op("divide", lit(1), n)), PLAIN)));
    const X = m.VEX_ERROR;
    const out = m.run([{ n: 2, xs: [], ps: [], nest: [] }, { n: 0, xs: [], ps: [], nest: [] }], { a: 2 }) as readonly (readonly unknown[])[];
    expect(out[0]).toStrictEqual([0.5, X]);
    expect(out[0]?.[1]).toBe(X);
    const whole = make(sourceOf(emitModule(op("take", xs, n), PLAIN)));
    const values = whole.run([{ n: -1, xs: [1], ps: [], nest: [] }, { n: 1, xs: [2, 3], ps: [], nest: [] }], { a: 2 }) as readonly unknown[];
    expect(values).toStrictEqual([whole.VEX_ERROR, [2]]);
    expect(values[0]).toBe(whole.VEX_ERROR);
    // An error item of the input stays an error item of the result.
    const same = make(sourceOf(emitModule(xs, PLAIN)));
    const items = same.run([{ n: 0, xs: [same.VEX_ERROR, 2], ps: [], nest: [] }], { a: 2 }) as readonly (readonly unknown[])[];
    expect(items).toStrictEqual([[same.VEX_ERROR, 2]]);
    expect(items[0]?.[0]).toBe(same.VEX_ERROR);
  });

  it("COMPILE.MODULE.LIST.PLAIN: a list in a record and in an argument of an op stays a vex.list", () => {
    expectSame(rec({ xs, nest, n }));
    expectSame(rec({ l: each(axes.all, n), k: KEYED }));
    expectSame(op("ifError", op("add", lit(1), xs), lit(-1)));
    const m = make(sourceOf(emitModule(rec({ xs }), PLAIN)));
    const out = m.run([{ n: 0, xs: [4], ps: [], nest: [] }], { a: 2 }) as readonly { readonly xs: unknown }[];
    expect(out[0]?.xs).toStrictEqual({ kind: "vex.list", items: [{ key: "0", result: { ok: true, value: 4 } }] });
  });

  it("COMPILE.MODULE.LIST.PLAIN: a module of forty records keeps the lists of each record", () => {
    expectSame(rec({ sum: op("sum", xs), all: op("count", op("flat", each(axes.all, xs))) }), many);
    expectSame(op("flat", each(axes.window(-1, 1), xs)), many);
    expectSame(op("sortBy", op("flat", nest)), many);
  });
});

describe("COMPILE.MODULE.LIST.PLAIN: an input against the kind of a plain list", () => {
  const m = make(sourceOf(emitModule(op("count", xs), PLAIN)));
  const X = m.VEX_ERROR;
  const good = { n: 1, xs: [1], ps: [{ x: 0, y: 0 }], nest: [[1]] };

  it("COMPILE.MODULE.LIST.PLAIN: a good input passes the check, also with error items at each depth", () => {
    expect(m.run([good, { ...good, xs: [X] }, { ...good, xs: [] }, { ...good, xs: [X, 2, X, 3] }, { ...good, ps: [X], nest: [X, [X], []] }], { a: 2 })).toStrictEqual([1, 0, 0, 2, 1]);
  });

  it.each([
    ["a number", 5],
    ["null", null],
    ["undefined", undefined],
    ["an object", { 0: 1, length: 1 }],
    ["a vex.list", { kind: "vex.list", items: [{ key: "0", result: { ok: true, value: 1 } }] }],
    ["an item of the wrong kind", ["1"]],
    ["an item undefined", [1, undefined]],
    // oxlint-disable-next-line no-sparse-arrays -- a hole of an array is a value undefined.
    ["a hole", [, 1]],
    ["an object like VEX_ERROR", [{ vexError: true }]],
    ["a list of lists", [[1]]],
  ])("COMPILE.MODULE.LIST.PLAIN: a list of numbers with %s is against the schema", (_name, value) => {
    expect(() => m.run([good, { ...good, xs: value }], { a: 2 })).toThrow("the record 1 does not keep the schema");
  });

  it("COMPILE.MODULE.LIST.PLAIN: a list that the program does not read is checked too, also in its depth and in its domain", () => {
    for (const bad of [{ ps: [{ x: 0 }] }, { ps: [[]] }, { nest: [1] }, { nest: [[[1]]] }, { nest: [[1, "2"]] }, { nest: [{ kind: "vex.list", items: [] }] }]) {
      expect(() => m.run([{ ...good, ...bad }], { a: 2 })).toThrow("the record 0 does not keep the schema");
    }
  });

  it("COMPILE.MODULE.LIST.PLAIN: VEX_ERROR is an error item, also where the test of the domain accepts it", () => {
    const Any = defineDomain({ name: "Any", is: (u: unknown): u is object => typeof u === "object" && u !== null, samples: () => [{}], ops: {} });
    const any = make(sourceOf(emitModule(op("count", ref("os")), { domains: [NumDomain, Any], schema: { fields: { os: { list: "domain:Any" } } }, lists: "plain" })));
    expect(any.run([{ os: [any.VEX_ERROR, { vexError: true }, {}] }], {})).toStrictEqual([2]);
    // The VEX_ERROR of another module is a value.
    expect(any.run([{ os: [X] }], {})).toStrictEqual([1]);
  });
});

describe("COMPILE.MODULE.LIST.PLAIN: plain lists in a module of a sheet", () => {
  const columns = new Map<string, Expr>([
    ["count", op("count", xs)],
    ["head", op("take", xs, lit(2))],
    ["total", op("add", op("sum", cell("head")), op("sum", op("flat", nest)))],
    ["pairs", each(axes.all, op("take", nest, lit(1)))],
    ["up", op("ifError", op("count", ref("xs", [{ t: "parent" }])), lit(-1))],
  ]);
  const parents = [-1, 0, 0, 1];

  /** This function compares the plain columns of a module of a sheet with `SheetRun` at each cell. */
  const expectSameSheet = (options: SheetModuleOptions): string => {
    const source = sourceOf(emitSheetModule(columns, options));
    const m = make(source);
    const X = m.VEX_ERROR;
    const plain = recordsOf(X);
    const s = space.tree(Object.fromEntries(envelopesOf(plain, X).map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
    const sheet = new SheetRun(columns, { space: s, domains: options.domains ?? [], vars: { a: 2 }, cells: options.cells ?? new Map() });
    const expected = Object.fromEntries([...columns.keys()].map((c) => [c, s.keys.map((k) => {
      const r = sheet.cell(c, k);
      return r.ok ? plainOf(r.value, X) : X;
    })]));
    expect(m.run(plain, { a: 2 }, parents)).toStrictEqual(expected);
    return source;
  };

  it("COMPILE.MODULE.LIST.PLAIN COMPILE.MODULE.SHEET.LIST: a column of lists gives an array in each cell, with the results of SheetRun", () => {
    const tree: SheetModuleOptions = { ...OPTIONS, space: "tree", lists: "plain" };
    const direct = expectSameSheet(tree);
    expect(direct).toContain("function LCP(d, h) { for (let k = 0; k < d.length; k++) if (d[k] !== VEX_ERROR) d[k] = LP(d[k], h); return d; }");
    expect(direct).toContain('"pairs": LCP(DO(D[3]), 2)');
    expect(direct).not.toContain("vex.list");
    // A formula of a cell starts the search, and the columns stay plain.
    const search = expectSameSheet({ ...tree, cells: new Map([["head", new Map([["1", op("drop", xs, lit(1))]])]]) });
    expect(search).toContain('"head": LCP(SS.o(1), 0)');
    expect(sourceOf(emitSheetModule(columns, { ...tree, lists: "envelope" }))).toContain('"head": LC(DO(D[1]), 0)');
  });
});

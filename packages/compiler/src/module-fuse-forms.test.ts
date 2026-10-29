/**
 * The forms of the fusion of list ops in standalone modules (COMPILE.MODULE.FUSE). These tests examine which parts of
 * a program push their items into one output, and the facts of the lists (COMPILE.MODULE.FUSE.FACTS). Each program
 * also gives the values of the interpreter (P17).
 */
import { app, axes, call, cell, each, evaluate, fn, fold, isVexList, iterate, let_, lit, rec, ref, SheetRun, space, v, vexList, type CellFormulas, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, listFactsOf, type Emitted, type ListFacts, type ModuleOptions, type SheetModuleOptions } from "./module.ts";

const SCHEMA = { fields: { n: "number", w: "number", b: "boolean", xs: { list: "number" } }, vars: { t: "boolean" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };

type Run = (records: unknown, vars: unknown, parents?: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a module, and fails the test for a program that cannot be a module. */
function sourceOf(m: Emitted): string {
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function gives a list of the input, as plain data. An item with the value `undefined` is an error item. */
const input = (...values: (number | undefined)[]): object => ({
  kind: "vex.list",
  items: values.map((x, i) => (x === undefined ? { key: String(i), result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } } : { key: String(i), result: { ok: true, value: x } })),
});
/** The records of the tests. Two lists of `xs` have error items. */
const RECORDS = [
  { n: 3, w: 1, b: true, xs: input(3, 1, 2) },
  { n: -1, w: 0, b: false, xs: input(5, undefined, -1) },
  { n: 0, w: 2, b: true, xs: input() },
  { n: 2, w: -1, b: false, xs: input(undefined) },
];
const VARS = { t: true };

/**
 * This function compares the module of a program with the interpreter at each key (P17), with fuse true and with fuse
 * false. It gives the source of fuse true.
 */
function expectSame(e: Expr, options: ModuleOptions = OPTIONS): string {
  const s = space.array(RECORDS);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: options.domains ?? [] }));
  const sources = [true, false].map((fuse) => sourceOf(emitModule(e, { ...options, fuse })));
  for (const source of sources) {
    const m = make(source);
    const copy = structuredClone(RECORDS);
    expect(m.run(copy, VARS)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
    expect(copy).toStrictEqual(RECORDS);
  }
  return sources[0] as string;
}

/** This function gives the count of the fused outputs of a source: the arrays `o` of the chains and of the loops. */
const outputs = (source: string): number => source.match(/const o\d+ = \[\];/g)?.length ?? 0;

/** This function gives the facts of each list node of a program, and checks that the facts do not change the code. */
function factsOf(emit: () => Emitted): ReadonlyMap<Expr, ListFacts> {
  const { emitted, facts } = listFactsOf(emit);
  expect(sourceOf(emitted)).toBe(sourceOf(emit()));
  return facts;
}

/** This function gives the facts of one list node of a program. */
function factOf(e: Expr, node: Expr, options: ModuleOptions = OPTIONS): ListFacts {
  const f = factsOf(() => emitModule(e, options)).get(node);
  if (f === undefined) throw new Error("the node has no facts of a list");
  return f;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const xs = ref("xs");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const EMPTY = lit(vexList([]));
/** This function gives a list of one item: the list of `fill(1, x)`, which pushes its item into an output. */
const one = (x: Expr = n): Expr => op("fill", lit(1), x);
/** This function gives a list of two items: the list of `fill(2, x)`, which has an array of its own. */
const two = (x: Expr = n): Expr => op("fill", lit(2), x);
/** This function gives a sum of eight copies of `x`. Its work is more than the work of a column of the run. */
const heavy = (x: Expr): Expr => {
  const four = op("add", op("add", x, x), op("add", x, x));
  return op("add", four, four);
};

describe("COMPILE.MODULE.FUSE: the parts of a chain of append", () => {
  it("COMPILE.MODULE.FUSE: fill(1, x) with a costly value that reads the focus keeps its own array", () => {
    // The value can be a column of the run, so the loop reads its array.
    for (const value of [heavy(n), op("add", call("f"), lit(1))]) {
      const e = let_({ f: fn([], heavy(n)) }, op("append", one(value), two()));
      expect(outputs(expectSame(e))).toBe(0);
    }
    // A loop over a window reads the focus with no field.
    const count = op("count", each(axes.window(-1, 1), lit(1)));
    const steps = fold(axes.window(-1, 1), { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, v("s"));
    for (const x of [count, steps]) expect(outputs(expectSame(op("append", one(op("add", x, heavy(lit(1)))), two())))).toBe(0);
    // A value with less work pushes its item.
    expect(outputs(expectSame(op("append", one(op("add", n, lit(1))), two())))).toBe(1);
  });

  it("COMPILE.MODULE.FUSE: a part that has no form of a stage keeps the concat of two arrays", () => {
    const parts: readonly Expr[] = [op("flat", two(two())), op("sortBy", two()), op("without", two(), one()), op("append", two(), two())];
    for (const part of parts) expect({ part, outputs: outputs(expectSame(op("append", part, two()))) }).toStrictEqual({ part, outputs: 0 });
  });

  it("COMPILE.MODULE.FUSE: an append or an if with a part that pushes is a part of the chain", () => {
    // The inner append pushes, so the chain has one output.
    const nested = expectSame(op("append", op("append", one(), two()), two()));
    expect({ outputs: outputs(nested), concat: nested.includes(".concat(") }).toStrictEqual({ outputs: 1, concat: false });
    const branch = expectSame(op("append", op("if", ref("b"), one(), two()), two()));
    expect({ outputs: outputs(branch), concat: branch.includes(".concat(") }).toStrictEqual({ outputs: 1, concat: false });
    expect(outputs(expectSame(op("append", op("if", ref("b"), two(), one()), two())))).toBe(1);
    // An append that is a constant of the run keeps its own output, so the chain does not take it.
    expect(outputs(expectSame(op("append", op("append", one(lit(1)), two(lit(2))), two())))).toBe(1);
    // An if with no part that pushes keeps its arrays.
    expect(outputs(expectSame(op("append", op("if", ref("b"), two(), two(ref("w"))), two())))).toBe(0);
  });
});

describe("COMPILE.MODULE.FUSE: a chain of append in a sheet with a search", () => {
  /** The formulas of a cell make a search, so the sheet is not direct. */
  const cells: CellFormulas = new Map([["c", new Map([["0", lit(5)]])]]);
  const SHEET: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { n: "number" } }, cells };
  const records = [{ n: 1 }, { n: 2 }, { n: -3 }];

  /** This function compares the module of a sheet with `SheetRun`, and gives its source. */
  function expectSheet(column: Expr): string {
    const columns = new Map<string, Expr>([
      ["c", op("add", n, lit(1))],
      ["d", column],
    ]);
    const source = sourceOf(emitSheetModule(columns, SHEET));
    const m = make(source);
    const s = space.array(records);
    const sheet = new SheetRun(columns, { space: s, domains: [NumDomain], cells });
    const expected = Object.fromEntries(["c", "d"].map((c) => [c, s.keys.map((k) => {
      const r = sheet.cell(c, k);
      return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
    })]));
    expect(m.run(structuredClone(records), {})).toStrictEqual(expected);
    return source;
  }

  it("COMPILE.MODULE.FUSE COMPILE.MODULE.SHEET: an append that reads no cell fuses, and an append that can read a cell does not", () => {
    expect(outputs(expectSheet(op("count", op("append", one(), one(ref("n"))))))).toBe(1);
    expect(outputs(expectSheet(op("count", op("append", one(cell("c")), one()))))).toBe(0);
    expect(outputs(expectSheet(let_({ f: fn([], cell("c")) }, op("count", op("append", one(call("f")), one())))))).toBe(0);
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the counts of the reads", () => {
  /** This function gives the count of the reads of the list of the name `ys` in a body. */
  const reads = (body: Expr, list: Expr = one()): number => factOf(let_({ ys: list }, body), list).reads;
  const ys = v("ys");

  it("COMPILE.MODULE.FUSE.FACTS: a let in the body adds the reads of its bindings and of its body", () => {
    expect(reads(let_({ a: op("count", ys) }, op("add", v("a"), op("count", ys))))).toBe(2);
    expect(reads(rec({ a: op("count", ys) }))).toBe(1);
  });

  it("COMPILE.MODULE.FUSE.FACTS: a read in a step of a fold or of an iterate has no bound", () => {
    expect(reads(fold(axes.all, { s: lit(0) }, { s: op("add", v("s"), op("count", ys)) }, v("s")))).toBe(Infinity);
    expect(reads(iterate(2, { s: lit(0) }, { s: op("add", v("s"), op("count", ys)) }, v("s")))).toBe(Infinity);
    // The result of a loop evaluates once.
    expect(reads(iterate(2, { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, op("add", v("s"), op("count", ys))))).toBe(1);
    // The list of the result of a loop has the count of the reads of the loop.
    const list = two();
    const loop = iterate(2, { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, list);
    expect(factOf(let_({ zs: loop }, op("add", op("count", v("zs")), op("sum", v("zs")))), list).reads).toBe(2);
  });

  it("COMPILE.MODULE.FUSE.FACTS: a branch of if and of ifError has the count of its parent, and an argument of append has one read", () => {
    const [a, b] = [one(), two()];
    const both = op("add", op("count", ys), op("sum", ys));
    for (const list of [op("if", ref("b"), a, b), op("ifError", a, b)]) {
      const facts = factsOf(() => emitModule(let_({ ys: list }, both), OPTIONS));
      expect([facts.get(a)?.reads, facts.get(b)?.reads]).toStrictEqual([2, 2]);
    }
    const [c, d] = [two(), two(ref("w"))];
    const facts = factsOf(() => emitModule(let_({ ys: op("append", c, d) }, both), OPTIONS));
    expect([facts.get(c)?.reads, facts.get(d)?.reads]).toStrictEqual([1, 1]);
  });

  it("COMPILE.MODULE.FUSE.FACTS: the first values of a loop have no bound, and an append in a step, an each and a record read once", () => {
    const [a, b] = [one(), two()];
    for (const loop of [fold(axes.all, { acc: a }, { acc: op("append", v("acc"), b) }, op("count", v("acc"))), iterate(2, { acc: a }, { acc: op("append", v("acc"), b) }, op("count", v("acc")))]) {
      const facts = factsOf(() => emitModule(loop, OPTIONS));
      expect([facts.get(a)?.reads, facts.get(b)?.reads]).toStrictEqual([Infinity, 1]);
    }
    expect(factOf(op("sum", each(axes.all, op("count", a))), a).reads).toBe(1);
    expect(factOf(rec({ l: a }), a).reads).toBe(1);
  });

  it("COMPILE.MODULE.FUSE.FACTS SHEET.CELL: a read of a cell does not change the count of the reads", () => {
    const list = one();
    const columns = new Map<string, Expr>([["c", let_({ ys: list }, op("add", op("count", ys), cell("x")))]]);
    const facts = factsOf(() => emitSheetModule(columns, { domains: [NumDomain], schema: { fields: { n: "number" } }, kinds: { x: "number" } }));
    expect(facts.get(list)?.reads).toBe(1);
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the facts of the branches of if", () => {
  it("COMPILE.MODULE.FUSE.FACTS: an if of the empty list and another list is clean only when the other list is clean", () => {
    for (const [a, b] of [[EMPTY, xs], [xs, EMPTY]] as const) {
      const l = op("if", ref("b"), a, b);
      expect(factOf(op("count", l), l).clean).toBe(false);
      expectSame(op("count", l));
    }
    const l = op("if", ref("b"), EMPTY, two());
    expect(factOf(op("count", l), l)).toMatchObject({ clean: true, fresh: false });
  });

  it("COMPILE.MODULE.FUSE.FACTS: an if is fresh only when both branches are fresh", () => {
    const l = op("if", ref("b"), xs, two());
    expect(factOf(op("count", l), l).fresh).toBe(false);
    const both = op("if", ref("b"), two(), two(ref("w")));
    expect(factOf(op("count", both), both).fresh).toBe(true);
  });

  it("COMPILE.MODULE.FUSE.FACTS LIST.LITERAL: an if with a branch with text keys has text keys", () => {
    const LIT = lit(vexList([item("a", 1), item("b", 2)]));
    // The keys of a list of the input are texts too, so the other branch is a list with the keys of the records.
    const keyed = each(axes.window(-1, 1), n);
    for (const l of [op("if", ref("b"), keyed, LIT), op("if", ref("b"), LIT, keyed)]) {
      const reason = emitModule(each(axes.list(l), ref("w")), OPTIONS);
      expect(reason).toStrictEqual({ ok: false, reason: 'the axis "list" reads a record at a key of a literal or of "fill"' });
    }
  });

  it("COMPILE.MODULE.FUSE.FACTS: an if of a list and a value that is not a list gives a reason", () => {
    for (const l of [op("if", ref("b"), one(), lit(5)), op("if", ref("b"), lit(5), one())]) {
      expect(emitModule(op("count", l), OPTIONS)).toStrictEqual({ ok: false, reason: '"if" of a list and a value that is not a list' });
    }
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the clean names of a loop", () => {
  /** This function gives the fact clean of the read of the name `acc` in the result of a loop. */
  const cleanAcc = (step: Expr, first: Expr = two()): boolean => {
    const read = v("acc");
    const loop = iterate(2, { acc: first }, { acc: step }, op("count", read));
    expectSame(loop);
    return factOf(loop, read).clean;
  };

  it("COMPILE.MODULE.FUSE.FACTS LIST.BUILD: a step of a clean op keeps the name clean", () => {
    for (const step of [op("take", v("acc"), lit(1)), op("without", v("acc"), two()), op("sortBy", v("acc")), op("drop", v("acc"), lit(1))]) expect(cleanAcc(step)).toBe(true);
  });

  it("COMPILE.MODULE.FUSE.FACTS: a step of if or ifError is clean when each branch is clean", () => {
    expect(cleanAcc(op("if", ref("b"), v("acc"), two()))).toBe(true);
    expect(cleanAcc(op("ifError", v("acc"), two()))).toBe(true);
    expect(cleanAcc(op("if", ref("b"), v("acc"), xs))).toBe(false);
    expect(cleanAcc(op("if", ref("b"), xs, v("acc")))).toBe(false);
    expect(cleanAcc(op("ifError", xs, v("acc")))).toBe(false);
    // The first item of a list of lists can hold error items.
    expect(cleanAcc(op("first", op("fill", lit(2), v("acc"))))).toBe(false);
  });

  it("COMPILE.MODULE.FUSE.FACTS AXIS.LIST.ITEM: a name of an item of a fold in a step hides a clean name outside", () => {
    const lists = op("fill", lit(2), xs);
    const inner = fold(axes.list(lists), { z: v("acc") }, { z: op("if", v("t"), v("z"), v("y")) }, v("z"), undefined, ["y"]);
    expect(cleanAcc(let_({ y: two() }, inner))).toBe(false);
    // Without the name of the item, the fold reads the clean name outside.
    const outer = fold(axes.list(lists), { z: v("acc") }, { z: op("if", v("t"), v("z"), v("y")) }, v("z"));
    expect(cleanAcc(let_({ y: two() }, outer))).toBe(true);
  });

  it("COMPILE.MODULE.FUSE.FACTS: a name that reads a name that is not clean is not clean", () => {
    const read = v("a");
    const loop = iterate(2, { a: two(), b: two() }, { a: v("b"), b: xs }, op("count", read));
    expect(factOf(loop, read).clean).toBe(false);
    expectSame(loop);
  });

  it("COMPILE.MODULE.FUSE.FACTS AXIS.LIST.ITEM: a name of an item hides a clean name outside the fold", () => {
    const read = v("acc");
    const lists = op("fill", lit(2), xs);
    const loop = let_({ y: two() }, fold(axes.list(lists), { acc: two() }, { acc: op("if", v("t"), v("acc"), v("y")) }, op("count", read), undefined, ["y"]));
    expect(factOf(loop, read).clean).toBe(false);
    expectSame(loop);
  });

  it("COMPILE.MODULE.FUSE.FACTS LOOP.LIST: a step must fit the first list of its name", () => {
    const mixed = lit(vexList([item("a", 1), item("b", "x")]));
    expectSame(iterate(2, { acc: mixed }, { acc: one() }, op("count", v("acc"))));
    const reason = 'a step of a loop gives the name "acc" a list that does not fit its first list';
    expect(emitModule(iterate(2, { acc: mixed }, { acc: one(one()) }, op("count", v("acc"))), OPTIONS)).toStrictEqual({ ok: false, reason });
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the facts do not change the module", () => {
  it("COMPILE.MODULE.FUSE.FACTS FN.VALUE: a call of a name with a value, and a value that hides a function, give the same reason with the facts", () => {
    const programs = [let_({ f: one() }, op("count", call("f", two()))), let_({ f: fn(["l"], op("count", v("l"))) }, let_({ f: one() }, call("f", two())))];
    for (const e of programs) expect(listFactsOf(() => emitModule(e, OPTIONS)).emitted).toStrictEqual(emitModule(e, OPTIONS));
  });

  it("COMPILE.MODULE.FUSE: flat with no list gives the reason of flat", () => {
    const e = op("append", op("flat"), two());
    const m = emitModule(e, OPTIONS);
    expect(m.ok).toBe(false);
    expect(m.ok ? "" : m.reason).toMatch(/flat/);
  });
});

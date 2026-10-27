/**
 * Lists as the values of cells and of programs in standalone modules (COMPILE.MODULE.SHEET.LIST,
 * COMPILE.MODULE.LIST.RESULT). A column of a sheet module can hold a list, and a later formula reads it with the list
 * ops. The run gives each list as a `vex.list`, with `VEX_ERROR` for the error of an item.
 */
import { app, axes, cell, CELL_KIND, each, evaluate, ext, fold, isVexList, let_, lit, offset, ref, SheetRun, space, v, vexList, type CellFormulas, type Expr, type ListItem, type Space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions, type SheetModuleOptions } from "./module.ts";

type SheetRunFn = (records: unknown, vars: unknown, parents?: unknown) => Readonly<Record<string, readonly unknown[]>>;
interface Loaded {
  readonly run: SheetRunFn;
  readonly VEX_ERROR: unknown;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

const NUM: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number" } } };
const TREE: SheetModuleOptions = { ...NUM, space: "tree" };
const PARENT = { t: "parent" } as const;

/** This function gives the source of a sheet, and fails the test for a sheet that cannot be a module. */
function sheetSource(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions): string {
  const m = emitSheetModule(columns, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the reason that a sheet cannot be a module, or "" for a module. */
function sheetReason(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions): string {
  const m = emitSheetModule(columns, options);
  return m.ok ? "" : m.reason;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function programReason(e: Expr, options: ModuleOptions = NUM): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

/**
 * This function gives the value of the interpreter in the form of a module. An error is `VEX_ERROR`, and a list is a
 * `vex.list` whose error items have the error `VEX_ERROR`.
 */
function asModule(value: unknown, error: unknown): unknown {
  if (!isVexList(value)) return value;
  return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
}

/** This function gives a tree space of records and the parents of each record: the position of the parent, or -1. */
const treeOf = (records: readonly unknown[], parents: readonly number[]): Space =>
  space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));

/** This function compares the results of a module of a sheet with the results of `SheetRun` at each cell of each column. */
function expectSameSheet(m: Loaded, columns: ReadonlyMap<string, Expr>, records: readonly unknown[], parents: readonly number[] | undefined, cells: CellFormulas = new Map()): void {
  const s = parents === undefined ? space.array(records) : treeOf(records, parents);
  const names = [...new Set([...columns.keys(), ...cells.keys()])];
  const run = new SheetRun(columns, { space: s, domains: [NumDomain], cells });
  const expected = Object.fromEntries(names.map((c) => [c, s.keys.map((k) => {
    const r = run.cell(c, k);
    return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
  })]));
  expect(m.run(structuredClone(records), {}, parents)).toStrictEqual(expected);
}

/** This function compares the values of a module of a program with the interpreter at each key (P17). */
function expectSame(e: Expr, records: readonly unknown[], parents?: readonly number[]): void {
  const m = emitModule(e, parents === undefined ? NUM : { ...NUM, space: "tree" });
  if (!m.ok) throw new Error(m.reason);
  const loaded = make(m.source);
  const s = parents === undefined ? space.array(records) : treeOf(records, parents);
  const expected = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars: {}, domains: [NumDomain] });
    return r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR;
  });
  expect(loaded.run(structuredClone(records), {}, parents)).toStrictEqual(expected);
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
/** The records of the tests: the value 0 gives an error item in the list of `1 / v`. */
const RECORDS = [{ v: 4 }, { v: 1 }, { v: 0 }, { v: 3 }, { v: 2 }, { v: 5 }];
const PARENTS = [-1, 0, 0, 1, 1, -1];
const inv = op("divide", lit(1), ref("v"));

describe("COMPILE.MODULE.LIST.RESULT: a list as the value of a program", () => {
  it("COMPILE.MODULE.LIST.RESULT: the run gives a list as a vex.list, with VEX_ERROR for an error item, also for a list of lists and the empty list", () => {
    const programs: readonly Expr[] = [
      each(axes.window(-1, 1), ref("v")),
      each(axes.all, inv),
      lit(vexList([])),
      lit(vexList([item("a", 1), item("b", 2)])),
      op("take", op("sortBy", each(axes.all, ref("v"))), lit(2)),
      each(axes.window(-1, 0), each(axes.window(0, 1), inv)),
      let_({ xs: each(axes.others, ref("v")) }, op("drop", v("xs"), lit(1))),
      fold(axes.all, { l: lit(vexList([])) }, { l: op("append", v("l"), each(axes.window(0, 0), ref("v"))) }, v("l")),
    ];
    for (const e of programs) {
      expectSame(e, RECORDS);
      expectSame(e, []);
    }
    expectSame(each(axes.children, inv), RECORDS, PARENTS);
    // A list of the run is one array for each key, and each key gives its own vex.list.
    const m = emitModule(each(axes.all, ref("v")), NUM);
    expect(m.ok && m.source).toContain("out.push(LO(c");
    const loaded = make((m as { source: string }).source);
    const [first, second] = loaded.run([{ v: 1 }, { v: 0 }], {}) as unknown as unknown[];
    expect(first).toStrictEqual({ kind: "vex.list", items: [{ key: "0", result: { ok: true, value: 1 } }, { key: "1", result: { ok: true, value: 0 } }] });
    expect(first).not.toBe(second);
    expect(first).toStrictEqual(second);
    expect(isVexList(first)).toBe(true);
    // An error item has the error VEX_ERROR, as an error of a key has.
    const errors = make(sourceOf(each(axes.all, inv))).run([{ v: 0 }], {}) as unknown as unknown[];
    expect(errors).toStrictEqual([{ kind: "vex.list", items: [{ key: "0", result: { ok: false, error: loaded.VEX_ERROR } }] }]);
  });

  it("COMPILE.MODULE.LIST.RESULT COMPILE.MODULE.LIST.ARG: if and ifError take lists as branches, and a list in one branch gives a reason", () => {
    const xs = each(axes.all, ref("v"));
    const some = op("gt", ref("v"), lit(1));
    for (const e of [op("if", some, xs, each(axes.window(0, 0), inv)), op("ifError", op("take", xs, op("subtract", ref("v"), lit(2))), lit(vexList([]))), op("sum", op("if", some, xs, lit(vexList([])))), op("count", op("ifError", lit(vexList([])), xs))]) {
      expectSame(e, RECORDS);
    }
    // A list in an argument of add is the error of the interpreter, because add takes a number.
    expectSame(op("add", lit(1), op("take", xs, lit(1))), RECORDS);
    expectSame(op("add", lit(1), op("if", some, xs, xs)), RECORDS);
    expect(programReason(op("if", some, xs, lit(1)))).toBe('"if" of a list and a value that is not a list');
    // A first value that cannot fail is the value of ifError, so the second value does not decide the kind.
    expectSame(op("sum", op("ifError", xs, lit(1))), RECORDS);
    expect(programReason(op("sum", op("ifError", op("take", xs, ref("v")), lit(1))))).toBe('"ifError" of a list and a value that is not a list');
    expect(programReason(op("sum", op("ifError", lit(1), xs)))).toBe("a list op on a value that is not a list");
    expect(programReason(op("count", op("if", some, xs, each(axes.all, xs))))).toBe('"if" of a list of lists and a list of values');
  });
});

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr): string {
  const m = emitModule(e, NUM);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/**
 * The shapes of a tree as a sheet: the shape of a node is the values of its own record and the shapes of its children
 * after it. The column reads itself at the children, so its kind is in the options. The other columns read the shapes.
 */
const SHAPES = new Map<string, Expr>([
  ["shape", op("append", each(axes.window(0, 0), inv), op("flat", each(axes.children, cell("shape"))))],
  ["total", op("sum", cell("shape"))],
  ["size", op("count", cell("shape"))],
  ["own", each(axes.window(0, 0), inv)],
  ["strict", op("sum", cell("own"), lit({ strict: true }))],
  ["scaled", op("sum", each(axes.list(cell("shape")), op("multiply", ref("v"), lit(2))))],
  ["top", op("first", op("sortBy", cell("shape")))],
  ["kids", each(axes.children, cell("total"))],
]);
const SHAPE_KINDS = { shape: { list: "number" } } as const;

describe("COMPILE.MODULE.SHEET.LIST: a column of lists", () => {
  it("COMPILE.MODULE.SHEET.LIST: a column holds a list, the later columns read it with list ops, and the run gives the results of SheetRun", () => {
    const source = sheetSource(SHAPES, { ...TREE, kinds: SHAPE_KINDS });
    // Each read reads a finished cell, so the fill has no search.
    expect(source).toContain("function DO(");
    expect(source).not.toContain("function SH(");
    expect(source).toContain('"shape": LC(DO(D[0]), 0)');
    expect(source).toContain('"kids": LC(DO(D[7]), 0)');
    const m = make(source);
    expectSameSheet(m, SHAPES, RECORDS, PARENTS);
    expectSameSheet(m, SHAPES, [], []);
    expectSameSheet(m, SHAPES, RECORDS.map((r) => ({ v: r.v + 1 })), [-1, 0, 1, 2, 3, 4]);
    const out = m.run(RECORDS, {}, PARENTS);
    // append skips the error item of the key 2, so the shapes have no error items. A sum with strict gives the error
    // of an error item.
    expect(out["total"]).toStrictEqual([0.25 + 1 + 1 / 3 + 0.5, 1 + 1 / 3 + 0.5, 0, 1 / 3, 0.5, 0.2]);
    expect(out["size"]).toStrictEqual([4, 3, 0, 1, 1, 1]);
    expect(out["strict"]).toStrictEqual([0.25, 1, m.VEX_ERROR, 1 / 3, 0.5, 0.2]);
    expect(out["own"]?.[2]).toStrictEqual({ kind: "vex.list", items: [{ key: "2", result: { ok: false, error: m.VEX_ERROR } }] });
  });

  it("COMPILE.MODULE.SHEET.LIST: a column of lists in a run with the search, and in cells with their own formulas", () => {
    // The column up reads itself at the parent, which a fill after the children has not finished, so the run searches.
    const columns = new Map<string, Expr>([
      ["down", op("append", each(axes.window(0, 0), ref("v")), op("flat", each(axes.children, cell("down"))))],
      ["up", op("ifError", op("append", cell("up", [PARENT]), each(axes.window(0, 0), ref("v"))), lit(vexList([])))],
      ["count", op("add", op("count", cell("down")), op("count", cell("up")))],
    ]);
    const cells: CellFormulas = new Map([["down", new Map<string, Expr>([["1", lit(vexList([]))], ["2", each(axes.siblings, inv)]])]]);
    const options = { ...TREE, kinds: { down: { list: "number" }, up: { list: "number" } } } as const;
    const source = sheetSource(columns, { ...options, cells });
    expect(source).toContain("function SH(");
    expect(source).toContain('"down": LC(SS.o(0), 0)');
    const m = make(source);
    expectSameSheet(m, columns, RECORDS, PARENTS, cells);
    expectSameSheet(make(sheetSource(columns, options)), columns, RECORDS, PARENTS);
  });

  it("COMPILE.MODULE.SHEET.LIST: a column of lists of lists, a list over an array and a column whose kind comes from its formula", () => {
    const columns = new Map<string, Expr>([
      ["near", each(axes.window(-1, 1), each(axes.window(0, 1), inv))],
      ["flat", op("flat", cell("near"))],
      ["sums", each(axes.list(cell("flat")), op("sum", each(axes.window(-1, 0), ref("v"))))],
      ["at", op("nth", cell("sums", [offset(-1)]), lit(0))],
    ]);
    const source = sheetSource(columns, NUM);
    expect(source).toContain('"near": LC(DO(D[0]), 1)');
    expectSameSheet(make(source), columns, RECORDS, undefined);
    // The kind of a column of lists of lists in the options.
    const own = new Map<string, Expr>([["grow", op("append", op("ifError", cell("grow", [offset(-1)]), lit(vexList([]))), each(axes.window(0, 0), each(axes.window(0, 0), ref("v"))))]]);
    const grown = sheetSource(own, { ...NUM, kinds: { grow: { list: { list: "number" } } } });
    expectSameSheet(make(grown), own, RECORDS, undefined);
  });

  it("COMPILE.MODULE.SHEET.LIST: a list that does not fit its column, a list as the receiver of an op and a column without its kind give a reason", () => {
    const xs = each(axes.all, ref("v"));
    // A column that reads itself needs its kind, also a column of lists.
    expect(sheetReason(SHAPES, TREE)).toBe('a formula reads the column "shape" before its formula, so the column needs its kind in the option kinds');
    // A list of the wrong kind, a list in a column of numbers and a number in a column of lists.
    expect(sheetReason(new Map([["a", xs]]), { ...NUM, kinds: { a: { list: "boolean" } } })).toBe('the formula of the column "a" gives a value of the kind list of number, not of the kind list of boolean of its column');
    expect(sheetReason(new Map([["a", xs]]), { ...NUM, kinds: { a: "number" } })).toBe('the formula of the column "a" gives a value of the kind list of number, not of the kind number of its column');
    expect(sheetReason(new Map([["a", ref("v")]]), { ...NUM, kinds: { a: { list: "number" } } })).toBe('the formula of the column "a" gives a value of the kind number, not of the kind list of number of its column');
    expect(sheetReason(new Map([["a", each(axes.all, xs)]]), { ...NUM, kinds: { a: { list: "number" } } })).toBe('the formula of the column "a" gives a value of the kind list of list of number, not of the kind list of number of its column');
    // A list literal with keys of text needs `texts` in its kind, and the axis list over such a column gives a reason.
    const keyed = lit(vexList([item("a", 1)]));
    expect(sheetReason(new Map([["a", keyed]]), { ...NUM, kinds: { a: { list: "number" } } })).toBe('the formula of the column "a" gives a value of the kind list of number, not of the kind list of number of its column');
    expect(sheetReason(new Map([["a", keyed]]), { ...NUM, kinds: { a: { list: "number", texts: true } } })).toBe("");
    expect(sheetReason(new Map([["a", keyed], ["b", op("sum", each(axes.list(cell("a")), ref("v")))]]), NUM)).toBe('the axis "list" over a list with the keys of a literal');
    // A cell formula must fit the list of the first formula of its column.
    const cells: CellFormulas = new Map([["a", new Map<string, Expr>([["0", each(axes.all, op("gt", ref("v"), lit(0)))]])]]);
    expect(sheetReason(new Map([["a", xs]]), { ...NUM, cells })).toBe('the formula of the cell "a" at "0" gives a value of the kind list of boolean, not of the kind list of number of its column');
    // A list is not the receiver of an op, and a column of lists from an empty literal has items without a kind.
    expect(sheetReason(new Map([["a", xs], ["b", op("add", cell("a"), lit(1))]]), NUM)).toBe('a list as the receiver of the op "add"');
    // A list after the receiver is an argument (COMPILE.MODULE.LIST.ARG). add takes a number, so each cell has the error.
    const arg = new Map([["a", xs], ["b", op("add", lit(1), cell("a"))]]);
    expectSameSheet(make(sheetSource(arg, NUM)), arg, RECORDS, undefined);
    expect(sheetReason(new Map([["a", lit(vexList([]))], ["b", op("sum", cell("a"))]]), NUM)).toBe("");
    // An extension that is not a read of a cell is not a list.
    expect(sheetReason(new Map([["b", op("sum", ext("note", null))]]), NUM)).toBe('the extension "note"');
    expect(sheetReason(new Map([["b", op("sum", ext(CELL_KIND, { column: 5 }))]]), NUM)).toBe('the kinds of the values of "sum" do not decide its op');
    expect(programReason(op("sum", ext("note", null)))).toBe('the extension "note"');
  });

  it("COMPILE.MODULE.SHEET.LIST: a read of a column of lists that the sheet does not have gives the error of SheetRun", () => {
    const columns = new Map<string, Expr>([["b", op("ifError", op("sum", cell("gone")), lit(-1))], ["c", op("count", cell("gone"))]]);
    const source = sheetSource(columns, { ...NUM, kinds: { gone: { list: "number" } } });
    const m = make(source);
    expectSameSheet(m, columns, RECORDS, undefined);
    expect(m.run(RECORDS.slice(0, 2), {})).toStrictEqual({ b: [-1, -1], c: [m.VEX_ERROR, m.VEX_ERROR] });
  });
});

/** The parts of a random formula of a list over an array or a tree. */
interface ListGen {
  readonly axes: readonly Parameters<typeof each>[0][];
  /** The reads of the list column `L` itself, or none in a program. */
  readonly own: readonly Expr[];
  /** The reads of the number column `A`, or none in a program. */
  readonly nums: readonly Expr[];
}

/** A random list: an axis, the list ops that build lists, a branch of if, a list literal and the reads of `L`. */
const listOf = (g: ListGen): fc.Arbitrary<Expr> => {
  const num = fc.constantFrom(ref("v"), inv, op("subtract", ref("v"), lit(2)), ...g.nums);
  return fc.letrec<{ list: Expr }>((tie) => ({
    list: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      { arbitrary: fc.tuple(fc.constantFrom(...g.axes), num).map(([a, body]) => each(a, body)), weight: 4 },
      fc.constant(lit(vexList([]))),
      ...(g.own.length === 0 ? [] : [{ arbitrary: fc.constantFrom(...g.own), weight: 3 }]),
      fc.tuple(tie("list"), tie("list"), fc.boolean()).map(([a, b, strict]) => op("append", a, b, ...(strict ? [lit({ strict: true })] : []))),
      fc.tuple(tie("list"), tie("list")).map(([a, b]) => op("without", a, b)),
      fc.tuple(tie("list"), fc.integer({ min: 0, max: 3 })).map(([a, k]) => op("take", op("sortBy", a), lit(k))),
      fc.tuple(tie("list"), fc.integer({ min: 0, max: 2 })).map(([a, k]) => op("drop", a, lit(k))),
      fc.tuple(tie("list"), tie("list")).map(([a, b]) => op("if", op("gt", ref("v"), lit(1)), a, b)),
      fc.tuple(tie("list"), tie("list")).map(([a, b]) => op("ifError", a, b)),
      fc.tuple(tie("list"), num).map(([a, body]) => each(axes.list(a), body)),
      fc.tuple(fc.constantFrom(...g.axes), tie("list")).map(([a, body]) => op("flat", each(a, body))),
    ),
  })).list;
};

/** A random number from a list: the list ops that give a value, `get`, `indexOf` and the axis list. */
const fromList = (list: fc.Arbitrary<Expr>): fc.Arbitrary<Expr> =>
  fc.oneof(
    fc.tuple(fc.constantFrom("sum", "count", "max", "mean", "first"), list, fc.boolean()).map(([o, l, strict]) => op(o, l, ...(strict ? [lit({ strict: true })] : []))),
    fc.tuple(list, fc.integer({ min: 0, max: 2 })).map(([l, k]) => op("nth", l, lit(k))),
    fc.tuple(list, fc.constantFrom("0", "1", "2")).map(([l, k]) => op("get", l, lit(k))),
    fc.tuple(list, fc.integer({ min: -1, max: 3 })).map(([l, x]) => op("indexOf", l, lit(x))),
    list.map((l) => op("sum", each(axes.list(l), op("multiply", ref("v"), lit(2))))),
  );

const ARRAY_AXES = [axes.all, axes.others, axes.window(-1, 0), axes.window(-1, 1), axes.reverse(axes.all)];
const TREE_AXES = [axes.children, axes.siblings, axes.window(-1, 1), axes.ancestors, axes.reverse(axes.children), axes.where(axes.children, op("gt", ref("v"), lit(0)))];

/**
 * A random sheet with lists: the number column `A`, the list column `L`, the column `M` of a number from the lists and
 * the list column `N` that reads `L` and `M`. Some reads of `L` read finished cells, and others start the search.
 */
const listSheet = (tree: boolean): fc.Arbitrary<ReadonlyMap<string, Expr>> => {
  const ats = tree ? [[], [PARENT]] : [[], [offset(-1)], [offset(1)]];
  // A read of the siblings is not a read of a finished cell, so its module has the search, and siblings can make a cycle.
  const own = tree ? [op("flat", each(axes.children, cell("L"))), op("ifError", cell("L", [PARENT]), lit(vexList([]))), cell("L", [PARENT]), op("flat", each(axes.siblings, cell("L")))] : [op("ifError", cell("L", [offset(-1)]), lit(vexList([]))), cell("L", [offset(1)])];
  const g: ListGen = { axes: tree ? TREE_AXES : ARRAY_AXES, own, nums: [cell("A"), op("ifError", cell("A", [tree ? PARENT : offset(-1)]), lit(0))] };
  const reads = fc.constantFrom(...ats).map((at) => cell("L", at));
  return fc
    .record({ a: fc.constantFrom(ref("v"), inv, op("add", ref("v"), lit(1))), l: listOf(g), m: fromList(fc.oneof(reads, listOf({ ...g, own: [cell("L")] }))), n: listOf({ ...g, own: [cell("L")], nums: [cell("M"), cell("A")] }) })
    .map(({ a, l, m, n }) => new Map([["A", a], ["L", l], ["M", m], ["N", n]]));
};

const LIST_KINDS = { A: "number", L: { list: "number" }, M: "number", N: { list: "number" } } as const;
const rows = fc.array(fc.record({ v: fc.integer({ min: -1, max: 3 }) }), { minLength: 0, maxLength: 6 });
/** A random tree: each key has a parent among the keys before it, or no parent. */
const trees = rows.chain((rs) => fc.tuple(fc.constant(rs), fc.tuple(...rs.map((_r, i) => fc.integer({ min: -1, max: i - 1 })))));

/** This function checks one random sheet with lists, and it tells if its module has the search and if a list has an error item. */
function checkListSheet(columns: ReadonlyMap<string, Expr>, records: readonly unknown[], parents: readonly number[] | undefined): { readonly search: boolean; readonly errorItem: boolean } {
  const m = emitSheetModule(columns, { ...(parents === undefined ? NUM : TREE), kinds: LIST_KINDS });
  // A random sheet can give a reason, for example a list of lists in the list column.
  if (!m.ok) return { search: false, errorItem: false };
  const loaded = make(m.source);
  expectSameSheet(loaded, columns, records, parents);
  const out = loaded.run(structuredClone(records), {}, parents);
  // An error item has the error VEX_ERROR, so its list is not a list of isVexList.
  const errorItem = [...(out["L"] ?? []), ...(out["N"] ?? [])].some((x) => (x as { readonly items?: readonly ListItem[] }).items?.some((y) => !y.result.ok) === true);
  return { search: m.source.includes("function SH("), errorItem };
}

/** A random program whose value is a list, with no read of a cell. */
const programs = (tree: boolean): fc.Arbitrary<Expr> => listOf({ axes: tree ? TREE_AXES : ARRAY_AXES, own: [], nums: [] });

describe("COMPILE.MODULE.SHEET.LIST P17: random sheets with lists", { timeout: 60_000 }, () => {
  it("P17 COMPILE.MODULE.SHEET.LIST: a module of a random sheet with lists over an array or a tree gives the results of SheetRun", () => {
    fc.assert(fc.property(listSheet(false), rows, (columns, rs) => void checkListSheet(columns, rs, undefined)), { numRuns: 150 });
    fc.assert(fc.property(listSheet(true), trees, (columns, [rs, parents]) => void checkListSheet(columns, rs, parents)), { numRuns: 150 });
    // A fixed sample has many modules, with and without the search, and many lists with error items.
    for (const tree of [false, true]) {
      const sample = fc.sample(fc.tuple(listSheet(tree), trees), { seed: 20261026, numRuns: 200 });
      const checked = sample.map(([columns, [rs, parents]]) => ({ ok: emitSheetModule(columns, { ...(tree ? TREE : NUM), kinds: LIST_KINDS }).ok, ...checkListSheet(columns, rs, tree ? parents : undefined) }));
      expect(checked.filter((x) => x.ok).length).toBeGreaterThan(150);
      expect(checked.filter((x) => x.ok && x.search).length).toBeGreaterThan(15);
      expect(checked.filter((x) => x.ok && !x.search).length).toBeGreaterThan(30);
      expect(checked.filter((x) => x.errorItem).length).toBeGreaterThan(10);
    }
  });

  it("P17 COMPILE.MODULE.LIST.RESULT: a module of a random program whose value is a list gives the values of the interpreter", () => {
    fc.assert(fc.property(programs(false), rows, (e, rs) => {
      expectSame(e, rs);
    }), { numRuns: 150 });
    fc.assert(fc.property(programs(true), trees, (e, [rs, parents]) => {
      expectSame(e, rs, parents);
    }), { numRuns: 150 });
  });
});

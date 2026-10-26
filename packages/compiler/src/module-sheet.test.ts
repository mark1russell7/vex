/**
 * Sheets in standalone modules (COMPILE.MODULE.SHEET). A module of a sheet gives the result of `SheetRun` at each cell:
 * the value, or `VEX_ERROR` for an error of Vex. This is also true for each cell on a cycle and with each budget of the
 * stack. The run fills the columns in the order of `SheetRun.fill`.
 */
import { app, axes, call, cell, each, ext, fn, fold, index, iterate, let_, lit, offset, rec, ref, SheetRun, space, v, type Axis, type CellFormulas, type Expr, type FixedMove, type Space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { arbSheet, sheetCellsOf, sheetColumnsOf } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitSheetModule, type SheetModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, parents?: unknown) => Readonly<Record<string, readonly unknown[]>>;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new (m: string) => Error;
}

/** This function makes the module of a source with `new Function`, for the many sheets of a property. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR, VexContractError };`)() as Loaded;
}

/** This function gives the source of a sheet, and fails the test for a sheet that cannot be a module. */
function sourceOf(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions = NUM): string {
  const m = emitSheetModule(columns, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the reason that a sheet cannot be a module, or "" for a module. */
function reasonOf(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions = NUM): string {
  const m = emitSheetModule(columns, options);
  return m.ok ? "" : m.reason;
}

const PARENT = { t: "parent" } as const;
const COLUMNS = ["A", "B", "C"] as const;
const KINDS = { A: "number", B: "number", C: "number" } as const;
const NUM: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number" } }, kinds: KINDS };
const TREE: SheetModuleOptions = { ...NUM, space: "tree" };

/** This function gives a tree space of records and the parents of each record: the position of the parent, or -1. */
const treeOf = (records: readonly unknown[], parents: readonly number[]): Space =>
  space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));

/**
 * This function compares the results of a module with the results of `SheetRun` at each cell of each column, with the
 * budget of the stack of the module. A run with a fill gives the same results (SHEET.FILL).
 */
function expectSame(m: Loaded, columns: ReadonlyMap<string, Expr>, records: readonly unknown[], parents: readonly number[] | undefined, cells: CellFormulas = new Map(), budget?: number): void {
  const s = parents === undefined ? space.array(records) : treeOf(records, parents);
  const names = [...new Set([...columns.keys(), ...cells.keys()])];
  const run = new SheetRun(columns, { space: s, domains: [NumDomain], cells }, budget);
  const expected = Object.fromEntries(names.map((c) => [c, s.keys.map((k) => {
    const r = run.cell(c, k);
    return r.ok ? r.value : m.VEX_ERROR;
  })]));
  expect(m.run(structuredClone(records), {}, parents)).toStrictEqual(expected);
  const filled = new SheetRun(columns, { space: s, domains: [NumDomain], cells }, budget);
  filled.fill();
  expect(Object.fromEntries(names.map((c) => [c, s.keys.map((k) => {
    const r = filled.cell(c, k);
    return r.ok ? r.value : m.VEX_ERROR;
  })]))).toStrictEqual(expected);
}

/** The engine of ireko as a sheet: the size of each box from its children, and its place from its parent and its siblings. */
const ENGINE = new Map<string, Expr>([
  // The size: the own width plus the sizes of the children and a gap of 2 between them.
  ["size", app("add", ref("v"), app("sum", each(axes.children, app("add", cell("size"), lit(2)))))],
  // The place: the place of the parent, plus the sizes of the siblings before the box. A root starts at 0.
  ["x", app("ifError", app("add", cell("x", [PARENT]), fold(axes.window(-9, -1), { s: lit(0) }, { s: app("add", v("s"), cell("size")) }, v("s"))), lit(0))],
]);
const ENGINE_RECORDS = [{ v: 4 }, { v: 1 }, { v: 2 }, { v: 3 }, { v: 1 }, { v: 5 }];
const ENGINE_PARENTS = [-1, 0, 0, 1, 1, -1];

describe("COMPILE.MODULE.SHEET: a module of a sheet", () => {
  it("COMPILE.MODULE.SHEET: the engine of ireko as a module gives the results of SheetRun, and a column without its kind gives a reason", async () => {
    const source = sourceOf(ENGINE, { ...TREE, kinds: { size: "number", x: "number" } });
    await expect(source).toMatchFileSnapshot("__golden__/module-sheet.js");
    // Each read of the engine reads a finished cell, so its fill has no search (COMPILE.MODULE.SHEET.DIRECT). A read of
    // the next sibling can read a cell that is not finished, so that sheet keeps the search.
    expect(isDirect(source)).toBe(true);
    const next = new Map([...ENGINE, ["next", app("ifError", cell("next", [offset(1)]), ref("v"))]]);
    const search = sourceOf(next, { ...TREE, kinds: { size: "number", x: "number", next: "number" } });
    await expect(search).toMatchFileSnapshot("__golden__/module-sheet-search.js");
    expect(isDirect(search)).toBe(false);
    expectSame(make(search), next, ENGINE_RECORDS, ENGINE_PARENTS);
    const m = make(source);
    expectSame(m, ENGINE, ENGINE_RECORDS, ENGINE_PARENTS);
    expect(m.run(ENGINE_RECORDS, {}, ENGINE_PARENTS)).toStrictEqual({ size: [19, 9, 2, 3, 1, 5], x: [0, 0, 9, 0, 3, 0] });
    // The column size reads itself, so its kind must be in the options. The kind of the column x comes from its formula.
    expect(reasonOf(ENGINE, { ...TREE, kinds: {} })).toBe('a formula reads the column "size" before its formula, so the column needs its kind in the option kinds');
    expect(reasonOf(ENGINE, { ...TREE, kinds: { size: "number" } })).toBe('a formula reads the column "x" before its formula, so the column needs its kind in the option kinds');
    expect(reasonOf(new Map([...ENGINE, ["flag", ref("v")]]), { ...TREE, kinds: { size: "number", x: "number", flag: "boolean" } })).toBe('the formula of the column "flag" gives a value of the kind number, not of the kind boolean of its column');
    expect(reasonOf(new Map([...ENGINE, ["twice", app("multiply", cell("size"), lit(2))], ["half", app("divide", cell("twice"), lit(4))]]), { ...TREE, kinds: { size: "number", x: "number" } })).toBe("");
  });

  it("COMPILE.MODULE.SHEET: the run fills each column after the columns that it reads, in the order of its reads from itself", () => {
    // An array: a read of the row before keeps the key order, and a read of the row after reverses it.
    const columns = new Map<string, Expr>([
      ["late", app("add", cell("early"), app("ifError", cell("late", [offset(1)]), lit(0)))],
      ["early", app("add", ref("v"), app("ifError", cell("early", [offset(-1)]), lit(0)))],
      ["both", app("add", app("ifError", cell("both", [offset(-1)]), lit(0)), app("ifError", cell("both", [offset(2)]), lit(0)))],
    ]);
    const source = sourceOf(columns, { ...NUM, kinds: { late: "number", early: "number", both: "number" } });
    expect(source).toContain(["for (let o = 0; o < n; o++) SS.f(1, o);", "for (let o = 0; o < n; o++) SS.f(2, o);", "for (let o = n - 1; o >= 0; o--) SS.f(0, o);"].join("\n  "));
    expectSame(make(source), columns, ENGINE_RECORDS, undefined);
    // The list of an axis list and the init of a fold evaluate at the node, so the columns that they read come first.
    const atNode = new Map<string, Expr>([
      ["listed", app("count", each(axes.list(each(axes.others, cell("src"))), lit(1)))],
      ["folded", fold(axes.others, { s: cell("src", [offset(0)]) }, { s: app("add", v("s"), lit(1)) }, v("s"))],
      ["src", ref("v")],
    ]);
    const atNodeSource = sourceOf(atNode, NUM);
    // Each read of this sheet reads a finished cell, so the fill has no search (COMPILE.MODULE.SHEET.DIRECT).
    expect(atNodeSource).toMatch(/for \(let o = 0; o < n; o\+\+\) D\[2\]\[o\] = cf\d+\(o\);\n {2}for \(let o = 0; o < n; o\+\+\) D\[0\]\[o\] = cf\d+\(o\);\n {2}for \(let o = 0; o < n; o\+\+\) D\[1\]\[o\] = cf\d+\(o\);/);
    expectSame(make(atNodeSource), atNode, ENGINE_RECORDS, undefined);
    // A tree: a read of the children puts them first, and a read of the sibling after reverses the siblings.
    const tree = new Map<string, Expr>([
      ["down", app("sum", each(axes.children, cell("down")))],
      ["up", app("ifError", cell("up", [PARENT]), lit(1))],
      ["next", app("ifError", cell("next", [offset(1)]), ref("v"))],
      ["prev", app("ifError", cell("prev", [offset(-1)]), ref("v"))],
      ["deep", app("count", each(axes.reverse(axes.descendants), cell("deep")))],
      ["mixed", app("add", app("sum", each(axes.children, cell("mixed"))), app("ifError", cell("mixed", [offset(1)]), lit(0)))],
    ]);
    const kinds = Object.fromEntries([...tree.keys()].map((c) => [c, "number" as const]));
    const treeSource = sourceOf(tree, { ...TREE, kinds });
    for (const [order, at] of [["true, true", 0], ["false, false", 1], ["false, true", 2], ["false, false", 3], ["true, true", 4], ["true, false", 5]] as const) {
      const line = treeSource.split("\n").find((l) => l.endsWith(`SS.f(${String(at)}, o);`)) ?? "";
      const name = /of (K\d+)\)/.exec(line)?.[1] ?? "";
      expect(treeSource).toContain(`const ${name} = KO(H, RT, ${order});`);
    }
    for (const parents of [ENGINE_PARENTS, [-1, 0, 1, 2, 3, 4], [-1, -1, -1, 0, 0, 0], [3, 3, 3, -1, 3, 4]]) expectSame(make(treeSource), tree, ENGINE_RECORDS, parents);
  });

  it("COMPILE.MODULE.SHEET: each cell on a cycle gives VEX_ERROR, also behind ifError, and a cell that reads a cycle can catch its error", () => {
    const columns = new Map<string, Expr>([
      ["a", app("ifError", cell("b"), lit(1))],
      ["b", app("ifError", cell("a"), lit(2))],
      ["self", app("ifError", cell("self"), lit(3))],
      ["out", app("add", app("ifError", cell("a"), lit(10)), ref("v"))],
      // The error of an argument does not stop the reads of the next arguments, as in the interpreter: the column joins
      // the cycle of its second argument.
      ["join", app("add", app("divide", lit(1), lit(0)), cell("ring"))],
      ["ring", app("ifError", cell("join"), lit(4))],
    ]);
    const kinds = Object.fromEntries([...columns.keys()].map((c) => [c, "number" as const]));
    const m = make(sourceOf(columns, { ...NUM, kinds }));
    const E = m.VEX_ERROR;
    const records = [{ v: 1 }, { v: 2 }];
    expect(m.run(records, {})).toStrictEqual({ a: [E, E], b: [E, E], self: [E, E], out: [11, 12], join: [E, E], ring: [E, E] });
    for (const budget of [undefined, 0, 1, 40]) expectSame(make(sourceOf(columns, { ...NUM, kinds, ...(budget === undefined ? {} : { budget }) })), columns, records, undefined, new Map(), budget);
  });

  it("V-063 COMPILE.MODULE.SHEET SHEET.CYCLE: a count whose safe body reads a cell keeps its loop, so a cell that reads itself gives VEX_ERROR", () => {
    // The shrunk counterexample of P17 (seed 1824510466). The cell A at "0" counts the items of an axis, and each item
    // reads A at that item behind ifError. Before the fix, the module gave the count of the records and read no cell.
    const columns = new Map<string, Expr>([
      ["A", cell("A")],
      ["B", app("ifError", app("nth", each(axes.others, cell("A")), lit(0)), cell("A"))],
    ]);
    const cells: CellFormulas = new Map([["A", new Map([["0", app("count", each(axes.reverse(axes.all), app("ifError", cell("A"), lit(0))))]])]]);
    for (const budget of [undefined, 1, 40]) {
      const m = make(sourceOf(columns, { ...NUM, cells, ...(budget === undefined ? {} : { budget }) }));
      expect(m.run([{ v: 0 }], {})).toStrictEqual({ A: [m.VEX_ERROR], B: [m.VEX_ERROR] });
      expectSame(m, columns, [{ v: 0 }], undefined, cells, budget);
    }
    // A count that reads another column gives the count, and a count that reads no cell is the count of the records.
    const other = new Map<string, Expr>([["src", ref("v")], ["n", app("count", each(axes.all, app("ifError", cell("src"), lit(0))))], ["plain", app("count", each(axes.all, lit(1)))]]);
    const source = sourceOf(other, { ...NUM, kinds: { src: "number", n: "number", plain: "number" } });
    expect(source).toContain("const cf2 = (o) => n;");
    const m = make(source);
    expect(m.run(ENGINE_RECORDS, {})).toStrictEqual({ src: [4, 1, 2, 3, 1, 5], n: [6, 6, 6, 6, 6, 6], plain: [6, 6, 6, 6, 6, 6] });
    expectSame(m, other, ENGINE_RECORDS, undefined);
  });

  it("COMPILE.MODULE.SHEET SHEET.DEEP: a read of a cell that is not finished starts the search, and a chain of 100000 cells gives its results", () => {
    // The column a reads b at the same row, and b reads a at the next row. The order of the columns is a cycle, so the
    // fill of a reads cells that are not finished, and the search follows the chain to the end of the rows.
    const columns = new Map<string, Expr>([
      ["a", app("add", cell("b"), lit(1))],
      ["b", app("ifError", cell("a", [offset(1)]), ref("v"))],
    ]);
    const m = make(sourceOf(columns, { ...NUM, kinds: { a: "number", b: "number" } }));
    const records = Array.from({ length: 100_000 }, () => ({ v: 1 }));
    const out = m.run(records, {});
    expect(out["a"]?.[0]).toBe(100_001);
    expect(out["b"]?.at(-1)).toBe(1);
    expectSame(m, columns, records.slice(0, 50), undefined, new Map(), 40);
    // A roll-up from the root of a chain of 100000 levels needs no search: the fill puts the children first.
    const total = new Map<string, Expr>([["t", app("add", ref("v"), app("sum", each(axes.children, cell("t")), lit({ strict: true })))]]);
    const chain = make(sourceOf(total, { ...TREE, kinds: { t: "number" } }));
    expect(chain.run(records, {}, records.map((_r, i) => i - 1))["t"]?.[0]).toBe(100_000);
  });

  it("COMPILE.MODULE.SHEET SHEET.CELL.FORMULA: a cell with its own formula replaces the formula of its column at its key", () => {
    const columns = new Map<string, Expr>([["left", app("add", cell("left", [offset(-1)]), ref("v", [offset(-1)]))]]);
    const cells: CellFormulas = new Map([
      ["left", new Map<string, Expr>([["0", lit(0)], ["x", lit(5)], ["07", lit(5)]])],
      ["only", new Map<string, Expr>([["1", app("multiply", cell("left"), lit(2))]])],
    ]);
    const source = sourceOf(columns, { ...NUM, cells, kinds: { left: "number" } });
    expect(source).toMatch(/SH\(n, \[\[cf\d+, 22\], undefined\], \[\{ 0: \[cf\d+, 19\] \}, \{ 1: \[cf\d+, 22\] \}\], 3000\)/);
    const m = make(source);
    expect(m.run(ENGINE_RECORDS, {})).toStrictEqual({ left: [0, 4, 5, 7, 10, 11], only: [m.VEX_ERROR, 8, m.VEX_ERROR, m.VEX_ERROR, m.VEX_ERROR, m.VEX_ERROR] });
    expectSame(m, columns, ENGINE_RECORDS, undefined, cells);
    expect(reasonOf(columns, { ...NUM, cells: new Map([["left", new Map([["0", lit(true)]])]]), kinds: { left: "number" } })).toBe('the formula of the cell "left" at "0" gives a value of the kind boolean, not of the kind number of its column');
  });

  it("COMPILE.MODULE.SHEET: the options, the formulas and the reads of a sheet that a module does not have give a reason", () => {
    const columns = new Map<string, Expr>([["a", ref("v")]]);
    expect(reasonOf(columns, { ...NUM, name: "a-b" })).toBe('the name "a-b" is not a JavaScript name');
    expect(reasonOf(columns, { ...NUM, space: "grid" as "tree" })).toBe('the space "grid" is not "array", "tree" or "graph"');
    expect(reasonOf(columns, { ...NUM, budget: 1.5 })).toBe("the budget 1.5 is not a whole number of 0 or more");
    expect(reasonOf(columns, { ...NUM, budget: -1 })).toBe("the budget -1 is not a whole number of 0 or more");
    expect(reasonOf(new Map([["a", { tag: "nope" } as unknown as Expr]]))).toMatch(/^the formula of the column "a": /);
    expect(reasonOf(new Map([["a", ref("v")]]), { ...NUM, cells: new Map([["a", new Map([["2", { tag: "nope" } as unknown as Expr]])]]) })).toMatch(/^the formula of the cell "a" at "2": /);
    expect(reasonOf(new Map([["a", ext("other", {})]]))).toBe('the extension "other"');
    expect(reasonOf(new Map([["A", fold(axes.where(axes.others, app("gt", cell("A"), lit(0))), { s: lit(0) }, { s: lit(1) }, v("s"))]]))).toBe("a test of the axis of a fold reads a cell");
    // A read that is not a cell reference, and a read of a column that the sheet does not have, give an error.
    const bad = new Map<string, Expr>([["a", app("ifError", ext("vex.cell", { column: 1 }), lit(7))], ["b", app("ifError", cell("none"), lit(8))]]);
    const m = make(sourceOf(bad));
    expect(m.run([{ v: 1 }], {})).toStrictEqual({ a: [7], b: [8] });
    expectSame(m, bad, [{ v: 1 }], undefined);
    // A module checks its input before the run.
    const tree = make(sourceOf(columns, TREE));
    expect(() => tree.run([{ v: 1 }], {}, [0])).toThrow(tree.VexContractError);
    expect(() => tree.run([{ v: "x" }], {}, [-1])).toThrow("the record 0 does not keep the schema");
  });
});

/** The formulas of a random sheet over an array space or a tree space: the addresses of its reads, and its axes. */
interface SheetGrammar {
  readonly ats: readonly (readonly FixedMove[])[];
  readonly axes: readonly Axis[];
}

/**
 * This function gives the formulas of a random sheet. The values are numbers. A cell reference reads the columns A, B
 * and C. A list op over an axis can have a test, the option strict, and a body that is not always a number.
 */
const formulaOf = (g: SheetGrammar): fc.Arbitrary<Expr> =>
  fc.letrec<{ num: Expr; bool: Expr }>((tie) => ({
    num: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.integer({ min: -3, max: 3 }).map((x) => lit(x)),
      fc.constant(ref("v")),
      // The reads of cells come more often than the other leaves, so many sheets have a cycle.
      { arbitrary: fc.tuple(fc.constantFrom(...COLUMNS), fc.constantFrom(...g.ats)).map(([c, at]) => cell(c, at)), weight: 6 },
      fc.tuple(fc.constantFrom("add", "subtract", "max", "divide"), tie("num"), tie("num")).map(([o, a, b]) => app(o, a, b)),
      fc.tuple(tie("num"), tie("num")).map(([a, b]) => app("ifError", a, b)),
      fc.tuple(tie("bool"), tie("num"), tie("num")).map(([c, a, b]) => app("if", c, a, b)),
      fc
        .tuple(fc.constantFrom("sum", "count", "max"), fc.constantFrom(...g.axes), tie("num"), fc.boolean(), fc.option(tie("bool"), { nil: undefined }), fc.boolean())
        // A body that is not always a number gives an error of the op at its item, so the module fills the items first.
        .map(([o, a, body, mixed, test, strict]) => app(o, each(test === undefined ? a : axes.where(a, test), mixed ? app("if", app("gt", ref("v"), lit(0)), body, lit(true)) : body), ...(strict ? [lit({ strict: true })] : []))),
      fc.tuple(fc.constantFrom(...g.axes), tie("num")).map(([a, body]) => app("first", each(a, body))),
      fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ x: a }, app("add", v("x"), b))),
      fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ f: fn(["p"], app("subtract", v("p"), a)) }, call("f", b))),
      fc.tuple(fc.constantFrom(...g.axes), tie("num"), tie("num")).map(([a, init, step]) => fold(a, { s: init }, { s: app("subtract", step, v("s")) }, v("s"))),
      fc.tuple(fc.integer({ min: 0, max: 2 }), tie("num"), tie("num")).map(([k, init, step]) => iterate(k, { s: init }, { s: app("add", v("s"), step) }, v("s"))),
      // The computed moves: a read of a field and a list op from a position that a formula gives.
      tie("num").map((x) => ref("v", [index(x)])),
      fc.tuple(fc.constantFrom("sum", "mean", "min"), fc.constantFrom(...g.axes), tie("num"), tie("num")).map(([o, a, body, at]) => app(o, each(a, body, [index(at)]))),
      // The list ops over a list: take, sortBy and nth.
      fc.tuple(fc.constantFrom(...g.axes), tie("num"), tie("num")).map(([a, body, k]) => app("sum", app("take", app("sortBy", each(a, body)), k))),
      fc.tuple(fc.constantFrom(...g.axes), tie("num"), tie("num"), fc.boolean()).map(([a, body, k, strict]) => app("nth", each(a, body), k, ...(strict ? [lit({ strict: true })] : []))),
    ),
    bool: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.tuple(fc.constantFrom("gt", "lt"), tie("num"), tie("num")).map(([o, a, b]) => app(o, a, b)),
      fc.tuple(fc.constantFrom("and", "or"), tie("bool"), tie("bool")).map(([o, a, b]) => app(o, a, b)),
      fc.tuple(fc.constantFrom("any", "all"), fc.constantFrom(...g.axes), tie("bool")).map(([o, a, body]) => app(o, each(a, body))),
    ),
  })).num;

const arrayFormula = formulaOf({ ats: [[], [offset(-1)], [offset(1)], [offset(-2)], [index(0)], [PARENT]], axes: [axes.others, axes.all, axes.window(-1, 0), axes.reverse(axes.all)] });
const treeFormula = formulaOf({
  ats: [[], [PARENT], [PARENT, PARENT], [offset(-1)], [offset(1)], [index(0)], [PARENT, offset(1)]],
  axes: [axes.children, axes.descendants, axes.siblings, axes.ancestors, axes.window(-1, 1), axes.reverse(axes.children), axes.others],
});

/**
 * A random sheet: the formulas of the columns A and B, maybe of C, and a record column D that no formula reads. Some
 * cells have their own formula, also at a key outside the space.
 */
const sheetOf = (formula: fc.Arbitrary<Expr>): fc.Arbitrary<{ readonly columns: ReadonlyMap<string, Expr>; readonly cells: CellFormulas }> =>
  fc
    .record({
      a: formula,
      b: formula,
      c: fc.option(formula, { nil: undefined }),
      d: fc.option(fc.tuple(formula, formula), { nil: undefined }),
      own: fc.array(fc.tuple(fc.constantFrom(...COLUMNS), fc.nat(7), formula), { maxLength: 4 }),
    })
    .map(({ a, b, c, d, own }) => ({
      columns: new Map<string, Expr>([["A", a], ["B", b], ...(c === undefined ? [] : [["C", c] as const]), ...(d === undefined ? [] : [["D", rec({ p: d[0], q: d[1] })] as const])]),
      cells: sheetCellsOf(own),
    }));

const rows = fc.array(fc.record({ v: fc.integer({ min: -3, max: 3 }) }), { minLength: 1, maxLength: 7 });

/**
 * The records of a random tree and their parents. A random order of the keys gives each key a parent among the keys
 * before it, or no parent. Thus a parent can come after its child in the key order.
 */
const trees: fc.Arbitrary<readonly [readonly unknown[], readonly number[]]> = rows.chain((rs) => {
  const keys = rs.map((_r, i) => i);
  return fc.tuple(fc.constant(rs), fc.shuffledSubarray(keys, { minLength: keys.length, maxLength: keys.length }), fc.array(fc.nat(), { minLength: keys.length, maxLength: keys.length })).map(([xs, order, picks]): readonly [readonly unknown[], readonly number[]] => {
    const parents = keys.map(() => -1);
    order.forEach((k, i) => {
      const p = picks[i] ?? 0;
      const at = p % 3 === 0 || i === 0 ? -1 : (p >> 2) % i;
      parents[k] = at < 0 ? -1 : (order[at] ?? -1);
    });
    return [xs, parents];
  });
});

/** This function checks one random sheet with each budget of the stack, and gives the number of cells on a cycle. */
function checkSheet(columns: ReadonlyMap<string, Expr>, cells: CellFormulas, records: readonly unknown[], parents: readonly number[] | undefined): number {
  for (const budget of [undefined, 1, 40]) {
    const m = emitSheetModule(columns, { ...(parents === undefined ? NUM : TREE), cells, ...(budget === undefined ? {} : { budget }) });
    if (!m.ok) throw new Error(m.reason);
    expectSame(make(m.source), columns, records, parents, cells, budget);
  }
  const s = parents === undefined ? space.array(records) : treeOf(records, parents);
  const run = new SheetRun(columns, { space: s, domains: [NumDomain], cells });
  return COLUMNS.flatMap((c) => s.keys.map((k) => run.cell(c, k))).filter((r) => !r.ok && r.error.code === "#CYCLE!").length;
}

/** This function gives the depth of the key `k` in a tree: 0 for a root. */
const depth = (parents: readonly number[], k: number): number => (k < 0 ? -1 : 1 + depth(parents, parents[k] ?? -1));

// These tests check some hundred sheets, each with four budgets. In the mutation lane, Stryker adds its counters to
// the code, and one test takes more than the 5 s of Vitest.
describe("COMPILE.MODULE.SHEET P17: random sheets", { timeout: 60_000 }, () => {
  it("P17 COMPILE.MODULE.SHEET: a module of a random sheet of the test kit gives the results of SheetRun, with each budget of the stack", () => {
    fc.assert(fc.property(arbSheet, ({ formulas, own, rows: vs }) => void checkSheet(sheetColumnsOf(formulas), sheetCellsOf(own), vs.map((x) => ({ v: x })), undefined)));
    // A fixed sample has cycles in many sheets.
    const sample = fc.sample(arbSheet, { seed: 20261024, numRuns: 200 });
    const cyclic = sample.filter(({ formulas, own, rows: vs }) => checkSheet(sheetColumnsOf(formulas), sheetCellsOf(own), vs.map((x) => ({ v: x })), undefined) > 0).length;
    expect(cyclic).toBeGreaterThan(40);
  });

  it("P17 COMPILE.MODULE.SHEET: a module of a random sheet over an array or a tree gives the results of SheetRun, with each budget of the stack", () => {
    fc.assert(fc.property(sheetOf(arrayFormula), rows, ({ columns, cells }, rs) => void checkSheet(columns, cells, rs, undefined)), { numRuns: 150 });
    fc.assert(fc.property(sheetOf(treeFormula), trees, ({ columns, cells }, [rs, parents]) => void checkSheet(columns, cells, rs, parents)), { numRuns: 150 });
    // A fixed sample has cycles in many sheets, deep trees and parents after their children, so a change of the
    // generators that loses them fails at once.
    const sample = fc.sample(fc.tuple(sheetOf(treeFormula), trees), { seed: 20261024, numRuns: 200 });
    const cyclic = sample.filter(([{ columns, cells }, [rs, parents]]) => checkSheet(columns, cells, rs, parents) > 0).length;
    expect(cyclic).toBeGreaterThan(40);
    expect(sample.filter(([, [, parents]]) => parents.some((_p, k) => depth(parents, k) >= 2)).length).toBeGreaterThan(40);
    expect(sample.filter(([, [, parents]]) => parents.some((p, k) => p > k)).length).toBeGreaterThan(40);
  });
});

/**
 * The formula of the column `self` of a sheet with a direct fill (COMPILE.MODULE.SHEET.DIRECT). It reads the columns
 * of `earlier` at each address, and it reads `self` in the forms that read a finished cell. Some formulas also read
 * `self` in a function or in an axis, so the module of their sheet has the search.
 */
const directFormula = (self: string, earlier: readonly string[], tree: boolean): fc.Arbitrary<Expr> => {
  const ats: readonly (readonly FixedMove[])[] = tree ? [[], [PARENT], [offset(-1)], [PARENT, offset(1)]] : [[], [offset(-1)], [offset(1)], [index(0)]];
  const own: readonly Expr[] = tree
    ? [cell(self, [PARENT]), app("sum", each(axes.children, cell(self))), app("sum", each(axes.where(axes.reverse(axes.children), app("gt", cell(self), lit(0))), cell(self)))]
    : [cell(self, [offset(-1)]), cell(self, [offset(-2)])];
  const axesOf: readonly Axis[] = tree ? [axes.children, axes.siblings, axes.ancestors, axes.others] : [axes.others, axes.all, axes.window(-1, 1)];
  return fc.letrec<{ num: Expr }>((tie) => ({
    num: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.integer({ min: -3, max: 3 }).map((x) => lit(x)),
      fc.constant(ref("v")),
      ...(earlier.length === 0 ? [] : [{ arbitrary: fc.tuple(fc.constantFrom(...earlier), fc.constantFrom(...ats)).map(([c, at]) => cell(c, at)), weight: 4 }]),
      { arbitrary: fc.constantFrom(...own), weight: 4 },
      fc.tuple(fc.constantFrom("add", "subtract", "max"), tie("num"), tie("num")).map(([o, a, b]) => app(o, a, b)),
      fc.tuple(tie("num"), tie("num")).map(([a, b]) => app("ifError", a, b)),
      fc.tuple(tie("num"), tie("num"), tie("num")).map(([c, a, b]) => app("if", app("gt", c, lit(0)), a, b)),
      // A read of the column itself in the body of an axis or of a function reads a cell that is maybe not finished.
      fc.tuple(fc.constantFrom(...axesOf), tie("num")).map(([a, body]) => app("sum", each(a, body))),
      fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ f: fn(["p"], app("subtract", v("p"), a)) }, call("f", b))),
    ),
  })).num;
};

/** A sheet of the columns A, B and C: each column reads itself and the columns before it. */
const directSheet = (tree: boolean): fc.Arbitrary<ReadonlyMap<string, Expr>> =>
  fc.tuple(directFormula("A", [], tree), directFormula("B", ["A"], tree), directFormula("C", ["A", "B"], tree)).map(([a, b, c]) => new Map([["A", a], ["B", b], ["C", c]]));

/** True when the module of a sheet fills its cells with no search. */
const isDirect = (source: string): boolean => source.includes("function DO(") && !source.includes("function SH(");

/** True when the module of the sheet fills its cells with no search. */
const direct = (columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions): boolean => isDirect(sourceOf(columns, options));
/** The sum of a column at the children. */
const sum = (c: string): Expr => app("sum", each(axes.children, cell(c)));
/** This function compares the module of a sheet with SheetRun, and it tells if the module has a direct fill. */
const runDirect = (columns: ReadonlyMap<string, Expr>, records: readonly unknown[], parents: readonly number[] | undefined): boolean => {
  const source = sourceOf(columns, parents === undefined ? NUM : TREE);
  expectSame(make(source), columns, records, parents);
  return isDirect(source);
};

describe("COMPILE.MODULE.SHEET.DIRECT: a fill with no search", () => {
  it("COMPILE.MODULE.SHEET.DIRECT: a sheet whose reads all read finished cells has no search, and each other sheet keeps it", () => {
    const kinds = { ...KINDS, D: "number" } as const;
    const tree = { ...TREE, kinds };
    const array = { ...NUM, kinds };
    // The forms that read a finished cell: an earlier column at each address, the parent in pre-order, the children in
    // post-order, and an earlier key of an array.
    const yes: readonly [Map<string, Expr>, SheetModuleOptions][] = [
      [new Map([["A", app("add", ref("v"), sum("A"))], ["B", app("ifError", cell("B", [PARENT]), cell("A", [offset(1)]))]]), tree],
      [new Map([["A", app("ifError", cell("A", [offset(-1)]), ref("v"))], ["B", app("add", cell("A", [offset(1)]), app("ifError", cell("B", [offset(-2)]), lit(0)))]]), array],
      [new Map<string, Expr>([["A", ref("v")], ["B", fold(axes.others, { s: cell("A") }, { s: app("add", v("s"), cell("A")) }, v("s"))]]), array],
    ];
    for (const [columns, options] of yes) {
      expect(direct(columns, options)).toBe(true);
      expectSame(make(sourceOf(columns, options)), columns, ENGINE_RECORDS, options.space === "tree" ? ENGINE_PARENTS : undefined);
    }
    // The forms that can read a cell that is not finished: a later column, the cell itself, the parent and the children
    // together, a read in a function, an axis from another key, and a later key or a sibling.
    const no: readonly [Map<string, Expr>, SheetModuleOptions][] = [
      [new Map([["A", app("ifError", cell("B"), lit(1))], ["B", app("ifError", cell("A"), lit(2))]]), array],
      [new Map([["A", app("ifError", cell("A"), lit(1))]]), array],
      [new Map([["A", app("add", sum("A"), app("ifError", cell("A", [PARENT]), lit(0)))]]), tree],
      [new Map([["A", let_({ f: fn([], app("ifError", cell("A", [PARENT]), lit(0))) }, app("sum", each(axes.children, call("f"))))]]), tree],
      [new Map([["A", app("sum", each(axes.children, cell("A"), [PARENT]))]]), tree],
      [new Map([["A", app("sum", each(axes.siblings, sum("A")))]]), tree],
      [new Map([["A", app("ifError", cell("A", [offset(1)]), lit(0))]]), array],
      [new Map([["A", app("ifError", cell("A", [offset(-1)]), lit(0))]]), tree],
      [new Map([["A", app("ifError", cell("A", [PARENT]), lit(0))]]), { ...tree, cells: new Map([["A", new Map([["1", lit(5)]])]]) }],
    ];
    for (const [columns, options] of no) {
      expect(direct(columns, options)).toBe(false);
      expectSame(make(sourceOf(columns, options)), columns, ENGINE_RECORDS, options.space === "tree" ? ENGINE_PARENTS : undefined, options.cells);
    }
  });

  it("P17 COMPILE.MODULE.SHEET.DIRECT: a module of a random sheet with a direct fill gives the results of SheetRun", () => {
    fc.assert(fc.property(directSheet(false), rows, (columns, rs) => void runDirect(columns, rs, undefined)), { numRuns: 150 });
    fc.assert(fc.property(directSheet(true), trees, (columns, [rs, parents]) => void runDirect(columns, rs, parents)), { numRuns: 150 });
    // A fixed sample has many sheets with a direct fill and many sheets with the search, over arrays and trees.
    for (const tree of [false, true]) {
      const sample = fc.sample(fc.tuple(directSheet(tree), trees), { seed: 20261026, numRuns: 200 });
      const directs = sample.filter(([columns, [rs, parents]]) => runDirect(columns, rs, tree ? parents : undefined)).length;
      expect(directs).toBeGreaterThan(40);
      expect(directs).toBeLessThan(180);
    }
  });
});

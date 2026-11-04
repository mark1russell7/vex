/**
 * A computed move in a sheet module (COMPILE.MODULE.SHEET.COMPUTED). The key of such a read is known only in the run. The
 * search of the module finds each read of a cell in the run, as `SheetRun` does. Thus each result here is the result of
 * `SheetRun`, also on a cycle that only the values make.
 */
import { app, axes, cell, each, index, key, let_, lit, offset, origin, parent, ref, SheetRun, space, v, type Expr, type Space } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitSheetModule, type SheetModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, parents?: unknown) => Readonly<Record<string, readonly unknown[]>>;
const NUM: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", at: "number" } } };
const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
/** The position of the last key. */
const last = op("subtract", op("count", each(axes.all, lit(1))), lit(1));
const RECORDS = [
  { v: 1, at: 2 },
  { v: 2, at: 0 },
  { v: 3, at: 1 },
  { v: 4, at: 3 },
  { v: 5, at: 0 },
];

/** This function gives the source of a sheet, and fails the test for a sheet that cannot be a module. */
function sourceOf(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions): string {
  const m = emitSheetModule(columns, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function compares a module with `SheetRun` at each cell, with each budget of the stack, and it gives the source. */
function same(columns: ReadonlyMap<string, Expr>, kinds: NonNullable<SheetModuleOptions["kinds"]> = {}, s: Space = space.array(RECORDS), parents?: readonly number[]): string {
  const options: SheetModuleOptions = { ...NUM, kinds, ...(parents === undefined ? {} : { space: "tree" as const }) };
  for (const budget of [undefined, 1, 40]) {
    const source = sourceOf(columns, { ...options, ...(budget === undefined ? {} : { budget }) });
    // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in a build.
    const { run, VEX_ERROR } = new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as { run: Run; VEX_ERROR: unknown };
    const sheet = new SheetRun(columns, { space: s, domains: [NumDomain] }, budget);
    const results = (c: string): readonly unknown[] =>
      s.keys.map((k) => {
        const r = sheet.cell(c, k);
        return r.ok ? r.value : VEX_ERROR;
      });
    expect(run(structuredClone(RECORDS), {}, parents)).toStrictEqual(Object.fromEntries([...columns.keys()].map((c) => [c, results(c)])));
  }
  return sourceOf(columns, options);
}

const hasSearch = (source: string): boolean => source.includes("function SH(");

describe("COMPILE.MODULE.SHEET.COMPUTED: a computed move in a module of a sheet", () => {
  it("COMPILE.MODULE.SHEET.COMPUTED: a read of the last key of an earlier column reads a finished cell, in a later loop", () => {
    const columns = new Map<string, Expr>([
      ["a", op("add", ref("v"), lit(1))],
      ["b", cell("a", [index(last)])],
      ["c", op("add", cell("b"), lit(1))],
    ]);
    const source = same(columns);
    expect(hasSearch(source)).toBe(false);
    // The column a has its own loop, because the column b reads each key of it. The column c shares the loop of b.
    expect(source.match(/for \(let o = 0; o < n; o\+\+\)/g)).toHaveLength(2);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED: a read of a later column in the fill order keeps the search", () => {
    const own = same(new Map([["a", op("ifError", cell("a", [index(ref("at"))]), ref("v"))]]), { a: "number" });
    expect(hasSearch(own)).toBe(true);
    // The column b comes first in the order of the fill, so this read reads a finished cell.
    const earlier = new Map<string, Expr>([
      ["a", cell("b", [index(ref("at"))])],
      ["b", ref("v")],
    ]);
    expect(hasSearch(same(earlier, { b: "number" }))).toBe(false);
    const cycle = new Map<string, Expr>([
      ["a", op("ifError", cell("b", [index(ref("at"))]), lit(0))],
      ["b", op("ifError", cell("a", [index(ref("at"))]), ref("v"))],
    ]);
    expect(hasSearch(same(cycle, { a: "number", b: "number" }))).toBe(true);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED SHEET.CYCLE: a cycle that only the values make gives VEX_ERROR, as in SheetRun", () => {
    // The first keys are on a cycle. The key 3 reads itself. The key 4 reads a cell on the cycle.
    same(new Map([["a", cell("a", [index(ref("at"))])]]), { a: "number" });
    same(new Map([["a", op("ifError", cell("a", [index(ref("at"))]), ref("v"))]]), { a: "number" });
    // Only the first key is on a cycle.
    same(new Map([["a", op("ifError", cell("a", [index(lit(0))]), ref("v"))]]), { a: "number" });
    // The position comes from a cell, so a read of a cell decides which cell the next read finds.
    const fromCell = new Map<string, Expr>([
      ["a", op("ifError", cell("a", [index(cell("b"))]), lit(0))],
      ["b", op("subtract", ref("at"), lit(1))],
    ]);
    same(fromCell, { a: "number" });
    const crossed = new Map<string, Expr>([
      ["a", op("ifError", cell("b", [index(cell("a", [offset(-1)]))]), ref("v"))],
      ["b", op("ifError", cell("a", [index(ref("at"))]), lit(1))],
    ]);
    expect(hasSearch(same(crossed, { a: "number", b: "number" }))).toBe(true);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED NAV.COMPUTED: a failing move does not stop the read of a cell in a later expression", () => {
    // SheetRun evaluates the expressions before the first move, so it finds the cycle before the move fails.
    const self = [index(cell("a"))];
    for (const moves of [[offset(-1), ...self], [offset(9), index(ref("at")), ...self], [index(lit(99)), ...self], [key(lit("x")), ...self]]) {
      const atKey = same(new Map([["a", op("ifError", cell("a", moves), lit(7))]]), { a: "number" });
      expect(hasSearch(atKey)).toBe(true);
      same(new Map([["a", op("ifError", ref("v", moves), lit(7))]]), { a: "number" });
      same(new Map([["a", op("ifError", op("sum", each(axes.all, lit(1), moves)), lit(7))]]), { a: "number" });
    }
    // A move to the origin cannot fail, and a read with no move before it stays in the code of the address.
    same(new Map([["a", op("ifError", cell("a", [origin, ...self]), lit(7))]]), { a: "number" });
    const inPlace = /I\(G\(RC\(0, \w+\)\), n\)/;
    expect(same(new Map([["a", op("ifError", ref("v", self), lit(7))]]), { a: "number" })).toMatch(inPlace);
    expect(same(new Map([["a", op("ifError", ref("v", [offset(-1), ...self]), lit(7))]]), { a: "number" })).not.toMatch(inPlace);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED: a computed key, a mix of moves and an error of an address give the results of SheetRun", () => {
    const columns = new Map<string, Expr>([
      ["a", ref("v")],
      ["named", cell("a", [key(lit("1"))])],
      ["unknown", op("ifError", cell("a", [key(lit("x"))]), lit(-1))],
      ["moved", op("ifError", cell("a", [offset(1), index(ref("at"))]), lit(-1))],
      ["far", op("ifError", cell("a", [index(op("add", ref("at"), lit(3)))]), lit(-1))],
      ["half", op("ifError", cell("a", [index(op("divide", ref("v"), lit(2)))]), lit(-1))],
      ["bound", let_({ i: ref("at") }, cell("a", [index(v("i"))]))],
    ]);
    expect(hasSearch(same(columns))).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED COMPILE.MODULE.TREE: a tree reads a computed key, and its search gives the results of SheetRun", () => {
    const parents = [-1, 0, 0, 1, 1];
    const s = space.tree(Object.fromEntries(RECORDS.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
    const columns = new Map<string, Expr>([
      ["size", op("add", ref("v"), op("sum", each(axes.children, cell("size"))))],
      ["top", cell("size", [index(lit(0))])],
      ["up", op("ifError", cell("up", [parent, index(ref("at"))]), ref("v"))],
    ]);
    expect(hasSearch(same(columns, { size: "number", up: "number" }, s, parents))).toBe(true);
    expect(hasSearch(same(new Map([...columns].slice(0, 2)), { size: "number" }, s, parents))).toBe(false);
  });

  it("COMPILE.MODULE.SHEET.COMPUTED COMPILE.MODULE.SHEET.LIST: a list op over a list at a computed key gives a reason, and the interpreter gives the value", () => {
    const columns = new Map<string, Expr>([
      ["l", each(axes.window(-1, 0), ref("v"))],
      ["n", op("sum", cell("l", [index(ref("at"))]))],
    ]);
    const m = emitSheetModule(columns, NUM);
    expect(m.ok ? "" : m.reason).toBe('the list op "sum"');
    expect(new SheetRun(columns, { space: space.array(RECORDS), domains: [NumDomain] }).cell("n", "0")).toEqual({ ok: true, value: 5 });
  });

  it("COMPILE.MODULE.SHEET.COMPUTED: a graph has no window, so a module gives a reason, and the interpreter gives the error of the axis", () => {
    const columns = new Map<string, Expr>([
      ["a", ref("v")],
      ["b", cell("a", [index(ref("at"))])],
    ]);
    const m = emitSheetModule(columns, { ...NUM, space: "graph" });
    expect(m.ok ? "" : m.reason).toContain("window");
    const g = space.graph({ A: { v: 1, at: 0 } }, { A: [] });
    const r = new SheetRun(columns, { space: g, domains: [NumDomain] }).cell("b", "A");
    expect(r.ok ? "" : r.error.kind).toBe("no-offset");
  });
});

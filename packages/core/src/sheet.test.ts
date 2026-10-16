import { describe, expect, expectTypeOf, it } from "vitest";
import { vex } from "./builder.ts";
import { defineDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
import { compile, type CompileOptions, type ExtHandler, type Program } from "./evaluate.ts";
import { app, axes, each, ext, index, let_, lit, offset, other, parent, ref, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { fail, type Result } from "./result.ts";
import { cell, SheetRun, type CompileFn, type SheetOptions } from "./sheet.ts";
import { space, type Space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    plus: { fn: (a: number, b: number): number => a + b, params: ["number"] },
  },
});

const A = { position: new Pt(0, 0), size: new Pt(2, 2) };
const plus = (a: Expr, b: Expr): Expr => app("plus", a, b);
const orZero = (e: Expr): Expr => app("ifError", e, lit(0));
const B = { position: new Pt(3, 4), size: new Pt(1, 1) };

describe("sheets (SHEET.*)", () => {
  const root = vex(PtDomain, Num).over(space.record({ A, B }));

  it("SHEET.CELL: a formula reads a column at the focus, at a key, or at an address", () => {
    const s = root
      .sheet()
      .column("corner", (r) => r.from("position")._.add("size"))
      .column("toB", (r) => r.start(r.cell("corner"))._.subtract(r.cell("corner", "B")))
      .column("toOther", (r) => r.start(r.cell("corner"))._.subtract(r.cell("corner", [other])));
    expect(value(s.result("A", "corner"))).toEqual(new Pt(2, 2));
    expect(value(s.result("A", "toB"))).toEqual(new Pt(-2, -3));
    expect(value(s.result("B", "toOther"))).toEqual(new Pt(2, 3));
    expectTypeOf(s.result("A", "toB")).toEqualTypeOf<Result<Pt>>();
    expect(s.at("A", "toB")).toEqual({ tag: "some", value: new Pt(-2, -3) });
    expect(s.table().map((row) => [row.key, value(row.cells.toOther)])).toEqual([
      ["A", new Pt(-2, -3)],
      ["B", new Pt(2, 3)],
    ]);
  });

  it("SHEET.CELL: an unknown column gives #NAME?, and an address outside the space gives #REF!", () => {
    const s = root
      .sheet()
      .column("bad", (r) => r.start(r.cell<Pt>("nope")))
      .column("far", (r) => r.start(r.cell<Pt>("bad", "Z" as "A")));
    expect(error(s.result("A", "bad")).code).toBe("#NAME?");
    expect(error(s.result("A", "far")).code).toBe("#REF!");
    const malformed = root
      .sheet()
      .column("odd", (r) => r.start(r.ext<Pt>("vex.cell", { column: 7 })))
      .column("bare", (r) => r.start(r.ext<Pt>("vex.cell")));
    expect(error(malformed.result("A", "odd")).code).toBe("#VALUE!");
    expect(error(malformed.result("A", "bare")).code).toBe("#VALUE!");
    const unknown = malformed.explain("A", "nope" as "odd");
    expect(unknown.events).toEqual([]);
    expect(error(unknown.result).code).toBe("#NAME?");
  });

  it("SHEET.CELL: a sheet keeps the free functions and the extension handlers of the options", () => {
    const withOptions = vex(PtDomain, Num)
      .withOptions({ fns: { half: (n: unknown) => Number(n) / 2 }, extensions: { seven: () => ({ ok: true, value: 7 }) } })
      .over(space.record({ A }));
    const s = withOptions.sheet().column("seven", (r) => r.start(r.ext<number>("seven"))._.plus(r.ext<number>("seven")));
    expect(value(s.result("A", "seven"))).toBe(14);
  });

  it("SHEET.RECURRENCE: a column reads itself at the row above, like a running total", () => {
    const rows = vex(Num).over(space.array(Array.from({ length: 5000 }, (_, i) => ({ v: i + 1 }))));
    const s = rows.sheet().column("total", (r) => r.from("v")._.plus(r.start(r.cell<number>("total", [offset(-1)])).ifError(0)));
    expect(s.table().slice(0, 4).map((row) => value(row.cells.total))).toEqual([1, 3, 6, 10]);
    expect(value(s.result("4999", "total"))).toBe((5000 * 5001) / 2);
  });

  it("SHEET.RECURRENCE V-048: a first read at the last key of a deep recurrence through two columns gives the result of a loop", () => {
    // V-048: SheetRun.cell did not warm the column, so a first read at the last key went 2 levels deep
    // for each key. The call stack overflowed, the overflow became an error value, and ifError gave the fallback:
    // a wrong number without an error. The loan pilot found it.
    const rows = space.array(Array.from({ length: 3000 }, () => ({ v: 1 })));
    const columns = new Map([
      ["opening", app("ifError", cell("closing", [offset(-1)]), lit(0))],
      ["closing", app("plus", cell("opening"), ref("v"))],
    ]);
    const cold = new SheetRun(columns, { space: rows, domains: [Num] });
    expect(value(cold.cell("closing", "2999"))).toBe(3000);
    expect(value(cold.cell("opening", "1500"))).toBe(1500);
    // A read in key order gives the same results.
    const warm = new SheetRun(columns, { space: rows, domains: [Num] });
    for (const k of rows.keys) warm.cell("closing", k);
    expect(value(warm.cell("closing", "2999"))).toBe(3000);
  });

  it("SHEET.DECLARE: declare gives the type of a column before its formula, for a recurrence and a forward read", () => {
    const rows = vex(Num).over(space.array([{ v: 1 }, { v: 2 }, { v: 4 }]));
    const s = rows
      .sheet()
      .declare<{ total: number; double: number }>()
      .column("total", (r) => r.from("v")._.plus(r.start(r.cell("total", [offset(-1)])).ifError(0)))
      .column("early", (r) => r.start(r.cell("double"))._.plus(1))
      .column("double", (r) => r.from("v")._.plus("v"));
    expectTypeOf(s.result("0", "total")).toEqualTypeOf<Result<number>>();
    expectTypeOf(s.result("0", "early")).toEqualTypeOf<Result<number>>();
    expect(s.table().map((row) => [value(row.cells.total), value(row.cells.early), value(row.cells.double)])).toEqual([
      [1, 3, 2],
      [3, 5, 4],
      [7, 9, 8],
    ]);
    // @ts-expect-error -- the declared type of "total" is string, but the formula gives a number
    rows.sheet().declare<{ total: string }>().column("total", (r) => r.from("v"));
    // @ts-expect-error -- "missing" has no declaration and no earlier formula, so its value is unknown and has no ._
    rows.sheet().column("x", (r) => r.start(r.cell("missing"))._.plus(1));
  });

  it("SHEET.CYCLE: each cell on a cycle gives #CYCLE!, also a reference to itself and a cycle across keys", () => {
    const s = root
      .sheet()
      .column("self", (r) => r.start(r.cell<Pt>("self")))
      .column("a", (r) => r.start(r.cell<Pt>("b"))._.add("size"))
      .column("b", (r) => r.start(r.cell<Pt>("a"))._.add("size"))
      .column("across", (r) => r.start(r.cell<Pt>("across", [other])));
    for (const c of ["self", "a", "b", "across"] as const) {
      for (const k of ["A", "B"] as const) expect(error(s.result(k, c)).code).toBe("#CYCLE!");
    }
  });

  it("SHEET.ORDER: ifError does not hide a cycle, and the order of the evaluations does not change a result", () => {
    const zero = new Pt(0, 0);
    const s = root
      .sheet()
      .column("a", (r) => r.start(r.cell<Pt>("b")).ifError(zero)._.add(r.start(r.cell<Pt>("c")).ifError(zero)))
      .column("b", (r) => r.start(r.cell<Pt>("a")).ifError(zero))
      .column("c", (r) => r.start(r.cell<Pt>("b")).ifError(new Pt(5, 5)))
      .column("outside", (r) => r.start(r.cell<Pt>("a")).ifError(new Pt(9, 9)));
    for (const c of ["a", "b", "c"] as const) expect(error(s.result("A", c)).code).toBe("#CYCLE!");
    expect(value(s.result("A", "outside"))).toEqual(new Pt(9, 9));
    const codes = s.table().map((row) => Object.values(row.cells).map((r) => (r.ok ? "value" : r.error.code)));
    expect(codes).toEqual([
      ["#CYCLE!", "#CYCLE!", "#CYCLE!", "value"],
      ["#CYCLE!", "#CYCLE!", "#CYCLE!", "value"],
    ]);
  });

  it("SHEET.CELL.FORMULA: a cell with its own formula starts a recurrence, so the column needs no ifError", () => {
    const rows = vex(Num).over(space.array([{ v: 1 }, { v: 2 }, { v: 4 }]));
    const s = rows
      .sheet()
      .declare<{ total: number }>()
      .column("total", (r) => r.start(r.cell("total", [offset(-1)]))._.plus("v"))
      .cellFormula("0", "total", (r) => r.from("v"))
      .column("double", (r) => r.start(r.cell("total"))._.plus(r.cell("total")));
    expect(s.table().map((row) => [value(row.cells.total), value(row.cells.double)])).toEqual([
      [1, 2],
      [3, 6],
      [7, 14],
    ]);
    // Without the formula of the first cell, the first cell reads a row that does not exist.
    expect(error(rows.sheet().declare<{ total: number }>().column("total", (r) => r.start(r.cell("total", [offset(-1)]))._.plus("v")).result("0", "total")).code).toBe("#REF!");
    // A later formula of the same cell replaces the earlier one, and the other cells keep theirs.
    const again = s.cellFormula("0", "total", (r) => r.start(10)).cellFormula("2", "total", (r) => r.start(0));
    expect(again.table().map((row) => value(row.cells.total))).toEqual([10, 12, 0]);
    expect(Object.keys(again.cellFormulas)).toEqual(["total"]);
    expect(Object.keys(again.cellFormulas["total"] ?? {})).toEqual(["0", "2"]);
    expect(again.columns["total"]).toEqual(s.columns["total"]);
    // The trace of a cell shows the nodes of its own formula.
    expect(s.explain("0", "total").events.map((e) => e.tag)).toEqual(["ref"]);
    expect(s.explain("1", "total").events.some((e) => e.tag === "ext")).toBe(true);
    // The formula of a cell must give a value of the type of its column, and the column must exist.
    // @ts-expect-error -- the column "total" has numbers, and the formula gives a string
    s.cellFormula("1", "total", (r) => r.start("text"));
    // @ts-expect-error -- the sheet has no column "nope"
    s.cellFormula("1", "nope", (r) => r.from("v"));
  });

  it("SHEET.CELL.FORMULA: a run takes the formulas of cells, also for a column without a formula, and finds their cycles", () => {
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const columns = new Map([["next", app("plus", cell("next", [offset(1)]), ref("v"))]]);
    const cells = new Map([
      ["next", new Map([["2", ref("v")]])],
      ["only", new Map([["1", lit(5)]])],
      ["loop", new Map([["0", cell("loop", [offset(1)])], ["1", cell("loop", [offset(-1)])]])],
    ]);
    const run = new SheetRun(columns, { space: rows, domains: [Num], cells });
    expect([run.cell("next", "0"), run.cell("next", "1"), run.cell("next", "2")].map(value)).toEqual([6, 5, 3]);
    expect(value(run.cell("only", "1"))).toBe(5);
    expect(error(run.cell("only", "0"))).toMatchObject({ code: "#NAME?", message: 'the cell "only" at "0" has no formula' });
    expect(error(run.cell("none", "0"))).toMatchObject({ code: "#NAME?", message: 'the sheet has no column "none"' });
    expect(error(run.cell("loop", "0")).code).toBe("#CYCLE!");
    expect(error(run.cell("loop", "1")).code).toBe("#CYCLE!");
    expect(error(run.cell("loop", "2"))).toMatchObject({ code: "#NAME?", message: 'the cell "loop" at "2" has no formula' });
    expect(run.explain("only", "1").events.map((e) => e.tag)).toEqual(["lit"]);
    // A small budget of the stack pauses the reads, and the results stay the same.
    const tight = new SheetRun(columns, { space: rows, domains: [Num], cells }, 1);
    expect(value(tight.cell("next", "0"))).toBe(6);
  });

  it("SHEET.TABLES: a run with two tables reads cells across the tables, and a cycle across the tables gives #CYCLE!", () => {
    const Calc = defineDomain({
      name: "Calc",
      is: (u: unknown): u is number => typeof u === "number",
      ops: { eq: { fn: (a: number, b: number): boolean => a === b, params: ["number"] }, multiply: { fn: (a: number, b: number): number => a * b, params: ["number"] } },
    });
    const orders = space.array([{ product: 2, qty: 3 }, { product: 1, qty: 10 }]);
    const products = space.array([{ id: 1, price: 1.5 }, { id: 2, price: 12 }]);
    // The price of the product of an order, from the cell "double" of the table products.
    const priceOf = let_({ $p: ref("product") }, app("first", each(axes.where(axes.table("products"), app("eq", ref("id"), v("$p"))), cell("double"))));
    const orderColumns = new Map<string, Expr>([
      ["line", app("multiply", ref("qty"), priceOf)],
      ["a", app("first", each(axes.table("products"), cell("b")))],
    ]);
    const productColumns = new Map<string, Expr>([
      ["double", app("multiply", ref("price"), lit(2))],
      // The units of the product in the orders: a read of the main table by its name.
      ["sold", let_({ $id: ref("id") }, app("sum", each(axes.where(axes.table("orders"), app("eq", ref("product"), v("$id"))), ref("qty"))))],
      ["b", app("first", each(axes.table("orders"), cell("a")))],
    ]);
    const tables = new Map([["products", { space: products, columns: productColumns }], ["orders", { space: products, columns: new Map() }]]);
    const run = new SheetRun(orderColumns, { space: orders, domains: [Calc], name: "orders", tables });
    // 3 units at 2 * 12, and 10 units at 2 * 1.5.
    expect([value(run.cell("line", "0")), value(run.cell("line", "1"))]).toEqual([72, 30]);
    expect([value(run.cell("sold", "0", "products")), value(run.cell("sold", "1", "products"))]).toEqual([10, 3]);
    expect([error(run.cell("a", "0")).code, error(run.cell("b", "0", "products")).code]).toEqual(["#CYCLE!", "#CYCLE!"]);
    expect(error(run.cell("x", "0", "nope"))).toMatchObject({ code: "#REF!", message: 'the run has no table "nope"', origin: "0", focus: "0" });
    expect(error(run.cell("zzz", "0", "products"))).toMatchObject({ code: "#NAME?", message: 'the table "products" has no column "zzz"' });
    expect(run.explain("double", "1", "products").events.length).toBeGreaterThan(0);
    expect(run.explain("double", "1", "nope")).toMatchObject({ events: [], result: { ok: false } });
    run.warm("sold", "1", "products");
    run.warm("sold", "1", "nope");
    // A third table: each table has its own cells, also for the same column and key.
    const third = new SheetRun(new Map([["n", lit(1)]]), {
      space: orders,
      domains: [Calc],
      tables: new Map([
        ["b", { space: products, columns: new Map([["n", lit(2)]]) }],
        ["c", { space: space.array([{}, {}]), columns: new Map([["n", lit(3)]]) }],
      ]),
    });
    expect([third.cell("n", "0"), third.cell("n", "0", "c"), third.cell("n", "0", "b")].map(value)).toEqual([1, 3, 2]);
    // A table with the space of the main table does not take its cells, and a run without a name has no table "undefined".
    const alias = new SheetRun(new Map<string, Expr>([["n", app("first", each(axes.table("alias"), cell("m")))], ["m", lit(5)]]), {
      space: orders,
      domains: [Calc],
      tables: new Map([["alias", { space: orders, columns: new Map([["n", lit(7)], ["m", lit(9)]]) }]]),
    });
    expect(value(alias.cell("n", "0"))).toBe(5);
    expect(error(alias.cell("x", "0", "undefined")).code).toBe("#REF!");
    expect(error(new SheetRun(new Map([["n", each(axes.table("undefined"), lit(1))]]), { space: orders }).cell("n", "0")).code).toBe("#REF!");
    // A small budget of the stack gives the same results.
    const tight = new SheetRun(orderColumns, { space: orders, domains: [Calc], name: "orders", tables }, 1);
    expect([value(tight.cell("line", "1")), value(tight.cell("sold", "0", "products"))]).toEqual([30, 10]);
  });

  it("SHEET.CELL: the columns are JSON data, and explain shows the cell reads", () => {
    const s = root
      .sheet()
      .column("corner", (r) => r.from("position")._.add("size"))
      .column("twice", (r) => r.start(r.cell("corner"))._.add(r.cell("corner")));
    for (const program of Object.values(s.columns)) {
      const text = value(serialize(program, [PtDomain]));
      expect(value(parse(text, [PtDomain]))).toEqual(program);
    }
    const trace = s.explain("B", "twice");
    expect(value(trace.result)).toEqual(new Pt(8, 10));
    expect(trace.events.filter((e) => e.tag === "ext")).toHaveLength(2);
    expect(s.explain("A", "corner").result.ok).toBe(true);
  });

  it("SHEET.COMPILE: a formula of a column compiles once for each compiler and options, and it gives the results of the interpreter", () => {
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const extra = space.array([{ v: 10 }, { v: 20 }]);
    const total = app("plus", app("ifError", cell("total", [offset(-1)]), lit(0)), ref("v"));
    const columns = new Map<string, Expr>([
      ["total", total],
      ["loop", cell("loop")],
      ["other", app("sum", each(axes.table("extra"), cell("w")))],
      ["fixed", app("plus", cell("total", [{ t: "key", key: "2" }]), v("bonus"))],
    ]);
    const cells = new Map([["total", new Map([["1", lit(100)]])]]);
    const tables = new Map([["extra", { space: extra, columns: new Map([["w", app("plus", ref("v"), cell("w", [offset(-1)]))]]), cells: new Map([["w", new Map([["0", ref("v")]])]]) }]]);
    const formulas = new Set([...columns.values(), tables.get("extra")?.columns.get("w")]);
    const compiled: Expr[] = [];
    const seen: CompileOptions[] = [];
    const kept: Program[] = [];
    let runs = 0;
    // A new compiler for each call, so each test starts without programs in the cache.
    const counting = (): ((expr: Expr, options: CompileOptions) => Program) => (expr, options) => {
      compiled.push(expr);
      seen.push(options);
      const program = compile(expr, options);
      kept.push(program);
      return { ...program, run: (r) => (runs++, program.run(r)) };
    };
    const opts = { space: rows, domains: [Num], cells, tables, vars: { bonus: 5 } };
    const reads = [["fixed", "0"], ["total", "2"], ["total", "0"], ["loop", "1"], ["other", "0"], ["w", "1", "extra"], ["none", "0"]] as const;
    for (const budget of [undefined, 1]) {
      compiled.length = 0;
      const plain = new SheetRun(columns, opts, budget);
      const compileFn = counting();
      const fast = new SheetRun(columns, { ...opts, compile: compileFn }, budget);
      for (const [c, k, t] of reads) expect(fast.cell(c, k, t)).toEqual(plain.cell(c, k, t));
      // Each formula of a column once, and the formulas of the cells never: they evaluate once in a run.
      expect(compiled).toHaveLength(formulas.size);
      expect(new Set(compiled)).toEqual(formulas);
      // Another run with the same compiler and options compiles nothing, and it gives the same results.
      compiled.length = 0;
      const again = new SheetRun(columns, { ...opts, compile: compileFn }, budget);
      for (const [c, k, t] of reads) expect(again.cell(c, k, t)).toEqual(plain.cell(c, k, t));
      expect(compiled).toEqual([]);
    }
    // Another compiler, or other options, compile the formula again. The cache keeps the last options of a formula.
    const compileFn = counting();
    const userExtensions = {};
    const steps: [SheetOptions, boolean][] = [
      [{ ...opts, compile: compileFn }, true],
      [{ ...opts, compile: compileFn }, false],
      [{ ...opts, compile: counting() }, true],
      [{ ...opts, compile: compileFn }, true],
      [{ ...opts, domains: [Num], compile: compileFn }, true],
      [{ ...opts, compile: compileFn }, true],
      [{ ...opts, fns: {}, compile: compileFn }, true],
      [{ ...opts, compile: compileFn }, true],
      [{ ...opts, extensions: userExtensions, compile: compileFn }, true],
      [{ ...opts, extensions: userExtensions, compile: compileFn }, false],
      [{ ...opts, compile: compileFn }, true],
    ];
    for (const [options, compiles] of steps) {
      compiled.length = 0;
      expect(error(new SheetRun(columns, options).cell("loop", "0")).code).toBe("#CYCLE!");
      expect(compiled).toEqual(compiles ? [columns.get("loop")] : []);
    }
    // The compiled programs give the results: the run does not evaluate the formulas of the columns again.
    runs = 0;
    const once = new SheetRun(columns, { ...opts, compile: counting() });
    expect(value(once.cell("fixed", "0"))).toBe(108);
    // fixed at 0 and total at 2. The cell total at 1 has its own formula, so the interpreter evaluates it.
    expect(runs).toBe(2);
    // The compiler gets the domains, the variables and the extension of the cell references.
    expect(seen[0]?.domains).toEqual([Num]);
    expect(Object.keys(seen[0]?.extensions ?? {})).toEqual(["vex.cell"]);
    // A compiled program reads the cells of the active run. Outside a run, a cell reference gives an error.
    const outside = error(kept.find((p) => p.expr === columns.get("fixed"))?.run({ space: rows, origin: "2", vars: { bonus: 5 } }) ?? fail(vexError("threw", "no program")));
    expect([outside.code, outside.message, outside.path]).toEqual(["#NAME?", "a compiled formula reads cells only in the evaluation of a sheet run", [0]]);
    // The trace of a cell still comes from the interpreter.
    expect(new SheetRun(columns, { ...opts, compile: counting() }).explain("total", "2").events.some((e) => e.tag === "ext")).toBe(true);
  });

  it("SHEET.FILL: a fill evaluates each cell once, in the order of the reads of its column, and a read then gives the result of the search", () => {
    let runs = 0;
    // A new compiler for each sheet, which counts the evaluations of the formulas of the columns.
    const counting = (): CompileFn => (expr, options) => {
      const program = compile(expr, options);
      return { ...program, run: (r) => (runs++, program.run(r)) };
    };
    /** This function fills a sheet and gives the evaluations of the fill. A read of each cell then gives the result of the search. */
    const fill = (columns: ReadonlyMap<string, Expr>, s: Space, more: Partial<SheetOptions> = {}): number => {
      const opts: SheetOptions = { space: s, domains: [Num], ...more };
      const run = new SheetRun(columns, { ...opts, compile: counting() });
      runs = 0;
      run.fill();
      const filled = runs;
      const search = new SheetRun(columns, opts);
      const names = [...new Set([...columns.keys(), ...(more.cells?.keys() ?? [])])];
      for (const c of names) for (const k of s.keys) expect([c, k, run.cell(c, k)]).toEqual([c, k, search.cell(c, k)]);
      // The reads after the fill evaluate nothing.
      expect(runs).toBe(filled);
      return filled;
    };
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }, { v: 6 }]);
    // A column comes after the columns that it reads, and a running total reads the row above.
    expect(fill(new Map([["double", plus(cell("total"), cell("total"))], ["total", plus(orZero(cell("total", [offset(-1)])), ref("v"))]]), rows)).toBe(12);
    // A column that reads the row below goes from the last row up.
    expect(fill(new Map([["rest", plus(orZero(cell("rest", [offset(1)])), ref("v"))]]), rows)).toBe(6);
    // A window of the rows above, and a window of the rows below.
    expect(fill(new Map([["up", plus(app("sum", each(axes.window(-2, -1), cell("up"))), ref("v"))]]), rows)).toBe(6);
    expect(fill(new Map([["down", plus(app("sum", each(axes.window(1, 2), cell("down"))), ref("v"))]]), rows)).toBe(6);
    // In a tree whose keys have each child before its parent: a roll-up goes up from the leaves, and a depth goes down from the root.
    const tree = space.tree({ c: { v: 1 }, b: { v: 2 }, d: { v: 4 }, a: { v: 8 } }, { c: "b", b: "a", d: "a" });
    expect(fill(new Map([["size", plus(ref("v"), app("sum", each(axes.children, cell("size"))))]]), tree)).toBe(4);
    // The test of a where axis reads the column too, and the fill still goes up from the leaves.
    expect(fill(new Map([["big", plus(ref("v"), app("sum", each(axes.where(axes.children, app("gt", cell("big"), lit(0))), cell("big"))))]]), tree)).toBe(4);
    expect(fill(new Map([["depth", plus(orZero(cell("depth", [parent])), lit(1))]]), tree)).toBe(4);
    expect(fill(new Map([["all", plus(ref("v"), app("sum", each(axes.descendants, cell("all"))))], ["top", plus(app("sum", each(axes.ancestors, cell("top"))), lit(1))]]), tree)).toBe(8);
    // Among siblings, a read of the sibling before, and a read of the sibling after.
    const siblings = space.tree({ r: { v: 1 }, x: { v: 2 }, y: { v: 3 }, z: { v: 4 } }, { x: "r", y: "r", z: "r" });
    expect(fill(new Map([["before", plus(orZero(cell("before", [offset(-1)])), ref("v"))]]), siblings)).toBe(4);
    expect(fill(new Map([["after", plus(orZero(cell("after", [offset(1)])), ref("v"))]]), siblings)).toBe(4);
    // A grid reads the row above it, or the cell on its right.
    const grid = space.grid([[{ v: 1 }, { v: 2 }], [{ v: 3 }, { v: 4 }]]);
    expect(fill(new Map([["g", plus(orZero(cell("g", [offset(-1, 0)])), ref("v"))]]), grid)).toBe(4);
    expect(fill(new Map([["g", plus(orZero(cell("g", [offset(0, 1)])), ref("v"))]]), grid)).toBe(4);
    // Reads of earlier and of later rows keep the key order: here only the last row reads a later row, and it has none.
    const flags = space.array([{ v: 1, up: false }, { v: 2, up: false }, { v: 3, up: true }]);
    expect(fill(new Map([["m", plus(app("if", ref("up"), orZero(cell("m", [offset(1)])), orZero(cell("m", [offset(-1)]))), ref("v"))]]), flags)).toBe(3);
    // A read of a cell that is not finished goes to the search: the first cell reads the last cell, and the fill
    // evaluates the first cell again.
    const own = new Map([["last", new Map([["5", lit(0)]])]]);
    expect(fill(new Map([["last", plus(cell("last", [index(5)]), lit(1))]]), rows, { cells: own })).toBe(6);
    // Two columns that read each other at different keys. The fill keeps their order, and the search gives each value.
    expect(fill(new Map([["x", plus(cell("y"), lit(1))], ["y", orZero(cell("x", [offset(-1)]))]]), rows)).toBeGreaterThan(12);
    // A cycle gives #CYCLE!, and a column with formulas of cells only is filled too.
    expect(fill(new Map([["p", cell("q")], ["q", cell("p")]]), rows, { cells: new Map([["only", new Map([["1", lit(5)]])]]) })).toBeGreaterThan(0);
  });

  it("SHEET.FILL: a fill of a table by its name evaluates the cells of that table only", () => {
    let runs = 0;
    const counting: CompileFn = (expr, options) => {
      const program = compile(expr, options);
      return { ...program, run: (r) => (runs++, program.run(r)) };
    };
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
    const total = app("plus", app("ifError", cell("total", [offset(-1)]), lit(0)), ref("v"));
    const tables = new Map([["t2", { space: space.array([{ v: 10 }, { v: 20 }]), columns: new Map([["total", total]]) }]]);
    const run = new SheetRun(new Map([["total", total]]), { space: rows, domains: [Num], tables, compile: counting });
    run.fill("t2");
    expect(runs).toBe(2);
    expect([run.cell("total", "0", "t2"), run.cell("total", "1", "t2")].map(value)).toEqual([10, 30]);
    expect(runs).toBe(2);
    // The main table is not filled, so its reads evaluate its cells.
    expect(value(run.cell("total", "2"))).toBe(6);
    expect(runs).toBe(5);
  });

  it("SHEET.FILL: a fill inside a formula, or of a table that does not exist, has no effect", () => {
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
    let run: SheetRun | undefined;
    // An extension that fills the run and reads a cell of it, in the evaluation of a formula.
    const probe: ExtHandler = () => {
      run?.fill();
      return run?.cell("total", "2") ?? fail(vexError("threw", "no run"));
    };
    const columns = new Map<string, Expr>([["total", app("plus", app("ifError", cell("total", [offset(-1)]), lit(0)), ref("v"))], ["probe", ext("probe", null)]]);
    const opts = { space: rows, domains: [Num], extensions: { probe } };
    run = new SheetRun(columns, opts);
    run.fill("nope");
    run.fill();
    expect([value(run.cell("probe", "0")), value(run.cell("total", "2"))]).toEqual([6, 6]);
    // In the order of the columns, probe comes first. Its fill reads a cell that is not finished, so the search gives it.
    run = new SheetRun(new Map([["probe", ext("probe", null)], ["total", columns.get("total") ?? lit(0)]]), opts);
    run.fill();
    expect(value(run.cell("probe", "1"))).toBe(6);
  });
});

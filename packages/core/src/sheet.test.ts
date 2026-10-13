import { describe, expect, expectTypeOf, it } from "vitest";
import { vex } from "./builder.ts";
import { defineDomain } from "./domain.ts";
import { app, lit, offset, other, ref } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import type { Result } from "./result.ts";
import { cell, SheetRun } from "./sheet.ts";
import { space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    plus: { fn: (a: number, b: number): number => a + b, params: ["number"] },
  },
});

const A = { position: new Pt(0, 0), size: new Pt(2, 2) };
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
});

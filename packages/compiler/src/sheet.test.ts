/**
 * Sheets with the compiler (SHEET.COMPILE). A run compiles each formula of a column with `tiered`, and it must give
 * the results of the recursive reference, with each budget of the stack.
 */
import { app, axes, cell, each, index, lit, offset, ref, SheetRun, space, type CompileOptions, type Expr, type Result } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { arbSheet, arbTwoTables, ReferenceSheetRun, sheetCellsOf, sheetColumnsOf, sheetRowsOf } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tiered, type TieredProgram } from "./tiers.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** A compiler for a run that keeps each program, so a test can read the counts of the tiers. */
function keeping(): { readonly compile: (e: Expr, o: CompileOptions) => TieredProgram; readonly programs: TieredProgram[] } {
  const programs: TieredProgram[] = [];
  return {
    programs,
    compile: (e, o) => {
      const p = tiered(e, o);
      programs.push(p);
      return p;
    },
  };
}

type SheetCase = typeof arbSheet extends fc.Arbitrary<infer T> ? T : never;

/**
 * This function checks that a sheet with the compiler gives the results of the reference, with each budget of the stack.
 * It counts the runs of the programs, and the runs that tier 2 gave.
 */
function checkSheet({ formulas, own, rows, reads }: SheetCase, count: { runs: number; fast: number }): void {
  const columns = sheetColumnsOf(formulas);
  const opts = { space: sheetRowsOf(rows), domains: [NumDomain], cells: sheetCellsOf(own) };
  const reference = new ReferenceSheetRun(columns, opts);
  const expected = reads.map(([c, k]) => plain(reference.cell(c, k)));
  for (const budget of [undefined, 1, 40]) {
    const { compile, programs } = keeping();
    const run = new SheetRun(columns, { ...opts, compile }, budget);
    expect(reads.map(([c, k]) => plain(run.cell(c, k)))).toEqual(expected);
    // A fill with the compiler gives the same results (SHEET.FILL).
    const filled = new SheetRun(columns, { ...opts, compile }, budget);
    filled.fill();
    expect(reads.map(([c, k]) => plain(filled.cell(c, k)))).toEqual(expected);
    for (const p of programs) {
      count.runs += p.stats.runs;
      count.fast += p.stats.runs - p.stats.fallbacks;
    }
  }
}

describe("SHEET.COMPILE: a sheet run with the compiler", () => {
  it("SHEET.COMPILE P17: a run with tiered gives the results of the reference, with each budget of the stack", () => {
    fc.assert(fc.property(arbSheet, (sheet) => checkSheet(sheet, { runs: 0, fast: 0 })));
    // Tier 2 gives most results. A read of a cell on a cycle or of a paused cell goes to tier 1. A fixed sample gives the
    // same share in each test run, so a change of the generators that lowers it fails at once.
    const count = { runs: 0, fast: 0 };
    for (const sheet of fc.sample(arbSheet, { seed: 20261024, numRuns: 200 })) checkSheet(sheet, count);
    expect(count.fast / count.runs).toBeGreaterThan(0.5);
  });

  it("SHEET.COMPILE SHEET.TABLES: a run of two tables with tiered gives the results of the reference", () => {
    fc.assert(
      fc.property(arbTwoTables, (t) => {
        const tables = new Map([["other", { space: sheetRowsOf(t.otherRows), columns: sheetColumnsOf(t.other) }]]);
        const opts = { space: sheetRowsOf(t.mainRows), domains: [NumDomain], name: "main", tables };
        const reference = new ReferenceSheetRun(sheetColumnsOf(t.main), opts);
        const expected = t.reads.map(([table, c, k]) => plain(reference.cell(c, k, table)));
        for (const budget of [undefined, 1, 40]) {
          const run = new SheetRun(sheetColumnsOf(t.main), { ...opts, compile: tiered }, budget);
          expect(t.reads.map(([table, c, k]) => plain(run.cell(c, k, table)))).toEqual(expected);
          const filled = new SheetRun(sheetColumnsOf(t.main), { ...opts, compile: tiered }, budget);
          filled.fill("other");
          filled.fill("main");
          expect(t.reads.map(([table, c, k]) => plain(filled.cell(c, k, table)))).toEqual(expected);
        }
      }),
    );
  });

  it("SHEET.COMPILE SHEET.RECURRENCE COMPILE.EXT: a running total evaluates in tier 2, and each formula compiles once", () => {
    const rows = sheetRowsOf(Array.from({ length: 50 }, (_v, i) => i));
    const total = app("add", app("ifError", cell("total", [offset(-1)]), lit(0)), ref("v"));
    const { compile, programs } = keeping();
    const run = new SheetRun(new Map([["total", total]]), { space: rows, domains: [NumDomain], compile });
    expect(plain(run.cell("total", "49"))).toBe((49 * 50) / 2);
    expect(programs).toHaveLength(1);
    // The first row reads a row that does not exist. The extension gives #REF!, and ifError of tier 2 catches it (COMPILE.EXT).
    expect(programs[0]?.stats).toEqual({ runs: 50, fallbacks: 0 });
  });
});

describe("COMPILE.SHEET.COMPUTED: a computed move in tier 2", () => {
  const rows = space.array([{ v: 1 }, { v: 2 }, { v: 0 }]);
  const last = app("subtract", app("count", each(axes.all, lit(1))), lit(1));

  /** This function gives the results of a column with the compiler, and the fallbacks. The results must be the results of the reference. */
  function tiers(columns: ReadonlyMap<string, Expr>, column: string): { readonly got: readonly unknown[]; readonly fallbacks: number } {
    const { compile, programs } = keeping();
    const run = new SheetRun(columns, { space: rows, domains: [NumDomain], compile });
    const got = rows.keys.map((k) => plain(run.cell(column, k)));
    const reference = new ReferenceSheetRun(columns, { space: rows, domains: [NumDomain] });
    expect(got).toEqual(rows.keys.map((k) => plain(reference.cell(column, k))));
    return { got, fallbacks: programs.reduce((n, p) => n + p.stats.fallbacks, 0) };
  }

  it("COMPILE.SHEET.COMPUTED SHEET.COMPILE: tier 2 gives a read of the last key, with no fallback", () => {
    const columns = new Map<string, Expr>([
      ["a", app("add", ref("v"), lit(1))],
      ["b", cell("a", [index(last)])],
    ]);
    expect(tiers(columns, "b")).toEqual({ got: [1, 1, 1], fallbacks: 0 });
  });

  it("COMPILE.SHEET.COMPUTED SHEET.COMPILE: an error of the cell goes to tier 1, also on a cycle, and the result stays", () => {
    // The strict `first` sends the error of the cell to tier 1 (COMPILE.LIST.VALUE).
    const failing = new Map<string, Expr>([
      ["a", app("divide", lit(1), ref("v"))],
      ["b", cell("a", [index(last)])],
    ]);
    const out = tiers(failing, "b");
    expect(out.got).toEqual(["#NUM!", "#NUM!", "#NUM!"]);
    expect(out.fallbacks).toBeGreaterThan(0);
    // The field v makes the cycle 0 -> 1 -> 2 -> 0.
    expect(tiers(new Map([["a", cell("a", [index(ref("v"))])]]), "a").got).toEqual(["#CYCLE!", "#CYCLE!", "#CYCLE!"]);
    expect(tiers(new Map([["a", app("ifError", cell("a", [index(lit(0))]), ref("v"))]]), "a").got).toEqual(["#CYCLE!", 2, 0]);
  });
});

// These tests build chains 100000 cells long. With the coverage of `pnpm check`, one test takes some seconds.
describe("SHEET.COMPILE SHEET.DEEP: deep sheets with the compiler", { timeout: 30_000 }, () => {
  it("SHEET.DEEP: a roll-up from the root of a tree 100000 levels deep gives the sum", () => {
    const n = 100_000;
    const records: Record<string, { size: number }> = {};
    const parents: Record<string, string | null> = {};
    for (let i = 0; i < n; i++) {
      records[`k${i}`] = { size: 1 };
      parents[`k${i}`] = i === 0 ? null : `k${i - 1}`;
    }
    const total = app("add", ref("size"), app("sum", each(axes.children, cell("total")), lit({ strict: true })));
    const run = new SheetRun(new Map([["total", total]]), { space: space.tree(records, parents), domains: [NumDomain], compile: tiered });
    expect(plain(run.cell("total", "k0"))).toBe(n);
    expect(plain(run.cell("total", "k99999"))).toBe(1);
    // A fill goes up from the leaf, so each read finds a finished cell (SHEET.FILL).
    const { compile, programs } = keeping();
    const filled = new SheetRun(new Map([["total", total]]), { space: space.tree(records, parents), domains: [NumDomain], compile });
    filled.fill();
    expect(plain(filled.cell("total", "k0"))).toBe(n);
    expect(programs[0]?.stats).toEqual({ runs: n, fallbacks: 0 });
  });

  it("SHEET.DEEP COMPILE.EXT: a chain that reads the next row, read at the first row, gives the length of the chain", () => {
    const n = 100_000;
    const chain = app("add", ref("v"), app("ifError", cell("c", [offset(1)]), lit(0)));
    const run = new SheetRun(new Map([["c", chain]]), { space: sheetRowsOf(Array.from({ length: n }, () => 1)), domains: [NumDomain], compile: tiered });
    expect(plain(run.cell("c", "0"))).toBe(n);
    // A fill goes from the last row up. The last row reads a row that does not exist, and ifError of tier 2 catches the error (COMPILE.EXT).
    const { compile, programs } = keeping();
    const filled = new SheetRun(new Map([["c", chain]]), { space: sheetRowsOf(Array.from({ length: n }, () => 1)), domains: [NumDomain], compile });
    filled.fill();
    expect(plain(filled.cell("c", "0"))).toBe(n);
    expect(programs[0]?.stats).toEqual({ runs: n, fallbacks: 0 });
  });
});

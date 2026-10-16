/**
 * The fast-check arbitraries of random sheets. A differential test evaluates a sheet with `SheetRun` and with
 * `ReferenceSheetRun`, and it compares the results of each read.
 */
import { app, axes, cell, each, index, lit, offset, ref, space, type Addr, type Expr, type Space } from "@mark1russell7/vex";
import * as fc from "fast-check";

/** The columns of a random sheet. */
export const SHEET_COLUMNS = ["A", "B", "C"] as const;

/** The addresses of the cell references of a random sheet: the focus, the rows near it, and the first row. */
const ADDRESSES: readonly Addr[] = [[], [offset(-1)], [offset(1)], [offset(-2)], [index(0)]];

/**
 * A formula of a random sheet: numbers, the field v, cell references, add, ifError and a sum over the other rows.
 * With `tables`, a formula can also sum a column over each row of a table (SHEET.TABLES).
 */
export const arbSheetFormula = (tables: readonly string[] = []): fc.Arbitrary<Expr> =>
  fc.letrec<{ e: Expr }>((tie) => ({
    e: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      fc.integer({ min: -5, max: 5 }).map((n): Expr => lit(n)),
      fc.constant(ref("v")),
      fc.tuple(fc.constantFrom(...SHEET_COLUMNS), fc.constantFrom(...ADDRESSES)).map(([c, at]): Expr => cell(c, at)),
      fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("add", a, b)),
      fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("ifError", a, b)),
      fc.constantFrom(...SHEET_COLUMNS).map((c): Expr => app("sum", each(axes.others, cell(c)))),
      ...(tables.length === 0 ? [] : [fc.tuple(fc.constantFrom(...tables), fc.constantFrom(...SHEET_COLUMNS)).map(([t, c]): Expr => app("sum", each(axes.table(t), cell(c))))]),
    ),
  })).e;

/** This function gives the columns A, B and C with the formulas `fs`. A missing formula is the number 0. */
export const sheetColumnsOf = (fs: readonly Expr[]): Map<string, Expr> => new Map(SHEET_COLUMNS.map((c, i) => [c, fs[i] ?? lit(0)]));

/** This function gives an array space with the field v. */
export const sheetRowsOf = (vs: readonly number[]): Space => space.array(vs.map((v) => ({ v })));

/** A random sheet: the formulas of its columns and of some cells, its rows, and an order of the reads of the host. */
export interface ArbSheet {
  readonly formulas: readonly [Expr, Expr, Expr];
  /** The cells with their own formula: the column, the key and the formula. A key can be outside the space. */
  readonly own: readonly (readonly [string, number, Expr])[];
  readonly rows: readonly number[];
  /** The reads of the host: the column and the key of each read. */
  readonly reads: readonly (readonly [string, string])[];
}

/**
 * A random sheet: a formula for each column, the formulas of some cells, a space of rows, and the reads of the host.
 * A cell formula can be at a key outside the space, and then no read finds it.
 */
export const arbSheet: fc.Arbitrary<ArbSheet> = fc
  .record({
    formulas: fc.tuple(arbSheetFormula(), arbSheetFormula(), arbSheetFormula()),
    own: fc.array(fc.tuple(fc.constantFrom(...SHEET_COLUMNS), fc.nat(7), arbSheetFormula()), { maxLength: 5 }),
    rows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 7 }),
  })
  .chain(({ formulas, own, rows }) =>
    fc.record({
      formulas: fc.constant(formulas),
      own: fc.constant(own),
      rows: fc.constant(rows),
      reads: fc.shuffledSubarray(
        rows.flatMap((_v, i) => SHEET_COLUMNS.map((c) => [c, String(i)] as const)),
        { minLength: rows.length * SHEET_COLUMNS.length },
      ),
    }),
  );

/** This function gives the formulas of the cells of a random sheet, for the option `cells` of a run. */
export function sheetCellsOf(own: ArbSheet["own"]): Map<string, Map<string, Expr>> {
  const cells = new Map<string, Map<string, Expr>>();
  for (const [c, k, f] of own) cells.set(c, new Map([...(cells.get(c) ?? []), [String(k), f]]));
  return cells;
}

/** Two random tables, "main" and "other": the formulas and the rows of each, and an order of the reads of the host. */
export interface ArbTwoTables {
  readonly main: readonly [Expr, Expr, Expr];
  readonly other: readonly [Expr, Expr, Expr];
  readonly mainRows: readonly number[];
  readonly otherRows: readonly number[];
  /** The reads of the host: the table, the column and the key of each read. */
  readonly reads: readonly (readonly [string, string, string])[];
}

/** Two random tables. A formula of each table can read a column of each table. */
export const arbTwoTables: fc.Arbitrary<ArbTwoTables> = fc
  .record({
    main: fc.tuple(arbSheetFormula(["main", "other"]), arbSheetFormula(["main", "other"]), arbSheetFormula(["main", "other"])),
    other: fc.tuple(arbSheetFormula(["main", "other"]), arbSheetFormula(["main", "other"]), arbSheetFormula(["main", "other"])),
    mainRows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 4 }),
    otherRows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 4 }),
  })
  .chain((t) =>
    fc.record({
      main: fc.constant(t.main),
      other: fc.constant(t.other),
      mainRows: fc.constant(t.mainRows),
      otherRows: fc.constant(t.otherRows),
      reads: fc.shuffledSubarray(
        [
          ...t.mainRows.flatMap((_v, i) => SHEET_COLUMNS.map((c) => ["main", c, String(i)] as const)),
          ...t.otherRows.flatMap((_v, i) => SHEET_COLUMNS.map((c) => ["other", c, String(i)] as const)),
        ],
        { minLength: 1 },
      ),
    }),
  );

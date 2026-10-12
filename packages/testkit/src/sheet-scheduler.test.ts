import { app, axes, cell, each, index, lit, offset, ref, SheetRun, space, type Addr, type Expr, type Result } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ReferenceSheetRun } from "./reference-sheet.ts";

const COLUMNS = ["A", "B", "C"] as const;
const ADDRESSES: readonly Addr[] = [[], [offset(-1)], [offset(1)], [offset(-2)], [index(0)]];

/** A formula of a random sheet: numbers, the field v, cell references, add, ifError and a sum over the other rows. */
const formula: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { maxDepth: 3, depthSize: "small" },
    fc.integer({ min: -5, max: 5 }).map((n): Expr => lit(n)),
    fc.constant(ref("v")),
    fc.tuple(fc.constantFrom(...COLUMNS), fc.constantFrom(...ADDRESSES)).map(([c, at]): Expr => cell(c, at)),
    fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("add", a, b)),
    fc.tuple(tie("e"), tie("e")).map(([a, b]): Expr => app("ifError", a, b)),
    fc.constantFrom(...COLUMNS).map((c): Expr => app("sum", each(axes.others, cell(c)))),
  ),
})).e;

/** A random sheet: a formula for each column, a space of rows, and an order of the reads of the host. */
const sheet = fc
  .record({
    formulas: fc.tuple(formula, formula, formula),
    rows: fc.array(fc.integer({ min: -3, max: 3 }), { minLength: 1, maxLength: 7 }),
  })
  .chain(({ formulas, rows }) =>
    fc.record({
      formulas: fc.constant(formulas),
      rows: fc.constant(rows),
      reads: fc.shuffledSubarray(
        rows.flatMap((_v, i) => COLUMNS.map((c) => [c, String(i)] as const)),
        { minLength: rows.length * COLUMNS.length },
      ),
    }),
  );

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

describe("the scheduler of a sheet run (SHEET.DEEP)", () => {
  it("SHEET.DEEP SHEET.CYCLE: SheetRun gives the results of the recursive search, also with a small stack budget", () => {
    fc.assert(
      fc.property(sheet, ({ formulas, rows, reads }) => {
        const columns = new Map(COLUMNS.map((c, i) => [c, formulas[i] ?? lit(0)]));
        const opts = { space: space.array(rows.map((v) => ({ v }))), domains: [NumDomain] };
        const reference = new ReferenceSheetRun(columns, opts);
        const expected = reads.map(([c, k]) => plain(reference.cell(c, k)));
        // The default budget, and budgets so small that most reads pause.
        for (const budget of [undefined, 1, 40]) {
          const run = budget === undefined ? new SheetRun(columns, opts) : new SheetRun(columns, opts, budget);
          expect(reads.map(([c, k]) => plain(run.cell(c, k)))).toEqual(expected);
        }
      }),
    );
  });
});

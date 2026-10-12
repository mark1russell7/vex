import type { Result } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LOAN_COLUMNS, loanFormula, loanReference, loanVex, type LoanMonth, type LoanTerms } from "./loan.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

const month = fc.record({ payment: fc.integer({ min: 0, max: 600 }), extra: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 300 })) });
const terms = fc.record({ principal: fc.integer({ min: 100, max: 20000 }), rate: fc.integer({ min: 0, max: 200 }).map((n) => n / 10000) });

describe("the loan pilot", () => {
  it("gives the hand-checked schedule of 1000 at 1 % a month with four payments of 260", () => {
    const months: LoanMonth[] = Array.from({ length: 4 }, () => ({ payment: 260, extra: 0 }));
    const t: LoanTerms = { principal: 1000, rate: 0.01 };
    const ref = loanReference(months, t);
    // Month 1: 1000 + 10 - 260 = 750. Month 2: 750 + 7.5 - 260 = 497.5. Month 3: 497.5 + 4.975 - 260 = 242.475.
    const expected = [750, 497.5, 242.475, -15.10025];
    ref.forEach((r, i) => expect(r.closing).toBeCloseTo(expected[i] ?? Number.NaN, 9));
    expect(ref.map((r) => r.paidOff)).toEqual([false, false, false, true]);
    const vexCells = loanVex(months, t);
    const formulaCells = loanFormula(months, t);
    for (const [i, row] of ref.entries()) {
      for (const c of LOAN_COLUMNS) {
        expect(plain(vexCells(String(i), c))).toBe(row[c]);
        expect(plain(formulaCells(String(i), c))).toBe(row[c]);
      }
    }
  });

  it("gives the same schedule with the builder, the formulas and the reference, for random loans", () => {
    fc.assert(
      fc.property(fc.array(month, { minLength: 1, maxLength: 60 }), terms, (months, t) => {
        const ref = loanReference(months, t);
        const vexCells = loanVex(months, t);
        const formulaCells = loanFormula(months, t);
        for (const [i, row] of ref.entries()) {
          for (const c of LOAN_COLUMNS) {
            const v = vexCells(String(i), c);
            expect(v).toEqual(formulaCells(String(i), c));
            expect(plain(v)).toBe(row[c]);
          }
        }
      }),
    );
  });

  it("gives a long schedule without a deep stack: 600 months", () => {
    const months: LoanMonth[] = Array.from({ length: 600 }, () => ({ payment: 50, extra: 0 }));
    const t: LoanTerms = { principal: 20000, rate: 0.002 };
    const ref = loanReference(months, t);
    expect(plain(loanFormula(months, t)("599", "closing"))).toBe(ref[599]?.closing);
    expect(plain(loanVex(months, t)("599", "closing"))).toBe(ref[599]?.closing);
  });
});

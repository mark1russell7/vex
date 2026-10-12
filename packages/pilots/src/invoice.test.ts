import type { Result } from "@mark1russell7/vex";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INVOICE_COLUMNS, invoiceFormula, invoiceReference, invoiceVex, LINE_COLUMNS, lineKey, type Field, type Invoice } from "./invoice.ts";

const plain = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** A field that is mostly a number, sometimes text, and sometimes no value. */
const field = (n: fc.Arbitrary<number>): fc.Arbitrary<Field> => fc.oneof({ weight: 8, arbitrary: n }, { weight: 1, arbitrary: fc.constant("n/a") }, { weight: 1, arbitrary: fc.constant(undefined) });

const invoices: fc.Arbitrary<Invoice[]> = fc
  .array(
    fc.record({
      lines: fc.array(fc.record({ qty: field(fc.integer({ min: -2, max: 20 })), price: field(fc.integer({ min: 0, max: 50000 }).map((c) => c / 100)) }), { maxLength: 6 }),
      discount: field(fc.integer({ min: -20, max: 120 }).map((p) => p / 100)),
      // The total is the amount due, a wrong amount, a text or no value.
      total: fc.oneof(fc.constant("due"), fc.integer({ min: 0, max: 100000 }).map((c) => c / 100), fc.constant("n/a"), fc.constant(undefined)),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((list) =>
    list.map((inv, i) => {
      const due = inv.lines.reduce((s, l) => s + (typeof l.qty === "number" && typeof l.price === "number" ? l.qty * l.price : 0), 0) * (1 - (typeof inv.discount === "number" ? inv.discount : 0));
      return { id: `inv${i}`, lines: inv.lines, discount: inv.discount, total: inv.total === "due" ? due : inv.total };
    }),
  );

describe("the invoice pilot", () => {
  const good: Invoice = { id: "A", total: 54, discount: 0.1, lines: [{ qty: 2, price: 10 }, { qty: 4, price: 10 }] };

  it("gives the hand-checked checks of an invoice that is correct", () => {
    // Lines: 2 x 10 = 20 and 4 x 10 = 40. The sum is 60, and 60 x (1 - 0.1) = 54, the total of the invoice.
    for (const cells of [invoiceVex([good]), invoiceFormula([good])]) {
      expect(LINE_COLUMNS.map((c) => plain(cells(lineKey("A", 0), c)))).toEqual([20, true]);
      expect(INVOICE_COLUMNS.map((c) => plain(cells("A", c)))).toEqual([60, 54, true, true]);
    }
  });

  it("gives error values with reasons for missing and bad fields, not exceptions", () => {
    const bad: Invoice = { id: "B", total: "n/a", discount: 1.5, lines: [{ qty: 2, price: undefined }, { qty: "n/a", price: 3 }, { qty: 0, price: 1 }] };
    for (const cells of [invoiceVex([bad]), invoiceFormula([bad])]) {
      const missing = cells(lineKey("B", 0), "lineTotal");
      expect(missing.ok ? "" : `${missing.error.code} ${missing.error.message}`).toMatch(/^#N\/A .*price/);
      // A text as the left value of "*" has no op "multiply": the error is #NAME?, not the #VALUE! of a spreadsheet.
      expect(plain(cells(lineKey("B", 1), "lineTotal"))).toBe("#NAME?");
      expect(plain(cells(lineKey("B", 2), "qtyOk"))).toBe(false);
      expect(plain(cells("B", "linesSum"))).toBe("#N/A");
      expect(plain(cells("B", "discountOk"))).toBe(false);
      const total = cells("B", "totalOk");
      expect(total.ok ? "" : total.error.message.length).toBeGreaterThan(0);
    }
  });

  it("gives the same checks with the builder, the formulas and the reference, for random invoices with bad fields", () => {
    fc.assert(
      fc.property(invoices, (list) => {
        const ref = invoiceReference(list);
        const vexCells = invoiceVex(list);
        const formulaCells = invoiceFormula(list);
        const check = (key: string, columns: readonly string[]): void => {
          for (const c of columns) {
            const v = vexCells(key, c);
            expect(v).toEqual(formulaCells(key, c));
            const r = ref.get(key)?.[c];
            expect(v.ok ? v.value : undefined).toBe(r);
            // An error value always has a reason.
            expect(v.ok || v.error.message !== "").toBe(true);
          }
        };
        for (const inv of list) {
          check(inv.id, INVOICE_COLUMNS);
          inv.lines.forEach((_l, i) => check(lineKey(inv.id, i), LINE_COLUMNS));
        }
      }),
    );
  });
});

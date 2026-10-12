/**
 * The invoice pilot. An invoice is a root with its line items as children. A line has a quantity and a price. The
 * invoice has a total and a discount. This module gives the checks of an invoice three times: with the typed
 * builder, with the formula language, and in plain TypeScript. A field that is missing or that is not a number gives
 * an error value with a reason, not an exception.
 *
 * - `lineTotal` (a line): the quantity times the price.
 * - `qtyOk` (a line): `true` if the quantity is positive.
 * - `linesSum` (an invoice): the sum of the line totals.
 * - `due` (an invoice): the sum of the lines less the discount.
 * - `totalOk` (an invoice): `true` if the total of the invoice is the amount due, within half a cent.
 * - `discountOk` (an invoice): `true` if the discount is from 0 to 1.
 */
import { space, vex, type Space } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { runFormulas, type FormulaCells } from "./formula-run.ts";

/** A field of the data: a number, a text that is not a number, or no value. */
export type Field = number | string | undefined;

/** A line item. */
export interface Line {
  readonly qty: Field;
  readonly price: Field;
}

/** An invoice with its lines. */
export interface Invoice {
  readonly id: string;
  readonly total: Field;
  readonly discount: Field;
  readonly lines: readonly Line[];
}

/** The columns of a line and the columns of an invoice. */
export const LINE_COLUMNS: readonly ["lineTotal", "qtyOk"] = ["lineTotal", "qtyOk"];
export const INVOICE_COLUMNS: readonly ["linesSum", "due", "totalOk", "discountOk"] = ["linesSum", "due", "totalOk", "discountOk"];

/**
 * The record of a row. The builder needs one record type for the invoices and the lines, and a type for each field.
 * The type says `number`, but the data can have no value or a text, and then a formula gives an error value.
 */
export interface InvoiceRecord {
  readonly qty: number;
  readonly price: number;
  readonly total: number;
  readonly discount: number;
}

/** The key of a line: the invoice id and the position of the line. */
export const lineKey = (invoice: string, i: number): string => `${invoice}/${i}`;

/** This function keeps the fields that have a value. */
const fields = (o: Readonly<Record<string, Field>>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** This function gives a field as a number, or `undefined` for a text or no value. */
const num = (f: Field): number | undefined => (typeof f === "number" ? f : undefined);

/** This function gives the tree space of the invoices. A field without a value is not in the record. */
export function invoiceSpace(invoices: readonly Invoice[]): Space<string, InvoiceRecord> {
  const records: Record<string, Record<string, unknown>> = {};
  const parents: Record<string, string | null> = {};
  for (const inv of invoices) {
    records[inv.id] = fields({ total: inv.total, discount: inv.discount });
    parents[inv.id] = null;
    inv.lines.forEach((l, i) => {
      records[lineKey(inv.id, i)] = fields({ qty: l.qty, price: l.price });
      parents[lineKey(inv.id, i)] = inv.id;
    });
  }
  return space.tree(records as unknown as Record<string, InvoiceRecord>, parents);
}

/** The result of a check in the reference: a value, or `undefined` for an error. */
export type RefCell = number | boolean | undefined;

/** The checks in plain TypeScript. An error is `undefined`, because the reference does not model the error codes. */
export function invoiceReference(invoices: readonly Invoice[]): Map<string, Readonly<Record<string, RefCell>>> {
  const out = new Map<string, Readonly<Record<string, RefCell>>>();
  for (const inv of invoices) {
    const totals = inv.lines.map((l) => {
      const q = num(l.qty);
      const p = num(l.price);
      return q === undefined || p === undefined ? undefined : q * p;
    });
    inv.lines.forEach((l, i) => {
      const q = num(l.qty);
      out.set(lineKey(inv.id, i), { lineTotal: totals[i], qtyOk: q === undefined ? undefined : q > 0 });
    });
    const sum = totals.some((t) => t === undefined) ? undefined : totals.reduce((s: number, t) => s + (t ?? 0), 0);
    const d = num(inv.discount);
    const due = sum === undefined || d === undefined ? undefined : sum * (1 - d);
    const t = num(inv.total);
    out.set(inv.id, {
      linesSum: sum,
      due,
      totalOk: t === undefined || due === undefined ? undefined : Math.abs(t - due) <= 0.005,
      discountOk: d === undefined ? undefined : d >= 0 && d <= 1,
    });
  }
  return out;
}

/** The checks with the typed builder. */
export function invoiceVex(invoices: readonly Invoice[]): FormulaCells {
  const root = vex(NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain).over(invoiceSpace(invoices));
  const s = root
    .sheet()
    .column("lineTotal", (r) => r.from("qty")._.multiply("price"))
    .column("qtyOk", (r) => r.from("qty")._.gt(0))
    .column("linesSum", (r) => r.start(0).children(() => r.start(r.cell("lineTotal"))).sum({ strict: true }))
    .column("due", (r) => r.start(r.cell("linesSum"))._.multiply(r.start(1)._.subtract("discount")))
    .column("totalOk", (r) => r.from("total")._.subtract(r.cell("due"))._.abs()._.lte(0.005))
    .column("discountOk", (r) => r.from("discount")._.gte(0)._.and(r.from("discount")._.lte(1)));
  return (key, column) => s.result(key, column as "due");
}

/** The formulas of the checks, in the formula language. */
export const INVOICE_FORMULAS: Readonly<Record<(typeof LINE_COLUMNS)[number] | (typeof INVOICE_COLUMNS)[number], string>> = {
  lineTotal: "= qty * price",
  qtyOk: "= qty > 0",
  linesSum: "= SUM(children.lineTotal)",
  due: "= linesSum * (1 - discount)",
  totalOk: "= ABS(total - due) <= 0.005",
  discountOk: "= AND(discount >= 0, discount <= 1)",
};

/** The checks with the formula language. */
export function invoiceFormula(invoices: readonly Invoice[]): FormulaCells {
  return runFormulas(invoiceSpace(invoices), ["qty", "price", "total", "discount"], INVOICE_FORMULAS);
}

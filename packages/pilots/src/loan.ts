/**
 * The loan pilot. A loan schedule is a recurrence over the months: the opening balance of a month is the closing
 * balance of the month before. The interest is the opening balance times the monthly rate. The closing balance is the
 * opening balance plus the interest, less the payment and the extra payment. This module gives the schedule three
 * times: with the typed builder, with the formula language, and in plain TypeScript.
 */
import { offset, space, vex } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";
import { runFormulas, type FormulaCells } from "./formula-run.ts";

/** One month of a loan: the payment and an extra payment. */
export interface LoanMonth {
  readonly payment: number;
  readonly extra: number;
}

/** The terms of a loan: the principal and the rate for one month. */
export interface LoanTerms {
  readonly principal: number;
  readonly rate: number;
}

/** One row of the schedule. */
export interface LoanRow {
  readonly opening: number;
  readonly interest: number;
  readonly closing: number;
  readonly paidOff: boolean;
}

/** The computed columns of the schedule. */
export const LOAN_COLUMNS: readonly (keyof LoanRow)[] = ["opening", "interest", "closing", "paidOff"];

/** The schedule in plain TypeScript. */
export function loanReference(months: readonly LoanMonth[], terms: LoanTerms): LoanRow[] {
  const out: LoanRow[] = [];
  let opening = terms.principal;
  for (const m of months) {
    const interest = opening * terms.rate;
    const closing = opening + interest - m.payment - m.extra;
    out.push({ opening, interest, closing, paidOff: closing <= 0 });
    opening = closing;
  }
  return out;
}

/** The schedule with the typed builder: a sheet with a recurrence over the rows of an array space. */
export function loanVex(months: readonly LoanMonth[], terms: LoanTerms): FormulaCells {
  const rows = vex(NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain).over(space.array(months));
  const s = rows
    .sheet()
    .declare<{ closing: number }>()
    .column("opening", (r) => r.start(r.cell("closing", [offset(-1)])).ifError(terms.principal))
    .column("interest", (r) => r.start(r.cell("opening"))._.multiply(terms.rate))
    .column("closing", (r) => r.start(r.cell("opening"))._.add(r.cell("interest"))._.subtract("payment")._.subtract("extra"))
    .column("paidOff", (r) => r.start(r.cell("closing"))._.lte(0));
  return (key, column) => s.result(`${Number(key)}`, column as "opening");
}

/** The formulas of the schedule, in the formula language of the sheet app. */
export function loanFormulas(terms: LoanTerms): Readonly<Record<keyof LoanRow, string>> {
  return {
    opening: `= IFERROR(row(-1).closing, ${String(terms.principal)})`,
    interest: `= opening * ${String(terms.rate)}`,
    closing: "= opening + interest - payment - extra",
    paidOff: "= closing <= 0",
  };
}

/** The schedule with the formula language, on an array space. */
export function loanFormula(months: readonly LoanMonth[], terms: LoanTerms): FormulaCells {
  return runFormulas(space.array(months), ["payment", "extra"], loanFormulas(terms));
}

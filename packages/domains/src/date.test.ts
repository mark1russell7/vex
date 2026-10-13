import { evaluate, app, lit, parse, serialize, space, type Result } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { DateDomain, LocalDate, MAX_DAYS } from "./date.ts";
import { NumDomain } from "./scalars.ts";

const at = (iso: string): LocalDate => {
  const d = LocalDate.parse(iso);
  if (d === undefined) throw new Error(iso);
  return d;
};
const text = (d: unknown): string => (d instanceof LocalDate ? d.toString() : String(d));
const one = space.record({ A: {} });
/** The result of an op of the domains Num and Date, as a value or an error code. */
function run(receiver: unknown, op: string, ...args: unknown[]): unknown {
  const r: Result<unknown> = evaluate(app(op, lit(receiver), ...args.map(lit)), { space: one, origin: "A", domains: [NumDomain, DateDomain] });
  return r.ok ? r.value : r.error.code;
}

describe("dates (DateDomain)", () => {
  it("counts the days from 1970-01-01, and reads and writes the form YYYY-MM-DD", () => {
    // The numbers of days come from Date.parse of JavaScript, a check that does not use LocalDate.
    expect([at("1970-01-01").days, at("2000-01-01").days, at("2026-10-13").days]).toEqual([0, 10957, 20739]);
    expect(at(" 2026-10-13 ").toString()).toBe("2026-10-13");
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-5", "13/10/2026", ""]) expect(LocalDate.parse(bad)).toBeUndefined();
    expect([at("2024-02-29").toString(), at("+010000-01-01").year(), at("0000-03-01").toString()]).toEqual(["2024-02-29", 10000, "0000-03-01"]);
    expect([new LocalDate(at("+010000-01-01").days).toString(), LocalDate.of(-1, 12, 31).toString()]).toEqual(["+010000-01-01", "-000001-12-31"]);
  });

  it("makes a date from a year, a month and a day, and a month or a day outside its range rolls over", () => {
    expect([LocalDate.of(2026, 13, 1), LocalDate.of(2026, 3, 0), LocalDate.of(2026, 1, 32), LocalDate.of(99, 1, 1)].map(text)).toEqual(["2027-01-01", "2026-02-28", "2026-02-01", "0099-01-01"]);
    expect(Number.isNaN(LocalDate.of(2026, 1.5, 1).days)).toBe(true);
  });

  it("gives the parts of a date, and the day of the week from 1 (Sunday) to 7 (Saturday)", () => {
    const d = at("2026-10-13");
    expect([d.year(), d.month(), d.day()]).toEqual([2026, 10, 13]);
    // 2026-10-13 is a Tuesday, and 1970-01-01 is a Thursday.
    expect([d.weekday(), new LocalDate(0).weekday()]).toEqual([3, 5]);
  });

  it("adds days and months, and subtracts a date or a number of days", () => {
    const d = at("2026-10-13");
    expect([text(d.add(30)), text(d.add(-13)), d.subtract(at("2026-12-25")), text(d.subtract(13))]).toEqual(["2026-11-12", "2026-09-30", -73, "2026-09-30"]);
    expect([at("2026-01-31").addMonths(1), at("2024-01-31").addMonths(1), at("2026-03-31").addMonths(-1), at("2026-10-13").addMonths(12)].map(text)).toEqual(["2026-02-28", "2024-02-29", "2026-02-28", "2027-10-13"]);
    expect([at("2026-02-10").endOfMonth(0), at("2026-02-10").endOfMonth(1), at("2026-02-10").endOfMonth(-1)].map(text)).toEqual(["2026-02-28", "2026-03-31", "2026-01-31"]);
    expect([d.addMonths(0.5).days, d.endOfMonth(0.5).days].every(Number.isNaN)).toBe(true);
  });

  it("compares dates", () => {
    const [a, b] = [at("2026-10-13"), at("2026-10-14")];
    expect([a.lt(b), a.lte(a), b.gt(a), b.gte(b), a.eq(at("2026-10-13")), a.gt(b), b.lt(a), b.lte(a), a.gte(b), a.eq(b)]).toEqual([true, true, true, true, true, false, false, false, false, false]);
  });

  it("is a domain: a valid date is a whole number of days within MAX_DAYS, and JSON keeps a date", () => {
    expect([DateDomain.valid?.(new LocalDate(MAX_DAYS)), DateDomain.valid?.(new LocalDate(MAX_DAYS + 1)), DateDomain.valid?.(new LocalDate(-MAX_DAYS - 1)), DateDomain.valid?.(new LocalDate(0.5))]).toEqual([true, false, false, false]);
    expect([DateDomain.show?.(at("2026-10-13")), DateDomain.is(at("2026-10-13")), DateDomain.is("2026-10-13")]).toEqual(["2026-10-13", true, false]);
    const e = lit(at("2026-10-13"));
    const json = serialize(e, [DateDomain]);
    expect(json.ok && parse(json.value, [DateDomain])).toEqual({ ok: true, value: e });
    expect(Number.isNaN(DateDomain.decode?.(7).days)).toBe(true);
    expect(Number.isNaN(DateDomain.decode?.("2026-02-30").days)).toBe(true);
  });

  it("evaluates the ops in an expression: date(year, month, day) of a number, days between dates, and #NUM! for a date that is not valid", () => {
    expect(text(run(2026, "date", 10, 13))).toBe("2026-10-13");
    expect([run(2026, "date", 1.5, 1), run(1e9, "date", 1, 1)]).toEqual(["#NUM!", "#NUM!"]);
    expect([text(run(at("2026-10-13"), "add", 30)), run(at("2026-12-25"), "subtract", at("2026-10-13")), run(at("2026-10-13"), "weekday")]).toEqual(["2026-11-12", 73, 3]);
    expect([run(at("2026-10-13"), "add", 0.5), run(at("2026-10-13"), "addMonths", 0.5)]).toEqual(["#NUM!", "#NUM!"]);
  });
});

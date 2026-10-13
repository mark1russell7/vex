import { defineDomain, type Domain, type OpTable } from "@mark1russell7/vex";

const MS_PER_DAY = 86_400_000;

/** The largest distance from 1970-01-01 in days. The `Date` of JavaScript has the same range. */
export const MAX_DAYS = 100_000_000;

const ISO = /^([+-]?\d{4,6})-(\d{2})-(\d{2})$/;

/** This function gives the `Date` of JavaScript at 00:00 UTC of a day. */
const utc = (days: number): Date => new Date(days * MS_PER_DAY);

/**
 * An immutable day of the calendar, without a time and without a time zone. It keeps the number of days since
 * 1970-01-01, so the arithmetic of days is the arithmetic of numbers. The calendar is the Gregorian calendar, also
 * before 1582.
 */
export class LocalDate {
  /** The number of days since 1970-01-01. */
  readonly days: number;

  constructor(days: number) {
    this.days = days;
  }

  /**
   * This function makes a date from a year, a month from 1 to 12, and a day. A month or a day outside its range rolls
   * over, like the function `DATE` of a spreadsheet. Thus month 13 is January of the next year, and day 0 is the last
   * day of the month before. A number that is not whole gives a date that is not valid.
   */
  static of(year: number, month: number, day: number): LocalDate {
    if (![year, month, day].every(Number.isSafeInteger)) return new LocalDate(Number.NaN);
    // setUTCFullYear does not change the years 0 to 99 into 1900 to 1999, but Date.UTC does.
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    return new LocalDate(Math.round(d.getTime() / MS_PER_DAY));
  }

  /** This function reads a date in the form `YYYY-MM-DD`. A day that does not exist, for example `2026-02-30`, gives `undefined`. */
  static parse(text: string): LocalDate | undefined {
    const m = ISO.exec(text.trim());
    if (m === null) return undefined;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = LocalDate.of(y, mo, d);
    return date.year() === y && date.month() === mo && date.day() === d ? date : undefined;
  }

  /** The year. */
  year(): number {
    return utc(this.days).getUTCFullYear();
  }
  /** The month, from 1 to 12. */
  month(): number {
    return utc(this.days).getUTCMonth() + 1;
  }
  /** The day of the month, from 1 to 31. */
  day(): number {
    return utc(this.days).getUTCDate();
  }
  /** The day of the week, from 1 (Sunday) to 7 (Saturday), like `WEEKDAY` of a spreadsheet. */
  weekday(): number {
    return utc(this.days).getUTCDay() + 1;
  }
  /** The date `n` days later. A negative `n` goes back. */
  add(n: number): LocalDate {
    return new LocalDate(this.days + n);
  }
  /** The number of days from the date `x` to this date, or the date `x` days before this date. */
  subtract(x: LocalDate | number): LocalDate | number {
    return x instanceof LocalDate ? this.days - x.days : new LocalDate(this.days - x);
  }
  /**
   * The same day `n` months later, like `EDATE` of a spreadsheet. When that month is shorter, the result is its last
   * day: one month after 31 January is the last day of February.
   */
  addMonths(n: number): LocalDate {
    if (!Number.isSafeInteger(n)) return new LocalDate(Number.NaN);
    const first = LocalDate.of(this.year(), this.month() + n, 1);
    const last = LocalDate.of(first.year(), first.month() + 1, 0);
    return new LocalDate(Math.min(first.days + this.day() - 1, last.days));
  }
  /** The last day of the month `n` months later, like `EOMONTH` of a spreadsheet. */
  endOfMonth(n: number): LocalDate {
    if (!Number.isSafeInteger(n)) return new LocalDate(Number.NaN);
    return LocalDate.of(this.year(), this.month() + n + 1, 0);
  }
  gt(o: LocalDate): boolean {
    return this.days > o.days;
  }
  gte(o: LocalDate): boolean {
    return this.days >= o.days;
  }
  lt(o: LocalDate): boolean {
    return this.days < o.days;
  }
  lte(o: LocalDate): boolean {
    return this.days <= o.days;
  }
  eq(o: LocalDate): boolean {
    return this.days === o.days;
  }
  /** The form `YYYY-MM-DD`. A year before 0 or after 9999 has a sign and six digits, as in ISO 8601. */
  toString(): string {
    const y = this.year();
    const year = y >= 0 && y <= 9999 ? String(y).padStart(4, "0") : `${y < 0 ? "-" : "+"}${String(Math.abs(y)).padStart(6, "0")}`;
    return `${year}-${String(this.month()).padStart(2, "0")}-${String(this.day()).padStart(2, "0")}`;
  }
}

/** The ops of `DateDomain`. */
export type DateOps = OpTable<LocalDate, "add" | "subtract" | "addMonths" | "endOfMonth" | "year" | "month" | "day" | "weekday" | "gt" | "gte" | "lt" | "lte" | "eq">;

/**
 * The domain of dates. `add` takes a count of days. `subtract` takes a date, for the days between the two dates, or a
 * count of days. A valid date is a whole count of days, within `MAX_DAYS` of 1970-01-01.
 */
export const DateDomain: Domain<"Date", LocalDate, DateOps> = defineDomain<"Date", LocalDate, DateOps>({
  name: "Date",
  is: (u: unknown): u is LocalDate => u instanceof LocalDate,
  valid: (d: LocalDate): boolean => Number.isSafeInteger(d.days) && Math.abs(d.days) <= MAX_DAYS,
  show: (d: LocalDate): string => d.toString(),
  encode: (d: LocalDate): string => d.toString(),
  decode: (u: unknown): LocalDate => (typeof u === "string" ? LocalDate.parse(u) : undefined) ?? new LocalDate(Number.NaN),
  ops: {
    add: { params: ["number"] },
    subtract: { params: ["any"] },
    addMonths: { params: ["number"] },
    endOfMonth: { params: ["number"] },
    year: {},
    month: {},
    day: {},
    weekday: {},
    gt: { params: ["domain"] },
    gte: { params: ["domain"] },
    lt: { params: ["domain"] },
    lte: { params: ["domain"] },
    eq: { laws: ["commutative"], params: ["domain"] },
  },
});

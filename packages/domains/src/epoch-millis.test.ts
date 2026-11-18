/**
 * The op `epochMillis` of `TextDomain` (TEXT.EPOCHMILLIS): it reads an ISO 8601 time and gives the milliseconds since
 * 1970-01-01T00:00:00Z. The expected numbers come from `Date.UTC` and `Date.parse` of JavaScript, a check that does not
 * use the function of the op.
 */
import { app, evaluate, lit, space, type AnyDomain, type Result } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { DateDomain } from "./date.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";

const ONE = space.record({ A: {} });
const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain];

/** This function gives the value of `epochMillis` of a text, or the code and the kind of its error. */
function millis(text: unknown, domains: readonly AnyDomain[] = DOMAINS): unknown {
  const r: Result<unknown> = evaluate(app("epochMillis", lit(text)), { space: ONE, origin: "A", domains });
  return r.ok ? r.value : `${r.error.code} ${r.error.kind}`;
}

/** This function gives the value of an op of two times, or the code of its error. */
function compare(op: string, a: string, b: string): unknown {
  const r = evaluate(app(op, app("epochMillis", lit(a)), app("epochMillis", lit(b))), { space: ONE, origin: "A", domains: DOMAINS });
  return r.ok ? r.value : r.error.code;
}

describe("the op epochMillis of TextDomain (TEXT.EPOCHMILLIS)", () => {
  it("TEXT.EPOCHMILLIS: gives the milliseconds since 1970-01-01T00:00:00Z of a date or of a time with Z or an offset", () => {
    expect(millis("1970-01-01")).toBe(0);
    // A date alone is 00:00 UTC of the day.
    expect(millis("2026-03-01")).toBe(Date.UTC(2026, 2, 1));
    expect(millis("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
    expect(millis("2026-03-01T12:30Z")).toBe(Date.UTC(2026, 2, 1, 12, 30));
    expect(millis("2026-03-01T12:30:15Z")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15));
    expect(millis("2026-03-01T12:30:15.250Z")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15, 250));
    // An offset gives the same instant as its time in UTC.
    expect(millis("2026-03-01T07:30:15.250-05:00")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15, 250));
    expect(millis("2026-03-01T18:00+05:30")).toBe(Date.UTC(2026, 2, 1, 12, 30));
    expect(millis("2026-03-01T12:30+00:00")).toBe(millis("2026-03-01T12:30Z"));
    // Only the first three digits of a fraction count, and a short fraction is tenths or hundredths.
    expect(millis("2026-03-01T12:30:15.5Z")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15, 500));
    expect(millis("2026-03-01T12:30:15.05Z")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15, 50));
    expect(millis("2026-03-01T12:30:15.123999Z")).toBe(Date.UTC(2026, 2, 1, 12, 30, 15, 123));
    // The years 0 to 99 stay, and Date.UTC alone would make them 1900 to 1999.
    expect(millis("0000-01-01")).toBe(Date.parse("0000-01-01T00:00:00Z"));
    expect(millis("0099-12-31T23:59:59.999Z")).toBe(Date.parse("0099-12-31T23:59:59.999Z"));
    expect(millis("9999-12-31T23:59:59.999Z")).toBe(Date.parse("9999-12-31T23:59:59.999Z"));
  });

  it("TEXT.EPOCHMILLIS: gives the instant of the text of toISOString for times from the year 0 to the year 9999", () => {
    const start = Date.parse("0000-01-01T00:00:00Z");
    const end = Date.parse("9999-12-31T23:59:59.999Z");
    // 997 steps of a size that is not a whole number of days give times at many hours and milliseconds.
    const step = Math.floor((end - start) / 997) + 7;
    const times = Array.from({ length: 998 }, (_x, i) => Math.min(start + i * step, end));
    const wrong = times.filter((t) => millis(new Date(t).toISOString()) !== t);
    expect(wrong).toEqual([]);
  });

  it("TEXT.EPOCHMILLIS: lt and gt of NumDomain compare two times, also where the order of the texts is wrong", () => {
    // The text "12.5Z" comes before "12Z", but the time 12.5 s comes after 12 s.
    expect(compare("gt", "2026-03-01T00:00:12.5Z", "2026-03-01T00:00:12Z")).toBe(true);
    expect(["2026-03-01T00:00:12Z", "2026-03-01T00:00:12.5Z"].toSorted()).toEqual(["2026-03-01T00:00:12.5Z", "2026-03-01T00:00:12Z"]);
    // 09:00 at +02:00 is 07:00 UTC, so it is earlier than 08:00 UTC.
    expect(compare("lt", "2026-03-01T09:00+02:00", "2026-03-01T08:00Z")).toBe(true);
    expect(compare("gte", "2026-03-01", "2026-02-28T23:59:59.999Z")).toBe(true);
    expect(compare("eq", "2026-03-01T00:00Z", "2026-03-01")).toBe(true);
  });

  it("TEXT.EPOCHMILLIS: gives #CALC! for a text that is not an ISO 8601 time, a time without a zone, or a day that does not exist", () => {
    const bad = [
      "",
      "x",
      "2026-3-01",
      " 2026-03-01",
      "2026-03-01 ",
      "2026/03/01",
      "2026-03-01T12:30",
      "2026-03-01T12:30:15",
      "2026-03-01 12:30Z",
      "2026-03-01t12:30z",
      "2026-03-01T12Z",
      "2026-03-01T12:30.5Z",
      "2026-03-01T12:30:15.Z",
      "2026-03-01T12:30+0500",
      "2026-03-01T12:30+05",
      "+002026-03-01",
      "2026-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-04-31",
      "2026-03-00",
      "2026-03-01T24:00Z",
      "2026-03-01T12:60Z",
      "2026-03-01T12:30:60Z",
      "2026-03-01T12:30+24:00",
      "2026-03-01T12:30+05:60",
    ];
    expect(bad.filter((t) => millis(t) !== "#CALC! threw")).toEqual([]);
    // 1900 is not a leap year, and 2000 is one.
    expect([millis("1900-02-29"), millis("2000-02-29")]).toEqual(["#CALC! threw", Date.UTC(2000, 1, 29)]);
  });

  it("TEXT.EPOCHMILLIS: a receiver that is not a text has no op", () => {
    expect(millis(5)).toBe("#NAME? unknown-op");
    expect(millis(true)).toBe("#NAME? unknown-op");
    // Without TextDomain, a text has no domain.
    expect(millis("2026-03-01", [NumDomain, DateDomain])).toBe("#VALUE! not-instance");
  });
});

/**
 * The functions of the formula language. A built-in function has its own rule in `spec/formula.md`. Each other
 * function name is an op of the standard domains, without a difference between capital and small letters.
 */
import type { AnyDomain, ParamKind } from "@mark1russell7/vex";
import { AngleDomain, BoolDomain, ColorDomain, DateDomain, NumDomain, TextDomain, Vec2Domain } from "@mark1russell7/vex-domains";

/** The domains of the formula language. The app gives them to the evaluation of a sheet. */
export const FORMULA_DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, Vec2Domain, ColorDomain, AngleDomain, DateDomain];

/** The description of one function, for completion and the docs. */
export interface FunctionInfo {
  readonly name: string;
  readonly signature: string;
  readonly summary: string;
}

/** The built-in functions, with their own rules. */
const BUILT_INS: readonly FunctionInfo[] = [
  { name: "IF", signature: "IF(test, then, [else])", summary: "The value `then` when the test is TRUE, else the value `else` (FALSE by default). Only one branch evaluates." },
  { name: "IFERROR", signature: "IFERROR(value, fallback)", summary: "The value, or the fallback when the value is an error." },
  { name: "AND", signature: "AND(test, ...)", summary: "TRUE when each test is TRUE. It stops at the first FALSE." },
  { name: "OR", signature: "OR(test, ...)", summary: "TRUE when a test is TRUE. It stops at the first TRUE." },
  { name: "NOT", signature: "NOT(test)", summary: "TRUE for FALSE, and FALSE for TRUE." },
  { name: "SUM", signature: "SUM(axis.column) or SUM(axis [WHERE test], value)", summary: "The sum of the values at the rows of the axis. An error at one row makes the sum an error." },
  { name: "AVERAGE", signature: "AVERAGE(axis.column) or AVERAGE(axis [WHERE test], value)", summary: "The mean of the values at the rows of the axis. An error at one row makes the mean an error." },
  { name: "MIN", signature: "MIN(axis.column) or MIN(axis [WHERE test], value)", summary: "The smallest value at the rows of the axis. With two numbers, the smaller number." },
  { name: "MAX", signature: "MAX(axis.column) or MAX(axis [WHERE test], value)", summary: "The largest value at the rows of the axis. With two numbers, the larger number." },
  { name: "COUNT", signature: "COUNT(axis [WHERE test])", summary: "The number of rows of the axis, or of the rows where the test is TRUE." },
  { name: "ANY", signature: "ANY(axis.column) or ANY(axis [WHERE test], test)", summary: "TRUE when the test is TRUE at a row of the axis." },
  { name: "ALL", signature: "ALL(axis.column) or ALL(axis [WHERE test], test)", summary: "TRUE when the test is TRUE at each row of the axis." },
  { name: "ITERATE", signature: "ITERATE(limit, name, first, step, ..., result, [UNTIL test])", summary: "The result after up to `limit` steps. Each step gives each name its next value. A true test stops the steps." },
  { name: "FOLD", signature: "FOLD(axis [WHERE test], name, first, step, ..., result)", summary: "The result after one step at each row of the axis, in order. Each step gives each name its next value." },
  { name: "RANK", signature: "RANK(value)", summary: "1 plus the number of other rows with a larger value. The row with the largest value has the rank 1." },
  { name: "VEC", signature: "VEC(x, y)", summary: "The vector with the components x and y." },
  { name: "X", signature: "X(vector)", summary: "The x component of the vector." },
  { name: "Y", signature: "Y(vector)", summary: "The y component of the vector." },
  { name: "DATE", signature: "DATE(year, month, day)", summary: "The date of the year, the month and the day. A month or a day outside its range rolls over." },
  { name: "YEAR", signature: "YEAR(date)", summary: "The year of the date." },
  { name: "MONTH", signature: "MONTH(date)", summary: "The month of the date, from 1 to 12." },
  { name: "DAY", signature: "DAY(date)", summary: "The day of the month of the date, from 1 to 31." },
  { name: "WEEKDAY", signature: "WEEKDAY(date)", summary: "The day of the week of the date, from 1 (Sunday) to 7 (Saturday)." },
  { name: "EDATE", signature: "EDATE(date, months)", summary: "The same day some months later. When that month is shorter, its last day." },
  { name: "EOMONTH", signature: "EOMONTH(date, months)", summary: "The last day of the month some months later. EOMONTH(date, 0) is the end of the month of the date." },
  { name: "PMT", signature: "PMT(rate, nper, pv, [fv], [type])", summary: "The payment of each period of a loan or a saving. Money that you pay is negative." },
  { name: "FV", signature: "FV(rate, nper, pmt, [pv], [type])", summary: "The value at the end of the periods, after the payments. Money that you pay is negative." },
  { name: "PV", signature: "PV(rate, nper, pmt, [fv], [type])", summary: "The value now of the payments of the periods. Money that you pay is negative." },
  { name: "NPER", signature: "NPER(rate, pmt, pv, [fv], [type])", summary: "The number of periods that the payments need to reach the value fv (0 by default)." },
];

/** The names of the built-in functions, in capital letters. */
export const BUILT_IN_NAMES: ReadonlySet<string> = new Set(BUILT_INS.map((f) => f.name));

const RECEIVER: Readonly<Record<string, string>> = { Num: "number", Bool: "test", Text: "text", Vec2: "vector", Color: "color", Angle: "angle" };
const PARAM: Readonly<Record<ParamKind, string>> = { domain: "value", number: "number", boolean: "test", string: "text", any: "value" };

/** The op names of the standard domains, by their name in small letters. */
export const OP_NAMES: ReadonlyMap<string, string> = new Map(FORMULA_DOMAINS.flatMap((d) => Object.keys(d.ops).map((op) => [op.toLowerCase(), op] as const)));

/** One entry for each op name of the standard domains that is not a built-in function. */
function opFunctions(): readonly FunctionInfo[] {
  const byName = new Map<string, { signature: string; domains: string[]; op: string }>();
  for (const d of FORMULA_DOMAINS) {
    for (const [op, spec] of Object.entries(d.ops)) {
      const name = op.toUpperCase();
      if (BUILT_IN_NAMES.has(name)) continue;
      const entry = byName.get(name);
      if (entry !== undefined) {
        entry.domains.push(d.name);
        continue;
      }
      const params = ((spec as { params?: readonly ParamKind[] }).params ?? []).map((p) => PARAM[p]);
      byName.set(name, { signature: `${name}(${[RECEIVER[d.name] ?? "value", ...params].join(", ")})`, domains: [d.name], op });
    }
  }
  return [...byName.entries()].map(([name, e]) => ({ name, signature: e.signature, summary: `The op \`${e.op}\` of the domain${e.domains.length > 1 ? "s" : ""} ${e.domains.join(", ")}.` }));
}

/** Each function of the formula language: first the built-in functions, then the ops of the standard domains. */
export const FUNCTIONS: readonly FunctionInfo[] = [...BUILT_INS, ...opFunctions()];

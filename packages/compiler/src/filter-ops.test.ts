/**
 * The ops of a filter of records in each tier: `includes` (LIST.INCLUDES), `epochMillis` of `TextDomain`
 * (TEXT.EPOCHMILLIS), and `ifError` as the default of a missing field (FORM.IFERROR). A filter of a list of tasks is
 * the case of the tests: a search text, a field with one of some values, and a time range. Each program gives the same
 * value in the interpreter, the reference tier and tier 2, and a module gives the same value or a reason.
 */
import { app, axes, each, evaluate, lit, ref, space, v, type AnyDomain, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, JsonDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { fromCore, fromReference, referenceEvaluate } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain];

/** The tasks of the tests. Some tasks have no state or no time, and one time is not an ISO 8601 text. */
const TASKS = [
  { kind: "ask", state: "open", title: "Write the Report", at: "2026-03-02T09:00:00Z" },
  { kind: "request", state: "open", title: "Check the report", at: "2026-03-01T23:30:00-05:00" },
  { kind: "request", state: "done", title: "Report the totals", at: "2026-02-27" },
  { kind: "note", state: "open", title: "A note", at: "2026-03-03T10:15:30.5Z" },
  { kind: "ask", title: "No state", at: "2026-03-02T12:00Z" },
  { kind: "ask", state: "open", title: "A report with no time" },
  { kind: "ask", state: "open", title: "A report at a bad time", at: "March 2" },
];
const RECORDS = space.array(TASKS);

/** This function gives the result of each tier at each key, in the comparable form of the test kit. */
function tiers(e: Expr, s: Space, domains: readonly AnyDomain[] = DOMAINS, vars: Readonly<Record<string, unknown>> = {}): { readonly tier: number; readonly agree: boolean; readonly values: readonly unknown[] } {
  const p = tiered(e, { domains });
  const rows = s.keys.map((origin) => {
    const run = { domains, space: s, origin, vars };
    const one = fromCore(evaluate(e, run));
    const two = fromCore(p.run({ space: s, origin, vars }));
    const kernel = fromReference(referenceEvaluate(e, run));
    return JSON.stringify(one) === JSON.stringify(two) && JSON.stringify(one) === JSON.stringify(kernel) ? one : { differ: [one, two, kernel] };
  });
  return { tier: p.tier, agree: rows.every((x) => !("differ" in (x as object))), values: rows };
}

/** This function gives the value of each tier at each key, or the code of its error, and checks that the tiers agree. */
function values(e: Expr, s: Space = RECORDS, domains: readonly AnyDomain[] = DOMAINS, vars: Readonly<Record<string, unknown>> = {}): readonly unknown[] {
  const t = tiers(e, s, domains, vars);
  expect(t.values.filter((x) => "differ" in (x as object))).toEqual([]);
  return t.values.map((x) => {
    const c = x as { readonly ok: boolean; readonly value?: unknown; readonly code?: string };
    return c.ok ? c.value : c.code;
  });
}

type Run = (records: unknown, vars: unknown) => readonly unknown[];

/** This function makes the run of a module of a program, and fails the test for a program that cannot be a module. */
function moduleRun(e: Expr, options: ModuleOptions): Run {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn run;`)() as Run;
}

/** This function tells if a value of a module is an error of Vex. */
const isError = (u: unknown): boolean => typeof u === "object" && u !== null && "vexError" in u;

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr, options: ModuleOptions): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

const kind = ref("kind");
const state = ref("state");
const at = ref("at");
const millis = (x: Expr): Expr => app("epochMillis", x);

describe("the ops of a filter of records", () => {
  it("LIST.INCLUDES COMPILE.LIST.VALUE COMPILE.LIST.ARRAY: tier 2 gives includes on a list and on an array, and a module gives a reason", () => {
    const kinds = each(axes.all, kind);
    const cases: readonly (readonly [Expr, readonly unknown[]])[] = [
      [app("includes", lit(["ask", "request"]), kind), [true, true, true, false, true, true, true]],
      [app("includes", v("picked"), kind), [false, true, true, true, false, false, false]],
      [app("includes", kinds, lit("note")), Array.from(TASKS, () => true)],
      [app("includes", kinds, lit("idea")), Array.from(TASKS, () => false)],
      [app("includes", lit([1, 2]), lit("a")), Array.from(TASKS, () => "#VALUE!")],
      // No domain accepts a record, so the value has no eq.
      [app("includes", lit(["a"]), lit({ a: 1 })), Array.from(TASKS, () => "#NAME?")],
    ];
    for (const [e, want] of cases) {
      expect(values(e, RECORDS, DOMAINS, { picked: ["request", "note"] })).toEqual(want);
      expect(tiers(e, RECORDS, DOMAINS, { picked: ["request", "note"] }).tier).toBe(2);
    }
    const schema = { fields: { kind: "string" }, vars: { picked: { list: "string" } } } as const;
    expect(reasonOf(app("includes", kinds, lit("note")), { domains: DOMAINS, schema })).toBe('the list op "includes"');
    expect(reasonOf(app("includes", v("picked"), kind), { domains: DOMAINS, schema })).toBe('the list op "includes"');
  });

  it("TEXT.EPOCHMILLIS COMPILE.MODULE.TEXT: each tier and a module give the instant of a time, and #CALC! for a bad text", () => {
    const options: ModuleOptions = { domains: DOMAINS, schema: { fields: { at: "string" } } };
    const records = ["2026-03-02T09:00:00Z", "2026-03-01T23:30:00-05:00", "2026-02-27", "2026-03-03T10:15:30.5Z", "0050-06-15T00:00Z", "March 2", "2026-02-30", "2026-03-02T09:00"].map((t) => ({ at: t }));
    const want = [Date.UTC(2026, 2, 2, 9), Date.UTC(2026, 2, 2, 4, 30), Date.UTC(2026, 1, 27), Date.UTC(2026, 2, 3, 10, 15, 30, 500), Date.parse("0050-06-15T00:00:00Z"), "#CALC!", "#CALC!", "#CALC!"];
    expect(values(millis(at), space.array(records))).toEqual(want);
    expect(tiers(millis(at), space.array(records)).tier).toBe(2);
    const run = moduleRun(millis(at), options);
    expect(run(records, {}).map((x) => (isError(x) ? "#CALC!" : x))).toEqual(want);
    // A range of times: the ops of numbers compare the instants.
    const inRange = app("and", app("gte", millis(at), millis(lit("2026-03-01"))), app("lt", millis(at), millis(lit("2026-03-03"))));
    expect(values(inRange, space.array(records))).toEqual([true, true, false, false, false, "#CALC!", "#CALC!", "#CALC!"]);
    expect(moduleRun(inRange, options)(records, {}).map((x) => (isError(x) ? "#CALC!" : x))).toEqual([true, true, false, false, false, "#CALC!", "#CALC!", "#CALC!"]);
  });

  it("FORM.IFERROR REF.MISSING: ifError gives a default for a missing field and for a missing key of JsonDomain in each tier", () => {
    // A missing field gives #N/A, and ifError gives the default.
    expect(values(app("eq", state, lit("open")))).toEqual([true, true, false, true, "#N/A", true, true]);
    expect(values(app("eq", app("ifError", state, lit("")), lit("open")))).toEqual([true, true, false, true, false, true, true]);
    // A missing key of a JSON object gives #CALC!, and ifError gives the default.
    const docs = space.array([{ doc: { state: "open" } }, { doc: { kind: "ask" } }]);
    const field = app("field", ref("doc"), lit("state"));
    const json = [NumDomain, BoolDomain, TextDomain, JsonDomain];
    expect(values(field, docs, json)).toEqual(["open", "#CALC!"]);
    expect(values(app("ifError", field, lit("none")), docs, json)).toEqual(["open", "none"]);
  });

  it("LIST.INCLUDES TEXT.EPOCHMILLIS FORM.IFERROR: a filter of a search text, a field with one of some values and a time range is one program", () => {
    const search = app("contains", app("lower", ref("title")), lit("report"));
    const time = app("ifError", millis(at), lit(-1));
    const filter = app(
      "and",
      app("includes", lit(["ask", "request"]), kind),
      app("eq", app("ifError", state, lit("")), lit("open")),
      search,
      app("gte", time, millis(lit("2026-03-01"))),
      app("lt", time, millis(lit("2026-03-03"))),
    );
    // A task without a time or with a bad time gets the time -1, so the range does not hold.
    expect(values(filter)).toEqual([true, true, false, false, false, false, false]);
    // The same filter with eq and or gives the same values.
    const either = app("or", app("eq", kind, lit("ask")), app("eq", kind, lit("request")));
    const plain = app("and", either, app("eq", app("ifError", state, lit("")), lit("open")), search, app("gte", time, millis(lit("2026-03-01"))), app("lt", time, millis(lit("2026-03-03"))));
    expect(values(plain)).toEqual(values(filter));
  });
});

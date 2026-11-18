/**
 * The entry `@mark1russell7/vex/query` with the domains of `@mark1russell7/vex-domains`. The programs of a view give the
 * matches of `matchView` in each tier. Thus a page can compile them with `tiered`. The sort of a time field reads times
 * with an offset and dates by `epochMillis`.
 */
import { evaluate, space, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { compileView, fieldCatalog, matchView, sortIds, sortKey, viewFromQuery, viewToQuery, type QueryRecord, type RecordView } from "@mark1russell7/vex/query";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { tiered } from "./tiers.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain];

/** The tasks of the tests. Some tasks have no state or no time. */
const TASKS: readonly QueryRecord[] = [
  { id: "t1", kind: "ask", state: "open", title: "Write the Report", at: "2026-03-02T09:00:00Z", size: 3, done: false },
  { id: "t2", kind: "request", state: "open", title: "Check the report", at: "2026-03-01T23:30:00-05:00", size: 1, done: false },
  { id: "t3", kind: "request", state: "done", title: "Report the totals", at: "2026-02-27", size: 2, done: true },
  { id: "t4", kind: "note", state: "open", title: "A note", at: "2026-03-03T10:15:30.5Z", done: false },
  { id: "t5", kind: "ask", title: "No state", at: "2026-03-02T12:00Z", size: 3 },
  { id: "t6", kind: "ask", state: "open", title: "A report with no time", size: 1, done: true },
].map((task) => ({ ...task, search: `${task.title.toLowerCase()} ${task.id}` }));

const catalog = fieldCatalog(TASKS, { skip: ["id", "search"] });
const records = space.record(Object.fromEntries(TASKS.map((task) => [task.id, task])));
const ids = (view: RecordView): readonly string[] => matchView(view, TASKS, { domains: DOMAINS, catalog }).matches;
const pass = (result: { readonly ok: boolean; readonly value?: unknown }): boolean => result.ok && result.value === true;

const VIEWS: readonly RecordView[] = [
  { text: "report" },
  { text: "REPORT  Tot" },
  { where: { kind: ["ask", "request"] } },
  { where: { state: ["open"], kind: ["ask"] } },
  { where: { done: ["true"] } },
  { where: { size: ["3", "1"] } },
  { text: "report", where: { kind: ["request", "note"], done: ["false"] } },
];

describe("the query entry with the domains of vex-domains", () => {
  it("QUERY.MATCH QUERY.COMPILE.FACET: matches the search words and the facets with their types", () => {
    expect(VIEWS.map(ids)).toEqual([["t1", "t2", "t3", "t6"], ["t3"], ["t1", "t2", "t3", "t5", "t6"], ["t1", "t6"], ["t3", "t6"], ["t1", "t2", "t5", "t6"], ["t2"]]);
  });

  it("QUERY.COMPILE: gives programs that give the matches of matchView in each tier, also after the link", () => {
    const rows = VIEWS.map((view) => {
      const program: Expr | null = compileView(view, catalog);
      if (program === null) return { view, program };
      const compiled = tiered(program, { domains: DOMAINS });
      const interpreter = TASKS.filter((task) => pass(evaluate(program, { space: records, origin: task.id, domains: DOMAINS }))).map((task) => task.id);
      const tier = TASKS.filter((task) => pass(compiled.run({ space: records, origin: task.id }))).map((task) => task.id);
      // A view keeps its program after a trip through the link.
      const read = viewFromQuery(viewToQuery(view, [], { domains: DOMAINS }), ["kind", "state", "done", "size"], { domains: DOMAINS });
      return { view, interpreter, tier, link: compileView(read.view, catalog) };
    });
    expect(rows).toEqual(VIEWS.map((view) => ({ view, interpreter: ids(view), tier: ids(view), link: compileView(view, catalog) })));
  });

  it("QUERY.SORT: sorts a time field by epochMillis, with an offset and a date in their places, and a task with no time last", () => {
    expect(sortKey({ field: "at", dir: "asc" }, catalog)).toEqual({ tag: "app", op: "epochMillis", args: [{ tag: "ref", path: ["at"] }] });
    const all = TASKS.map((task) => task.id);
    expect(sortIds(all, TASKS, { field: "at", dir: "desc" }, { domains: DOMAINS, catalog })).toEqual(["t4", "t5", "t1", "t2", "t3", "t6"]);
    expect(sortIds(all, TASKS, { field: "at", dir: "asc" }, { domains: DOMAINS, catalog })).toEqual(["t3", "t2", "t1", "t5", "t4", "t6"]);
    expect(sortIds(all, TASKS, { field: "title", dir: "asc" }, { domains: DOMAINS, catalog })).toEqual(["t4", "t6", "t2", "t5", "t3", "t1"]);
  });
});

/**
 * The tests of the entry `/query`. They test the catalog of the fields of flat records, the compile of a view, and the
 * matches and the counts of the facets. They also test the sort, the compare of two views and the link of a view.
 * The domains of these tests are small copies of the ops that the programs use. The tests of the compiler run the same
 * programs with the domains of `@mark1russell7/vex-domains`.
 */
import { describe, expect, it } from "vitest";
import { defineDomain, type AnyDomain } from "./domain.ts";
import { app, lit, type Expr } from "./ir.ts";
import { serialize } from "./json.ts";
import {
  compileView,
  fieldCatalog,
  ISO_DATE,
  ISO_TIME,
  isActive,
  matchView,
  sameFilter,
  searchWords,
  sortIds,
  sortKey,
  viewFromQuery,
  viewToQuery,
  type QueryRecord,
  type RecordView,
} from "./query.ts";
import { Pt, PtDomain } from "./test-support.ts";

const Txt = defineDomain({
  name: "Txt",
  is: (u: unknown): u is string => typeof u === "string",
  ops: {
    lower: { fn: (a: string): string => a.toLowerCase() },
    contains: { fn: (a: string, b: string): boolean => a.includes(b), params: ["string"] },
    eq: { fn: (a: string, b: string): boolean => a === b, params: ["string"] },
    epochMillis: {
      fn: (a: string): number => {
        const ms = Date.parse(a);
        if (Number.isNaN(ms)) throw new Error("not a time");
        return ms;
      },
    },
  },
});
const Num = defineDomain({ name: "Num", is: (u: unknown): u is number => typeof u === "number", ops: { eq: { fn: (a: number, b: number): boolean => a === b, params: ["number"] } } });
const Bool = defineDomain({
  name: "Bool",
  is: (u: unknown): u is boolean => typeof u === "boolean",
  ops: { eq: { fn: (a: boolean, b: boolean): boolean => a === b, params: ["boolean"] }, not: { fn: (a: boolean): boolean => !a } },
});
const DOMAINS: readonly AnyDomain[] = [Txt, Num, Bool];

const records: QueryRecord[] = [
  { id: "a", kind: "ask", state: "open", at: "2026-11-17T10:00:00Z", day: "2026-11-17", text: "Pick a name for the tool", score: 3, done: false },
  { id: "b", kind: "ask", state: "answered", at: "2026-11-17T12:00:00Z", day: "2026-11-17", text: "Pick a color", score: 1, done: true },
  { id: "c", kind: "request", at: "2026-11-16T08:00:00Z", day: "2026-11-16", text: "A dark mode for the page", score: 2.5, done: false },
  { id: "d", kind: "comment", at: "2026-11-18T09:30:00Z", day: "2026-11-18", text: "The second name is long." },
];

const byName = (rows: readonly QueryRecord[], options = {}) => new Map(fieldCatalog(rows, options).map((f) => [f.name, f]));
const many = (n: number): QueryRecord[] => Array.from({ length: n }, (_, i) => ({ id: String(i), word: `w${i}`, flag: i % 2 === 0, day: `2026-11-${String(i + 1).padStart(2, "0")}` }));
const ref1 = (name: string): Expr => ({ tag: "ref", path: [name] });
const formulaOf = (value: string): Expr => app("contains", { tag: "ref", path: ["text"] }, lit(value));
const vexOf = (formula: Expr): string => {
  const text = serialize(formula);
  if (!text.ok) throw new Error("the test formula has no JSON form");
  return `vex=${encodeURIComponent(text.value)}`;
};
/** This function gives the texts where the test of a regular expression does not give the expected result. */
const wrong = (re: RegExp, texts: readonly string[], expected: boolean): string[] => texts.filter((text) => re.test(text) !== expected);

describe("fieldCatalog", () => {
  it("QUERY.CATALOG: finds each field of the records, by name, with its type and its counts, and leaves out the id", () => {
    expect(fieldCatalog(records).map((f) => [f.name, f.type, f.count, f.distinct])).toEqual([
      ["at", "time", 4, 4],
      ["day", "date", 4, 3],
      ["done", "boolean", 3, 2],
      ["kind", "text", 4, 3],
      ["score", "number", 3, 3],
      ["state", "text", 2, 2],
      ["text", "text", 4, 4],
    ]);
  });

  it("QUERY.CATALOG: leaves out the fields of skip and a number that is not finite, and does not change its input", () => {
    const copy = structuredClone(records);
    expect(fieldCatalog(records, { skip: ["id", "text", "at"] }).map((f) => f.name)).toEqual(["day", "done", "kind", "score", "state"]);
    expect(fieldCatalog(records, { skip: [] }).map((f) => f.name)).toContain("id");
    expect(fieldCatalog([])).toEqual([]);
    expect(records).toEqual(copy);
    const odd: QueryRecord[] = [{ id: "a", n: Number.NaN }, { id: "b", n: Number.POSITIVE_INFINITY }, { id: "c", m: 1 }];
    expect(fieldCatalog(odd).map((f) => f.name)).toEqual(["m"]);
    // A reference cannot read these names (REF.FORBIDDEN), so a facet of them can match no record.
    const unread: QueryRecord[] = [{ id: "a", "": "x", ["__proto__"]: "y", constructor: "z", prototype: "w", ok: "v" }];
    expect(fieldCatalog(unread).map((f) => f.name)).toEqual(["ok"]);
  });

  it("QUERY.CATALOG.TYPE: gives a field with values of more than one type the type text, but times and dates make a time field", () => {
    const mixed: QueryRecord[] = [{ id: "a", size: 3 }, { id: "b", size: "large" }, { id: "c", flag: true }, { id: "d", flag: "yes" }];
    expect(byName(mixed).get("size")).toMatchObject({ type: "text", count: 2, distinct: 2 });
    expect(byName(mixed).get("flag")).toMatchObject({ type: "text" });
    const both: QueryRecord[] = [{ id: "a", at: "2026-11-17T10:00:00Z" }, { id: "b", at: "2026-11-17" }, { id: "c", at: "2026-11-16T23:00:00Z" }, { id: "d", at: "soon" }];
    expect(byName(both.slice(0, 3)).get("at")).toMatchObject({ type: "time", min: "2026-11-16T23:00:00Z", max: "2026-11-17T10:00:00Z" });
    expect(byName(both).get("at")).toMatchObject({ type: "text" });
    expect(byName([{ id: "a", at: "2026-11-17" }, { id: "b", at: 3 }]).get("at")).toMatchObject({ type: "text" });
  });

  it("QUERY.CATALOG.TYPE: reads a time in the form that epochMillis reads, with Z or an offset, and a date with no time of day", () => {
    expect(wrong(ISO_TIME, ["2026-11-18T18:47:12Z", "2026-11-18T18:47Z", "2026-11-18T18:47:12.123+05:30", "2026-11-18T18:47:12.5-08:00", "2026-11-18t18:47z"], true)).toEqual([]);
    const notTimes = ["2026-11-18", "2026-11-18x18:47Z", "18:47", "2026-11-18 18:47:12Z", "2026-11-18T18:47:12", "2026-11-18T18:47:12+0530", "x2026-11-18T18:47Z", "2026-11-18T18:47Zx", "2026-11-18T18:47:1Z", "2026-11-18T18:47:12.Z"];
    expect(wrong(ISO_TIME, notTimes, false)).toEqual([]);
    expect(ISO_DATE.test("2026-11-18")).toBe(true);
    expect(wrong(ISO_DATE, ["2026-11-18T00:00Z", "x2026-11-18", "2026-11-18x", "2026-1-18"], false)).toEqual([]);
    // A time with no zone is a text, because epochMillis does not read it.
    expect(byName([{ id: "a", at: "2026-11-18T18:47:12" }]).get("at")).toMatchObject({ type: "text" });
  });

  it("QUERY.CATALOG.FACET: gives the values of a facet, the most frequent first and then by value, and no values to a time or a number", () => {
    const fields = byName(records);
    expect(fields.get("kind")?.values).toEqual([{ value: "ask", count: 2 }, { value: "comment", count: 1 }, { value: "request", count: 1 }]);
    expect(fields.get("done")?.values).toEqual([{ value: "false", count: 2 }, { value: "true", count: 1 }]);
    expect(fields.get("day")?.values).toEqual([{ value: "2026-11-17", count: 2 }, { value: "2026-11-16", count: 1 }, { value: "2026-11-18", count: 1 }]);
    expect(fields.get("at")).not.toHaveProperty("values");
    expect(fields.get("score")).not.toHaveProperty("values");
    expect(fields.get("kind")).toMatchObject({ search: false });
    expect(fields.get("done")).toMatchObject({ search: false });
    expect(fields.get("at")).toMatchObject({ search: false });
  });

  it("QUERY.CATALOG.FACET: makes a text field with more values than maxFacet a field of the search, and the default is 12", () => {
    expect(byName(records, { maxFacet: 3 }).get("text")).toMatchObject({ search: true });
    expect(byName(records, { maxFacet: 3 }).get("text")).not.toHaveProperty("values");
    expect(byName(records, { maxFacet: 3 }).get("kind")).toMatchObject({ search: false, distinct: 3 });
    expect(byName(records, { maxFacet: 2 }).get("kind")).toMatchObject({ search: true });
    expect(byName(many(12)).get("word")).toMatchObject({ search: false, distinct: 12 });
    expect(byName(many(13)).get("word")).toMatchObject({ search: true, distinct: 13 });
    expect(byName(many(13)).get("day")).toMatchObject({ search: false });
    expect(byName(many(13)).get("day")).not.toHaveProperty("values");
    expect(byName(many(13), { maxFacet: 1 }).get("flag")).toMatchObject({ search: false });
    expect(byName(many(13), { maxFacet: 1 }).get("flag")).not.toHaveProperty("values");
  });

  it("QUERY.CATALOG: gives the smallest and the largest value of a number, a time and a date field", () => {
    const fields = byName(records);
    expect(fields.get("score")).toMatchObject({ min: 1, max: 3 });
    expect(fields.get("at")).toMatchObject({ min: "2026-11-16T08:00:00Z", max: "2026-11-18T09:30:00Z" });
    expect(fields.get("day")).toMatchObject({ min: "2026-11-16", max: "2026-11-18" });
    expect(fields.get("kind")).not.toHaveProperty("min");
    expect(fields.get("done")).not.toHaveProperty("max");
    expect(byName([{ id: "a", n: 10 }, { id: "b", n: 9 }, { id: "c", n: -2 }]).get("n")).toMatchObject({ min: -2, max: 10 });
  });
});

describe("compileView", () => {
  const catalog = fieldCatalog(records);

  it("QUERY.COMPILE: gives null for a view with no search word, no value of a facet and no formula", () => {
    expect(compileView({}, catalog)).toBeNull();
    expect(compileView({ text: "   ", where: { kind: [] }, sort: { field: "at", dir: "desc" }, show: "only", group: "kind", box: "a" }, catalog)).toBeNull();
    expect(isActive({ text: "  ", where: { kind: [] }, group: "kind" })).toBe(false);
    expect(isActive({ text: " x " })).toBe(true);
    expect(isActive({ where: { kind: [], state: ["open"] } })).toBe(true);
    expect(isActive({ formula: lit(true) })).toBe(true);
  });

  it("QUERY.COMPILE.SEARCH: gives the words of a search in lower case, with no empty word and no repeat", () => {
    expect(searchWords("  Pick a  NAME pick\ta ")).toEqual(["pick", "a", "name"]);
    expect(searchWords("")).toEqual([]);
    expect(compileView({ text: "Pick PICK" }, catalog)).toEqual(app("contains", app("lower", ref1("search")), lit("pick")));
    expect(compileView({ text: "a b" }, catalog, { searchField: "words" })).toEqual(
      app("and", app("contains", app("lower", ref1("words")), lit("a")), app("contains", app("lower", ref1("words")), lit("b"))),
    );
  });

  it("QUERY.COMPILE.FACET: gives eq for one value and includes for more, with the type of the field, and the fields in the order of their names", () => {
    expect(compileView({ where: { score: ["3"], done: ["true"] } }, catalog)).toEqual(app("and", app("eq", ref1("done"), lit(true)), app("eq", ref1("score"), lit(3))));
    expect(compileView({ where: { kind: ["ask", "comment", "ask"] } }, catalog)).toEqual(app("includes", lit(["ask", "comment"]), ref1("kind")));
    expect(compileView({ where: { done: ["false", "yes"] } }, catalog)).toEqual(app("includes", lit([false, "yes"]), ref1("done")));
    expect(compileView({ where: { score: ["2.5", " ", "x"] } }, catalog)).toEqual(app("includes", lit([2.5, " ", "x"]), ref1("score")));
    // A field that is not in the catalog gets texts. A dot in the name of a field does not split it.
    expect(compileView({ where: { "a.b": ["true", "1"] } }, catalog)).toEqual(app("includes", lit(["true", "1"]), ref1("a.b")));
    expect(compileView({ where: { kind: ["true"] } }, catalog)).toEqual(app("eq", ref1("kind"), lit("true")));
  });

  it("QUERY.COMPILE: joins the search words, the facets and the formula in one and, in this order", () => {
    const formula = app("not", ref1("done"));
    expect(compileView({ formula }, catalog)).toBe(formula);
    expect(compileView({ formula, where: { kind: ["ask"] }, text: "pick" }, catalog)).toEqual(
      app("and", app("contains", app("lower", ref1("search")), lit("pick")), app("eq", ref1("kind"), lit("ask")), formula),
    );
  });
});

describe("matchView", () => {
  const rows: QueryRecord[] = records.map((r) => ({ ...r, search: `${String(r["text"]).toLowerCase()} ${r.id}` }));
  // With maxFacet 3, the field text is not a facet, and kind, day, done and state are facets.
  const catalog = fieldCatalog(rows, { skip: ["id", "search"], maxFacet: 3 });
  const ids = (view: RecordView): readonly string[] => matchView(view, rows, { domains: DOMAINS, catalog }).matches;

  it("QUERY.MATCH: matches each record for a view with no filter, and the view is not active", () => {
    expect(matchView({}, rows, { domains: DOMAINS })).toMatchObject({ active: false, matches: ["a", "b", "c", "d"] });
    expect(matchView({ group: "kind" }, [], { domains: DOMAINS })).toMatchObject({ active: false, matches: [] });
  });

  it("QUERY.MATCH: finds each search word in the search field in any case, and each value of a facet with the type of its field", () => {
    expect(ids({ text: "PICK" })).toEqual(["a", "b"]);
    expect(ids({ text: "pick name" })).toEqual(["a"]);
    expect(ids({ text: "nothing" })).toEqual([]);
    expect(ids({ where: { kind: ["ask", "comment"] } })).toEqual(["a", "b", "d"]);
    expect(ids({ where: { done: ["true"] } })).toEqual(["b"]);
    expect(ids({ where: { done: ["false"] } })).toEqual(["a", "c"]);
    expect(ids({ where: { score: ["2.5"] } })).toEqual(["c"]);
    expect(matchView({ text: "pick" }, rows, { domains: DOMAINS })).toMatchObject({ active: true, matches: ["a", "b"] });
  });

  it("QUERY.MATCH: leaves out a record with no value in the field of a facet, and a record where a program gives an error or not true", () => {
    expect(ids({ where: { state: ["open", "answered"] } })).toEqual(["a", "b"]);
    expect(ids({ where: { state: ["open"] } })).toEqual(["a"]);
    expect(ids({ formula: app("not", { tag: "ref", path: ["done"] }) })).toEqual(["a", "c"]);
    expect(ids({ formula: { tag: "ref", path: ["text"] } })).toEqual([]);
    expect(ids({ formula: lit(1) })).toEqual([]);
    expect(ids({ formula: lit(true), text: "dark", where: { kind: ["request", "ask"] } })).toEqual(["c"]);
    // Without the domains, each op gives an error, so no record matches.
    expect(matchView({ text: "pick" }, rows, { domains: [] }).matches).toEqual([]);
  });

  it("QUERY.MATCH.COUNTS: counts each value of a facet in the records that agree with each other term, so a chosen value hides no value of its facet", () => {
    const counts = (view: RecordView, facets?: readonly string[]) => {
      const result = matchView(view, rows, { domains: DOMAINS, catalog, ...(facets === undefined ? {} : { facets }) });
      return Object.fromEntries([...result.counts].map(([name, values]) => [name, Object.fromEntries(values)]));
    };
    expect(counts({})).toEqual({ day: { "2026-11-16": 1, "2026-11-17": 2, "2026-11-18": 1 }, done: { false: 2, true: 1 }, kind: { ask: 2, comment: 1, request: 1 }, state: { answered: 1, open: 1 } });
    expect(counts({ where: { kind: ["ask"] } }, ["kind", "done"])).toEqual({ kind: { ask: 2, comment: 1, request: 1 }, done: { false: 1, true: 1 } });
    expect(counts({ where: { kind: ["ask"], done: ["true"] } }, ["kind", "done"])).toEqual({ kind: { ask: 1 }, done: { false: 1, true: 1 } });
    expect(counts({ text: "pick" }, ["kind", "done"])).toEqual({ kind: { ask: 2 }, done: { false: 1, true: 1 } });
    // A field of where that is not a facet still filters the matches and the counts.
    expect(counts({ where: { state: ["open"] } }, ["kind"])).toEqual({ kind: { ask: 1 } });
    expect(matchView({ where: { state: ["open"] } }, rows, { domains: DOMAINS, facets: ["kind"] }).matches).toEqual(["a"]);
    // A facet with no values in the records has no counts.
    expect(counts({}, ["absent"])).toEqual({ absent: {} });
  });
});

describe("sortIds", () => {
  const times: QueryRecord[] = [
    { id: "a", at: "2026-03-02T01:00:00Z", title: "Item 10", n: 3 },
    { id: "b", at: "2026-03-01T23:30:00-05:00", title: "item 2", n: 20 },
    { id: "c", at: "2026-03-02", title: "Item 1", n: 3 },
    { id: "d", title: "item 2" },
  ];
  const sort = (field: string, dir: "asc" | "desc", ids: readonly string[] = ["a", "b", "c", "d"], domains: readonly AnyDomain[] = DOMAINS): string[] =>
    sortIds(ids, times, { field, dir }, { domains });

  it("QUERY.SORT: sorts a time field by epochMillis, so a time with an offset takes its place, and a record with no value comes last", () => {
    expect(sortKey({ field: "at", dir: "asc" }, fieldCatalog(times))).toEqual(app("epochMillis", { tag: "ref", path: ["at"] }));
    expect(sortKey({ field: "title", dir: "asc" }, fieldCatalog(times))).toEqual({ tag: "ref", path: ["title"] });
    expect(sortKey({ field: "absent", dir: "asc" }, [])).toEqual({ tag: "ref", path: ["absent"] });
    expect(sort("at", "asc")).toEqual(["c", "a", "b", "d"]);
    expect(sort("at", "desc")).toEqual(["b", "a", "c", "d"]);
    expect(sortKey({ field: "day", dir: "asc" }, fieldCatalog([{ id: "x", day: "2026-03-02" }]))).toEqual(app("epochMillis", { tag: "ref", path: ["day"] }));
  });

  it("QUERY.SORT: sorts numbers by value, and texts with the numbers in them by value and no case, and a tie keeps the order of the ids", () => {
    expect(sort("n", "asc")).toEqual(["a", "c", "b", "d"]);
    expect(sort("n", "desc")).toEqual(["b", "a", "c", "d"]);
    expect(sort("n", "desc", ["c", "d", "b", "a"])).toEqual(["b", "c", "a", "d"]);
    expect(sort("title", "asc")).toEqual(["c", "b", "d", "a"]);
    expect(sort("title", "desc")).toEqual(["a", "b", "d", "c"]);
    expect(sort("title", "desc", ["d", "c", "b", "a"])).toEqual(["a", "d", "b", "c"]);
  });

  it("QUERY.SORT: puts a record with an error as its key, or with no record, last in each direction, in the order of the ids", () => {
    // Without the domains, epochMillis gives an error at each record, so the order of the ids stays.
    expect(sort("at", "asc", ["b", "d", "a", "c"], [])).toEqual(["b", "d", "a", "c"]);
    expect(sort("n", "asc", ["z", "b", "y", "a"])).toEqual(["a", "b", "z", "y"]);
    expect(sort("n", "desc", ["z", "b", "y", "a"])).toEqual(["b", "a", "z", "y"]);
    // With no time field in the catalog, the key is the text, so the time with an offset sorts as a text.
    expect(sortIds(["a", "b"], times, { field: "at", dir: "asc" }, { domains: DOMAINS, catalog: [] })).toEqual(["b", "a"]);
    expect(sortIds(["b", "a"], times, { field: "at", dir: "asc" }, { domains: DOMAINS })).toEqual(["a", "b"]);
    expect(sortIds([], times, { field: "at", dir: "asc" }, { domains: DOMAINS })).toEqual([]);
  });
});

describe("sameFilter", () => {
  it("QUERY.SAME: compares the words, the values of each field in any order, the formula and the sort, and not the group, the show or the box", () => {
    const a: RecordView = { text: "Pick  name", where: { kind: ["ask", "request"], state: [] }, formula: lit(true), sort: { field: "at", dir: "desc" }, group: "kind", show: "only", box: "a" };
    const b: RecordView = { text: "pick name pick", where: { kind: ["request", "ask", "ask"] }, formula: lit(true), sort: { field: "at", dir: "desc" } };
    expect(sameFilter(a, b)).toBe(true);
    expect(sameFilter(a, { ...b, text: "pick" })).toBe(false);
    expect(sameFilter(a, { ...b, where: { kind: ["ask"] } })).toBe(false);
    expect(sameFilter(a, { ...b, where: { kind: ["ask", "request"], state: ["open"] } })).toBe(false);
    expect(sameFilter(a, { ...b, where: { other: ["ask", "request"] } })).toBe(false);
    expect(sameFilter(a, { ...b, formula: lit(false) })).toBe(false);
    expect(sameFilter(a, { text: "pick name", where: { kind: ["request", "ask"] }, sort: { field: "at", dir: "desc" } })).toBe(false);
    expect(sameFilter(a, { ...b, sort: { field: "at", dir: "asc" } })).toBe(false);
    expect(sameFilter(a, { ...b, sort: { field: "day", dir: "desc" } })).toBe(false);
  });

  it("QUERY.SAME: gives a view with no sort the sort of defaultSort", () => {
    const sorted: RecordView = { sort: { field: "at", dir: "desc" } };
    expect(sameFilter({}, {})).toBe(true);
    expect(sameFilter({}, sorted)).toBe(false);
    expect(sameFilter({}, sorted, { field: "at", dir: "desc" })).toBe(true);
    expect(sameFilter(sorted, {}, { field: "at", dir: "asc" })).toBe(false);
  });
});

describe("viewToQuery and viewFromQuery", () => {
  const facets = ["kind", "state", "done", "q", "f.x"];
  const views: { name: string; view: RecordView; query: string }[] = [
    { name: "an empty view", view: {}, query: "" },
    { name: "a search with spaces and signs", view: { text: "pick a name & go?" }, query: "q=pick%20a%20name%20%26%20go%3F" },
    { name: "facets by name, with a comma in a value", view: { where: { state: ["open"], kind: ["ask", "a,b"] } }, query: "kind=ask,a%2Cb&state=open" },
    { name: "a sort down", view: { sort: { field: "at", dir: "desc" } }, query: "sort=-at" },
    { name: "a sort up", view: { sort: { field: "title", dir: "asc" } }, query: "sort=title" },
    { name: "a sort up of a field that starts with a dash", view: { sort: { field: "-x", dir: "asc" } }, query: "sort=%2Dx" },
    { name: "a sort down of a field that starts with a dash", view: { sort: { field: "-x", dir: "desc" } }, query: "sort=-%2Dx" },
    { name: "an empty value of a facet", view: { where: { kind: [""], state: ["", "open"] } }, query: "kind=&state=,open" },
    { name: "the group, the show and the box", view: { group: "topic", show: "only", box: "ask:pick-a-site" }, query: "group=topic&show=only&box=ask%3Apick-a-site" },
    { name: "the show glow", view: { show: "glow" }, query: "show=glow" },
    { name: "a facet with the name of a key", view: { where: { q: ["x"], "f.x": ["y"] } }, query: "f.f.x=y&f.q=x" },
    // Characters of 2, 3 and 4 bytes of UTF-8, and the signs of a query.
    ...["", "café ✓", "😀 x", "a+b&c,d=e%f?g#h"].map((value) => ({ name: `the formula with the text "${value}"`, view: { formula: formulaOf(value) }, query: vexOf(formulaOf(value)) })),
  ];

  it.each(views)("QUERY.LINK QUERY.LINK.READ: writes and reads $name with no change", ({ view, query }) => {
    expect(viewToQuery(view)).toBe(query);
    expect(viewFromQuery(query, facets)).toEqual({ view, rest: [], problems: [] });
    expect(viewFromQuery(`?${query}`, facets).view).toEqual(view);
  });

  it("QUERY.LINK: writes each part in its order: the search, the facets, the sort, the group, the show, the box, the formula and the rest", () => {
    const view: RecordView = { box: "b", show: "glow", group: "g", sort: { field: "s", dir: "asc" }, where: { state: ["open"], kind: ["ask"], done: [] }, text: "t", formula: lit(true) };
    expect(viewToQuery(view, ["zz=1"]).split("&").map((part) => part.split("=")[0])).toEqual(["q", "kind", "state", "sort", "group", "show", "box", "vex", "zz"]);
    // An empty text, sort field, group or box is not in the link, and a value of a facet is in it one time.
    expect(viewToQuery({ text: "", group: "", box: "", sort: { field: "", dir: "desc" } })).toBe("");
    expect(viewToQuery({ where: { kind: ["ask", "ask", "note"] } })).toBe("kind=ask,note");
    // A lone surrogate has no form in UTF-8, so encodeURIComponent throws.
    expect(() => viewToQuery({ text: "\uD800" })).toThrow(URIError);
  });

  it("QUERY.LINK.FORMULA: writes and reads a domain value of the formula with the domains, and a formula with no JSON form throws a TypeError", () => {
    const view: RecordView = { formula: app("eq", { tag: "ref", path: ["p"] }, lit(new Pt(1, 2))) };
    const query = viewToQuery(view, [], { domains: [PtDomain] });
    expect(viewFromQuery(query, [], { domains: [PtDomain] })).toEqual({ view, rest: [], problems: [] });
    expect(() => viewToQuery(view)).toThrow(TypeError);
    expect(() => viewToQuery(view)).toThrow(/^The formula of the view has no JSON form: /);
    const read = viewFromQuery(query, []);
    expect(read.view).toEqual({});
    expect(read.problems).toHaveLength(1);
    expect(read.problems[0]).toMatch(/^The formula of the link is not a Vex program: ./);
  });

  it("QUERY.LINK.READ: keeps each part that the view does not use, in its order, and reads a plus as a space", () => {
    const read = viewFromQuery("a=1&q=pick+a&kind=ask&b=%ZZ&&kind=request,ask,&box=&group=&q=&f.=x", facets);
    expect(read).toEqual({ view: { text: "pick a", where: { kind: ["ask", "request", ""], "": ["x"] } }, rest: ["a=1", "b=%ZZ"], problems: [] });
    expect(viewToQuery(read.view, read.rest)).toBe("q=pick%20a&f.=x&kind=ask,request,&a=1&b=%ZZ");
    // A key with no value has the value "", as in URLSearchParams.
    expect(viewFromQuery("kind&state=,", facets)).toEqual({ view: { where: { kind: [""], state: [""] } }, rest: [], problems: [] });
    expect(viewFromQuery("other", facets)).toEqual({ view: {}, rest: ["other"], problems: [] });
    // A # ends the query: the fragment of a link is not a part.
    expect(viewFromQuery("?q=a#kind=ask&b=1", facets)).toEqual({ view: { text: "a" }, rest: [], problems: [] });
    // A key of the view is not a facet, also when the facets name it. A key that starts with f. is always a facet.
    expect(viewFromQuery("q=x&f.q=y&f.new=z", ["q"]).view).toEqual({ text: "x", where: { q: ["y"], new: ["z"] } });
  });

  it("QUERY.LINK.READ: a facet named __proto__ is a field of where, and the prototype does not change", () => {
    const where = viewFromQuery("__proto__=x&f.constructor=y", ["__proto__"]).view.where ?? {};
    expect([Object.keys(where), Object.getPrototypeOf(where) === Object.prototype, Object.hasOwn(where, "__proto__")]).toEqual([["__proto__", "constructor"], true, true]);
    expect(viewToQuery({ where })).toBe("__proto__=x&constructor=y");
    // matchView reads only an own field of where, so a view with no facet __proto__ matches each record.
    const protoRecords: QueryRecord[] = [{ id: "a", ["__proto__"]: "x" }, { id: "b" }];
    expect(matchView({ where: {} }, protoRecords, { domains: DOMAINS, facets: ["__proto__"] }).matches).toEqual(["a", "b"]);
    // A reference cannot read the field __proto__ (REF.FORBIDDEN), so its facet matches no record, and the catalog leaves it out.
    expect(matchView({ where: { ["__proto__"]: ["x"] } }, protoRecords, { domains: DOMAINS, facets: ["__proto__"] }).matches).toEqual([]);
    expect(fieldCatalog(protoRecords)).toEqual([]);
  });

  it("QUERY.LINK.READ QUERY.LINK.FORMULA: gives a problem for each bad value, and the view does not get it", () => {
    const read = viewFromQuery("show=all&sort=-&vex=bm90IGpzb24&q=%E0%A4%A&kind=ask&%E0%A4%A=1", facets);
    expect(read.view).toEqual({ where: { kind: ["ask"] } });
    expect(read.problems).toEqual([
      'The show "all" is not glow or only.',
      "The sort has no field.",
      "The formula of the link is not a Vex program: the text is not JSON",
      'The value of "q" does not decode.',
      'The key of the part "%E0%A4%A=1" does not decode.',
    ]);
    expect(viewFromQuery(`vex=${encodeURIComponent('{"a":1}')}`, facets).problems).toEqual(["The formula of the link is not a Vex program: the JSON is not a valid Vex expression"]);
    // Bytes that are not UTF-8 do not decode.
    expect(viewFromQuery("vex=%FF&vex=%E0%A4%A", facets).problems).toEqual(['The value of "vex" does not decode.', 'The value of "vex" does not decode.']);
    expect(viewFromQuery("sort=-&sort=x", facets)).toEqual({ view: { sort: { field: "x", dir: "asc" } }, rest: [], problems: ["The sort has no field."] });
  });
});

describe("the entry", () => {
  // The export map of the package is not in the copy of the mutation lane, so spec-coverage.test.ts reads it (V-103).
  it("QUERY.ENTRY: imports only the modules of the core", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./query.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import[^;]*?from "([^"]+)";/gms)].map((m) => m[1] ?? "");
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => !/^\.\/[a-z]+\.ts$/.test(from))).toEqual([]);
  });
});

/**
 * The query model of flat records (QUERY.ENTRY). It holds the field catalog and the compile of a view to one program.
 * It also holds the matches with the counts of the facets, the sort and the link of a view.
 *
 * - A record is an id and its fields. A field holds a text, a number or a boolean. A record with no value for a field has no key for it.
 * - The catalog finds the fields in the records. Thus a new field in the data shows with no change to the code.
 * - The programs use the ops `contains`, `lower`, `eq` and `epochMillis` of the domains of the caller. They also use `and` and `includes` of the kernel.
 */
import type { AnyDomain } from "./domain.ts";
import { evaluate, isFieldName } from "./evaluate.ts";
import { app, lit, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { space, type Space } from "./space.ts";

/** A value of a field of a record. */
export type FieldValue = string | number | boolean;

/** A flat record: its id and its fields. The id is a field too. */
export type QueryRecord = { readonly id: string } & Readonly<Record<string, FieldValue>>;

/** The type of a field. A field with values of more than one type is a `text` field, but times and dates make a `time` field. */
export type FieldType = "text" | "number" | "boolean" | "time" | "date";

/** A value of a facet and the count of the records that hold it. */
export interface FacetValue {
  readonly value: string;
  readonly count: number;
}

/** A field of the catalog. */
export interface FieldInfo {
  readonly name: string;
  readonly type: FieldType;
  /** The count of the records with a value in the field. */
  readonly count: number;
  /** The count of the different values. */
  readonly distinct: number;
  /** The values of a facet, the most frequent first, then by value. A field that is not a facet has none. */
  readonly values?: readonly FacetValue[];
  /** True for a text field that is not a facet. The search reads it. */
  readonly search: boolean;
  /** The smallest value of a number, a time or a date field. Times and dates compare as texts. */
  readonly min?: FieldValue;
  /** The largest value of a number, a time or a date field. Times and dates compare as texts. */
  readonly max?: FieldValue;
}

/** The options of the catalog. */
export interface CatalogOptions {
  /** The largest count of different values of a facet. The default is 12. */
  readonly maxFacet?: number;
  /** The fields that the catalog leaves out. The default is `["id"]`. */
  readonly skip?: readonly string[];
}

/** The form of a time that `epochMillis` reads: a date, a time of day, and `Z` or an offset. An example is `2026-11-18T18:47:12Z`. */
export const ISO_TIME: RegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The form of a date with no time of day, for example `2026-11-18`. */
export const ISO_DATE: RegExp = /^\d{4}-\d{2}-\d{2}$/;

const typeOfValue = (value: FieldValue): FieldType => {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (ISO_TIME.test(value)) return "time";
  return ISO_DATE.test(value) ? "date" : "text";
};

/** This function compares two values: numbers by value, and other values by the code units of their texts. */
const compare = (a: FieldValue, b: FieldValue): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

const isValue = (value: unknown): value is FieldValue =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

/** This function gives the type of a field from the set of the types of its values. */
function fieldType(types: ReadonlySet<FieldType>): FieldType {
  if (types.size === 2 && types.has("time") && types.has("date")) return "time";
  const [only] = types;
  return types.size === 1 && only !== undefined ? only : "text";
}

/**
 * This function gives the catalog of the fields of the records, by the name of the field (QUERY.CATALOG).
 * A field with no value in each record is not in it. A number that is not finite is no value.
 * A name that a reference cannot read (`isFieldName`, REF.FORBIDDEN) is not in it, for example `__proto__`.
 * The type of a field comes from the forms of its values (QUERY.CATALOG.TYPE).
 * A text, a boolean or a date field with `maxFacet` or fewer different values is a facet (QUERY.CATALOG.FACET).
 */
export function fieldCatalog(records: readonly QueryRecord[], options: CatalogOptions = {}): FieldInfo[] {
  const maxFacet = options.maxFacet ?? 12;
  const skip = new Set(options.skip ?? ["id"]);
  const fields = new Map<string, { types: Set<FieldType>; counts: Map<string, number>; values: FieldValue[] }>();
  for (const record of records) {
    for (const [name, value] of Object.entries(record)) {
      if (skip.has(name) || !isFieldName(name) || !isValue(value)) continue;
      let field = fields.get(name);
      if (field === undefined) fields.set(name, (field = { types: new Set(), counts: new Map(), values: [] }));
      field.types.add(typeOfValue(value));
      field.counts.set(String(value), (field.counts.get(String(value)) ?? 0) + 1);
      field.values.push(value);
    }
  }
  const catalog: FieldInfo[] = [];
  for (const [name, field] of fields) {
    const type = fieldType(field.types);
    const distinct = field.counts.size;
    const facet = (type === "text" || type === "boolean" || type === "date") && distinct <= maxFacet;
    const ordered = type === "number" || type === "time" || type === "date";
    const sorted = ordered ? field.values.toSorted(compare) : [];
    const min = sorted[0];
    const max = sorted.at(-1);
    catalog.push({
      name,
      type,
      count: field.values.length,
      distinct,
      ...(facet ? { values: [...field.counts].map(([value, count]) => ({ value, count })).toSorted((a, b) => b.count - a.count || compare(a.value, b.value)) } : {}),
      search: type === "text" && !facet,
      ...(min !== undefined && max !== undefined ? { min, max } : {}),
    });
  }
  return catalog.toSorted((a, b) => compare(a.name, b.name));
}

/** The sort of a view: a field and a direction. */
export interface ViewSort {
  readonly field: string;
  readonly dir: "asc" | "desc";
}

/** A view of a collection of records. Each control of a page changes one field of the view. */
export interface RecordView {
  /** The search words. Each word must be in the search field of a record. */
  readonly text?: string;
  /** The facets: the values of each field. In one field, the values are alternatives. The fields must all agree. */
  readonly where?: Readonly<Record<string, readonly string[]>>;
  /** An advanced filter: a program that gives a boolean at each record. */
  readonly formula?: Expr;
  /** The order of the matches. */
  readonly sort?: ViewSort;
  /** The field that groups the matches. */
  readonly group?: string;
  /** The way that a page shows the matches. */
  readonly show?: "glow" | "only";
  /** The id of the picked record. */
  readonly box?: string;
}

/** The options of the compile. */
export interface CompileOptions {
  /** The field of the search words. The default is `search`. */
  readonly searchField?: string;
}

/** This function makes a reference to one field. A dot in the name of the field does not split it. */
const field = (name: string): Expr => ({ tag: "ref", path: [name] });

/** This function gives the words of a search text: in lower case, split at the white space, with no empty word and no repeat. */
export function searchWords(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/\s+/).filter((word) => word !== ""))];
}

/** This function gives the value of a facet, with the type of its field in the catalog. */
function facetValue(value: string, type: FieldType | undefined): FieldValue {
  if (type === "boolean" && (value === "true" || value === "false")) return value === "true";
  if (type === "number" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
}

/** This function gives the fields of `where` with one or more values, in the order of their names. */
const whereEntries = (view: RecordView): [string, readonly string[]][] =>
  Object.entries(view.where ?? {})
    .filter(([, values]) => values.length > 0)
    .toSorted(([a], [b]) => compare(a, b));

/**
 * This function compiles a view to one program that gives true at each record that matches (QUERY.COMPILE).
 * A view with no search word, no value of a facet and no formula gives null.
 * - Each search word gives `contains(lower(search), word)` (QUERY.COMPILE.SEARCH).
 * - One value of a facet gives `eq(field, value)`. Two or more give `includes(values, field)` (QUERY.COMPILE.FACET).
 * - The formula comes with no change. The terms make one `and`.
 */
export function compileView(view: RecordView, catalog: readonly FieldInfo[], options: CompileOptions = {}): Expr | null {
  const search = field(options.searchField ?? "search");
  const types = new Map(catalog.map((info) => [info.name, info.type]));
  const terms: Expr[] = searchWords(view.text ?? "").map((word) => app("contains", app("lower", search), lit(word)));
  for (const [name, values] of whereEntries(view)) {
    const each = [...new Set(values)].map((value) => facetValue(value, types.get(name)));
    terms.push(each.length === 1 ? app("eq", field(name), lit(each[0])) : app("includes", lit(each), field(name)));
  }
  if (view.formula !== undefined) terms.push(view.formula);
  if (terms.length < 2) return terms[0] ?? null;
  return app("and", ...terms);
}

/** This function tells if a view has a search word, a value of a facet or a formula. */
export function isActive(view: RecordView): boolean {
  return searchWords(view.text ?? "").length > 0 || view.formula !== undefined || whereEntries(view).length > 0;
}

/** The options of the matches and of the sort. */
export interface MatchOptions extends CompileOptions {
  /** The domains of the evaluation. Each program evaluates at each record with them. */
  readonly domains: readonly AnyDomain[];
  /** The catalog of the records. The default is the catalog that `fieldCatalog` gives. */
  readonly catalog?: readonly FieldInfo[];
  /** The fields that get counts. The default is each facet of the catalog, in its order. */
  readonly facets?: readonly string[];
}

/** The matches of a view. */
export interface MatchResult {
  /** True when the view has a search word, a value of a facet or a formula (`isActive`). */
  readonly active: boolean;
  /** The ids of the matches, in the order of the records. A view that is not active matches each record. */
  readonly matches: readonly string[];
  /** For each facet, the count of each value in the records that agree with each other term of the view. */
  readonly counts: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/** This function gives a space of the records, with the id of each record as its key. */
const recordSpace = (records: readonly QueryRecord[]): Space => space.record(Object.fromEntries(records.map((record) => [record.id, record])));

/**
 * This function gives the matches of a view and the counts of its facets (QUERY.MATCH, QUERY.MATCH.COUNTS).
 * A record matches when each program gives `true` there. An error or another value does not match.
 *
 * - One program holds the search words and the formula, and one program holds each field with values. Thus the matches are the matches of `compileView`.
 * - The count of a value of a facet comes from the records that agree with each other program. A chosen value does not hide the other values of its facet.
 */
export function matchView(view: RecordView, records: readonly QueryRecord[], options: MatchOptions): MatchResult {
  const catalog = options.catalog ?? fieldCatalog(records);
  const facets = options.facets ?? catalog.filter((info) => info.values !== undefined).map((info) => info.name);
  const compile = (part: RecordView): Expr | null => compileView(part, catalog, options);
  const base = compile({ ...(view.text === undefined ? {} : { text: view.text }), ...(view.formula === undefined ? {} : { formula: view.formula }) });
  const terms = facets.map((name) => {
    // Only an own field counts. Thus a facet named `__proto__` does not read the prototype.
    const values = view.where !== undefined && Object.hasOwn(view.where, name) ? (view.where[name] ?? []) : [];
    return values.length === 0 ? null : compile({ where: { [name]: values } });
  });
  // A field of `where` that is not a facet still filters the records.
  const others = whereEntries(view).filter(([name]) => !facets.includes(name));
  const extra = others.length === 0 ? null : compile({ where: Object.fromEntries(others) });
  const keyed = recordSpace(records);
  const pass = (program: Expr | null, id: string): boolean => {
    if (program === null) return true;
    const result = evaluate(program, { space: keyed, origin: id, domains: options.domains });
    return result.ok && result.value === true;
  };
  const counts = new Map(facets.map((name) => [name, new Map<string, number>()]));
  const matches: string[] = [];
  for (const record of records) {
    if (!pass(base, record.id) || !pass(extra, record.id)) continue;
    const fails = terms.map((term) => !pass(term, record.id));
    const failCount = fails.filter(Boolean).length;
    if (failCount === 0) matches.push(record.id);
    facets.forEach((name, i) => {
      // A record counts for a facet when each other term holds. The term of the facet itself can fail.
      if (failCount > (fails[i] === true ? 1 : 0)) return;
      const value = record[name];
      const count = counts.get(name);
      if (count === undefined || !isValue(value)) return;
      count.set(String(value), (count.get(String(value)) ?? 0) + 1);
    });
  }
  return { active: isActive(view), matches, counts };
}

/** This function gives the key program of a sort: `epochMillis(field)` for a time or a date field, else the field (QUERY.SORT). */
export function sortKey(sort: ViewSort, catalog: readonly FieldInfo[]): Expr {
  const type = catalog.find((info) => info.name === sort.field)?.type;
  return type === "time" || type === "date" ? app("epochMillis", field(sort.field)) : field(sort.field);
}

/**
 * This function compares two keys of a sort. Numbers compare by value. Texts compare in the order of words, with no
 * case, and the numbers in them compare by value.
 */
const compareKeys = (a: FieldValue, b: FieldValue): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
};

/**
 * This function gives the ids in the order of a sort (QUERY.SORT). The key of each record comes from `sortKey`.
 * A record with no key, or with an error as its key, comes last in each direction. A tie keeps the order of the ids.
 */
export function sortIds(ids: readonly string[], records: readonly QueryRecord[], sort: ViewSort, options: MatchOptions): string[] {
  const key = sortKey(sort, options.catalog ?? fieldCatalog(records));
  const keyed = recordSpace(records);
  const sign = sort.dir === "desc" ? -1 : 1;
  const rows = ids.map((id, at) => {
    const result = evaluate(key, { space: keyed, origin: id, domains: options.domains });
    return { id, at, key: result.ok && isValue(result.value) ? result.value : undefined };
  });
  return rows
    .toSorted((a, b) => {
      if (a.key === undefined || b.key === undefined) return a.key === b.key ? a.at - b.at : a.key === undefined ? 1 : -1;
      return sign * compareKeys(a.key, b.key) || a.at - b.at;
    })
    .map((row) => row.id);
}

/**
 * This function tells if two views have the same filter and order (QUERY.SAME). The search words must be the same.
 * The values of each field must be the same, in any order. The formula and the sort must be the same.
 * The group, the show and the box do not count. A view with no sort has the sort `defaultSort`.
 */
export function sameFilter(a: RecordView, b: RecordView, defaultSort?: ViewSort): boolean {
  const words = (v: RecordView): string => searchWords(v.text ?? "").join(" ");
  const where = (v: RecordView): string =>
    whereEntries(v)
      .map(([name, values]) => JSON.stringify([name, [...new Set(values)].toSorted()]))
      .join("\n");
  const sort = (v: RecordView): string => {
    const s = v.sort ?? defaultSort;
    return s === undefined ? "" : `${s.dir}:${s.field}`;
  };
  return words(a) === words(b) && where(a) === where(b) && JSON.stringify(a.formula ?? null) === JSON.stringify(b.formula ?? null) && sort(a) === sort(b);
}

/** The keys of the link of a view that are not facets. A facet with one of these names gets the key `f.<name>`. */
export const VIEW_KEYS: readonly string[] = ["q", "sort", "group", "show", "box", "vex"];

/** The options of the link of a view. */
export interface LinkOptions {
  /** The domains that write and read the domain values of the formula. */
  readonly domains?: readonly AnyDomain[];
}

/** A view read from a link: the view, the parts of the link that are not of the view (with no change), and the problems. */
export interface ViewLink {
  readonly view: RecordView;
  /** Each part `key=value` of the link that the view does not use, in its order. Thus a newer link keeps its keys in an older page. */
  readonly rest: readonly string[];
  readonly problems: readonly string[];
}

// The link uses the URI functions of ECMAScript. A plus in a link is a space, as in the form encoding of HTML.
const encode = (value: string): string => encodeURIComponent(value);
const decode = (value: string): string => decodeURIComponent(value.replaceAll("+", " "));

/** This function tells if a text of the view is there and not empty. */
const filled = (value: string | undefined): value is string => value !== undefined && value !== "";

/** This function gives the key of a facet in a link. An empty name, a key of the view and a name that starts with `f.` get the prefix `f.`. */
const facetKey = (name: string): string => (name === "" || VIEW_KEYS.includes(name) || name.startsWith("f.") ? `f.${name}` : name);

/**
 * This function gives the query of the link of a view, with no `?` (QUERY.LINK).
 *
 * - The order is `q`, the facets by name, `sort`, `group`, `show`, `box`, `vex` and the rest.
 * - The different values of a facet are joined with commas. A comma in a value is encoded, so each value comes back.
 * - The sort is the field, with `-` before it for the direction `desc`. A `-` at the start of the field is encoded.
 * - An empty search text, sort field, group or box is not in the link.
 * - The formula is `vex`, the encoded text of `serialize`. A formula that `serialize` refuses throws a `TypeError` (QUERY.LINK.FORMULA).
 * - A text with a lone surrogate has no form in a link. Thus `encodeURIComponent` throws its `URIError`.
 */
export function viewToQuery(view: RecordView, rest: readonly string[] = [], options: LinkOptions = {}): string {
  const parts: string[] = [];
  if (filled(view.text)) parts.push(`q=${encode(view.text)}`);
  for (const [name, values] of whereEntries(view)) parts.push(`${encode(facetKey(name))}=${[...new Set(values)].map(encode).join(",")}`);
  if (view.sort !== undefined && view.sort.field !== "") parts.push(`sort=${view.sort.dir === "desc" ? "-" : ""}${encode(view.sort.field).replace(/^-/, "%2D")}`);
  if (filled(view.group)) parts.push(`group=${encode(view.group)}`);
  if (view.show !== undefined) parts.push(`show=${view.show}`);
  if (filled(view.box)) parts.push(`box=${encode(view.box)}`);
  if (view.formula !== undefined) {
    const text = serialize(view.formula, options.domains);
    if (!text.ok) throw new TypeError(`The formula of the view has no JSON form: ${text.error.message}`);
    parts.push(`vex=${encode(text.value)}`);
  }
  return [...parts, ...rest].join("&");
}

type MutableView = { -readonly [K in keyof RecordView]: RecordView[K] };

/**
 * This function reads a view from the query of a link, with or without `?` (QUERY.LINK.READ). A `#` ends the query.
 * A key is a facet when it is in `facets`, or when it starts with `f.`. A part with another key goes into `rest`.
 * An empty value of a facet is a value, as in `URLSearchParams`. A facet named `__proto__` is a field of `where`.
 * A part with a bad value is a problem, and the view does not get it. `parse` reads the formula (QUERY.LINK.FORMULA).
 */
export function viewFromQuery(query: string, facets: Iterable<string>, options: LinkOptions = {}): ViewLink {
  const facetNames = new Set(facets);
  const problems: string[] = [];
  const rest: string[] = [];
  // A map keeps each name, also `__proto__`. Object.fromEntries then makes each name a field.
  const where = new Map<string, string[]>();
  const view: MutableView = {};
  const [search = ""] = query.replace(/^\?/, "").split("#");
  for (const part of search.split("&")) {
    if (part === "") continue;
    const at = part.indexOf("=");
    const rawKey = at < 0 ? part : part.slice(0, at);
    const raw = at < 0 ? "" : part.slice(at + 1);
    let key: string;
    try {
      key = decode(rawKey);
    } catch {
      problems.push(`The key of the part "${part}" does not decode.`);
      continue;
    }
    const facet = key.startsWith("f.") ? key.slice(2) : !VIEW_KEYS.includes(key) && facetNames.has(key) ? key : undefined;
    try {
      if (facet !== undefined) {
        const values = raw.split(",").map(decode);
        where.set(facet, [...new Set([...(where.get(facet) ?? []), ...values])]);
      } else if (key === "q") {
        const text = decode(raw);
        if (text !== "") view.text = text;
      } else if (key === "sort") {
        // The direction is the raw `-`. An encoded `-` (`%2D`) is the start of the field.
        const desc = raw.startsWith("-");
        const name = decode(desc ? raw.slice(1) : raw);
        if (name === "") problems.push("The sort has no field.");
        else view.sort = { field: name, dir: desc ? "desc" : "asc" };
      } else if (key === "show") {
        const show = decode(raw);
        if (show === "glow" || show === "only") view.show = show;
        else problems.push(`The show "${show}" is not glow or only.`);
      } else if (key === "group" || key === "box") {
        const value = decode(raw);
        if (value !== "") view[key] = value;
      } else if (key === "vex") {
        const formula = parse(decode(raw), options.domains);
        if (formula.ok) view.formula = formula.value;
        else problems.push(`The formula of the link is not a Vex program: ${formula.error.message}`);
      } else {
        rest.push(part);
      }
    } catch {
      problems.push(`The value of "${key}" does not decode.`);
    }
  }
  if (where.size > 0) view.where = Object.fromEntries(where);
  return { view, rest, problems };
}

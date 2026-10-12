/**
 * The view of a document: the sort, the filter and the closed groups. A view changes only the rows on the screen. It
 * does not change the document, so it does not change the results of the formulas.
 */
import type { Result } from "@mark1russell7/vex";
import type { SheetDoc } from "./doc.ts";
import type { Evaluation } from "./engine.ts";
import { formatValue } from "./values.ts";

/** The view: an optional sort by a column, a filter text, and the rows whose children are hidden. */
export interface View {
  readonly sort?: { readonly column: string; readonly dir: 1 | -1 } | undefined;
  readonly filter: string;
  readonly collapsed: ReadonlySet<string>;
}

/** A row on the screen. */
export interface VisibleRow {
  readonly id: string;
  readonly depth: number;
  readonly hasChildren: boolean;
}

/** The view with no sort, no filter and no closed groups. */
export const PLAIN_VIEW: View = { filter: "", collapsed: new Set() };

/** This function gives the text of a cell for the screen: the value, the error code, or nothing. */
export function cellText(r: Result<unknown> | undefined): string {
  return r === undefined ? "" : r.ok ? formatValue(r.value) : r.error.code;
}

/** The order of the kinds of results in a sort: values first, then errors, then empty cells. */
const rank = (r: Result<unknown> | undefined): number => (r === undefined ? 2 : r.ok ? 0 : 1);

/** This function compares two results for a sort: numbers by value, then text. Errors and empty cells come last. */
function compare(a: Result<unknown> | undefined, b: Result<unknown> | undefined): number {
  if (rank(a) !== rank(b) || rank(a) !== 0) return rank(a) - rank(b);
  const x = a?.ok === true ? a.value : undefined;
  const y = b?.ok === true ? b.value : undefined;
  if (typeof x === "number" && typeof y === "number") return x - y;
  if (typeof x === "boolean" && typeof y === "boolean") return Number(x) - Number(y);
  return formatValue(x).localeCompare(formatValue(y), undefined, { numeric: true });
}

/** This function gives the rows on the screen, in order, with their depth. */
export function visibleRows(doc: SheetDoc, ev: Evaluation, view: View): readonly VisibleRow[] {
  const kids = new Map<string | null, string[]>();
  for (const r of doc.rows) kids.set(r.parent, [...(kids.get(r.parent) ?? []), r.id]);
  const sort = view.sort;
  if (sort !== undefined) {
    for (const [p, list] of kids) kids.set(p, list.toSorted((a, b) => sort.dir * compare(ev.cell(a, sort.column), ev.cell(b, sort.column))));
  }
  const query = view.filter.trim().toLowerCase();
  const matches = (id: string): boolean => query === "" || doc.columns.some((c) => cellText(ev.cell(id, c.id)).toLowerCase().includes(query) || (doc.rows.find((r) => r.id === id)?.cells[c.id] ?? "").toLowerCase().includes(query));
  // A row stays when it matches, or when a row under it matches, so the tree around a match stays.
  const keep = new Map<string, boolean>();
  const keepOf = (id: string): boolean => {
    const known = keep.get(id);
    if (known !== undefined) return known;
    const k = matches(id) || (kids.get(id) ?? []).some(keepOf);
    keep.set(id, k);
    return k;
  };
  const out: VisibleRow[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const id of kids.get(parent) ?? []) {
      if (!keepOf(id)) continue;
      const children = kids.get(id) ?? [];
      out.push({ id, depth, hasChildren: children.length > 0 });
      if (!view.collapsed.has(id) || query !== "") walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

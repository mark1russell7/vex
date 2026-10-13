/**
 * The document of the sheet app: a table of rows and columns. A row has a parent row or none, so the rows make a tree.
 * The order of the rows is the order on the screen, and each row comes before its children. A value column keeps the
 * text of each cell. A formula column keeps one formula for all rows. Each operation gives a new document.
 */

/** The type of a value column. */
export type ValueType = "number" | "text" | "boolean" | "vec2" | "color";

/** A column whose cells keep text that the user writes. */
export interface ValueColumn {
  readonly id: string;
  readonly name: string;
  readonly kind: "value";
  readonly type: ValueType;
}

/** A column with one formula. Vex evaluates the formula at each row. */
export interface FormulaColumn {
  readonly id: string;
  readonly name: string;
  readonly kind: "formula";
  readonly formula: string;
}

/** A column of the table. */
export type Column = ValueColumn | FormulaColumn;

/** A row: its parent row or `null`, and the text of each value cell, by column id. */
export interface Row {
  readonly id: string;
  readonly parent: string | null;
  readonly cells: Readonly<Record<string, string>>;
}

/**
 * The chart of a document: the columns that it draws, and the column of the horizontal axis. A column of numbers
 * gives a line, and a column of vectors gives a path of points.
 */
export interface ChartSpec {
  /** The column of the horizontal axis, or `null` for the number of the row. */
  readonly x: string | null;
  /** The columns that the chart draws, in the order of the legend. */
  readonly series: readonly string[];
}

/** The document. */
export interface SheetDoc {
  readonly version: 1;
  readonly title: string;
  readonly columns: readonly Column[];
  readonly rows: readonly Row[];
  /** The chart, or none. */
  readonly chart?: ChartSpec;
}

/** The value types, in the order of the menus. */
export const VALUE_TYPES: readonly ValueType[] = ["number", "text", "boolean", "vec2", "color"];

/** This function gives a new id with the prefix `prefix` that is not in `used`. */
export function nextId(prefix: "r" | "c", used: Iterable<string>): string {
  const taken = new Set(used);
  let n = taken.size + 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** An empty document with one text column, one number column and one row. */
export function emptyDoc(title = "Untitled"): SheetDoc {
  return {
    version: 1,
    title,
    columns: [
      { id: "c1", name: "Item", kind: "value", type: "text" },
      { id: "c2", name: "Amount", kind: "value", type: "number" },
    ],
    rows: [{ id: "r1", parent: null, cells: {} }],
  };
}

const indexOf = (doc: SheetDoc, id: string): number => doc.rows.findIndex((r) => r.id === id);

/** This function gives the row `id` and each row under it, in order. The rows are one block of the list. */
export function subtree(doc: SheetDoc, id: string): readonly string[] {
  const out = new Set([id]);
  const start = indexOf(doc, id);
  if (start < 0) return [];
  for (const r of doc.rows.slice(start + 1)) {
    if (r.parent === null || !out.has(r.parent)) break;
    out.add(r.id);
  }
  return [...out];
}

/** This function gives the depth of a row: 0 for a row without a parent. */
export function depthOf(doc: SheetDoc, id: string): number {
  const byId = new Map(doc.rows.map((r) => [r.id, r]));
  let d = 0;
  for (let p = byId.get(id)?.parent ?? null; p !== null; p = byId.get(p)?.parent ?? null) d++;
  return d;
}

/** This function gives the rows with the same parent as the row `id`, in order. */
export function siblingsOf(doc: SheetDoc, id: string): readonly string[] {
  const parent = doc.rows.find((r) => r.id === id)?.parent ?? null;
  return doc.rows.filter((r) => r.parent === parent).map((r) => r.id);
}

/**
 * This function adds an empty row. Without `after`, the row goes to the end. With `after`, the row goes after the block
 * of that row. With `child`, the new row is the last child of `after`. Without `child`, it is a sibling of `after`.
 */
export function addRow(doc: SheetDoc, after?: string, child = false): { readonly doc: SheetDoc; readonly id: string } {
  const id = nextId("r", doc.rows.map((r) => r.id));
  const ref = after === undefined ? undefined : doc.rows.find((r) => r.id === after);
  if (ref === undefined) return { doc: { ...doc, rows: [...doc.rows, { id, parent: null, cells: {} }] }, id };
  const block = subtree(doc, ref.id);
  const at = indexOf(doc, block.at(-1) ?? ref.id) + 1;
  const row: Row = { id, parent: child ? ref.id : ref.parent, cells: {} };
  return { doc: { ...doc, rows: [...doc.rows.slice(0, at), row, ...doc.rows.slice(at)] }, id };
}

/** This function removes the row `id` and each row under it. */
export function deleteRow(doc: SheetDoc, id: string): SheetDoc {
  const gone = new Set(subtree(doc, id));
  return { ...doc, rows: doc.rows.filter((r) => !gone.has(r.id)) };
}

/** This function makes the row `id` the last child of its previous sibling. The first sibling does not change. */
export function indentRow(doc: SheetDoc, id: string): SheetDoc {
  const sibs = siblingsOf(doc, id);
  const prev = sibs[sibs.indexOf(id) - 1];
  if (prev === undefined) return doc;
  // The block of the previous sibling comes before this row, so the order of the list stays the same.
  return { ...doc, rows: doc.rows.map((r) => (r.id === id ? { ...r, parent: prev } : r)) };
}

/** This function makes the row `id` a sibling of its parent, after the block of the parent. A root does not change. */
export function outdentRow(doc: SheetDoc, id: string): SheetDoc {
  const row = doc.rows.find((r) => r.id === id);
  if (row === undefined || row.parent === null) return doc;
  const parent = doc.rows.find((r) => r.id === row.parent);
  const block = new Set(subtree(doc, id));
  const moved = doc.rows.filter((r) => block.has(r.id)).map((r) => (r.id === id ? { ...r, parent: parent?.parent ?? null } : r));
  const rest = doc.rows.filter((r) => !block.has(r.id));
  const parentBlock = subtree({ ...doc, rows: rest }, row.parent);
  const at = rest.findIndex((r) => r.id === parentBlock.at(-1)) + 1;
  return { ...doc, rows: [...rest.slice(0, at), ...moved, ...rest.slice(at)] };
}

/** This function moves the block of the row `id` before its previous sibling (-1) or after its next sibling (1). */
export function moveRow(doc: SheetDoc, id: string, dir: -1 | 1): SheetDoc {
  const sibs = siblingsOf(doc, id);
  const other = sibs[sibs.indexOf(id) + dir];
  if (other === undefined) return doc;
  const [first, second] = dir === -1 ? [other, id] : [id, other];
  const a = subtree(doc, first);
  const b = subtree(doc, second);
  const start = indexOf(doc, first);
  const rows = [...doc.rows];
  const blockA = rows.slice(start, start + a.length);
  const blockB = rows.slice(start + a.length, start + a.length + b.length);
  rows.splice(start, a.length + b.length, ...blockB, ...blockA);
  return { ...doc, rows };
}

/** This function sets the text of one value cell. */
export function setCell(doc: SheetDoc, rowId: string, columnId: string, text: string): SheetDoc {
  return { ...doc, rows: doc.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: text } } : r)) };
}

/** This function tells if `name` is free for a column, apart from the column `except`. The test ignores the case of letters. */
export function nameIsFree(doc: SheetDoc, name: string, except?: string): boolean {
  const n = name.trim().toLowerCase();
  return n !== "" && !doc.columns.some((c) => c.id !== except && c.name.toLowerCase() === n);
}

/** This function gives a free column name that starts with `base`. */
export function freeName(doc: SheetDoc, base: string): string {
  if (nameIsFree(doc, base)) return base;
  let n = 2;
  while (!nameIsFree(doc, `${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** This function adds a column at the position `at`, or at the end. */
export function addColumn(doc: SheetDoc, column: Omit<ValueColumn, "id"> | Omit<FormulaColumn, "id">, at?: number): { readonly doc: SheetDoc; readonly id: string } {
  const id = nextId("c", doc.columns.map((c) => c.id));
  const col = { ...column, id, name: freeName(doc, column.name) } as Column;
  const cols = [...doc.columns];
  cols.splice(at ?? cols.length, 0, col);
  return { doc: { ...doc, columns: cols }, id };
}

/** This function changes a column. A name that another column has does not change the name. */
export function updateColumn(doc: SheetDoc, id: string, patch: { readonly name?: string; readonly type?: ValueType; readonly formula?: string }): SheetDoc {
  return {
    ...doc,
    columns: doc.columns.map((c) => {
      if (c.id !== id) return c;
      const name = patch.name !== undefined && nameIsFree(doc, patch.name, id) ? patch.name.trim() : c.name;
      return c.kind === "value" ? { ...c, name, type: patch.type ?? c.type } : { ...c, name, formula: patch.formula ?? c.formula };
    }),
  };
}

/** This function changes a value column into a formula column, or a formula column into a value column. */
export function convertColumn(doc: SheetDoc, id: string): SheetDoc {
  return {
    ...doc,
    columns: doc.columns.map((c): Column => (c.id !== id ? c : c.kind === "value" ? { id, name: c.name, kind: "formula", formula: "" } : { id, name: c.name, kind: "value", type: "number" })),
  };
}

/** This function sets the chart of a document, or removes the chart when `chart` is `undefined`. */
export function setChart(doc: SheetDoc, chart: ChartSpec | undefined): SheetDoc {
  const { chart: _old, ...rest } = doc;
  return chart === undefined ? rest : { ...rest, chart };
}

/** This function removes a column and the text of its cells. The column also leaves the chart. */
export function deleteColumn(doc: SheetDoc, id: string): SheetDoc {
  return {
    ...doc,
    ...(doc.chart === undefined ? {} : { chart: { x: doc.chart.x === id ? null : doc.chart.x, series: doc.chart.series.filter((s) => s !== id) } }),
    columns: doc.columns.filter((c) => c.id !== id),
    rows: doc.rows.map((r) => {
      const { [id]: _gone, ...cells } = r.cells;
      return { ...r, cells };
    }),
  };
}

/** This function moves a column one place to the left (-1) or to the right (1). */
export function moveColumn(doc: SheetDoc, id: string, dir: -1 | 1): SheetDoc {
  const i = doc.columns.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.columns.length) return doc;
  const cols = [...doc.columns];
  [cols[i], cols[j]] = [cols[j] as Column, cols[i] as Column];
  return { ...doc, columns: cols };
}

const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null && !Array.isArray(u);

/** This function tells if a value is a valid chart for the columns `ids`: each column of the chart exists, once. */
function isChartSpec(u: unknown, ids: ReadonlySet<string>): boolean {
  if (!isRecord(u) || !Array.isArray(u["series"])) return false;
  const x = u["x"];
  const series = u["series"] as unknown[];
  if (x !== null && (typeof x !== "string" || !ids.has(x))) return false;
  return series.every((s) => typeof s === "string" && ids.has(s)) && new Set(series).size === series.length;
}

/**
 * This function tells if a value is a valid document: unique ids, known parents, and each parent before its children.
 * A chart uses only columns of the document.
 */
export function isSheetDoc(u: unknown): u is SheetDoc {
  if (!isRecord(u) || u["version"] !== 1 || typeof u["title"] !== "string" || !Array.isArray(u["columns"]) || !Array.isArray(u["rows"])) return false;
  const cols = u["columns"] as unknown[];
  const colIds = new Set<string>();
  for (const c of cols) {
    if (!isRecord(c) || typeof c["id"] !== "string" || typeof c["name"] !== "string" || colIds.has(c["id"])) return false;
    colIds.add(c["id"]);
    if (c["kind"] === "value" ? !VALUE_TYPES.includes(c["type"] as ValueType) : c["kind"] !== "formula" || typeof c["formula"] !== "string") return false;
  }
  if (u["chart"] !== undefined && !isChartSpec(u["chart"], colIds)) return false;
  const seen = new Set<string>();
  // The open rows: the ancestors of the next row. A child must follow its parent or a row under its parent.
  const open: string[] = [];
  for (const r of u["rows"] as unknown[]) {
    if (!isRecord(r) || typeof r["id"] !== "string" || seen.has(r["id"]) || !isRecord(r["cells"])) return false;
    const parent = r["parent"];
    if (parent !== null && (typeof parent !== "string" || !seen.has(parent))) return false;
    while (open.length > 0 && open.at(-1) !== parent) open.pop();
    if (parent !== null && open.length === 0) return false;
    if (!Object.values(r["cells"]).every((t) => typeof t === "string")) return false;
    seen.add(r["id"]);
    open.push(r["id"]);
  }
  return true;
}

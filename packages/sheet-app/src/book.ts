/**
 * A book: the tables of a document, and the table on the screen. The title of a table is its name, so a formula of
 * another table reads it with `table("title")`. Each operation gives a new book.
 */
import { emptyDoc, emptyGrid, isSheetDoc, uniqueNames, type SheetDoc } from "./doc.ts";

/** The book: its tables, and the position of the table on the screen. */
export interface Book {
  readonly version: 1;
  readonly tables: readonly SheetDoc[];
  readonly active: number;
}

/** This function gives a book with the tables `doc` and `more`, with `doc` on the screen. */
export const bookOf = (doc: SheetDoc, ...more: readonly SheetDoc[]): Book => ({ version: 1, tables: [doc, ...more], active: 0 });

/** This function gives the table on the screen. */
export const activeOf = (b: Book): SheetDoc => b.tables[b.active] ?? b.tables[0] ?? emptyDoc();

/** This function changes the table on the screen. A change that gives the same table gives the same book. */
export function withActive(b: Book, f: (d: SheetDoc) => SheetDoc): Book {
  const doc = activeOf(b);
  const next = f(doc);
  return next === doc ? b : { ...b, tables: b.tables.map((t, i) => (i === b.active ? next : t)) };
}

/** This function gives a title that no table of the book has, from `base`: "Table", then "Table 2" and so on. */
export function freeTitle(b: Book, base: string): string {
  const used = new Set(b.tables.map((t) => t.title.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/** This function adds an empty table or an empty grid at the end of the book, and shows it. */
export function addTable(b: Book, kind: "table" | "grid"): Book {
  const title = freeTitle(b, kind === "grid" ? "Grid" : "Table");
  return { ...b, tables: [...b.tables, kind === "grid" ? emptyGrid(title) : emptyDoc(title)], active: b.tables.length };
}

/** This function removes the table at the position `i`. A book keeps one table at least. */
export function removeTable(b: Book, i: number): Book {
  if (b.tables.length <= 1 || b.tables[i] === undefined) return b;
  const tables = b.tables.filter((_t, j) => j !== i);
  return { ...b, tables, active: Math.min(b.active > i ? b.active - 1 : b.active, tables.length - 1) };
}

/** This function shows the table at the position `i`. */
export const showTable = (b: Book, i: number): Book => (i === b.active || b.tables[i] === undefined ? b : { ...b, active: i });

/** This function tells if a value is a valid book: one or more valid tables, and the position of one of them. */
export function isBook(u: unknown): u is Book {
  if (typeof u !== "object" || u === null || Array.isArray(u)) return false;
  const r = u as Readonly<Record<string, unknown>>;
  const tables = r["tables"];
  return r["version"] === 1 && Array.isArray(tables) && tables.length > 0 && tables.every(isSheetDoc) && Number.isInteger(r["active"]) && (r["active"] as number) >= 0 && (r["active"] as number) < tables.length;
}

const isObject = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null && !Array.isArray(u);

/**
 * This function gives the second column of a name in a table the next free name. A file of an older version can have
 * such columns from a CSV import, and a table with them is not valid.
 */
function renamed(t: unknown): unknown {
  if (!isObject(t) || !Array.isArray(t["columns"])) return t;
  const columns: unknown[] = t["columns"];
  return columns.every((c) => isObject(c) && typeof c["name"] === "string") ? { ...t, columns: uniqueNames(columns as { readonly name: string }[]) } : t;
}

/** This function reads a book, or a single table as a book with one table. Another value gives `undefined`. */
export function toBook(u: unknown): Book | undefined {
  const v = isObject(u) && Array.isArray(u["tables"]) ? { ...u, tables: (u["tables"] as unknown[]).map(renamed) } : renamed(u);
  if (isBook(v)) return v;
  return isSheetDoc(v) ? bookOf(v) : undefined;
}

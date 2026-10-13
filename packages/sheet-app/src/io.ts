/**
 * The import and export of documents: CSV (RFC 4180), JSON, a share link, and the automatic save in the browser.
 */
import { toBook, type Book } from "./book.ts";
import { emptyDoc, isSheetDoc, nextId, type Column, type Row, type SheetDoc, type ValueType } from "./doc.ts";
import type { Evaluation } from "./engine.ts";
import { formatValue, parseValue } from "./values.ts";

/** This function reads CSV text into rows of fields. A quoted field can have commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

/** This function writes rows of fields as CSV text. */
export const toCsv = (rows: readonly (readonly string[])[]): string => rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";

/**
 * This function exports a document as CSV. The first two columns are `id` and `parent`, so an import keeps the tree.
 * A formula column gives its values, because CSV has no formulas. JSON keeps the formulas.
 */
export function exportCsv(doc: SheetDoc, ev: Evaluation): string {
  const header = ["id", "parent", ...doc.columns.map((c) => c.name)];
  const body = doc.rows.map((r) => [
    r.id,
    r.parent ?? "",
    ...doc.columns.map((c) => {
      if (c.kind === "value") return r.cells[c.id] ?? "";
      const res = ev.cell(r.id, c.id);
      return res === undefined ? "" : res.ok ? formatValue(res.value) : res.error.code;
    }),
  ]);
  return toCsv([header, ...body]);
}

/** This function guesses the type of a column from its texts: the first type that reads each text that is not empty. */
function guessType(texts: readonly string[]): ValueType {
  const full = texts.filter((t) => t.trim() !== "");
  const order: readonly ValueType[] = ["number", "boolean", "date", "vec2", "color"];
  return order.find((t) => full.length > 0 && full.every((s) => parseValue(t, s).kind === "ok")) ?? "text";
}

/** This function tells if the rows of a document keep the blocks of the tree. */
const keepsTree = (doc: SheetDoc): boolean => isSheetDoc(doc);

/** This function imports CSV text as a document. With the columns `id` and `parent`, it keeps the tree of the rows. */
export function importCsv(text: string, title = "Imported"): SheetDoc {
  const [header = [], ...lines] = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ""));
  const idAt = header.indexOf("id");
  const parentAt = header.indexOf("parent");
  const dataAt = header.map((_h, i) => i).filter((i) => i !== idAt && i !== parentAt);
  const columns: Column[] = dataAt.map((i, n) => ({ id: `c${n + 1}`, name: header[i]?.trim() || `Column ${n + 1}`, kind: "value", type: guessType(lines.map((l) => l[i] ?? "")) }));
  const used = new Set<string>();
  const ids: string[] = lines.map((l) => {
    const want = idAt >= 0 ? (l[idAt] ?? "").trim() : "";
    const id = want !== "" && !used.has(want) ? want : nextId("r", used);
    used.add(id);
    return id;
  });
  const seen = new Set<string>();
  const rows: Row[] = lines.map((l, k) => {
    const want = parentAt >= 0 ? (l[parentAt] ?? "").trim() : "";
    const id = ids[k] ?? `r${k + 1}`;
    // A parent must come before its child. Another parent makes the row a root.
    const parent = want !== "" && seen.has(want) ? want : null;
    seen.add(id);
    return { id, parent, cells: Object.fromEntries(dataAt.map((i, n) => [`c${n + 1}`, l[i] ?? ""])) };
  });
  const doc: SheetDoc = { version: 1, title, columns, rows: rows.length > 0 ? rows : emptyDoc().rows };
  // A file can give the rows of a tree in an order that breaks the blocks. Then the import makes each row a root.
  return keepsTree(doc) ? doc : { ...doc, rows: rows.map((r) => ({ ...r, parent: null })) };
}

/** This function gives the JSON text of a book: each table of the document. */
export const exportJson = (book: Book): string => JSON.stringify(book, null, 2);

/**
 * This function reads a book from JSON text. The JSON of a single table gives a book with one table. A text that is not
 * a valid book or table gives `undefined`.
 */
export function importJson(text: string): Book | undefined {
  try {
    const u: unknown = JSON.parse(text);
    return toBook(u);
  } catch {
    return undefined;
  }
}

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string): Uint8Array => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** This function encodes a book for the address of a share link: compressed JSON in base64url. */
export async function encodeShare(book: Book): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(book)), new CompressionStream("deflate-raw")));
}

/** This function decodes a share link, or gives `undefined` for a broken link. */
export async function decodeShare(text: string): Promise<Book | undefined> {
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(text), new DecompressionStream("deflate-raw")));
    return importJson(json);
  } catch {
    return undefined;
  }
}

const STORE = "vex-sheet:v1";

/** This function saves a document in the browser. A browser without storage does not save it. */
export function saveLocal(book: Book): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(book));
  } catch {
    // A private window or blocked storage: the app works without the automatic save.
  }
}

/** This function gives the document that the browser saved, or `undefined`. */
export function loadLocal(): Book | undefined {
  try {
    const text = localStorage.getItem(STORE);
    return text === null ? undefined : importJson(text);
  } catch {
    return undefined;
  }
}

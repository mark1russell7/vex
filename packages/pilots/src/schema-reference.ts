import type { JsonFieldSchema } from "./schema.ts";

/** This type is one leaf of a JSON document: its dotted path, its kind and its value. */
export interface JsonLeaf {
  readonly path: string;
  readonly kind: string;
  readonly value: unknown;
}

/** This type is the row of one path while the walk runs. */
interface PathRow {
  readonly kinds: Set<string>;
  count: number;
  lastDoc: number;
}

/** This constant is the deepest level of objects that a schema opens. A deeper object is one leaf. */
const DEPTH_LIMIT = 3;

/** This function tells if a value is a JSON object. */
export const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function gives the kind of a JSON value. The kind of an array names the distinct kinds of its items. */
export function jsonKind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (!Array.isArray(value)) return typeof value;
  const items = new Set<string>();
  for (const item of value as readonly unknown[]) items.add(Array.isArray(item) ? "array" : jsonKind(item));
  return items.size === 0 ? "array" : `array<${[...items].join("|")}>`;
}

/** This function gives each leaf of a JSON object to `visit`, depth first, in the order of its keys. */
function visitLeaves(doc: Readonly<Record<string, unknown>>, path: string, depth: number, visit: (path: string, value: unknown) => void): void {
  for (const key of Object.keys(doc)) {
    const value = doc[key];
    const at = path === "" ? key : `${path}.${key}`;
    if (isJsonObject(value) && depth < DEPTH_LIMIT && Object.keys(value).length > 0) visitLeaves(value, at, depth + 1, visit);
    else visit(at, value);
  }
}

/** This function gives the leaves of a JSON object, in the order of the walk. */
export function jsonLeaves(doc: Readonly<Record<string, unknown>>): readonly JsonLeaf[] {
  const leaves: JsonLeaf[] = [];
  visitLeaves(doc, "", 1, (path, value) => leaves.push({ path, kind: jsonKind(value), value }));
  return leaves;
}

/**
 * This function gives the schema of a collection from sample documents, in plain TypeScript. Each row is one path,
 * with its distinct kinds and the count of documents that have the path. The rows keep the order of first sight. A
 * row keeps the last document that it saw, so the count needs no set of documents.
 */
export function schemaReference(docs: readonly unknown[]): readonly JsonFieldSchema[] {
  const rows = new Map<string, PathRow>();
  docs.forEach((doc, index) => {
    if (!isJsonObject(doc)) return;
    visitLeaves(doc, "", 1, (path, value) => {
      let row = rows.get(path);
      if (row === undefined) {
        row = { kinds: new Set(), count: 0, lastDoc: -1 };
        rows.set(path, row);
      }
      row.kinds.add(jsonKind(value));
      if (row.lastDoc !== index) {
        row.lastDoc = index;
        row.count += 1;
      }
    });
  });
  return Array.from(rows, ([path, row]) => ({ path, kinds: [...row.kinds], count: row.count }));
}

import type { JsonFieldSchema } from "./schema.ts";

/** This type is one leaf of a JSON document: its dotted path, its kind and its value. */
export interface JsonLeaf {
  readonly path: string;
  readonly kind: string;
  readonly value: unknown;
}

/** This constant is the deepest level of objects that a schema opens. A deeper object is one leaf. */
const DEPTH_LIMIT = 3;

/** This function tells if a value is a JSON object. */
export const isJsonObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/** This function gives the kind of a JSON value. The kind of an array names the distinct kinds of its items. */
export function jsonKind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (!Array.isArray(value)) return typeof value;
  const items = new Set(value.map((item: unknown) => (Array.isArray(item) ? "array" : jsonKind(item))));
  return items.size === 0 ? "array" : `array<${[...items].join("|")}>`;
}

/** This function gives the leaves of a JSON object, depth first, in the order of its keys. */
export function jsonLeaves(doc: Readonly<Record<string, unknown>>, path = "", depth = 1): readonly JsonLeaf[] {
  return Object.keys(doc).flatMap((key): readonly JsonLeaf[] => {
    const value = doc[key];
    const at = path === "" ? key : `${path}.${key}`;
    const opens = isJsonObject(value) && depth < DEPTH_LIMIT && Object.keys(value).length > 0;
    return opens ? jsonLeaves(value, at, depth + 1) : [{ path: at, kind: jsonKind(value), value }];
  });
}

/**
 * This function gives the schema of a collection from sample documents, in plain TypeScript. Each row is one path,
 * with its distinct kinds and the count of documents that have the path. The rows keep the order of first sight.
 */
export function schemaReference(docs: readonly unknown[]): readonly JsonFieldSchema[] {
  const byPath = new Map<string, { readonly kind: string; readonly doc: number }[]>();
  docs.forEach((doc, index) => {
    if (!isJsonObject(doc)) return;
    for (const { path, kind } of jsonLeaves(doc)) {
      const seen = byPath.get(path);
      if (seen === undefined) byPath.set(path, [{ kind, doc: index }]);
      else seen.push({ kind, doc: index });
    }
  });
  return [...byPath].map(([path, seen]) => ({
    path,
    kinds: [...new Set(seen.map((s) => s.kind))],
    count: new Set(seen.map((s) => s.doc)).size,
  }));
}

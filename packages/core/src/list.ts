import { CHECKED } from "./checked.ts";
import type { Result } from "./result.ts";

/** One item of a list: the key of the target and the result of the body there. */
export interface ListItem<T = unknown> {
  readonly key: string;
  readonly result: Result<T>;
}

/** The value of an `each` expression: one item for each target of the axis. */
export interface VexList<T = unknown> {
  readonly kind: "vex.list";
  readonly items: readonly ListItem<T>[];
}

/** This function makes a list. */
export const vexList = <T>(items: readonly ListItem<T>[]): VexList<T> => Object.freeze({ kind: "vex.list", items: Object.freeze([...items]) });

/** This function tells if a value is an error value: a text `code`, `kind` and `message`, and a `path` (LIST.SHAPE). */
const isErrorValue = (u: unknown): boolean => {
  if (typeof u !== "object" || u === null) return false;
  const e = u as { code?: unknown; kind?: unknown; message?: unknown; path?: unknown };
  return typeof e.code === "string" && typeof e.kind === "string" && typeof e.message === "string" && Array.isArray(e.path);
};

/** This function tells if a value is an item of a list: a text key, and a value or an error value (LIST.SHAPE). */
const isListItem = (u: unknown): boolean => {
  if (typeof u !== "object" || u === null) return false;
  const { key, result } = u as { key?: unknown; result?: unknown };
  if (typeof key !== "string" || typeof result !== "object" || result === null) return false;
  const r = result as { ok?: unknown; value?: unknown; error?: unknown };
  return r.ok === true ? r.value !== undefined : r.ok === false && isErrorValue(r.error);
};

/**
 * This function tells if a value is a Vex list (LIST.SHAPE). A list has the kind `vex.list`, and each item has a text key
 * and a result. Another value with the kind `vex.list` is a record, so no list op applies to it. A frozen
 * list passes the check once.
 */
export const isVexList = (u: unknown): u is VexList => {
  if (typeof u !== "object" || u === null) return false;
  // Stryker disable next-line ConditionalExpression,BlockStatement: the cache holds only lists that pass the check again
  if (CHECKED.has(u)) return true;
  const { kind, items } = u as { kind?: unknown; items?: unknown };
  if (kind !== "vex.list" || !Array.isArray(items)) return false;
  // A loop over the positions, not `every`, so a hole of a sparse array is not an item.
  for (let i = 0; i < items.length; i++) if (!isListItem(items[i])) return false;
  if (Object.isFrozen(u) && Object.isFrozen(items)) CHECKED.add(u);
  return true;
};

/**
 * The name of a core list op. `sortBy`, `take`, `drop`, `append`, `flat` and `without` give a list (LIST.BUILD), and
 * the other ops give a value. `get` gives the value at a key (LIST.GET), and `indexOf` gives the position of a value
 * (LIST.INDEXOF).
 */
export type ListOp = "count" | "sum" | "min" | "max" | "mean" | "any" | "all" | "none" | "values" | "keys" | "reduce" | "first" | "errors" | "sortBy" | "take" | "nth" | "drop" | "append" | "flat" | "without" | "get" | "indexOf";

/**
 * The names of the core list ops. They apply when the first argument is a list. They apply to an array too, when no
 * domain and no function of the host has the op for it (LIST.ARRAY).
 */
export const LIST_OPS: ReadonlySet<string> = new Set<ListOp>(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors", "sortBy", "take", "nth", "drop", "append", "flat", "without", "get", "indexOf"]);

/** This function tells if a name is the name of a core list op. */
export const isListOp = (op: string): op is ListOp => LIST_OPS.has(op);

/** The options of a list op. */
export interface ListOptions {
  /** With `true`, any error item makes the result that error. The default skips error items. */
  readonly strict?: boolean;
}

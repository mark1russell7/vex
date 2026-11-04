import { CHECKED } from "./checked.ts";
import type { SizeRule } from "./domain.ts";
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
 * (LIST.INDEXOF). `distinct` and `group` give a list, and `join` gives a text (LIST.DISTINCT, LIST.GROUP, LIST.JOIN).
 * `setNth` gives a list with a new value at one position (LIST.SETNTH).
 */
export type ListOp = "count" | "sum" | "min" | "max" | "mean" | "any" | "all" | "none" | "values" | "keys" | "reduce" | "first" | "errors" | "sortBy" | "take" | "nth" | "setNth" | "drop" | "append" | "flat" | "without" | "get" | "indexOf" | "distinct" | "group" | "join";

/**
 * The names of the core list ops. They apply when the first argument is a list. They apply to an array too, when no
 * domain and no function of the host has the op for it (LIST.ARRAY).
 */
export const LIST_OPS: ReadonlySet<string> = new Set<ListOp>(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors", "sortBy", "take", "nth", "setNth", "drop", "append", "flat", "without", "get", "indexOf", "distinct", "group", "join"]);

/**
 * The size rules of the core list ops and of `fill` (LOOP.SIZE.OPS). Each op that gives a list has a rule here. An
 * error item has no size, so `errors` has no bound: the messages of the errors can hold texts.
 */
export const LIST_SIZES: Readonly<Record<ListOp | "fill", SizeRule>> = Object.freeze<Record<ListOp | "fill", SizeRule>>({
  count: "scalar",
  sum: "scalar",
  min: "scalar",
  max: "scalar",
  mean: "scalar",
  any: "scalar",
  all: "scalar",
  none: "scalar",
  indexOf: "scalar",
  values: { size: [1], count: [1], inner: [1], item: [1], keys: "position" },
  keys: { size: [1], count: [1], keys: "position" },
  errors: { size: ["unbounded"] },
  reduce: "reduce",
  first: { size: [[1, "item"]], count: [[1, "item"]], inner: [[1, "item"]], item: [1] },
  nth: { size: [[1, "item"], 0], count: [[1, "item"], 0], inner: [[1, "item"], 0], item: [1, 0] },
  get: { size: [[1, "item"], 0], count: [[1, "item"], 0], inner: [[1, "item"], 0], item: [1, 0] },
  // LOOP.SIZE.SETNTH: the bound counts the list and the value one time each. A bound cannot subtract the old item.
  setNth: { size: [1, 0, 1], count: [1, 0, 0], inner: [1, 0, [1, "count"]], item: [1, 0, [1, "size"]] },
  sortBy: { size: [1, 0], count: [1, 0], inner: [1, 0], item: [1, 0] },
  take: { size: [1, 0], count: [1, 0], inner: [1, 0], item: [1, 0], limit: 1 },
  drop: { size: [1, 0], count: [1, 0], inner: [1, 0], item: [1, 0] },
  without: { size: [1, 0], count: [1, 0], inner: [1, 0], item: [1, 0] },
  append: { size: [1, 1], count: [1, 1], inner: [1, 1], item: [1, 1] },
  flat: { size: [1], count: [[1, "inner"]], item: [1] },
  distinct: { size: [1], count: [1], inner: [1], item: [1] },
  group: { size: [1, "scaled"], count: [0, 1], inner: [[1, "count"], 0] },
  join: { size: [1, "each"] },
  fill: { size: [0, "copies"], count: ["number", 0], inner: [0, ["copies", "count"]], item: [0, [1, "size"]], keys: "position" },
});

/** This function tells if a name is the name of a core list op. */
export const isListOp = (op: string): op is ListOp => LIST_OPS.has(op);

/** The options of a list op. */
export interface ListOptions {
  /** With `true`, any error item makes the result that error. The default skips error items. */
  readonly strict?: boolean;
}

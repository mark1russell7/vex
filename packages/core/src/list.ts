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

/** This function tells if a value is a Vex list. */
export const isVexList = (u: unknown): u is VexList =>
  (u as { kind?: unknown } | null | undefined)?.kind === "vex.list" && Array.isArray((u as { items?: unknown }).items);

/**
 * The name of a core list op. `sortBy`, `take`, `drop`, `append`, `flat` and `without` give a list (LIST.BUILD), and
 * the other ops give a value. `get` gives the value at a key (LIST.GET).
 */
export type ListOp = "count" | "sum" | "min" | "max" | "mean" | "any" | "all" | "none" | "values" | "keys" | "reduce" | "first" | "errors" | "sortBy" | "take" | "nth" | "drop" | "append" | "flat" | "without" | "get";

/** The names of the core list ops. They apply when the first argument is a list. */
export const LIST_OPS: ReadonlySet<string> = new Set<ListOp>(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors", "sortBy", "take", "nth", "drop", "append", "flat", "without", "get"]);

/** This function tells if a name is the name of a core list op. */
export const isListOp = (op: string): op is ListOp => LIST_OPS.has(op);

/** The options of a list op. */
export interface ListOptions {
  /** With `true`, any error item makes the result that error. The default skips error items. */
  readonly strict?: boolean;
}

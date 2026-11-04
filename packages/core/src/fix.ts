/**
 * These are the rules of a fixed-point column that the closure compiler and the kernel share (FIX.ROUNDS, FIX.JOIN,
 * FIX.LIMIT). They are the limit of the rounds, the kinds of the values of a row and the join of a row. The package
 * index exports the rules that the compiler needs too (COMPILE.FIX).
 */
import { errorText, type ErrorText } from "./error-text.ts";
import { MAX_ITERATIONS, type FixJoin } from "./ir.ts";

/**
 * This function gives the largest number of rounds of a column of `rows` rows. A boolean column changes at least one row
 * in each round before the last, and a row changes one time. A path has fewer rows than the column, so a number
 * column stops in this bound when its steps follow paths (FIX.LIMIT).
 */
export const fixRounds = (rows: number): number => Math.min(rows + 1, MAX_ITERATIONS);

/** This function gives the kind of the values of a join. */
export const joinKind = (join: FixJoin): "boolean" | "number" => (join === "or" || join === "and" ? "boolean" : "number");

/** This function gives the reason that a value cannot be a value of a row, or `undefined` for a good value (FIX.KIND). */
export function fixValueError(name: string, join: FixJoin, value: unknown): ErrorText | undefined {
  const kind = joinKind(join);
  if (typeof value !== kind) return errorText.fixKind(name, join, kind, value);
  return kind === "boolean" || Number.isFinite(value) ? undefined : errorText.fixNumber(name, value);
}

/**
 * This function gives the error that stands for the failed rows of a round, or `undefined` when `#ARGS` must collect them
 * (FIX.ERROR). `#DEPTH!` wins. `#CYCLE!` comes next, so a cell on a cycle reports the cycle (SHEET.CYCLE).
 */
export function worstRow<E extends { readonly code: string }>(errors: readonly E[]): E | undefined {
  return errors.find((x) => x.code === "#DEPTH!") ?? errors.find((x) => x.code === "#CYCLE!") ?? (errors.length === 1 ? errors[0] : undefined);
}

/** This function joins the next value of a row to its old value (FIX.JOIN). The values have the kind of the join. */
export function joinValues(join: FixJoin, old: unknown, next: unknown): unknown {
  switch (join) {
    case "or":
      return old === true || next === true;
    case "and":
      return old === true && next === true;
    case "max":
      return Math.max(old as number, next as number);
    case "min":
      return Math.min(old as number, next as number);
  }
}

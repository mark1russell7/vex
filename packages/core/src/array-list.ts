/**
 * Arrays as lists (LIST.ARRAY). A JSON array of a field or of a name reads as a list where a list op or the axis `list`
 * needs a list. The package index does not export this module: `evaluate.ts` and `kernel.ts` use it.
 */
import type { VexError } from "./errors.ts";
import { MAX_ITERATIONS } from "./ir.ts";
import { isVexList, vexList, type ListItem, type VexList } from "./list.ts";
import { fail, ok } from "./result.ts";

/**
 * This function gives the list of an array (LIST.ARRAY). The key of each item is its position, from "0". A position
 * without a value, or with `null`, gives an error item from `missing`, as a missing field does (REF.MISSING).
 */
export function listOfArray(array: readonly unknown[], missing: (message: string) => VexError): VexList {
  const items: ListItem[] = [];
  // A loop over the positions, not `map`, so a hole of a sparse array is an error item too.
  for (let i = 0; i < array.length; i++) {
    const x = array[i];
    items.push({ key: String(i), result: x === undefined || x === null ? fail(missing(`the array has no value at the position ${String(i)}`)) : ok(x) });
  }
  return vexList(items);
}

/** This function gives a list, the list of an array, or `undefined` for another value (LIST.ARRAY). */
export const asList = (u: unknown, missing: (message: string) => VexError): VexList | undefined => (isVexList(u) ? u : Array.isArray(u) ? listOfArray(u, missing) : undefined);

/**
 * This function tells if a value is a count of `fill`: a whole number from 0 to the limit of `iterate`, 100000
 * (LIST.FILL). Thus a list of `fill` is not larger than the steps of a loop.
 */
export const isFillCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= MAX_ITERATIONS;

/** This function gives the list of `fill` (LIST.FILL): `n` items with the value `value`, and the keys "0" to "n - 1". */
export const fillList = (n: number, value: unknown): VexList => vexList(Array.from({ length: n }, (_x, i): ListItem => ({ key: String(i), result: ok(value) })));

/** This function tells if a value can be the value of `indexOf`: a number, a text or a boolean (LIST.INDEXOF). */
export const isIndexValue = (u: unknown): u is number | string | boolean => typeof u === "number" || typeof u === "string" || typeof u === "boolean";

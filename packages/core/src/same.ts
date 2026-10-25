/**
 * The comparison of the values of Vex for `agree` of the kernel (EVAL.AGREE), and the test of a Vex error. The package
 * index does not export this module: `kernel.ts` and `plan.ts` use it.
 */
import { sameValue } from "@mark1russell7/coeval";
import type { VexError } from "./errors.ts";

/** This function tells if a value is a Vex error: it has a code, a kind, a message and a path. */
export function isVexError(u: unknown): u is VexError {
  const e = u as Partial<VexError> | null | undefined;
  return typeof e?.code === "string" && typeof e.kind === "string" && typeof e.message === "string" && Array.isArray(e.path);
}

/** This function tells if a value is a value of a class: an object that is not a plain record and not an array. */
function isInstance(u: unknown): u is object {
  if (typeof u !== "object" || u === null || Array.isArray(u)) return false;
  const proto: unknown = Object.getPrototypeOf(u);
  return proto !== Object.prototype && proto !== null;
}

/**
 * This function compares two values of Vex for `agree`. Two Vex errors agree when they have the same code, because
 * only the closure compiler gives the location of an error (EVAL.LOCATION). Two values of one class agree when their
 * fields agree, for example two values of a domain from two decodes of a literal. The rules of `sameValue` compare
 * each other pair.
 */
export function sameVex(a: unknown, b: unknown): boolean | undefined {
  if (isVexError(a) && isVexError(b)) return a.code === b.code;
  if (!isInstance(a) || !isInstance(b)) return undefined;
  return Object.getPrototypeOf(a) === Object.getPrototypeOf(b) && sameValue({ ...a }, { ...b }, sameVex);
}

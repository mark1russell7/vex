/**
 * Comparison of the outcomes of the core interpreter and the reference interpreter.
 */
import { isVexList, type Result } from "@mark1russell7/vex";
import type { RefOutcome } from "./reference.ts";

/** A comparable form of an outcome: the error code, or the value with each list in a plain form. */
export type Comparable = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string };

const plain = (u: unknown): unknown => {
  if (isVexList(u)) {
    return u.items.map((it) => ({ key: it.key, ...(it.result.ok ? { ok: true, value: plain(it.result.value) } : { ok: false, code: it.result.error.code }) }));
  }
  if (Array.isArray(u)) return u.map(plain);
  if (typeof u === "object" && u !== null && "code" in u && "kind" in u && "message" in u) return { code: (u as { code: unknown }).code };
  // Stryker disable next-line ConditionalExpression: a primitive has a prototype that is not plain, so it gives itself either way
  if (typeof u === "object" && u !== null) {
    const proto: unknown = Object.getPrototypeOf(u);
    if (proto === Object.prototype || proto === null) {
      // Read descriptors, not values: a record with a getter that throws must not throw here.
      return Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(u)).map(([k, d]) => [k, "value" in d ? plain(d.value) : "<accessor>"]),
      );
    }
  }
  return u;
};

/** This function gives the comparable form of a core result. */
export const fromCore = (r: Result<unknown>): Comparable => (r.ok ? { ok: true, value: plain(r.value) } : { ok: false, code: r.error.code });

/** This function gives the comparable form of a reference outcome. */
export const fromReference = (r: RefOutcome): Comparable => (r.ok ? { ok: true, value: plain(r.value) } : { ok: false, code: r.code });

/**
 * The history of a document, for undo and redo. Each change pushes the old document. A change after an undo removes
 * the documents that redo can give.
 */
import type { Book } from "./book.ts";

/** The history: the documents before the present one, the present one, and the documents after it. */
export interface History<T = Book> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

const LIMIT = 200;

/** This function starts a history at `doc`. */
export const historyOf = <T>(doc: T): History<T> => ({ past: [], present: doc, future: [] });

/** This function records a change. A change that gives the same document is not a step. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

/** This function goes one step back. */
export function undo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1);
  return prev === undefined ? h : { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

/** This function goes one step forward. */
export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  return next === undefined ? h : { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

/**
 * The doubling programs of the limit of the places (COMPILE.PLACES), and the rule of that limit. The tests and the gate
 * `bench/places.ts` read this file.
 */
import { app, axes, each, ref, type Expr } from "@mark1russell7/vex";
import { doubling } from "@mark1russell7/vex-testkit";

const n = ref("n");

/** This function gives a doubling in which each level is a loop. */
function loops(depth: number): Expr {
  let e: Expr = n;
  for (let i = 0; i < depth; i++) e = app("sum", each(axes.all, app("add", e, e)));
  return e;
}

/** The doubling programs of the measures: the leaf is a read, a constant of the run, or each level is a loop. */
export const SHAPES: readonly (readonly [string, (depth: number) => Expr])[] = [
  ["plain", (depth) => doubling(n, depth)],
  ["constant", (depth) => doubling(app("sum", each(axes.all, n)), depth)],
  ["loop", loops],
];

/** The heap of a process of the gate, in MB. */
export const HEAP_MB = 2048;

/** The line of the rule: half of the heap, in MB. */
export const LINE_MB: number = HEAP_MB / 2;

/** One compile of a doubling program. `rssMB` is `undefined` if the compile gave no result: the heap ended, the time ended, or the compile refused. */
export interface PlacesRow {
  readonly mode: string;
  readonly shape: string;
  readonly depth: number;
  readonly rssMB: number | undefined;
}

/** This function tells if a row is over the line of the rule. */
const over = (r: PlacesRow): boolean => r.rssMB === undefined || r.rssMB > LINE_MB;

/** This function gives the worst row of each mode, shape and depth. A row with no result is the worst row. */
export function worstRows(rows: readonly PlacesRow[]): PlacesRow[] {
  const worst = new Map<string, PlacesRow>();
  for (const r of rows) {
    const key = `${r.mode} ${r.shape} ${String(r.depth)}`;
    const old = worst.get(key);
    if (old === undefined || r.rssMB === undefined || (old.rssMB !== undefined && r.rssMB > old.rssMB)) worst.set(key, r);
  }
  return [...worst.values()];
}

/**
 * This function gives the faults of the limit by its rule. The limit is the largest depth at which each row stays under
 * the line. So each row of `depth` stays under the line, and at least one row of `depth + 1` goes over it.
 */
export function placesFaults(rows: readonly PlacesRow[], depth: number): string[] {
  const at = rows.filter((r) => r.depth === depth);
  const next = rows.filter((r) => r.depth === depth + 1);
  if (at.length === 0 || next.length === 0) return [`the rows do not have the depths ${String(depth)} and ${String(depth + 1)}`];
  const faults = at.filter((r) => over(r)).map((r) => `${r.mode} ${r.shape} at depth ${String(depth)} goes over ${String(LINE_MB)} MB. Lower MAX_PLACES.`);
  if (!next.some((r) => over(r))) faults.push(`each row at depth ${String(depth + 1)} stays under ${String(LINE_MB)} MB. Raise MAX_PLACES.`);
  return faults;
}

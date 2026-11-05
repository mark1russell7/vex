/**
 * The doubling programs of the limit of the places (COMPILE.PLACES), and the rule of that limit. The tests and the gate
 * `bench/places.ts` read this file.
 */
import { app, axes, each, ref, type Expr } from "@mark1russell7/vex";
import { doubling } from "@mark1russell7/vex-testkit";
import { placesOf } from "../src/unshared.ts";

const n = ref("n");

/** This function gives a doubling in which each level is a loop. */
function loops(depth: number): Expr {
  let e: Expr = n;
  for (let i = 0; i < depth; i++) e = app("sum", each(axes.all, app("add", e, e)));
  return e;
}

/**
 * The doubling programs of the measures: the leaf is a read, a constant of the run, or each level is a loop. The third
 * part is the depth of the largest program of the shape under the limit. `namedFaults` checks each depth.
 */
export const SHAPES: readonly (readonly [string, (depth: number) => Expr, number])[] = [
  ["plain", (depth) => doubling(n, depth), 14],
  ["constant", (depth) => doubling(app("sum", each(axes.all, n)), depth), 13],
  ["loop", loops, 13],
];

/** The depths over the largest program that give 2 times its places. These rows are a record, and they pass or fail nothing. */
export const RECORD_DEPTHS = 1;

/** The depths over the largest program that give 4 times its places. At least one of these rows goes over the line. */
export const OVER_DEPTHS = 2;

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
 * This function gives a fault for each shape whose named depth is not the largest program under the limit. So a change
 * of the count fails the gate, and it does not change the rows that the gate measures.
 */
export function namedFaults(limit: number): string[] {
  const faults: string[] = [];
  for (const [shape, make, depth] of SHAPES) {
    const places = placesOf([make(depth)]);
    const next = placesOf([make(depth + 1)]);
    if (places > limit || next <= limit) faults.push(`${shape} at depth ${String(depth)} has ${String(places)} places, and the next depth has ${String(next)}. That is not the largest program under ${String(limit)}.`);
  }
  return faults;
}

/** This function gives the rows of each shape at `more` depths over its largest program, one list for each shape. */
function rowsOver(rows: readonly PlacesRow[], more: number): PlacesRow[][] {
  return SHAPES.map(([shape, , depth]) => rows.filter((r) => r.shape === shape && r.depth === depth + more));
}

/**
 * This function gives the faults of the limit by its rule. The limit counts places, so the rule reads the largest program
 * of each shape under the limit. Each of these rows stays under the line, and at least one row at 4 times the places
 * goes over it. A row at 2 times the places is a record only: it can fall on each side of the line, so this rule does
 * not find a limit that is one doubling too low. That limit refuses more programs, so it is safe.
 */
export function placesFaults(rows: readonly PlacesRow[]): string[] {
  const largest = rowsOver(rows, 0);
  const four = rowsOver(rows, OVER_DEPTHS);
  if ([...largest, ...four].some((x) => x.length === 0)) return ["the rows do not have the largest program of each shape and the program of 4 times its places"];
  const faults = largest.flat().filter((r) => over(r)).map((r) => `${r.mode} ${r.shape} at depth ${String(r.depth)} goes over ${String(LINE_MB)} MB. Lower MAX_PLACES.`);
  if (!four.flat().some((r) => over(r))) faults.push(`each row at 4 times the places stays under ${String(LINE_MB)} MB. Raise MAX_PLACES.`);
  return faults;
}

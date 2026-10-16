/**
 * The ireko audit pilot (docs/COMPILER.md §13.3, phase C3). After a layout, the audit of ireko
 * (https://github.com/mark1russell7/ireko) reports its defects. The check `ESCAPE` finds each node that is not inside
 * its container: the nearest ancestor in the nested mode. A container with the fit `clip` hides the parts outside it,
 * so it has no finding.
 *
 * `escapes` follows the code of ireko step by step. `ESCAPE_PROGRAM` is one Vex program that evaluates at each node,
 * and it reads the container at the position `c`. The tests compare the two. The check `OVERLAP` of ireko is a sweep
 * over the sorted boxes. A program over the axis `others` costs O(n²), so that check waits for the domain kernels of
 * phase C4.
 */
import { app, index, lit, ref, space, type Expr, type Space } from "@mark1russell7/vex";
import type { Schema } from "@mark1russell7/vex-compiler";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";

/** A placed node: its box, the index of its container or -1, and the fit `clip`. */
export interface PlacedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly container: number;
  readonly clip: boolean;
}

/** The tolerance of the audit of ireko, in pixels. */
export const TOLERANCE = 0.5;

/** A rectangle, as in the geometry of ireko. */
type Rect = Pick<PlacedBox, "x" | "y" | "width" | "height">;

/** This function tells if `outer` holds `inner`, with a tolerance. */
function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** This function tells for each node if the audit of ireko gives the finding `ESCAPE`. */
export function escapes(nodes: readonly PlacedBox[]): boolean[] {
  return nodes.map((node) => {
    const c = node.container;
    if (c < 0) return false;
    const holder = nodes[c];
    if (holder === undefined) throw new Error(`The container ${String(c)} does not exist.`);
    if (holder.clip) return false;
    return !contains(holder, node, TOLERANCE);
  });
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
/** A field of the container: the node at the position `c` (NAV.COMPUTED). */
const holder = (field: string): Expr => ref(field, [index(ref("c"))]);
const and = (...tests: Expr[]): Expr => tests.reduceRight((rest, t) => op("and", t, rest));

/** The program of the check `ESCAPE`. It evaluates at each node, and it gives true for a node with the finding. */
export const ESCAPE_PROGRAM: Expr = and(
  op("gte", ref("c"), lit(0)),
  op("not", holder("clip")),
  op(
    "not",
    and(
      op("gte", ref("x"), op("subtract", holder("x"), lit(TOLERANCE))),
      op("gte", ref("y"), op("subtract", holder("y"), lit(TOLERANCE))),
      op("lte", op("add", ref("x"), ref("w")), op("add", op("add", holder("x"), holder("w")), lit(TOLERANCE))),
      op("lte", op("add", ref("y"), ref("h")), op("add", op("add", holder("y"), holder("h")), lit(TOLERANCE))),
    ),
  ),
);

/** The kinds of the fields of a node, for the compiler (docs/COMPILER.md §3.2). */
export const ESCAPE_SCHEMA: Schema = { fields: { x: "number", y: "number", w: "number", h: "number", c: "number", clip: "boolean" }, vars: {} };

/** The domains of the program: numbers and booleans. */
export const ESCAPE_DOMAINS: readonly [typeof NumDomain, typeof BoolDomain] = [NumDomain, BoolDomain];

/** This function gives the space of the nodes of a run of the program. */
export function escapeRun(nodes: readonly PlacedBox[]): { readonly space: Space } {
  return { space: space.array(nodes.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height, c: b.container, clip: b.clip }))) };
}

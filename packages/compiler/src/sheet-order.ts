/**
 * The static order of the cells of a sheet in a module (COMPILE.MODULE.SHEET). It is the order of `SheetRun.fill` in
 * `packages/core/src/sheet.ts` (SHEET.FILL), and it uses `readsOf` and `isCellRef` of that file. The keys of a column
 * follow its reads from itself. The order changes only the speed, not a result (SHEET.ORDER).
 */
import { addrExprs, CELL_KIND, children, isCellRef, listOf, readsOf, shapeError, splitLimit, type Axis, type Direction, type Expr } from "@mark1russell7/vex";

/** This function gives the tests of the `where` axes of an axis. */
function testsOf(axis: Axis): readonly Expr[] {
  const tests: Expr[] = [];
  for (let x = axis; x.t === "where"; x = x.axis) tests.push(x.test);
  return tests;
}

/**
 * The order of the keys of a column, from the directions of its reads from itself. `reverse` reverses the key order. In
 * a tree, `post` puts the children before their parent, and `back` reverses the order of the siblings.
 */
export interface KeyOrder {
  readonly reverse: boolean;
  readonly post: boolean;
  readonly back: boolean;
}

/**
 * This function gives the order of the keys of a column. A read of a later key reverses the order. In a tree, a read of
 * the children puts the children before their parent, as `keyOrder` of `SheetRun` does.
 */
export function keyOrderOf(d: ReadonlySet<Direction>): KeyOrder {
  const reverse = d.has("after") && !d.has("before");
  const post = d.has("down");
  return { reverse, post, back: post !== reverse };
}

/**
 * The place of a read of a cell, relative to the key of the formula. The place `key` is the key itself. The place
 * `children` is the body or a test of the axis `children` of the key. The place `unknown` is each other place.
 */
type ReadPlace = "key" | "children" | "unknown";

/** This function gives the axis under the tests of `where` and under `reverse`. Both read the targets of that axis. */
function baseOf(axis: Axis): Axis {
  let base = axis;
  while (base.t === "where" || base.t === "reverse") base = base.axis;
  return base;
}

/**
 * This function tells if each read of a cell of the column `self` reads a finished cell in the static order of the
 * fill (COMPILE.MODULE.SHEET.DIRECT). A read of a column before `self` in `order` reads a finished cell. A read of a
 * column that the sheet does not have also reads a finished cell. A read of `self` reads a finished cell only in
 * these three forms:
 * - in a tree in pre-order, at the move `parent` from the key,
 * - in an array in key order, at an offset of one negative step from the key,
 * - in a tree in post-order, at the key of a target of the axis `children` of the key.
 *
 * A read in the body of a function can evaluate at each place of a call, so it is not one of these forms.
 *
 * The columns of `fused` come before `self` in one loop over the keys (COMPILE.MODULE.ONCE). The loop evaluates each of
 * them at a key before `self` at that key. Thus a read of one of them reads a finished cell only at the key itself, or
 * in one of the three forms.
 */
export function readsFinished(columns: ReadonlyMap<string, Expr>, order: readonly string[], self: string, tree: boolean, fused: ReadonlySet<string> = new Set()): boolean {
  const formula = columns.get(self);
  if (formula === undefined || shapeError(formula) !== undefined) return false;
  const { reverse, post } = keyOrderOf(readsOf(columns, new Map(), self).directions);
  const position = order.indexOf(self);
  const todo: [Expr, ReadPlace][] = [[formula, "key"]];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const [e, place] = item;
    // A test of the axis of a data limit reads at each target, as the test of an `each` does.
    const split = e.tag === "iterate" ? splitLimit(e) : undefined;
    if (split !== undefined) for (const x of split) todo.push([x, place]);
    else if (e.tag === "each" || e.tag === "fold") {
      const inner: ReadPlace = place === "key" && (e.at === undefined || e.at.length === 0) && baseOf(e.axis).t === "children" ? "children" : "unknown";
      for (const x of [...(e.tag === "each" ? [e.body] : Object.values(e.step)), ...testsOf(e.axis)]) todo.push([x, inner]);
      const list = listOf(e.axis);
      for (const x of [...(e.tag === "fold" ? [...Object.values(e.init), e.result] : []), ...addrExprs(e.at), ...(list === undefined ? [] : [list])]) todo.push([x, place]);
    } else if (e.tag === "fn") todo.push([e.body, "unknown"]);
    else if (e.tag !== "ext") for (const child of children(e)) todo.push([child, place]);
    else if (e.kind === CELL_KIND && isCellRef(e.data)) {
      const { column, at } = e.data;
      const index = order.indexOf(column);
      if (index > position) return false;
      if (column !== self && !fused.has(column)) continue;
      const [move, ...rest] = at;
      // The cell of a fused column at the key itself is finished. The cell of `self` at the key is a cycle.
      const here = column !== self && place === "key" && at.every((m) => m.t === "origin");
      const ok =
        here ||
        (place === "key"
          ? move !== undefined && rest.length === 0 && ((tree && !post && move.t === "parent") || (!tree && !reverse && move.t === "offset" && move.d.length === 1 && (move.d[0] ?? 0) < 0))
          : place === "children" && tree && post && at.length === 0);
      if (!ok) return false;
    }
  }
  return true;
}

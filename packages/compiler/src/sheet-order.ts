/**
 * The static order of the cells of a sheet in a module (COMPILE.MODULE.SHEET). It is the order of `SheetRun.fill` in
 * `packages/core/src/sheet.ts` (SHEET.FILL). Each column comes after the columns that it reads. The keys of a column
 * follow its reads from itself. The order changes only the speed, not a result (SHEET.ORDER).
 */
import { addrExprs, CELL_KIND, children, isMove, listOf, moveExpr, shapeError, type Axis, type CellFormulas, type CellRef, type Expr, type Move } from "@mark1russell7/vex";

/** A direction of the reads of a column from itself: to an earlier key, to a later key, or down a tree to the children. */
export type Direction = "before" | "after" | "down";

/** This function tells if the data of an extension is a cell reference: a column, and an address of fixed moves. */
export const isCellRef = (u: unknown): u is CellRef =>
  typeof u === "object" &&
  u !== null &&
  typeof (u as { column?: unknown }).column === "string" &&
  Array.isArray((u as { at?: unknown }).at) &&
  (u as { at: readonly unknown[] }).at.every((m) => isMove(m) && moveExpr(m) === undefined);

/** This function adds the direction of one move or one axis of a read of a column from itself. */
function addDirection(d: Set<Direction>, m: Move | Axis): void {
  // The reverse order reads the same keys as its axis.
  if (m.t === "reverse") {
    addDirection(d, m.axis);
    return;
  }
  if (m.t === "offset" || m.t === "window") {
    // An offset moves by its first step that is not 0. A window reads the keys from `from` to `to`.
    const steps = m.t === "offset" ? [m.d.find((x) => x !== 0) ?? 0] : [m.from, m.to];
    // A step of 0 reads the cell itself, which is a cycle in each order.
    // Stryker disable next-line EqualityOperator: see the comment above
    if (steps.some((x) => x < 0)) d.add("before");
    // Stryker disable next-line EqualityOperator: see the comment above
    if (steps.some((x) => x > 0)) d.add("after");
  } else if (m.t === "children" || m.t === "descendants") d.add("down");
  // The items of a list can be at each key, so the axis list gives no direction, and the other reads decide the order.
}

/** This function gives the base axis of an axis, and the tests of its `where` axes. */
function partsOf(axis: Axis): { readonly base: Axis; readonly tests: readonly Expr[] } {
  const tests: Expr[] = [];
  let base = axis;
  while (base.t === "where") {
    tests.push(base.test);
    base = base.axis;
  }
  return { base, tests };
}

/**
 * This function gives the columns that the formulas of the column `self` read with a cell reference: its formula and
 * the formulas of its cells. It also gives the directions of their reads of the column itself. A read in the body or
 * in a test of an axis also has the direction of that axis.
 */
export function readsOf(columns: ReadonlyMap<string, Expr>, cells: CellFormulas, self: string): { readonly columns: ReadonlySet<string>; readonly directions: ReadonlySet<Direction> } {
  const read = new Set<string>();
  const directions = new Set<Direction>();
  const formula = columns.get(self);
  // An expression that is not valid reads no column. A module gives the reason for it.
  const todo: [Expr, Axis | undefined][] = [...(formula === undefined ? [] : [formula]), ...(cells.get(self)?.values() ?? [])].filter((e) => shapeError(e) === undefined).map((e) => [e, undefined]);
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const [e, axis] = item;
    if (e.tag === "each" || e.tag === "fold") {
      const { base, tests } = partsOf(e.axis);
      for (const x of [...(e.tag === "each" ? [e.body] : Object.values(e.step)), ...tests]) todo.push([x, base]);
      // The values of init, the result of a fold, the list of the axis list and the expressions of the address evaluate
      // at the node, so they keep the outer direction.
      const list = listOf(e.axis);
      for (const x of [...(e.tag === "fold" ? [...Object.values(e.init), e.result] : []), ...addrExprs(e.at), ...(list === undefined ? [] : [list])]) todo.push([x, axis]);
    } else if (e.tag !== "ext") {
      for (const child of children(e)) todo.push([child, axis]);
      // The data of an extension of another kind can look like a cell reference. It only changes the order of a fill.
      // Stryker disable next-line ConditionalExpression,LogicalOperator: see the comment above
    } else if (e.kind === CELL_KIND && isCellRef(e.data)) {
      read.add(e.data.column);
      // The directions of the reads of another column only change the order, because that column comes first.
      // Stryker disable next-line ConditionalExpression: see the comment above
      if (e.data.column === self) for (const m of [...(axis === undefined ? [] : [axis]), ...e.data.at]) addDirection(directions, m);
    }
  }
  return { columns: read, directions };
}

/**
 * This function gives the columns of a sheet in an order where each column comes after the columns that it reads. The
 * columns of a cycle keep their order. The columns with formulas of cells only come last.
 */
export function columnOrder(columns: ReadonlyMap<string, Expr>, cells: CellFormulas): readonly string[] {
  const names = new Set([...columns.keys(), ...cells.keys()]);
  let left = [...names].map((c) => ({ c, needs: [...readsOf(columns, cells, c).columns].filter((x) => x !== c && names.has(x)) }));
  const order: string[] = [];
  const placed = new Set<string>();
  // Each pass places each column whose reads are placed. A pass that places no column leaves a cycle, so it places
  // the first column that is left.
  while (left.length > 0) {
    const ready = left.filter((x) => x.needs.every((n) => placed.has(n)));
    for (const x of ready.length > 0 ? ready : left.slice(0, 1)) {
      order.push(x.c);
      placed.add(x.c);
    }
    left = left.filter((x) => !placed.has(x.c));
  }
  return order;
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
    if (e.tag === "each" || e.tag === "fold") {
      const inner: ReadPlace = place === "key" && (e.at === undefined || e.at.length === 0) && baseOf(e.axis).t === "children" ? "children" : "unknown";
      const { tests } = partsOf(e.axis);
      for (const x of [...(e.tag === "each" ? [e.body] : Object.values(e.step)), ...tests]) todo.push([x, inner]);
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

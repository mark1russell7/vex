import { addrExprs, children, type Addr, type Axis, type Expr } from "./ir.ts";

/** One static read of a program: a field path at an address, inside zero or more axes. */
export interface Dependency {
  /** The address of the read. The empty address is the focus. */
  readonly at: Addr;
  /** The field path of the read. */
  readonly path: readonly string[];
  /** The axes around the read, from the outside to the inside. Inside an axis, the focus is the target. */
  readonly axes: readonly Axis["t"][];
  /** The address of each axis in `axes`, in the same order. The empty address is the focus. */
  readonly axisAt: readonly Addr[];
}

/**
 * This function gives the static reads of an expression. A host can use them to recompute a program only
 * when a field that it reads changes. A computed move reads a key that only a run knows. Its address keeps the
 * expression, and the reads of that expression are in the list too (NAV.COMPUTED).
 */
export function deps(e: Expr): readonly Dependency[] {
  const out: Dependency[] = [];
  // A stack, not recursion, so a deep expression needs no deep call stack. The children go on the stack in reverse
  // order, so the reads come out in the order of a depth-first walk.
  const todo: { readonly x: Expr; readonly axes: readonly Axis["t"][]; readonly axisAt: readonly Addr[] }[] = [{ x: e, axes: [], axisAt: [] }];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const { x } = item;
    if (x.tag === "ref") out.push({ at: x.at ?? [], path: x.path, axes: item.axes, axisAt: item.axisAt });
    const all = children(x);
    const axial = x.tag === "each" || x.tag === "fold";
    // Inside the axis: the body or the values of the step, and the tests of where. The values of init, the result of a
    // fold and the expressions of an address evaluate at the node, outside the axis.
    const first = x.tag === "fold" ? Object.keys(x.init).length : 0;
    const last = axial ? all.length - addrExprs(x.at).length - (x.tag === "fold" ? 1 : 0) : 0;
    const axes = axial ? [...item.axes, x.axis.t] : item.axes;
    const axisAt = axial ? [...item.axisAt, x.at ?? []] : item.axisAt;
    for (let i = all.length - 1; i >= 0; i--) todo.push(i >= first && i < last ? { x: all[i] as Expr, axes, axisAt } : { ...item, x: all[i] as Expr });
  }
  return out;
}

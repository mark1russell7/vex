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
    // The expressions of an address come last, and they evaluate at the node, outside its axis.
    const outside = all.length - addrExprs(x.tag === "ref" || x.tag === "each" ? x.at : undefined).length;
    const axes = x.tag === "each" ? [...item.axes, x.axis.t] : item.axes;
    const axisAt = x.tag === "each" ? [...item.axisAt, x.at ?? []] : item.axisAt;
    for (let i = all.length - 1; i >= 0; i--) todo.push(i < outside ? { x: all[i] as Expr, axes, axisAt } : { ...item, x: all[i] as Expr });
  }
  return out;
}

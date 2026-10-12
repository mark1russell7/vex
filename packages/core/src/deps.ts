import { children, type Addr, type Axis, type Expr } from "./ir.ts";

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
 * when a field that it reads changes.
 */
export function deps(e: Expr): readonly Dependency[] {
  const out: Dependency[] = [];
  // A stack, not recursion, so a deep expression needs no deep call stack. The children go on the stack in reverse
  // order, so the reads come out in the order of a depth-first walk.
  const todo: { readonly x: Expr; readonly axes: readonly Axis["t"][]; readonly axisAt: readonly Addr[] }[] = [{ x: e, axes: [], axisAt: [] }];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const { x } = item;
    if (x.tag === "ref") {
      out.push({ at: x.at ?? [], path: x.path, axes: item.axes, axisAt: item.axisAt });
      continue;
    }
    const axes = x.tag === "each" ? [...item.axes, x.axis.t] : item.axes;
    const axisAt = x.tag === "each" ? [...item.axisAt, x.at ?? []] : item.axisAt;
    for (const child of children(x).toReversed()) todo.push({ x: child, axes, axisAt });
  }
  return out;
}

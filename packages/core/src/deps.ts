import { addrExprs, children, listOf, type Addr, type Axis, type Expr, type ExprOf } from "./ir.ts";

/** A bound function: its node, and the functions of the place of its binding. */
interface Bound {
  readonly fn: ExprOf<"fn">;
  readonly fns: ReadonlyMap<string, Bound>;
}

/** This function gives the functions of a scope without some names: a parameter or a binding hides a function. */
const without = (fns: ReadonlyMap<string, Bound>, names: readonly string[]): ReadonlyMap<string, Bound> => new Map([...fns].filter(([n]) => !names.includes(n)));

/**
 * This function gives the functions that each child of a node sees. The names of a loop hide the functions with those
 * names in its steps, its test of until and its result. The values of init, the tests of where and an address see the
 * functions outside.
 */
function childFns(x: Expr, fns: ReadonlyMap<string, Bound>, count: number): (i: number) => ReadonlyMap<string, Bound> {
  if (x.tag !== "fold" && x.tag !== "iterate") return () => fns;
  const hidden = without(fns, Object.keys(x.init));
  const first = Object.keys(x.init).length;
  const steps = first + Object.keys(x.step).length;
  // The children of a fold have the tests of where and the address between the steps and the result.
  return (i) => (i >= first && (i < steps || i === count - 1 || x.tag === "iterate") ? hidden : fns);
}

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
  type Item = { readonly x: Expr; readonly axes: readonly Axis["t"][]; readonly axisAt: readonly Addr[]; readonly fns: ReadonlyMap<string, Bound> };
  const todo: Item[] = [{ x: e, axes: [], axisAt: [], fns: new Map() }];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const { x } = item;
    if (x.tag === "ref") out.push({ at: x.at ?? [], path: x.path, axes: item.axes, axisAt: item.axisAt });
    // A function reads at each call, inside the axes of the call (FN.CALL). Its body does not read where it is bound.
    if (x.tag === "let") {
      const names = Object.keys(x.bind);
      const inner = new Map(without(item.fns, names));
      for (const [name, b] of Object.entries(x.bind)) if (b.tag === "fn") inner.set(name, { fn: b, fns: item.fns });
      todo.push({ ...item, x: x.body, fns: inner });
      for (const b of Object.values(x.bind).toReversed()) if (b.tag !== "fn") todo.push({ ...item, x: b });
      continue;
    }
    if (x.tag === "call") {
      const bound = item.fns.get(x.fn);
      if (bound !== undefined) todo.push({ ...item, x: bound.fn.body, fns: without(bound.fns, bound.fn.params) });
      for (const a of x.args.toReversed()) todo.push({ ...item, x: a });
      continue;
    }
    const all = children(x);
    const fnsOf = childFns(x, item.fns, all.length);
    const axial = x.tag === "each" || x.tag === "fold";
    // Inside the axis: the body or the values of the step, and the tests of where. The values of init, the result of a
    // fold, the list of the axis list and the expressions of an address evaluate at the node, outside the axis.
    const first = x.tag === "fold" ? Object.keys(x.init).length : 0;
    const last = axial ? all.length - addrExprs(x.at).length - (x.tag === "fold" ? 1 : 0) : 0;
    // The list of the axis list comes after the body or the values of the step, before the tests of where.
    const listAt = axial && listOf(x.axis) !== undefined ? (x.tag === "fold" ? first + Object.keys(x.step).length : 1) : -1;
    const axes = axial ? [...item.axes, x.axis.t] : item.axes;
    const axisAt = axial ? [...item.axisAt, x.at ?? []] : item.axisAt;
    for (let i = all.length - 1; i >= 0; i--) {
      const inside = i >= first && i < last && i !== listAt;
      todo.push({ x: all[i] as Expr, axes: inside ? axes : item.axes, axisAt: inside ? axisAt : item.axisAt, fns: fnsOf(i) });
    }
  }
  return out;
}

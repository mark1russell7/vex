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
  const walk = (x: Expr, axes: readonly Axis["t"][], axisAt: readonly Addr[]): void => {
    if (x.tag === "ref") {
      out.push({ at: x.at ?? [], path: x.path, axes, axisAt });
      return;
    }
    if (x.tag === "each") {
      const inner = [...axes, x.axis.t];
      const innerAt = [...axisAt, x.at ?? []];
      children(x).forEach((c) => walk(c, inner, innerAt));
      return;
    }
    children(x).forEach((c) => walk(c, axes, axisAt));
  };
  walk(e, [], []);
  return out;
}

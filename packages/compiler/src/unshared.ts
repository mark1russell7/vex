/**
 * A program can use one object at two places, and a name can have two meanings at those places. The printer and the
 * lowering hold facts of a place by the object of its node, so this file gives each place an object of its own first.
 * A program from JSON is a tree, so it stays the same objects. The root and `./module` of this package do not export this file.
 */
import { children, type Expr, MAX_NESTING, nestingOf } from "@mark1russell7/vex";

/** The original of each copy that `unsharedAll` made. */
const ORIGINALS = new WeakMap<Expr, Expr>();

/** This function tells if two places of the expressions hold one object. */
function sharesNode(exprs: readonly Expr[]): boolean {
  const seen = new Set<Expr>();
  const todo = [...exprs];
  for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
    if (seen.has(x)) return true;
    seen.add(x);
    todo.push(...children(x));
  }
  return false;
}

/** This function gives a copy of a part of an expression, with a new object for each place. A value of a literal and the data of an extension are not nodes, so they stay. */
function copied(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(copied);
  if (typeof x !== "object" || x === null) return x;
  const tag = (x as { tag?: unknown }).tag;
  if (tag === "lit" || tag === "ext") return noted({ ...x }, x);
  const out: unknown = Object.fromEntries(Object.entries(x).map(([name, part]) => [name, copied(part)]));
  return typeof tag === "string" ? noted(out, x) : out;
}

/** This function notes the original of a copy of a node, and gives the copy. */
function noted(copy: unknown, original: unknown): unknown {
  ORIGINALS.set(copy as Expr, original as Expr);
  return copy;
}

/**
 * This function gives the expressions with one object at each place. Expressions without a shared object stay the same
 * objects. So does an expression that is nested too deep: the printer and the lowering refuse it.
 */
export function unsharedAll(exprs: readonly Expr[]): readonly Expr[] {
  return !sharesNode(exprs) || exprs.some((e) => nestingOf(e) > MAX_NESTING) ? exprs : (exprs.map(copied) as readonly Expr[]);
}

/** This function gives the expression with one object at each place, as `unsharedAll` does. */
export const unshared = (e: Expr): Expr => unsharedAll([e])[0] as Expr;

/** This function gives the original of a copy, and an expression that is not a copy gives itself. */
export const originalOf = (e: Expr): Expr => ORIGINALS.get(e) ?? e;

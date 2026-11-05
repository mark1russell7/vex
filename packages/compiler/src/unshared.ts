/**
 * A program can use one object at two places, and a name can have two meanings at those places. The printer and the
 * lowering hold facts of a place by the object of its node. Thus this file first gives each place an object of its own.
 * A program from JSON is a tree, so it stays the same objects. The root and `./module` of this package do not export this file.
 */
import { children, type Expr, MAX_NESTING, nestingOf } from "@mark1russell7/vex";

/** The original of each copy that `unsharedAll` made. */
const ORIGINALS = new WeakMap<Expr, Expr>();

/**
 * The most places that a program can have for a compile (COMPILE.PLACES). A place is a node at one position of the tree
 * of the program, so a shared object counts once for each place. The compile takes time at each place.
 *
 * The rule: the largest program of each doubling shape under this limit stays under 1,024 MB, half of a heap of 2,048 MB.
 * At 4 times the places, at least one shape goes over that line. The workflow `places-gate.yml` holds this rule.
 *
 * The worst of 5 fresh processes in tier 2 at the limit is 560 MB (plain), 566 MB (constant) and 489 MB (loop).
 * At 4 times the places it is 1,661 MB, 1,699 MB and 1,469 MB. The limit is 15 times the largest module of `ireko`.
 * `docs/COMPILER.md` has the measures.
 */
export const MAX_PLACES: number = 1 << 15;

/** This function gives the parts of a node. A node that is not valid has no parts here, and the check of the shape gives its reason. */
function partsOf(x: Expr): readonly Expr[] {
  try {
    return children(x).filter((part) => typeof part === "object" && (part as unknown) !== null);
  } catch {
    return [];
  }
}

/** This function gives the count of the objects of the expressions when each object has one place. Otherwise it gives `undefined`. */
function treeSize(exprs: readonly Expr[]): number | undefined {
  const seen = new Set<Expr>();
  const todo = [...exprs];
  for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
    if (seen.has(x)) return undefined;
    seen.add(x);
    todo.push(...partsOf(x));
  }
  return seen.size;
}

/**
 * This function gives the number of places of expressions with a shared object, with a walk that visits each object once.
 * So it takes the time of the objects, not of the places. An object that holds itself has no end, and its count is infinite.
 */
function sharedPlaces(exprs: readonly Expr[]): number {
  const counts = new Map<Expr, number>();
  const open = new Map<Expr, readonly Expr[]>();
  const todo = [...exprs];
  for (let x = todo.at(-1); x !== undefined; x = todo.at(-1)) {
    const parts = open.get(x);
    if (counts.has(x)) {
      todo.pop();
    } else if (parts !== undefined) {
      todo.pop();
      counts.set(x, parts.reduce((sum, part) => sum + (counts.get(part) ?? Infinity), 1));
    } else {
      const own = partsOf(x);
      open.set(x, own);
      todo.push(...own.filter((part) => !counts.has(part)));
    }
  }
  return exprs.reduce((sum, e) => sum + (counts.get(e) as number), 0);
}

/** This function gives the number of places of the expressions. */
export const placesOf = (exprs: readonly Expr[]): number => treeSize(exprs) ?? sharedPlaces(exprs);

/** The result of one walk of a program: the reason that a compile refuses it (COMPILE.PLACES), and if two places hold one object. */
export interface PlacesRead {
  readonly error: string | undefined;
  readonly shares: boolean;
}

/** This function gives the result of one walk of the expressions. So a program with no shared object needs no second walk. */
export function placesRead(exprs: readonly Expr[]): PlacesRead {
  const size = treeSize(exprs);
  const places = size ?? sharedPlaces(exprs);
  return {
    error: places > MAX_PLACES ? `COMPILE.PLACES: the program has ${String(places)} places, and the limit is ${String(MAX_PLACES)}` : undefined,
    shares: size === undefined,
  };
}

/** This function gives the reason that a compile refuses the expressions, or `undefined` (COMPILE.PLACES). */
export const placesError = (exprs: readonly Expr[]): string | undefined => placesRead(exprs).error;

/** This function gives a copy of a part of an expression, with a new object for each place. A value of a literal and the data of an extension are not nodes, so they stay. */
function copied(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(copied);
  if (typeof x !== "object" || x === null) return x;
  // A copy keeps each own property, also a property with the name `__proto__`.
  const out: Record<string, unknown> = { ...x };
  const tag = out["tag"];
  if (tag === "lit" || tag === "ext") return noted(out, x);
  for (const name of Object.keys(out)) {
    const part = out[name];
    if (typeof part === "object") out[name] = copied(part);
  }
  return typeof tag === "string" ? noted(out, x) : out;
}

/** This function notes the original of a copy of a node, and gives the copy. */
function noted(copy: unknown, original: unknown): unknown {
  ORIGINALS.set(copy as Expr, original as Expr);
  return copy;
}

/**
 * This function gives the expressions with one object at each place. Expressions without a shared object stay the same
 * objects. So does an expression that is nested too deep: the printer and the lowering refuse it. A caller with the
 * result of `placesRead` gives its `shares`, and this function makes no walk.
 */
export function unsharedAll(exprs: readonly Expr[], shares: boolean = treeSize(exprs) === undefined): readonly Expr[] {
  return !shares || exprs.some((e) => nestingOf(e) > MAX_NESTING) ? exprs : (exprs.map(copied) as readonly Expr[]);
}

/** This function gives the expression with one object at each place, as `unsharedAll` does. */
export const unshared = (e: Expr, shares?: boolean): Expr => unsharedAll([e], shares)[0] as Expr;

/** This function gives the original of a copy, and an expression that is not a copy gives itself. */
export const originalOf = (e: Expr): Expr => ORIGINALS.get(e) ?? e;

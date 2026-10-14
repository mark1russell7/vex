/**
 * The work that does not depend on the origin (docs/COMPILER.md §7.2). A node whose value depends only on the space
 * has the same value at each origin. A program keeps that value for each space, so a run at each key of a space
 * computes the node once. A space does not change, so the value stays correct.
 *
 * A node depends only on the space when it reads no focus and no origin, and no name from outside it. It also uses no
 * table and no extension. Only a node with a loop is worth its entry in the memo.
 */
import { isListOp, type Addr, type Axis, type Expr } from "@mark1russell7/vex";

/** This function gives the axis inside the `where` axes of an axis, and the tests of the `where` axes. */
function parts(a: Axis): { readonly base: Exclude<Axis, { readonly t: "where" }>; readonly tests: readonly Expr[] } {
  const tests: Expr[] = [];
  let x: Axis = a;
  while (x.t === "where") {
    tests.push(x.test);
    x = x.axis;
  }
  return { base: x, tests };
}

/**
 * This function tells if a read at an address can depend on the focus or the origin. A key or an index fixes the focus,
 * and a move to the origin after it makes the read depend on the origin. `focus` and `origin` tell if the scope can
 * change them.
 */
function movable(at: Addr | undefined, focus: boolean, origin: boolean): boolean {
  let moves = focus;
  at?.forEach((m) => {
    if (m.t === "key" || m.t === "index") moves = false;
    else if (m.t === "origin") moves = origin;
  });
  return moves;
}

/**
 * This function tells if the value of `e` can depend on more than the space. Such a value can depend on the focus or
 * the origin of the scope, a name from outside `e`, a table or an extension. `bound` has the names that `e` binds
 * itself. Inside an axis, the focus is the target, so the body can read it.
 */
function dependsOn(e: Expr, focus: boolean, origin: boolean, bound: ReadonlySet<string>): boolean {
  switch (e.tag) {
    // Stryker disable next-line StringLiteral: without the case, the switch gives undefined, which is false too
    case "lit":
      return false;
    case "var":
      return !bound.has(e.name);
    case "ext":
      // An extension can read each part of the evaluation.
      return true;
    case "ref":
      return movable(e.at, focus, origin);
    case "app":
      return e.args.some((x) => dependsOn(x, focus, origin, bound));
    case "rec":
      return Object.values(e.fields).some((x) => dependsOn(x, focus, origin, bound));
    case "let": {
      const inner = new Set([...bound, ...Object.keys(e.bind)]);
      return Object.values(e.bind).some((x) => dependsOn(x, focus, origin, bound)) || dependsOn(e.body, focus, origin, inner);
    }
    case "each": {
      const { base, tests } = parts(e.axis);
      // The targets of `all` do not depend on the focus. Each other axis starts at its address.
      const targets = base.t === "table" || (base.t !== "all" && movable(e.at, focus, origin));
      return targets || [e.body, ...tests].some((x) => dependsOn(x, false, origin, bound));
    }
  }
}

/** This function tells if an expression has no loop. */
function loopFree(e: Expr): boolean {
  switch (e.tag) {
    // Stryker disable next-line StringLiteral: without the case, the switch gives undefined, which is false too
    case "each":
      return false;
    case "app":
      return e.args.every(loopFree);
    case "rec":
      return Object.values(e.fields).every(loopFree);
    case "let":
      return [...Object.values(e.bind), e.body].every(loopFree);
    case "lit":
    case "ref":
    // A name and an extension depend on more than the space, so the memo has no such node without the case too.
    // Stryker disable next-line StringLiteral: see the comment above
    case "var":
    // Stryker disable next-line StringLiteral: see the comment above
    case "ext":
      return true;
  }
}

/** This function gives the `let` expressions above an `each`, and the `each`, or `undefined` for another expression. */
function eachUnderLets(e: Expr | undefined): { readonly lets: readonly Extract<Expr, { readonly tag: "let" }>[]; readonly each: Extract<Expr, { readonly tag: "each" }> } | undefined {
  const lets: Extract<Expr, { readonly tag: "let" }>[] = [];
  let x = e;
  while (x?.tag === "let") {
    lets.push(x);
    x = x.body;
  }
  return x?.tag === "each" ? { lets, each: x } : undefined;
}

/**
 * This function gives the nodes of `expr` that a program keeps for each space. Each such node has a loop, and its
 * value depends only on the space. A node inside such a node is in the memo too. Thus the first evaluation of the outer
 * node evaluates the inner node once.
 */
export function memoNodes(expr: Expr): ReadonlySet<Expr> {
  const out = new Set<Expr>();
  const visit = (e: Expr): void => {
    if (!loopFree(e) && !dependsOn(e, true, true, new Set())) out.add(e);
    if (e.tag === "app") {
      // A list op over an `each` under `let` expressions is one loop, so that `each` and those `let` expressions have
      // no value of their own. Their parts can be in the memo.
      const [first, ...rest] = e.args;
      const fused = isListOp(e.op) ? eachUnderLets(first) : undefined;
      if (fused === undefined) {
        if (first !== undefined) visit(first);
      } else {
        for (const l of fused.lets) Object.values(l.bind).forEach(visit);
        [fused.each.body, ...parts(fused.each.axis).tests].forEach(visit);
      }
      rest.forEach(visit);
    } else if (e.tag === "rec") {
      Object.values(e.fields).forEach(visit);
    } else if (e.tag === "let") {
      Object.values(e.bind).forEach(visit);
      visit(e.body);
    } else if (e.tag === "each") {
      [e.body, ...parts(e.axis).tests].forEach(visit);
    }
  };
  visit(expr);
  return out;
}

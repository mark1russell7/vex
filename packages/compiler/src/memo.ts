/**
 * The memo of a program (docs/COMPILER.md §7.2 and §7.3). The value of some nodes depends only on the space and on a
 * few values that the node reads from outside: its keys. A program keeps the value of such a node for each space and
 * each value of its keys. Thus a run at each key of a space evaluates the node once for each value of its keys.
 *
 * - `AVERAGE(all.Score)` has no keys, so it evaluates once for each space.
 * - "The largest width in the column of the origin" has one key, the column of the origin. It evaluates once for each
 *   column, not once for each origin.
 *
 * A key reads the origin or a name from outside the node, and nothing that the node changes. Inside the node, the
 * value of the key replaces the key. Thus the value of the node depends only on the space and the values of the keys.
 */
import { addrExprs, isListOp, listOf, type Addr, type Axis, type Expr } from "@mark1russell7/vex";

/** A read of the focus of the expression, outside its own loops. */
const FOCUS = 1;
/** A move to the origin. */
const ORIGIN = 2;
/** A name that the node does not bind: a variable of the run, or a binding outside the node. */
const FREE = 4;
/** A name that the node binds, outside the expression. */
const INTERNAL = 8;
/** An extension or an axis table. An extension can read each part of the evaluation, and a table is another space. */
const OPAQUE = 16;
/** A move to the origin or a free name inside a loop of the expression. Such a loop is a part of a node, not a key. */
const DEEP = 32;

/** This function gives the axis inside the `where` axes of an axis, and the tests of the `where` axes. */
function parts(a: Axis): { readonly base: Exclude<Axis, { readonly t: "where" }>; readonly tests: readonly Expr[] } {
  // Stryker disable next-line ArrayDeclaration: a test that is not an expression reads nothing, and it has no keys
  const tests: Expr[] = [];
  let x: Axis = a;
  while (x.t === "where") {
    tests.push(x.test);
    x = x.axis;
  }
  return { base: x, tests };
}

/** This function adds `DEEP` to a read of the origin or of a free name inside a loop. */
const inLoop = (r: number, top: boolean): number => (top || (r & (ORIGIN | FREE)) === 0 ? r : r | DEEP);

/**
 * This function gives the reads of an address: the focus at the top of the expression, or the origin, or nothing. A
 * move from the focus or the origin can fail, so the address reads its start also before a fixed key (V-052).
 */
function addressReads(at: Addr | undefined, top: boolean): number {
  let start = top ? FOCUS : 0;
  let found = 0;
  at?.forEach((m) => {
    if (m.t === "key" || m.t === "index") start = 0;
    else if (m.t === "origin") start = ORIGIN;
    else found |= start;
  });
  return inLoop(found | start, top);
}

/**
 * This function gives the reads of `e`. `outer` has the names that the node binds outside `e`, and `inner` has the
 * names that `e` binds above this part. `top` is true outside the loops of `e`.
 */
function reads(e: Expr, outer: ReadonlySet<string>, inner: ReadonlySet<string>, top: boolean): number {
  switch (e.tag) {
    // A missing case gives undefined, and a bitwise operation counts it as 0.
    // Stryker disable next-line StringLiteral: see the comment above
    case "lit":
      return 0;
    case "var":
      return inner.has(e.name) ? 0 : outer.has(e.name) ? INTERNAL : inLoop(FREE, top);
    case "ext":
    // A loop of names is not in the memo yet, so a node with one is not either. A call reads what its body reads, and a
    // function reads nothing where it is bound, but the memo does not follow them yet (FN.CALL).
    case "fold":
    case "iterate":
    case "fn":
    case "call":
      return OPAQUE;
    case "ref":
      // The expressions of computed moves evaluate at the position of the node (NAV.COMPUTED).
      return addrExprs(e.at).reduce((r, x) => r | reads(x, outer, inner, top), addressReads(e.at, top));
    case "app":
      return e.args.reduce((r, x) => r | reads(x, outer, inner, top), 0);
    case "rec":
      return Object.values(e.fields).reduce((r, x) => r | reads(x, outer, inner, top), 0);
    case "let": {
      const binds = Object.values(e.bind).reduce((r, x) => r | reads(x, outer, inner, top), 0);
      return binds | reads(e.body, outer, new Set([...inner, ...Object.keys(e.bind)]), top);
    }
    case "each": {
      const { base, tests } = parts(e.axis);
      // The targets of `all` do not depend on the focus, but its address can fail (V-051). Each other axis starts at its
      // address. The targets of the axis list are the items of a value, and the memo does not follow them yet (AXIS.LIST).
      const targets = base.t === "table" || listOf(e.axis) !== undefined ? OPAQUE : base.t === "all" && (e.at ?? []).length === 0 ? 0 : addressReads(e.at, top);
      const at = addrExprs(e.at).reduce((r, x) => r | reads(x, outer, inner, top), targets);
      return [e.body, ...tests].reduce((r, x) => r | reads(x, outer, inner, false), at);
    }
  }
}

/** This function joins the keys of the parts of an expression. A part that cannot be in the memo makes the expression the same. */
function all(xs: readonly (readonly Expr[] | undefined)[]): readonly Expr[] | undefined {
  // Stryker disable next-line ArrayDeclaration: after the check, each part has its keys, so no one reads the default list
  return xs.every((x) => x !== undefined) ? xs.flatMap((x) => x ?? []) : undefined;
}

/**
 * This function gives the keys of the part `e` of a node, or `undefined` if the part cannot be in the memo. `top` is
 * true outside the loops of the node, and `outer` has the names that the node binds above `e`. The node itself (`root`)
 * is not a key of itself.
 */
function keysOf(e: Expr, top: boolean, outer: ReadonlySet<string>, pure: Set<Expr>, root = false): readonly Expr[] | undefined {
  const r = reads(e, outer, new Set(), true);
  // In a loop of the node, the focus is a target of the node, and the node can read it. A part that depends only on
  // the space has a memo of its own, if it has a loop.
  if ((r & (ORIGIN | FREE | OPAQUE | (top ? FOCUS : 0))) === 0) {
    if (!root) pure.add(e);
    return [];
  }
  // A key evaluates once, outside the loops of the node. A loop that reads the origin is a part of the node, not a key.
  if (!root && (r & (FOCUS | INTERNAL | OPAQUE | DEEP)) === 0) return [e];
  switch (e.tag) {
    case "app":
      return all(e.args.map((x) => keysOf(x, top, outer, pure)));
    case "rec":
      return all(Object.values(e.fields).map((x) => keysOf(x, top, outer, pure)));
    case "let": {
      const inner = new Set([...outer, ...Object.keys(e.bind)]);
      return all([...Object.values(e.bind).map((x) => keysOf(x, top, outer, pure)), keysOf(e.body, top, inner, pure)]);
    }
    case "each": {
      const { base, tests } = parts(e.axis);
      // The targets of a loop must not depend on the origin: a set of targets is not a value of a key. The address of
      // `all` can fail, so it must not depend on the origin either.
      if (base.t === "table" || ((base.t !== "all" || (e.at ?? []).length > 0) && addressReads(e.at, top) !== 0)) return undefined;
      // The expressions of computed moves give the targets too, so they must read nothing.
      if (addrExprs(e.at).some((x) => reads(x, outer, new Set(), top) !== 0)) return undefined;
      return all([e.body, ...tests].map((x) => keysOf(x, false, outer, pure)));
    }
    // A leaf here reads the focus or a name of the node, so it is not a key, and the part cannot be in the memo. A
    // missing case gives undefined too.
    // Stryker disable StringLiteral,ConditionalExpression: see the comment above
    case "lit":
    case "ref":
    case "var":
    case "ext":
    case "fold":
    case "iterate":
    case "fn":
    case "call":
      return undefined;
    // Stryker restore StringLiteral,ConditionalExpression
  }
}

/** This function tells if an expression has a loop outside its keys and outside the parts that have a memo of their own. */
function loopOutside(e: Expr, keys: ReadonlySet<Expr>): boolean {
  if (keys.has(e)) return false;
  switch (e.tag) {
    case "each":
    case "fold":
    case "iterate":
      return true;
    case "app":
      return e.args.some((x) => loopOutside(x, keys));
    case "rec":
      return Object.values(e.fields).some((x) => loopOutside(x, keys));
    case "let":
      return [...Object.values(e.bind), e.body].some((x) => loopOutside(x, keys));
    case "ref":
      return addrExprs(e.at).some((x) => loopOutside(x, keys));
    // A missing case gives undefined, which is false too.
    // Stryker disable StringLiteral,ConditionalExpression: see the comment above
    case "lit":
    case "var":
    case "ext":
    // A node with a function or a call is opaque (reads), so it is not a node of the memo.
    case "fn":
    case "call":
      return false;
    // Stryker restore StringLiteral,ConditionalExpression
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
 * This function gives the nodes of `expr` that a program keeps in its memo, each with its keys. Each such node has a
 * loop outside its keys. A node inside such a node can be in the memo too. Thus the first evaluation of the outer
 * node evaluates the inner node once.
 */
export function memoNodes(expr: Expr): ReadonlyMap<Expr, readonly Expr[]> {
  const out = new Map<Expr, readonly Expr[]>();
  const visit = (e: Expr): void => {
    const pure = new Set<Expr>();
    const keys = keysOf(e, true, new Set(), pure, true);
    if (keys !== undefined && loopOutside(e, new Set([...keys, ...pure]))) out.set(e, keys);
    if (e.tag === "app") {
      // A list op over an `each` under `let` expressions is one loop, so that `each` and those `let` expressions have
      // no value of their own. Their parts can be in the memo.
      const [first, ...rest] = e.args;
      const fused = isListOp(e.op) ? eachUnderLets(first) : undefined;
      if (fused === undefined) {
        if (first !== undefined) visit(first);
      } else {
        for (const l of fused.lets) Object.values(l.bind).forEach(visit);
        [fused.each.body, ...parts(fused.each.axis).tests, ...addrExprs(fused.each.at)].forEach(visit);
      }
      rest.forEach(visit);
    } else if (e.tag === "rec") {
      Object.values(e.fields).forEach(visit);
    } else if (e.tag === "let") {
      Object.values(e.bind).forEach(visit);
      visit(e.body);
    } else if (e.tag === "each") {
      [e.body, ...parts(e.axis).tests, ...addrExprs(e.at)].forEach(visit);
    } else if (e.tag === "ref") {
      addrExprs(e.at).forEach(visit);
    }
  };
  visit(expr);
  return out;
}

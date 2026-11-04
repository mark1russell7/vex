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
import { addrExprs, children, isListOp, listOf, type Addr, type Axis, type Expr } from "@mark1russell7/vex";
import { originalOf } from "./unshared.ts";

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

/** The facts of an expression with no names around it. A set of names has one bit for each name. */
interface Facts {
  /** The reads of the expression outside each loop around it, with no read of a name. */
  readonly top: number;
  /** The reads of the expression in a loop around it, with no read of a name. */
  readonly inner: number;
  /** The names that the expression reads and does not bind, outside its own loops. */
  readonly near: bigint;
  /** The names that the expression reads and does not bind, in its own loops. */
  readonly far: bigint;
  /** This value is true if the expression has a loop. A node with no loop is not a node of the memo. */
  readonly loop: boolean;
}

/** The facts of an expression that reads nothing. */
const NOTHING: Facts = { top: 0, inner: 0, near: 0n, far: 0n, loop: false };

/** The facts of an expression that the analysis does not follow. */
const OPAQUE_FACTS: Facts = { ...NOTHING, top: OPAQUE, inner: OPAQUE };

/** The keys of a part, in the order of the parts. A list of keys holds the lists of its parts, so a join does not copy them. */
type Keys = readonly (Expr | Keys)[];

/** This function joins the keys of the parts of an expression. A part that cannot be in the memo makes the expression the same. */
function all(xs: readonly (Keys | undefined)[]): Keys | undefined {
  const known = xs.filter((x) => x !== undefined);
  if (known.length < xs.length) return undefined;
  const some = known.filter((x) => x.length > 0);
  return some.length === 1 ? (some[0] as Keys) : some;
}

/** This function adds each key of a list to `out`, in the order of the parts. */
function flatten(keys: Keys, out: Expr[]): readonly Expr[] {
  for (const x of keys) {
    if (Array.isArray(x)) flatten(x as Keys, out);
    else out.push(x as Expr);
  }
  return out;
}

/**
 * The analysis of one program. Each node has one record of facts, so a read of a part does not walk that part again. A
 * part that cannot be in the memo stays known, so the next node above it does not walk it again. The walk of the keys
 * starts at each node of the memo. Thus the work on the key lists grows with the nodes of the memo times the levels of
 * `origin` around them. The gate COMPILE.GROWTH holds this growth at the largest legal sizes.
 */
class Analysis {
  readonly #bits = new Map<string, bigint>();
  readonly #facts = new Map<Expr, Facts>();
  readonly #dead = new Map<Expr, Set<bigint>>();

  /** This method gives the set of some names. */
  namesOf(names: readonly string[]): bigint {
    return names.reduce((set, name) => {
      const bit = this.#bits.get(name) ?? 1n << BigInt(this.#bits.size);
      this.#bits.set(name, bit);
      return set | bit;
    }, 0n);
  }

  /** This method gives the facts of an expression. */
  factsOf(e: Expr): Facts {
    const known = this.#facts.get(e);
    if (known !== undefined) return known;
    const facts = this.#read(e);
    this.#facts.set(e, facts);
    return facts;
  }

  /** This method joins the facts of some expressions. */
  #joined(xs: readonly Expr[]): Facts {
    return xs.reduce((a, x) => {
      const b = this.factsOf(x);
      return { top: a.top | b.top, inner: a.inner | b.inner, near: a.near | b.near, far: a.far | b.far, loop: a.loop || b.loop };
    }, NOTHING);
  }

  /** This method gives the facts of an expression from the facts of its parts. */
  #read(e: Expr): Facts {
    switch (e.tag) {
      case "lit":
        return NOTHING;
      case "var":
        return { ...NOTHING, near: this.namesOf([e.name]) };
      case "fold":
      case "iterate":
      case "fix":
        return { ...OPAQUE_FACTS, loop: true };
      case "ext":
      // A loop of names is not in the memo yet, so a node with one is not either. A call reads what its body reads, and a
      // function reads nothing where it is bound, but the memo does not follow them yet (FN.CALL).
      case "last":
      // A let with a function and no call has the value of its body, and a call is opaque, so this case only keeps the
      // memo simple.
      case "fn":
      case "call":
        return OPAQUE_FACTS;
      case "ref": {
        // The expressions of computed moves evaluate at the position of the node (NAV.COMPUTED).
        const at = this.#joined(addrExprs(e.at));
        return { ...at, top: at.top | addressReads(e.at, true), inner: at.inner | addressReads(e.at, false) };
      }
      case "app":
        return this.#joined(e.args);
      case "rec":
        return this.#joined(Object.values(e.fields));
      case "let": {
        const binds = this.#joined(Object.values(e.bind));
        const body = this.factsOf(e.body);
        const free = ~this.namesOf(Object.keys(e.bind));
        return { top: binds.top | body.top, inner: binds.inner | body.inner, near: binds.near | (body.near & free), far: binds.far | (body.far & free), loop: binds.loop || body.loop };
      }
      case "each": {
        const { base, tests } = parts(e.axis);
        // The targets of `all` do not depend on the focus, but its address can fail (V-051). Each other axis starts at its
        // address. The targets of the axis list are the items of a value, and the memo does not follow them yet (AXIS.LIST).
        const targets = (top: boolean): number => (base.t === "table" || listOf(e.axis) !== undefined ? OPAQUE : base.t === "all" && (e.at ?? []).length === 0 ? 0 : addressReads(e.at, top));
        const at = this.#joined(addrExprs(e.at));
        const body = this.#joined([e.body, ...tests]);
        return { top: targets(true) | at.top | body.inner, inner: targets(false) | at.inner | body.inner, near: at.near, far: at.far | body.near | body.far, loop: true };
      }
    }
  }

  /**
   * This method gives the reads of `e`. `outer` has the names that the node binds outside `e`. `top` is true outside the
   * loops of the node.
   */
  #reads(e: Expr, outer: bigint, top: boolean): number {
    const { near, far, top: atTop, inner } = this.factsOf(e);
    const internal = ((near | far) & outer) === 0n ? 0 : INTERNAL;
    const free = (near & ~outer) === 0n ? 0 : inLoop(FREE, top);
    const deep = (far & ~outer) === 0n ? 0 : inLoop(FREE, false);
    return (top ? atTop : inner) | internal | free | deep;
  }

  /**
   * This method gives the keys of the part `e` of a node, or `undefined` if the part cannot be in the memo. `top` is
   * true outside the loops of the node, and `outer` has the names that the node binds above `e`.
   */
  keysOf(e: Expr, top: boolean, outer: bigint, pure: Set<Expr>): Keys | undefined {
    const mark = (outer << 1n) | (top ? 1n : 0n);
    const dead = this.#dead.get(e);
    if (dead?.has(mark) === true) return undefined;
    const keys = this.#partsOf(e, top, outer, pure, false);
    if (keys === undefined) this.#dead.set(e, (dead ?? new Set()).add(mark));
    return keys;
  }

  /** This method gives the keys of a node of the program. The node itself is not a key of itself. */
  keysOfNode(e: Expr, pure: Set<Expr>): readonly Expr[] | undefined {
    const keys = this.#partsOf(e, true, 0n, pure, true);
    return keys === undefined ? undefined : flatten(keys, []);
  }

  /** This method gives the keys of an expression from the keys of its parts. An undefined value means no memo. */
  #partsOf(e: Expr, top: boolean, outer: bigint, pure: Set<Expr>, root: boolean): Keys | undefined {
    const r = this.#reads(e, outer, true);
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
        return all(e.args.map((x) => this.keysOf(x, top, outer, pure)));
      case "rec":
        return all(Object.values(e.fields).map((x) => this.keysOf(x, top, outer, pure)));
      case "let": {
        const inner = outer | this.namesOf(Object.keys(e.bind));
        return all([...Object.values(e.bind).map((x) => this.keysOf(x, top, outer, pure)), this.keysOf(e.body, top, inner, pure)]);
      }
      case "each": {
        const { base, tests } = parts(e.axis);
        // The targets of a loop must not depend on the origin: a set of targets is not a value of a key. The address of
        // `all` can fail, so it must not depend on the origin either. The targets of the axis list are the items of a
        // value, and the memo does not follow them yet (AXIS.LIST).
        if (base.t === "table" || listOf(e.axis) !== undefined || ((base.t !== "all" || (e.at ?? []).length > 0) && addressReads(e.at, top) !== 0)) return undefined;
        // The expressions of computed moves give the targets too, so they must read nothing.
        if (addrExprs(e.at).some((x) => this.#reads(x, outer, top) !== 0)) return undefined;
        return all([e.body, ...tests].map((x) => this.keysOf(x, false, outer, pure)));
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
      case "fix":
      case "last":
      case "fn":
      case "call":
        return undefined;
      // Stryker restore StringLiteral,ConditionalExpression
    }
  }
}

/** This function tells if an expression has a loop outside its keys and outside the parts that have a memo of their own. */
function loopOutside(e: Expr, keys: ReadonlySet<Expr>): boolean {
  if (keys.has(e)) return false;
  switch (e.tag) {
    case "each":
    case "fold":
    case "iterate":
    case "fix":
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
    case "last":
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
 * node evaluates the inner node once. The function `loops` tells if a list op is one loop with an `each`. In a module,
 * each list op is one. In tier 2, the ops of `isFusedOp` are.
 *
 * A node at two places of the program has one object in the source, and the compile gives each place a copy. A node of
 * the memo at one place is a node of the memo at each place, so the second pass finds the other copies.
 */
export function memoNodes(expr: Expr, loops: (op: string) => boolean = isListOp): ReadonlyMap<Expr, readonly Expr[]> {
  const out = new Map<Expr, readonly Expr[]>();
  const analysis = new Analysis();
  const note = (e: Expr): void => {
    if (!analysis.factsOf(e).loop) return;
    const pure = new Set<Expr>();
    const keys = analysis.keysOfNode(e, pure);
    if (keys !== undefined && loopOutside(e, new Set([...keys, ...pure]))) out.set(e, keys);
  };
  const visit = (e: Expr): void => {
    note(e);
    if (e.tag === "app") {
      // A list op over an `each` under `let` expressions is one loop, so that `each` and those `let` expressions have
      // no value of their own. Their parts can be in the memo.
      const [first, ...rest] = e.args;
      const fused = loops(e.op) ? eachUnderLets(first) : undefined;
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
  const found = new Set([...out.keys()].map(originalOf));
  const copies = (e: Expr): void => {
    if (!out.has(e) && found.has(originalOf(e))) note(e);
    children(e).forEach(copies);
  };
  copies(expr);
  return out;
}

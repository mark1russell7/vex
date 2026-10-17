import { vexError } from "./errors.ts";
import { moveExpr, type Addr, type Axis, type FixedMove } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

/** The kind of a space. The kind sets which moves and axes are valid. */
export type SpaceKind = "record" | "array" | "grid" | "tree" | "graph";

/**
 * A space: an immutable collection of records with keys. A Vex program evaluates at one key of a space.
 * Nothing changes a space after it is made.
 */
export interface Space<K extends string = string, O = unknown> {
  readonly kind: SpaceKind;
  /** The keys, in their order. */
  readonly keys: readonly K[];
  /**
   * The record of each key, in the order of `keys` (SPACE.RECORDS). A compiler reads a record by its index with it.
   * A space without it gives each record with `get` only.
   */
  readonly records?: readonly (O | undefined)[];
  /** This function tells if the space has the key `k`. */
  has(k: string): k is K;
  /** This function gives the record at the key `k`, or `undefined`. */
  get(k: string): O | undefined;
  /** The position of each key, for array and grid spaces. An array key has one number, a grid key has two. */
  coords(k: string): readonly number[] | undefined;
  /** The key at a position, or `undefined`. */
  keyAt(coords: readonly number[]): K | undefined;
  /** The parent of the key `k` in a tree space, or `undefined` for a root. Other spaces do not have it. */
  parentOf?(k: string): K | undefined;
  /** The children of the key `k` in a tree space, in key order. Other spaces do not have it. */
  childrenOf?(k: string): readonly K[];
  /** The keys at the ends of the edges from `k`, in a graph space or a tree space. Other spaces do not have it. */
  successorsOf?(k: string): readonly K[];
  /** The keys with an edge to `k`, in key order, in a graph space or a tree space. Other spaces do not have it. */
  predecessorsOf?(k: string): readonly K[];
}

/** The key type of a grid space. */
export type GridKey = `${number},${number}`;

/** The key type of an array space. */
export type ArrayKey = `${number}`;

class RecordSpace<K extends string, O> implements Space<K, O> {
  readonly kind: SpaceKind = "record";
  readonly keys: readonly K[];
  readonly records: readonly O[];
  readonly #records: ReadonlyMap<string, O>;

  constructor(records: Readonly<Record<K, O>>) {
    const entries = Object.entries(records) as [K, O][];
    this.keys = Object.freeze(entries.map(([k]) => k));
    this.records = Object.freeze(entries.map(([, o]) => o));
    this.#records = new Map(entries);
  }

  has(k: string): k is K {
    return this.#records.has(k);
  }
  get(k: string): O | undefined {
    return this.#records.get(k);
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  coords(): readonly number[] | undefined {
    return undefined;
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  keyAt(): K | undefined {
    return undefined;
  }
}

class ArraySpace<O> implements Space<ArrayKey, O> {
  readonly kind: SpaceKind = "array";
  readonly keys: readonly ArrayKey[];
  readonly records: readonly O[];

  constructor(items: readonly O[]) {
    this.keys = Object.freeze(Array.from(items, (_item, i): ArrayKey => `${i}`));
    this.records = Object.freeze(Array.from(items));
  }

  // The key at the position i is the text of i, so the position of a key finds it. A text that is not a key of the
  // space, for example "01" or "1.0", has no key at its position.
  has(k: string): k is ArrayKey {
    return this.keys[Number(k)] === k;
  }
  get(k: string): O | undefined {
    return this.has(k) ? this.records[Number(k)] : undefined;
  }
  coords(k: string): readonly number[] | undefined {
    return this.has(k) ? [Number(k)] : undefined;
  }
  keyAt(coords: readonly number[]): ArrayKey | undefined {
    return coords.length === 1 ? this.keys[Number(coords[0])] : undefined;
  }
}

class GridSpace<O> implements Space<GridKey, O> {
  readonly kind: SpaceKind = "grid";
  readonly keys: readonly GridKey[];
  readonly records: readonly O[];
  readonly #cells: ReadonlyMap<string, O>;
  readonly #coords: ReadonlyMap<string, readonly number[]>;

  constructor(rows: readonly (readonly O[])[]) {
    const entries = rows.flatMap((row, i) => row.map((cell, j): [GridKey, O, readonly number[]] => [`${i},${j}`, cell, Object.freeze([i, j])]));
    this.keys = Object.freeze(entries.map(([k]) => k));
    this.records = Object.freeze(entries.map(([, o]) => o));
    this.#cells = new Map(entries.map(([k, cell]) => [k, cell]));
    this.#coords = new Map(entries.map(([k, , c]) => [k, c]));
  }

  has(k: string): k is GridKey {
    return this.#cells.has(k);
  }
  get(k: string): O | undefined {
    return this.#cells.get(k);
  }
  coords(k: string): readonly number[] | undefined {
    return this.#coords.get(k);
  }
  keyAt(coords: readonly number[]): GridKey | undefined {
    // Each key has two coordinates, so a list with more or fewer coordinates gives no key.
    const k = coords.join(",");
    return this.has(k) ? k : undefined;
  }
}

class TreeSpace<K extends string, O> implements Space<K, O> {
  readonly kind: SpaceKind = "tree";
  readonly keys: readonly K[];
  readonly records: readonly O[];
  readonly #records: ReadonlyMap<string, O>;
  readonly #parents: ReadonlyMap<string, K>;
  readonly #children: ReadonlyMap<string, readonly K[]>;

  constructor(records: Readonly<Record<K, O>>, parents: Readonly<Partial<Record<K, K | null>>>) {
    const entries = Object.entries(records) as [K, O][];
    this.keys = Object.freeze(entries.map(([k]) => k));
    this.records = Object.freeze(entries.map(([, o]) => o));
    this.#records = new Map(entries);
    const parentOf = new Map<string, K>();
    for (const [k, p] of Object.entries(parents) as [K, K | null | undefined][]) {
      if (!this.#records.has(k)) throw new TypeError(`the tree has no key "${k}", but the parents name it`);
      if (p === null || p === undefined) continue;
      if (!this.#records.has(p)) throw new TypeError(`the parent "${p}" of "${k}" is not a key of the tree`);
      parentOf.set(k, p);
    }
    // A parent chain that comes back to a key of the same walk is a cycle, not a tree. Each key is in one walk
    // only: a walk stops at a key that an earlier walk proved to reach a root. Thus the check is linear.
    const reachesRoot = new Set<string>();
    for (const k of this.keys) {
      const walk = new Set<string>();
      for (let p: string | undefined = k; p !== undefined && !reachesRoot.has(p); p = parentOf.get(p)) {
        if (walk.has(p)) throw new TypeError(`the parents of "${k}" make a cycle, so the space is not a tree`);
        walk.add(p);
      }
      for (const w of walk) reachesRoot.add(w);
    }
    this.#parents = parentOf;
    const children = new Map<string, K[]>(this.keys.map((k) => [k, []]));
    for (const k of this.keys) {
      const p = parentOf.get(k);
      // Each parent is a key, so its list exists, and the test of p only skips the roots.
      // Stryker disable next-line ConditionalExpression,OptionalChaining: a root has no list to push to
      if (p !== undefined) children.get(p)?.push(k);
    }
    this.#children = new Map([...children].map(([k, c]) => [k, Object.freeze(c)]));
  }

  has(k: string): k is K {
    return this.#records.has(k);
  }
  get(k: string): O | undefined {
    return this.#records.get(k);
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  coords(): readonly number[] | undefined {
    return undefined;
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  keyAt(): K | undefined {
    return undefined;
  }
  // In a tree, the edges go from a parent to its children.
  successorsOf(k: string): readonly K[] {
    return this.childrenOf(k);
  }
  predecessorsOf(k: string): readonly K[] {
    const p = this.#parents.get(k);
    return p === undefined ? [] : [p];
  }
  parentOf(k: string): K | undefined {
    return this.#parents.get(k);
  }
  childrenOf(k: string): readonly K[] {
    return this.#children.get(k) ?? [];
  }
}

/** The constructors of spaces. */
/** The empty list of keys. */
const NO_KEYS: readonly never[] = Object.freeze([]);

class GraphSpace<K extends string, O> implements Space<K, O> {
  readonly kind: SpaceKind = "graph";
  readonly keys: readonly K[];
  readonly records: readonly O[];
  readonly #records: ReadonlyMap<string, O>;
  readonly #out: ReadonlyMap<string, readonly K[]>;
  readonly #in: ReadonlyMap<string, readonly K[]>;

  constructor(records: Readonly<Record<K, O>>, edges: Readonly<Partial<Record<K, readonly K[]>>>) {
    const entries = Object.entries(records) as [K, O][];
    this.keys = Object.freeze(entries.map(([k]) => k));
    this.records = Object.freeze(entries.map(([, o]) => o));
    this.#records = new Map(entries);
    const out = new Map<string, readonly K[]>();
    for (const [k, to] of Object.entries(edges) as [K, readonly K[] | undefined][]) {
      if (!this.#records.has(k)) throw new TypeError(`the graph has no key "${k}", but the edges name it`);
      // A second edge to the same key is the same edge.
      const ends = [...new Set(to ?? NO_KEYS)];
      for (const t of ends) if (!this.#records.has(t)) throw new TypeError(`the edge from "${k}" goes to "${t}", which is not a key of the graph`);
      out.set(k, Object.freeze(ends));
    }
    this.#out = out;
    // The predecessors in key order: the keys in key order, and the ends of the edges of each key.
    const into = new Map<string, K[]>();
    for (const k of this.keys) {
      for (const t of out.get(k) ?? NO_KEYS) {
        const from = into.get(t);
        if (from === undefined) into.set(t, [k]);
        else from.push(k);
      }
    }
    this.#in = new Map([...into].map(([k, from]) => [k, Object.freeze(from)]));
  }

  has(k: string): k is K {
    return this.#records.has(k);
  }
  get(k: string): O | undefined {
    return this.#records.get(k);
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  coords(): readonly number[] | undefined {
    return undefined;
  }
  // Stryker disable next-line BlockStatement: the body gives undefined, and an empty body gives undefined too
  keyAt(): K | undefined {
    return undefined;
  }
  successorsOf(k: string): readonly K[] {
    return this.#out.get(k) ?? NO_KEYS;
  }
  predecessorsOf(k: string): readonly K[] {
    return this.#in.get(k) ?? NO_KEYS;
  }
}

export const space = {
  /** This function makes a space from the entries of an object. The keys are the property names. */
  record<const R extends Readonly<Record<string, unknown>>>(records: R): Space<keyof R & string, R[keyof R]> {
    return new RecordSpace<keyof R & string, R[keyof R]>(records);
  },
  /** This function makes a space from an array. The keys are `"0"`, `"1"` and so on. */
  array<O>(items: readonly O[]): Space<ArrayKey, O> {
    return new ArraySpace(items);
  },
  /** This function makes a space from rows of cells. The key of a cell is `"row,column"`. */
  grid<O>(rows: readonly (readonly O[])[]): Space<GridKey, O> {
    return new GridSpace(rows);
  },
  /**
   * This function makes a tree space: the records by key, and the parent of each key. A key without a parent, or
   * with the parent `null`, is a root. A parent that is not a key, or a cycle of parents, throws a `TypeError`.
   */
  tree<const R extends Readonly<Record<string, unknown>>>(records: R, parents: Readonly<Partial<Record<keyof R & string, (keyof R & string) | null>>>): Space<keyof R & string, R[keyof R]> {
    return new TreeSpace<keyof R & string, R[keyof R]>(records, parents);
  },
  /**
   * This function makes a graph space: the records by key, and the edges from each key, in order. An edge to a key
   * that is not in the graph throws a `TypeError`. A graph can have cycles, and an edge can go from a key to itself.
   */
  graph<const R extends Readonly<Record<string, unknown>>>(records: R, edges: Readonly<Partial<Record<keyof R & string, readonly (keyof R & string)[]>>>): Space<keyof R & string, R[keyof R]> {
    return new GraphSpace<keyof R & string, R[keyof R]>(records, edges);
  },
} as const;

/** The position of an evaluation: the key where it started, and the key where relative references read. */
export interface Position {
  readonly origin: string;
  readonly focus: string;
}

/** This function applies one move to the focus. It gives the new focus, or a `#REF!` error. */
export function applyMove(s: Space, at: Position, m: FixedMove): Result<string> {
  const refError = (kind: "unknown-key" | "not-a-pair" | "out-of-bounds" | "no-offset" | "no-tree", message: string): Result<string> =>
    fail(vexError(kind, message, { origin: at.origin, focus: at.focus }));
  switch (m.t) {
    case "key":
      return s.has(m.key) ? ok(m.key) : refError("unknown-key", `the space has no key "${m.key}"`);
    case "index": {
      const k = s.keys[m.i];
      return k !== undefined ? ok(k) : refError("out-of-bounds", `the space has no key at index ${m.i}`);
    }
    case "other": {
      if (s.keys.length !== 2) return refError("not-a-pair", `"other" needs a space with 2 keys, but this space has ${s.keys.length}`);
      const [a, b] = s.keys;
      // A pair has two keys, so `a` and `b` are defined.
      /* v8 ignore next -- @preserve */
      return ok(at.focus === a ? (b ?? at.focus) : (a ?? at.focus));
    }
    case "offset": {
      // In a tree space, an offset with one number moves among the siblings in key order. The roots are siblings.
      const parentOf = s.parentOf?.bind(s);
      const childrenOf = s.childrenOf?.bind(s);
      if (parentOf !== undefined && childrenOf !== undefined && m.d.length === 1) {
        const p = parentOf(at.focus);
        const group = p === undefined ? s.keys.filter((k) => parentOf(k) === undefined) : childrenOf(p);
        const i = group.indexOf(at.focus);
        const k = i < 0 ? undefined : group[i + (m.d[0] ?? 0)];
        return k === undefined ? refError("out-of-bounds", `the offset [${m.d.join(",")}] from "${at.focus}" is outside its siblings`) : ok(k);
      }
      const c = s.coords(at.focus);
      if (c === undefined || c.length !== m.d.length) {
        return refError("no-offset", `an offset of length ${m.d.length} is not valid in a ${s.kind} space`);
      }
      // The lengths are equal, so each index of `c` is also an index of `m.d`.
      /* v8 ignore next -- @preserve */
      const target = c.map((x, i) => x + (m.d[i] ?? 0));
      const k = s.keyAt(target);
      return k === undefined ? refError("out-of-bounds", `the offset [${m.d.join(",")}] from "${at.focus}" is outside the space`) : ok(k);
    }
    case "origin":
      return ok(at.origin);
    case "parent": {
      if (s.parentOf === undefined) return refError("no-tree", `"parent" needs a tree space, but this space is a ${s.kind}`);
      const p = s.parentOf(at.focus);
      return p === undefined ? refError("out-of-bounds", `the key "${at.focus}" is a root, so it has no parent`) : ok(p);
    }
  }
}

/**
 * This function gives the fixed moves of an address. `values` has the value of the expression of each computed move,
 * in order (NAV.COMPUTED). A key that is not a text, or a position that is not a number, gives `#VALUE!`.
 */
export function fixAddr(addr: Addr, values: readonly unknown[], at: Position): Result<readonly FixedMove[]> {
  const out: FixedMove[] = [];
  let next = 0;
  for (const m of addr) {
    if (moveExpr(m) === undefined) {
      out.push(m as FixedMove);
      continue;
    }
    const u = values[next++];
    if (m.t === "key" && typeof u === "string") out.push({ t: "key", key: u });
    else if (m.t === "index" && typeof u === "number") out.push({ t: "index", i: u });
    else return fail(vexError("kind-mismatch", m.t === "key" ? `the key of a move is a ${typeof u}, not a text` : `the position of a move is a ${typeof u}, not a number`, at));
  }
  return ok(out);
}

/** This function applies the moves of an address in order. It gives the key where the address points. */
export function resolveAddr(s: Space, at: Position, addr: readonly FixedMove[] | undefined): Result<string> {
  let focus = at.focus;
  for (const m of addr ?? []) {
    const r = applyMove(s, { origin: at.origin, focus }, m);
    if (!r.ok) return r;
    focus = r.value;
  }
  return ok(focus);
}

const NEIGHBORS_4: readonly (readonly [number, number])[] = [[-1, 0], [0, -1], [0, 1], [1, 0]];
const NEIGHBORS_8: readonly (readonly [number, number])[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

/** The axes of a tree space. */
type TreeAxis = "children" | "ancestors" | "descendants" | "siblings";

function treeTargets(s: Space, at: Position, t: TreeAxis): Result<readonly string[]> {
  const parentOf = s.parentOf?.bind(s);
  const childrenOf = s.childrenOf?.bind(s);
  if (parentOf === undefined || childrenOf === undefined) {
    return fail(vexError("no-tree", `"${t}" needs a tree space, but this space is a ${s.kind}`, at));
  }
  switch (t) {
    case "children":
      return ok(childrenOf(at.focus));
    case "ancestors": {
      const out: string[] = [];
      for (let p = parentOf(at.focus); p !== undefined; p = parentOf(p)) out.push(p);
      return ok(out);
    }
    case "descendants": {
      // A depth-first walk with a stack, so a deep tree does not need a deep call stack.
      const out: string[] = [];
      const stack = childrenOf(at.focus).toReversed();
      for (let k = stack.pop(); k !== undefined; k = stack.pop()) {
        out.push(k);
        stack.push(...childrenOf(k).toReversed());
      }
      return ok(out);
    }
    case "siblings": {
      const p = parentOf(at.focus);
      const group = p === undefined ? s.keys.filter((k) => parentOf(k) === undefined) : childrenOf(p);
      return ok(group.filter((k) => k !== at.focus));
    }
  }
}

/**
 * This function gives the targets of a base axis at a focus. It does not handle `where`, because the
 * interpreter must evaluate the test.
 */
export function axisTargets(s: Space, at: Position, a: Exclude<Axis, { readonly t: "where" }>): Result<readonly string[]> {
  switch (a.t) {
    case "all":
      return ok(s.keys);
    case "others":
      return ok(s.keys.filter((k) => k !== at.focus));
    case "other": {
      const r = applyMove(s, at, { t: "other" });
      return r.ok ? ok([r.value]) : r;
    }
    case "neighbors": {
      if (s.kind !== "grid") return fail(vexError("no-grid", `"neighbors" needs a grid space, but this space is a ${s.kind}`, at));
      const deltas = a.n === 4 ? NEIGHBORS_4 : NEIGHBORS_8;
      return ok(
        deltas.flatMap((d) => {
          const r = applyMove(s, at, { t: "offset", d });
          return r.ok ? [r.value] : [];
        }),
      );
    }
    case "children":
    case "ancestors":
    case "descendants":
    case "siblings":
      return treeTargets(s, at, a.t);
    case "window":
      return windowTargets(s, at, a.from, a.to);
    case "successors":
    case "predecessors":
    case "reachable":
      return graphTargets(s, at, a.t);
    case "reverse": {
      // The validation of the IR keeps a base axis inside reverse: not where, reverse or table.
      const r = axisTargets(s, at, a.axis as Exclude<Axis, { readonly t: "where" }>);
      return r.ok ? ok(r.value.toReversed()) : r;
    }
    case "table":
      // The evaluator gives the axis table the space of its table. Here, without the tables, it has no targets.
      return fail(vexError("no-table", `the axis "table" needs the tables of the evaluation, and "${a.name}" is not one of them`, at));
    case "list":
      // The evaluator gives the targets of the axis list from the value of its expression. A space alone has no list.
      return fail(vexError("bad-expression", 'the axis "list" needs the evaluator, which gives the value of its list', at));
  }
}

/**
 * This function gives the targets of an axis of a graph. `reachable` has each key that a path of one or more edges
 * reaches from the focus, once, in the order of a breadth-first search. The focus is not a target of `reachable`.
 */
function graphTargets(s: Space, at: Position, t: "successors" | "predecessors" | "reachable"): Result<readonly string[]> {
  const successorsOf = s.successorsOf?.bind(s);
  const predecessorsOf = s.predecessorsOf?.bind(s);
  if (successorsOf === undefined || predecessorsOf === undefined) {
    return fail(vexError("no-graph", `"${t}" needs a graph space or a tree space, but this space is a ${s.kind}`, at));
  }
  if (t === "successors") return ok(successorsOf(at.focus));
  if (t === "predecessors") return ok(predecessorsOf(at.focus));
  // A queue, not recursion, so a long path does not need a deep call stack. A loop over an array also reads the
  // keys that the loop adds to it.
  const seen = new Set<string>([at.focus]);
  const queue: string[] = [at.focus];
  for (const k of queue) {
    for (const next of successorsOf(k)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return ok(queue.slice(1));
}

/**
 * This function gives the targets of the axis `window(from, to)`: the keys of the moves `offset(d)` for each `d`
 * from `from` to `to`, in order. An offset outside the space has no target. The axis needs an array space or a tree
 * space, where an offset has one number.
 */
function windowTargets(s: Space, at: Position, from: number, to: number): Result<readonly string[]> {
  const tree = s.parentOf !== undefined && s.childrenOf !== undefined;
  if (!tree && s.coords(at.focus)?.length !== 1) {
    return fail(vexError("no-offset", `"window" needs an array space or a tree space, but this space is a ${s.kind}`, at));
  }
  // An offset larger than the number of keys has no target, so the loop stays in the size of the space.
  const out: string[] = [];
  for (let d = Math.max(from, -s.keys.length); d <= Math.min(to, s.keys.length); d++) {
    const r = applyMove(s, at, { t: "offset", d: [d] });
    if (r.ok) out.push(r.value);
  }
  return ok(out);
}

import { vexError } from "./errors.ts";
import type { Addr, Axis, Move } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

/** The kind of a space. The kind sets which moves and axes are valid. */
export type SpaceKind = "record" | "array" | "grid" | "tree";

/**
 * A space: an immutable collection of records with keys. A Vex program evaluates at one key of a space.
 * Nothing changes a space after it is made.
 */
export interface Space<K extends string = string, O = unknown> {
  readonly kind: SpaceKind;
  /** The keys, in their order. */
  readonly keys: readonly K[];
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
}

/** The key type of a grid space. */
export type GridKey = `${number},${number}`;

/** The key type of an array space. */
export type ArrayKey = `${number}`;

class RecordSpace<K extends string, O> implements Space<K, O> {
  readonly kind: SpaceKind = "record";
  readonly keys: readonly K[];
  readonly #records: ReadonlyMap<string, O>;

  constructor(records: Readonly<Record<K, O>>) {
    const entries = Object.entries(records) as [K, O][];
    this.keys = Object.freeze(entries.map(([k]) => k));
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
  readonly #items: ReadonlyMap<string, O>;

  constructor(items: readonly O[]) {
    const entries = items.map((item, i): [ArrayKey, O] => [`${i}`, item]);
    this.keys = Object.freeze(entries.map(([k]) => k));
    this.#items = new Map(entries);
  }

  has(k: string): k is ArrayKey {
    return this.#items.has(k);
  }
  get(k: string): O | undefined {
    return this.#items.get(k);
  }
  coords(k: string): readonly number[] | undefined {
    return this.has(k) ? [Number(k)] : undefined;
  }
  keyAt(coords: readonly number[]): ArrayKey | undefined {
    const k = String(coords[0]);
    return coords.length === 1 && this.has(k) ? k : undefined;
  }
}

class GridSpace<O> implements Space<GridKey, O> {
  readonly kind: SpaceKind = "grid";
  readonly keys: readonly GridKey[];
  readonly #cells: ReadonlyMap<string, O>;
  readonly #coords: ReadonlyMap<string, readonly number[]>;

  constructor(rows: readonly (readonly O[])[]) {
    const entries = rows.flatMap((row, i) => row.map((cell, j): [GridKey, O, readonly number[]] => [`${i},${j}`, cell, Object.freeze([i, j])]));
    this.keys = Object.freeze(entries.map(([k]) => k));
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
  readonly #records: ReadonlyMap<string, O>;
  readonly #parents: ReadonlyMap<string, K>;
  readonly #children: ReadonlyMap<string, readonly K[]>;

  constructor(records: Readonly<Record<K, O>>, parents: Readonly<Partial<Record<K, K | null>>>) {
    const entries = Object.entries(records) as [K, O][];
    this.keys = Object.freeze(entries.map(([k]) => k));
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
  parentOf(k: string): K | undefined {
    return this.#parents.get(k);
  }
  childrenOf(k: string): readonly K[] {
    return this.#children.get(k) ?? [];
  }
}

/** The constructors of spaces. */
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
} as const;

/** The position of an evaluation: the key where it started, and the key where relative references read. */
export interface Position {
  readonly origin: string;
  readonly focus: string;
}

/** This function applies one move to the focus. It gives the new focus, or a `#REF!` error. */
export function applyMove(s: Space, at: Position, m: Move): Result<string> {
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

/** This function applies the moves of an address in order. It gives the key where the address points. */
export function resolveAddr(s: Space, at: Position, addr: Addr | undefined): Result<string> {
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
  }
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

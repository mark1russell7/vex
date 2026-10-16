import { defineDomain, type Domain, type FnOp, type OpTable } from "@mark1russell7/vex";

/**
 * An immutable vector with named components. The type parameter `K` is the set of component names. Ops that
 * combine two vectors use the union of their names, and a missing component counts as 0. The constructor
 * keeps each number, also a number that is not finite: the domain check reports such a value as `#NUM!`.
 */
export class NDVector<K extends string = string> {
  /** The components: name to number. */
  readonly c: Readonly<Record<K, number>>;

  constructor(c: Readonly<Record<K, number>>) {
    this.c = Object.freeze({ ...c });
  }

  /** This function makes a vector from name and value pairs. */
  static of<K extends string>(entries: readonly (readonly [K, number])[]): NDVector<K> {
    const c = {} as Record<K, number>;
    for (const [k, v] of entries) c[k] = v;
    return new NDVector(c);
  }
  /** This function makes the zero vector over the names `keys`. */
  static zero<K extends string>(keys: readonly K[] = []): NDVector<K> {
    return NDVector.of(keys.map((k) => [k, 0] as const));
  }

  /** The names of the components. */
  keys(): readonly K[] {
    return Object.keys(this.c) as K[];
  }
  /** The value of a component, or 0 if the vector does not have it. */
  get(k: string): number {
    return Object.hasOwn(this.c, k) ? Number((this.c as Readonly<Record<string, number>>)[k]) : 0;
  }
  set<K2 extends string>(k: K2, v: number): NDVector<K | K2> {
    return new NDVector({ ...this.c, [k]: v } as Record<K | K2, number>);
  }
  map(f: (name: K, v: number) => number): NDVector<K> {
    const c = {} as Record<K, number>;
    for (const k of this.keys()) c[k] = f(k, this.get(k));
    return new NDVector(c);
  }
  /** The vector with only the names in `keys`. A zero component is dropped, unless `keepZeros` is true. */
  pick<K2 extends K>(keys: readonly K2[], keepZeros = false): NDVector<K2> {
    const c = {} as Record<K2, number>;
    for (const k of keys) {
      const v = this.get(k);
      if (keepZeros || v !== 0) c[k] = v;
    }
    return new NDVector(c);
  }
  /** The vector with the names in `keys` added. A new component is 0. */
  withKeys<K2 extends string>(keys: readonly K2[]): NDVector<K | K2> {
    const c = { ...this.c } as Record<K | K2, number>;
    for (const k of keys) if (!Object.hasOwn(c, k)) c[k] = 0;
    return new NDVector(c);
  }
  #combine<K2 extends string>(o: NDVector<K2>, f: (a: number, b: number) => number): NDVector<K | K2> {
    const c = {} as Record<K | K2, number>;
    for (const k of new Set<K | K2>([...this.keys(), ...o.keys()])) c[k] = f(this.get(k), o.get(k));
    return new NDVector(c);
  }
  add<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => a + b);
  }
  subtract<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => a - b);
  }
  /** The component-wise product. */
  multiply<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => a * b);
  }
  /** The component-wise minimum. A component that one vector does not have counts as 0. */
  min<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => Math.min(a, b));
  }
  /** The component-wise maximum. A component that one vector does not have counts as 0. */
  max<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => Math.max(a, b));
  }
  /** Of each component, the value of this vector if it is not 0, else the value of `o`. */
  mergePreferNonZero<K2 extends string>(o: NDVector<K2>): NDVector<K | K2> {
    return this.#combine(o, (a, b) => (a !== 0 ? a : b));
  }
  scale(k: number): NDVector<K> {
    return this.map((_n, v) => v * k);
  }
  clamp(lo: number, hi: number): NDVector<K> {
    return this.map((_n, v) => Math.min(hi, Math.max(lo, v)));
  }
  dot(o: NDVector): number {
    let s = 0;
    for (const k of new Set<string>([...this.keys(), ...o.keys()])) s += this.get(k) * o.get(k);
    return s;
  }
  /** The L2 length. */
  length(): number {
    return Math.sqrt(this.keys().reduce((s, k) => s + this.get(k) ** 2, 0));
  }
  /** The L1 norm. */
  norm1(): number {
    return this.keys().reduce((s, k) => s + Math.abs(this.get(k)), 0);
  }
  /** The largest absolute component. */
  normInf(): number {
    return this.keys().reduce((m, k) => Math.max(m, Math.abs(this.get(k))), 0);
  }
  equals(o: NDVector): boolean {
    const keys = new Set<string>([...this.keys(), ...o.keys()]);
    for (const k of keys) if (this.get(k) !== o.get(k)) return false;
    return true;
  }
  /** True if each component is a finite number. */
  isFinite(): boolean {
    return this.keys().every((k) => Number.isFinite(this.get(k)));
  }
  toJSON(): Readonly<Record<K, number>> {
    return { ...this.c };
  }
  toString(): string {
    return `NDVector(${JSON.stringify(this.c)})`;
  }
}

type NDOpNames =
  | "add" | "subtract" | "multiply" | "min" | "max" | "mergePreferNonZero" | "scale" | "clamp" | "dot" | "length" | "norm1" | "normInf"
  | "equals" | "pick" | "withKeys" | "get" | "set";

/** The ops of `NDVectorDomain`. No op lifts numbers. */
export type NDVectorOps = OpTable<NDVector, NDOpNames>;

/** The ops of `LiftedNDVectorDomain`. */
export type LiftedNDVectorOps = OpTable<NDVector, NDOpNames, "add" | "subtract" | "multiply" | "dot">;

const ndOps = {
  add: { laws: ["commutative", "associative"], identity: (): NDVector => NDVector.zero(), params: ["domain"] },
  subtract: { params: ["domain"] },
  multiply: { laws: ["commutative", "associative"], params: ["domain"] },
  min: { laws: ["commutative", "associative", "idempotent"], params: ["domain"] },
  max: { laws: ["commutative", "associative", "idempotent"], params: ["domain"] },
  mergePreferNonZero: { laws: ["associative", "idempotent"], params: ["domain"] },
  scale: { params: ["number"] },
  clamp: { params: ["number", "number"] },
  dot: { laws: ["commutative"], params: ["domain"] },
  length: {},
  norm1: {},
  normInf: {},
  equals: { laws: ["commutative"], params: ["domain"] },
  pick: {},
  withKeys: {},
  get: { params: ["string"] },
  set: { params: ["string", "number"] },
} as const satisfies NDVectorOps;

const isNDVector = (u: unknown): u is NDVector => u instanceof NDVector;

/** The domain of named-component vectors. A number argument is an error here: use `LiftedNDVectorDomain` to lift. */
export const NDVectorDomain: Domain<"NDVector", NDVector, NDVectorOps> = defineDomain<"NDVector", NDVector, NDVectorOps>({
  name: "NDVector",
  is: isNDVector,
  valid: (v: NDVector): boolean => v.isFinite(),
  show: (v: NDVector): string => v.toString(),
  encode: (v: NDVector): unknown => v.toJSON(),
  decode: (u: unknown): NDVector => new NDVector(u as Readonly<Record<string, number>>),
  ops: ndOps,
});

/**
 * The domain of named-component vectors with scalar lifting. A number argument of `add`, `subtract`,
 * `multiply` or `dot` becomes the vector `{ scalar: n }`. This domain is independent of `NDVectorDomain`:
 * the two can be in one program, and neither changes the other.
 */
export const LiftedNDVectorDomain: Domain<"NDVector(lifted)", NDVector, LiftedNDVectorOps> = defineDomain<"NDVector(lifted)", NDVector, LiftedNDVectorOps>({
  name: "NDVector(lifted)",
  is: isNDVector,
  fromScalar: (n: number): NDVector => new NDVector({ scalar: n }),
  valid: (v: NDVector): boolean => v.isFinite(),
  show: (v: NDVector): string => v.toString(),
  ops: {
    ...ndOps,
    add: { ...ndOps.add, liftScalar: true },
    subtract: { ...ndOps.subtract, liftScalar: true },
    multiply: { ...ndOps.multiply, liftScalar: true },
    dot: { ...ndOps.dot, liftScalar: true },
  },
});

/** A plain record whose values are finite numbers. */
export type NumRecord = Readonly<Record<string, number>>;

/** The ops of `NumRecordDomain`. */
export type NumRecordOps = {
  readonly toNDVector: FnOp<NumRecord, (r: NumRecord) => NDVector>;
};

const isNumRecord = (u: unknown): u is NumRecord => {
  if (typeof u !== "object" || u === null || Array.isArray(u)) return false;
  const proto: unknown = Object.getPrototypeOf(u);
  // Number.isFinite gives false for each value that is not a number.
  return (proto === Object.prototype || proto === null) && Object.values(u).every((v) => Number.isFinite(v));
};

/** The domain of plain number records. Its op `toNDVector` builds a vector from fields, for example from `rec()`. */
export const NumRecordDomain: Domain<"NumRecord", NumRecord, NumRecordOps> = defineDomain<"NumRecord", NumRecord, NumRecordOps>({
  name: "NumRecord",
  is: isNumRecord,
  ops: {
    toNDVector: { fn: (r: NumRecord): NDVector => new NDVector(r) },
  },
});

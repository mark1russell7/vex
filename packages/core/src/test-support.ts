/**
 * Test support: a small 2D point domain and helpers. The tests of `@mark1russell7/vex` use it, so that the core
 * tests do not depend on `@mark1russell7/vex-domains`.
 */
import { defineDomain, type Domain, type OpSpec } from "./domain.ts";
import type { VexError } from "./errors.ts";
import type { Result } from "./result.ts";

/** A small immutable 2D point for tests. */
export class Pt {
  readonly x: number;
  readonly y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  add(o: Pt): Pt {
    return new Pt(this.x + o.x, this.y + o.y);
  }
  subtract(o: Pt): Pt {
    return new Pt(this.x - o.x, this.y - o.y);
  }
  scale(k: number): Pt {
    return new Pt(this.x * k, this.y * k);
  }
  length(): number {
    return Math.hypot(this.x, this.y);
  }
  anyNonPositive(): boolean {
    return this.x <= 0 || this.y <= 0;
  }
  pick(keys: readonly string[]): readonly string[] {
    return keys.filter((k) => k === "x" || k === "y");
  }
  boom(): Pt {
    throw new Error("boom");
  }
}

/** The ops of the test domain. The literal types keep the flags that the builder types read. */
export type PtOps = {
  readonly add: {
    readonly laws: readonly ["commutative", "associative"];
    readonly identity: () => Pt;
    readonly liftScalar: true;
    readonly params: readonly ["domain"];
  };
  readonly subtract: { readonly liftScalar: true; readonly params: readonly ["domain"] };
  readonly scale: { readonly params: readonly ["number"] };
  readonly length: OpSpec<Pt>;
  readonly anyNonPositive: OpSpec<Pt>;
  readonly pick: OpSpec<Pt>;
  readonly boom: OpSpec<Pt>;
  readonly dot: { readonly fn: (a: Pt, b: Pt) => number; readonly laws: readonly ["commutative"] };
};

/** The test domain of `Pt`. */
export const PtDomain: Domain<"Pt", Pt, PtOps> = defineDomain({
  name: "Pt",
  is: (u: unknown): u is Pt => u instanceof Pt,
  size: "fixed",
  fromScalar: (n: number) => new Pt(n, n),
  valid: (p: Pt) => Number.isFinite(p.x) && Number.isFinite(p.y),
  show: (p: Pt) => `Pt(${p.x}, ${p.y})`,
  encode: (p: Pt) => [p.x, p.y],
  decode: (u: unknown) => {
    const [x, y] = u as [number, number];
    return new Pt(x, y);
  },
  ops: {
    add: { laws: ["commutative", "associative"], identity: () => new Pt(0, 0), liftScalar: true, params: ["domain"] },
    subtract: { liftScalar: true, params: ["domain"] },
    scale: { params: ["number"] },
    length: {},
    anyNonPositive: {},
    pick: {},
    boom: {},
    dot: { fn: (a: Pt, b: Pt) => a.x * b.x + a.y * b.y, laws: ["commutative"] },
  },
});

/** This function gives the value of a successful result, or throws in a test. */
export function value<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected a value, got ${r.error.code} ${r.error.kind}: ${r.error.message}`);
  return r.value;
}

/** This function gives the error of a failed result, or throws in a test. */
export function error<T>(r: Result<T>): VexError {
  if (r.ok) throw new Error(`expected an error, got a value`);
  return r.error;
}

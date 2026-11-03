import { defineDomain, type Domain, type OpTable } from "@mark1russell7/vex";

/** A wrapper around a function. Its op `invoke` calls the function. It shows how a domain can hold behavior. */
export class Fn {
  readonly fn: (...args: never[]) => unknown;

  constructor(fn: (...args: never[]) => unknown) {
    this.fn = fn;
  }
  invoke(...args: readonly unknown[]): unknown {
    return (this.fn as (...a: readonly unknown[]) => unknown)(...args);
  }
}

/** The ops of `FnDomain`. */
export type FnOps = OpTable<Fn, "invoke">;

/** The domain of function wrappers. */
export const FnDomain: Domain<"Fn", Fn, FnOps> = defineDomain<"Fn", Fn, FnOps>({
  name: "Fn",
  is: (u: unknown): u is Fn => u instanceof Fn,
  // LOOP.SIZE.OPS: `invoke` calls a function of the value, so it has no size rule.
  ops: { invoke: {} },
});

/**
 * A value that is there (`top`) or not there (`bottom`). It shows a domain whose ops take functions. A Vex
 * program can also hold this state in its own errors, so most programs do not need this domain.
 */
export class Maybe<T> {
  readonly #has: boolean;
  readonly #value: T | undefined;

  private constructor(has: boolean, value: T | undefined) {
    this.#has = has;
    this.#value = value;
  }
  static top<T>(value: T): Maybe<T> {
    return new Maybe<T>(true, value);
  }
  static bottom<T = never>(): Maybe<T> {
    return new Maybe<T>(false, undefined);
  }
  isTop(): boolean {
    return this.#has;
  }
  isBottom(): boolean {
    return !this.#has;
  }
  map<U>(f: (value: T) => U): Maybe<U> {
    return this.#has ? Maybe.top(f(this.#value as T)) : Maybe.bottom<U>();
  }
  chain<U>(f: (value: T) => Maybe<U>): Maybe<U> {
    return this.#has ? f(this.#value as T) : Maybe.bottom<U>();
  }
  valueOr<U>(fallback: U): T | U {
    return this.#has ? (this.#value as T) : fallback;
  }
}

/** The ops of `MaybeDomain`. */
export type MaybeOps = OpTable<Maybe<unknown>, "isTop" | "isBottom" | "map" | "chain" | "valueOr">;

/** The domain of `Maybe` values. */
export const MaybeDomain: Domain<"Maybe", Maybe<unknown>, MaybeOps> = defineDomain<"Maybe", Maybe<unknown>, MaybeOps>({
  name: "Maybe",
  is: (u: unknown): u is Maybe<unknown> => u instanceof Maybe,
  // LOOP.SIZE.OPS: `map` and `chain` call a function of the value, so they have no size rule.
  ops: { isTop: { size: "scalar" }, isBottom: { size: "scalar" }, map: {}, chain: {}, valueOr: { size: { size: [1, 1] } } },
});

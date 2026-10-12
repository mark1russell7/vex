/**
 * The typed builder. Method calls make an expression of the IR. The builder has no other job: it does not
 * evaluate anything until a caller asks for a value.
 */
import type { AnyDomain, Domain, OpSpec } from "./domain.ts";
import type { VexError } from "./errors.ts";
import { evaluate, explain, type EvalOptions, type ExtHandler, type FreeFn } from "./evaluate.ts";
import { app, each, ext, index as indexMove, key as keyMove, let_, lit, offset as offsetMove, other as otherMove, origin as originMove, parent as parentMove, rec, ref, toPath, v, type Addr, type Axis, type Expr, type Move } from "./ir.ts";
import { cell as cellRef, SheetRun } from "./sheet.ts";
import { toOptional, type Optional, type Result } from "./result.ts";
import type { Space } from "./space.ts";
import type { Trace } from "./trace.ts";
import { traversal, type Traversal } from "./traversal.ts";

// ---------------------------------------------------------------- argument tokens

declare const ARG_TYPE: unique symbol;
declare const CHAIN_VALUE: unique symbol;

/** An argument token: an expression with the static type `T` of its value. */
export interface Arg<T> {
  readonly kind: "vex.arg";
  readonly expr: Expr;
  /** This phantom member carries the type. It is not present at run time. */
  readonly [ARG_TYPE]?: T;
}

const argToken = <T>(expr: Expr): Arg<T> => ({ kind: "vex.arg", expr });


// ---------------------------------------------------------------- type helpers

/** The keys of any member of a union of record types. */
type AllKeys<O> = O extends unknown ? keyof O : never;

/** The type of field `P` in the members of `O` that have it. */
type FieldType<O, P extends PropertyKey> = O extends unknown ? (P extends keyof O ? O[P] : never) : never;

/**
 * The merged view of a union of record types: each field of any member, with the union of its types. A record
 * without the field gives `#N/A` at run time.
 */
export type Merge<O> = { readonly [P in AllKeys<O>]: FieldType<O, P> };

/** The keys of `O` whose values have the type `T`. */
export type KeysOfType<O, T> = { [P in keyof O]-?: [NonNullable<O[P]>] extends [never] ? never : NonNullable<O[P]> extends T ? P : never }[keyof O] & string;

/** The method names of `D`. */
export type MethodKeys<D> = { [P in keyof D]-?: D[P] extends (...args: never[]) => unknown ? P : never }[keyof D] & string;

/** The value type of a domain. */
export type DomainValue<Dm> = Dm extends Domain<string, infer D, infer _Ops> ? D : never;

type OpsOf<Dm> = Dm extends Domain<string, unknown, infer Ops> ? Ops : Dm extends { readonly ops: infer Ops } ? Ops : never;

/** The op names that a chain over a value of domain `Dm` can use. */
export type OpNames<Dm> =
  | (keyof OpsOf<Dm> & string)
  | (Dm extends { readonly methods: "all" } ? MethodKeys<DomainValue<Dm>> : never);

type FnOf<Dm, M extends string> = M extends keyof OpsOf<Dm>
  ? OpsOf<Dm>[M] extends { readonly fn: (self: never, ...args: infer P) => infer R }
    ? (...args: P) => R
    : M extends keyof DomainValue<Dm>
      ? DomainValue<Dm>[M]
      : never
  : M extends keyof DomainValue<Dm>
    ? DomainValue<Dm>[M]
    : never;

/** The parameters of op `M` after the receiver. */
export type OpParams<Dm, M extends string> = FnOf<Dm, M> extends (...args: infer P) => unknown ? P : never;

/** The value type that op `M` gives. */
export type OpReturn<Dm, M extends string> = FnOf<Dm, M> extends (...args: never[]) => infer R ? R : never;

type Lifts<Dm, M extends string> = M extends keyof OpsOf<Dm> ? (OpsOf<Dm>[M] extends { readonly liftScalar: true } ? true : false) : false;

/** The first domain of `Dms` whose values include `T`, or `never`. */
export type DomainFor<Dms extends readonly AnyDomain[], T> = Dms extends readonly [infer H, ...infer R extends readonly AnyDomain[]]
  ? [T] extends [never]
    ? never
    : [T] extends [DomainValue<H>]
      ? H
      : DomainFor<R, T>
  : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type LastOf<U> = UnionToIntersection<U extends unknown ? () => U : never> extends () => infer R ? R : never;

/** `true` if `other()` is permitted for the key type: a pair of keys, or keys that the compiler does not know. */
export type AllowsOther<K extends string> = string extends K
  ? true
  : `${number}` extends K
    ? true
    : [Exclude<K, LastOf<K>>] extends [never]
      ? false
      : [Exclude<Exclude<K, LastOf<K>>, LastOf<Exclude<K, LastOf<K>>>>] extends [never]
        ? true
        : false;

/**
 * The inputs for an argument with the parameter type `P`. The input can be a literal of type `P`, but not a bare
 * string. It can be a field of the record with type `P`, an argument token, or a chain that gives `P`. If the op
 * lifts scalars, it can also be a number.
 */
export type ArgInput<P, Ctx extends ChainContext, Lift extends boolean> =
  | (P extends string ? never : P)
  | KeysOfType<Ctx["record"], P>
  | Arg<P>
  | ChainOf<Ctx, P>
  | (Lift extends true ? ([P] extends [DomainValue<DomainFor<Ctx["domains"], P>>] ? number : never) : never);

type MapArgs<P extends readonly unknown[], Ctx extends ChainContext, Lift extends boolean> = { [I in keyof P]: ArgInput<P[I], Ctx, Lift> };

/** A table of free functions. The first parameter of a function gets the current value of the chain. */
export type FnTable = Readonly<Record<string, (...args: never[]) => unknown>>;

/** The free functions of a builder without `withOptions`: none, so `call` accepts no name. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty table is the intent.
export type NoFns = Record<never, never>;

/** The static context of a chain: its domains, its key type, its record type and its free functions. */
export interface ChainContext {
  readonly domains: readonly AnyDomain[];
  readonly keys: string;
  readonly record: unknown;
  readonly fns?: FnTable;
}

type FnsOf<Ctx extends ChainContext> = NonNullable<Ctx["fns"]>;
type FnParams<F> = F extends (...args: infer P) => unknown ? P : never;
type FirstParam<P> = P extends readonly [infer A, ...unknown[]] ? A : unknown;
type RestParams<P> = P extends readonly [unknown, ...infer R] ? R : [];

/** The names of the free functions whose first parameter accepts a value of type `T`. */
export type CallableFns<Ctx extends ChainContext, T> = {
  [K in keyof FnsOf<Ctx>]: [T] extends [FirstParam<FnParams<FnsOf<Ctx>[K]>>] ? K : never;
}[keyof FnsOf<Ctx>] &
  string;

/** The inputs for the parameters of the free function `N` after its first parameter. */
export type CallArgs<Ctx extends ChainContext, N extends keyof FnsOf<Ctx>> = MapArgs<RestParams<FnParams<FnsOf<Ctx>[N]>>, Ctx, false>;

/** The return type of the free function `N`. */
export type CallReturn<Ctx extends ChainContext, N extends keyof FnsOf<Ctx>> = FnsOf<Ctx>[N] extends (...args: never[]) => infer R ? R : unknown;

/** The ops section `._` of a chain whose value has domain `Dm`. */
export type OpsProxy<Ctx extends ChainContext, Dm> = {
  readonly [M in OpNames<Dm>]: (...args: MapArgs<OpParams<Dm, M>, Ctx, Lifts<Dm, M>>) => ChainOf<Ctx, OpReturn<Dm, M>>;
};

// ---------------------------------------------------------------- chain types

/** The members of every chain. */
export interface ChainBase<Ctx extends ChainContext, T> {
  readonly kind: "vex.chain";
  /** This phantom member carries the value type. It is not present at run time. */
  readonly [CHAIN_VALUE]?: T;
  /** The expression of the chain, as plain data. */
  readonly program: Expr;
  /** This method evaluates the chain at a key. An error gives `none`. */
  at(k: Ctx["keys"]): Optional<T>;
  /** This method is the same as `at`. The v0.9 spec calls it `value`. */
  value(k: Ctx["keys"]): Optional<T>;
  /** This method evaluates the chain at a key, and gives the error if there is one. */
  result(k: Ctx["keys"]): Result<T>;
  /** This method evaluates the chain at a key, with a trace of each node. */
  explain(k: Ctx["keys"]): Trace;
  /** This method evaluates the chain at each key of the space (the start axis). */
  all(): Traversal<Ctx["keys"], T>;
  /** This method gives a chain whose value is a field of the record at the current address. */
  from<P extends keyof Ctx["record"] & string>(field: P): ChainOf<Ctx, NonNullable<Ctx["record"][P]>>;
  /** Navigation: later field references read at the key `k`. */
  to(k: Ctx["keys"]): ChainOf<Ctx, T>;
  /** Navigation: later field references read at the key with this position in the key order. */
  index(i: number): ChainOf<Ctx, T>;
  /** Navigation: later field references read at a relative position in an array or a grid. */
  offset(...d: readonly number[]): ChainOf<Ctx, T>;
  /** Navigation: later field references read at the origin again. */
  origin(): ChainOf<Ctx, T>;
  /** Navigation: later field references read at the parent of the focus, in a tree space. A root gives `#REF!`. */
  parent(): ChainOf<Ctx, T>;
  /** This method uses `fallback` when the chain gives an error. */
  ifError<U>(fallback: ArgInput<U, Ctx, false> | T): ChainOf<Ctx, T | U>;
  /**
   * This method applies the free function `name` of `withOptions`. The function gets the current value as its first
   * argument, then `args`. The types accept only the functions whose first parameter accepts the current value.
   */
  call<N extends CallableFns<Ctx, T>>(name: N, ...args: CallArgs<Ctx, N>): ChainOf<Ctx, CallReturn<Ctx, N>>;
  /** This method evaluates each branch with the current value, and gives a record of the results. */
  fork<const B extends Readonly<Record<string, (c: ChainOf<Ctx, T>) => ChainBase<Ctx, unknown>>>>(branches: B): ChainOf<Ctx, { readonly [N in keyof B]: ValueOf<ReturnType<B[N]>> }>;
  /** This method binds names for the body. The body gets a variable token for each name. */
  with<const B extends Readonly<Record<string, unknown>>, U>(
    binds: B,
    body: (c: ChainOf<Ctx, T>, vars: { readonly [N in keyof B]: Arg<ArgValue<Ctx, B[N]>> }) => ChainBase<Ctx, U>,
  ): ChainOf<Ctx, U>;
  /** The others axis: the body evaluates at each key except the focus. Its start value is the current value. */
  others<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The neighbors axis of a grid. */
  neighbors<U>(n: 4 | 8, body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The all axis inside the expression: the body evaluates at each key, with the current value as start value. */
  each<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The children axis of a tree space: the body evaluates at each child of the focus. */
  children<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The ancestors axis of a tree space: the parent first, the root last. */
  ancestors<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The descendants axis of a tree space: depth first, each parent before its children. */
  descendants<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The siblings axis of a tree space: the other children of the parent, or the other roots for a root. */
  siblings<U>(body: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
}

/** The options of an axis. */
export interface AxisOpts<Ctx extends ChainContext, T> {
  /** A test at each target. The body evaluates only at the targets where the test gives `true`. */
  readonly where?: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, boolean>;
}

/** The members of a chain whose value has a domain. */
export interface DomainMembers<Ctx extends ChainContext, Dm> {
  /** The ops of the domain of the current value. */
  readonly _: OpsProxy<Ctx, Dm>;
}

/** The members of a chain over a space whose keys permit `other()`. */
export interface OtherMembers<Ctx extends ChainContext, T> {
  /** Navigation: later field references read at the other key of the pair. */
  other(): ChainOf<Ctx, T>;
}

/** A chain with the current value type `T`. */
export type ChainOf<Ctx extends ChainContext, T> = ChainBase<Ctx, T> &
  ([DomainFor<Ctx["domains"], T>] extends [never] ? unknown : DomainMembers<Ctx, DomainFor<Ctx["domains"], T>>) &
  (AllowsOther<Ctx["keys"]> extends true ? OtherMembers<Ctx, T> : unknown);

/** The value type of a chain. */
export type ValueOf<C> = C extends { readonly [CHAIN_VALUE]?: infer T } ? T : never;

/** The value type of an argument input. */
export type ArgValue<Ctx extends ChainContext, A> = A extends Arg<infer T>
  ? T
  : A extends { readonly kind: "vex.chain" }
    ? ValueOf<A>
    : A extends keyof Ctx["record"] & string
      ? NonNullable<Ctx["record"][A]>
      : A;

/** A chain whose value is a list: the result of an axis. */
export interface ListChain<Ctx extends ChainContext, U> {
  readonly kind: "vex.list-chain";
  /** The expression of the chain, as plain data. */
  readonly program: Expr;
  count(opts?: ListOpts): ChainOf<Ctx, number>;
  sum(this: ListChain<Ctx, number>, opts?: ListOpts): ChainOf<Ctx, number>;
  mean(this: ListChain<Ctx, number>, opts?: ListOpts): ChainOf<Ctx, number>;
  min(this: ListChain<Ctx, number>, opts?: ListOpts): ChainOf<Ctx, number>;
  max(this: ListChain<Ctx, number>, opts?: ListOpts): ChainOf<Ctx, number>;
  any(this: ListChain<Ctx, boolean>, opts?: ListOpts): ChainOf<Ctx, boolean>;
  all(this: ListChain<Ctx, boolean>, opts?: ListOpts): ChainOf<Ctx, boolean>;
  none(this: ListChain<Ctx, boolean>, opts?: ListOpts): ChainOf<Ctx, boolean>;
  values(opts?: ListOpts): ChainOf<Ctx, readonly U[]>;
  /** The keys of the items with a value, in the order of the axis. */
  keys(opts?: ListOpts): ChainOf<Ctx, readonly Ctx["keys"][]>;
  /** The error of each item that failed, in the order of the axis. */
  errors(): ChainOf<Ctx, readonly VexError[]>;
  first(opts?: ListOpts): ChainOf<Ctx, U>;
  reduce(op: OpNames<DomainFor<Ctx["domains"], U>>, opts?: ListOpts): ChainOf<Ctx, U>;
}

/** The options of a list reduction. */
export interface ListOpts {
  /** With `true`, an error item makes the result that error. The default skips error items. */
  readonly strict?: boolean;
}

/** The root of the builder for one space. */
export interface Root<Ctx extends ChainContext> {
  /** This method starts a chain with a field of the record at the focus. */
  from<P extends keyof Ctx["record"] & string>(field: P): ChainOf<Ctx, NonNullable<Ctx["record"][P]>>;
  /** This method starts a chain with a value. A string is a field reference, as in an argument. */
  start<const T>(value: T): ChainOf<Ctx, ArgValue<Ctx, T>>;
  /** This method makes an absolute reference: the field of the record at key `k`. */
  of<P extends keyof Ctx["record"] & string>(k: Ctx["keys"], field: P): Arg<NonNullable<Ctx["record"][P]>>;
  /** This method makes a reference to a dotted path at the focus, with the type that the caller gives. */
  field<T>(path: string): Arg<T>;
  /** This method makes a literal argument. Use it for a string or an array: a bare string is a field reference. */
  lit<const T>(value: T): Arg<T>;
  /** This method makes an absolute reference to a dotted path at key `k`, with the type that the caller gives. */
  ofPath<T>(k: Ctx["keys"], path: string): Arg<T>;
  /** This method makes a record argument from field arguments. */
  rec<const F extends Readonly<Record<string, unknown>>>(fields: F): Arg<{ readonly [N in keyof F]: ArgValue<Ctx, F[N]> }>;
  /**
   * This method makes an extension argument: the node `ext(kind, data)`. The handler of `kind` in the options of
   * `withOptions` gives its value. The caller gives the type `T` of that value.
   */
  ext<T>(kind: string, data?: unknown): Arg<T>;
  /** This method starts a sheet over the space: named columns of formulas. Refer to `Sheet`. */
  sheet(): Sheet<Ctx, object>;
  /** The space of the root. */
  readonly space: Space<Ctx["keys"], Ctx["record"]>;
}

/** The root of a column formula: the root of the builder, and references to the cells of the sheet. */
export interface SheetRoot<Ctx extends ChainContext, Cols> extends Root<Ctx> {
  /**
   * This method makes a cell reference: the column `column` at the key `at`, or at the address `at` from the focus.
   * Without `at`, it reads at the focus. The type is the type of a column before this one.
   */
  cell<N extends keyof Cols & string>(column: N, at?: Ctx["keys"] | Addr): Arg<Cols[N]>;
  /** This method makes a cell reference to any column, also this column or a later one. The caller gives the type. */
  cell<T>(column: string, at?: Ctx["keys"] | Addr): Arg<T>;
}

/** One row of a sheet: the key and the result of each column. */
export interface SheetRow<K extends string, Cols> {
  readonly key: K;
  readonly cells: { readonly [N in keyof Cols]: Result<Cols[N]> };
}

/**
 * A sheet: named columns of formulas over a space, like the computed columns of a spreadsheet. A formula reads the
 * other columns with `cell`. Each evaluation evaluates a cell once, and each cell on a cycle of references gives
 * `#CYCLE!`. A sheet is immutable: `column` gives a new sheet.
 */
export interface Sheet<Ctx extends ChainContext, Cols, Decl = object> {
  /**
   * This method gives a new sheet with one more column. The formula gets a root with `cell`. If `declare` gave the
   * column a type, the formula must give a value of that type.
   */
  column<const N extends string, C extends ChainBase<Ctx, DeclaredType<Decl, N>>>(
    name: N,
    formula: (r: SheetRoot<Ctx, Cols & Decl>) => C,
  ): Sheet<Ctx, Cols & { readonly [P in N]: ValueOf<C> }, Decl>;
  /**
   * This method gives the types of columns before their formulas. A formula can then read a declared column with
   * `cell` and its type: the column itself (a recurrence) or a later column. It has no effect at run time.
   */
  declare<D extends Readonly<Record<string, unknown>>>(): Sheet<Ctx, Cols, Decl & D>;
  /** The program of each column. */
  readonly columns: Readonly<Record<string, Expr>>;
  /** This method evaluates one cell, and gives the error if there is one. */
  result<N extends keyof Cols & string>(k: Ctx["keys"], column: N): Result<Cols[N]>;
  /** This method evaluates one cell. An error gives `none`. */
  at<N extends keyof Cols & string>(k: Ctx["keys"], column: N): Optional<Cols[N]>;
  /** This method evaluates one cell, with a trace of the nodes of its column. */
  explain(k: Ctx["keys"], column: keyof Cols & string): Trace;
  /** This method evaluates each cell, in key order, with one result for each cell. */
  table(): readonly SheetRow<Ctx["keys"], Cols>[];
}

/** The declared type of the column `N`, or `unknown` for a column without a declaration. */
export type DeclaredType<Decl, N extends string> = N extends keyof Decl ? Decl[N] : unknown;

/** The options of the builder. */
export interface VexOptions<F extends FnTable = FnTable> {
  /** Free function ops. A chain applies them with `call`. */
  readonly fns?: F;
  /** Handlers of extension expression kinds. */
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
}

/** The entry point for a list of domains. */
export interface VexEntry<Dms extends readonly AnyDomain[], F extends FnTable = NoFns> {
  /** This method gives the root of the builder for a space. */
  over<K extends string, O>(s: Space<K, O>): Root<{ readonly domains: Dms; readonly keys: K; readonly record: Merge<O>; readonly fns: F }>;
  /** The domains. */
  readonly domains: Dms;
}

// ---------------------------------------------------------------- run time

/** The options as the interpreter takes them: free functions get untyped arguments at run time. */
interface RuntimeOptions {
  readonly fns?: Readonly<Record<string, FreeFn>>;
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
}

/** This function gives the run-time form of the options. A typed free function gets the values that the types promise. */
const runtimeOptions = (options: VexOptions): RuntimeOptions => ({
  // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
  ...(options.fns === undefined ? {} : { fns: options.fns as Readonly<Record<string, FreeFn>> }),
  // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
  ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
});

interface Env {
  readonly space: Space;
  readonly domains: readonly AnyDomain[];
  readonly options: RuntimeOptions;
}

interface State {
  readonly env: Env;
  /** The current value. */
  readonly expr: Expr;
  /** The address where later field references read. */
  readonly addr: readonly Move[];
  /** The depth of nested axis and binding bodies, for unique variable names. */
  readonly depth: number;
}

const kindOf = (u: unknown): unknown => (u as { kind?: unknown } | null | undefined)?.kind;
const isArg = (u: unknown): u is Arg<unknown> => kindOf(u) === "vex.arg";
const isChainLike = (u: unknown): u is { readonly program: Expr } => kindOf(u) === "vex.chain" || kindOf(u) === "vex.list-chain";

/** This function turns a builder argument into an expression. A bare string is a field reference at `addr`. */
function toExpr(a: unknown, addr: readonly Move[]): Expr {
  if (typeof a === "string") return ref(toPath(a), addr);
  if (isArg(a)) return a.expr;
  if (isChainLike(a)) return a.program;
  return lit(a);
}

const PROXY_RESERVED = new Set(["then", "catch", "finally", "toJSON", "valueOf", "toString", "constructor", "inspect", "asymmetricMatch", "$$typeof", "nodeType"]);

class ChainImpl {
  readonly kind = "vex.chain" as const;
  readonly #s: State;

  constructor(s: State) {
    this.#s = s;
  }

  get program(): Expr {
    return this.#s.expr;
  }

  get _(): Readonly<Record<string, (...args: readonly unknown[]) => ChainImpl>> {
    const s = this.#s;
    return new Proxy(Object.create(null) as Record<string, never>, {
      get: (_t, prop): unknown => {
        if (typeof prop !== "string" || PROXY_RESERVED.has(prop)) return undefined;
        return (...args: readonly unknown[]): ChainImpl => new ChainImpl({ ...s, expr: app(prop, s.expr, ...args.map((a) => toExpr(a, s.addr))) });
      },
    });
  }

  #opts(k: string): EvalOptions {
    const { env } = this.#s;
    return {
      space: env.space,
      origin: k,
      domains: env.domains,
      // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
      ...(env.options.fns === undefined ? {} : { fns: env.options.fns }),
      // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
      ...(env.options.extensions === undefined ? {} : { extensions: env.options.extensions }),
    };
  }

  result(k: string): Result<unknown> {
    return evaluate(this.#s.expr, this.#opts(k));
  }
  at(k: string): Optional<unknown> {
    return toOptional(this.result(k));
  }
  value(k: string): Optional<unknown> {
    return this.at(k);
  }
  explain(k: string): Trace {
    return explain(this.#s.expr, this.#opts(k));
  }
  all(): Traversal<string, unknown> {
    const { env } = this.#s;
    const items = env.space.keys.map((k) => ({ key: k, result: this.result(k) }));
    return traversal(items, env);
  }

  from(field: string): ChainImpl {
    return new ChainImpl({ ...this.#s, expr: ref(toPath(field), this.#s.addr) });
  }

  #move(m: Move): ChainImpl {
    return new ChainImpl({ ...this.#s, addr: [...this.#s.addr, m] });
  }
  to(k: string): ChainImpl {
    return this.#move(keyMove(k));
  }
  index(i: number): ChainImpl {
    return this.#move(indexMove(i));
  }
  offset(...d: readonly number[]): ChainImpl {
    return this.#move(offsetMove(...d));
  }
  other(): ChainImpl {
    return this.#move(otherMove);
  }
  origin(): ChainImpl {
    return this.#move(originMove);
  }
  parent(): ChainImpl {
    return this.#move(parentMove);
  }

  call(name: string, ...args: readonly unknown[]): ChainImpl {
    return new ChainImpl({ ...this.#s, expr: app(name, this.#s.expr, ...args.map((a) => toExpr(a, this.#s.addr))) });
  }
  ifError(fallback: unknown): ChainImpl {
    return new ChainImpl({ ...this.#s, expr: app("ifError", this.#s.expr, toExpr(fallback, this.#s.addr)) });
  }

  /** This method binds the current value to a fresh name, and gives a chain that starts from that name. */
  #bound(): { readonly name: string; readonly start: ChainImpl } {
    const name = `$${this.#s.depth}`;
    return { name, start: new ChainImpl({ ...this.#s, expr: v(name), depth: this.#s.depth + 1 }) };
  }

  fork(branches: Readonly<Record<string, (c: ChainImpl) => { readonly program: Expr }>>): ChainImpl {
    const { name, start } = this.#bound();
    const fields: Record<string, Expr> = {};
    for (const [n, f] of Object.entries(branches)) fields[n] = f(start).program;
    return new ChainImpl({ ...this.#s, expr: let_({ [name]: this.#s.expr }, rec(fields)) });
  }

  with(binds: Readonly<Record<string, unknown>>, body: (c: ChainImpl, vars: Readonly<Record<string, Arg<unknown>>>) => { readonly program: Expr }): ChainImpl {
    const depth = this.#s.depth;
    const bindExprs: Record<string, Expr> = {};
    const vars: Record<string, Arg<unknown>> = {};
    for (const [n, a] of Object.entries(binds)) {
      const unique = `${n}$${depth}`;
      bindExprs[unique] = toExpr(a, this.#s.addr);
      vars[n] = argToken(v(unique));
    }
    const inner = body(new ChainImpl({ ...this.#s, depth: depth + 1 }), vars);
    return new ChainImpl({ ...this.#s, expr: let_(bindExprs, inner.program) });
  }

  #axis(a: Axis, body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    const { name, start } = this.#bound();
    // Inside the axis, the focus is the target, so the address of the body starts empty.
    const inTarget = new ChainImpl({ ...start.#s, addr: [] });
    const inner = body(inTarget);
    const axis: Axis = opts?.where === undefined ? a : { t: "where", axis: a, test: opts.where(inTarget).program };
    // The moves before the axis are its address: parent().children(f) gives f at each child of the parent.
    return new ListChainImpl({ ...this.#s, expr: let_({ [name]: this.#s.expr }, each(axis, inner.program, this.#s.addr)) });
  }
  others(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "others" }, body, opts);
  }
  neighbors(n: 4 | 8, body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "neighbors", n }, body, opts);
  }
  each(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "all" }, body, opts);
  }
  children(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "children" }, body, opts);
  }
  ancestors(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "ancestors" }, body, opts);
  }
  descendants(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "descendants" }, body, opts);
  }
  siblings(body: (c: ChainImpl) => { readonly program: Expr }, opts?: { readonly where?: (c: ChainImpl) => { readonly program: Expr } }): ListChainImpl {
    return this.#axis({ t: "siblings" }, body, opts);
  }
}

class ListChainImpl {
  readonly kind = "vex.list-chain" as const;
  readonly #s: State;
  constructor(s: State) {
    this.#s = s;
  }
  get program(): Expr {
    return this.#s.expr;
  }
  #op(op: string, extra: readonly Expr[], opts?: ListOpts): ChainImpl {
    const args = opts?.strict === true ? [...extra, lit({ strict: true })] : extra;
    return new ChainImpl({ ...this.#s, expr: app(op, this.#s.expr, ...args) });
  }
  count(opts?: ListOpts): ChainImpl {
    return this.#op("count", [], opts);
  }
  sum(opts?: ListOpts): ChainImpl {
    return this.#op("sum", [], opts);
  }
  mean(opts?: ListOpts): ChainImpl {
    return this.#op("mean", [], opts);
  }
  min(opts?: ListOpts): ChainImpl {
    return this.#op("min", [], opts);
  }
  max(opts?: ListOpts): ChainImpl {
    return this.#op("max", [], opts);
  }
  any(opts?: ListOpts): ChainImpl {
    return this.#op("any", [], opts);
  }
  all(opts?: ListOpts): ChainImpl {
    return this.#op("all", [], opts);
  }
  none(opts?: ListOpts): ChainImpl {
    return this.#op("none", [], opts);
  }
  values(opts?: ListOpts): ChainImpl {
    return this.#op("values", [], opts);
  }
  keys(opts?: ListOpts): ChainImpl {
    return this.#op("keys", [], opts);
  }
  errors(): ChainImpl {
    return this.#op("errors", []);
  }
  first(opts?: ListOpts): ChainImpl {
    return this.#op("first", [], opts);
  }
  reduce(op: string, opts?: ListOpts): ChainImpl {
    return this.#op("reduce", [lit(op)], opts);
  }
}

class RootImpl {
  readonly #env: Env;
  constructor(env: Env) {
    this.#env = env;
  }
  get space(): Space {
    return this.#env.space;
  }
  #chain(expr: Expr): ChainImpl {
    return new ChainImpl({ env: this.#env, expr, addr: [], depth: 0 });
  }
  from(field: string): ChainImpl {
    return this.#chain(ref(toPath(field)));
  }
  start(value: unknown): ChainImpl {
    return this.#chain(toExpr(value, []));
  }
  of(k: string, field: string): Arg<unknown> {
    return argToken(ref(toPath(field), [keyMove(k)]));
  }
  field(path: string): Arg<unknown> {
    return argToken(ref(toPath(path)));
  }
  lit(value: unknown): Arg<unknown> {
    return argToken(lit(value));
  }
  ofPath(k: string, path: string): Arg<unknown> {
    return argToken(ref(toPath(path), [keyMove(k)]));
  }
  ext(kind: string, data: unknown = null): Arg<unknown> {
    return argToken(ext(kind, data));
  }
  sheet(): SheetImpl {
    return new SheetImpl(this.#env, new Map());
  }
  rec(fields: Readonly<Record<string, unknown>>): Arg<unknown> {
    const out: Record<string, Expr> = {};
    for (const [n, a] of Object.entries(fields)) out[n] = toExpr(a, []);
    return argToken(rec(out));
  }
}

class SheetRootImpl extends RootImpl {
  cell(column: string, at?: string | Addr): Arg<unknown> {
    return argToken(cellRef(column, typeof at === "string" ? [keyMove(at)] : at));
  }
}

class SheetImpl {
  readonly #env: Env;
  readonly #columns: ReadonlyMap<string, Expr>;
  constructor(env: Env, columns: ReadonlyMap<string, Expr>) {
    this.#env = env;
    this.#columns = columns;
  }
  get columns(): Readonly<Record<string, Expr>> {
    return Object.freeze(Object.fromEntries(this.#columns));
  }
  declare(): SheetImpl {
    return this;
  }
  column(name: string, formula: (r: SheetRootImpl) => { readonly program: Expr }): SheetImpl {
    const program = formula(new SheetRootImpl(this.#env)).program;
    return new SheetImpl(this.#env, new Map([...this.#columns, [name, program]]));
  }
  #run(): SheetRun {
    const { space: s, domains, options } = this.#env;
    return new SheetRun(this.#columns, {
      space: s,
      domains,
      // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
      ...(options.fns === undefined ? {} : { fns: options.fns }),
      // Stryker disable next-line ConditionalExpression: an undefined option and an absent option are the same
      ...(options.extensions === undefined ? {} : { extensions: options.extensions }),
    });
  }
  result(k: string, column: string): Result<unknown> {
    const run = this.#run();
    run.warm(column, k);
    return run.cell(column, k);
  }
  at(k: string, column: string): Optional<unknown> {
    return toOptional(this.result(k, column));
  }
  explain(k: string, column: string): Trace {
    const run = this.#run();
    run.warm(column, k);
    return run.explain(column, k);
  }
  table(): readonly SheetRow<string, Record<string, unknown>>[] {
    const run = this.#run();
    const names = [...this.#columns.keys()];
    return this.#env.space.keys.map((key) => ({ key, cells: Object.fromEntries(names.map((c) => [c, run.cell(c, key)])) }));
  }
}

/**
 * This function gives the entry point of the builder for a list of domains. The interpreter finds the op of a
 * value in the first domain that accepts the value.
 */
export function vex<const Dms extends readonly AnyDomain[]>(
  ...domains: Dms
): VexEntry<Dms> & { withOptions<const F extends FnTable = NoFns>(options: VexOptions<F>): VexEntry<Dms, F> } {
  const make = <F extends FnTable>(options: VexOptions<F>): VexEntry<Dms, F> => ({
    domains,
    over: <K extends string, O>(s: Space<K, O>): Root<{ readonly domains: Dms; readonly keys: K; readonly record: Merge<O>; readonly fns: F }> =>
      new RootImpl({ space: s, domains, options: runtimeOptions(options) }) as unknown as Root<{
        readonly domains: Dms;
        readonly keys: K;
        readonly record: Merge<O>;
        readonly fns: F;
      }>,
  });
  return { ...make<NoFns>({}), withOptions: make };
}

/** The type of a domain value, from the domain object. */
export type ValueOfDomain<Dm> = DomainValue<Dm>;

/** An op specification type, for domain authors. */
export type { OpSpec };

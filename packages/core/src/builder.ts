/**
 * The typed builder. Method calls make an expression of the IR. The builder has no other job: it does not
 * evaluate anything until a caller asks for a value.
 */
import type { AnyDomain, Domain, OpSpec, PrimitiveKind } from "./domain.ts";
import type { VexError } from "./errors.ts";
import { evaluate, explain, type EvalOptions, type ExtHandler, type FreeFn } from "./evaluate.ts";
import { app, call as callExpr, each, ext, fn as fnExpr, fold as foldExpr, index as indexMove, iterate as iterateExpr, key as keyMove, let_, lit, offset as offsetMove, other as otherMove, origin as originMove, parent as parentMove, rec, ref, toPath, v, type Axis, type Expr, type FixedMove, type Move } from "./ir.ts";
import { cell as cellRef, SheetRun, type CellFormulas } from "./sheet.ts";
import { ok, toOptional, type Optional, type Result } from "./result.ts";
import type { Space } from "./space.ts";
import type { Trace } from "./trace.ts";
import { vexList, type VexList } from "./list.ts";
import { traversal, type Traversal } from "./traversal.ts";

// ---------------------------------------------------------------- argument tokens

declare const ARG_TYPE: unique symbol;
declare const CHAIN_VALUE: unique symbol;
declare const FN_RESULT: unique symbol;

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
  | (Lift extends true ? ([P] extends [DomainValue<DomainFor<Ctx["domains"], P>>] ? LiftedNumber<Ctx> : never) : never);

/**
 * A number argument for a domain parameter of an op with `liftScalar` (TYPE.LIFT): a number, a field with numbers, an
 * argument or a chain. The interpreter lifts each of them with `fromScalar` (CALL.LIFT).
 */
type LiftedNumber<Ctx extends ChainContext> = number | KeysOfType<Ctx["record"], number> | Arg<number> | ChainOf<Ctx, number>;

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
  /**
   * Navigation: later field references read at the key `k`. A chain of a text gives the key, and it evaluates at the
   * focus before the moves (NAV.COMPUTED).
   */
  to(k: Ctx["keys"] | ChainBase<Ctx, string>): ChainOf<Ctx, T>;
  /**
   * Navigation: later field references read at the key with this position in the key order. A chain of a number gives
   * the position, and it evaluates at the focus before the moves (NAV.COMPUTED).
   */
  index(i: number | ChainBase<Ctx, number>): ChainOf<Ctx, T>;
  /** Navigation: later field references read at a relative position in an array or a grid. */
  offset(...d: readonly number[]): ChainOf<Ctx, T>;
  /** Navigation: later field references read at the origin again. */
  origin(): ChainOf<Ctx, T>;
  /** Navigation: later field references read at the parent of the focus, in a tree space. A root gives `#REF!`. */
  parent(): ChainOf<Ctx, T>;
  /** This method uses `fallback` when the chain gives an error. */
  ifError<U>(fallback: ArgInput<U, Ctx, false> | T): ChainOf<Ctx, T | U>;
  /**
   * This method gives `then` when the boolean value is true, and `otherwise` when it is false (the form `if`). Only
   * the selected branch evaluates.
   */
  if<U, V>(this: ChainBase<Ctx, boolean>, then: ArgInput<U, Ctx, false>, otherwise: ArgInput<V, Ctx, false>): ChainOf<Ctx, U | V>;
  /**
   * This method applies the free function `name` of `withOptions`. The function gets the current value as its first
   * argument, then `args`. The types accept only the functions whose first parameter accepts the current value.
   */
  call<N extends CallableFns<Ctx, T>>(name: N, ...args: CallArgs<Ctx, N>): ChainOf<Ctx, CallReturn<Ctx, N>>;
  /** This method evaluates each branch with the current value, and gives a record of the results. */
  fork<const B extends Readonly<Record<string, (c: ChainOf<Ctx, T>) => ChainBase<Ctx, unknown>>>>(branches: B): ChainOf<Ctx, { readonly [N in keyof B]: ValueOf<ReturnType<B[N]>> }>;
  /**
   * This method makes up to `limit` steps (ITERATE.LIMIT). `init` gives the names and their first values, and `step`
   * gives the next values. A true `until` stops the steps (ITERATE.UNTIL). `result` gives the value of the chain. A
   * name with a list chain as its first value is a list chain (BUILD.LIST.LOOP), and a list result gives a list chain.
   */
  iterate<const I extends Readonly<Record<string, unknown>>, U>(
    limit: number,
    init: I,
    step: (vars: LoopVars<Ctx, I>) => NoInfer<LoopStep<Ctx, I>>,
    result: (vars: LoopVars<Ctx, I>) => ListChain<Ctx, U>,
    opts?: { readonly until?: (vars: LoopVars<Ctx, I>) => ArgInput<boolean, Ctx, false> },
  ): ListChain<Ctx, U>;
  iterate<const I extends Readonly<Record<string, unknown>>, R>(
    limit: number,
    init: I,
    step: (vars: LoopVars<Ctx, I>) => NoInfer<LoopStep<Ctx, I>>,
    result: (vars: LoopVars<Ctx, I>) => ArgInput<R, Ctx, false>,
    opts?: { readonly until?: (vars: LoopVars<Ctx, I>) => ArgInput<boolean, Ctx, false> },
  ): ChainOf<Ctx, R>;
  /** This method binds names for the body. The body gets a variable token for each name. */
  with<const B extends Readonly<Record<string, unknown>>, U>(
    binds: B,
    body: (c: ChainOf<Ctx, T>, vars: { readonly [N in keyof B]: Arg<ArgValue<Ctx, B[N]>> }) => ChainBase<Ctx, U>,
  ): ChainOf<Ctx, U>;
  /**
   * This method binds functions of `root.fn` (BUILD.FN) and gives the value of `body`. `call` gives a chain of a call of
   * each function. A function cannot call another function of the same `functions`, so it uses an outer one (FN.TOTAL).
   */
  functions<const F extends Readonly<Record<string, FnDef<readonly FnParamKind[], unknown>>>, U>(fns: F, body: (c: ChainOf<Ctx, T>, call: FnCalls<Ctx, F>) => ChainBase<Ctx, U>): ChainOf<Ctx, U>;
  /** The others axis: the body evaluates at each key except the focus. Its start value is the current value. */
  others<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The neighbors axis of a grid. */
  neighbors<U>(n: 4 | 8, body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The all axis inside the expression: the body evaluates at each key, with the current value as start value. */
  each<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The children axis of a tree space: the body evaluates at each child of the focus. */
  children<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The ancestors axis of a tree space: the parent first, the root last. */
  ancestors<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The descendants axis of a tree space: depth first, each parent before its children. */
  descendants<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The siblings axis of a tree space: the other children of the parent, or the other roots for a root. */
  siblings<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /**
   * The window axis of an array space or a tree space: the keys at the offsets from `from` to `to` of the focus, in
   * order. The offset 0 is the focus. An offset outside the space has no target.
   */
  window<U>(from: number, to: number, body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /**
   * The table axis: the body evaluates at each key of the table `name` of the evaluation, in the space of that table.
   * The body reads the fields of that table, but the types of the chain are the types of this space.
   */
  table<U>(name: string, body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The successors axis of a graph space: the ends of the edges from the focus. In a tree space, the children. */
  successors<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The predecessors axis of a graph space: the keys with an edge to the focus. In a tree space, the parent. */
  predecessors<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
  /** The reachable axis of a graph space: each key that a path of edges reaches, in breadth-first order. */
  reachable<U>(body: (c: ChainOf<Ctx, T>) => AxisBody<Ctx, U>, opts?: AxisOpts<Ctx, T>): ListChain<Ctx, U>;
}

/** The options of an axis. */
export interface AxisOpts<Ctx extends ChainContext, T> {
  /** A test at each target. The body evaluates only at the targets where the test gives `true`. */
  readonly where?: (c: ChainOf<Ctx, T>) => ChainBase<Ctx, boolean>;
  /** With `true`, the targets come in the reverse order (AXIS.REVERSE). The axis table has no reverse order. */
  readonly reverse?: boolean;
}

/** A function of the builder in its implementation: the kinds of its parameters, and the function that gives its body. */
interface FnDefImpl {
  readonly kind: "vex.fn";
  readonly params: readonly string[];
  readonly build: (...params: ChainImpl[]) => { readonly program: Expr };
}

/** The options of an axis in the implementation of the builder. */
type AxisOptsImpl = { readonly where?: (c: ChainImpl) => { readonly program: Expr }; readonly reverse?: boolean };

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

/** The type of a value of a name of a loop: a literal of `init` gives its primitive type. */
type LoopValue<Ctx extends ChainContext, A> = ArgValue<Ctx, A> extends infer T ? (T extends number ? number : T extends string ? string : T extends boolean ? boolean : T) : never;

/** The type of the items of a list chain, or `never` for another value. */
type ItemsOf<A> = A extends { readonly kind: "vex.list-chain"; readonly [CHAIN_VALUE]?: VexList<infer U> } ? U : never;

/** A value of `init` that is a list chain: then the name of the loop holds a list (LOOP.LIST). */
type IsList<A> = A extends { readonly kind: "vex.list-chain" } ? true : false;

/**
 * The chain of a name of a loop: a list chain for a list chain of `init` (BUILD.LIST.LOOP), and else a chain of its
 * value.
 */
export type LoopVar<Ctx extends ChainContext, A> = IsList<A> extends true ? ListChain<Ctx, ItemsOf<A>> : ChainOf<Ctx, LoopValue<Ctx, A>>;

/** The names of a loop of the builder: a chain of the value of each name of `init` (LOOP.NAMES). */
export type LoopVars<Ctx extends ChainContext, I> = { readonly [N in keyof I]: LoopVar<Ctx, I[N]> };

/** The next value of a name of a loop. A name of a list takes a list chain with items of the same type. */
export type LoopNext<Ctx extends ChainContext, A> = IsList<A> extends true ? ListChain<Ctx, ItemsOf<A>> : ArgInput<LoopValue<Ctx, A>, Ctx, false>;

/** The next values of a step of a loop: a value for some of the names of `init`. */
export type LoopStep<Ctx extends ChainContext, I> = { readonly [N in keyof I]?: LoopNext<Ctx, I[N]> };

/** The kind of a parameter of a function of the builder (BUILD.FN): a primitive type, or `any`. */
export type FnParamKind = PrimitiveKind | "any";

/** The type of a value of a kind of a parameter. */
export type KindValue<K> = K extends "number" ? number : K extends "string" ? string : K extends "boolean" ? boolean : unknown;

/** A chain of each parameter of a function of the builder. */
export type ParamChains<Ctx extends ChainContext, P extends readonly FnParamKind[]> = { readonly [I in keyof P]: ChainOf<Ctx, KindValue<P[I]>> };

/** A function of the builder (BUILD.FN): the kinds of its parameters and its body. `functions` binds it. */
export interface FnDef<P extends readonly FnParamKind[], R> {
  readonly kind: "vex.fn";
  readonly params: P;
  /** This phantom member carries the type of the result. It is not present at run time. */
  readonly [FN_RESULT]?: R;
}

/** The calls of the functions of `functions`: each gives a chain of a call (FN.CALL). */
export type FnCalls<Ctx extends ChainContext, F> = {
  readonly [N in keyof F]: F[N] extends FnDef<infer P, infer R> ? (...args: { readonly [I in keyof P]: ArgInput<KindValue<P[I]>, Ctx, false> }) => ChainOf<Ctx, R> : never;
};

/**
 * The value of the body of an axis: a chain, or a list chain (BUILD.LIST.BUILD). For a list chain, the value of each
 * item of the axis is a list, so `flat` joins the lists.
 */
export type AxisBody<Ctx extends ChainContext, U> = ChainBase<Ctx, U> | ListBody<U>;

/** A list chain as the body of an axis. Its phantom member carries the list. */
export interface ListBody<U> {
  readonly kind: "vex.list-chain";
  readonly [CHAIN_VALUE]?: U;
  readonly program: Expr;
}

/** A chain whose value is a list: the result of an axis, of a list op or of a list literal. */
export interface ListChain<Ctx extends ChainContext, U> {
  readonly kind: "vex.list-chain";
  /** This phantom member carries the type of the list. It is not present at run time. */
  readonly [CHAIN_VALUE]?: VexList<U>;
  /** The expression of the chain, as plain data. */
  readonly program: Expr;
  /**
   * This method folds the items in the order of the axis (FOLD.ORDER). `init` gives the names and their first values.
   * `step` gives the next values from the names and the item, a chain at the target. `result` gives the value.
   */
  fold<const I extends Readonly<Record<string, unknown>>, V>(
    init: I,
    step: (vars: LoopVars<Ctx, I>, item: ChainOf<Ctx, U>) => NoInfer<LoopStep<Ctx, I>>,
    result: (vars: LoopVars<Ctx, I>) => ListChain<Ctx, V>,
  ): ListChain<Ctx, V>;
  fold<const I extends Readonly<Record<string, unknown>>, R>(
    init: I,
    step: (vars: LoopVars<Ctx, I>, item: ChainOf<Ctx, U>) => NoInfer<LoopStep<Ctx, I>>,
    result: (vars: LoopVars<Ctx, I>) => ArgInput<R, Ctx, false>,
  ): ChainOf<Ctx, R>;
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
  reduce(op: OpNames<DomainFor<Ctx["domains"], U>>, opts?: ReduceOpts<Ctx>): ChainOf<Ctx, U>;
  /** The items in the order of their values, from the smallest (LIST.SORT). The values are numbers or texts of one kind. */
  sortBy(opts?: ListOpts): ListChain<Ctx, U>;
  /** The first `n` items (LIST.TAKE). */
  take(n: number, opts?: ListOpts): ListChain<Ctx, U>;
  /** The value of the item at the position `i`, from 0 (LIST.NTH). */
  nth(i: number, opts?: ListOpts): ChainOf<Ctx, U>;
  /**
   * The value of the first item with the key `k` (LIST.GET). A chain of a text gives the key, and it evaluates at the
   * focus. A key that no item has gives `#N/A`. Thus a step reads the old value of each key.
   */
  get(k: Ctx["keys"] | ChainBase<Ctx, string>, opts?: ListOpts): ChainOf<Ctx, U>;
  /** The items after the first `n` items (LIST.DROP). Thus `drop(1)` removes the first item of a stack. */
  drop(n: number, opts?: ListOpts): ListChain<Ctx, U>;
  /** The items of this list, and then the items of `other` (LIST.APPEND). Two items can have the same key. */
  append<V>(other: ListChain<Ctx, V>, opts?: ListOpts): ListChain<Ctx, U | V>;
  /** The items of this list whose key is not the key of an item of `other` (LIST.WITHOUT). */
  without<V>(other: ListChain<Ctx, V>, opts?: ListOpts): ListChain<Ctx, U>;
  /** The items of the lists that are the values of the items, in order (LIST.FLAT). The values must be lists. */
  flat<V>(this: ListChain<Ctx, VexList<V>>, opts?: ListOpts): ListChain<Ctx, V>;
  /**
   * The axis list (AXIS.LIST): the body evaluates at the key of each item, in the order of the list. The body reads the
   * fields of the record of the item. The chain of the body has no value of its own.
   */
  each<V>(body: (c: ChainOf<Ctx, null>) => AxisBody<Ctx, V>, opts?: AxisOpts<Ctx, null>): ListChain<Ctx, V>;
  /** The list at the origin `k`: one item for each target of the axis, with its key and its result. */
  result(k: Ctx["keys"]): Result<VexList<U>>;
  /** The list at the origin `k`, as an `Optional`. */
  at(k: Ctx["keys"]): Optional<VexList<U>>;
  /** The trace of the evaluation of the list at the origin `k`. */
  explain(k: Ctx["keys"]): Trace;
}

/** The options of a list reduction. */
export interface ListOpts {
  /** With `true`, an error item makes the result that error. The default skips error items. */
  readonly strict?: boolean;
}

/** The options of `reduce`. `domain` names the domain whose identity an empty list gives (LIST.EMPTY). */
export interface ReduceOpts<Ctx extends ChainContext> extends ListOpts {
  readonly domain?: Ctx["domains"][number]["name"];
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
   * This method makes a list literal (LIST.LITERAL, BUILD.LIST.LOOP): an item for each pair of a key and a value, in
   * order. Without pairs, it gives the empty list. Thus a loop can start a stack or a seen set.
   */
  list<U = unknown>(items?: readonly (readonly [Ctx["keys"], U])[]): ListChain<Ctx, U>;
  /**
   * This method makes an extension argument: the node `ext(kind, data)`. The handler of `kind` in the options of
   * `withOptions` gives its value. The caller gives the type `T` of that value.
   */
  ext<T>(kind: string, data?: unknown): Arg<T>;
  /** This method starts a sheet over the space: named columns of formulas. Refer to `Sheet`. */
  sheet(): Sheet<Ctx, object>;
  /**
   * This method makes a function (BUILD.FN) with the kinds of its parameters. The body gets a chain of each parameter,
   * and it evaluates at the focus of each call. The method `functions` of a chain binds the function.
   */
  fn<const P extends readonly FnParamKind[], R>(params: P, body: (...params: ParamChains<Ctx, P>) => ChainBase<Ctx, R>): FnDef<P, R>;
  /** The space of the root. */
  readonly space: Space<Ctx["keys"], Ctx["record"]>;
}

/** The root of a column formula: the root of the builder, and references to the cells of the sheet. */
export interface SheetRoot<Ctx extends ChainContext, Cols> extends Root<Ctx> {
  /**
   * This method makes a cell reference: the column `column` at the key `at`, or at the address `at` from the focus.
   * The address has only fixed moves. Without `at`, it reads at the focus. The type is the type of a column before
   * this one.
   */
  cell<N extends keyof Cols & string>(column: N, at?: Ctx["keys"] | readonly FixedMove[]): Arg<Cols[N]>;
  /** This method makes a cell reference to any column, also this column or a later one. The caller gives the type. */
  cell<T>(column: string, at?: Ctx["keys"] | readonly FixedMove[]): Arg<T>;
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
  /**
   * This method gives a new sheet in which the cell of the column `column` at the key `k` has its own formula. That
   * formula replaces the formula of the column at the key `k`. It must give a value of the type of the column.
   */
  cellFormula<const N extends keyof (Cols & Decl) & string>(
    k: Ctx["keys"],
    column: N,
    formula: (r: SheetRoot<Ctx, Cols & Decl>) => ChainBase<Ctx, (Cols & Decl)[N]>,
  ): Sheet<Ctx, Cols, Decl>;
  /** The program of each column. */
  readonly columns: Readonly<Record<string, Expr>>;
  /** The program of each cell with its own formula, by column and then by key. */
  readonly cellFormulas: Readonly<Record<string, Readonly<Record<string, Expr>>>>;
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

/** This function gives the expression of the list of `append` and `without`. The list is a chain, not a literal. */
function listProgram(op: string, other: unknown): Expr {
  if (!isChainLike(other)) throw new TypeError(`${op} needs a list chain`);
  return other.program;
}

/** This function turns a builder argument into an expression. A bare string is a field reference at `addr`. */
function toExpr(a: unknown, addr: readonly Move[]): Expr {
  if (typeof a === "string") return ref(toPath(a), addr);
  if (isArg(a)) return a.expr;
  if (isChainLike(a)) return a.program;
  return lit(a);
}

/** This function gives the expressions of a step of a loop, with the unique names of the loop. */
function stepExprs(step: Readonly<Record<string, unknown>>, unique: ReadonlyMap<string, string>, addr: readonly Move[]): Readonly<Record<string, Expr>> {
  const out: Record<string, Expr> = {};
  for (const [n, a] of Object.entries(step)) {
    const name = unique.get(n);
    if (name === undefined) throw new TypeError(`the name "${n}" of the step is not a name of init`);
    out[name] = toExpr(a, addr);
  }
  return out;
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
    return evalOptions(this.#s, k);
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
  to(k: string | { readonly program: Expr }): ChainImpl {
    return this.#move(keyMove(typeof k === "string" ? k : k.program));
  }
  index(i: number | { readonly program: Expr }): ChainImpl {
    return this.#move(indexMove(typeof i === "number" ? i : i.program));
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
  if(then: unknown, otherwise: unknown): ChainImpl {
    return new ChainImpl({ ...this.#s, expr: app("if", this.#s.expr, toExpr(then, this.#s.addr), toExpr(otherwise, this.#s.addr)) });
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
    // Object.fromEntries gives an own field for each name, also for "__proto__" (V-062).
    const fields = Object.fromEntries(Object.entries(branches).map(([n, f]) => [n, f(start).program]));
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

  functions(fns: Readonly<Record<string, FnDefImpl>>, body: (c: ChainImpl, call: Readonly<Record<string, (...args: readonly unknown[]) => ChainImpl>>) => { readonly program: Expr }): ChainImpl {
    const depth = this.#s.depth;
    const binds: Record<string, Expr> = {};
    const calls: Record<string, (...args: readonly unknown[]) => ChainImpl> = {};
    for (const [n, def] of Object.entries(fns)) {
      if ((def as { readonly kind?: unknown }).kind !== "vex.fn") throw new TypeError(`the function "${n}" is not a function of root.fn`);
      const unique = `${n}$${depth}`;
      const params = def.params.map((_k, i) => `${unique}$${i}`);
      // A parameter is a chain at the focus of the call, so a field of the body reads at the call.
      const chains = params.map((p) => new ChainImpl({ ...this.#s, expr: v(p), addr: [], depth: depth + 1 }));
      binds[unique] = fnExpr(params, def.build(...chains).program);
      calls[n] = (...args) => new ChainImpl({ ...this.#s, expr: callExpr(unique, ...args.map((a) => toExpr(a, []))), addr: [], depth: depth + 1 });
    }
    const inner = body(new ChainImpl({ ...this.#s, depth: depth + 1 }), calls);
    return new ChainImpl({ ...this.#s, expr: let_(binds, inner.program) });
  }

  /**
   * This method gives the names of a loop. Each name of `init` gets a name that is unique at the depth of the chain.
   * It also gets its first value at the address of the chain, and a chain of its value.
   */
  loopNames(init: Readonly<Record<string, unknown>>): { readonly unique: ReadonlyMap<string, string>; readonly first: Readonly<Record<string, Expr>>; readonly vars: Readonly<Record<string, ChainImpl | ListChainImpl>> } {
    const depth = this.#s.depth;
    const unique = new Map<string, string>();
    const first: Record<string, Expr> = {};
    const vars: Record<string, ChainImpl | ListChainImpl> = {};
    for (const [n, a] of Object.entries(init)) {
      const name = `${n}$${depth}`;
      unique.set(n, name);
      first[name] = toExpr(a, this.#s.addr);
      // A name of a list is a list chain, so a step can use the list ops on it (BUILD.LIST.LOOP).
      const s: State = { ...this.#s, expr: v(name), addr: [], depth: depth + 1 };
      vars[n] = kindOf(a) === "vex.list-chain" ? new ListChainImpl(s) : new ChainImpl(s);
    }
    return { unique, first, vars };
  }

  iterate(
    limit: number,
    init: Readonly<Record<string, unknown>>,
    step: (vars: Readonly<Record<string, ChainImpl | ListChainImpl>>) => Readonly<Record<string, unknown>>,
    result: (vars: Readonly<Record<string, ChainImpl | ListChainImpl>>) => unknown,
    opts?: { readonly until?: (vars: Readonly<Record<string, ChainImpl | ListChainImpl>>) => unknown },
  ): ChainImpl | ListChainImpl {
    const { unique, first, vars } = this.loopNames(init);
    const next = stepExprs(step(vars), unique, this.#s.addr);
    const until = opts?.until === undefined ? undefined : toExpr(opts.until(vars), this.#s.addr);
    const r = result(vars);
    return chainOf({ ...this.#s, expr: iterateExpr(limit, first, next, toExpr(r, this.#s.addr), until) }, r);
  }

  #axis(a: Axis, body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    const { name, start } = this.#bound();
    // Inside the axis, the focus is the target, so the address of the body starts empty.
    const inTarget = new ChainImpl({ ...start.#s, addr: [] });
    const inner = body(inTarget);
    const ordered: Axis = opts?.reverse === true ? { t: "reverse", axis: a } : a;
    const axis: Axis = opts?.where === undefined ? ordered : { t: "where", axis: ordered, test: opts.where(inTarget).program };
    // The moves before the axis are its address: parent().children(f) gives f at each child of the parent.
    return new ListChainImpl({ ...this.#s, expr: let_({ [name]: this.#s.expr }, each(axis, inner.program, this.#s.addr)) });
  }
  others(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "others" }, body, opts);
  }
  neighbors(n: 4 | 8, body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "neighbors", n }, body, opts);
  }
  each(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "all" }, body, opts);
  }
  children(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "children" }, body, opts);
  }
  ancestors(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "ancestors" }, body, opts);
  }
  descendants(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "descendants" }, body, opts);
  }
  siblings(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "siblings" }, body, opts);
  }
  window(from: number, to: number, body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "window", from, to }, body, opts);
  }
  table(name: string, body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "table", name }, body, opts);
  }
  successors(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "successors" }, body, opts);
  }
  predecessors(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "predecessors" }, body, opts);
  }
  reachable(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    return this.#axis({ t: "reachable" }, body, opts);
  }
}

/** This function gives the chain of a loop: a list chain when its result is a list chain (BUILD.LIST.LOOP). */
const chainOf = (s: State, result: unknown): ChainImpl | ListChainImpl => (kindOf(result) === "vex.list-chain" ? new ListChainImpl(s) : new ChainImpl(s));

/** This function gives the options of an evaluation of a chain or a list chain at the origin `k`. */
function evalOptions(s: State, k: string): EvalOptions {
  const { env } = s;
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

class ListChainImpl {
  readonly kind = "vex.list-chain" as const;
  readonly #s: State;
  constructor(s: State) {
    this.#s = s;
  }
  get program(): Expr {
    return this.#s.expr;
  }
  fold(
    init: Readonly<Record<string, unknown>>,
    step: (vars: Readonly<Record<string, ChainImpl | ListChainImpl>>, item: ChainImpl) => Readonly<Record<string, unknown>>,
    result: (vars: Readonly<Record<string, ChainImpl | ListChainImpl>>) => unknown,
  ): ChainImpl | ListChainImpl {
    // The list of an axis is a let of the start value around the axis, and the list of `each` of a list is the axis
    // alone. The fold keeps the let, and the body of the axis is the item of each step.
    const e = this.#s.expr;
    const loop = e.tag === "let" ? e.body : e;
    if (loop.tag !== "each") throw new TypeError("fold needs the list of an axis: go over the items of the list with each first");
    const names = new ChainImpl({ ...this.#s, expr: lit(null) }).loopNames(init);
    const item = new ChainImpl({ ...this.#s, expr: loop.body, addr: [] });
    const next = stepExprs(step(names.vars, item), names.unique, []);
    const r = result(names.vars);
    const folded = foldExpr(loop.axis, names.first, next, toExpr(r, this.#s.addr), loop.at);
    return chainOf({ ...this.#s, expr: e.tag === "let" ? let_(e.bind, folded) : folded }, r);
  }

  #op(op: string, extra: readonly Expr[], opts?: ListOpts & { readonly domain?: string }): ChainImpl {
    const options = { ...(opts?.strict === true ? { strict: true } : {}), ...(opts?.domain === undefined ? {} : { domain: opts.domain }) };
    const args = Object.keys(options).length > 0 ? [...extra, lit(options)] : extra;
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
  reduce(op: string, opts?: ListOpts & { readonly domain?: string }): ChainImpl {
    return this.#op("reduce", [lit(op)], opts);
  }
  #list(op: string, extra: readonly Expr[], opts?: ListOpts): ListChainImpl {
    return new ListChainImpl({ ...this.#s, expr: this.#op(op, extra, opts).program });
  }
  sortBy(opts?: ListOpts): ListChainImpl {
    return this.#list("sortBy", [], opts);
  }
  take(n: number, opts?: ListOpts): ListChainImpl {
    return this.#list("take", [lit(n)], opts);
  }
  nth(i: number, opts?: ListOpts): ChainImpl {
    return this.#op("nth", [lit(i)], opts);
  }
  get(k: string | { readonly program: Expr }, opts?: ListOpts): ChainImpl {
    // A text is a key, not a field reference, as for the move to(k).
    return this.#op("get", [typeof k === "string" ? lit(k) : k.program], opts);
  }
  drop(n: number, opts?: ListOpts): ListChainImpl {
    return this.#list("drop", [lit(n)], opts);
  }
  append(other: unknown, opts?: ListOpts): ListChainImpl {
    return this.#list("append", [listProgram("append", other)], opts);
  }
  without(other: unknown, opts?: ListOpts): ListChainImpl {
    return this.#list("without", [listProgram("without", other)], opts);
  }
  flat(opts?: ListOpts): ListChainImpl {
    return this.#list("flat", [], opts);
  }
  each(body: (c: ChainImpl) => { readonly program: Expr }, opts?: AxisOptsImpl): ListChainImpl {
    // The chain of the body is at the key of the item, and it has no value of its own.
    const start = new ChainImpl({ ...this.#s, expr: lit(null), addr: [], depth: this.#s.depth + 1 });
    const list: Axis = { t: "list", list: this.#s.expr };
    const ordered: Axis = opts?.reverse === true ? { t: "reverse", axis: list } : list;
    const axis: Axis = opts?.where === undefined ? ordered : { t: "where", axis: ordered, test: opts.where(start).program };
    return new ListChainImpl({ ...this.#s, expr: each(axis, body(start).program) });
  }
  result(k: string): Result<unknown> {
    return evaluate(this.#s.expr, evalOptions(this.#s, k));
  }
  at(k: string): Optional<unknown> {
    return toOptional(this.result(k));
  }
  explain(k: string): Trace {
    return explain(this.#s.expr, evalOptions(this.#s, k));
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
  fn(params: readonly string[], build: (...params: ChainImpl[]) => { readonly program: Expr }): FnDefImpl {
    return { kind: "vex.fn", params, build };
  }
  rec(fields: Readonly<Record<string, unknown>>): Arg<unknown> {
    return argToken(rec(Object.fromEntries(Object.entries(fields).map(([n, a]) => [n, toExpr(a, [])]))));
  }
  list(items: readonly (readonly [string, unknown])[] = []): ListChainImpl {
    // LIST.LITERAL: a literal of the list, with a value for each item.
    return new ListChainImpl({ env: this.#env, expr: lit(vexList(items.map(([key, value]) => ({ key, result: ok(value) })))), addr: [], depth: 0 });
  }
}

class SheetRootImpl extends RootImpl {
  cell(column: string, at?: string | readonly FixedMove[]): Arg<unknown> {
    return argToken(cellRef(column, typeof at === "string" ? [keyMove(at)] : at));
  }
}

class SheetImpl {
  readonly #env: Env;
  readonly #columns: ReadonlyMap<string, Expr>;
  readonly #cells: CellFormulas;
  constructor(env: Env, columns: ReadonlyMap<string, Expr>, cells: CellFormulas = new Map()) {
    this.#env = env;
    this.#columns = columns;
    this.#cells = cells;
  }
  get columns(): Readonly<Record<string, Expr>> {
    return Object.freeze(Object.fromEntries(this.#columns));
  }
  get cellFormulas(): Readonly<Record<string, Readonly<Record<string, Expr>>>> {
    return Object.freeze(Object.fromEntries([...this.#cells].map(([c, keys]) => [c, Object.freeze(Object.fromEntries(keys))])));
  }
  declare(): SheetImpl {
    return this;
  }
  column(name: string, formula: (r: SheetRootImpl) => { readonly program: Expr }): SheetImpl {
    const program = formula(new SheetRootImpl(this.#env)).program;
    return new SheetImpl(this.#env, new Map([...this.#columns, [name, program]]), this.#cells);
  }
  cellFormula(k: string, column: string, formula: (r: SheetRootImpl) => { readonly program: Expr }): SheetImpl {
    const program = formula(new SheetRootImpl(this.#env)).program;
    const keys = new Map([...(this.#cells.get(column) ?? []), [k, program]]);
    return new SheetImpl(this.#env, this.#columns, new Map([...this.#cells, [column, keys]]));
  }
  #run(): SheetRun {
    const { space: s, domains, options } = this.#env;
    return new SheetRun(this.#columns, {
      space: s,
      domains,
      cells: this.#cells,
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
    // The table reads each cell, so a fill evaluates them in the order of their reads first (SHEET.FILL).
    run.fill();
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

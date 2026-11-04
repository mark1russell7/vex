/**
 * Domains. A domain tells which values belong to it and which ops it has. The domain object owns this data.
 * Vex does not write to the prototypes of domain classes, and an import has no side effects.
 */

/** An algebraic law that an op claims. `@mark1russell7/vex-testkit` checks each claim with property tests. */
export type Law = "commutative" | "associative" | "idempotent";

/** The kind of a parameter. The interpreter checks the arguments of an op that declares its parameters. */
export type ParamKind = "domain" | "number" | "boolean" | "string" | "any";

/**
 * The kind of the result of an op. It is a kind of a parameter, or `domain:Name` for a value of the domain `Name`. It is
 * `list:Kind` for a `vex.list` with items of a primitive type.
 */
export type ReturnKind = ParamKind | `domain:${string}` | `list:${PrimitiveKind}`;

/**
 * How the size of one argument adds to the size of the result of an op (LOOP.SIZE.OPS). The size of a value counts the
 * texts, the fields, the keys and the items in it.
 *
 * - `0`: the argument does not add to the size.
 * - `1`: the size of the argument adds one time.
 * - `"scaled"`: the size of the argument adds a fixed number of times, for example two times.
 * - `"many"`: the size of the argument adds more than one time.
 * - `"unbounded"`: the size of the result has no bound in the size of the argument.
 * - `"text"`: the size adds one time for a text, and a fixed number of times for another value, as its JSON text.
 * - `"copies"`: the size adds one time for each copy. The first argument is the number of the copies.
 * - `"each"`: the size adds one time for each item of the first argument.
 * - `"number"`: the argument is a number that sets a count. A literal number gives that count, and another number
 *   gives a fixed bound.
 */
export type SizeUse = 0 | 1 | "scaled" | "many" | "unbounded" | "text" | "copies" | "each" | "number";

/**
 * A measure of a value for the check of sizes (LOOP.SIZE.OPS). `size` is the size of the value, and `count` is the
 * number of its items. `inner` is the sum of the counts of the values of its items. `item` is the size of its largest
 * item.
 */
export type SizeMeasure = "size" | "count" | "inner" | "item";

/** One term of a size rule: a use of the same measure of the argument, or a use of the measure that the pair names. */
export type SizeTerm = SizeUse | readonly [use: SizeUse, of: SizeMeasure];

/**
 * The size rule of an op: how the measures of its result follow from its arguments (LOOP.SIZE.OPS). The check of sizes
 * reads it in the steps of `fold` and `iterate` (LOOP.SIZE).
 *
 * - `"scalar"`: the result is a number or a boolean.
 * - `"fixed"`: the result has a size with a fixed bound, for example a 2D vector.
 * - `"reduce"`: the rule of the list op `reduce`. The op that its second argument names gives the size.
 * - A record: `size`, `count`, `inner` and `item` have one term for each argument. `rest` is the use of the arguments
 *   after them, and its default is `"many"`. Without `count`, `inner` or `item`, that measure of the result is its size.
 *   The terms of `item` give the largest bound of the arguments, because the largest item comes from one argument. A literal
 *   number at the position `limit` sets the count. With `keys: "position"`, the items get their positions as new keys.
 *   With `constant: true`, the result can also hold a part with a fixed size. With `union: true`, the result holds
 *   each key of its arguments one time, so the bound of the result is the largest bound of the arguments.
 */
export type SizeRule =
  | "scalar"
  | "fixed"
  | "reduce"
  | {
      readonly size: readonly SizeTerm[];
      readonly count?: readonly SizeTerm[];
      readonly inner?: readonly SizeTerm[];
      readonly item?: readonly SizeTerm[];
      readonly rest?: SizeUse;
      readonly limit?: number;
      readonly keys?: "position";
      readonly constant?: true;
      readonly union?: true;
    };

/** The description of one op of a domain. */
export interface OpSpec<D = never> {
  /**
   * The implementation, for an op that is not a method of the value (static-land style). The first argument
   * is the receiver. Without `fn`, the interpreter calls the method of the receiver with the same name.
   */
  readonly fn?: (self: D, ...args: never[]) => unknown;
  /** The laws that the op claims. */
  readonly laws?: readonly Law[];
  /** The identity element of the op, for reductions over an empty list. */
  readonly identity?: () => D;
  /** Scalar lifting: `true` lifts each number argument with `fromScalar`. An array sets it for each argument. */
  readonly liftScalar?: boolean | readonly boolean[];
  /** The kinds of the parameters after the receiver. When set, the interpreter checks the arguments. */
  readonly params?: readonly ParamKind[];
  /**
   * The kind of the result. It is `domain` for a value of this domain, or `domain:Name` for a value of the domain `Name`.
   * It is `list:Kind` for a `vex.list` with items of that primitive type (KIND.RETURNS.LIST). A compiler reads it to know
   * the kinds of the values of a program (KIND.RETURNS). The interpreter does not check it, and the law checker of the
   * test kit does.
   */
  readonly returns?: ReturnKind;
  /**
   * The size rule of the op (LOOP.SIZE.OPS). Without it, an op whose result is a number or a boolean has the rule
   * `"scalar"`. An op of a domain with `size: "fixed"` has the rule `"fixed"`. Another op has no rule, so a step of a
   * loop cannot use its result in the size of a list name (LOOP.SIZE).
   */
  readonly size?: SizeRule;
  /**
   * This field gives the direction of the result of the op for each argument, with the receiver first (FIX.OPS). `up`
   * means that the result does not fall as the argument rises. `down` means that the result does not rise. An op without
   * it cannot take a value that reads `last`, and an argument without a direction must not read `last`.
   */
  readonly monotone?: readonly Monotone[];
}

/** A direction of an op: the result follows the argument (`up`) or moves against it (`down`). */
export type Monotone = "up" | "down";

/** A JavaScript type of primitive values that a domain can accept. */
export type PrimitiveKind = "number" | "string" | "boolean";

/** This function gives the kind of the items of a result of the kind `list:Kind`, or `undefined` for another kind. */
export const listItemKind = (r: ReturnKind | undefined): PrimitiveKind | undefined => (r?.startsWith("list:") === true ? (r.slice("list:".length) as PrimitiveKind) : undefined);

/** The type of an op that lifts number arguments. Use it to type the ops of a domain under `isolatedDeclarations`. */
export type LiftedOp<D> = OpSpec<D> & { readonly liftScalar: true };

/** The type of an op with an implementation function `F`. */
export type FnOp<D, F extends (self: D, ...args: never[]) => unknown> = OpSpec<D> & { readonly fn: F };

/**
 * The type of an op table: each name in `Names` is an op, and each name in `Lifted` lifts number arguments.
 * Use it to type the ops of a domain under `isolatedDeclarations`.
 */
export type OpTable<D, Names extends string, Lifted extends string = never> = {
  readonly [N in Names]: N extends Lifted ? LiftedOp<D> : OpSpec<D>;
};

/** The description of a domain, as a caller gives it to `defineDomain`. */
export interface DomainSpec<Name extends string, D, Ops extends Readonly<Record<string, OpSpec<D>>>> {
  /** The name of the domain. */
  readonly name: Name;
  /** The runtime test for the values of the domain. It must not give false positives. */
  readonly is: (u: unknown) => u is D;
  /**
   * The JavaScript type of the values of the domain, if `is` accepts each value of that type and no other value
   * (KIND.PRIMITIVE). A compiler then finds the op of such a value before a run.
   */
  readonly primitive?: PrimitiveKind;
  /**
   * The field names of a value, if `is` accepts only plain objects with exactly these fields (KIND.FIELDS). Two domains
   * with different names have no common value, so a compiler finds the domain of such a value before a run.
   */
  readonly fields?: readonly string[];
  /** The ops of the domain, with their metadata. */
  readonly ops: Ops;
  /**
   * With `"fixed"`, each value of the domain has a size with a fixed bound, for example a 2D vector. Then each op of the
   * domain has the size rule `"fixed"` or `"scalar"`, unless the op has its own rule (LOOP.SIZE.OPS).
   */
  readonly size?: "fixed";
  /** With `"all"`, each method of a value is an op, also without an entry in `ops`. The default is `"declared"`. */
  readonly methods?: "declared" | "all";
  /** The scalar lift: it makes a domain value from a number. */
  readonly fromScalar?: (n: number) => D;
  /** A check of the values that ops give. A value that fails the check gives the error `#NUM!`. */
  readonly valid?: (d: D) => boolean;
  /** A short text for a value, for traces and the site. */
  readonly show?: (d: D) => string;
  /** The JSON form of a value, for literals in serialized programs. */
  readonly encode?: (d: D) => unknown;
  /** The value of a JSON form that `encode` made. */
  readonly decode?: (json: unknown) => D;
  /**
   * Some values of the domain. A compiler gives them to an op and to its copy in a module: the two must give the same
   * results (KIND.DOMAIN).
   */
  readonly samples?: () => readonly D[];
}

/** A domain. Make one with `defineDomain`. */
export interface Domain<Name extends string = string, D = unknown, Ops extends Readonly<Record<string, OpSpec<D>>> = Readonly<Record<string, OpSpec<D>>>>
  extends DomainSpec<Name, D, Ops> {
  readonly kind: "vex.domain";
}

/** A domain with any value type. The interpreter uses this type. */
// oxlint-disable-next-line typescript/no-explicit-any -- a list of domains with different value types needs `any`: `fn` is contravariant in the value type.
export type AnyDomain = Domain<string, any, Readonly<Record<string, OpSpec<any>>>>;

/** This function makes a domain. The result is frozen. */
export function defineDomain<const Name extends string, D, const Ops extends Readonly<Record<string, OpSpec<D>>>>(
  spec: DomainSpec<Name, D, Ops>,
): Domain<Name, D, Ops> {
  return Object.freeze({ ...spec, kind: "vex.domain" as const });
}

const FORBIDDEN = new Set(["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

/** This function tells if a name can be an op name. */
export const isOpName = (name: string): boolean => name.length > 0 && !FORBIDDEN.has(name);

/**
 * This function finds a method on a value: an own function property, or a function on the prototype chain.
 * It stops at `Object.prototype` and `Function.prototype`, so inherited members (for example `toString`) are not ops.
 */
export function findMethod(self: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if (!isOpName(name)) return undefined;
  // A primitive has no own methods. The loop below stops at null, so null needs no test here.
  if (typeof self !== "object" && typeof self !== "function") return undefined;
  let o: object | null = self;
  while (o !== null && o !== Object.prototype && o !== Function.prototype) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d !== undefined) {
      return typeof d.value === "function" ? (d.value as (...args: unknown[]) => unknown) : undefined;
    }
    o = Object.getPrototypeOf(o) as object | null;
  }
  return undefined;
}

/** An op that the interpreter found for a receiver. */
export interface ResolvedOp {
  readonly domain: AnyDomain;
  readonly spec: OpSpec<unknown>;
  readonly call: (args: readonly unknown[]) => unknown;
}

const EMPTY_SPEC: OpSpec<unknown> = Object.freeze({});

/** This function finds the op `name` for `self` in one domain. It gives `undefined` if the domain does not have it. */
export function resolveOp(domain: AnyDomain, self: unknown, name: string): ResolvedOp | undefined {
  if (!isOpName(name)) return undefined;
  const declared = Object.hasOwn(domain.ops, name) ? (domain.ops[name] as OpSpec<unknown>) : undefined;
  if (declared?.fn !== undefined) {
    const fn = declared.fn as (self: unknown, ...args: unknown[]) => unknown;
    return { domain, spec: declared, call: (args) => fn(self, ...args) };
  }
  if (declared === undefined && domain.methods !== "all") return undefined;
  const method = findMethod(self, name);
  if (method === undefined) return undefined;
  return { domain, spec: declared ?? EMPTY_SPEC, call: (args) => method.apply(self, [...args]) };
}

/** This function gives the domain of a value: the first domain whose `is` accepts it. */
export function domainOf(domains: readonly AnyDomain[], value: unknown): AnyDomain | undefined {
  return domains.find((d) => d.is(value));
}

/** This function tells if the `liftScalar` setting lifts the argument at `index`. */
export const liftsAt = (lift: OpSpec<unknown>["liftScalar"], index: number): boolean =>
  lift === true || (Array.isArray(lift) && lift[index] === true);

/**
 * The facts of the options that the printer uses (docs/COMPILER.md §13.2). For each op site, they give the domain
 * whose op the interpreter takes first, and the kinds and the lifts of its parameters. The facts come from the op
 * tables, so the same options always give the same facts, and the same source.
 */
import { isListOp, isOpName, liftsAt, listItemKind, type AnyDomain, type ExtHandler, type FreeFn, type ListOp, type OpSpec, type ParamKind, type PrimitiveKind, type ReturnKind } from "@mark1russell7/vex";

/**
 * The most bodies of functions that tier 2 puts at the calls of one program. A function that calls another function
 * twice doubles its body, so a chain of such functions grows fast. A module prints each function once.
 */
export const MAX_CALLS = 10_000;

/** The list ops that are one loop with an `each`. Each other list op takes the list as a value (COMPILE.LIST.VALUE). */
export type FusedOp = Exclude<ListOp, "sortBy" | "take" | "nth" | "setNth" | "drop" | "append" | "flat" | "without" | "get" | "indexOf" | "distinct" | "group" | "join">;

const FUSED_OPS: ReadonlySet<string> = new Set<FusedOp>(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors"]);

/** This function tells if a list op over an `each` is one loop in tier 2. The lowering gives the same answer to the memo. */
export const isFusedOp = (op: string): op is FusedOp => FUSED_OPS.has(op);

/** The function of an op of a domain, or a method. */
export type Method = (...args: unknown[]) => unknown;

/**
 * The kind of a value that the compiler knows: a primitive type, or `domain:Name`. The second kind is for a value of
 * the domain `Name` without a primitive type (KIND.DOMAIN).
 */
export type Kind = PrimitiveKind | `domain:${string}`;

/** This function gives the kind of the values of a domain. */
export const kindOfDomain = (d: AnyDomain): Kind => d.primitive ?? `domain:${d.name}`;

/** This function gives a kind if it is a primitive type, else `undefined`. A kind of a list is not a primitive type. */
export const primitiveOf = (k: Kind | ListKind | undefined): PrimitiveKind | undefined => (k === "number" || k === "string" || k === "boolean" ? k : undefined);

/**
 * The kind of a list: the kind of its items, which can be a list too. A column of lists of a module of a sheet has such a
 * kind (COMPILE.MODULE.SHEET.LIST). With `texts`, a key of an item can be a key of a list literal or of `fill`, not the
 * key of a record. A field of the schema can have such a kind too (COMPILE.MODULE.LIST.INPUT), and a variable of the
 * schema can have it (COMPILE.MODULE.LIST.VAR).
 */
export interface ListKind {
  readonly list: Kind | ListKind;
  readonly texts?: boolean;
}

/**
 * The kinds that a host declares (docs/COMPILER.md §3.2): the kind of each field of the records, and of each variable of
 * the run. A read of a declared field or variable checks the kind. When the check fails, tier 1 evaluates the program.
 * A field and a variable can hold a list (COMPILE.MODULE.LIST.INPUT, COMPILE.MODULE.LIST.VAR). Tier 2 does not check
 * the kind of such a field or variable.
 */
export interface Schema {
  readonly fields?: Readonly<Record<string, Kind | ListKind>>;
  readonly vars?: Readonly<Record<string, Kind | ListKind>>;
}

/** The options of a program: the domains, the free functions and the extension handlers, and the schema of the host. */
export interface Options {
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, FreeFn>>;
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
  readonly schema?: Schema;
}

/**
 * The op of one name in one domain, as `resolveOp` of the core finds it. It is the function of the spec, or else a
 * method of the receiver.
 */
export interface Entry {
  readonly domain: AnyDomain;
  readonly spec: OpSpec<unknown>;
  readonly fn: Method | undefined;
}

const NO_SPEC: OpSpec<unknown> = Object.freeze({});

/** This function gives the op of a name in a domain, or `undefined` for a domain without the op. */
export function entryOf(domain: AnyDomain, name: string): Entry | undefined {
  if (!isOpName(name)) return undefined;
  const declared = Object.hasOwn(domain.ops, name) ? (domain.ops[name] as OpSpec<unknown>) : undefined;
  if (declared === undefined) return domain.methods === "all" ? { domain, spec: NO_SPEC, fn: undefined } : undefined;
  return { domain, spec: declared, fn: declared.fn as Method | undefined };
}

/**
 * The facts of an op site:
 * - `op`: the op of the domain `domain` comes first. It is a method of the receiver, or else the function of the spec.
 *   `params` are the kinds of the parameters, and `lift` lifts numbers (`liftScalar`, if the domain has `fromScalar`).
 * - `free`: no domain has the op, and a free function has the name.
 *
 * Without facts, the site uses the dispatch of the runtime only.
 */
export type SiteFacts =
  | {
      readonly t: "op";
      readonly domain: number;
      readonly method: boolean;
      readonly params: readonly ParamKind[] | undefined;
      readonly lift: OpSpec<unknown>["liftScalar"];
    }
  | { readonly t: "free" };

const FREE: SiteFacts = Object.freeze({ t: "free" });

/**
 * The op of a site whose values have known kinds (KIND.STATIC):
 * - `fn`: the function of the op of the domain `domain`. `bad` is true when an argument has a kind that the op does
 *   not accept, so the interpreter gives an error. `returns` is the kind of the result, if the op declares it. `item`
 *   is the kind of the items of a result that is a list (KIND.RETURNS.LIST). `lifted` has the positions after the
 *   receiver of the numbers that `fromScalar` lifts, if the caller asks for them.
 * - `free`: no domain that accepts the receiver has the op, and a free function has the name.
 */
export type StaticSite =
  | { readonly t: "fn"; readonly domain: number; readonly bad: boolean; readonly returns: Kind | undefined; readonly item?: PrimitiveKind; readonly lifted?: readonly number[] }
  | { readonly t: "free" };

const STATIC_FREE: StaticSite = Object.freeze({ t: "free" });

/** The positions of the lists of a site without lists. */
const NO_LISTS: ReadonlySet<number> = new Set();

/** This function gives the kind of the result of an op of a domain, if the op declares it. */
function returnsOf(domain: AnyDomain, kind: ReturnKind | undefined): Kind | undefined {
  if (kind === "domain") return kindOfDomain(domain);
  return kind === "any" || listItemKind(kind) !== undefined ? undefined : (kind as Kind | undefined);
}

/**
 * This function tells if an argument of a kind fits a parameter, or `undefined` if the kind of the argument is unknown.
 * A list fits only `any`, and the test `is` of a domain without a primitive type can accept it (COMPILE.MODULE.LIST.ARG).
 */
function fits(domain: AnyDomain, param: ParamKind | undefined, arg: Kind | undefined, list: boolean): boolean | undefined {
  if (param === undefined || param === "any") return true;
  if (list) return param === "domain" && domain.primitive === undefined ? undefined : false;
  if (arg === undefined) return undefined;
  return arg === (param === "domain" ? kindOfDomain(domain) : param);
}

/** This function tells if two domains declare different field names, so they have no common value (KIND.FIELDS). */
function disjoint(a: AnyDomain, b: AnyDomain | undefined): boolean {
  const x = a.fields;
  const y = b?.fields;
  return x !== undefined && y !== undefined && (x.length !== y.length || x.some((name) => !y.includes(name)));
}

/**
 * This function tells if a domain accepts a value of a kind. A domain with a primitive type accepts its type, and a
 * domain without one accepts the values of its kind. It does not accept a value of a domain with other fields. For
 * another value, it gives `undefined`: its `is` can accept it.
 */
function accepts(domains: readonly AnyDomain[], d: AnyDomain, kind: Kind): boolean | undefined {
  if (d.primitive !== undefined) return d.primitive === kind;
  if (kind === kindOfDomain(d)) return true;
  return disjoint(d, domains.find((x) => kindOfDomain(x) === kind)) ? false : undefined;
}

/** The facts of the options. */
export interface Facts {
  /** This function gives the facts of the site of the op `name` with `arity` values, the receiver first, if it has facts. */
  site(name: string, arity: number): SiteFacts | undefined;
  /**
   * The checks of the result of an op, as `#checkResult` of the interpreter: for each domain, `true` if it has `valid`.
   * The list ends at the last domain with `valid`, because the domains after it check nothing.
   */
  readonly checks: readonly boolean[];
  /**
   * This function gives the op of a site with the kinds of its values, the receiver first. When the kinds do not decide
   * the op, it gives `undefined`. Each domain before the op must declare a primitive type. Then the interpreter takes
   * the same op at each run. `lists` has the positions of the values that are lists, after the receiver. A number that
   * the op lifts gives `undefined`, unless `lift` is true: then the caller lifts the numbers at the positions `lifted`.
   */
  staticSite(name: string, kinds: readonly (Kind | undefined)[], lists?: ReadonlySet<number>, lift?: boolean): StaticSite | undefined;
  /**
   * This function gives the index of the domain that checks a result of a kind. When no domain accepts such a value,
   * it gives -1. When a domain without a primitive type comes first, it gives `undefined`.
   */
  checkOf(kind: Kind): number | undefined;
  /**
   * This function tells if no domain and no function of the host has the op `name`. Then the interpreter takes its own
   * op for each receiver, for example `fill` (LIST.FILL).
   */
  own(name: string): boolean;
  /** This function tells if a domain declares a list as the result of the op `name` (KIND.RETURNS.LIST). */
  givesList(name: string): boolean;
  /** This function gives the number of domains with an identity of the op `name`, as `#reduce` of the interpreter counts them (LIST.EMPTY). */
  identities(name: string): number;
}

/** This function gives the facts of a set of options. */
export function factsOf(options: Options): Facts {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const last = domains.findLastIndex((d) => d.valid !== undefined);
  return {
    checks: domains.slice(0, last + 1).map((d) => d.valid !== undefined),
    staticSite(name, kinds, lists = NO_LISTS, lift = false) {
      const [self, ...args] = kinds;
      // A primitive value is not a list, so a list op name is an op of a domain here, as in the interpreter.
      if (self === undefined) return undefined;
      for (const [i, d] of domains.entries()) {
        const takes = accepts(domains, d, self);
        if (takes === undefined) return undefined;
        const e = takes ? entryOf(d, name) : undefined;
        // A primitive value has no methods, so only the function of a spec is an op for it. The domain of a value without
        // a primitive type can have methods, and a later domain can accept the value too.
        if (e?.fn === undefined) {
          if (takes && d.primitive === undefined) return undefined;
          continue;
        }
        // A lifted number goes through fromScalar: the site keeps the dispatch of the runtime, or the caller lifts it. A
        // list is not a number, and neither is a value of another kind, so the interpreter does not lift them.
        const lifted = d.fromScalar === undefined ? [] : args.flatMap((a, j) => ((a === undefined || a === "number") && !lists.has(j + 1) && liftsAt(e.spec.liftScalar, j) ? [j] : []));
        if (lifted.some((j) => !lift || args[j] === undefined)) return undefined;
        const ok = args.map((a, j) => fits(d, e.spec.params?.[j], lifted.includes(j) ? kindOfDomain(d) : a, lists.has(j + 1)));
        if (ok.includes(undefined)) return undefined;
        const item = listItemKind(e.spec.returns);
        return { t: "fn", domain: i, bad: ok.includes(false), returns: returnsOf(d, e.spec.returns), ...(item === undefined ? {} : { item }), ...(lifted.length === 0 ? {} : { lifted }) };
      }
      return fns !== undefined && Object.hasOwn(fns, name) ? STATIC_FREE : undefined;
    },
    checkOf(kind) {
      for (const [i, d] of domains.entries()) {
        const takes = accepts(domains, d, kind);
        if (takes === undefined) return undefined;
        if (takes) return i;
      }
      return -1;
    },
    own(name) {
      return domains.every((d) => entryOf(d, name) === undefined) && !(fns !== undefined && Object.hasOwn(fns, name));
    },
    givesList(name) {
      return domains.some((d) => Object.hasOwn(d.ops, name) && listItemKind((d.ops[name] as OpSpec<unknown>).returns) !== undefined);
    },
    identities(name) {
      return domains.filter((d) => Object.hasOwn(d.ops, name) && (d.ops[name] as OpSpec<unknown>).identity !== undefined).length;
    },
    site(name, arity) {
      // Without values, the interpreter takes no op of a domain. A list op can have a list as its receiver.
      if (arity === 0 || isListOp(name)) return undefined;
      const index = domains.findIndex((d) => entryOf(d, name) !== undefined);
      if (index < 0) return fns !== undefined && Object.hasOwn(fns, name) ? FREE : undefined;
      const e = entryOf(domains[index] as AnyDomain, name) as Entry;
      return { t: "op", domain: index, method: e.fn === undefined, params: e.spec.params, lift: e.domain.fromScalar === undefined ? undefined : e.spec.liftScalar };
    },
  };
}

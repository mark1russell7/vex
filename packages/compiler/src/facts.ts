/**
 * The facts of the options that the printer uses (docs/COMPILER.md §13.2). For each op site, they give the domain
 * whose op the interpreter takes first, and the kinds and the lifts of its parameters. The facts come from the op
 * tables, so the same options always give the same facts, and the same source.
 */
import { children, isListOp, isOpName, isVexList, liftsAt, listOf, type AnyDomain, type Expr, type ExtHandler, type FreeFn, type OpSpec, type ParamKind, type PrimitiveKind, type ReturnKind } from "@mark1russell7/vex";

/**
 * The most bodies of functions that tier 2 puts at the calls of one program. A function that calls another function
 * twice doubles its body, so a chain of such functions grows fast. A module prints each function once.
 */
export const MAX_CALLS = 10_000;

/**
 * The list ops that give a list, or read a position or a key of a list (LIST.SORT, LIST.TAKE, LIST.NTH, LIST.BUILD,
 * LIST.GET, LIST.INDEXOF, LIST.FILL).
 */
const ORDER_OPS: ReadonlySet<string> = new Set(["sortBy", "take", "nth", "drop", "append", "flat", "without", "get", "indexOf", "fill"]);

/**
 * This function gives the reason that tier 2 cannot take a program with lists as values. The reason is the axis `list`,
 * an op on the order or the keys of a list, or a list literal. Tier 1 evaluates such a program. It uses a stack, not
 * recursion.
 */
export function listReason(expr: Expr): string | undefined {
  const todo: Expr[] = [expr];
  for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
    if ((x.tag === "each" || x.tag === "fold") && listOf(x.axis) !== undefined) return 'the program has the axis "list", and tier 2 does not have lists as values yet';
    // Stryker disable next-line ConditionalExpression: a node that is not an app has no field op, so the set does not have it
    if (x.tag === "app" && ORDER_OPS.has(x.op)) return `the program has the list op "${x.op}", and tier 2 does not have lists as values yet`;
    if (x.tag === "lit" && isVexList(x.value)) return "the program has a list literal, and tier 2 does not have lists as values yet";
    todo.push(...children(x));
  }
  return undefined;
}

/** The function of an op of a domain, or a method. */
export type Method = (...args: unknown[]) => unknown;

/**
 * The kind of a value that the compiler knows: a primitive type, or `domain:Name`. The second kind is for a value of
 * the domain `Name` without a primitive type (KIND.DOMAIN).
 */
export type Kind = PrimitiveKind | `domain:${string}`;

/** This function gives the kind of the values of a domain. */
export const kindOfDomain = (d: AnyDomain): Kind => d.primitive ?? `domain:${d.name}`;

/** This function gives a kind if it is a primitive type, else `undefined`. */
export const primitiveOf = (k: Kind | undefined): PrimitiveKind | undefined => (k === "number" || k === "string" || k === "boolean" ? k : undefined);

/**
 * The kinds that a host declares (docs/COMPILER.md §3.2): the kind of each field of the records, and of each variable of
 * the run. A read of a declared field or variable checks the kind. When the check fails, tier 1 evaluates the program.
 */
export interface Schema {
  readonly fields?: Readonly<Record<string, Kind>>;
  readonly vars?: Readonly<Record<string, Kind>>;
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
 *   not accept, so the interpreter gives an error. `returns` is the kind of the result, if the op declares it.
 * - `free`: no domain that accepts the receiver has the op, and a free function has the name.
 */
export type StaticSite =
  | { readonly t: "fn"; readonly domain: number; readonly bad: boolean; readonly returns: Kind | undefined }
  | { readonly t: "free" };

const STATIC_FREE: StaticSite = Object.freeze({ t: "free" });

/** This function gives the kind of the result of an op of a domain, if the op declares it. */
function returnsOf(domain: AnyDomain, kind: ReturnKind | undefined): Kind | undefined {
  if (kind === "domain") return kindOfDomain(domain);
  return kind === "any" ? undefined : kind;
}

/** This function tells if an argument of a kind fits a parameter, or `undefined` if the kind of the argument is unknown. */
function fits(domain: AnyDomain, param: ParamKind | undefined, arg: Kind | undefined): boolean | undefined {
  if (param === undefined || param === "any") return true;
  if (arg === undefined) return undefined;
  return arg === (param === "domain" ? kindOfDomain(domain) : param);
}

/**
 * This function tells if a domain accepts a value of a kind. A domain with a primitive type accepts its type, and a
 * domain without one accepts the values of its kind. For another value, it gives `undefined`: its `is` can accept it.
 */
function accepts(d: AnyDomain, kind: Kind): boolean | undefined {
  if (d.primitive !== undefined) return d.primitive === kind;
  return kind === kindOfDomain(d) ? true : undefined;
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
   * the same op at each run.
   */
  staticSite(name: string, kinds: readonly (Kind | undefined)[]): StaticSite | undefined;
  /**
   * This function gives the index of the domain that checks a result of a kind. When no domain accepts such a value,
   * it gives -1. When a domain without a primitive type comes first, it gives `undefined`.
   */
  checkOf(kind: Kind): number | undefined;
}

/** This function gives the facts of a set of options. */
export function factsOf(options: Options): Facts {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const last = domains.findLastIndex((d) => d.valid !== undefined);
  return {
    checks: domains.slice(0, last + 1).map((d) => d.valid !== undefined),
    staticSite(name, kinds) {
      const [self, ...args] = kinds;
      // A primitive value is not a list, so a list op name is an op of a domain here, as in the interpreter.
      if (self === undefined) return undefined;
      for (const [i, d] of domains.entries()) {
        const takes = accepts(d, self);
        if (takes === undefined) return undefined;
        const e = takes ? entryOf(d, name) : undefined;
        // A primitive value has no methods, so only the function of a spec is an op for it. The domain of a value without
        // a primitive type can have methods, and a later domain can accept the value too.
        if (e?.fn === undefined) {
          if (takes && d.primitive === undefined) return undefined;
          continue;
        }
        // A lifted number goes through fromScalar: the site keeps the dispatch of the runtime.
        if (d.fromScalar !== undefined && args.some((a, j) => a !== "string" && a !== "boolean" && liftsAt(e.spec.liftScalar, j))) return undefined;
        const ok = args.map((a, j) => fits(d, e.spec.params?.[j], a));
        if (ok.includes(undefined)) return undefined;
        return { t: "fn", domain: i, bad: ok.includes(false), returns: returnsOf(d, e.spec.returns) };
      }
      return fns !== undefined && Object.hasOwn(fns, name) ? STATIC_FREE : undefined;
    },
    checkOf(kind) {
      for (const [i, d] of domains.entries()) {
        const takes = accepts(d, kind);
        if (takes === undefined) return undefined;
        if (takes) return i;
      }
      return -1;
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

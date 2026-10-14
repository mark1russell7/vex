/**
 * The facts of the options that the printer uses (docs/COMPILER.md §13.2). For each op site, they give the domain
 * whose op the interpreter takes first, and the kinds and the lifts of its parameters. The facts come from the op
 * tables, so the same options always give the same facts, and the same source.
 */
import { isListOp, isOpName, type AnyDomain, type ExtHandler, type FreeFn, type OpSpec, type ParamKind } from "@mark1russell7/vex";

/** The function of an op of a domain, or a method. */
export type Method = (...args: unknown[]) => unknown;

/** The options of a program: the domains, the free functions and the extension handlers. */
export interface Options {
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, FreeFn>>;
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
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

/** The facts of the options. */
export interface Facts {
  /** This function gives the facts of the site of the op `name` with `arity` values, the receiver first, if it has facts. */
  site(name: string, arity: number): SiteFacts | undefined;
  /**
   * The checks of the result of an op, as `#checkResult` of the interpreter: for each domain, `true` if it has `valid`.
   * The list ends at the last domain with `valid`, because the domains after it check nothing.
   */
  readonly checks: readonly boolean[];
}

/** This function gives the facts of a set of options. */
export function factsOf(options: Options): Facts {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const last = domains.findLastIndex((d) => d.valid !== undefined);
  return {
    checks: domains.slice(0, last + 1).map((d) => d.valid !== undefined),
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

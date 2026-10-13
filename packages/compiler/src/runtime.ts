/**
 * The runtime of generated code. Each function follows the rule of the interpreter of the core. Where the interpreter
 * gives an error value, the function gives `FALLBACK`, and tier 1 then does the evaluation again (docs/COMPILER.md §4.1).
 * Thus the runtime makes no error values and no `Result` objects.
 *
 * Generated code uses the runtime inside a `try`, and an exception gives `FALLBACK` for the whole program. A function
 * of the runtime catches an exception only where the interpreter makes a value of it. In an op, it is `#CALC!`, and in
 * `safeIs`, it is `false`. A full call stack is `#DEPTH!`, which no list op and no `ifError` hides, so it goes on to
 * the program.
 */
import {
  axisTargets,
  isListOp,
  isStackOverflow,
  isOpName,
  isVexList,
  liftsAt,
  matchesKind,
  resolveAddr,
  safeIs,
  vexList,
  type Addr,
  type AnyDomain,
  type Axis,
  type ExtHandler,
  type FreeFn,
  type OpSpec,
  type ParamKind,
  type Space,
} from "@mark1russell7/vex";

/** The value of a program that stops at a failed check. */
export const FALLBACK: unique symbol = Symbol("vex.fallback");
export type Fallback = typeof FALLBACK;

/** The options that a runtime keeps: the domains, the free functions and the extension handlers. */
export interface RuntimeOptions {
  readonly domains?: readonly AnyDomain[];
  readonly fns?: Readonly<Record<string, FreeFn>>;
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
}

/**
 * The dispatch of one op name and one number of arguments. With up to 3 arguments, it takes the values themselves, the
 * receiver first. With more, it takes an array of the values.
 */
export type Site = (...values: never[]) => unknown;

/** The functions of the runtime. The names are the names of `RuntimeFn` in the loop IR. */
export interface Runtime {
  readonly F: Fallback;
  has(s: Space, key: string): boolean;
  addr(s: Space, origin: string, focus: string, at: Addr): unknown;
  /**
   * This function gives the targets of a base axis at a focus, for one axis. A space does not change, so the targets
   * of the costly axes stay in a cache for each space and focus.
   */
  axis(axis: BaseAxis): (s: Space, origin: string, focus: string) => unknown;
  table(tables: Readonly<Record<string, Space>> | undefined, name: string): unknown;
  keys(s: Space): readonly string[];
  /** This function gives the dispatch of an op name with `arity` arguments. Generated code gets it once, when it loads. */
  site(name: string, arity: number): Site;
  step(name: string, acc: unknown, value: unknown): unknown;
  result(value: unknown): unknown;
  opts(value: unknown): unknown;
  rec(names: readonly string[], values: readonly unknown[]): unknown;
  list(keys: readonly string[], values: readonly unknown[]): unknown;
  frozen(values: readonly unknown[]): unknown;
  ext(kind: string, data: unknown, s: Space, origin: string, focus: string, path: readonly number[]): unknown;
  var(vars: Readonly<Record<string, unknown>> | undefined, name: string): unknown;
}

type BaseAxis = Exclude<Axis, { readonly t: "where" }>;

/** The axes whose targets cost more than a read of a map. Their targets stay in a cache. */
const COSTLY: ReadonlySet<Axis["t"]> = new Set(["neighbors", "window", "ancestors", "descendants", "siblings", "reachable"]);
type Method = (...args: unknown[]) => unknown;

/**
 * The op of one name in one domain, as `resolveOp` of the core finds it. It is the function of the spec, or else a
 * method of the receiver. `undefined` is a domain without the op. The runtime reads the op tables when a program loads.
 */
interface Entry {
  readonly domain: AnyDomain;
  readonly spec: OpSpec<unknown>;
  readonly fn: Method | undefined;
}

const NO_SPEC: OpSpec<unknown> = Object.freeze({});

/**
 * This function finds a method as `findMethod` of the core does. It reads a descriptor only where the property exists.
 * Thus a method on a prototype costs one descriptor, not one for each object of the chain.
 */
function findMethod(self: unknown, name: string): Method | undefined {
  if (typeof self !== "object" && typeof self !== "function") return undefined;
  let o: object | null = self;
  while (o !== null && o !== Object.prototype && o !== Function.prototype) {
    if (Object.hasOwn(o, name)) {
      const value: unknown = Object.getOwnPropertyDescriptor(o, name)?.value;
      return typeof value === "function" ? (value as Method) : undefined;
    }
    o = Object.getPrototypeOf(o) as object | null;
  }
  return undefined;
}

/** This function makes the runtime of one set of options. */
export function createRuntime(options: RuntimeOptions): Runtime {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const extensions = options.extensions ?? {};
  const F: Fallback = FALLBACK;

  // An exception of an op is the error #CALC! of that op. A full call stack goes on.
  const threw = (thrown: unknown): Fallback => {
    if (isStackOverflow(thrown)) throw thrown;
    return F;
  };

  // The checks of the result of an op: a value, a finite number, and a valid value of its first domain.
  const checked = (value: unknown): unknown => {
    if (value === undefined || value === null) return F;
    if (typeof value === "number" && !Number.isFinite(value)) return F;
    for (const d of domains) {
      if (safeIs(d, value)) return d.valid === undefined || d.valid(value) ? value : F;
    }
    return value;
  };

  // The call of an op: the lift of numbers, the kinds of the parameters, the call, and the checks of the result.
  // `values` holds the receiver and then the arguments.
  const invoke = (e: Entry, method: Method | undefined, values: readonly unknown[]): unknown => {
    try {
      return call(e, method, values);
    } catch (thrown) {
      return threw(thrown);
    }
  };
  const call = (e: Entry, method: Method | undefined, values: readonly unknown[]): unknown => {
    const lift = e.spec.liftScalar;
    const from = e.domain.fromScalar;
    let args = values;
    if (lift && from !== undefined) {
      for (let i = 1; i < values.length; i++) {
        const a = values[i];
        if (typeof a === "number" && liftsAt(lift, i - 1)) {
          if (args === values) args = [...values];
          (args as unknown[])[i] = from(a);
        }
      }
    }
    const params = e.spec.params;
    if (params !== undefined) {
      for (let i = 1; i < args.length; i++) if (!matchesKind(params[i - 1] ?? "any", args[i], e.domain)) return F;
    }
    if (e.fn !== undefined) return checked(e.fn.apply(undefined, args as unknown[]));
    const self = args[0];
    switch (args.length) {
      case 1:
        return checked(method?.call(self));
      case 2:
        return checked(method?.call(self, args[1]));
      default:
        return checked(method?.apply(self, args.slice(1)));
    }
  };

  // The op of a name for a receiver: the first domain that accepts the receiver and has the op. `undefined` is no op.
  // `seen` receives each method that the first entry finds.
  const dispatch = (entries: readonly (Entry | undefined)[], name: string, values: readonly unknown[], seen?: (m: Method) => void): unknown => {
    const self = values[0];
    for (const e of entries) {
      if (e === undefined || !safeIs(e.domain, self)) continue;
      if (e.fn !== undefined) return invoke(e, undefined, values);
      const method = findMethod(self, name);
      if (method === undefined) continue;
      if (e === entries.find((x) => x !== undefined)) seen?.(method);
      return invoke(e, method, values);
    }
    return undefined;
  };

  const entriesOf = (name: string): readonly (Entry | undefined)[] =>
    domains.map((domain): Entry | undefined => {
      if (!isOpName(name)) return undefined;
      const declared = Object.hasOwn(domain.ops, name) ? (domain.ops[name] as OpSpec<unknown>) : undefined;
      if (declared === undefined) return domain.methods === "all" ? { domain, spec: NO_SPEC, fn: undefined } : undefined;
      return { domain, spec: declared, fn: declared.fn as Method | undefined };
    });

  // The entries of the op names of reduce. A program can compute such a name, so the runtime keeps them by name.
  const stepEntries = new Map<string, readonly (Entry | undefined)[]>();

  return {
    F,
    has: (s, key) => s.has(key),
    addr(s, origin, focus, at) {
      const r = resolveAddr(s, { origin, focus }, at);
      return r.ok ? r.value : F;
    },
    axis(axis) {
      const targets = (s: Space, origin: string, focus: string): unknown => {
        const r = axisTargets(s, { origin, focus }, axis);
        return r.ok ? r.value : F;
      };
      if (!COSTLY.has(axis.t)) return targets;
      const cache = new WeakMap<Space, Map<string, unknown>>();
      return (s, origin, focus) => {
        let byFocus = cache.get(s);
        if (byFocus === undefined) {
          byFocus = new Map();
          cache.set(s, byFocus);
        }
        let r = byFocus.get(focus);
        if (r === undefined) {
          r = targets(s, origin, focus);
          byFocus.set(focus, r);
        }
        return r;
      };
    },
    table(tables, name) {
      const t = tables !== undefined && Object.hasOwn(tables, name) ? tables[name] : undefined;
      return t ?? F;
    },
    keys: (s) => s.keys,
    // The dispatch of `app` in the interpreter: the first domain that accepts the receiver and has the op, and else a
    // free function.
    site(name, arity) {
      const entries = entriesOf(name);
      const listOp = isListOp(name);
      const fn = fns !== undefined && Object.hasOwn(fns, name) ? fns[name] : undefined;
      const first = entries.find((e) => e !== undefined);
      let method: Method | undefined;
      const seen = (m: Method): void => {
        method = m;
      };
      const generic = (values: readonly unknown[]): unknown => {
        // A list op on a list value is not an error, but tier 2 does not have it. The exception stops the program.
        if (listOp && isVexList(values[0])) throw new Error(`tier 1 gives "${name}" on a list value`);
        if (values.length > 0) {
          const r = dispatch(entries, name, values, seen);
          if (r !== undefined) return r;
        }
        if (fn === undefined) return F;
        try {
          return checked(fn.apply(undefined, values as unknown[]));
        } catch (thrown) {
          return threw(thrown);
        }
      };
      // The fast path of a method op of the first domain with the op. The method of the last receiver is the method of
      // this receiver when a read of the property gives the same function. (A read differs from findMethod only for an
      // accessor that gives that function.)
      if (first === undefined || first.fn !== undefined || arity < 1 || arity > 3) return arity <= 3 ? (...values: unknown[]) => generic(values) : generic;
      const { domain, spec } = first;
      const lifts = (i: number): boolean => domain.fromScalar !== undefined && spec.liftScalar !== undefined && liftsAt(spec.liftScalar, i);
      const param = (i: number): ParamKind => spec.params?.[i] ?? "any";
      const fast = (self: unknown): self is object =>
        method !== undefined && typeof self === "object" && self !== null && (self as Record<string, unknown>)[name] === method && !(listOp && isVexList(self)) && safeIs(domain, self);
      const [lift0, lift1, param0, param1] = [lifts(0), lifts(1), param(0), param(1)];
      switch (arity) {
        case 1:
          return (self: unknown) => {
            if (!fast(self)) return generic([self]);
            try {
              return checked(method?.call(self));
            } catch (thrown) {
              return threw(thrown);
            }
          };
        case 2:
          return (self: unknown, a: unknown) => {
            if (!fast(self) || (lift0 && typeof a === "number")) return generic([self, a]);
            if (!matchesKind(param0, a, domain)) return F;
            try {
              return checked(method?.call(self, a));
            } catch (thrown) {
              return threw(thrown);
            }
          };
        default:
          return (self: unknown, a: unknown, b: unknown) => {
            if (!fast(self) || (lift0 && typeof a === "number") || (lift1 && typeof b === "number")) return generic([self, a, b]);
            if (!matchesKind(param0, a, domain) || !matchesKind(param1, b, domain)) return F;
            try {
              return checked(method?.call(self, a, b));
            } catch (thrown) {
              return threw(thrown);
            }
          };
      }
    },
    // One step of `reduce`: the first domain that accepts the accumulator and has the op. No free function.
    step(name, acc, value) {
      let entries = stepEntries.get(name);
      if (entries === undefined) {
        entries = entriesOf(name);
        stepEntries.set(name, entries);
      }
      return dispatch(entries, name, [acc, value]) ?? F;
    },
    result(value) {
      try {
        return checked(value);
      } catch (thrown) {
        return threw(thrown);
      }
    },
    // A list op reads the option `strict` of its options. The read can throw, as in the interpreter.
    opts: (value) => (value as { readonly strict?: unknown } | null | undefined)?.strict,
    rec(names, values) {
      const out: Record<string, unknown> = {};
      names.forEach((n, i) => {
        out[n] = values[i];
      });
      return Object.freeze(out);
    },
    list: (keys, values) => vexList(keys.map((key, i) => ({ key, result: { ok: true, value: values[i] } }))),
    frozen: (values) => Object.freeze([...values]),
    ext(kind, data, s, origin, focus, path) {
      const handler = Object.hasOwn(extensions, kind) ? extensions[kind] : undefined;
      if (handler === undefined) return F;
      const r = handler(data, { space: s, position: { origin, focus }, path });
      return r.ok ? r.value : F;
    },
    // The interpreter reads the own enumerable properties of the variables, with `Object.entries`.
    var(vars, name) {
      return vars !== undefined && Object.prototype.propertyIsEnumerable.call(vars, name) ? vars[name] : F;
    },
  };
}

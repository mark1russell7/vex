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
  findMethod,
  isListOp,
  isStackOverflow,
  isVexList,
  liftsAt,
  matchesKind,
  fixAddr,
  resolveAddr,
  safeIs,
  vexList,
  type Addr,
  type AnyDomain,
  type Axis,
  type FixedMove,
  type FreeFn,
  type Space,
} from "@mark1russell7/vex";
import { entryOf, type Entry, type Method, type Options } from "./facts.ts";

/** The value of a program that stops at a failed check. */
export const FALLBACK: unique symbol = Symbol("vex.fallback");
export type Fallback = typeof FALLBACK;

/** The options that a runtime keeps: the domains, the free functions and the extension handlers. */
export type RuntimeOptions = Options;

/**
 * The dispatch of one op name and one number of arguments. With up to 3 arguments, it takes the values themselves, the
 * receiver first. With more, it takes an array of the values. Generated code also reads its fields: the method of the
 * last receiver, the function of the op of the first domain, and the free function.
 */
export interface Site {
  (...values: never[]): unknown;
  m: Method | undefined;
  readonly fn: Method | undefined;
  readonly free: FreeFn | undefined;
}

/** A base axis: an axis that is not `where`. */
export type BaseAxis = Exclude<Axis, { readonly t: "where" }>;

/** The targets of an axis at a focus: the keys, and the index of each key in `keys` of the space. */
export interface Targets {
  readonly keys: readonly string[];
  readonly idx: readonly (number | undefined)[];
}

/** An entry of a memo: the value of a node for one space, or no value after an error. */
export interface MemoEntry {
  readonly v: unknown;
  readonly ok: boolean;
}

/**
 * The memo of one node: an entry for each space and each value of the keys (docs/COMPILER.md §7.2 and §7.3). An entry
 * with an object or a function in its keys is not kept, because each run can make a new one.
 */
export interface Memo {
  get(s: Space, keys: readonly unknown[]): MemoEntry | undefined;
  put(s: Space, keys: readonly unknown[], v: unknown, ok: boolean): MemoEntry;
}

/** A level of a memo: the entry of the keys so far, and the levels of the next key. */
interface MemoLevel {
  entry?: MemoEntry;
  next?: Map<unknown, MemoLevel>;
}

/** A map key does not tell 0 from -0, but an op can. Thus -0 has its own key. */
const NEGATIVE_ZERO = Symbol("-0");

/** This function tells if a memo keeps an entry with these keys: keys without objects and functions. */
const kept = (keys: readonly unknown[]): boolean => keys.every((k) => (typeof k !== "object" || k === null) && typeof k !== "function");

/** The functions of the runtime. The names are the names of `RuntimeFn` in the loop IR. */
export interface Runtime {
  readonly F: Fallback;
  has(s: Space, key: string): boolean;
  /** This function gives the key of an address. `values` has the values of its computed moves (NAV.COMPUTED). */
  addr(s: Space, origin: string, focus: string, at: Addr, values?: readonly unknown[]): unknown;
  /**
   * This function gives the function of the targets of one base axis. A space does not change, so the targets stay in
   * a cache for each space and focus. Generated code gets it once, when it loads.
   */
  axis(axis: BaseAxis): (s: Space, origin: string, focus: string) => Targets | Fallback;
  table(tables: Readonly<Record<string, Space>> | undefined, name: string): unknown;
  keys(s: Space): readonly string[];
  /** This function gives the dispatch of an op name with `arity` arguments. Generated code gets it once, when it loads. */
  site(name: string, arity: number): Site;
  /** This function gives a new memo. Generated code gets one for each node of the memo, when it loads. */
  memo(): Memo;
  /** This function gives the domain at an index of the options. */
  domain(index: number): AnyDomain | undefined;
  /** An exception of an op is the error #CALC! of that op, so this function gives `FALLBACK`. A full call stack goes on. */
  threw(thrown: unknown): Fallback;
  step(name: string, acc: unknown, value: unknown): unknown;
  result(value: unknown): unknown;
  opts(value: unknown): unknown;
  rec(names: readonly string[], values: readonly unknown[]): unknown;
  list(keys: readonly string[], values: readonly unknown[]): unknown;
  frozen(values: readonly unknown[]): unknown;
  ext(kind: string, data: unknown, s: Space, origin: string, focus: string, path: readonly number[]): unknown;
  var(vars: Readonly<Record<string, unknown>> | undefined, name: string): unknown;
}

/** This function makes the runtime of one set of options. */
export function createRuntime(options: RuntimeOptions): Runtime {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const extensions = options.extensions ?? {};
  const F: Fallback = FALLBACK;

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

  // The call of an op, as `#call` of the interpreter: the lift of numbers, the kinds of the parameters, the call, and
  // the checks of the result.
  const invoke = (e: Entry, call: (args: readonly unknown[]) => unknown, rest: readonly unknown[]): unknown => {
    try {
      const lift = e.spec.liftScalar;
      const from = e.domain.fromScalar;
      const args = lift && from !== undefined ? rest.map((a, i): unknown => (typeof a === "number" && liftsAt(lift, i) ? from(a) : a)) : rest;
      const params = e.spec.params;
      if (params !== undefined && !args.every((a, i) => matchesKind(params[i] ?? "any", a, e.domain))) return F;
      return checked(call(args));
    } catch (thrown) {
      return threw(thrown);
    }
  };

  // The op of a name for a receiver: the first domain that accepts the receiver and has the op. `undefined` is no op.
  // `seen` receives each method that the dispatch finds.
  const dispatch = (entries: readonly (Entry | undefined)[], name: string, values: readonly unknown[], seen?: (m: Method) => void): unknown => {
    const [self, ...rest] = values;
    for (const e of entries) {
      if (e === undefined || !safeIs(e.domain, self)) continue;
      const fn = e.fn;
      if (fn !== undefined) return invoke(e, (args) => fn(self, ...args), rest);
      const method = findMethod(self, name);
      if (method === undefined) continue;
      seen?.(method);
      return invoke(e, (args) => method.apply(self, [...args]), rest);
    }
    return undefined;
  };

  const entriesOf = (name: string): readonly (Entry | undefined)[] => domains.map((d) => entryOf(d, name));

  // The entries of the op names of reduce. A program can compute such a name, so the runtime keeps them by name.
  const stepEntries = new Map<string, readonly (Entry | undefined)[]>();

  // The index of each key of a space, for the targets of an axis. A miss of the cache only makes the map again.
  const indexes = new WeakMap<Space, ReadonlyMap<string, number>>();
  const indexOf = (s: Space): ReadonlyMap<string, number> => {
    let m = indexes.get(s);
    // Stryker disable next-line ConditionalExpression: see the comment above
    if (m === undefined) {
      m = new Map(s.keys.map((k, i) => [k, i]));
      // Stryker disable next-line CallExpression: see the comment above
      indexes.set(s, m);
    }
    return m;
  };

  return {
    F,
    has: (s, key) => s.has(key),
    addr(s, origin, focus, at, values) {
      const pos = { origin, focus };
      // An address without computed moves has no values, and its moves are fixed.
      // Stryker disable next-line ConditionalExpression: fixAddr gives the same fixed moves, so the test only saves an array
      const fixed = values === undefined ? undefined : fixAddr(at, values, pos);
      if (fixed?.ok === false) return F;
      const r = resolveAddr(s, pos, fixed === undefined ? (at as readonly FixedMove[]) : fixed.value);
      return r.ok ? r.value : F;
    },
    axis(axis) {
      const cache = new WeakMap<Space, Map<string, Targets | Fallback>>();
      return (s, origin, focus) => {
        let byFocus = cache.get(s);
        if (byFocus === undefined) {
          byFocus = new Map();
          cache.set(s, byFocus);
        }
        let targets = byFocus.get(focus);
        if (targets === undefined) {
          const r = axisTargets(s, { origin, focus }, axis);
          const index = indexOf(s);
          targets = r.ok ? { keys: r.value, idx: r.value.map((k) => index.get(k)) } : F;
          byFocus.set(focus, targets);
        }
        return targets;
      };
    },
    table(tables, name) {
      const t = tables !== undefined && Object.hasOwn(tables, name) ? tables[name] : undefined;
      return t ?? F;
    },
    keys: (s) => s.keys,
    // The dispatch of `app` in the interpreter: the first domain that accepts the receiver and has the op, and else a
    // free function. Generated code has the fast path of each site, and it uses this dispatch for each other case.
    site(name, arity) {
      const entries = entriesOf(name);
      const listOp = isListOp(name);
      const fn = fns !== undefined && Object.hasOwn(fns, name) ? fns[name] : undefined;
      const generic = (values: readonly unknown[]): unknown => {
        // A list op on a list value is not an error, but tier 2 does not have it. The exception stops the program.
        // Stryker disable next-line StringLiteral: the program catches the exception, so no one reads its message
        if (listOp && isVexList(values[0])) throw new Error("tier 1 gives a list op on a list value");
        if (values.length > 0) {
          const r = dispatch(entries, name, values, (m) => {
            site.m = m;
          });
          if (r !== undefined) return r;
        }
        try {
          // Stryker disable next-line ConditionalExpression: a call of undefined throws, and the catch also gives F
          return fn === undefined ? F : checked(fn(...values));
        } catch (thrown) {
          return threw(thrown);
        }
      };
      const call = arity <= 3 ? (...values: unknown[]): unknown => generic(values) : generic;
      const site: Site = Object.assign(call, { m: undefined, fn: entries.find((e) => e !== undefined)?.fn, free: fn });
      return site;
    },
    memo() {
      const spaces = new WeakMap<Space, MemoLevel>();
      // The level of a space and some keys. With `make`, the function makes each missing level. A level that a read
      // makes only uses memory, so the checks of `make` have no other effect.
      const level = (s: Space, keys: readonly unknown[], make: boolean): MemoLevel | undefined => {
        let at: MemoLevel | undefined = spaces.get(s);
        if (at === undefined) {
          // A read comes before each write, so the level of the space exists for each write.
          // Stryker disable next-line ConditionalExpression,BooleanLiteral: see the comments above
          if (!make) return undefined;
          at = {};
          spaces.set(s, at);
        }
        for (const k of keys) {
          // Stryker disable next-line UnaryOperator: with +0 as the special key, 0 and -0 still get different entries
          const slot = Object.is(k, -0) ? NEGATIVE_ZERO : k;
          let next: MemoLevel | undefined = at.next?.get(slot);
          if (next === undefined) {
            // Stryker disable next-line ConditionalExpression: see the comment above
            if (!make) return undefined;
            next = {};
            (at.next ??= new Map()).set(slot, next);
          }
          at = next;
        }
        return at;
      };
      return {
        // Stryker disable next-line BooleanLiteral: a read that makes the levels only uses memory
        get: (s, keys) => level(s, keys, false)?.entry,
        put(s, keys, v, ok) {
          const e = { v, ok };
          if (kept(keys)) (level(s, keys, true) as MemoLevel).entry = e;
          return e;
        },
      };
    },
    domain: (index) => domains[index],
    threw,
    // One step of `reduce`: the first domain that accepts the accumulator and has the op. No free function.
    step(name, acc, value) {
      let entries = stepEntries.get(name);
      // A miss of the cache only reads the op tables again.
      // Stryker disable ConditionalExpression,BlockStatement,CallExpression
      if (entries === undefined) {
        entries = entriesOf(name);
        stepEntries.set(name, entries);
      }
      // Stryker restore ConditionalExpression,BlockStatement,CallExpression
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
    // Object.fromEntries gives an own field for each name, also for "__proto__" (V-062).
    rec: (names, values) => Object.freeze(Object.fromEntries(names.map((n, i) => [n, values[i]]))),
    list: (keys, values) => vexList(keys.map((key, i) => ({ key, result: { ok: true, value: values[i] } }))),
    frozen: (values) => Object.freeze([...values]),
    ext(kind, data, s, origin, focus, path) {
      const handler = Object.hasOwn(extensions, kind) ? extensions[kind] : undefined;
      // Stryker disable next-line ConditionalExpression: a call of undefined throws, and the program gives F for it too
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

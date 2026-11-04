/**
 * The runtime of generated code. Each function follows the rule of the interpreter of the core. Where the interpreter
 * gives an error value, the function gives `FALLBACK`, and it records the detail of the failure in two variables. On the
 * value path, the runtime makes no error values and no `Result` objects (docs/COMPILER.md §4.1). A list op on a list
 * value is the exception: it runs the code of the interpreter (COMPILE.LIST.VALUE).
 *
 * The failure path of generated code keeps a lazy error: the site, the position and the operands. When the program ends
 * with it, `take` gives the error of the interpreter. It uses the error texts of the core (`materialize`).
 *
 * Generated code uses the runtime inside a `try`, and an exception gives `FALLBACK` for the whole program. Tier 1 then
 * gives the result. A function of the runtime catches an exception only where the interpreter makes a value of it. In
 * an op, it is `#CALC!`, and in `safeIs`, it is `false`. A full call stack is `#DEPTH!`, which no list op and no
 * `ifError` hides, so it goes on to the program. An extension throws for `#DEPTH!` too (COMPILE.EXT).
 */
import {
  axisTargets,
  errorAt,
  errorText,
  findMethod,
  isDepthError,
  isListOp,
  isStackOverflow,
  isVexList,
  liftsAt,
  listOps,
  matchesKind,
  fixAddr,
  noKeyError,
  resolveAddr,
  safeIs,
  vexList,
  type Addr,
  type AnyDomain,
  type Axis,
  type ErrorExtra,
  type ErrorText,
  type FixedMove,
  type FreeFn,
  type ParamKind,
  type Position,
  type Result,
  type Space,
  type VexError,
} from "@mark1russell7/vex";
import { entryOf, type Entry, type Method, type Options } from "./facts.ts";
import type { ErrorSite } from "./loop.ts";

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

/**
 * The detail of the failure of an op or of an extension, with the meaning of the two variables of the record:
 * - `threw`: an op threw, and `a` is the thrown value.
 * - `lift`: `fromScalar` threw. `a` is the thrown value, and `b` the name of the domain.
 * - `valid`: a check `valid` threw. `a` is the thrown value, and `b` the name of the domain.
 * - `bad`: a result failed its checks, and `a` is the result.
 * - `param`: an argument has the wrong kind, and `a` is a `ParamFailure`.
 * - `no-op`: no domain and no function has the op. `a` tells if the op has a receiver, and `b` is the receiver.
 * - `no-step`: no domain gives a step of `reduce`, and `a` is the accumulator.
 * - `no-handler`: an extension has no handler.
 * - `foreign`: a handler gave an error, and `a` is the error.
 * - `list`: a list op or `fill` gave an error of its own, and `a` is the error.
 */
type Detail = "threw" | "lift" | "valid" | "bad" | "param" | "no-op" | "no-step" | "no-handler" | "foreign" | "list";

/** An argument of an op that does not have the kind of its parameter. */
interface ParamFailure {
  readonly index: number;
  readonly value: unknown;
  readonly kind: ParamKind;
  readonly domain: string;
}

/**
 * A failure that the program keeps: its site, its position, its operands and the detail of the runtime. `materialize`
 * makes the error of it only if the error is the result of the program.
 */
export interface LazyError {
  readonly site: ErrorSite;
  readonly origin: string;
  readonly focus: string;
  readonly operands: readonly unknown[];
  readonly detail: Detail;
  readonly a: unknown;
  readonly b: unknown;
}

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
  /** This function records a result that failed its checks. It gives `FALLBACK`. */
  bad(value: unknown): Fallback;
  /** This function records an exception of the check `valid` of the domain at an index. It gives `FALLBACK`. */
  invalid(thrown: unknown, domain: number): Fallback;
  /** This function gives the lazy error of a failed check, with the record of the last failure. */
  err(site: ErrorSite, origin: string, focus: string, ...operands: readonly unknown[]): LazyError;
  /** This function gives the lazy error of the arguments that failed, as `#all` of the interpreter: `undefined` for no error. */
  args(site: ErrorSite, origin: string, focus: string, errors: readonly (LazyError | undefined)[]): LazyError | undefined;
  /** This function ends a program with a lazy error. It gives `FALLBACK`, so `load` keeps its contract. */
  raise(error: LazyError): Fallback;
  /** This function gives the error of the last `raise`, once. It gives `undefined` when the run ended in another way. */
  take(): VexError | undefined;
  step(name: string, acc: unknown, value: unknown): unknown;
  result(value: unknown): unknown;
  opts(value: unknown): unknown;
  rec(names: readonly string[], values: readonly unknown[]): unknown;
  list(keys: readonly string[], values: readonly unknown[]): unknown;
  frozen(values: readonly unknown[]): unknown;
  ext(kind: string, data: unknown, s: Space, origin: string, focus: string, path: readonly number[]): unknown;
  var(vars: Readonly<Record<string, unknown>> | undefined, name: string): unknown;
}

/** The path and the position of a call of a list op. An error with this path is an error of the op, not of an item. */
const HERE: readonly number[] = [];
const NOWHERE: Position = { origin: "", focus: "" };

/** The interpreter reads the own enumerable properties of the variables, with `Object.entries`. */
const hasVar = (vars: Readonly<Record<string, unknown>> | undefined, name: string): vars is Readonly<Record<string, unknown>> => vars !== undefined && Object.prototype.propertyIsEnumerable.call(vars, name);

/** This function makes the runtime of one set of options. */
export function createRuntime(options: RuntimeOptions): Runtime {
  const domains = options.domains ?? [];
  const fns = options.fns;
  const extensions = options.extensions ?? {};
  const F: Fallback = FALLBACK;
  const lists = listOps(options);

  // The record of the last failure. Each failure writes it before `err` reads it, and a failure makes no object here.
  let detail: Detail = "threw";
  let detailA: unknown;
  let detailB: unknown;
  // The error of the last `raise`.
  let raised: LazyError | undefined;
  const record = (d: Detail, a?: unknown, b?: unknown): Fallback => {
    detail = d;
    detailA = a;
    detailB = b;
    return F;
  };

  // An exception of an op, of `fromScalar` or of a check `valid`.
  const failure = (d: Detail, thrown: unknown, domain?: string): Fallback => {
    if (isStackOverflow(thrown)) throw thrown;
    return record(d, thrown, domain);
  };
  const threw = (thrown: unknown): Fallback => failure("threw", thrown);

  // The checks of the result of an op: a value, a finite number, and a valid value of its first domain.
  const checked = (value: unknown): unknown => {
    if (value === undefined || value === null) return record("bad", value);
    if (typeof value === "number" && !Number.isFinite(value)) return record("bad", value);
    for (const d of domains) {
      if (!safeIs(d, value)) continue;
      if (d.valid === undefined) return value;
      try {
        return d.valid(value) ? value : record("bad", value);
      } catch (thrown) {
        return failure("valid", thrown, d.name);
      }
    }
    return value;
  };

  // The call of an op, as `#call` of the interpreter: the lift of numbers, the kinds of the parameters, the call, and
  // the checks of the result.
  const invoke = (e: Entry, call: (args: readonly unknown[]) => unknown, rest: readonly unknown[]): unknown => {
    const lift = e.spec.liftScalar;
    const from = e.domain.fromScalar;
    let args = rest;
    if (lift && from !== undefined) {
      try {
        args = rest.map((a, i): unknown => (typeof a === "number" && liftsAt(lift, i) ? from(a) : a));
      } catch (thrown) {
        return failure("lift", thrown, e.domain.name);
      }
    }
    const params = e.spec.params;
    if (params !== undefined) {
      const index = args.findIndex((a, i) => !matchesKind(params[i] ?? "any", a, e.domain));
      if (index !== -1) return record("param", { index, value: args[index], kind: params[index] ?? "any", domain: e.domain.name } satisfies ParamFailure);
    }
    let value: unknown;
    try {
      value = call(args);
    } catch (thrown) {
      return threw(thrown);
    }
    return checked(value);
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

  // The result of a list op: the code of the interpreter, for each list (COMPILE.LIST.VALUE). An error of the op is an
  // error of the site. #DEPTH! and the error of an item stop the program, so tier 1 gives the result (V-064, V-066).
  const listResult = (r: Result<unknown>): unknown => {
    if (r.ok) return r.value;
    // Stryker disable next-line StringLiteral: the program catches the exception, so no one reads its message
    if (r.error.path !== HERE || isDepthError(r.error)) throw new Error("tier 1 gives the error of a list op");
    return record("list", r.error);
  };

  // The entries of the op names of reduce. A program can compute such a name, so the runtime keeps them by name.
  const stepEntries = new Map<string, readonly (Entry | undefined)[]>();

  // This function gives the error of a result that failed its checks, as `#checkResult` of the interpreter.
  const badText = (op: string, value: unknown): ErrorText => {
    if (value === undefined || value === null) return errorText.noValue(op);
    if (typeof value === "number" && !Number.isFinite(value)) return errorText.notFinite(op, value);
    // The checks of a domain gave this failure, so a domain accepts the value.
    return errorText.invalid(op, (domains.find((d) => safeIs(d, value)) as AnyDomain).name);
  };

  // This function gives the error of a failure of an op without a domain, as the end of `#app` of the interpreter.
  const noOpText = (op: string, receiver: boolean, self: unknown): ErrorText => {
    const accepted = receiver ? domains.find((d) => safeIs(d, self)) : undefined;
    if (accepted !== undefined) return errorText.domainNoOp(accepted.name, op);
    return receiver ? errorText.noDomain(op, self) : errorText.noOp(op);
  };

  // This function gives the error of a failure of the op `op`, from the record of the failure.
  const opError = (e: LazyError, op: string, path: readonly number[], at: (text: ErrorText, extra?: ErrorExtra) => VexError): VexError => {
    switch (e.detail) {
      case "list":
        return { ...(e.a as VexError), path, origin: e.origin, focus: e.focus };
      case "threw":
        return at(errorText.threw(op), { thrown: e.a });
      case "lift":
        return at(errorText.threw(`${e.b as string}.fromScalar`), { thrown: e.a });
      case "valid":
        return at(errorText.validThrew(op, e.b as string), { thrown: e.a });
      case "bad":
        return at(badText(op, e.a));
      case "param": {
        const p = e.a as ParamFailure;
        return at(errorText.badParam(op, p.index, p.value, p.kind, p.domain));
      }
      case "no-step":
        return at(errorText.noStep(op, e.a));
      // The two details of an extension have no op site, so this case is the only other detail.
      case "no-op":
      case "foreign":
      case "no-handler":
        return at(noOpText(op, e.a as boolean, e.b));
    }
  };

  // This function gives the error of an extension, as `#guard` and `#locate` of the interpreter.
  const extError = (e: LazyError, kind: string, pos: Position, path: readonly number[], at: (text: ErrorText, extra?: ErrorExtra) => VexError): VexError => {
    if (e.detail === "threw") return at(errorText.threw(kind), { thrown: e.a });
    if (e.detail === "no-handler") return at(errorText.noHandler(kind));
    const error = e.a as VexError;
    return error.origin === undefined ? { ...error, path, origin: pos.origin, focus: pos.focus } : error;
  };

  /** This function makes the error of a lazy error: the error of the interpreter, with the texts of the core. */
  const materialize = (e: LazyError): VexError => {
    const { site, operands } = e;
    if (site.t === "key") return noKeyError(e.origin);
    const pos = { origin: e.origin, focus: e.focus };
    const { path } = site;
    const at = (text: ErrorText, extra?: ErrorExtra): VexError => errorAt(text, pos, path, extra);
    const [first, second] = operands;
    switch (site.t) {
      case "text":
        return at(site.text);
      case "call": {
        const vars = first as Readonly<Record<string, unknown>> | undefined;
        return at(hasVar(vars, site.name) ? errorText.notFunction(site.name) : errorText.noFunction(site.name));
      }
      case "missing":
        return at(errorText.missing(first as string, site.where));
      case "boolean":
        return at(errorText.notBoolean(site.op, site.i, first));
      case "items":
        return at(errorText.needsItems(site.op, site.what, first));
      case "until":
        return at(errorText.untilKind(first));
      case "test":
        return at(errorText.whereKind(first));
      case "op":
        return opError(e, site.op, path, at);
      case "step":
        return opError(e, first as string, path, at);
      case "ext":
        return extError(e, site.kind, pos, path, at);
      case "addr": {
        const values = second as readonly unknown[] | undefined;
        const fixed = values === undefined ? undefined : fixAddr(site.at, values, pos);
        if (fixed?.ok === false) return { ...fixed.error, path };
        const r = resolveAddr(first as Space, pos, fixed === undefined ? (site.at as readonly FixedMove[]) : fixed.value);
        return { ...(r as Extract<typeof r, { readonly ok: false }>).error, path };
      }
      case "axis": {
        const r = axisTargets(first as Space, { origin: e.origin, focus: second as string }, site.axis);
        return { ...(r as Extract<typeof r, { readonly ok: false }>).error, path };
      }
      case "args":
        return at(errorText.args(operands.length, site.what), { causes: (operands as readonly LazyError[]).map(materialize) });
    }
  };

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
        if (listOp && isVexList(values[0])) return listResult(lists.list(name, values[0], values.slice(1), NOWHERE, HERE));
        if (values.length > 0) {
          const r = dispatch(entries, name, values, (m) => {
            site.m = m;
          });
          if (r !== undefined) return r;
        }
        // LIST.ARRAY: after the domains and the function of the host, a list op on an array is a list op on a list.
        // FALLBACK is an error, and a list op skips an error item, so an exception must stop the program (V-064).
        // Stryker disable next-line StringLiteral: the program catches the exception, so no one reads its message
        if (listOp && fn === undefined && Array.isArray(values[0])) throw new Error("tier 1 gives a list op on an array");
        if (name === "fill" && fn === undefined) return listResult(lists.fill(values, NOWHERE, HERE));
        try {
          if (fn === undefined) return record("no-op", values.length > 0, values[0]);
          return checked(fn(...values));
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
    bad: (value) => record("bad", value),
    invalid: (thrown, domain) => failure("valid", thrown, (domains[domain] as AnyDomain).name),
    err: (site, origin, focus, ...operands) => ({ site, origin, focus, operands, detail, a: detailA, b: detailB }),
    args(site, origin, focus, errors) {
      const failed = errors.filter((e) => e !== undefined);
      return failed.length < 2 ? failed[0] : { site, origin, focus, operands: failed, detail, a: undefined, b: undefined };
    },
    raise(error) {
      raised = error;
      return F;
    },
    take() {
      const e = raised;
      if (e === undefined) return undefined;
      raised = undefined;
      return materialize(e);
    },
    // One step of `reduce`: the first domain that accepts the accumulator and has the op. No free function.
    step(name, acc, value) {
      let entries = stepEntries.get(name);
      // Stryker disable ConditionalExpression,BlockStatement,CallExpression: a miss of the cache only reads the op tables again
      if (entries === undefined) {
        entries = entriesOf(name);
        stepEntries.set(name, entries);
      }
      // Stryker restore ConditionalExpression,BlockStatement,CallExpression
      return dispatch(entries, name, [acc, value]) ?? record("no-step", acc);
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
      if (handler === undefined) return record("no-handler");
      let r: ReturnType<typeof handler>;
      try {
        r = handler(data, { space: s, position: { origin, focus }, path });
      } catch (thrown) {
        // As for an op: an exception is #CALC!, and a full call stack goes on to the program.
        return threw(thrown);
      }
      if (r.ok) return r.value;
      // EVAL.DEPTH: no list op and no ifError hides #DEPTH!, so it stops the program as an exception (COMPILE.EXT).
      // Stryker disable next-line StringLiteral: the program catches the exception, so no one reads its message
      if (isDepthError(r.error)) throw new Error("an extension gave #DEPTH!");
      return record("foreign", r.error);
    },
    var: (vars, name) => (hasVar(vars, name) ? vars[name] : F),
  };
}

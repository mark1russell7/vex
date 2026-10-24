/**
 * A reference interpreter. It is deliberately naive and short, and it follows the semantics table of
 * `docs/REVIEW.md` §6.7 without the code of `@mark1russell7/vex`. Property tests compare the two interpreters: the
 * same value, or the same error code.
 */
import { axisTargets, isVexList, resolveAddr, type Addr, type AnyDomain, type Axis, type ErrorCode, type Expr, type FixedMove, type Space } from "@mark1russell7/vex";

/** The outcome of the reference interpreter: a value, or an error code. */
export type RefOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: ErrorCode };

const err = (code: ErrorCode): RefOutcome => ({ ok: false, code });
const val = (value: unknown): RefOutcome => ({ ok: true, value });

const BAD_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const LIST_OPS = new Set(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors", "sortBy", "take", "nth", "drop", "append", "flat", "without"]);

interface Ctx {
  readonly space: Space;
  readonly origin: string;
  readonly focus: string;
  readonly env: ReadonlyMap<string, RefOutcome>;
  readonly domains: readonly AnyDomain[];
  readonly fns: Readonly<Record<string, (...a: readonly unknown[]) => unknown>>;
  /** The other spaces of the evaluation, for the axis table. */
  readonly tables: Readonly<Record<string, Space>>;
  /** The bound functions of the scope (FN.BIND), apart from the values. */
  readonly closures: ReadonlyMap<string, RefClosure>;
}

/** A bound function: its node, and the values and the functions of the place of its binding. */
interface RefClosure {
  readonly fn: Extract<Expr, { tag: "fn" }>;
  readonly env: ReadonlyMap<string, RefOutcome>;
  readonly closures: ReadonlyMap<string, RefClosure>;
}

/** The axis inside the `where` axes of an axis. */
const baseOf = (a: Axis): Axis => (a.t === "where" ? baseOf(a.axis) : a);

/** This function gives the test of a domain for a value. A test that throws rejects the value. */
const safeIs = (d: AnyDomain, x: unknown): boolean => {
  let accepted = false;
  try {
    accepted = d.is(x);
  } catch {
    // The value stays rejected.
  }
  return accepted;
};

function method(self: unknown, name: string): ((...a: unknown[]) => unknown) | undefined {
  // The loop stops at null, so a null receiver gives undefined too.
  if (BAD_NAMES.has(name) || (typeof self !== "object" && typeof self !== "function")) return undefined;
  for (let o: object | null = self; o !== null && o !== Object.prototype && o !== Function.prototype; o = Object.getPrototypeOf(o) as object | null) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d !== undefined) return typeof d.value === "function" ? (d.value as (...a: unknown[]) => unknown) : undefined;
  }
  return undefined;
}

function checkOut(x: unknown, domains: readonly AnyDomain[]): RefOutcome {
  if (x === undefined || x === null) return err("#CALC!");
  if (typeof x === "number" && !Number.isFinite(x)) return err("#NUM!");
  const d = domains.find((dom) => safeIs(dom, x));
  if (d?.valid !== undefined) {
    try {
      if (!d.valid(x)) return err("#NUM!");
    } catch {
      return err("#CALC!");
    }
  }
  return val(x);
}

function all(xs: readonly Expr[], c: Ctx): RefOutcome {
  const rs = xs.map((x) => run(x, c));
  const bad = rs.filter((r): r is { ok: false; code: ErrorCode } => !r.ok);
  // Stryker disable next-line ConditionalExpression: with one error, bad[0] is defined
  if (bad.length === 1 && bad[0] !== undefined) return bad[0];
  // Stryker disable next-line EqualityOperator: one error returns on the line before
  if (bad.length > 1) return err("#ARGS");
  return val(rs.map((r) => (r.ok ? r.value : undefined)));
}

function targets(a: Axis, c: Ctx): { ok: true; keys: { key: string; bad?: ErrorCode }[] } | { ok: false; code: ErrorCode } {
  // The context of the axis table already has the space of the table, and each key of it is a target.
  if (a.t === "table") return { ok: true, keys: c.space.keys.map((key) => ({ key })) };
  // The axis list has the keys of the items of its list. The list evaluates at the focus, before the targets.
  if (a.t === "list") {
    const r = run(a.list, c);
    if (!r.ok) return r;
    if (!isVexList(r.value)) return { ok: false, code: "#VALUE!" };
    return { ok: true, keys: r.value.items.map(({ key, result }) => (result.ok ? { key } : { key, bad: result.error.code })) };
  }
  // The reverse order has the targets of its axis from the last to the first.
  if (a.t === "reverse") {
    const inner = targets(a.axis, c);
    return inner.ok ? { ok: true, keys: inner.keys.toReversed() } : inner;
  }
  if (a.t !== "where") {
    const r = axisTargets(c.space, { origin: c.origin, focus: c.focus }, a);
    return r.ok ? { ok: true, keys: r.value.map((key) => ({ key })) } : { ok: false, code: r.error.code };
  }
  const inner = targets(a.axis, c);
  if (!inner.ok) return inner;
  const keys: { key: string; bad?: ErrorCode }[] = [];
  for (const t of inner.keys) {
    if (t.bad !== undefined) {
      keys.push(t);
      continue;
    }
    // In the space of the axis table, the origin is the target.
    const r = run(a.test, { ...c, focus: t.key, ...(baseOf(a).t === "table" ? { origin: t.key } : {}) });
    if (!r.ok) keys.push({ key: t.key, bad: r.code });
    else if (r.value === true) keys.push({ key: t.key });
    else if (r.value !== false) keys.push({ key: t.key, bad: "#VALUE!" });
  }
  return { ok: true, keys };
}

/**
 * This function gives the key of an address. The key or the position of a computed move is an expression. These
 * expressions evaluate first, at the position of the node, and the first error is the result. A key must be a text,
 * and a position must be a number. Then the moves apply in order.
 */
function keyOf(at: Addr | undefined, c: Ctx): { readonly ok: true; readonly key: string } | { readonly ok: false; readonly code: ErrorCode } {
  const values: unknown[] = [];
  for (const m of at ?? []) {
    const x = m.t === "key" && typeof m.key !== "string" ? m.key : m.t === "index" && typeof m.i !== "number" ? m.i : undefined;
    if (x === undefined) continue;
    const r = run(x, c);
    if (!r.ok) return r;
    values.push(r.value);
  }
  const fixed: FixedMove[] = [];
  for (const m of at ?? []) {
    if (m.t === "key" && typeof m.key !== "string") {
      const u = values.shift();
      if (typeof u !== "string") return { ok: false, code: "#VALUE!" };
      fixed.push({ t: "key", key: u });
    } else if (m.t === "index" && typeof m.i !== "number") {
      const u = values.shift();
      if (typeof u !== "number") return { ok: false, code: "#VALUE!" };
      fixed.push({ t: "index", i: u });
    } else fixed.push(m as FixedMove);
  }
  const r = resolveAddr(c.space, { origin: c.origin, focus: c.focus }, fixed);
  return r.ok ? { ok: true, key: r.value } : { ok: false, code: r.error.code };
}

function run(e: Expr, c: Ctx): RefOutcome {
  switch (e.tag) {
    case "lit":
      return val(e.value);
    case "var":
      // A function is not a value (FN.VALUE). A name of a loop hides a function with its name.
      return c.env.get(e.name) ?? (c.closures.has(e.name) ? err("#VALUE!") : err("#NAME?"));
    case "fn":
      // A function is only a binding of let, and the check of the shape gives the error first.
      return err("#VALUE!");
    case "call": {
      const bound = c.env.get(e.fn);
      if (bound !== undefined) return bound.ok ? err("#VALUE!") : bound;
      const callee = c.closures.get(e.fn);
      if (callee === undefined) return err("#NAME?");
      if (callee.fn.params.length !== e.args.length) return err("#VALUE!");
      // The body sees the names of the place of the binding, and the parameters hide its functions with their names.
      const env = new Map(callee.env);
      // A parameter hides a function of its name, because a read looks at the values first.
      callee.fn.params.forEach((p, i) => env.set(p, run(e.args[i] as Expr, c)));
      return run(callee.fn.body, { ...c, env, closures: callee.closures });
    }
    case "ext":
      return err("#NAME?");
    case "ref": {
      const at = keyOf(e.at, c);
      if (!at.ok) return at;
      let x: unknown = c.space.get(at.key);
      if (x === undefined || x === null) return err("#N/A");
      for (const seg of e.path) {
        // x is not undefined and not null here: the checks before the loop and after each step give #N/A for them.
        if (seg === "" || BAD_NAMES.has(seg) || (typeof x !== "object" && typeof x !== "function")) return err("#N/A");
        try {
          x = (x as Record<string, unknown>)[seg];
        } catch {
          return err("#CALC!");
        }
        if (x === undefined || x === null) return err("#N/A");
      }
      return val(x);
    }
    case "let": {
      // A binding sees only the names of the place of the let, so a function cannot call itself (FN.TOTAL).
      const env = new Map(c.env);
      const closures = new Map(c.closures);
      for (const [n, b] of Object.entries(e.bind)) {
        if (b.tag === "fn") {
          closures.set(n, { fn: b, env: c.env, closures: c.closures });
          env.delete(n);
        } else {
          env.set(n, run(b, c));
        }
      }
      return run(e.body, { ...c, env, closures });
    }
    case "rec": {
      const names = Object.keys(e.fields);
      const r = all(Object.values(e.fields), c);
      if (!r.ok) return r;
      const vs = r.value as unknown[];
      return val(Object.fromEntries(names.map((n, i) => [n, vs[i]])));
    }
    case "each": {
      // An axis with an address finds its targets from the key of the address.
      const from = keyOf(e.at, c);
      if (!from.ok) return from;
      // The axis table moves to the space of its table, where the origin is the target.
      const base = baseOf(e.axis);
      const space = base.t === "table" ? (Object.hasOwn(c.tables, base.name) ? c.tables[base.name] : undefined) : c.space;
      if (space === undefined) return err("#REF!");
      const inner: Ctx = { ...c, space };
      const t = targets(e.axis, { ...inner, focus: from.key });
      if (!t.ok) return err(t.code);
      const at = (key: string): Ctx => ({ ...inner, focus: key, ...(base.t === "table" ? { origin: key } : {}) });
      return val({
        kind: "vex.list",
        items: t.keys.map(({ key, bad }) => ({ key, result: bad === undefined ? toResult(run(e.body, at(key))) : { ok: false, error: { code: bad } } })),
      });
    }
    case "fold": {
      // The first values come before the address and the targets. The tests of where read only the names outside.
      let env = bindNames(e.init, c, c.env);
      if (!env.ok) return env;
      const from = keyOf(e.at, c);
      if (!from.ok) return from;
      const base = baseOf(e.axis);
      const space = base.t === "table" ? (Object.hasOwn(c.tables, base.name) ? c.tables[base.name] : undefined) : c.space;
      if (space === undefined) return err("#REF!");
      const inner: Ctx = { ...c, space };
      const t = targets(e.axis, { ...inner, focus: from.key });
      if (!t.ok) return err(t.code);
      for (const { key, bad } of t.keys) {
        if (bad !== undefined) return err(bad);
        const next = bindNames(e.step, { ...inner, focus: key, ...(base.t === "table" ? { origin: key } : {}), env: env.env }, env.env);
        if (!next.ok) return next;
        env = next;
      }
      return run(e.result, { ...c, env: env.env });
    }
    case "iterate": {
      let env = bindNames(e.init, c, c.env);
      if (!env.ok) return env;
      for (let k = 0; ; k++) {
        const here: Ctx = { ...c, env: env.env };
        if (e.until !== undefined) {
          const t = run(e.until, here);
          if (!t.ok) return t;
          if (t.value === true) break;
          if (t.value !== false) return err("#VALUE!");
        }
        if (k === e.limit) {
          if (e.until !== undefined) return err("#NUM!");
          break;
        }
        const next = bindNames(e.step, here, env.env);
        if (!next.ok) return next;
        env = next;
      }
      return run(e.result, { ...c, env: env.env });
    }
    case "app":
      return app(e, c);
  }
}

/**
 * This function evaluates the expressions of a record of names in `c`, in order. It gives `base` with the new values,
 * or the first error.
 */
function bindNames(
  record: Readonly<Record<string, Expr>>,
  c: Ctx,
  base: ReadonlyMap<string, RefOutcome>,
): { readonly ok: true; readonly env: ReadonlyMap<string, RefOutcome> } | { readonly ok: false; readonly code: ErrorCode } {
  const env = new Map(base);
  for (const [name, x] of Object.entries(record)) {
    const r = run(x, c);
    if (!r.ok) return r;
    env.set(name, r);
  }
  return { ok: true, env };
}

const toResult = (r: RefOutcome): unknown => (r.ok ? { ok: true, value: r.value } : { ok: false, error: { code: r.code } });

function special(e: Extract<Expr, { tag: "app" }>, c: Ctx): RefOutcome {
  const arg = (i: number): RefOutcome => {
    const x = e.args[i];
    return x === undefined ? err("#VALUE!") : run(x, c);
  };
  const bool = (i: number): RefOutcome => {
    const r = arg(i);
    return !r.ok || typeof r.value === "boolean" ? r : err("#VALUE!");
  };
  if (e.op === "ifError") {
    const a = arg(0);
    return a.ok ? a : arg(1);
  }
  if (e.op === "if") {
    const b = bool(0);
    return b.ok ? arg(b.value === true ? 1 : 2) : b;
  }
  if (e.args.length === 0) return err("#VALUE!");
  for (let i = 0; i < e.args.length; i++) {
    const b = bool(i);
    if (!b.ok) return b;
    if (e.op === "and" ? b.value === false : b.value === true) return b;
  }
  return val(e.op === "and");
}

type RefItem = { readonly key: string; readonly result: { readonly ok: boolean; readonly value?: unknown; readonly error?: { readonly code: ErrorCode } } };

/** This function gives the error of the first error item of a list, with strict (LIST.LENIENT). */
function strictError(items: readonly RefItem[], strict: boolean): RefOutcome | undefined {
  const firstBad = items.find((it) => !it.result.ok);
  // An item that is not ok has an error, so the fallback code is defensive.
  // Stryker disable StringLiteral,OptionalChaining: the fallback is defensive
  /* v8 ignore next -- @preserve */
  return strict && firstBad !== undefined ? err(firstBad.result.error?.code ?? "#CALC!") : undefined;
  // Stryker restore StringLiteral,OptionalChaining
}

/** This function compares two numbers or two texts, for the order of sortBy. */
const before = (a: unknown, b: unknown): boolean => (a as number) < (b as number);

function listOp(op: string, items: readonly RefItem[], rest: readonly unknown[], c: Ctx): RefOutcome {
  const o = op === "reduce" || op === "take" || op === "nth" || op === "drop" || op === "append" || op === "without" ? rest[1] : rest[0];
  const strict = typeof o === "object" && o !== null && (o as { strict?: unknown }).strict === true;
  const bad = strictError(items, strict);
  if (bad !== undefined) return bad;
  const vs = items.filter((it) => it.result.ok).map((it) => it.result.value);
  const good = items.filter((it) => it.result.ok);
  const nums: readonly number[] | undefined = vs.every((x): x is number => typeof x === "number") ? vs : undefined;
  const bools: readonly boolean[] | undefined = vs.every((x): x is boolean => typeof x === "boolean") ? vs : undefined;
  switch (op) {
    case "count":
      return val(vs.length);
    case "values":
      return val(vs);
    case "keys":
      return val(items.filter((it) => it.result.ok).map((it) => it.key));
    case "errors":
      return val(items.filter((it) => !it.result.ok).map((it) => it.result.error));
    case "first":
      return vs.length > 0 ? val(vs[0]) : err("#N/A");
    case "sortBy": {
      // All numbers without NaN, or all texts. toSorted is stable, so equal values keep their order.
      const kinds = new Set(vs.map((x) => typeof x));
      if (kinds.size > 1 || vs.some((x) => (typeof x !== "number" && typeof x !== "string") || Number.isNaN(x))) return err("#VALUE!");
      return val({ kind: "vex.list", items: good.toSorted((a, b) => Number(before(b.result.value, a.result.value)) - Number(before(a.result.value, b.result.value))) });
    }
    case "take":
    case "drop":
    case "nth": {
      const n = rest[0] as number;
      if (!Number.isSafeInteger(n) || n < 0) return err("#VALUE!");
      if (op === "nth") return n < vs.length ? val(vs[n]) : err("#N/A");
      return val({ kind: "vex.list", items: op === "take" ? good.slice(0, n) : good.slice(n) });
    }
    case "append":
    case "without": {
      // The second list follows the rules of the first list (LIST.BUILD).
      const other = rest[0];
      if (!isVexList(other)) return err("#VALUE!");
      const otherBad = strictError(other.items, strict);
      if (otherBad !== undefined) return otherBad;
      const more = other.items.filter((it) => it.result.ok);
      if (op === "append") return val({ kind: "vex.list", items: [...good, ...more] });
      return val({ kind: "vex.list", items: good.filter((it) => !more.some((m) => m.key === it.key)) });
    }
    case "flat": {
      // Each value is a list, and each inner list follows the rules of the first list (LIST.FLAT).
      const out: RefItem[] = [];
      for (const inner of vs) {
        if (!isVexList(inner)) return err("#VALUE!");
        const innerBad = strictError(inner.items, strict);
        if (innerBad !== undefined) return innerBad;
        out.push(...inner.items.filter((it) => it.result.ok));
      }
      return val({ kind: "vex.list", items: out });
    }
    case "sum":
      // Stryker disable next-line ArrayDeclaration: a sum needs no domain, and a list with a text accepts no value either
      return nums ? checkOut(nums.reduce((s, x) => s + x, 0), []) : err("#VALUE!");
    case "mean":
      // Stryker disable next-line ArrayDeclaration: a mean needs no domain, and a list with a text accepts no value either
      return !nums ? err("#VALUE!") : nums.length === 0 ? err("#N/A") : checkOut(nums.reduce((s, x) => s + x, 0) / nums.length, []);
    case "min":
    case "max":
      return !nums ? err("#VALUE!") : nums.length === 0 ? err("#N/A") : val(op === "min" ? Math.min(...nums) : Math.max(...nums));
    case "any":
    case "all":
    case "none": {
      if (!bools) return err("#VALUE!");
      const b = bools;
      return val(op === "any" ? b.some(Boolean) : op === "all" ? b.every(Boolean) : !b.some(Boolean));
    }
    case "reduce": {
      const name = rest[0];
      if (typeof name !== "string") return err("#VALUE!");
      if (vs.length === 0) {
        // LIST.EMPTY: the identity of the one domain with an identity for the op, or of the domain that the option names.
        const named = typeof o === "object" && o !== null ? (o as { domain?: unknown }).domain : undefined;
        if (named !== undefined && !c.domains.some((dom) => dom.name === named)) return err("#NAME?");
        const ds = c.domains.filter((dom) => Object.hasOwn(dom.ops, name) && (dom.ops[name] as { identity?: unknown }).identity !== undefined && (named === undefined || dom.name === named));
        const only = ds.length === 1 ? (ds[0]?.ops[name] as { identity: () => unknown } | undefined) : undefined;
        const id = only?.identity;
        return id === undefined ? err("#N/A") : val(id());
      }
      let acc: unknown = vs[0];
      for (const x of vs.slice(1)) {
        const has = c.domains.some((d) => safeIs(d, acc) && (Object.hasOwn(d.ops, name) || (d.methods === "all" && method(acc, name) !== undefined)));
        if (!has) return err("#NAME?");
        const r = callOp(name, [acc, x], c);
        if (!r.ok) return r;
        acc = r.value;
      }
      return val(acc);
    }
    // app() calls listOp only with a name of LIST_OPS, so this case is defensive.
    // Stryker disable ConditionalExpression,StringLiteral: app() calls listOp only with a name of LIST_OPS
    /* v8 ignore next 2 -- @preserve */
    default:
      return err("#NAME?");
    // Stryker restore ConditionalExpression,StringLiteral
  }
}

function callOp(op: string, vs: readonly unknown[], c: Ctx): RefOutcome {
  const self = vs[0];
  let accepted = false;
  for (const d of c.domains) {
    if (vs.length === 0 || !safeIs(d, self)) continue;
    accepted = true;
    const spec = Object.hasOwn(d.ops, op) && !BAD_NAMES.has(op) ? (d.ops[op] as { fn?: (...a: unknown[]) => unknown; liftScalar?: unknown; params?: readonly string[] }) : undefined;
    const m = spec?.fn === undefined && (spec !== undefined || d.methods === "all") ? method(self, op) : undefined;
    if (spec?.fn === undefined && m === undefined) continue;
    let rest = vs.slice(1);
    // An op without liftScalar, or with false, lifts no argument, so the map below changes nothing for it.
    const lift = spec?.liftScalar;
    const from = d.fromScalar;
    if (from !== undefined) {
      try {
        rest = rest.map((a, i): unknown => (typeof a === "number" && (lift === true || (Array.isArray(lift) && lift[i] === true)) ? from(a) : a));
      } catch {
        return err("#CALC!");
      }
    }
    if (spec?.params !== undefined) {
      for (let i = 0; i < rest.length; i++) {
        const k = spec.params[i] ?? "any";
        const a = rest[i];
        const okKind = k === "any" || (k === "domain" ? safeIs(d, a) : typeof a === k);
        if (!okKind) return err("#VALUE!");
      }
    }
    try {
      const out = spec?.fn !== undefined ? spec.fn(self, ...rest) : (m as (...a: unknown[]) => unknown).apply(self, rest);
      return checkOut(out, c.domains);
    } catch {
      return err("#CALC!");
    }
  }
  // A free function applies when no domain of the value has the op (spec BUILD.CALL).
  const fn = Object.hasOwn(c.fns, op) ? c.fns[op] : undefined;
  if (fn !== undefined) {
    try {
      return checkOut(fn(...vs), c.domains);
    } catch {
      return err("#CALC!");
    }
  }
  return accepted || vs.length === 0 ? err("#NAME?") : err("#VALUE!");
}

function app(e: Extract<Expr, { tag: "app" }>, c: Ctx): RefOutcome {
  if (e.op === "if" || e.op === "and" || e.op === "or" || e.op === "ifError") return special(e, c);
  const r = all(e.args, c);
  if (!r.ok) return r;
  const vs = r.value as unknown[];
  const self = vs[0];
  if (isVexList(self) && LIST_OPS.has(e.op)) {
    return listOp(e.op, self.items, vs.slice(1), c);
  }
  return callOp(e.op, vs, c);
}

/** This function evaluates an expression with the reference semantics. `fns` are the free functions of `withOptions`. */
export function referenceEvaluate(
  e: Expr,
  opts: {
    readonly space: Space;
    readonly origin: string;
    readonly domains?: readonly AnyDomain[];
    readonly fns?: Readonly<Record<string, (...a: readonly unknown[]) => unknown>>;
    readonly tables?: Readonly<Record<string, Space>>;
  },
): RefOutcome {
  if (!opts.space.has(opts.origin)) return err("#REF!");
  try {
    // Stryker disable next-line ArrayDeclaration: a list with a text accepts no value, like the empty list
    return run(e, { space: opts.space, origin: opts.origin, focus: opts.origin, env: new Map(), domains: opts.domains ?? [], fns: opts.fns ?? {}, tables: opts.tables ?? {}, closures: new Map() });
  } catch {
    return err("#CALC!");
  }
}

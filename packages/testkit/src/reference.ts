/**
 * A reference interpreter. It is deliberately naive and short, and it follows the semantics table of
 * `docs/REVIEW.md` §6.7 without the code of `@mark1russell7/vex`. Property tests compare the two interpreters: the
 * same value, or the same error code.
 */
import { axisTargets, isVexList, resolveAddr, type AnyDomain, type Axis, type ErrorCode, type Expr, type Space } from "@mark1russell7/vex";

/** The outcome of the reference interpreter: a value, or an error code. */
export type RefOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: ErrorCode };

const err = (code: ErrorCode): RefOutcome => ({ ok: false, code });
const val = (value: unknown): RefOutcome => ({ ok: true, value });

const BAD_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const LIST_OPS = new Set(["count", "sum", "min", "max", "mean", "any", "all", "none", "values", "keys", "reduce", "first", "errors"]);

interface Ctx {
  readonly space: Space;
  readonly origin: string;
  readonly focus: string;
  readonly env: ReadonlyMap<string, RefOutcome>;
  readonly domains: readonly AnyDomain[];
  readonly fns: Readonly<Record<string, (...a: readonly unknown[]) => unknown>>;
  /** The other spaces of the evaluation, for the axis table. */
  readonly tables: Readonly<Record<string, Space>>;
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

function run(e: Expr, c: Ctx): RefOutcome {
  switch (e.tag) {
    case "lit":
      return val(e.value);
    case "var":
      return c.env.get(e.name) ?? err("#NAME?");
    case "ext":
      return err("#NAME?");
    case "ref": {
      const at = resolveAddr(c.space, { origin: c.origin, focus: c.focus }, e.at);
      if (!at.ok) return err(at.error.code);
      let x: unknown = c.space.get(at.value);
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
      const env = new Map(c.env);
      for (const [n, b] of Object.entries(e.bind)) env.set(n, run(b, c));
      return run(e.body, { ...c, env });
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
      const from = resolveAddr(c.space, { origin: c.origin, focus: c.focus }, e.at);
      if (!from.ok) return err(from.error.code);
      // The axis table moves to the space of its table, where the origin is the target.
      const base = baseOf(e.axis);
      const space = base.t === "table" ? (Object.hasOwn(c.tables, base.name) ? c.tables[base.name] : undefined) : c.space;
      if (space === undefined) return err("#REF!");
      const inner: Ctx = { ...c, space };
      const t = targets(e.axis, { ...inner, focus: from.value });
      if (!t.ok) return err(t.code);
      const at = (key: string): Ctx => ({ ...inner, focus: key, ...(base.t === "table" ? { origin: key } : {}) });
      return val({
        kind: "vex.list",
        items: t.keys.map(({ key, bad }) => ({ key, result: bad === undefined ? toResult(run(e.body, at(key))) : { ok: false, error: { code: bad } } })),
      });
    }
    case "app":
      return app(e, c);
  }
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

function listOp(op: string, items: readonly RefItem[], rest: readonly unknown[], c: Ctx): RefOutcome {
  const o = op === "reduce" ? rest[1] : rest[0];
  const strict = typeof o === "object" && o !== null && (o as { strict?: unknown }).strict === true;
  const firstBad = items.find((it) => !it.result.ok);
  // An item that is not ok has an error, so the fallback code is defensive.
  // Stryker disable StringLiteral,OptionalChaining: the fallback is defensive
  /* v8 ignore next -- @preserve */
  if (strict && firstBad !== undefined) return err(firstBad.result.error?.code ?? "#CALC!");
  // Stryker restore StringLiteral,OptionalChaining
  const vs = items.filter((it) => it.result.ok).map((it) => it.result.value);
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
    return run(e, { space: opts.space, origin: opts.origin, focus: opts.origin, env: new Map(), domains: opts.domains ?? [], fns: opts.fns ?? {}, tables: opts.tables ?? {} });
  } catch {
    return err("#CALC!");
  }
}

/**
 * The check of sizes in the loops of a program (LOOP.SIZE). A step of `fold` or `iterate` gives each name a new value
 * from the values before the step. When a new value holds two copies of the old lists, the size can double at each step.
 * For example, a fold over 12 records with the step `append(xs, xs)` makes a list of 4096 items. The check finds such
 * steps before a run, from the size rules of the ops (LOOP.SIZE.OPS).
 *
 * The check is an abstract interpretation. It gives each value five measures: its size, its count, its inner count (the
 * sum of the counts of the values of its items), the size of its largest item, and its largest part (the largest item of
 * an item). Each measure is a bound: the largest value of some sums. A sum is a constant, and the measures of the old
 * values of the loops, each with a coefficient. A coefficient tells one use, a fixed number of uses, more uses, or no
 * bound. The check also keeps the kinds of each value, because the kind of the receiver selects the op.
 *
 * The check reads a program in two ways (LOOP.SIZE.READINGS). The first reading counts a read of a part of a value as a
 * use of the whole value. The second reading uses the bound of the part. Each reading gives a sound bound, so one
 * reading that accepts a program makes the program valid.
 */
import { isOpName, type AnyDomain, type OpSpec, type ReturnKind, type SizeMeasure, type SizeRule, type SizeTerm, type SizeUse } from "./domain.ts";
import { addrExprs, children, limitAxis, listOf, type Axis, type Expr, type ExprOf, type ItemNames } from "./ir.ts";
import { joinKind as kindOfJoin } from "./fix.ts";
import { isListOp, isVexList, LIST_SIZES, type ListOp } from "./list.ts";

/** The options of the check of sizes: the domains and the functions of the host, as for `compile`. */
export interface SizeOptions {
  readonly domains?: readonly AnyDomain[];
  /** The functions of the host. A function with the property `size` has that size rule, and another function has none. */
  readonly fns?: Readonly<Record<string, unknown>>;
}

/** A coefficient: 1 for one use, 2 for a fixed number of uses, 3 for more uses, and 4 for no bound. */
type Coef = 1 | 2 | 3 | 4;

/** A sum: a constant (`Infinity` for a constant without a known value) and a coefficient for each variable. */
interface Sum {
  readonly base: number;
  readonly terms: ReadonlyMap<string, Coef>;
}

/** A bound: the largest value of some sums (LOOP.SIZE.BRANCH). A bound has at least one sum, and no sum covers another. */
type Form = readonly Sum[];

/** The kinds of a value: a set of tags, or `undefined` for each kind. `item` is the kind of the items of a list. */
interface Kind {
  readonly tags: ReadonlySet<string> | undefined;
  readonly item?: Kind;
}

/**
 * The measures and the kinds of a value. `long` tells that a key in the value can be long. A key of a record, of a
 * position or of a literal has a fixed bound. A key of `group` is a value of the program.
 */
interface Shape {
  readonly size: Form;
  readonly count: Form;
  readonly inner: Form;
  readonly item: Form;
  readonly part: Form;
  readonly kind: Kind;
  readonly long: boolean;
}

const NO_TERMS: ReadonlyMap<string, Coef> = new Map();
const NONE: Form = [{ base: 0, terms: NO_TERMS }];
const constant = (base: number): Form => (base === 0 ? NONE : [{ base, terms: NO_TERMS }]);
const SOME = constant(Infinity);
const MEASURES: readonly SizeMeasure[] = ["size", "count", "inner", "item", "part"];
/** The most sums of a bound. A bound with more sums becomes one sum, so the work of the check has a limit. */
const MOST_SUMS = 8;

const ANY: Kind = { tags: undefined };
const NO_KIND: Kind = { tags: new Set() };
const kindOf = (tag: string): Kind => ({ tags: new Set([tag]) });
const listKind = (item: Kind, tag = "list"): Kind => ({
  tags: new Set([tag]),
  item,
});
const NUMBER = kindOf("number");
const BOOLEAN = kindOf("boolean");
const STRING = kindOf("string");
const SCALAR: Kind = { tags: new Set(["number", "boolean"]) };
/** The tags of the values that have no methods: an op of a domain needs its function for them. */
const PRIMITIVES: ReadonlySet<string> = new Set(["number", "string", "boolean", "null"]);
/** The tags of the values without a size. */
const SCALARS: ReadonlySet<string> = new Set(["number", "boolean", "null"]);

/** The shape of a value without a size, and the shape of a value with a fixed bound. */
const zero = (kind: Kind): Shape => ({
  size: NONE,
  count: NONE,
  inner: NONE,
  item: NONE,
  part: NONE,
  kind,
  long: false,
});
const fixed = (kind: Kind): Shape => ({
  size: SOME,
  count: SOME,
  inner: SOME,
  item: SOME,
  part: SOME,
  kind,
  long: false,
});

const isZero = (s: Sum): boolean => s.base === 0 && s.terms.size === 0;
const isNone = (f: Form): boolean => f.every(isZero);
const term = (v: string, c: Coef): Form => [{ base: 0, terms: new Map([[v, c]]) }];

/** This function tells if the sum `a` is at least the sum `b` for each value of the variables. */
const covers = (a: Sum, b: Sum): boolean => a.base >= b.base && [...b.terms].every(([v, c]) => (a.terms.get(v) ?? 0) >= c);

/** This function gives one sum that is at least each sum of a bound: the largest constant and the largest coefficients. */
function cover(f: Form): Sum {
  const terms = new Map<string, Coef>();
  let base = 0;
  for (const s of f) {
    base = Math.max(base, s.base);
    for (const [v, c] of s.terms) terms.set(v, Math.max(terms.get(v) ?? 0, c) as Coef);
  }
  return { base, terms };
}

/** This function gives the bound of some sums, without a sum that another sum covers, and with at most `MOST_SUMS` sums. */
function bound(sums: readonly Sum[]): Form {
  let out: readonly Sum[] = [];
  for (const s of sums) if (!out.some((o) => covers(o, s))) out = [...out.filter((o) => !covers(s, o)), s];
  if (out.length > MOST_SUMS) return [cover(out)];
  return out.length === 0 ? NONE : out;
}

/** This function gives the sum of two sums: the coefficients of a variable in both sums give more uses. */
function add(a: Sum, b: Sum): Sum {
  const terms = new Map(a.terms);
  for (const [v, c] of b.terms) {
    const o = terms.get(v);
    terms.set(v, o === undefined ? c : (Math.max(3, o, c) as Coef));
  }
  return { base: a.base + b.base, terms };
}

/** This function gives the bound of a sum of two values. */
function plus(a: Form, b: Form): Form {
  if (isNone(a)) return b;
  if (isNone(b)) return a;
  return bound(a.flatMap((x) => b.map((y) => add(x, y))));
}

/** This function gives the bound of the larger of two values. */
const join = (a: Form, b: Form): Form => bound([...a, ...b]);

/** This function gives the bound of a union of two values: each variable with its largest coefficient, and the sum of the constants. */
const union = (a: Form, b: Form): Form => {
  const all = cover([...a, ...b]);
  return [{ base: cover(a).base + cover(b).base, terms: all.terms }];
};

/** This function gives the bound of `k` uses of a bound. */
function scale(f: Form, k: 0 | Coef): Form {
  if (k === 0) return NONE;
  if (k === 1) return f;
  return bound(f.map((s) => ({ base: s.base === 0 ? 0 : Infinity, terms: new Map([...s.terms].map(([v, c]) => [v, Math.max(c, k) as Coef])) })));
}

/** This function gives a bound of a product of two sums. A product of two variables gives more uses of both. */
function multiply(a: Sum, b: Sum): Form {
  if (isZero(a) || isZero(b)) return NONE;
  if (a.terms.size === 0) return a.base <= 1 ? [b] : scale([b], 2);
  if (b.terms.size === 0) return b.base <= 1 ? [a] : scale([a], 2);
  return scale([add(a, b)], 3);
}

/** This function gives a bound of a product of two values. */
const times = (a: Form, b: Form): Form => bound(a.flatMap((x) => b.flatMap((y) => multiply(x, y))));

/** This function puts a bound in the place of each variable that `sigma` knows. */
function subst(f: Form, sigma: (v: string) => Form | undefined): Form {
  const one = (s: Sum): Form => {
    let out = constant(s.base);
    for (const [v, c] of s.terms) {
      const u = sigma(v);
      out = plus(out, u === undefined ? term(v, c) : scale(u, c));
    }
    return out;
  };
  return bound(f.flatMap(one));
}

/** This function gives the sum without the variables that `drop` names, and the coefficients of these variables. */
function split(s: Sum, drop: (v: string) => boolean): { readonly rest: Sum; readonly dropped: ReadonlyMap<string, Coef> } {
  const terms = new Map<string, Coef>();
  const dropped = new Map<string, Coef>();
  for (const [v, c] of s.terms) (drop(v) ? dropped : terms).set(v, c);
  return { rest: { base: s.base, terms }, dropped };
}

const sameSum = (a: Sum, b: Sum): boolean => a.base === b.base && a.terms.size === b.terms.size && [...a.terms].every(([v, c]) => b.terms.get(v) === c);
const sameForm = (a: Form, b: Form): boolean => a.length === b.length && a.every((x) => b.some((y) => sameSum(x, y)));

/** This function tells if a kind can be a list or an array. */
const listy = (k: Kind): boolean => k.tags === undefined || k.tags.has("list") || k.tags.has("array");

/** This function gives the kind of the items of a value: no kind for a value that is not a list. */
const itemOf = (k: Kind): Kind => (listy(k) ? (k.item ?? ANY) : NO_KIND);

/** This function gives the kind of a value of two kinds. */
function joinKind(a: Kind, b: Kind): Kind {
  if (a.tags === undefined || b.tags === undefined) return ANY;
  const tags = new Set([...a.tags, ...b.tags]);
  return listy(a) || listy(b) ? { tags, item: joinKind(itemOf(a), itemOf(b)) } : { tags };
}

/** This function tells if each value of the kind `a` has the kind `b`. */
function within(a: Kind, b: Kind): boolean {
  if (b.tags === undefined) return true;
  if (a.tags === undefined) return false;
  for (const t of a.tags) if (!b.tags.has(t)) return false;
  return !listy(a) || within(itemOf(a), itemOf(b));
}

const isText = (k: Kind | undefined): boolean => k?.tags !== undefined && k.tags.size === 1 && k.tags.has("string");

const joinShape = (a: Shape, b: Shape): Shape => ({
  size: join(a.size, b.size),
  count: join(a.count, b.count),
  inner: join(a.inner, b.inner),
  item: join(a.item, b.item),
  part: join(a.part, b.part),
  kind: joinKind(a.kind, b.kind),
  long: a.long || b.long,
});

/** This function puts a bound in the place of each variable that `sigma` knows, in each measure of a shape. */
const substShape = (s: Shape, sigma: (v: string) => Form | undefined): Shape => ({
  ...s,
  size: subst(s.size, sigma),
  count: subst(s.count, sigma),
  inner: subst(s.inner, sigma),
  item: subst(s.item, sigma),
  part: subst(s.part, sigma),
});

/** This function gives the coefficient of a use. */
function coefOf(use: SizeUse): 0 | Coef {
  switch (use) {
    case 0:
    case "number":
      return 0;
    case 1:
      return 1;
    case "scaled":
    case "copies":
    case "text":
      return 2;
    case "many":
    case "each":
    case "limit":
      return 3;
    case "unbounded":
      return 4;
  }
}

/** The letters of the variables of the measures. */
const LETTERS: Readonly<Record<SizeMeasure, string>> = { size: "s", count: "c", inner: "n", item: "t", part: "p" };
/** The name of the variable of a measure of a value with the number `id`, for example `s1` for its size. */
const variable = (m: SizeMeasure, id: number): string => `${LETTERS[m]}${String(id)}`;
/** The shape of a value with a variable for each measure. A number, a boolean and null have no size. */
const shapeOfVar = (id: number, kind: Kind, long: boolean): Shape =>
  kind.tags !== undefined && [...kind.tags].every((t) => SCALARS.has(t))
    ? zero(kind)
    : {
        size: term(variable("size", id), 1),
        count: term(variable("count", id), 1),
        inner: term(variable("inner", id), 1),
        item: term(variable("item", id), 1),
        part: term(variable("part", id), 1),
        kind,
        long,
      };

/** The value of a name in the check: a shape, or the summary of a function (FN.BIND). */
type Entry =
  | { readonly t: "value"; readonly shape: Shape }
  | {
      readonly t: "fn";
      readonly params: readonly number[];
      readonly result: Shape;
    };
type Env = ReadonlyMap<string, Entry>;

/** A refusal of the check. The check throws it, and `sizeError` gives its message. */
class Refusal {
  readonly message: string;
  constructor(message: string) {
    this.message = message;
  }
}

/** The literal number of an argument, if the argument is a literal number. */
const literalNumber = (e: Expr | undefined): number | undefined => (e?.tag === "lit" && typeof e.value === "number" ? e.value : undefined);

/** The tag of the values of a domain: its primitive kind, or its name. */
const tagOf = (d: AnyDomain): string => d.primitive ?? `d:${d.name}`;

/** This function tells if a domain accepts a value with a tag: surely, maybe or no. `undefined` is each tag. */
function accepts(d: AnyDomain, tag: string | undefined): "sure" | "maybe" | "no" {
  if (tag === undefined) return "maybe";
  if (tag === tagOf(d)) return "sure";
  // KIND.PRIMITIVE: a domain with a primitive kind accepts each value of that type and no other value.
  if (d.primitive !== undefined) return tag.startsWith("d:") ? "maybe" : "no";
  return "maybe";
}

/** The number of the nodes that the check reads with the kinds of the names of the loops, before it uses each kind. */
const BUDGET = 50_000;

/** The check of one program. It keeps the shape of each node, to name the op of a refusal. */
class Checker {
  readonly #domains: readonly AnyDomain[];
  readonly #fns: Readonly<Record<string, unknown>> | undefined;
  readonly #shapes = new Map<Expr, Shape>();
  readonly #open = new Map<Expr, boolean>();
  /** With `true`, the check keeps the largest part as a measure and reads the rules `byParts` (LOOP.SIZE.READINGS). */
  readonly #parts: boolean;
  #next = 0;
  #visits = 0;

  constructor(opts: SizeOptions, parts: boolean) {
    this.#domains = opts.domains ?? [];
    this.#fns = opts.fns;
    this.#parts = parts;
  }

  shape(e: Expr, env: Env): Shape {
    this.#visits++;
    const found = this.#shape(e, env);
    // The first reading has no measure under the largest item, so the largest part of a value is its largest item.
    const s = this.#parts ? found : { ...found, part: found.item };
    this.#shapes.set(e, s);
    return s;
  }

  #fresh(): number {
    return this.#next++;
  }

  #shape(e: Expr, env: Env): Shape {
    switch (e.tag) {
      case "lit":
        return this.#literal(e.value);
      case "ref":
        for (const x of addrExprs(e.at)) this.shape(x, env);
        return fixed(ANY);
      case "var": {
        const entry = env.get(e.name);
        // A free name is a variable of the caller, so its value does not change in a loop. A function is not a value.
        return entry === undefined ? fixed(ANY) : entry.t === "value" ? entry.shape : zero(NO_KIND);
      }
      case "ext":
        return fixed(ANY);
      case "rec": {
        const fields = Object.values(e.fields).map((x) => this.shape(x, env));
        const size = fields.reduce((acc, x) => plus(acc, x.size), SOME);
        // LOOP.SIZE.PART: the items of a record are its fields, so one field gives the largest item.
        const item = fields.reduce((acc, x) => join(acc, x.size), NONE);
        const part = fields.reduce((acc, x) => join(acc, x.item), NONE);
        return { ...fixed(kindOf("object")), size, item, part, long: fields.some((x) => x.long) };
      }
      case "let":
        return this.#let(e, env);
      case "call":
        return this.#call(e, env);
      case "app":
        return this.#app(e, env);
      case "each":
        return this.#each(e, env);
      case "fold":
      case "iterate":
        return this.#loop(e, env);
      case "fix":
        // A column gives a boolean or a number, so a list of the program cannot grow through it.
        this.shape(e.init, env);
        this.shape(e.step, env);
        return zero(kindOfJoin(e.join) === "boolean" ? BOOLEAN : NUMBER);
      case "last":
        return zero(SCALAR);
      case "fn":
        return zero(NO_KIND);
    }
  }

  /** This method gives the shape of a literal value: a constant, and its kind. */
  #literal(value: unknown): Shape {
    if (typeof value === "number") return zero(NUMBER);
    if (typeof value === "boolean") return zero(BOOLEAN);
    if (value === null || value === undefined) return zero(kindOf("null"));
    if (typeof value === "string") {
      const length = constant(value.length);
      return { ...zero(STRING), size: length, item: length, part: length };
    }
    if (isVexList(value)) {
      const item = value.items.reduce((k, it) => (it.result.ok ? joinKind(k, this.#literal(it.result.value).kind) : k), NO_KIND);
      return { ...fixed(listKind(item)), count: constant(value.items.length) };
    }
    if (Array.isArray(value))
      return {
        ...fixed(
          listKind(
            value.reduce((k: Kind, x: unknown) => joinKind(k, this.#literal(x).kind), NO_KIND),
            "array",
          ),
        ),
        count: constant(value.length),
      };
    const d = this.#domains.find((x) => {
      try {
        return x.is(value);
      } catch {
        return false;
      }
    });
    return fixed(d === undefined ? kindOf("object") : kindOf(tagOf(d)));
  }

  #let(e: ExprOf<"let">, env: Env): Shape {
    const inner = new Map(env);
    // FN.TOTAL: a binding does not see the other bindings of its let.
    for (const [name, b] of Object.entries(e.bind)) {
      if (b.tag === "fn") {
        // FN.CALL: the check reads the body one time, with a variable for each parameter. A call puts the shapes of
        // its arguments in the place of the variables.
        const params = b.params.map((p) => [p, this.#fresh()] as const);
        const fenv = new Map(env);
        for (const [p, id] of params) fenv.set(p, { t: "value", shape: shapeOfVar(id, ANY, true) });
        inner.set(name, { t: "fn", params: params.map(([, id]) => id), result: this.shape(b.body, fenv) });
      } else inner.set(name, { t: "value", shape: this.shape(b, env) });
    }
    return this.shape(e.body, inner);
  }

  #call(e: ExprOf<"call">, env: Env): Shape {
    const args = e.args.map((a) => this.shape(a, env));
    const entry = env.get(e.fn);
    // FN.ARGS: a call of a value, of a missing name or with another number of arguments gives an error.
    if (entry?.t !== "fn" || entry.params.length !== args.length) return zero(NO_KIND);
    const bound = new Map<string, Form>();
    entry.params.forEach((id, i) => {
      for (const m of MEASURES) bound.set(variable(m, id), (args[i] as Shape)[m]);
    });
    const sigma = (v: string): Form | undefined => bound.get(v);
    return { ...substShape(entry.result, sigma), long: entry.result.long || args.some((a) => a.long) };
  }

  #app(e: ExprOf<"app">, env: Env): Shape {
    const args = e.args.map((a) => this.shape(a, env));
    switch (e.op) {
      case "if":
      case "ifError": {
        // FORM.IF: the test does not add to the size. A missing argument gives an error, which has no size.
        const outs = e.op === "if" ? args.slice(1, 3) : args.slice(0, 2);
        const [head = zero(NO_KIND), ...rest] = outs;
        return rest.reduce(joinShape, head);
      }
      case "and":
      case "or":
        return zero(BOOLEAN);
    }
    const { op } = e;
    const outs: Shape[] = [];
    let open = false;
    const listOp = isListOp(op) ? op : undefined;
    const fn = this.#fns !== undefined && Object.hasOwn(this.#fns, op) ? this.#fns[op] : undefined;
    const byFn = (): void => {
      const host = fn as { readonly size?: SizeRule; readonly returns?: ReturnKind };
      if (host.size === undefined) open = true;
      else outs.push(this.#apply(host.size, args, e.args, kindOfReturn(host.returns, undefined, this.#domains)));
    };
    const self = args[0]?.kind;
    // The order of the interpreter: a list op on a list, the domains in order, a function of the host, a list op on an
    // array (LIST.ARRAY), and fill.
    const tags = self === undefined ? [] : self.tags === undefined ? [undefined] : [...self.tags];
    for (const tag of tags) {
      if (listOp !== undefined && (tag === undefined || tag === "list")) {
        outs.push(this.#list(listOp, args, e.args));
        if (tag === "list") continue;
      }
      const d = this.#domain(op, tag, args, e.args, outs);
      open ||= d.open;
      if (d.done) continue;
      if (fn !== undefined) byFn();
      else if (listOp !== undefined && (tag === undefined || tag === "array")) outs.push(this.#list(listOp, args, e.args));
      else if (op === "fill") outs.push(this.#list("fill", args, e.args));
    }
    if (self === undefined && fn !== undefined) byFn();
    // LOOP.SIZE.OPS: an op without a size rule has no bound (fail closed).
    if (open) outs.push(unbounded(args));
    this.#open.set(e, open);
    // An op that no domain and no function has gives an error, and an error has no size.
    return outs.slice(1).reduce(joinShape, outs[0] ?? zero(NO_KIND));
  }

  /**
   * This method adds the shapes of the ops of the domains that can take a receiver with the tag. It gives `true` for an
   * op without a size rule. A domain that surely takes the receiver and has a function for the op is the last domain,
   * and then `done` is `true`.
   */
  #domain(
    op: string,
    tag: string | undefined,
    args: readonly Shape[],
    exprs: readonly Expr[],
    outs: Shape[],
  ): { readonly open: boolean; readonly done: boolean } {
    if (!isOpName(op)) return { open: false, done: false };
    let open = false;
    for (const d of this.#domains) {
      const a = accepts(d, tag);
      if (a === "no") continue;
      const spec = Object.hasOwn(d.ops, op) ? (d.ops[op] as OpSpec<unknown>) : undefined;
      // A method needs an object: a number, a text, a boolean and null have no methods (findMethod).
      const method = (spec !== undefined || d.methods === "all") && (tag === undefined || !PRIMITIVES.has(tag));
      if (spec?.fn === undefined && !method) continue;
      const rule = spec === undefined ? undefined : ruleOf(d, spec, this.#domains);
      if (rule === undefined) open = true;
      else outs.push(this.#apply(rule, args, exprs, kindOfReturn(spec?.returns, d, this.#domains)));
      if (a === "sure" && spec?.fn !== undefined) return { open, done: true };
    }
    return { open, done: false };
  }

  /** This method gives the shape of a list op, and the kind of its result. */
  #list(op: ListOp | "fill", args: readonly Shape[], exprs: readonly Expr[]): Shape {
    // The receiver selects a list op, so the op has a first argument.
    const item = itemOf((args[0] as Shape).kind);
    const s = this.#apply(LIST_SIZES[op], args, exprs, listResult(op, item, args));
    return op === "group" ? { ...s, long: true } : s;
  }

  #apply(rule: SizeRule, args: readonly Shape[], exprs: readonly Expr[], kind: Kind): Shape {
    // The rule "scalar" tells that the result is a number or a boolean.
    if (rule === "scalar") return zero(kind.tags === undefined ? SCALAR : kind);
    if (rule === "fixed") return fixed(kind);
    if (rule === "reduce") return { ...this.#reduce(args, exprs), kind };
    const limit = rule.limit === undefined ? undefined : literalNumber(exprs[rule.limit]);
    // LOOP.SIZE.PART: a rule with a limit gives a bound for each item, so it needs a literal limit and short keys.
    const open = rule.limit !== undefined && (limit === undefined || args.some((a) => a.long));
    const r = this.#parts && !open ? (rule.byParts ?? rule) : rule;
    const sum = (terms: readonly SizeTerm[], own: SizeMeasure): Form =>
      args.reduce((acc, a, i) => {
        const t = terms[i] ?? r.rest ?? "many";
        const [use, of] = typeof t === "object" ? t : [t, own];
        const f = useForm(use, i, a[of], args, exprs, limit);
        // The largest item of the result is an item of one argument, so the arguments give the largest bound.
        if (own === "item" || own === "part") return join(acc, f);
        return r.union === true ? union(acc, f) : plus(acc, f);
      }, NONE);
    let size = sum(r.size, "size");
    let count = r.count === undefined ? size : sum(r.count, "count");
    const inner = r.inner === undefined ? size : sum(r.inner, "inner");
    if (limit !== undefined) count = constant(limit);
    if (r.constant === true) {
      size = plus(size, SOME);
      count = plus(count, SOME);
    }
    if (r.keys === "position") size = plus(size, times(count, SOME));
    const item = r.item === undefined ? size : sum(r.item, "item");
    const part = r.part === undefined ? item : sum(r.part, "part");
    return { size, count, inner, item, part, kind, long: args.some((a) => a.long) };
  }

  /** The rule of `reduce`: the op that the second argument names folds the values of the list (LIST.REDUCE). */
  #reduce(args: readonly Shape[], exprs: readonly Expr[]): Shape {
    const list = args[0] as Shape;
    const name = exprs[1]?.tag === "lit" ? exprs[1].value : undefined;
    if (typeof name !== "string" || !isOpName(name)) return unbounded([list]);
    // The empty list gives the identity of the op: a constant.
    let out: Shape = fixed(ANY);
    for (const d of this.#domains) {
      if (!Object.hasOwn(d.ops, name)) {
        if (d.methods === "all") return unbounded([list]);
        continue;
      }
      const rule = ruleOf(d, d.ops[name] as OpSpec<unknown>, this.#domains);
      if (rule === undefined || rule === "reduce") return unbounded([list]);
      if (rule === "scalar" || rule === "fixed") continue;
      const use = (i: number): 0 | Coef => {
        const t = rule.size[i] ?? rule.rest ?? "many";
        return coefOf(typeof t === "object" ? t[0] : t);
      };
      // The first argument is the result of the steps before. More than one use of it doubles at each value.
      const first = use(0);
      if (first > 1) return unbounded([list]);
      // A union holds each key one time, so the result is not larger than the list.
      const k = rule.union === true ? 1 : (Math.max(1, use(1)) as Coef);
      const size = rule.constant === true ? plus(scale(list.size, k), SOME) : scale(list.size, k);
      out = joinShape(out, {
        size,
        count: size,
        inner: size,
        item: size,
        part: size,
        kind: ANY,
        long: list.long,
      });
    }
    return out;
  }

  #each(e: ExprOf<"each">, env: Env): Shape {
    const list = this.#axis(e.axis, e.at, env);
    if (list === undefined) {
      const body = this.shape(e.body, bindItem(env, e.as, fixed(ANY)));
      // A fixed number of targets: the records of the space.
      return {
        size: plus(SOME, times(body.size, SOME)),
        count: SOME,
        inner: times(body.count, SOME),
        item: body.size,
        part: body.item,
        kind: listKind(body.kind),
        long: body.long,
      };
    }
    const id = this.#fresh();
    const body = this.shape(e.body, bindItem(env, e.as, shapeOfVar(id, itemOf(list.kind), list.long)));
    const vars = new Map(MEASURES.map((m) => [variable(m, id), m]));
    // The sum over the items of a bound of the body: a use of the item adds the measures of the list.
    const over = (f: Form, keys: boolean): Form => {
      // Each item can take another sum of the bound, so the sum over the items uses one sum that covers each sum.
      const { rest, dropped } = split(cover(f), (v) => vars.has(v));
      const c = (m: SizeMeasure): 0 | Coef => dropped.get(variable(m, id)) ?? 0;
      // The inner count, the largest item and the largest part of an item are not larger than its size.
      const uses = [c("size"), c("inner"), c("item"), c("part")].filter((x) => x > 0);
      const sizes = uses.length === 0 ? 0 : uses.length === 1 ? (uses[0] as Coef) : 3;
      // The items keep the keys of the list. A key with a fixed bound adds a constant for each item, and a long key is a
      // part of the size of the list.
      const whole = scale(list.size, keys && list.long ? (Math.max(1, sizes) as Coef) : sizes);
      // LOOP.SIZE.PART: more than one use of each item has the bound of the count of the items times the largest item.
      const values = this.#parts && sizes > 1 && !(keys && list.long) ? scale(times(c("size") > 0 || c("inner") > 0 ? list.item : list.part, list.count), sizes as Coef) : whole;
      const short = keys && !list.long ? times(list.count, SOME) : NONE;
      return plus(plus(plus(values, short), scale(list.inner, c("count"))), times([rest], list.count));
    };
    // The largest item of the result is the value of the body for one item of the list.
    const one = itemMeasures(list);
    const sigma = (v: string): Form | undefined => {
      const m = vars.get(v);
      return m === undefined ? undefined : one[m];
    };
    return {
      size: over(body.size, true),
      count: list.count,
      inner: over(body.count, false),
      item: subst(body.size, sigma),
      part: subst(body.item, sigma),
      kind: listKind(body.kind),
      long: list.long || body.long,
    };
  }

  /** This method checks the parts of an axis and of an address. It gives the shape of the list of the axis `list`. */
  #axis(axis: Axis, at: ExprOf<"each">["at"], env: Env): Shape | undefined {
    const list = listOf(axis);
    const shape = list === undefined ? undefined : this.shape(list, env);
    // The tests of `where` and the address do not add to the size.
    for (let x = axis; x.t === "where" || x.t === "reverse"; x = x.axis) if (x.t === "where") this.shape(x.test, env);
    for (const x of addrExprs(at)) this.shape(x, env);
    return shape;
  }

  #loop(e: ExprOf<"fold"> | ExprOf<"iterate">, env: Env): Shape {
    const list = e.tag === "fold" ? this.#axis(e.axis, e.at, env) : undefined;
    // ITERATE.LIMIT.DATA: a data limit has the bound of a fold over its axis, and the steps of iterate have no item.
    const axis = e.tag === "iterate" ? limitAxis(e) : undefined;
    const sized = axis === undefined ? undefined : this.#axis(axis, undefined, env);
    const names = Object.keys(e.init);
    const init = new Map(names.map((n) => [n, this.shape(e.init[n] as Expr, env)]));
    const ids = new Map(names.map((n) => [n, this.#fresh()]));
    const stepped = Object.keys(e.step);
    // AXIS.LIST.ITEM: the item of a fold over a list is the value of one item of the list.
    const item: Shape =
      list === undefined
        ? fixed(ANY)
        : { ...itemMeasures(list), kind: itemOf(list.kind), long: list.long };
    // The kinds of the names. The first step reads the values of init. The other steps read the values of the steps: the
    // kinds of the first step, then also the kinds of the next steps, then each kind. A large program uses each kind
    // at once, for each step.
    type Assumed = { readonly kind: Kind; readonly long: boolean };
    const each: Assumed = { kind: ANY, long: true };
    const start = (n: string): Shape => init.get(n) as Shape;
    const fromInit = (n: string): Assumed => ({ kind: start(n).kind, long: start(n).long });
    const always = (): Map<string, Assumed> => new Map(names.map((n) => [n, stepped.includes(n) ? each : fromInit(n)]));
    const run = (assumed: ReadonlyMap<string, Assumed>): { readonly senv: Env; readonly steps: Map<string, Shape> } => {
      const senv = new Map(env);
      for (const n of names) {
        const a = assumed.get(n) as Assumed;
        senv.set(n, { t: "value", shape: shapeOfVar(ids.get(n) as number, a.kind, a.long) });
      }
      const ienv = e.tag === "fold" ? bindItem(senv, e.as, item) : senv;
      return { senv, steps: new Map(stepped.map((n) => [n, this.shape(e.step[n] as Expr, ienv)])) };
    };
    let first: ReadonlyMap<string, Shape> | undefined;
    let assumed: Map<string, Assumed>;
    if (stepped.length > 0 && this.#visits < BUDGET) {
      first = run(new Map(names.map((n) => [n, fromInit(n)]))).steps;
      assumed = new Map(
        names.map((n): [string, Assumed] => {
          const s = first?.get(n);
          return [n, s === undefined ? fromInit(n) : { kind: s.kind, long: s.long }];
        }),
      );
    } else assumed = always();
    let senv: Env;
    let steps: Map<string, Shape>;
    for (let pass = 0; ; pass++) {
      ({ senv, steps } = run(assumed));
      const next = new Map(
        names.map((n): [string, Assumed] => {
          const a = assumed.get(n) as Assumed;
          const s = steps.get(n);
          return [n, s === undefined ? a : { kind: joinKind(a.kind, s.kind), long: a.long || s.long }];
        }),
      );
      const stable = names.every((n) => {
        const a = assumed.get(n) as Assumed;
        const b = next.get(n) as Assumed;
        return within(b.kind, a.kind) && (a.long || !b.long);
      });
      if (stable) break;
      // The second reading keeps the keys that the steps can give: `take` needs them (LOOP.SIZE.PART). Each pass after the
      // first pass only changes the keys from short to long, so the loop ends.
      assumed = pass === 0 && this.#visits < BUDGET ? next : this.#parts ? new Map(names.map((n): [string, Assumed] => {
        const b = next.get(n) as Assumed;
        return [n, stepped.includes(n) ? { kind: ANY, long: b.long } : b];
      })) : always();
    }
    if (e.tag === "iterate" && e.until !== undefined) this.shape(e.until, senv);
    const loop = new Loop(e, names, ids, steps);
    // LOOP.SIZE: the rule applies to the steps after the first step. One step can multiply the values one time.
    loop.check(this.#shapes, this.#open);
    // The values after the first step: the first step reads the values of init.
    const sigma = (v: string): Form | undefined => {
      for (const n of names) {
        const id = ids.get(n) as number;
        const m = MEASURES.find((x) => variable(x, id) === v);
        if (m !== undefined) return start(n)[m];
      }
      return undefined;
    };
    const starts = new Map(
      names.map((n): [string, Shape] => {
        const a = start(n);
        const s = first?.get(n);
        if (s === undefined) return [n, a];
        return [n, joinShape(a, substShape(s, sigma))];
      }),
    );
    const last = loop.last(starts, list?.count ?? sized?.count ?? (e.tag === "iterate" && typeof e.limit === "number" ? constant(e.limit) : SOME));
    const renv = new Map(env);
    for (const n of names) {
      const a = assumed.get(n) as Assumed;
      const s = last.get(n) as Shape;
      const i = start(n);
      // With no step, the result reads the values of init.
      renv.set(n, { t: "value", shape: stepped.includes(n) ? { ...s, kind: joinKind(i.kind, a.kind), long: i.long || a.long } : i });
    }
    return this.shape(e.result, renv);
  }
}

/** This function gives the kind of the result of an op of the domain `d`, or of a function of the host, from `returns` (KIND.RETURNS). */
function kindOfReturn(r: ReturnKind | undefined, d: AnyDomain | undefined, domains: readonly AnyDomain[]): Kind {
  if (r === "number" || r === "boolean" || r === "string") return kindOf(r);
  if (r === "domain") return d === undefined ? ANY : kindOf(tagOf(d));
  if (r?.startsWith("domain:") === true) {
    const target = domains.find((x) => x.name === r.slice("domain:".length));
    return target === undefined ? ANY : kindOf(tagOf(target));
  }
  return ANY;
}

/** This function gives the kind of the result of a list op. `item` is the kind of the items of the receiver. */
function listResult(op: ListOp | "fill", item: Kind, args: readonly Shape[]): Kind {
  switch (op) {
    case "count":
    case "sum":
    case "mean":
    case "min":
    case "max":
    case "indexOf":
      return NUMBER;
    case "any":
    case "all":
    case "none":
      return BOOLEAN;
    case "join":
      return STRING;
    case "values":
      return listKind(item, "array");
    case "keys":
      return listKind(STRING, "array");
    case "first":
    case "nth":
    case "get":
      return item;
    case "sortBy":
    case "take":
    case "drop":
    case "without":
    case "distinct":
      return listKind(item);
    case "append":
      return listKind(joinKind(item, itemOf(args[1]?.kind ?? ANY)));
    case "setNth":
      return listKind(joinKind(item, args[2]?.kind ?? ANY));
    case "flat":
      return listKind(itemOf(item));
    case "group":
      return listKind(listKind(item));
    case "fill":
      return listKind(args[1]?.kind ?? ANY);
    case "errors":
    case "reduce":
      return ANY;
  }
}

/** This function binds the names `as` of a loop: the item gets `item`, and the index is a number. */
function bindItem(env: Env, as: ItemNames | undefined, item: Shape): Env {
  if (as === undefined) return env;
  const out = new Map(env);
  out.set(as[0], { t: "value", shape: item });
  if (as[1] !== undefined) out.set(as[1], { t: "value", shape: zero(NUMBER) });
  return out;
}

/** The shape of the result of an op without a size rule: no bound in the sizes of its arguments. */
function unbounded(args: readonly Shape[]): Shape {
  const f = scale(
    args.reduce((acc, a) => plus(acc, a.size), SOME),
    4,
  );
  return { size: f, count: f, inner: f, item: f, part: f, kind: ANY, long: true };
}

/** The measures of one item of a list. The largest item of the list bounds its size, and the largest part bounds the rest. */
const itemMeasures = (list: Shape): Readonly<Record<SizeMeasure, Form>> => ({ size: list.item, count: list.item, inner: list.item, item: list.part, part: list.part });

/** This function gives the bound of one use of an argument. */
function useForm(use: SizeUse, i: number, form: Form, args: readonly Shape[], exprs: readonly Expr[], limit: number | undefined): Form {
  switch (use) {
    case "text":
      return isText(args[i]?.kind) ? form : scale(form, 2);
    case "copies": {
      const n = literalNumber(exprs[0]);
      return n === 0 ? NONE : n === 1 ? form : scale(form, 2);
    }
    case "each":
      return times(form, (args[0] as Shape).count);
    case "number":
      // LIST.FILL: a count has the bound 100000.
      return constant(Math.min(100_000, literalNumber(exprs[i]) ?? Infinity));
    case "limit":
      // LOOP.SIZE.PART: each item that the limit keeps has a key with a fixed bound and a value.
      return limit === undefined ? scale(form, 3) : times(plus(form, SOME), constant(limit));
    case 0:
    case 1:
    case "scaled":
    case "many":
    case "unbounded":
      return scale(form, coefOf(use));
  }
}

/** This function tells if a domain holds numbers or booleans. */
function scalar(x: AnyDomain | undefined): boolean {
  return x?.primitive === "number" || x?.primitive === "boolean";
}

/**
 * This function gives the size rule of an op of a domain (LOOP.SIZE.OPS). The rule is the rule of the op, or a rule
 * from its result kind and from the domain. The function gives `undefined` for an op without a rule.
 */
export function ruleOf(d: AnyDomain, spec: OpSpec<unknown>, domains: readonly AnyDomain[]): SizeRule | undefined {
  if (spec.size !== undefined) return spec.size;
  const r = spec.returns;
  if (r === "number" || r === "boolean" || (r === "domain" && scalar(d))) return "scalar";
  if (d.size === "fixed") return "fixed";
  if (r?.startsWith("domain:") === true) {
    const target = domains.find((x) => x.name === r.slice("domain:".length));
    if (scalar(target)) return "scalar";
    if (target?.size === "fixed") return "fixed";
  }
  return undefined;
}

/** The terms of a sum that read a variable of a cycle. */
const inside = (s: Sum, cycle: ReadonlySet<string>): readonly (readonly [string, Coef])[] => [...s.terms].filter(([u]) => cycle.has(u));

/** This function tells if a sum of a bound reads its cycle more than one time, or with a coefficient other than 1. */
const loose = (f: Form, cycle: ReadonlySet<string>): boolean =>
  f.some((s) => {
    const terms = inside(s, cycle);
    return terms.length > 1 || terms.some(([, c]) => c !== 1);
  });

/** The variable of a measure of a name of a loop. */
interface Owner {
  readonly name: string;
  readonly measure: SizeMeasure;
}

/** The words of a measure in a message. */
const WORDS: Readonly<Record<SizeMeasure, string>> = {
  size: "size",
  count: "number of items",
  inner: "number of inner items",
  item: "largest item",
  part: "largest part",
};

/** This function gives the label of the node of a refusal: an op, a function, a name or a node. */
function label(e: Expr): string {
  switch (e.tag) {
    case "app":
      return `the op "${e.op}"`;
    case "call":
      return `the function "${e.fn}"`;
    case "var":
      return `the name "${e.name}"`;
    case "each":
    case "ext":
    case "fn":
    case "fix":
    case "fold":
    case "iterate":
    case "last":
    case "let":
    case "lit":
    case "rec":
    case "ref":
      return `a node "${e.tag}"`;
  }
}

/** The names of one loop, their steps, and the rule of LOOP.SIZE. */
class Loop {
  readonly #owners = new Map<string, Owner>();
  /** The cycle of each variable: the variables that its new value reads, and that read it in turn. */
  readonly #cycles = new Map<string, ReadonlySet<string>>();

  readonly node: ExprOf<"fold"> | ExprOf<"iterate">;
  readonly names: readonly string[];
  readonly steps: ReadonlyMap<string, Shape>;

  // Node.js starts the speed gate from this source with the types removed, so the class has no parameter properties.
  constructor(node: ExprOf<"fold"> | ExprOf<"iterate">, names: readonly string[], ids: ReadonlyMap<string, number>, steps: ReadonlyMap<string, Shape>) {
    this.node = node;
    this.names = names;
    this.steps = steps;
    for (const name of names)
      for (const measure of MEASURES)
        this.#owners.set(variable(measure, ids.get(name) as number), {
          name,
          measure,
        });
  }

  /**
   * This method applies the rule of LOOP.SIZE to the steps, and it throws a refusal. Each sum of a measure of a new value
   * reads its cycle at most one time, with the coefficient 1. A name without a step keeps its value.
   */
  check(shapes: ReadonlyMap<Expr, Shape>, open: ReadonlyMap<Expr, boolean>): void {
    // The graph of the measures: an edge from each variable of a bound of a step to the measure of its name.
    const into = new Map<string, Form>();
    const out = new Map<string, string[]>();
    for (const [v, o] of this.#owners) {
      const form = this.steps.get(o.name)?.[o.measure] ?? term(v, 1);
      into.set(v, form);
      for (const u of new Set(form.flatMap((s) => [...s.terms.keys()]))) if (this.#owners.has(u)) out.set(u, [...(out.get(u) ?? []), v]);
    }
    const reach = (from: string): ReadonlySet<string> => {
      const seen = new Set<string>();
      const todo = [from];
      for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
        for (const y of out.get(x) ?? []) {
          if (seen.has(y)) continue;
          seen.add(y);
          todo.push(y);
        }
      }
      return seen;
    };
    const reached = new Map([...this.#owners.keys()].map((v): [string, ReadonlySet<string>] => [v, reach(v)]));
    for (const [v, form] of into) {
      const cycle = new Set([...(reached.get(v) as ReadonlySet<string>)].filter((u) => (reached.get(u) as ReadonlySet<string>).has(v)));
      this.#cycles.set(v, cycle);
      if (!loose(form, cycle)) continue;
      const o = this.#owners.get(v) as Owner;
      const twice = form.some((s) => {
        const terms = inside(s, cycle);
        return terms.length > 1 || terms.some(([, c]) => c > 2);
      });
      const what = twice
        ? `a value that uses the lists of the loop more than one time in its ${WORDS[o.measure]}`
        : `a ${WORDS[o.measure]} that can grow by a factor at each step`;
      this.#refuse(o.name, (s) => loose(s[o.measure], cycle), what, shapes, open);
    }
  }

  #refuse(name: string, bad: (s: Shape) => boolean, what: string, shapes: ReadonlyMap<Expr, Shape>, open: ReadonlyMap<Expr, boolean>): never {
    // The node of the refusal: the deepest node on a path of bad nodes from the step.
    const worse = (at: Expr): Expr | undefined =>
      children(at).find((k) => {
        const s = shapes.get(k);
        return s !== undefined && bad(s);
      });
    let at = this.node.step[name] as Expr;
    for (let next = worse(at); next !== undefined; next = worse(at)) at = next;
    const source = findOpen(at, open);
    const head = `the expression has a node "${this.node.tag}" whose step gives the name "${name}" ${what}, at ${label(source ?? at)} (LOOP.SIZE)`;
    throw new Refusal(source === undefined ? head : `${head}. The op "${source.op}" has no size rule (LOOP.SIZE.OPS)`);
  }

  /**
   * This method gives a bound of the last value of each name, from the values of `init` and the steps. The number of the
   * steps is `steps`. Each sum of a measure in a cycle gets at most one measure of its cycle at each step. A sum with a
   * measure of the cycle adds its other parts one time for each step. A sum without such a measure sets the value again,
   * so it adds to the bound one time (LOOP.SIZE.BRANCH). Thus the last value is the largest first value of the cycle or
   * of these sums, with the parts of the other sums one time for each step. A measure outside a cycle has its first
   * value or the value of its step.
   */
  last(init: ReadonlyMap<string, Shape>, steps: Form): ReadonlyMap<string, Shape> {
    const first = (v: string): Form => {
      const o = this.#owners.get(v) as Owner;
      return (init.get(o.name) as Shape)[o.measure];
    };
    const bounds = new Map([...this.#owners.keys()].map((v) => [v, first(v)]));
    const sigma = (v: string): Form | undefined => bounds.get(v);
    // Each pass makes the bounds larger, and the bounds have a finite number of values, so the loop ends. A constant
    // that is new in a bound becomes a constant without a known value.
    const widen = (old: Form, more: Form): Form => bound(join(old, more).map((s) => (s.base === 0 || old.some((o) => o.base === s.base) ? s : { base: Infinity, terms: s.terms })));
    const stepOf = (v: string): Form | undefined => {
      const o = this.#owners.get(v) as Owner;
      return this.steps.get(o.name)?.[o.measure];
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const [v, old] of bounds) {
        const step = stepOf(v);
        if (step === undefined) continue;
        const cycle = this.#cycles.get(v) as ReadonlySet<string>;
        let next: Form;
        if (cycle.has(v)) {
          const members = [...cycle];
          const start = members.reduce((acc, u) => join(acc, first(u)), NONE);
          const sums = members.flatMap((u) => (stepOf(u) as Form).map((x) => split(x, (y) => cycle.has(y))));
          const sets = subst(bound(sums.filter((x) => x.dropped.size === 0).map((x) => x.rest)), sigma);
          const adds = subst(bound(sums.filter((x) => x.dropped.size > 0).map((x) => x.rest)), sigma);
          next = plus(join(start, sets), times(adds, steps));
        } else next = join(first(v), subst(step, sigma));
        const wide = widen(old, next);
        if (sameForm(old, wide)) continue;
        bounds.set(v, wide);
        changed = true;
      }
    }
    const values = new Map(this.names.map((n) => [n, init.get(n) as Shape]));
    for (const [v, o] of this.#owners) values.set(o.name, { ...(values.get(o.name) as Shape), [o.measure]: bounds.get(v) as Form });
    return values;
  }
}

/** This function finds an op without a size rule in a node or in its children. */
function findOpen(at: Expr, open: ReadonlyMap<Expr, boolean>): ExprOf<"app"> | undefined {
  const todo = [at];
  for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
    if (x.tag === "app" && open.get(x) === true) return x;
    todo.push(...children(x));
  }
  return undefined;
}

/** This function reads an expression one time, and it gives the reason of a refusal or `undefined`. */
function refusalOf(e: Expr, opts: SizeOptions, parts: boolean): string | undefined {
  try {
    new Checker(opts, parts).shape(e, new Map());
    return undefined;
  } catch (thrown) {
    if (thrown instanceof Refusal) return thrown.message;
    throw thrown;
  }
}

/**
 * This function checks the sizes of the loops of an expression (LOOP.SIZE). It gives the reason of a refusal, or
 * `undefined`. The expression must pass `shapeError` and the limit of the nesting first. Each reading gives a sound
 * bound, so one reading that accepts the expression makes it valid. A refusal tells the reason of the first reading
 * (LOOP.SIZE.READINGS).
 */
export function sizeError(e: Expr, opts: SizeOptions = {}): string | undefined {
  const reason = refusalOf(e, opts, false);
  return reason === undefined || refusalOf(e, opts, true) === undefined ? undefined : reason;
}

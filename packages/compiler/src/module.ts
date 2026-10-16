/**
 * Standalone modules (docs/COMPILER.md §4.4 and §6). `emitModule` prints a program as an ES module that has no import of
 * Vex. A host that guarantees the kinds of its input uses it without the interpreter, for example ireko at build time.
 *
 * The module gives the results of the interpreter for each input that keeps the schema. It checks the schema once, at
 * the start of a run, and an input against the schema throws a `VexContractError`. An error of Vex is a value too:
 * the run gives `VEX_ERROR` at its key.
 *
 * The printer gives one expression for each node. An error of Vex is a thrown sentinel, and `ifError`, the items of a
 * list op and the bindings catch it as the interpreter does. Each op is the function of its domain, as text, so it has
 * the bits of the interpreter (§4.2). A node of the memo is one function of its keys, and the nodes with the same
 * expression share it.
 *
 * The printer takes a part of the language. It takes an array space of records, the fields and the variables of the
 * schema, and the axes `all`, `others` and `window`. The kinds of each op site must decide its op. Another construct
 * gives a reason, not code.
 */
import { isFieldName, type AnyDomain, type Axis, type Expr, type ExprOf, type Move, type PrimitiveKind } from "@mark1russell7/vex";
import { factsOf, type Facts, type Schema } from "./facts.ts";
import { memoNodes } from "./memo.ts";

/** The options of a standalone module. */
export interface ModuleOptions {
  readonly domains?: readonly AnyDomain[];
  /** The kinds of the fields of the records and of the variables. A module reads only the names of its schema. */
  readonly schema: Schema;
  /** The name of the function that the module exports. The default is `run`. */
  readonly name?: string;
}

/** The source of a standalone module, or the reason that the program cannot be one. */
export type Emitted = { readonly ok: true; readonly source: string } | { readonly ok: false; readonly reason: string };

/** The error of a construct that a standalone module does not have. */
class NotStandalone extends Error {}

/**
 * A value of the printer: its code, its kind if the printer knows it, and true when its code cannot throw. A literal,
 * a variable of the schema and a field of the schema at the focus or at the origin cannot throw.
 */
interface Value {
  readonly code: string;
  readonly kind: PrimitiveKind | undefined;
  readonly safe: boolean;
}

/** A name of the program in the code: its variable, its kind, and true when it can hold the error sentinel. */
interface Name {
  readonly code: string;
  readonly kind: PrimitiveKind | undefined;
  readonly lazy: boolean;
}

/**
 * The lexical position of a node: the code of the index of its origin and of its focus, and its names. It also has the
 * keys of its node of the memo. A node of the memo reads neither its origin nor its focus, so these are undefined there.
 */
interface Ctx {
  readonly origin: string | undefined;
  readonly focus: string | undefined;
  readonly env: ReadonlyMap<string, Name>;
  readonly keys: ReadonlyMap<Expr, Name>;
}

/** The name of a helper of the generated code. */
type Helper = "F" | "C" | "T" | "G" | "B" | "I" | "W" | "M" | "L";

/** The helpers of the generated code. A module has only the helpers that it uses. */
const HELPERS: Readonly<Record<Helper, string>> = {
  F: "function F() { throw E; }",
  C: "function C(m) { throw new VexContractError(m); }",
  T: "function T(f) { try { return f(); } catch (e) { if (e === E) return E; throw e; } }",
  G: "function G(x) { return x === E ? F() : x; }",
  B: 'function B(x) { return typeof x === "boolean" ? x : F(); }',
  I: "function I(a, b) { try { return a(); } catch (e) { if (e === E) return b(); throw e; } }",
  W: "function W(f, k) { return (...a) => { let r; try { r = f(...a); } catch { return F(); } return k(r); }; }",
  M: [
    "function M(f) {",
    "  const root = new Map();",
    "  return (...k) => {",
    "    let m = root;",
    "    for (const x of k) {",
    "      const s = Object.is(x, -0) ? Z : x;",
    "      let next = m.get(s);",
    "      if (next === undefined) m.set(s, (next = new Map()));",
    "      m = next;",
    "    }",
    "    if (!m.has(Z)) m.set(Z, T(() => f(...k)));",
    "    return G(m.get(Z));",
    "  };",
    "}",
  ].join("\n"),
  L: [
    "function L(op, lo, hi, skip, body, test, strict, num) {",
    "  const vs = [];",
    "  for (let j = lo; j < hi; j++) {",
    "    if (j === skip) continue;",
    "    let v;",
    "    try {",
    "      if (test !== undefined && !test(j)) continue;",
    "      v = body(j);",
    "    } catch (e) {",
    "      if (e !== E) throw e;",
    "      if (strict) F();",
    "      continue;",
    "    }",
    "    vs.push(v);",
    "  }",
    '  if (op === "count") return vs.length;',
    '  if (op === "first") return vs.length > 0 ? vs[0] : F();',
    '  if (op === "any" || op === "all" || op === "none") {',
    '    if (!vs.every((x) => typeof x === "boolean")) F();',
    '    return op === "any" ? vs.some((x) => x) : op === "all" ? vs.every((x) => x) : !vs.some((x) => x);',
    "  }",
    '  if (!vs.every((x) => typeof x === "number")) F();',
    '  if (op === "sum" || op === "mean") {',
    '    if (op === "mean" && vs.length === 0) F();',
    "    const s = vs.reduce((a, x) => a + x, 0);",
    '    return num(op === "sum" ? s : s / vs.length);',
    "  }",
    "  if (vs.length === 0) F();",
    '  return vs.reduce((a, x) => (op === "min" ? Math.min(a, x) : Math.max(a, x)));',
    "}",
  ].join("\n"),
};

/** The list ops of a standalone module. */
const LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max", "any", "all", "none", "first"]);
const NUMBER_LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max"]);

/** This function gives the kind of two values in the branches of a form, if they have the same kind. */
const join = (a: PrimitiveKind | undefined, b: PrimitiveKind | undefined): PrimitiveKind | undefined => (a === b ? a : undefined);

/** This function gives the code of a literal. A value that is not a finite number, a text, a boolean or null has no code. */
function literal(value: unknown): Value {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new NotStandalone("a literal is a number that is not finite");
    return { code: Object.is(value, -0) ? "-0" : String(value), kind: "number", safe: true };
  }
  if (typeof value === "string") return { code: JSON.stringify(value), kind: "string", safe: true };
  if (typeof value === "boolean") return { code: String(value), kind: "boolean", safe: true };
  if (value === null) return { code: "null", kind: undefined, safe: true };
  throw new NotStandalone("a literal is not a number, a text, a boolean or null");
}

/**
 * This function gives a text that is the same for two expressions with the same structure. -0 is not 0. Each key of
 * `keys` gives its position, so the text does not depend on the expression of a key.
 */
function canonical(e: unknown, keys: ReadonlyMap<unknown, number>): string {
  const k = keys.get(e);
  if (k !== undefined) return `#${k}`;
  if (typeof e !== "object" || e === null) return Object.is(e, -0) ? "-0" : JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map((x) => canonical(x, keys)).join(",")}]`;
  return `{${Object.entries(e).map(([name, x]) => `${JSON.stringify(name)}:${canonical(x, keys)}`).join(",")}}`;
}

/** The values of each kind that `copied` gives to a function and to its copy. */
const SAMPLES: Readonly<Record<PrimitiveKind, readonly unknown[]>> = {
  number: [0, 1, -1, 2.5, -0, 1e300, -7],
  string: ["", "a", "ab c"],
  boolean: [true, false],
};

/** This function gives each list of arguments with one sample of each kind. */
function samples(kinds: readonly PrimitiveKind[]): readonly (readonly unknown[])[] {
  return kinds.reduce<readonly (readonly unknown[])[]>((acc, k) => acc.flatMap((xs) => SAMPLES[k].map((x) => [...xs, x])), [[]]);
}

/** This function gives the value of a call, or that it threw. */
function call(f: () => unknown): { readonly threw: boolean; readonly value?: unknown } {
  try {
    return { threw: false, value: f() };
  } catch {
    return { threw: true };
  }
}

/** This function tells if two calls give the same: the same value, or an exception in both. */
function sameCall(a: () => unknown, b: () => unknown): boolean {
  const x = call(a);
  const y = call(b);
  return x.threw === y.threw && Object.is(x.value, y.value);
}

/**
 * This function gives the source of a function of a domain, for a copy in a module. A native function or a method has
 * no source of its own. A copy must give the values of the function: a function that reads a name outside itself gives
 * an exception in the copy. Thus the copy and the function must give the same for the samples of their kinds.
 */
function copied(f: (...a: never[]) => unknown, kinds: readonly PrimitiveKind[], what: string): string {
  const src = Function.prototype.toString.call(f);
  const none = new NotStandalone(`${what} has no source that a module can copy`);
  // The source must be an expression: an arrow function or a function expression.
  if (src.includes("[native code]") || !/^(async\s+)?(\(|[\w$]+\s*=>|function\b)/.test(src)) throw none;
  let copy: (...a: unknown[]) => unknown;
  try {
    // oxlint-disable-next-line typescript/no-implied-eval -- the source is the source of a function of a domain.
    const make = new Function(`"use strict"; return (${src});`) as () => (...a: unknown[]) => unknown;
    copy = make();
  } catch {
    throw none;
  }
  const fn = f as (...a: unknown[]) => unknown;
  if (!samples(kinds).every((xs) => sameCall(() => fn(...xs), () => copy(...xs)))) throw new NotStandalone(`${what} reads a name outside itself, so a module cannot copy it`);
  return src;
}

class Printer {
  readonly #facts: Facts;
  readonly #domains: readonly AnyDomain[];
  readonly #schema: Schema;
  readonly #memo: ReadonlyMap<Expr, readonly Expr[]>;
  readonly helpers = new Set<Helper>();
  /** The declarations at the top of the module: the functions of the domains and the checks of the results. */
  readonly top = new Map<string, string>();
  /** The declarations at the start of a run: the variables and the functions of the memo. */
  readonly run = new Map<string, string>();
  /** The variables of the schema that the program reads. */
  readonly vars = new Map<string, string>();
  #names = 0;
  /** The node of the memo whose function the printer prints, so it prints the node itself. */
  #inside: Expr | undefined;

  constructor(expr: Expr, options: ModuleOptions) {
    this.#domains = options.domains ?? [];
    this.#facts = factsOf({ domains: this.#domains });
    this.#schema = options.schema;
    this.#memo = memoNodes(expr);
  }

  use(name: Helper): string {
    this.helpers.add(name);
    return name;
  }

  /** This method gives the check of a result of a kind: the kind itself, a finite number, and `valid` of its domain. */
  check(kind: PrimitiveKind): string {
    const name = `k_${kind}`;
    if (!this.top.has(name)) {
      const d = this.#facts.checkOf(kind);
      if (d === undefined) throw new NotStandalone(`a domain without a primitive type comes before the domain of a ${kind}`);
      const domain = this.#domains[d];
      const v = domain?.valid === undefined ? "" : ` && ${this.#valid(d, domain.name, kind, domain.valid)}(x)`;
      const finite = kind === "number" ? " && Number.isFinite(x)" : "";
      this.use("F");
      this.use("C");
      this.top.set(name, `const ${name} = (x) => (typeof x !== "${kind}" ? C("an op gave a value that is not a ${kind}") : true${finite}${v} ? x : F());`);
    }
    return name;
  }

  #valid(d: number, domain: string, kind: PrimitiveKind, valid: (x: never) => boolean): string {
    const name = `v_${d}`;
    this.top.set(name, `const ${name} = ${copied(valid, [kind], `the check "valid" of the domain ${domain}`)};`);
    return name;
  }

  /** This method gives a new name for the code. */
  fresh(prefix: string): string {
    return `${prefix}${this.#names++}`;
  }

  /** This method gives the code of a name: a read that throws the error of its value, if it can hold an error. */
  #read(name: Name): Value {
    return name.lazy ? { code: `${this.use("G")}(${name.code})`, kind: name.kind, safe: false } : { code: name.code, kind: name.kind, safe: true };
  }

  /** This method gives the code that evaluates a value, with the error sentinel for its error. */
  #attempt(v: Value): string {
    return v.safe ? v.code : `${this.use("T")}(() => ${v.code})`;
  }

  expr(e: Expr, ctx: Ctx): Value {
    const key = ctx.keys.get(e);
    if (key !== undefined) return this.#read(key);
    const keys = this.#memo.get(e);
    if (keys !== undefined && this.#inside !== e) return this.#memoized(e, keys, ctx);
    return this.#node(e, ctx);
  }

  #node(e: Expr, ctx: Ctx): Value {
    switch (e.tag) {
      case "lit":
        return literal(e.value);
      case "ref":
        return this.#ref(e, ctx);
      case "var":
        return this.#var(e.name, ctx);
      case "let":
        return this.#let(e, ctx);
      case "rec": {
        const fields = Object.entries(e.fields).map(([k, x]): [string, Value] => [k, this.expr(x, ctx)]);
        return { code: `Object.freeze({ ${fields.map(([k, x]) => `${JSON.stringify(k)}: ${x.code}`).join(", ")} })`, kind: undefined, safe: fields.every(([, x]) => x.safe) };
      }
      case "app":
        return this.#app(e, ctx);
      case "each":
        throw new NotStandalone("a list is a value of the program");
      case "ext":
        throw new NotStandalone(`the extension "${e.kind}"`);
    }
  }

  /** This method gives the code of the index of an address from the focus. */
  #address(at: readonly Move[] | undefined, ctx: Ctx): string {
    let index = ctx.focus;
    for (const m of at ?? []) index = this.#move(m, index, ctx.origin);
    // A node of the memo reads neither its origin nor its focus (memo.ts), so the guards of this method do not fail.
    // Stryker disable next-line ConditionalExpression: see the comment above
    /* v8 ignore next -- @preserve */
    if (index === undefined) throw new NotStandalone("a node of the memo reads its focus");
    return index;
  }

  #move(m: Move, focus: string | undefined, origin: string | undefined): string {
    const F = this.use("F");
    switch (m.t) {
      case "origin":
        // Stryker disable next-line ConditionalExpression: see #address
        /* v8 ignore next -- @preserve */
        if (origin === undefined) throw new NotStandalone("a node of the memo reads its origin");
        return origin;
      case "key":
        // A key of an array space is the text of its index.
        return /^(0|[1-9]\d*)$/.test(m.key) ? `(${m.key} < n ? ${m.key} : ${F}())` : `${F}()`;
      case "index":
        return Number.isInteger(m.i) && m.i >= 0 ? `(${m.i} < n ? ${m.i} : ${F}())` : `${F}()`;
      case "offset": {
        const [d, ...more] = m.d;
        // Stryker disable next-line ConditionalExpression: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        if (d === undefined || more.length > 0 || !Number.isInteger(d)) return `${F}()`;
        const t = this.fresh("t");
        return `((${t}) => (${t} >= 0 && ${t} < n ? ${t} : ${F}()))(${focus} + ${d})`;
      }
      case "other":
        // Stryker disable next-line ConditionalExpression: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        return `(n === 2 ? 1 - ${focus} : ${F}())`;
      case "parent":
        return `${F}()`;
    }
  }

  #ref(e: ExprOf<"ref">, ctx: Ctx): Value {
    const [field, ...more] = e.path;
    const kind = field === undefined ? undefined : this.#schema.fields?.[field];
    if (field === undefined || more.length > 0 || !isFieldName(field) || kind === undefined) throw new NotStandalone(`a read of a field that is not in the schema: "${e.path.join(".")}"`);
    // A move to the origin cannot fail, and the schema has the field in each record.
    const safe = (e.at ?? []).every((m) => m.t === "origin");
    return { code: `R[${this.#address(e.at, ctx)}][${JSON.stringify(field)}]`, kind, safe };
  }

  #var(name: string, ctx: Ctx): Value {
    const bound = ctx.env.get(name);
    if (bound !== undefined) return this.#read(bound);
    const kind = this.#schema.vars?.[name];
    if (kind === undefined) throw new NotStandalone(`a variable that is not in the schema: "${name}"`);
    let code = this.vars.get(name);
    if (code === undefined) {
      code = `v${this.vars.size}`;
      this.vars.set(name, code);
    }
    return { code, kind, safe: true };
  }

  /** A binding with an error is an error only where the body reads its name, so each binding can hold the sentinel. */
  #let(e: ExprOf<"let">, ctx: Ctx): Value {
    const env = new Map(ctx.env);
    const params: string[] = [];
    const values: string[] = [];
    for (const [name, x] of Object.entries(e.bind)) {
      const value = this.expr(x, ctx);
      const code = this.fresh("b");
      params.push(code);
      values.push(this.#attempt(value));
      env.set(name, { code, kind: value.kind, lazy: !value.safe });
    }
    const body = this.expr(e.body, { ...ctx, env });
    return { code: `((${params.join(", ")}) => ${body.code})(${values.join(", ")})`, kind: body.kind, safe: body.safe };
  }

  #boolean(v: Value): string {
    return v.kind === "boolean" ? v.code : `${this.use("B")}(${v.code})`;
  }

  /** A condition is safe when it is a safe boolean. */
  #safeBoolean(v: Value): boolean {
    return v.safe && v.kind === "boolean";
  }

  #app(e: ExprOf<"app">, ctx: Ctx): Value {
    const { op, args } = e;
    if (op === "if") {
      const [c, a, b] = args;
      if (c === undefined || a === undefined || b === undefined || args.length > 3) throw new NotStandalone("an if without three arguments");
      const cond = this.expr(c, ctx);
      const yes = this.expr(a, ctx);
      const no = this.expr(b, ctx);
      return { code: `(${this.#boolean(cond)} ? ${yes.code} : ${no.code})`, kind: join(yes.kind, no.kind), safe: this.#safeBoolean(cond) && yes.safe && no.safe };
    }
    if (op === "and" || op === "or") {
      if (args.length === 0) throw new NotStandalone(`an ${op} without arguments`);
      const parts = args.map((x) => this.expr(x, ctx));
      return { code: `(${parts.map((x) => this.#boolean(x)).join(op === "and" ? " && " : " || ")})`, kind: "boolean", safe: parts.every((x) => this.#safeBoolean(x)) };
    }
    if (op === "ifError") {
      const [a, b] = args;
      if (a === undefined || b === undefined || args.length > 2) throw new NotStandalone("an ifError without two arguments");
      const first = this.expr(a, ctx);
      const second = this.expr(b, ctx);
      if (first.safe) return first;
      return { code: `${this.use("I")}(() => ${first.code}, () => ${second.code})`, kind: join(first.kind, second.kind), safe: second.safe };
    }
    const [first] = args;
    if (LIST_OPS.has(op) && first?.tag === "each") return this.#list(op, first, args.slice(1), ctx);
    const values = args.map((x) => this.expr(x, ctx));
    const site = this.#facts.staticSite(op, values.map((x) => x.kind));
    if (site?.t !== "fn") throw new NotStandalone(`the kinds of the values of "${op}" do not decide its op`);
    if (site.bad) return { code: `${this.use("F")}()`, kind: site.returns, safe: false };
    if (site.returns === undefined) throw new NotStandalone(`the op "${op}" does not declare the kind of its result`);
    const d = this.#domains[site.domain] as AnyDomain;
    const name = `op_${site.domain}_${this.#opIndex(op)}`;
    if (!this.top.has(name)) {
      // A static site of a domain has the function of the op of that domain.
      const fn = (d.ops[op] as { fn: (...a: never[]) => unknown }).fn;
      const kinds = values.map((x) => x.kind).filter((k): k is PrimitiveKind => k !== undefined);
      this.top.set(name, `const ${name} = ${this.use("W")}(${copied(fn, kinds, `the op "${op}" of the domain ${d.name}`)}, ${this.check(site.returns)});`);
    }
    return { code: `${name}(${values.map((x) => x.code).join(", ")})`, kind: site.returns, safe: false };
  }

  readonly #ops = new Map<string, number>();
  #opIndex(op: string): number {
    let i = this.#ops.get(op);
    if (i === undefined) {
      i = this.#ops.size;
      this.#ops.set(op, i);
    }
    return i;
  }

  /** A list op over an axis: one call of `L`, with the body and the tests at each target. */
  #list(op: string, target: ExprOf<"each">, rest: readonly Expr[], ctx: Ctx): Value {
    const [options, ...more] = rest;
    if (more.length > 0) throw new NotStandalone(`"${op}" with more than one option`);
    const opts = options === undefined ? undefined : options.tag === "lit" ? options.value : Symbol("not a literal");
    if (opts !== undefined && (typeof opts !== "object" || opts === null || Object.keys(opts).some((k) => k !== "strict"))) throw new NotStandalone(`the options of "${op}" are not a literal with strict`);
    const strict = typeof opts === "object" && opts !== null && "strict" in opts && opts.strict === true;
    const tests: Expr[] = [];
    let base: Axis = target.axis;
    while (base.t === "where") {
      tests.unshift(base.test);
      base = base.axis;
    }
    const j = this.fresh("j");
    const inner: Ctx = { ...ctx, focus: j };
    let range: string;
    if (base.t === "all") range = "0, n, -1";
    else if (base.t === "others") range = `0, n, ${this.#address(target.at, ctx)}`;
    else if (base.t === "window" && Number.isInteger(base.from) && Number.isInteger(base.to)) {
      const from = this.#address(target.at, ctx);
      const f = this.fresh("f");
      range = `...((${f}) => [Math.max(0, ${f} + Math.max(${base.from}, -n)), Math.min(n, ${f} + Math.min(${base.to}, n) + 1), -1])(${from})`;
    } else throw new NotStandalone(`the axis "${base.t}"`);
    const test = tests.length === 0 ? "undefined" : `(${j}) => ${tests.map((t) => this.#boolean(this.expr(t, inner))).join(" && ")}`;
    const body = this.expr(target.body, inner);
    const num = op === "sum" || op === "mean" ? this.check("number") : "undefined";
    const kind = NUMBER_LIST_OPS.has(op) ? "number" : op === "first" ? body.kind : "boolean";
    return { code: `${this.use("L")}(${JSON.stringify(op)}, ${range}, (${j}) => ${body.code}, ${test}, ${String(strict)}, ${num})`, kind, safe: false };
  }

  /** A node of the memo: one function of its keys for each structure, with an entry for each value of the keys. */
  #memoized(e: Expr, keys: readonly Expr[], ctx: Ctx): Value {
    const values = keys.map((k) => this.expr(k, ctx));
    // The kinds of the keys decide the ops in the node, and a safe key needs no check, so both are a part of the structure.
    const structure = canonical([e, values.map((x) => `${String(x.kind)} ${String(x.safe)}`)], new Map(keys.map((k, i) => [k, i])));
    let fn = this.#structures.get(structure);
    if (fn === undefined) {
      fn = this.fresh("m");
      this.#structures.set(structure, fn);
      const params = keys.map(() => this.fresh("q"));
      const outer = this.#inside;
      this.#inside = e;
      const names = values.map((x, i): Name => ({ code: params[i] as string, kind: x.kind, lazy: !x.safe }));
      const body = this.expr(e, { origin: undefined, focus: undefined, env: new Map(), keys: new Map(keys.map((k, i): [Expr, Name] => [k, names[i] as Name])) });
      this.#inside = outer;
      this.#kinds.set(fn, body.kind);
      this.run.set(fn, `const ${fn} = ${this.use("M")}((${params.join(", ")}) => ${body.code});`);
    }
    return { code: `${fn}(${values.map((x) => this.#attempt(x)).join(", ")})`, kind: this.#kinds.get(fn), safe: false };
  }

  readonly #structures = new Map<string, string>();
  readonly #kinds = new Map<string, PrimitiveKind | undefined>();
}

/** The helpers that each helper uses. */
const NEEDS: Readonly<Record<Helper, readonly Helper[]>> = { F: [], C: [], T: [], G: ["F"], B: ["F"], I: [], W: ["F"], M: ["T", "G"], L: ["F"] };

/**
 * This function prints a program as a standalone ES module. The module exports `VexContractError`, `VEX_ERROR` and a
 * function that takes the records and the variables and gives the value at each key. It is pure, so a build can use it.
 */
export function emitModule(expr: Expr, options: ModuleOptions): Emitted {
  const name = options.name ?? "run";
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { ok: false, reason: `the name "${name}" is not a JavaScript name` };
  const p = new Printer(expr, options);
  let value: Value;
  try {
    value = p.expr(expr, { origin: "o", focus: "o", env: new Map(), keys: new Map() });
  } catch (thrown) {
    // Each error of the printer is a NotStandalone. Another exception is a defect, so it goes to the caller.
    /* v8 ignore next -- @preserve */
    if (!(thrown instanceof NotStandalone)) throw thrown;
    return { ok: false, reason: thrown.message };
  }
  p.use("T");
  p.use("C");
  const helpers = new Set<Helper>();
  const add = (h: Helper): void => {
    if (helpers.has(h)) return;
    for (const x of NEEDS[h]) add(x);
    helpers.add(h);
  };
  [...p.helpers].toSorted().forEach(add);
  const fields = Object.entries(options.schema.fields ?? {});
  const vars = Object.entries(options.schema.vars ?? {});
  const fieldChecks = fields.map(([f, k]) => ` || typeof r[${JSON.stringify(f)}] !== "${k}"`).join("");
  const varChecks = vars.map(([v, k]) => ` || typeof vars[${JSON.stringify(v)}] !== "${k}"`).join("");
  const lines = [
    "// Generated by @mark1russell7/vex-compiler from a Vex program. Do not edit.",
    "/** The error of a run whose input does not keep the schema of the program. */",
    "export class VexContractError extends Error {}",
    "/** The value of a key where the program gives an error of Vex. */",
    "export const VEX_ERROR = Object.freeze({ vexError: true });",
    "const E = {};",
    ...(helpers.has("M") ? ["const Z = {};"] : []),
    ...[...helpers].map((h) => HELPERS[h]),
    ...p.top.values(),
    `export function ${name}(records, vars) {`,
    '  if (!Array.isArray(records)) C("the records are not an array");',
    "  const R = records;",
    "  const n = R.length;",
    "  for (let i = 0; i < n; i++) {",
    "    const r = R[i];",
    `    if (typeof r !== "object" || r === null${fieldChecks}) C(\`the record \${i} does not keep the schema\`);`,
    "  }",
    `  if (typeof vars !== "object" || vars === null${varChecks}) C("the variables do not keep the schema");`,
    ...[...p.vars].map(([v, code]) => `  const ${code} = vars[${JSON.stringify(v)}];`),
    ...[...p.run.values()].map((x) => `  ${x}`),
    "  const out = [];",
    `  for (let o = 0; o < n; o++) out.push(T(() => ${value.code}));`,
    "  return out.map((x) => (x === E ? VEX_ERROR : x));",
    "}",
    "",
  ];
  return { ok: true, source: lines.join("\n") };
}

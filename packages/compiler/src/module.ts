/**
 * Standalone modules (docs/COMPILER.md §4.4 and §6). `emitModule` prints a program as an ES module that has no import of
 * Vex. A host that guarantees the kinds of its input uses it without the interpreter, for example ireko at build time.
 *
 * The module gives the results of the interpreter for each input that keeps the schema. It checks the schema once, at
 * the start of a run, and an input against the schema throws a `VexContractError`. An error of Vex is a value too:
 * the run gives `VEX_ERROR` at its key.
 *
 * The printer gives statements and loops, as a person writes them. A binding is a variable, and a list op is a `for`
 * loop with a running value. An error of Vex is a thrown sentinel. A binding, `ifError` and an item of a list op catch
 * it, as in the interpreter. A node of the memo and the key of the run catch it too. Each op is the function of its
 * domain, as text, so it has the bits of the interpreter (§4.2).
 *
 * A part of the program that depends on no key of the space is a constant of the run. The module evaluates it once,
 * before the loop over the keys. A node of the memo is one function of its other keys, with a map of its values. The
 * nodes with the same expression share the function.
 *
 * The printer takes a part of the language. It takes an array space of records, the fields and the variables of the
 * schema, and the axes `all`, `others` and `window`. The kinds of each op site must decide its op. Another construct
 * gives a reason, not code.
 */
import { addrExprs, children, isFieldName, moveExpr, type AnyDomain, type Axis, type Expr, type ExprOf, type Move, type PrimitiveKind } from "@mark1russell7/vex";
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
  /** For the read of a name that can hold the error sentinel: the name itself, which holds the value or the sentinel. */
  readonly held?: string;
  /**
   * The levels of the keys that the value depends on: 1 for the key of the run, and one more for each axis around it.
   * A value with no levels is a constant of the run.
   */
  readonly deps: ReadonlySet<number>;
  /** True for a literal and for the read of a name: a constant of the run with such code needs no variable of its own. */
  readonly plain?: boolean;
}

/** The code of a node: the statements before its value, and its value. `safe` covers the statements too. */
interface Code {
  readonly s: readonly string[];
  readonly v: Value;
}

/** A name of the program in the code: its variable, its kind, true when it can hold the error sentinel, and its levels. */
interface Name {
  readonly code: string;
  readonly kind: PrimitiveKind | undefined;
  readonly lazy: boolean;
  readonly deps: ReadonlySet<number>;
}

/** The levels of a constant of the run. */
const NO_DEPS: ReadonlySet<number> = new Set();

/** This function gives the levels of some codes together. */
const depsOf = (...xs: readonly Code[]): ReadonlySet<number> => new Set(xs.flatMap((x) => [...x.v.deps]));

/** This function gives the statements of some codes, in order. */
const stmtsOf = (...xs: readonly Code[]): string[] => xs.flatMap((x) => x.s);

/** This function indents some statements by one level. */
const ind = (xs: readonly string[]): string[] => xs.map((x) => `  ${x}`);

/**
 * The lexical position of a node: the code of the index of its origin and of its focus, and its names. It also has the
 * keys of its node of the memo. A node of the memo reads neither its origin nor its focus, so these are undefined there.
 */
interface Ctx {
  readonly origin: string | undefined;
  readonly focus: string | undefined;
  /** The level of the focus: 1 at the key of the run, and one more in each axis. */
  readonly level: number;
  readonly env: ReadonlyMap<string, Name>;
  readonly keys: ReadonlyMap<Expr, Name>;
}

/** The name of a helper of the generated code. */
type Helper = "F" | "C" | "T" | "G" | "B" | "U" | "X" | "I" | "K" | "M" | "M1" | "S";

/** The helpers of the generated code. A module has only the helpers that it uses. */
const HELPERS: Readonly<Record<Exclude<Helper, "S">, string>> = {
  F: "function F() { throw E; }",
  C: "function C(m) { throw new VexContractError(m); }",
  // An exception of an op is an error of Vex too, as in the interpreter. Only the checks of the contract throw a
  // VexContractError, and they come before the run, so each catch of the run gives the sentinel.
  T: "function T(f) { try { return f(); } catch { return E; } }",
  G: "function G(x) { return x === E ? F() : x; }",
  B: 'function B(x) { return typeof x === "boolean" ? x : F(); }',
  U: 'function U(x) { return typeof x === "number" ? x : F(); }',
  X: "function X(t, n) { return t >= 0 && t < n ? t : F(); }",
  // The index of a computed position, and of a computed key: a key of an array space is the text of its index.
  I: "function I(t, n) { return Number.isInteger(t) && t >= 0 && t < n ? t : F(); }",
  K: 'function K(k, n) { return typeof k === "string" && /^(0|[1-9]\\d*)$/.test(k) && +k < n ? +k : F(); }',
  // The memo of a function of one key, and of more keys. -0 has its own entry, because an op can tell it from 0.
  M1: [
    "function M1(f) {",
    "  const m = new Map();",
    "  return (k) => {",
    "    const s = Object.is(k, -0) ? Z : k;",
    "    let r = m.get(s);",
    "    if (r === undefined) {",
    "      try { r = f(k); } catch { r = E; }",
    "      m.set(s, r);",
    "    }",
    "    return G(r);",
    "  };",
    "}",
  ].join("\n"),
  M: [
    "function M(f) {",
    "  const root = new Map();",
    "  return (...k) => {",
    "    let m = root;",
    "    for (const x of k.slice(0, -1)) {",
    "      const s = Object.is(x, -0) ? Z : x;",
    "      let c = m.get(s);",
    "      if (c === undefined) m.set(s, (c = new Map()));",
    "      m = c;",
    "    }",
    "    const last = k.at(-1);",
    "    const s = Object.is(last, -0) ? Z : last;",
    "    let r = m.get(s);",
    "    if (r === undefined) {",
    "      try { r = f(...k); } catch { r = E; }",
    "      m.set(s, r);",
    "    }",
    "    return G(r);",
    "  };",
    "}",
  ].join("\n"),
};

/** A part of the helper S that only some nodes need (helperS). */
type Feature = "group" | "prefix" | "strict" | "ok" | "pre";

/**
 * This function gives the code of the helper S, a node of the memo that keeps its items (Printer.#cached). The helper
 * has only the parts that the nodes of the module need:
 *
 * - `group`: the groups of the values of the key (mode 1).
 * - `prefix`: the prefixes of the items (mode 2).
 * - `strict`: the option strict of a list op.
 * - `ok`: the check of the kind of a value.
 * - `pre`: the tests before the test of the key.
 *
 * The node gives `key` for the value of each item, and `val` for the value of an item from its index. It gives `test`
 * for the test of the key.
 */
const helperS = (has: ReadonlySet<Feature>): string => {
  const on = (f: Feature, ...lines: readonly string[]): readonly string[] => (has.has(f) ? lines : []);
  const strict = has.has("strict");
  const ok = has.has("ok");
  // The items that end the lookup with an error, and the items that the lookup skips.
  const fails = [...(strict ? ["x === E"] : []), ...(ok ? ["x === W"] : [])].join(" || ");
  const skips = strict ? "x === N || (x === E && !strict)" : "x === N || x === E";
  return [
    "function S(n, mode, strict, a0, step, result, key, val, test, pre, ok) {",
    "  let ts, js, xs, bad, reach, gs, mono, pa, pc, pe;",
    "  const value = (i) => {",
    "    let x = xs[i];",
    "    if (x === undefined) {",
    "      x = val(js[i]);",
    ...on("ok", "      if (ok && x !== E && x !== N && !ok(x)) x = W;"),
    "      xs[i] = x;",
    "    }",
    "    return x;",
    "  };",
    "  return M1((q) => {",
    "    if (ts === undefined) {",
    "      ts = [];",
    "      js = [];",
    "      xs = [];",
    ...on("strict", "      bad = false;", "      reach = 0;"),
    "      for (let j = 0; j < n; j++) {",
    "        try {",
    ...on("pre", "          if (pre && !pre(j)) continue;"),
    ...on("strict", "          reach++;"),
    "          const t = key(j);",
    // NaN satisfies no test of a group or of a prefix, so its item is in none.
    "          if (mode && t !== t) continue;",
    "          ts.push(t);",
    "          js.push(j);",
    "        } catch {",
    ...on("strict", "          bad = true;"),
    "        }",
    "      }",
    ...on("group", "      if (mode === 1) {", "        gs = new Map();", "        for (let i = 0; i < ts.length; i++) {", "          let g = gs.get(ts[i]);", "          if (g === undefined) gs.set(ts[i], (g = []));", "          g.push(i);", "        }", "      }"),
    ...on("prefix", "      if (mode === 2) {", "        mono = true;", "        for (let i = 1; i < ts.length; i++) if (!(ts[i - 1] <= ts[i])) mono = false;", "        pa = [a0];", "        pc = [0];", "        pe = [false];", "      }"),
    "    }",
    // A key with an error makes an error item of each item that reaches the test of the key.
    strict ? "    if (q === E) return strict && (bad || reach > 0) ? F() : result(a0, 0);" : "    if (q === E) return result(a0, 0);",
    ...on("strict", "    if (strict && bad) F();"),
    "    let a = a0, c = 0;",
    "    const add = (i) => {",
    "      const x = value(i);",
    `      if (${skips}) return;`,
    ...(fails === "" ? [] : [`      if (${fails}) F();`]),
    "      a = step(a, c, x);",
    "      c++;",
    "    };",
    ...on("group", "    if (mode === 1) {", "      const g = gs.get(q);", "      if (g !== undefined) for (const i of g) add(i);", "      return result(a, c);", "    }"),
    // The values t do not decrease, so the items whose test is true are a prefix. Each prefix keeps its running value.
    ...on(
      "prefix",
      "    if (mode === 2 && mono) {",
      "      let lo = 0, hi = ts.length;",
      "      while (lo < hi) {",
      "        const h = (lo + hi) >> 1;",
      "        if (test(ts[h], q)) lo = h + 1;",
      "        else hi = h;",
      "      }",
      "      for (let i = pa.length - 1; i < lo; i++) {",
      "        let x = value(i), b = pa[i], d = pc[i], err = pe[i];",
      ...(fails === "" ? ["        if (x !== N && x !== E) {"] : [`        if (${fails.replace("x === E", "(x === E && strict)")}) err = true;`, "        else if (x !== N && x !== E) {"]),
      "          b = step(b, d, x);",
      "          d++;",
      "        }",
      "        pa.push(b);",
      "        pc.push(d);",
      "        pe.push(err);",
      "      }",
      "      if (pe[lo]) F();",
      "      return result(pa[lo], pc[lo]);",
      "    }",
    ),
    "    for (let i = 0; i < ts.length; i++) if (test(ts[i], q)) add(i);",
    "    return result(a, c);",
    "  });",
    "}",
  ].join("\n");
};

/** The step of the running value of first and of count: the name of its function in a module, and its code. */
const FIRST_STEP: readonly [string, string] = ["s_first", "(a, c, x) => (c === 0 ? x : a)"];

/** The step of the running value of each list op: the name of its function in a module, and its code. */
const STEPS: Readonly<Record<string, readonly [string, string]>> = {
  count: FIRST_STEP,
  first: FIRST_STEP,
  sum: ["s_add", "(a, c, x) => a + x"],
  mean: ["s_add", "(a, c, x) => a + x"],
  min: ["s_min", "(a, c, x) => (c === 0 ? x : Math.min(a, x))"],
  max: ["s_max", "(a, c, x) => (c === 0 ? x : Math.max(a, x))"],
  any: ["s_or", "(a, c, x) => a || x"],
  none: ["s_or", "(a, c, x) => a || x"],
  all: ["s_and", "(a, c, x) => a && x"],
};

/** The helpers that each helper uses. */
const NEEDS: Readonly<Record<Helper, readonly Helper[]>> = { F: [], C: [], T: [], G: ["F"], B: ["F"], U: ["F"], X: ["F"], I: ["F"], K: ["F"], M: ["G"], M1: ["G"], S: ["M1", "F"] };

/** The list ops of a standalone module. */
const LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max", "any", "all", "none", "first"]);
const NUMBER_LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max"]);
const BOOLEAN_LIST_OPS: ReadonlySet<string> = new Set(["any", "all", "none"]);

/** This function gives the kind of the result of a list op: first gives the kind of its items. */
const listKind = (op: string, item: PrimitiveKind | undefined): PrimitiveKind | undefined => (NUMBER_LIST_OPS.has(op) ? "number" : BOOLEAN_LIST_OPS.has(op) ? "boolean" : item);

/**
 * This function tells if a node of the memo has a loop of its own. Such a loop is outside its keys and outside the nodes
 * of the memo in it. A node without one combines the values of other nodes, and a function of its own only costs time.
 */
function ownLoop(e: Expr, root: Expr, memo: ReadonlyMap<Expr, readonly Expr[]>, keys: ReadonlySet<Expr>): boolean {
  if (e !== root && (memo.has(e) || keys.has(e))) return false;
  return e.tag === "each" || children(e).some((x) => ownLoop(x, root, memo, keys));
}

/** This function gives the nodes of the memo of an expression that have a loop of their own, with their keys. */
function memoOf(expr: Expr): ReadonlyMap<Expr, readonly Expr[]> {
  const all = memoNodes(expr);
  return new Map([...all].filter(([e, keys]) => ownLoop(e, e, all, new Set(keys))));
}

/** This function tells if an expression contains the expression `x`, the same object. */
function contains(e: Expr, x: Expr): boolean {
  return e === x || children(e).some((c) => contains(c, x));
}

/** This function gives the base of an axis and its tests in the order of evaluation. */
function testsOf(axis: Axis): { readonly base: Axis; readonly tests: readonly Expr[] } {
  const tests: Expr[] = [];
  let base = axis;
  while (base.t === "where") {
    tests.unshift(base.test);
    base = base.axis;
  }
  return { base, tests };
}

/**
 * This function gives the parts of a test `and`, and of each part that is a test `and` too. `and` stops at the first
 * `false`, as a chain of tests does, and each part must be a boolean.
 */
function partsOf(t: Expr): readonly Expr[] {
  return t.tag === "app" && t.op === "and" && t.args.length > 0 ? t.args.flatMap(partsOf) : [t];
}

/** This function gives the kind of two values in the branches of a form, if they have the same kind. */
const join = (a: PrimitiveKind | undefined, b: PrimitiveKind | undefined): PrimitiveKind | undefined => (a === b ? a : undefined);

/** This function gives a value that is a constant of the run, with plain code. */
const plainValue = (code: string, kind: PrimitiveKind | undefined): Value => ({ code, kind, safe: true, deps: NO_DEPS, plain: true });

/** This function gives the code of a value with no statements. */
const bare = (v: Value): Code => ({ s: [], v });

/** This function gives the code of a literal. A value that is not a finite number, a text, a boolean or null has no code. */
function literal(value: unknown): Value {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new NotStandalone("a literal is a number that is not finite");
    return plainValue(Object.is(value, -0) ? "-0" : String(value), "number");
  }
  if (typeof value === "string") return plainValue(JSON.stringify(value), "string");
  if (typeof value === "boolean") return plainValue(String(value), "boolean");
  if (value === null) return plainValue("null", undefined);
  throw new NotStandalone("a literal is not a number, a text, a boolean or null");
}

/**
 * This function gives a text that is the same for two expressions with the same structure. -0 is not 0. A part with a
 * token gives the token, so the text does not depend on that part. A token is an object, and a literal of a module is
 * not, so a token is not the text of a literal.
 */
function canonical(e: Expr, token: (x: unknown) => object | undefined): string {
  return JSON.stringify(e, (_name, x: unknown) => token(x) ?? (Object.is(x, -0) ? { "-0": 0 } : x));
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
 * This function gives the source of a function of a domain, for a copy in a module. The source must be an expression:
 * the source of a native function or of a method does not compile as one. A copy must give the values of the function:
 * a function that reads a name outside itself gives an exception in the copy. Thus the copy and the function must give
 * the same for the samples of their kinds.
 */
function copied(f: (...a: never[]) => unknown, kinds: readonly PrimitiveKind[], what: string): string {
  const src = Function.prototype.toString.call(f);
  let copy: (...a: unknown[]) => unknown;
  try {
    // oxlint-disable-next-line typescript/no-implied-eval -- the source is the source of a function of a domain.
    const make = new Function(`"use strict"; return (${src});`) as () => (...a: unknown[]) => unknown;
    copy = make();
  } catch {
    throw new NotStandalone(`${what} has no source that a module can copy`);
  }
  const fn = f as (...a: unknown[]) => unknown;
  if (!samples(kinds).every((xs) => sameCall(() => fn(...xs), () => copy(...xs)))) throw new NotStandalone(`${what} reads a name outside itself, so a module cannot copy it`);
  return src;
}

/** The functions that an inline form can use. They do not throw for numbers. */
const CALLS: ReadonlySet<string> = new Set([
  "Math.abs",
  "Math.ceil",
  "Math.floor",
  "Math.round",
  "Math.trunc",
  "Math.sign",
  "Math.sqrt",
  "Math.cbrt",
  "Math.exp",
  "Math.log",
  "Math.log10",
  "Math.log2",
  "Math.min",
  "Math.max",
  "Math.pow",
  "Math.hypot",
  "Math.sin",
  "Math.cos",
  "Math.tan",
  "Math.atan2",
  "Number.isFinite",
]);

/** The inline form of a function of an op: its parameters, and its body with a hole for each use of a parameter. */
interface InlineForm {
  readonly params: readonly string[];
  /** The parts of the body, and between two parts the index of a parameter. */
  readonly parts: readonly (string | number)[];
  /** The number of uses of each parameter. */
  readonly uses: readonly number[];
}

/**
 * This function gives the inline form of the source of an arrow function. The body of the function must be an
 * expression of operators, numbers, its parameters and the functions of `CALLS`. Such a body cannot throw for primitive
 * values (§7.1). The inline form is the text of the function itself, so it has its bits.
 */
function inlineForm(src: string): InlineForm | undefined {
  const m = /^\(?\s*((?:[A-Za-z_$][\w$]*\s*,\s*)*[A-Za-z_$][\w$]*)\s*\)?\s*=>\s*([\s\S]*)/.exec(src);
  if (m === null) return undefined;
  const params = (m[1] as string).split(",").map((x) => x.trim());
  const parts: (string | number)[] = [];
  const uses = params.map(() => 0);
  let text = "";
  // The even parts are the text between the names: numbers, operators and parentheses. An assignment, a call of a value
  // and another character, for example a quote, stop the inline form.
  const split = (m[2] as string).split(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/);
  for (const [i, t] of split.entries()) {
    if (i % 2 === 0) {
      if (!/^(?:\d|\.\d|\s|===?|!==?|<=|>=|[+\-*/%<>!?:(),&|^~])*$/.test(t) || /\+\+|--|\)\s*\(/.test(t)) return undefined;
      text += t;
    } else if (CALLS.has(t)) text += t;
    else {
      const p = params.indexOf(t);
      if (p < 0 || /^\s*\(/.test(split[i + 1] as string)) return undefined;
      parts.push(text, p);
      text = "";
      uses[p] = (uses[p] as number) + 1;
    }
  }
  parts.push(text);
  return { params, parts, uses };
}

/** This function gives the text of an inline form without spaces, with `#i` for the parameter `at(i)`. */
const patternOf = (form: InlineForm, at: (p: number) => number): string => form.parts.map((p) => (typeof p === "number" ? `#${at(p)}` : p.replaceAll(/\s/g, ""))).join("");

class Printer {
  readonly #facts: Facts;
  readonly #domains: readonly AnyDomain[];
  readonly #schema: Schema;
  readonly #memo: ReadonlyMap<Expr, readonly Expr[]>;
  readonly helpers = new Set<Helper>();
  /** The declarations at the top of the module: the functions of the domains and the checks of the results. */
  readonly top = new Map<string, string>();
  /** The statements at the start of a run: the constants of the run and the functions of the memo. */
  readonly run: string[] = [];
  /** The variables of the schema that the program reads. */
  readonly vars = new Map<string, string>();
  /** True when the module has a node of the memo, so it needs the key of -0. */
  memos = false;
  /** The parts of the helper S that the nodes of the memo that keep their items need (helperS). */
  readonly features = new Set<Feature>();
  #names = 0;
  /** The node of the memo whose function the printer prints, so it prints the node itself. */
  #inside: Expr | undefined;
  readonly #structures = new Map<string, string>();
  readonly #kinds = new Map<string, PrimitiveKind | undefined>();
  readonly #ops = new Map<string, number>();
  /** The inline form of each function of an op, or undefined for a function that the module calls. */
  readonly #forms = new Map<string, InlineForm | undefined>();
  /** The functions of ops that the module calls, not in an inline form. */
  readonly #called = new Set<string>();
  /** The key of the expression of each code that is a constant of the run, and the read of each hoisted constant by key. */
  readonly #keyOf = new WeakMap<Code, string>();
  readonly #constants = new Map<string, Code>();

  constructor(expr: Expr, options: ModuleOptions) {
    this.#domains = options.domains ?? [];
    this.#facts = factsOf({ domains: this.#domains });
    this.#schema = options.schema;
    this.#memo = memoOf(expr);
  }

  use(name: Helper): string {
    this.helpers.add(name);
    return name;
  }

  /**
   * This method gives the check of a result of a kind, or undefined for a result that needs no check. A number must be
   * finite, and the domain of the kind can check the value with valid. The law checker of the test kit checks the
   * declaration `returns` of each op (KIND.RETURNS), so the module trusts the kind itself.
   */
  check(kind: PrimitiveKind): string | undefined {
    const name = `k_${kind}`;
    // Stryker disable next-line ConditionalExpression: a check of a kind is always the same, so the map only saves time
    if (!this.top.has(name)) {
      const d = this.#facts.checkOf(kind);
      if (d === undefined) throw new NotStandalone(`a domain without a primitive type comes before the domain of a ${kind}`);
      const domain = this.#domains[d];
      const valid = domain?.valid === undefined ? undefined : this.#valid(d, domain.name, kind, domain.valid);
      const conds = [...(kind === "number" ? ["Number.isFinite(x)"] : []), ...(valid === undefined ? [] : [`${valid}(x)`])];
      if (conds.length === 0) return undefined;
      this.top.set(name, `const ${name} = (x) => (${conds.join(" && ")} ? x : ${this.use("F")}());`);
    }
    return name;
  }

  /** This method gives the code of a result with its check, if it needs one. */
  #checked(kind: PrimitiveKind, code: string): string {
    const k = this.check(kind);
    return k === undefined ? code : `${k}(${code})`;
  }

  #valid(d: number, domain: string, kind: PrimitiveKind, valid: (x: never) => boolean): string | undefined {
    const name = `v_${d}`;
    const src = copied(valid, [kind], `the check "valid" of the domain ${domain}`);
    // A check that is Number.isFinite of a number adds nothing to the check of the result.
    const form = inlineForm(src);
    if (kind === "number" && form !== undefined && patternOf(form, (p) => p) === "Number.isFinite(#0)") return undefined;
    this.top.set(name, `const ${name} = ${src};`);
    return name;
  }

  /** This method gives a new name for the code. */
  fresh(prefix: string): string {
    return `${prefix}${this.#names++}`;
  }

  /** This method gives the code of a name: a read that throws the error of its value, if it can hold an error. */
  #read(name: Name): Value {
    const base = { kind: name.kind, deps: name.deps, plain: true };
    return name.lazy ? { ...base, code: `${this.use("G")}(${name.code})`, safe: false, held: name.code } : { ...base, code: name.code, safe: true };
  }

  /** This method gives the name of a constant of the run, from the read of its value. */
  #nameOf(v: Value): Name {
    return { code: v.held ?? v.code, kind: v.kind, lazy: v.held !== undefined, deps: NO_DEPS };
  }

  /**
   * This method gives the statements that put the value of a code, or the error sentinel, into a new variable `name`.
   * A constant of the run without statements uses the helper `T`: it evaluates once, so its closure costs little.
   */
  #store(name: string, c: Code, run = false): string[] {
    if (c.v.safe) return [...c.s, `const ${name} = ${c.v.code};`];
    if (c.s.length === 0 && c.v.held !== undefined) return [`const ${name} = ${c.v.held};`];
    if (run && c.s.length === 0) return [`const ${name} = ${this.use("T")}(() => ${c.v.code});`];
    return [`let ${name};`, "try {", ...ind(c.s), `  ${name} = ${c.v.code};`, "} catch {", `  ${name} = E;`, "}"];
  }

  /** This method evaluates a constant of the run once, before the loop over the keys, and gives the read of its value. */
  #hoist(c: Code): Code {
    if (c.v.deps.size > 0 || (c.v.plain === true && c.s.length === 0)) return c;
    const key = this.#keyOf.get(c);
    const hit = key === undefined ? undefined : this.#constants.get(key);
    if (hit !== undefined) return hit;
    const name = this.fresh("c");
    this.run.push(...this.#store(name, c, true));
    const read = bare(this.#read({ code: name, kind: c.v.kind, lazy: !c.v.safe, deps: NO_DEPS }));
    if (key !== undefined) this.#constants.set(key, read);
    return read;
  }

  /**
   * This method gives the parts of a node with levels `deps`. When the node is not a constant of the run, each part that
   * is a constant evaluates once, before the loop. A node that is a constant keeps its parts, and its parent decides.
   */
  #settle(parts: readonly Code[], deps: ReadonlySet<number>): readonly Code[] {
    return deps.size === 0 ? parts : parts.map((x) => this.#hoist(x));
  }

  expr(e: Expr, ctx: Ctx): Code {
    const key = ctx.keys.get(e);
    if (key !== undefined) return bare(this.#read(key));
    const keys = this.#memo.get(e);
    const c = keys !== undefined && this.#inside !== e ? this.#memoized(e, keys, ctx) : this.#node(e, ctx);
    // A constant of the run with the structure of an earlier one is that constant.
    if (c.v.deps.size === 0 && !(c.v.plain === true && c.s.length === 0)) this.#keyOf.set(c, this.#constKey(e, ctx));
    return c;
  }

  #node(e: Expr, ctx: Ctx): Code {
    switch (e.tag) {
      case "lit":
        return bare(literal(e.value));
      case "ref":
        return this.#ref(e, ctx);
      case "var":
        return bare(this.#var(e.name, ctx));
      case "let":
        return this.#let(e, ctx);
      case "rec": {
        const names = Object.keys(e.fields);
        const raw = Object.values(e.fields).map((x) => this.expr(x, ctx));
        const deps = depsOf(...raw);
        const fields = this.#settle(raw, deps);
        // A record of a module is a new object, so it needs no freeze.
        const code = `({ ${fields.map((x, i) => `${JSON.stringify(names[i])}: ${x.v.code}`).join(", ")} })`;
        return { s: stmtsOf(...fields), v: { code, kind: undefined, safe: fields.every((x) => x.v.safe), deps } };
      }
      case "app":
        return this.#app(e, ctx);
      case "each":
        throw new NotStandalone("a list is a value of the program");
      case "fold":
      case "iterate":
        throw new NotStandalone(`the loop "${e.tag}"`);
      case "ext":
        throw new NotStandalone(`the extension "${e.kind}"`);
    }
  }

  /**
   * This method gives the code of the index of an address from the focus. `values` has the code of the value of each
   * computed move, in order (NAV.COMPUTED).
   */
  #address(at: readonly Move[], ctx: Ctx, values: readonly Code[]): string {
    let index = ctx.focus;
    let next = 0;
    for (const m of at) index = moveExpr(m) === undefined ? this.#move(m, index, ctx.origin) : this.#computed(m, values[next++] as Code);
    // A node of the memo reads neither its origin nor its focus (memo.ts), so the guards of this method do not fail.
    // Stryker disable next-line ConditionalExpression,StringLiteral: see the comment above
    /* v8 ignore next -- @preserve */
    if (index === undefined) throw new NotStandalone("a node of the memo reads its focus");
    return index;
  }

  /** This method gives the code of the index of a computed move, from the code of its value. */
  #computed(m: Move, value: Code): string {
    return `${this.use(m.t === "key" ? "K" : "I")}(${value.v.code}, n)`;
  }

  #move(m: Move, focus: string | undefined, origin: string | undefined): string {
    const F = this.use("F");
    switch (m.t) {
      case "origin":
        // Stryker disable next-line ConditionalExpression,StringLiteral: see #address
        /* v8 ignore next -- @preserve */
        if (origin === undefined) throw new NotStandalone("a node of the memo reads its origin");
        return origin;
      case "key":
        // A key of an array space is the text of its index.
        return typeof m.key === "string" && /^(0|[1-9]\d*)$/.test(m.key) ? `(${m.key} < n ? ${m.key} : ${F}())` : `${F}()`;
      case "index":
        return typeof m.i === "number" && Number.isInteger(m.i) && m.i >= 0 ? `(${m.i} < n ? ${m.i} : ${F}())` : `${F}()`;
      case "offset": {
        const [d, ...more] = m.d;
        // Stryker disable next-line ConditionalExpression,StringLiteral: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        if (d === undefined || more.length > 0 || !Number.isInteger(d)) return `${F}()`;
        return `${this.use("X")}(${focus} + ${d}, n)`;
      }
      case "other":
        // Stryker disable next-line ConditionalExpression,StringLiteral: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        return `(n === 2 ? 1 - ${focus} : ${F}())`;
      case "parent":
        return `${F}()`;
    }
  }

  #ref(e: ExprOf<"ref">, ctx: Ctx): Code {
    const [field, ...more] = e.path;
    const kind = field === undefined ? undefined : this.#schema.fields?.[field];
    if (field === undefined || more.length > 0 || !isFieldName(field) || kind === undefined) throw new NotStandalone(`a read of a field that is not in the schema: "${e.path.join(".")}"`);
    // A move to the origin cannot fail, and the schema has the field in each record.
    const at = e.at ?? [];
    const safe = at.every((m) => m.t === "origin");
    const values = this.#addressValues(at, ctx);
    const deps = this.#addressDeps(at, ctx, values);
    const parts = this.#settle(values, deps);
    return { s: stmtsOf(...parts), v: { code: `R[${this.#address(at, ctx, parts)}][${JSON.stringify(field)}]`, kind, safe, deps } };
  }

  /** This method gives the code of the expressions of the computed moves of an address. They evaluate at the node. */
  #addressValues(at: readonly Move[], ctx: Ctx): readonly Code[] {
    return addrExprs(at).map((x) => this.expr(x, ctx));
  }

  /**
   * This method gives the levels of the key of an address. The focus and the origin have their level, and a fixed key
   * has no level. A computed move has the levels of its value.
   */
  #addressDeps(at: readonly Move[], ctx: Ctx, values: readonly Code[]): ReadonlySet<number> {
    let deps: ReadonlySet<number> = new Set([ctx.level]);
    let next = 0;
    for (const m of at) {
      if (moveExpr(m) !== undefined) deps = (values[next++] as Code).v.deps;
      else if (m.t === "origin") deps = new Set([1]);
      else if (m.t === "key" || m.t === "index" || m.t === "parent") deps = NO_DEPS;
    }
    return deps;
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
    return plainValue(code, kind);
  }

  /**
   * A binding is a variable. A binding with an error is an error only where the body reads its name, so the variable
   * can hold the sentinel. A binding that is a constant of the run is the variable of that constant.
   */
  #let(e: ExprOf<"let">, ctx: Ctx): Code {
    const env = new Map(ctx.env);
    const s: string[] = [];
    let deps = new Set<number>();
    for (const [name, x] of Object.entries(e.bind)) {
      const c = this.#hoist(this.expr(x, ctx));
      if (c.v.deps.size === 0) {
        env.set(name, this.#nameOf(c.v));
        continue;
      }
      const b = this.fresh("b");
      s.push(...this.#store(b, c));
      env.set(name, { code: b, kind: c.v.kind, lazy: !c.v.safe, deps: c.v.deps });
      // The statements of the binding read its keys, so the let is not a constant of the run.
      deps = new Set([...deps, ...c.v.deps]);
    }
    const body = this.expr(e.body, { ...ctx, env });
    return { s: [...s, ...body.s], v: { ...body.v, deps: new Set([...deps, ...body.v.deps]) } };
  }

  #boolean(v: Value): string {
    return v.kind === "boolean" ? v.code : `${this.use("B")}(${v.code})`;
  }

  /** A condition is safe when it is a safe boolean. */
  #safeBoolean(v: Value): boolean {
    return v.safe && v.kind === "boolean";
  }

  #app(e: ExprOf<"app">, ctx: Ctx): Code {
    const { op, args } = e;
    if (op === "if") return this.#if(args, ctx);
    if (op === "and" || op === "or") return this.#andOr(op === "and", args, ctx);
    if (op === "ifError") return this.#ifError(args, ctx);
    const [head] = args;
    if (LIST_OPS.has(op) && head?.tag === "each") return this.#list(op, head, args.slice(1), ctx);
    const raw = args.map((x) => this.expr(x, ctx));
    const deps = depsOf(...raw);
    const values = this.#settle(raw, deps);
    const site = this.#facts.staticSite(op, values.map((x) => x.v.kind));
    if (site?.t !== "fn") throw new NotStandalone(`the kinds of the values of "${op}" do not decide its op`);
    if (site.bad) return { s: stmtsOf(...values), v: { code: `${this.use("F")}()`, kind: site.returns, safe: false, deps } };
    if (site.returns === undefined) throw new NotStandalone(`the op "${op}" does not declare the kind of its result`);
    const d = this.#domains[site.domain] as AnyDomain;
    const name = `op_${site.domain}_${this.#opIndex(op)}`;
    // Stryker disable next-line ConditionalExpression: the form of an op is always the same, so the map only saves time
    if (!this.#forms.has(name)) {
      // A static site of a domain has the function of the op of that domain.
      const fn = (d.ops[op] as { fn: (...a: never[]) => unknown }).fn;
      const kinds = values.map((x) => x.v.kind).filter((k): k is PrimitiveKind => k !== undefined);
      const src = copied(fn, kinds, `the op "${op}" of the domain ${d.name}`);
      this.#forms.set(name, inlineForm(src));
      this.top.set(name, `const ${name} = ${src};`);
    }
    const form = this.#forms.get(name);
    // An inline form takes each argument once, or a plain argument more often, so each argument evaluates once.
    const inline = form !== undefined && form.params.length === values.length && values.every((x, i) => form.uses[i] === 1 || (x.v.plain === true && x.v.safe && (form.uses[i] as number) > 0));
    if (inline) {
      const text = form.parts.map((x) => (typeof x === "number" ? `(${(values[x] as Code).v.code})` : x)).join("");
      const checked = this.check(site.returns);
      const code = checked === undefined ? `(${text})` : `${checked}(${text})`;
      return { s: stmtsOf(...values), v: { code, kind: site.returns, safe: checked === undefined && values.every((x) => x.v.safe), deps } };
    }
    this.#called.add(name);
    // An exception of the op is an error of Vex: the boundary around the op catches it.
    const code = this.#checked(site.returns, `${name}(${values.map((x) => x.v.code).join(", ")})`);
    return { s: stmtsOf(...values), v: { code, kind: site.returns, safe: false, deps } };
  }

  /** The condition must be a boolean. Only the branch that the condition selects is evaluated. */
  #if(args: readonly Expr[], ctx: Ctx): Code {
    if (args.length !== 3) throw new NotStandalone("an if without three arguments");
    const [c, a, b] = args as [Expr, Expr, Expr];
    const raw = [this.expr(c, ctx), this.expr(a, ctx), this.expr(b, ctx)];
    const deps = depsOf(...raw);
    const [cond, yes, no] = this.#settle(raw, deps) as [Code, Code, Code];
    const v = { kind: join(yes.v.kind, no.v.kind), safe: this.#safeBoolean(cond.v) && yes.v.safe && no.v.safe, deps };
    if (yes.s.length === 0 && no.s.length === 0) return { s: cond.s, v: { ...v, code: `(${this.#boolean(cond.v)} ? ${yes.v.code} : ${no.v.code})` } };
    const t = this.fresh("t");
    const s = [...cond.s, `let ${t};`, `if (${this.#boolean(cond.v)}) {`, ...ind(yes.s), `  ${t} = ${yes.v.code};`, "} else {", ...ind(no.s), `  ${t} = ${no.v.code};`, "}"];
    return { s, v: { ...v, code: t } };
  }

  /** `and` stops at the first `false`, and `or` at the first `true`. Each argument before the stop must be a boolean. */
  #andOr(and: boolean, args: readonly Expr[], ctx: Ctx): Code {
    if (args.length === 0) throw new NotStandalone(`an ${and ? "and" : "or"} without arguments`);
    const raw = args.map((x) => this.expr(x, ctx));
    const deps = depsOf(...raw);
    const parts = this.#settle(raw, deps);
    const v = { kind: "boolean" as const, safe: parts.every((x) => this.#safeBoolean(x.v)), deps };
    const [first, ...rest] = parts as [Code, ...Code[]];
    if (rest.every((x) => x.s.length === 0)) return { s: first.s, v: { ...v, code: `(${parts.map((x) => this.#boolean(x.v)).join(and ? " && " : " || ")})` } };
    const t = this.fresh("t");
    const s = [...first.s, `let ${t} = ${this.#boolean(first.v)};`];
    for (const x of rest) s.push(`if (${and ? "" : "!"}${t}) {`, ...ind(x.s), `  ${t} = ${this.#boolean(x.v)};`, "}");
    return { s, v: { ...v, code: t } };
  }

  /** The value of the first argument, or else the value of the second argument. */
  #ifError(args: readonly Expr[], ctx: Ctx): Code {
    if (args.length !== 2) throw new NotStandalone("an ifError without two arguments");
    const [a, b] = args as [Expr, Expr];
    const raw = [this.expr(a, ctx), this.expr(b, ctx)];
    const deps = depsOf(...raw);
    const [first, second] = this.#settle(raw, deps) as [Code, Code];
    if (first.v.safe) return first;
    const t = this.fresh("t");
    const s = [`let ${t};`, "try {", ...ind(first.s), `  ${t} = ${first.v.code};`, "} catch {", ...ind(second.s), `  ${t} = ${second.v.code};`, "}"];
    return { s, v: { code: t, kind: join(first.v.kind, second.v.kind), safe: second.v.safe, deps } };
  }

  #opIndex(op: string): number {
    let i = this.#ops.get(op);
    if (i === undefined) {
      i = this.#ops.size;
      this.#ops.set(op, i);
    }
    return i;
  }

  /**
   * This method gives the option strict of a list op. The options must be one literal with only strict. Only a literal
   * has a value, so another expression gives the reason too.
   */
  #strict(op: string, rest: readonly Expr[]): boolean {
    const [options, ...more] = rest;
    if (more.length > 0) throw new NotStandalone(`"${op}" with more than one option`);
    if (options === undefined) return false;
    const opts = (options as { readonly value?: unknown }).value;
    if (typeof opts !== "object" || opts === null || Object.keys(opts).some((k) => k !== "strict")) throw new NotStandalone(`the options of "${op}" are not a literal with strict`);
    return (opts as { readonly strict?: unknown }).strict === true;
  }

  /**
   * A list op over an axis: one `for` loop with a running value. An item with an error is skipped, and with `strict` it
   * is an error of the list op. A value of the wrong kind is an error of the list op, as in the interpreter.
   */
  #list(op: string, target: ExprOf<"each">, rest: readonly Expr[], ctx: Ctx): Code {
    const strict = this.#strict(op, rest);
    const { base, tests } = testsOf(target.axis);
    const at = target.at ?? [];
    const j = this.fresh("j");
    const level = ctx.level + 1;
    const inner: Ctx = { ...ctx, focus: j, level };
    const s: string[] = [];
    let lo = "0";
    let hi = "n";
    let skip: string | undefined;
    // The targets of the axis all depend on no key, but its address can fail (V-051). The other axes start at their
    // address.
    let start: ReadonlySet<number> = NO_DEPS;
    const f = base.t === "all" && at.length === 0 ? undefined : this.fresh("f");
    if (f !== undefined) {
      const values = this.#addressValues(at, ctx);
      start = this.#addressDeps(at, ctx, values);
      const parts = this.#settle(values, start);
      s.push(...stmtsOf(...parts), `const ${f} = ${this.#address(at, ctx, parts)};`);
    }
    if (base.t === "others") skip = f;
    else if (base.t === "window") {
      if (!Number.isInteger(base.from) || !Number.isInteger(base.to)) throw new NotStandalone('the axis "window" with a bound that is not an integer');
      const h = this.fresh("h");
      lo = `Math.max(0, ${f as string} + Math.max(${base.from}, -n))`;
      s.push(`const ${h} = Math.min(n, ${f as string} + Math.min(${base.to}, n) + 1);`);
      hi = h;
    } else if (base.t !== "all") throw new NotStandalone(`the axis "${base.t}"`);
    // Inside the loop, a constant of the run evaluates once, before the loop over the keys of the run.
    const testCodes = tests.map((t) => this.#hoist(this.expr(t, inner)));
    const body = this.#hoist(this.expr(target.body, inner));
    // A count of all the items, whose body cannot fail, is the count of the records. A safe body covers its statements.
    if (op === "count" && f === undefined && tests.length === 0 && body.v.safe) return bare(plainValue("n", "number"));
    const deps = new Set([...start, ...[body, ...testCodes].flatMap((x) => [...x.v.deps])].filter((d) => d !== level));
    const a = this.fresh("a");
    const n = this.fresh("n");
    const v = this.fresh("x");
    const num = body.v.kind === "number" ? v : `${this.use("U")}(${v})`;
    const bool = body.v.kind === "boolean" ? v : `${this.use("B")}(${v})`;
    const F = this.use("F");
    const inits: Readonly<Record<string, string>> = {
      count: `let ${n} = 0;`,
      sum: `let ${a} = 0;`,
      mean: `let ${a} = 0, ${n} = 0;`,
      any: `let ${a} = false;`,
      none: `let ${a} = false;`,
      all: `let ${a} = true;`,
    };
    s.push(inits[op] ?? `let ${a}, ${n} = 0;`);
    const steps: Readonly<Record<string, string>> = {
      count: `${n}++;`,
      sum: `${a} += ${num};`,
      mean: `${a} += ${num}; ${n}++;`,
      min: `${a} = ${n}++ === 0 ? ${num} : Math.min(${a}, ${num});`,
      max: `${a} = ${n}++ === 0 ? ${num} : Math.max(${a}, ${num});`,
      any: `if (${bool}) ${a} = true;`,
      none: `if (${bool}) ${a} = true;`,
      all: `if (!${bool}) ${a} = false;`,
      first: `if (${n}++ === 0) ${a} = ${v};`,
    };
    const item = [...testCodes.flatMap((t) => [...t.s, `if (!${this.#boolean(t.v)}) continue;`]), ...body.s];
    // An item whose tests and body cannot fail needs no try.
    const safeItem = body.v.safe && testCodes.every((t) => this.#safeBoolean(t.v));
    const loop = [
      ...(skip === undefined ? [] : [`if (${j} === ${skip}) continue;`]),
      ...(safeItem
        ? [...item, `const ${v} = ${body.v.code};`]
        : [`let ${v};`, "try {", ...ind(item), `  ${v} = ${body.v.code};`, "} catch {", strict ? `  ${F}();` : "  continue;", "}"]),
      steps[op] as string,
    ];
    s.push(`for (let ${j} = ${lo}; ${j} < ${hi}; ${j}++) {`, ...ind(loop), "}");
    const results: Readonly<Record<string, string>> = {
      count: n,
      sum: this.#checked("number", a),
      mean: `(${n} === 0 ? ${F}() : ${this.#checked("number", `${a} / ${n}`)})`,
      any: a,
      all: a,
      none: `!${a}`,
    };
    const code = results[op] ?? `(${n} === 0 ? ${F}() : ${a})`;
    // A count without strict, and any, all and none over booleans without strict, cannot fail. The address of the axis
    // can fail, except at the focus or at the origin.
    const startSafe = at.every((m) => m.t === "origin");
    const safe = startSafe && !strict && (op === "count" || (BOOLEAN_LIST_OPS.has(op) && body.v.kind === "boolean"));
    return { s, v: { code, kind: listKind(op, body.v.kind), safe, deps } };
  }

  /**
   * A node of the memo: one function of its keys for each structure, with an entry for each value of the keys. A key
   * that is a constant of the run is the variable of that constant, not a key of the function. A node with no other key
   * is a constant of the run itself.
   */
  #memoized(e: Expr, keys: readonly Expr[], ctx: Ctx): Code {
    const values = keys.map((k) => this.#hoist(this.expr(k, ctx)));
    const varying = keys.filter((_k, i) => (values[i] as Code).v.deps.size > 0);
    const params = varying.map(() => this.fresh("q"));
    const names = new Map(
      keys.map((k, i): [Expr, Name] => {
        const x = (values[i] as Code).v;
        const p = varying.indexOf(k);
        return [k, p < 0 ? this.#nameOf(x) : { code: params[p] as string, kind: x.kind, lazy: true, deps: new Set([1]) }];
      }),
    );
    const outer = this.#inside;
    this.#inside = e;
    const bodyCtx: Ctx = { origin: undefined, focus: undefined, level: 1, env: new Map(), keys: names };
    if (varying.length === 0) {
      const body = this.#hoist(this.expr(e, bodyCtx));
      this.#inside = outer;
      return body;
    }
    // The kinds of the keys decide the ops in the node, so they are a part of the structure. Each key of the function
    // can hold the error sentinel, so the nodes with a safe key and the nodes without one share it.
    const tokens = new Map(keys.map((k, i): [Expr, object] => [k, varying.includes(k) ? { "#": varying.indexOf(k), kind: (values[i] as Code).v.kind } : { "@": (names.get(k) as Name).code }]));
    const structure = canonical(e, (x) => tokens.get(x as Expr));
    let fn = this.#structures.get(structure);
    if (fn === undefined) {
      fn = this.fresh("m");
      this.#structures.set(structure, fn);
      this.memos = true;
      const cached = varying.length === 1 ? this.#cached(e, varying[0] as Expr, bodyCtx, fn) : undefined;
      if (cached !== undefined) {
        this.#kinds.set(fn, cached.kind);
        this.run.push(...cached.lines);
      } else {
        // The loop of the node gives statements.
        const body = this.expr(e, bodyCtx);
        this.#kinds.set(fn, body.v.kind);
        this.run.push(`const ${fn} = ${this.use(params.length === 1 ? "M1" : "M")}((${params.join(", ")}) => {`, ...ind(body.s), `  return ${body.v.code};`, "});");
      }
    }
    this.#inside = outer;
    // Each key of the function gets its value, or the error sentinel.
    const s: string[] = [];
    const args = varying.map((k) => {
      const c = values[keys.indexOf(k)] as Code;
      if (c.v.safe && c.s.length === 0) return c.v.code;
      if (c.s.length === 0 && c.v.held !== undefined) return c.v.held;
      const t = this.fresh("k");
      s.push(...this.#store(t, c));
      return t;
    });
    return { s, v: { code: `${fn}(${args.join(", ")})`, kind: this.#kinds.get(fn), safe: false, deps: depsOf(...values) } };
  }

  /**
   * This method gives the code of a node of the memo whose key is only in one test of a list op: `test(T, key)`. Such a
   * node keeps its items in the helper `S`. One pass gives the tests before the test of the key and the value `T` of each
   * item. The rest of an item evaluates once, at the first key whose test is true.
   *
   * With the test `===`, each value `T` has a group of items. With `<` or `<=` and values `T` that do not decrease, the
   * items whose test is true are a prefix. Each prefix keeps its running value. The values add in the order of the items, so the result has the bits of the interpreter. An error before the test
   * of the key is an error of the item at each key. An error after it is an error at the keys whose test is true.
   */
  #cached(e: Expr, key: Expr, bodyCtx: Ctx, fn: string): { readonly lines: readonly string[]; readonly kind: PrimitiveKind | undefined } | undefined {
    // Only an app has an op, and a node of the memo has a loop, so a list op has its target.
    const { op, args } = e as ExprOf<"app">;
    if (!LIST_OPS.has(op)) return undefined;
    const [target, ...rest] = args as [Expr, ...Expr[]];
    if (target.tag !== "each" || (target.at ?? []).length > 0) return undefined;
    const strict = this.#strict(op, rest);
    const kind = (bodyCtx.keys.get(key) as Name).kind;
    const { base, tests: raw } = testsOf(target.axis);
    const tests = raw.flatMap(partsOf);
    const at = tests.findIndex((t) => contains(t, key));
    const test = tests[at];
    if (base.t !== "all" || test?.tag !== "app" || test.args.length !== 2 || contains(target.body, key) || tests.some((t, i) => i !== at && contains(t, key))) return undefined;
    const [l, r] = test.args as [Expr, Expr];
    const keyFirst = l === key;
    const other = keyFirst ? r : l;
    if ((!keyFirst && r !== key) || contains(other, key)) return undefined;
    const j = this.fresh("j");
    const loop: Ctx = { ...bodyCtx, focus: j, level: 2 };
    const t = this.#hoist(this.expr(other, loop));
    // The test of the key is an op whose inline form cannot fail: then the loop over the items needs no try.
    const site = this.#facts.staticSite(test.op, keyFirst ? [kind, t.v.kind] : [t.v.kind, kind]);
    if (site?.t !== "fn" || site.bad || site.returns !== "boolean" || this.check("boolean") !== undefined) return undefined;
    // A static site of a domain has the function of the op of that domain.
    const form = inlineForm(Function.prototype.toString.call(((this.#domains[site.domain] as AnyDomain).ops[test.op] as { fn: (...a: never[]) => unknown }).fn));
    if (form?.params.length !== 2) return undefined;
    const before = tests.slice(0, at).map((x) => this.#hoist(this.expr(x, loop)));
    const after = tests.slice(at + 1).map((x) => this.#hoist(this.expr(x, loop)));
    const body = this.#hoist(this.expr(target.body, loop));
    const B = (v: Value): string => this.#boolean(v);
    // The kind of the test of the key: `===` gives the groups of equal values, and `<` or `<=` from T to the key gives
    // the prefixes of the items when T does not decrease. NaN satisfies neither test, so its item is in no group.
    const pattern = patternOf(form, (p) => (keyFirst ? 1 - p : p));
    const mode = pattern === "#0===#1" || pattern === "#1===#0" ? 1 : ["#0<#1", "#0<=#1", "#1>#0", "#1>=#0"].includes(pattern) ? 2 : 0;
    const testArgs = keyFirst ? ["q", "t"] : ["t", "q"];
    const keyTest = form.parts.map((p) => (typeof p === "number" ? `(${testArgs[p] as string})` : p)).join("");
    if (mode === 1) this.features.add("group");
    if (mode === 2) this.features.add("prefix");
    if (strict) this.features.add("strict");
    const F = this.use("F");
    // A function of the index of an item, from its statements and its value.
    const arrow = (lines: readonly string[], code: string): readonly string[] => (lines.length === 0 ? [`(${j}) => ${code}`] : [`(${j}) => {`, ...ind(lines), `  return ${code};`, "}"]);
    const pre = before.length === 0 ? undefined : before.every((x) => x.s.length === 0) ? arrow([], before.map((x) => B(x.v)).join(" && ")) : arrow(before.flatMap((x, i) => [...x.s, ...(i < before.length - 1 ? [`if (!${B(x.v)}) return false;`] : [])]), B((before.at(-1) as Code).v));
    // The value of an item: the tests after the test of the key, and the body. N is an item that a later test excludes,
    // and E is an error.
    const value =
      after.length === 0 && body.v.safe && body.s.length === 0
        ? arrow([], body.v.code)
        : [`(${j}) => {`, "  try {", ...ind(ind([...after.flatMap((x) => [...x.s, `if (!${B(x.v)}) return N;`]), ...body.s])), `    return ${body.v.code};`, "  } catch {", "    return E;", "  }", "}"];
    const [stepName, stepCode] = STEPS[op] as readonly [string, string];
    this.top.set(stepName, `const ${stepName} = ${stepCode};`);
    // A sum has the check of a number, and only a sum or a mean needs that check.
    const results: Readonly<Record<string, () => readonly [string, string]>> = {
      count: () => ["r_count", "(a, c) => c"],
      sum: () => [this.check("number") ?? "r_id", "(a) => a"],
      mean: () => ["r_mean", `(a, c) => (c === 0 ? ${F}() : ${this.#checked("number", "a / c")})`],
      any: () => ["r_id", "(a) => a"],
      all: () => ["r_id", "(a) => a"],
      none: () => ["r_not", "(a) => !a"],
    };
    const [resultName, resultCode] = results[op]?.() ?? ["r_one", `(a, c) => (c === 0 ? ${F}() : a)`];
    if (!this.top.has(resultName)) this.top.set(resultName, `const ${resultName} = ${resultCode};`);
    const a0 = op === "sum" || op === "mean" ? "0" : op === "all" ? "true" : BOOLEAN_LIST_OPS.has(op) ? "false" : "undefined";
    // The values of an op of numbers or of booleans have that kind, or the result is an error. Count takes each kind.
    const needs = op === "count" ? undefined : listKind(op, undefined);
    const ok = needs === undefined || body.v.kind === needs ? [] : [`(x) => typeof x === "${needs}"`];
    if (ok.length > 0) this.features.add("ok");
    if (pre !== undefined) this.features.add("pre");
    const fns = [arrow(t.s, t.v.code), value, [`(t, q) => ${keyTest}`], ...(pre === undefined && ok.length === 0 ? [] : [pre ?? ["undefined"]]), ...(ok.length === 0 ? [] : [ok])];
    const lines = fns.flatMap((x, i) => [...x.slice(0, -1), `${x.at(-1) ?? ""}${i < fns.length - 1 ? "," : ""}`]);
    return { lines: [`const ${fn} = ${this.use("S")}(n, ${mode}, ${String(strict)}, ${a0}, ${stepName}, ${resultName},`, ...ind(lines), ");"], kind: listKind(op, body.v.kind) };
  }

  /** This method gives the code of the program at the key of the run. A constant of the run evaluates once. */
  root(expr: Expr): Code {
    const c = this.#hoist(this.expr(expr, { origin: "o", focus: "o", level: 1, env: new Map(), keys: new Map() }));
    // A function of an op with an inline form at each of its sites needs no declaration.
    for (const [name, form] of this.#forms) if (form !== undefined && !this.#called.has(name)) this.top.delete(name);
    return c;
  }

  /**
   * This method gives a text that is the same for two expressions with the same structure and the same reads. A name
   * that the expression does not bind gives its variable in the code, and a key of the memo gives its variable too.
   */
  #constKey(e: Expr, ctx: Ctx): string {
    // A name gives its variable for each read, also for a read of a name that the expression binds. The variable depends
    // only on the name, so two expressions with the same text have the same value.
    return canonical(e, (x) => {
      const key = ctx.keys.get(x as Expr);
      if (key !== undefined) return { "@": key.code };
      return (x as Expr | undefined)?.tag === "var" ? { $: ctx.env.get((x as ExprOf<"var">).name)?.code ?? (x as ExprOf<"var">).name } : undefined;
    });
  }
}

/**
 * This function prints a program as a standalone ES module. The module exports `VexContractError`, `VEX_ERROR` and a
 * function that takes the records and the variables and gives the value at each key. It is pure, so a build can use it.
 */
export function emitModule(expr: Expr, options: ModuleOptions): Emitted {
  const name = options.name ?? "run";
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { ok: false, reason: `the name "${name}" is not a JavaScript name` };
  const p = new Printer(expr, options);
  let value: Code;
  try {
    value = p.root(expr);
  } catch (thrown) {
    // Each error of the printer is a NotStandalone. Another exception is a defect, so it goes to the caller.
    if (!(thrown instanceof NotStandalone)) throw thrown;
    return { ok: false, reason: thrown.message };
  }
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
    ...(p.memos ? ["const Z = {};"] : []),
    // The values of an item of a node that keeps its items: excluded by a later test, and of the wrong kind.
    ...(helpers.has("S") ? ["const N = {}, W = {};"] : []),
    ...[...helpers].map((h) => (h === "S" ? helperS(p.features) : HELPERS[h])),
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
    ...ind(p.run),
    "  const out = [];",
    "  for (let o = 0; o < n; o++) {",
    "    try {",
    ...ind(ind(ind(value.s))),
    `      out.push(${value.v.code});`,
    "    } catch {",
    "      out.push(VEX_ERROR);",
    "    }",
    "  }",
    "  return out;",
    "}",
    "",
  ];
  return { ok: true, source: lines.join("\n") };
}

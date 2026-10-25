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
 * The printer takes a part of the language. It takes an array space or a tree space of records, and the fields and
 * the variables of the schema. It takes the axes `all`, `others` and `window`. A tree space also has the move `parent` and the
 * axes of a tree (COMPILE.MODULE.TREE). The kinds of each op site must decide its op. Another construct gives a
 * reason, not code.
 *
 * `emitSheetModule` prints the formula columns of a sheet as one module (COMPILE.MODULE.SHEET). Each column is an array
 * of results, and the run fills the arrays in the static order of `SheetRun.fill`. A read of a cell that is not finished
 * starts the search of `SheetRun`. Thus each cell on a cycle gives the error of Vex.
 */
import { addrExprs, CELL_KIND, children, fromDocument, isDocument, isFieldName, lit, moveExpr, nestingOf, rec, shapeError, type AnyDomain, type Axis, type CellFormulas, type Envelope, type Expr, type ExprOf, type Move, type Names, type PrimitiveKind } from "@mark1russell7/vex";
import { factsOf, kindOfDomain, primitiveOf, type Facts, type Kind, type Schema } from "./facts.ts";
import { memoNodes } from "./memo.ts";
import { columnOrder, isCellRef, keyOrderOf, readsOf } from "./sheet-order.ts";

/** The options of a standalone module. */
export interface ModuleOptions {
  readonly domains?: readonly AnyDomain[];
  /** The kinds of the fields of the records and of the variables. A module reads only the names of its schema. */
  readonly schema: Schema;
  /** The name of the function that the module exports. The default is `run`. */
  readonly name?: string;
  /**
   * The space of the records. In both spaces, the key of a record is the text of its position. The default `array`
   * has no parents. A `tree` takes the parents as the third argument of the run (COMPILE.MODULE.TREE). Each entry
   * is the position of the parent of its record, or -1 for a root.
   */
  readonly space?: "array" | "tree";
}

/** The options of a module of a sheet (COMPILE.MODULE.SHEET): the options of a module, and the parts of a sheet. */
export interface SheetModuleOptions extends ModuleOptions {
  /** The cells with their own formula (SHEET.CELL.FORMULA). The formula of a cell replaces the formula of its column at its key. */
  readonly cells?: CellFormulas;
  /**
   * The kind of the values of each column. The printer prints each column after the columns that it reads. A column
   * that a formula reads before its own formula prints needs its kind here, for example a column that reads itself.
   */
  readonly kinds?: Readonly<Record<string, Kind>>;
  /** The budget of the stack of the search of a run, in estimated frames, as in `SheetRun`. The default is 3000. */
  readonly budget?: number;
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
  readonly kind: Kind | undefined;
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
  /** For a list (LIST.VALUE): the kind of its items. The code is an array of pairs of a key and a value or the sentinel. */
  readonly list?: ListInfo | undefined;
}

/** The facts of a list of the code: the kind of the values of its items, if the printer knows it. */
interface ListInfo {
  readonly item: Kind | undefined;
}

/** The code of a node: the statements before its value, and its value. `safe` covers the statements too. */
interface Code {
  readonly s: readonly string[];
  readonly v: Value;
}

/** A name of the program in the code: its variable, its kind, true when it can hold the error sentinel, and its levels. */
interface Name {
  readonly code: string;
  readonly kind: Kind | undefined;
  readonly lazy: boolean;
  readonly deps: ReadonlySet<number>;
  readonly list?: ListInfo | undefined;
}

/** An argument of a call: its code, its kind and its levels. */
interface Arg {
  readonly code: string;
  readonly kind: Kind | undefined;
  readonly deps: ReadonlySet<number>;
}

/** The levels of a constant of the run. */
const NO_DEPS: ReadonlySet<number> = new Set();

/**
 * The level of a read of a cell (COMPILE.MODULE.SHEET). The results of the cells change in a run. Thus a value that reads
 * a cell is not a constant or a column of the run. The level is far from the other levels.
 */
const CELLS = -1;

/** The name of the function of a run of a sheet that reads a cell: its column and its position. */
const READ_CELL = "RC";

/** This pattern finds a read of a cell in the code of a value: the read, or a printed function that can read a cell. */
const READS_IN_CODE = /\b(RC|fn\d+)\(/;

/** The columns of a sheet for the printer (COMPILE.MODULE.SHEET). */
interface SheetInfo {
  /** The position of each column in the arrays of the run. */
  readonly columns: ReadonlyMap<string, number>;
  /** The kind of each column that the printer knows: a kind of the options, or the kind of a printed formula. */
  readonly kinds: Map<string, Kind | undefined>;
}

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
  /** The level of the origin: 1 at the key of the run, and the marker of the origin in the body of a function. */
  readonly originLevel: number;
  readonly env: ReadonlyMap<string, Name>;
  readonly keys: ReadonlyMap<Expr, Name>;
  /** The bound functions (FN.BIND), with the context of their binding. */
  readonly fns: ReadonlyMap<string, BoundFn>;
}

/**
 * A bound function of the printer (FN.BIND): its node and the context of its binding. It also has one printed
 * JavaScript function for each signature of the arguments of its calls.
 */
interface BoundFn {
  /** The number of the binding. Two functions with one name are two functions, so a key of a constant needs it. */
  readonly id: number;
  readonly fn: ExprOf<"fn">;
  readonly ctx: Ctx;
  /** The printed function for each signature: the kind of each argument. */
  readonly specs: Map<string, Spec>;
  /** The declarations of the printed functions that read names of the place of the binding. The let prints them. */
  readonly decls: string[];
  /** True when a printed function of the binding is at the place of the binding, not at the start of a run. */
  local: boolean;
}

/**
 * A function that the printer prints at this time. Its parameters, and the bindings at the root of its body, keep their
 * values for the whole call. Thus a part of a loop that reads only them and its target is a column of the call.
 */
interface CallScope {
  /** The marker of the parameters. */
  readonly param: number;
  /** The level of the focus of the function. A part at a higher level is in a loop of the function. */
  readonly focus: number;
  /** True when the body has a loop in a loop, so a call can read a part of a loop more than once. */
  readonly repeats: boolean;
  /** The variables that the start of the body can read: the parameters, and the bindings at the root of the body. */
  readonly names: Set<string>;
  /** The declarations of the columns of the call. The function prints them at the start of its body. */
  readonly decls: string[];
  /** The root of the body. A let at the root moves it to its body, because its bindings are at the start of the body. */
  root: Expr;
}

/**
 * A printed function. The levels of the value of its body have a marker for the origin, for the focus and for each
 * parameter. A call replaces each marker with the levels at the call.
 */
interface Spec {
  readonly name: string;
  readonly kind: Kind | undefined;
  readonly safe: boolean;
  readonly deps: ReadonlySet<number>;
  readonly origin: number;
  readonly focus: number;
  readonly param: number;
  /** True when the body reads only constants of the run, its parameters and its position, so it is at the start of a run. */
  readonly global: boolean;
}

/** The name of a helper of the generated code. */
type Helper = "F" | "C" | "T" | "L" | "Q" | "G" | "B" | "U" | "X" | "I" | "K" | "M" | "M1" | "S" | "V" | "SB" | "TK" | "NT" | TreeHelper | SheetHelper;

/** The helpers of a tree space (COMPILE.MODULE.TREE). */
type TreeHelper = "PT" | "CH" | "SG" | "PR" | "UP" | "SO" | "AN" | "BF";

/** The helpers of a sheet (COMPILE.MODULE.SHEET): the state of a run of a sheet, and the order of the keys of a tree. */
type SheetHelper = "SH" | "KO";

/** The helpers of the generated code. A module has only the helpers that it uses. */
const HELPERS: Readonly<Record<Exclude<Helper, "S">, string>> = {
  F: "function F() { throw E; }",
  C: "function C(m) { throw new VexContractError(m); }",
  // An exception of an op is an error of Vex too, as in the interpreter. Only the checks of the contract throw a
  // VexContractError, and they come before the run, so each catch of the run gives the sentinel.
  T: "function T(f) { try { return f(); } catch { return E; } }",
  // A constant of the run with a loop evaluates on its first read, so a loop in a branch that no run takes costs nothing.
  L: "function L(f) { let done = false, v; return () => { if (!done) { done = true; try { v = f(); } catch { v = E; } } return v; }; }",
  // A column of the run: the value of an expression at each record, on its first read.
  Q: "function Q(f) { const m = []; return (j) => { let v = m[j]; if (v === undefined) { try { v = f(j); } catch { v = E; } m[j] = v; } return v; }; }",
  G: "function G(x) { return x === E ? F() : x; }",
  B: 'function B(x) { return typeof x === "boolean" ? x : F(); }',
  U: 'function U(x) { return typeof x === "number" ? x : F(); }',
  X: "function X(t, n) { return t >= 0 && t < n ? t : F(); }",
  // The index of a computed position, and of a computed key: a key of an array space is the text of its index.
  I: "function I(t, n) { return Number.isInteger(t) && t >= 0 && t < n ? t : F(); }",
  K: 'function K(k, n) { return typeof k === "string" && /^(0|[1-9]\\d*)$/.test(k) && +k < n ? +k : F(); }',
  // The ops on the order of a list (LIST.SORT, LIST.TAKE, LIST.NTH) work on the items with values. With strict, an
  // error item is the error of the op. A sort is stable, and the values are numbers without NaN or texts of one kind.
  V: "function V(l, s) { if (s && l.some((x) => x[1] === E)) F(); return l.filter((x) => x[1] !== E); }",
  SB: [
    "function SB(l, s) {",
    "  const o = V(l, s);",
    "  const t = o.length > 0 ? typeof o[0][1] : \"number\";",
    "  for (const [, v] of o) if (typeof v !== t || (t !== \"number\" && t !== \"string\") || v !== v) F();",
    "  return o.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));",
    "}",
  ].join("\n"),
  TK: "function TK(l, n, s) { const o = V(l, s); return Number.isSafeInteger(n) && n >= 0 ? o.slice(0, n) : F(); }",
  NT: "function NT(l, i, s) { const o = V(l, s); return Number.isSafeInteger(i) && i >= 0 && i < o.length ? o[i][1] : F(); }",
  // The parents of a tree space: the position of the parent of each record, or -1 for a root. A walk up from each record
  // marks its keys, so a walk that meets a key of the same walk finds a cycle. Each key is in one walk, so the check is linear.
  PT: [
    "function PT(p, n) {",
    '  if (!Array.isArray(p) || p.length !== n) C("the parents are not an array with one parent for each record");',
    "  const P = new Int32Array(n), s = new Uint8Array(n);",
    "  for (let i = 0; i < n; i++) {",
    "    const x = p[i];",
    "    if (x !== -1 && !(Number.isInteger(x) && x >= 0 && x < n)) C(`the parent of the record ${i} is not -1 or the position of a record`);",
    "    P[i] = x;",
    "  }",
    "  for (let i = 0; i < n; i++) {",
    "    let k = i;",
    "    while (k >= 0 && s[k] === 0) {",
    "      s[k] = 1;",
    "      k = P[k];",
    "    }",
    "    if (k >= 0 && s[k] === 1) C(`the parents of the record ${i} make a cycle`);",
    "    for (k = i; k >= 0 && s[k] === 1; k = P[k]) s[k] = 2;",
    "  }",
    "  return P;",
    "}",
  ].join("\n"),
  // The children of each record and the roots, in key order.
  CH: [
    "function CH(P, n) {",
    "  const h = [], r = [];",
    "  for (let i = 0; i < n; i++) h.push([]);",
    "  for (let i = 0; i < n; i++) (P[i] < 0 ? r : h[P[i]]).push(i);",
    "  return [h, r];",
    "}",
  ].join("\n"),
  // The siblings of each record with the record itself, and its position among them. The roots are the siblings of a root.
  SG: [
    "function SG(P, h, r, n) {",
    "  const g = [], s = new Int32Array(n);",
    "  for (let i = 0; i < n; i++) g.push(P[i] < 0 ? r : h[P[i]]);",
    "  for (const x of [r, ...h]) for (let q = 0; q < x.length; q++) s[x[q]] = q;",
    "  return [g, s];",
    "}",
  ].join("\n"),
  // The keys depth first, with each parent before its children, and the position and the size of the subtree of each
  // record. Thus the descendants of a record are the keys after it, as many as its subtree has under it.
  PR: [
    "function PR(h, r, n) {",
    "  const o = [], at = new Int32Array(n), z = new Int32Array(n), st = [];",
    "  for (let q = r.length - 1; q >= 0; q--) st.push(r[q]);",
    "  while (st.length > 0) {",
    "    const k = st.pop();",
    "    at[k] = o.length;",
    "    o.push(k);",
    "    for (let q = h[k].length - 1; q >= 0; q--) st.push(h[k][q]);",
    "  }",
    "  for (let q = n - 1; q >= 0; q--) {",
    "    const k = o[q];",
    "    z[k] = 1;",
    "    for (const c of h[k]) z[k] += z[c];",
    "  }",
    "  return [o, at, z];",
    "}",
  ].join("\n"),
  UP: "function UP(P, k) { const p = P[k]; return p < 0 ? F() : p; }",
  SO: "function SO(g, s, k, d) { const t = g[k][s[k] + d]; return t === undefined ? F() : t; }",
  AN: "function AN(P, k) { const o = []; for (let p = P[k]; p >= 0; p = P[p]) o.push(p); return o; }",
  // The record and the keys under it, in the order of a breadth-first search. A tree has no cycle, so no key comes twice.
  BF: "function BF(h, k) { const o = [k]; for (let i = 0; i < o.length; i++) for (const c of h[o[i]]) o.push(c); return o; }",
  // The state of a run of a sheet (COMPILE.MODULE.SHEET), as in SheetRun: the result of each finished cell, the search
  // of Tarjan with its stack, and the budget of the stack. `r` reads a cell, `f` fills a cell, and `o` gives a column.
  // A cell without a formula has the error sentinel from the start, as the error of its read.
  SH: [
    "function SH(n, cols, own, budget) {",
    "  const pg = (c, k) => {",
    "    const o = own[c];",
    "    const g = o === undefined ? undefined : o[k];",
    "    return g === undefined ? cols[c] : g;",
    "  };",
    "  const D = [];",
    "  for (let c = 0; c < cols.length; c++) {",
    "    const d = new Array(n);",
    "    for (let k = 0; k < n; k++) if (pg(c, k) === undefined) d[k] = E;",
    "    D.push(d);",
    "  }",
    "  const seen = new Map(), stack = [], FILL = {};",
    "  let top = FILL, missed = false, next = 0, used = 0;",
    "  const start = (c, k) => {",
    "    const i = next++;",
    "    const v = { id: c * n + k, c, k, i, low: i, re: false, r: E, p: false, need: undefined };",
    "    seen.set(v.id, v);",
    "    stack.push(v);",
    "    return v;",
    "  };",
    "  const ev = (v, g) => {",
    "    const caller = top;",
    "    v.p = false;",
    "    v.need = undefined;",
    "    top = v;",
    "    used += g[1];",
    "    const x = g[0](v.k);",
    "    used -= g[1];",
    "    top = caller;",
    "    if (!v.p) v.r = x;",
    "  };",
    "  const end = (v, caller) => {",
    "    if (v.low === v.i) {",
    "      const ms = stack.splice(stack.lastIndexOf(v));",
    "      const cycle = ms.length > 1 || v.re;",
    "      for (const m of ms) {",
    "        seen.delete(m.id);",
    "        D[m.c][m.k] = cycle ? E : m.r;",
    "      }",
    "    } else if (caller !== undefined) caller.low = Math.min(caller.low, v.low);",
    "  };",
    "  const r = (c, k) => {",
    "    const d = D[c][k];",
    "    if (d !== undefined) return d;",
    "    const caller = top;",
    "    if (caller === FILL) {",
    "      missed = true;",
    "      return E;",
    "    }",
    "    if (caller.p) return E;",
    "    const s = seen.get(c * n + k);",
    "    if (s !== undefined) {",
    "      caller.low = Math.min(caller.low, s.i);",
    "      s.re = true;",
    "      return E;",
    "    }",
    "    const g = pg(c, k);",
    "    const v = start(c, k);",
    "    if (used + g[1] > budget) {",
    "      caller.p = true;",
    "      caller.need = v;",
    "      return E;",
    "    }",
    "    ev(v, g);",
    "    if (v.p) {",
    "      caller.p = true;",
    "      caller.need = v;",
    "      return E;",
    "    }",
    "    end(v, caller);",
    "    const x = D[c][k];",
    "    return x === undefined ? E : x;",
    "  };",
    "  const drive = (c, k) => {",
    "    const work = [start(c, k)];",
    "    for (let v = work[0]; v !== undefined; v = work[work.length - 1]) {",
    "      ev(v, pg(v.c, v.k));",
    "      if (v.p) {",
    "        for (let q = v.need; q !== undefined; q = q.need) work.push(q);",
    "        continue;",
    "      }",
    "      work.pop();",
    "      end(v, work[work.length - 1]);",
    "    }",
    "  };",
    "  const f = (c, k) => {",
    "    if (D[c][k] !== undefined) return;",
    "    missed = false;",
    "    const x = pg(c, k)[0](k);",
    "    if (missed) drive(c, k);",
    "    else D[c][k] = x;",
    "  };",
    "  const o = (c) => {",
    "    const d = D[c], out = [];",
    "    for (let k = 0; k < n; k++) out.push(d[k] === E ? VEX_ERROR : d[k]);",
    "    return out;",
    "  };",
    "  return { r, f, o };",
    "}",
  ].join("\n"),
  // The keys of a tree in the order of a fill (SHEET.FILL): each parent before its children, or after them with `post`.
  // `back` reverses the order of the siblings.
  KO: [
    "function KO(h, r, post, back) {",
    "  const o = [], st = [];",
    "  const push = (x) => {",
    "    if (back) for (let q = 0; q < x.length; q++) st.push(x[q]);",
    "    else for (let q = x.length - 1; q >= 0; q--) st.push(x[q]);",
    "  };",
    "  push(r);",
    "  while (st.length > 0) {",
    "    const k = st.pop();",
    "    o.push(k);",
    "    push(h[k]);",
    "  }",
    "  return post ? o.reverse() : o;",
    "}",
  ].join("\n"),
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
const NEEDS: Readonly<Record<Helper, readonly Helper[]>> = {
  F: [], C: [], T: [], L: [], Q: [], G: ["F"], B: ["F"], U: ["F"], X: ["F"], I: ["F"], K: ["F"], M: ["G"], M1: ["G"], S: ["M1", "F"],
  // Only SB, TK and NT use V, and they need F too, so the need of V only completes the list.
  // Stryker disable next-line ArrayDeclaration: see the comment above
  V: ["F"],
  SB: ["V", "F"], TK: ["V", "F"], NT: ["V", "F"],
  // Each module has C, and each move uses F (#move), so these needs only complete the list.
  // Stryker disable next-line ArrayDeclaration: see the comment above
  PT: ["C"], UP: ["F"], SO: ["F"],
  CH: [], SG: [], PR: [], AN: [], BF: [],
  SH: [], KO: [],
};

/** The parts of a tree that a run computes before the loop over its keys, if the program needs them. */
type TreePart = "children" | "siblings" | "order";

/** The statement of each part of a tree in a run, with the helper that computes it. */
const TREE_PARTS: Readonly<Record<TreePart, readonly [TreeHelper, string]>> = {
  children: ["CH", "const [H, RT] = CH(P, n);"],
  siblings: ["SG", "const [GP, SI] = SG(P, H, RT, n);"],
  order: ["PR", "const [PO, PI, SZ] = PR(H, RT, n);"],
};

/** An axis whose targets in a tree space are a range of an array of positions: an axis of a tree, or a window. */
type TreeAxis = Extract<Axis, { readonly t: "children" | "ancestors" | "descendants" | "siblings" | "successors" | "predecessors" | "reachable" | "window" }>;

/** The axes of a tree space in a module, and the axes that a module of an array space does not have. */
const TREE_AXES: ReadonlySet<string> = new Set(["children", "ancestors", "descendants", "siblings", "successors", "predecessors", "reachable"]);

/** This function tells if an axis has its targets in a range of an array of positions in a tree space. */
const isTreeAxis = (a: Axis): a is TreeAxis => a.t === "window" || TREE_AXES.has(a.t);

/**
 * The targets of an axis of a tree space: the statements before the loop, and the positions `a[q]` for `q` from `lo` up
 * to `hi`. The loop skips the key `skip`.
 */
interface TreeRange {
  readonly s: readonly string[];
  readonly a: string;
  readonly lo: string;
  readonly hi: string;
  readonly skip: string | undefined;
}

/** The list ops of a standalone module. */
const LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max", "any", "all", "none", "first"]);
const NUMBER_LIST_OPS: ReadonlySet<string> = new Set(["count", "sum", "mean", "min", "max"]);
const BOOLEAN_LIST_OPS: ReadonlySet<string> = new Set(["any", "all", "none"]);
/** The list ops that build a list from lists (LIST.BUILD), and `get` (LIST.GET). A module gives a reason for them. */
const BUILD_OPS: ReadonlySet<string> = new Set(["drop", "append", "flat", "without", "get"]);

/** This function tells if the step of a list op throws for a value of the kind `kind`, which is the wrong kind. */
const stepThrows = (op: string, kind: Kind | undefined): boolean => (NUMBER_STEPS.has(op) && kind !== "number") || (BOOLEAN_LIST_OPS.has(op) && kind !== "boolean");

/** The list ops whose step takes a number. */
const NUMBER_STEPS: ReadonlySet<string> = new Set(["sum", "mean", "min", "max"]);

/** This function gives the kind of the result of a list op: first gives the kind of its items. */
const listKind = (op: string, item: Kind | undefined): Kind | undefined => (NUMBER_LIST_OPS.has(op) ? "number" : BOOLEAN_LIST_OPS.has(op) ? "boolean" : item);

const LOOPS = new WeakMap<Expr, boolean>();

/** This function gives the names that an expression reads, also the names that it binds itself. */
function namesOf(e: Expr, out = new Set<string>()): Set<string> {
  if (e.tag === "var") out.add(e.name);
  for (const x of children(e)) namesOf(x, out);
  return out;
}

/**
 * The smallest work of an expression in a column of the run. The work is the number of nodes. A node of the memo and a
 * constant of the run count as one node each. A part with less work costs less than the read of its column.
 */
const COLUMN_WORK = 10;

/** This function gives the head of a loop over targets: from `lo` up to `hi`, or from `hi` down to `lo` in the reverse order. */
const forHead = (j: string, lo: string, hi: string, reverse: boolean): string => (reverse ? `for (let ${j} = ${hi} - 1; ${j} >= ${lo}; ${j}--) {` : `for (let ${j} = ${lo}; ${j} < ${hi}; ${j}++) {`);

/** This function tells if an expression has a loop in a loop: an axis, a fold or an iteration in another one. */
function nestsLoops(e: Expr, inLoop = false): boolean {
  const loop = e.tag === "each" || e.tag === "fold" || e.tag === "iterate";
  return (loop && inLoop) || children(e).some((x) => nestsLoops(x, inLoop || loop));
}

/** This function tells if an expression has a loop of names: a fold or an iteration. */
function hasLoop(e: Expr): boolean {
  let found = LOOPS.get(e);
  if (found === undefined) {
    found = e.tag === "fold" || e.tag === "iterate" || children(e).some(hasLoop);
    LOOPS.set(e, found);
  }
  return found;
}

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
const join = (a: Kind | undefined, b: Kind | undefined): Kind | undefined => (a === b ? a : undefined);

/** This function gives a value that is a constant of the run, with plain code. */
const plainValue = (code: string, kind: Kind | undefined): Value => ({ code, kind, safe: true, deps: NO_DEPS, plain: true });

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

/** This function gives each list of arguments with one sample of each parameter, from the samples of each parameter. */
function samples(each: readonly (readonly unknown[])[]): readonly (readonly unknown[])[] {
  return each.reduce<readonly (readonly unknown[])[]>((acc, values) => acc.flatMap((xs) => values.map((x) => [...xs, x])), [[]]);
}

/** This function gives the text of plain data, with -0 apart from 0. */
const dataText = (x: unknown): string => canonical(x as Expr, () => undefined);

/** This function tells if two values are the same: the same primitive, or plain data with the same structure. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  return dataText(a) === dataText(b);
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
  return x.threw === y.threw && same(x.value, y.value);
}

/**
 * This function gives the source of a function of a domain, for a copy in a module. The source must be an expression:
 * the source of a native function or of a method does not compile as one. A copy must give the values of the function:
 * a function that reads a name outside itself gives an exception in the copy. Thus the copy and the function must give
 * the same for the samples of their kinds.
 */
function copied(f: (...a: never[]) => unknown, each: readonly (readonly unknown[])[], what: string): string {
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
  if (!samples(each).every((xs) => sameCall(() => fn(...xs), () => copy(...xs)))) throw new NotStandalone(`${what} reads a name outside itself, so a module cannot copy it`);
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
  /** True for a tree space, and the parts of the tree that the program reads (COMPILE.MODULE.TREE). */
  readonly #tree: boolean;
  readonly treeParts = new Set<TreePart>();
  /** The columns of a sheet, for a module of a sheet (COMPILE.MODULE.SHEET). */
  readonly #sheet: SheetInfo | undefined;
  #names = 0;
  /** The number of the next bound function, and of the next printed function. */
  #fnIds = 0;
  #printed = 0;
  /** The level of the names of the next loop. It is far above the levels of the axes, so the two do not meet. */
  #loops = 1_000_000;
  /** The node of the memo whose function the printer prints, so it prints the node itself. */
  #inside: Expr | undefined;
  readonly #structures = new Map<string, string>();
  readonly #kinds = new Map<string, Kind | undefined>();
  readonly #ops = new Map<string, number>();
  /** The inline form of each function of an op, or undefined for a function that the module calls. */
  readonly #forms = new Map<string, InlineForm | undefined>();
  /** The functions of ops that the module calls, not in an inline form. */
  readonly #called = new Set<string>();
  /** The key of the expression of each code that is a constant of the run, and the read of each hoisted constant by key. */
  readonly #keyOf = new WeakMap<Code, string>();
  readonly #constants = new Map<string, Code>();
  /** The columns of the run, by the structure of their expression. */
  readonly #columns = new Map<string, string>();
  /** The expressions whose code is the read of a column of the run. */
  readonly #columned = new WeakSet<Expr>();
  /** The lazy constants of the run, and the printed functions that have a loop: code that reads one waits for its read. */
  readonly #deferred = new Set<string>();
  /** The functions that the printer prints at this time, the innermost last. */
  // Stryker disable next-line ArrayDeclaration: a value that is not a scope has no field repeats or root, so it acts as no scope
  readonly #scopes: CallScope[] = [];
  /** The work of the body of each bound function, by the number of its binding. */
  readonly #fnWork = new Map<number, number>();
  /** The expressions whose code is a constant of the run. */
  readonly #constant = new WeakSet<Expr>();
  /** The expressions at a place that takes a list: a binding, the head of a list op and the list of an axis. */
  readonly #wantList = new WeakSet<Expr>();
  /** The facts of the list of each function of the memo whose value is a list. */
  readonly #lists = new Map<string, ListInfo | undefined>();

  constructor(expr: Expr, options: ModuleOptions, sheet?: SheetInfo) {
    this.#domains = options.domains ?? [];
    this.#facts = factsOf({ domains: this.#domains });
    this.#schema = options.schema;
    this.#memo = memoOf(expr);
    this.#tree = options.space === "tree";
    this.#sheet = sheet;
  }

  use(name: Helper): string {
    this.helpers.add(name);
    return name;
  }

  /** This method gives the name of a part of the tree, for example `H` for the children, and marks the part as read. */
  #part(part: TreePart, name: string): string {
    this.treeParts.add(part);
    return name;
  }

  /**
   * This method gives the check of a result of a kind, or undefined for a result that needs no check. A number must be
   * finite, and the domain of the kind can check the value with valid. The law checker of the test kit checks the
   * declaration `returns` of each op (KIND.RETURNS), so the module trusts the kind itself.
   */
  check(kind: Kind): string | undefined {
    const name = `k_${kind.replace(":", "_")}`;
    // Stryker disable next-line ConditionalExpression: a check of a kind is always the same, so the map only saves time
    if (!this.top.has(name)) {
      const d = this.#facts.checkOf(kind);
      // The kind is primitive here. A static site on a value of a domain has no domain without a primitive type before it.
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
  #checked(kind: Kind, code: string): string {
    const k = this.check(kind);
    return k === undefined ? code : `${k}(${code})`;
  }

  #valid(d: number, domain: string, kind: Kind, valid: (x: never) => boolean): string | undefined {
    const name = `v_${d}`;
    const src = copied(valid, [this.#samples(kind)], `the check "valid" of the domain ${domain}`);
    // A check that is Number.isFinite of a number adds nothing to the check of the result.
    const form = inlineForm(src);
    if (kind === "number" && form !== undefined && patternOf(form, (p) => p) === "Number.isFinite(#0)") return undefined;
    this.top.set(name, `const ${name} = ${src};`);
    return name;
  }

  /** This method gives the samples of a kind: the samples of a primitive type, or the samples of a domain (KIND.DOMAIN). */
  #samples(kind: Kind): readonly unknown[] {
    const primitive = primitiveOf(kind);
    if (primitive !== undefined) return SAMPLES[primitive];
    const d = this.#domains.find((x) => kindOfDomain(x) === kind) as AnyDomain;
    if (d.samples === undefined) throw new NotStandalone(`the domain ${d.name} gives no samples, so a module cannot check a copy of its op`);
    return d.samples();
  }

  /**
   * This method gives the code of a check of the kind of an input. The check is a test of its JavaScript type, or the
   * copy of `is` of a domain. The code is true for an input against the kind.
   */
  against(kind: Kind, input: string): string {
    const primitive = primitiveOf(kind);
    if (primitive !== undefined) return `typeof ${input} !== "${primitive}"`;
    const d = this.#domains.findIndex((x) => kindOfDomain(x) === kind);
    const domain = this.#domains[d];
    if (domain === undefined) throw new NotStandalone(`the schema has the kind ${kind}, and no domain has it`);
    const name = `is_${String(d)}`;
    if (!this.top.has(name)) {
      const src = copied(domain.is, [[...SAMPLES.number, ...SAMPLES.string, ...SAMPLES.boolean, null, {}, [], ...this.#samples(kind)]], `the test "is" of the domain ${domain.name}`);
      this.top.set(name, `const ${name} = ${src};`);
    }
    return `!${name}(${input})`;
  }

  /** This method gives a new name for the code. */
  fresh(prefix: string): string {
    return `${prefix}${this.#names++}`;
  }

  /** This method tells if code reads a lazy constant of the run, or calls a printed function that has a loop. */
  #defers(c: Code): boolean {
    return [c.v.code, ...c.s].some((line) => [...line.matchAll(/\b(c\d+|fn\d+)\(/g)].some((m) => this.#deferred.has(m[1] as string)));
  }

  /** This method gives the code of a name: a read that throws the error of its value, if it can hold an error. */
  #read(name: Name): Value {
    const base = { kind: name.kind, deps: name.deps, plain: true, list: name.list };
    return name.lazy ? { ...base, code: `${this.use("G")}(${name.code})`, safe: false, held: name.code } : { ...base, code: name.code, safe: true };
  }

  /** This method gives the name of a constant of the run, from the read of its value. */
  #nameOf(v: Value): Name {
    return { code: v.held ?? v.code, kind: v.kind, lazy: v.held !== undefined, deps: NO_DEPS, list: v.list };
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

  /**
   * This method evaluates a constant of the run once, before the loop over the keys, and gives the read of its value. A
   * constant with a loop (`lazy`) evaluates on its first read instead, as a branch of the interpreter does. So does a
   * constant that reads a lazy constant or calls a function with a loop. Else it starts that loop before the run.
   */
  #hoist(c: Code, lazy = false): Code {
    if (c.v.deps.size > 0 || (c.v.plain === true && c.s.length === 0)) return c;
    const key = this.#keyOf.get(c);
    const hit = key === undefined ? undefined : this.#constants.get(key);
    if (hit !== undefined) return hit;
    const name = this.fresh("c");
    const deferred = lazy || this.#defers(c);
    if (deferred) {
      this.#deferred.add(name);
      this.run.push(`const ${name} = ${this.use("L")}(() => {`, ...ind(c.s), `  return ${c.v.code};`, "});");
    } else this.run.push(...this.#store(name, c, true));
    const { list } = c.v;
    const read = bare(this.#read(deferred ? { code: `${name}()`, kind: c.v.kind, lazy: true, deps: NO_DEPS, list } : { code: name, kind: c.v.kind, lazy: !c.v.safe, deps: NO_DEPS, list }));
    if (key !== undefined) this.#constants.set(key, read);
    return read;
  }

  /**
   * This method gives the parts of a node with levels `deps`. When the node is not a constant of the run, each part that
   * is a constant evaluates once, before the loop. A node that is a constant keeps its parts, and its parent decides.
   */
  #settle(parts: readonly Code[], deps: ReadonlySet<number>, exprs: readonly Expr[] = []): readonly Code[] {
    return deps.size === 0 ? parts : parts.map((x, i) => this.#hoist(x, exprs[i] !== undefined && hasLoop(exprs[i])));
  }

  expr(e: Expr, ctx: Ctx): Code {
    const key = ctx.keys.get(e);
    if (key !== undefined) return bare(this.#read(key));
    const keys = this.#memo.get(e);
    const c = keys !== undefined && this.#inside !== e ? this.#memoized(e, keys, ctx) : this.#node(e, ctx);
    if (c.v.deps.size === 0) {
      // A constant of the run with the structure of an earlier one is that constant.
      this.#keyOf.set(c, this.#constKey(e, ctx));
      this.#constant.add(e);
    }
    // A list is a value only at a place that takes a list. A result, an argument and a field take no list.
    if (c.v.list !== undefined && !this.#wantList.has(e)) throw new NotStandalone("a list is a value of the program");
    return this.#columnar(e, c, ctx) ? this.#column(e, c, ctx) : c;
  }

  /** This method gives the code of a list at a place that takes a list (LIST.VALUE): an each, a name, sortBy or take. */
  #listOf(e: Expr, ctx: Ctx): Code {
    this.#wantList.add(e);
    const c = this.expr(e, ctx);
    if (c.v.list === undefined) throw new NotStandalone("a list op on a value that is not a list");
    return c;
  }

  /** This method tells if an expression gives a list at a place that takes one: an each, sortBy, take or a name of a list. */
  #isList(e: Expr, ctx: Ctx): boolean {
    if (e.tag === "each") return true;
    if (e.tag === "app") return e.op === "sortBy" || e.op === "take";
    return e.tag === "var" && ctx.env.get(e.name)?.list !== undefined;
  }

  /**
   * This method tells if a part of a loop over the targets is a column of the run. Its value depends only on the
   * target and on the constants of the run, so each run computes it once for each record. Each name that it reads
   * from outside is a constant of the run, so its code can be outside the loop.
   */
  #columnar(e: Expr, c: Code, ctx: Ctx): boolean {
    // A node of the memo has the level 1, so a column has a focus. The results of the cells change in a run, so a part
    // that reads a cell is not a column.
    if (ctx.level < 2 || c.v.deps.has(CELLS) || !c.v.deps.has(ctx.level) || this.#work(e, ctx.fns) < COLUMN_WORK) return false;
    const scope = this.#callScope(c, ctx);
    if (c.v.deps.size !== 1 && scope === undefined) return false;
    // A node of the memo with keys keeps its costly part for each value of its keys already.
    if (this.#keyed(e)) return false;
    const visible = (name: string): boolean => {
      const bound = ctx.env.get(name);
      return (bound?.deps.size ?? 0) === 0 || (scope?.names.has((bound as Name).code) ?? false);
    };
    return [...namesOf(e)].every(visible) && !this.#callsLocal(e, ctx);
  }

  /**
   * This method gives the function whose call can hold a column of a part. The part is in a loop of the function, and it
   * reads a parameter. The body of the function has a loop in a loop, so a call can read the part more than once. Each
   * name that the part reads is a parameter, a binding at the root of the body or a constant (`#columnar`). So the
   * part depends only on its target and on values that one call does not change. These are the parameters, the focus
   * and the origin. The levels in a node of the memo start at 1, far below the focus of a function. So a node of the
   * memo holds no column of a call.
   */
  #callScope(c: Code, ctx: Ctx): CallScope | undefined {
    const scope = this.#scopes.at(-1);
    // A part that reads a parameter reads a variable of this function, so its structure gives no column of another function.
    return scope !== undefined && scope.repeats && ctx.level > scope.focus && c.v.deps.has(scope.param) ? scope : undefined;
  }

  /** This method tells if an expression calls a function that is at the place of its binding, not at the start of a run. */
  #callsLocal(e: Expr, ctx: Ctx): boolean {
    // Stryker disable next-line ConditionalExpression: a node that is not a call has no field fn, so the map gives undefined
    if (e.tag === "call" && ctx.fns.get(e.fn)?.local === true) return true;
    return children(e).some((x) => this.#callsLocal(x, ctx));
  }

  /** This method tells if an expression has a node of the memo with keys in it. */
  #keyed(e: Expr): boolean {
    return (this.#memo.get(e)?.length ?? 0) > 0 || children(e).some((x) => this.#keyed(x));
  }

  /**
   * This method gives the work of an expression: a node of the memo and a constant of the run are one read each. A call
   * adds the work of the body of its function, because the body evaluates at each call.
   */
  #work(e: Expr, fns: ReadonlyMap<string, BoundFn>): number {
    if (this.#memo.has(e) || this.#constant.has(e)) return 1;
    // Stryker disable next-line ConditionalExpression: a node that is not a call has no field fn, so the map gives undefined
    const body = e.tag === "call" ? this.#bodyWork(fns.get(e.fn)) : 0;
    return children(e).reduce((sum, x) => sum + this.#work(x, fns), 1 + body);
  }

  /**
   * This method gives the work of the body of a function, once for each function. Thus a chain of calls costs no more
   * than its functions. A body that is a column of the run is one read. A body sees the functions of the place of its
   * binding, and no function calls itself (FN.TOTAL).
   */
  #bodyWork(bound: BoundFn | undefined): number {
    if (bound === undefined) return 0;
    let work = this.#fnWork.get(bound.id);
    if (work === undefined) {
      work = this.#columned.has(bound.fn.body) ? 1 : this.#work(bound.fn.body, bound.ctx.fns);
      this.#fnWork.set(bound.id, work);
    }
    return work;
  }

  /** This method gives the read of a column of the run. Two parts with the same structure share one column. */
  #column(e: Expr, c: Code, ctx: Ctx): Code {
    const key = this.#constKey(e, ctx);
    let name = this.#columns.get(key);
    if (name === undefined) {
      name = this.fresh("col");
      // A column of a call is at the start of the body of its function, so each call has its own.
      const scope = this.#callScope(c, ctx);
      (scope?.decls ?? this.run).push(`const ${name} = ${this.use("Q")}((${ctx.focus as string}) => {`, ...ind(c.s), `  return ${c.v.code};`, "});");
      this.#columns.set(key, name);
    }
    this.#columned.add(e);
    return bare({ code: `${this.use("G")}(${name}(${ctx.focus as string}))`, kind: c.v.kind, safe: false, deps: c.v.deps, list: c.v.list });
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
      // A function is only a binding of let, so the check of the shape stops this node first.
      // Stryker disable next-line all: see the comment above
      /* v8 ignore next -- @preserve */
      case "fn": throw new NotStandalone("a function outside the bindings of a let");
      case "call":
        return this.#call(e, ctx);
      case "rec": {
        const names = Object.keys(e.fields);
        const raw = Object.values(e.fields).map((x) => this.expr(x, ctx));
        const deps = depsOf(...raw);
        // The interpreter evaluates each field, also after an error.
        const fields = this.#inOrder(this.#settle(raw, deps, Object.values(e.fields)), true);
        // A record of a module is a new object, so it needs no freeze.
        const code = `({ ${fields.map((x, i) => `${JSON.stringify(names[i])}: ${x.v.code}`).join(", ")} })`;
        return { s: stmtsOf(...fields), v: { code, kind: undefined, safe: fields.every((x) => x.v.safe), deps } };
      }
      case "app":
        return this.#app(e, ctx);
      case "each":
        return this.#eachList(e, ctx);
      case "fold":
        return this.#fold(e, ctx);
      case "iterate":
        return this.#iterate(e, ctx);
      case "ext":
        return this.#cell(e, ctx);
    }
  }

  /**
   * This method gives the code of a read of a cell in a module of a sheet (COMPILE.MODULE.SHEET). The value is the result
   * of the cell, which can be the error sentinel, so the read throws its error. A read that is not a cell reference, or
   * of a column that the sheet does not have, gives an error, as in `SheetRun`.
   */
  #cell(e: ExprOf<"ext">, ctx: Ctx): Code {
    const sheet = this.#sheet;
    if (sheet === undefined || e.kind !== CELL_KIND) throw new NotStandalone(`the extension "${e.kind}"`);
    const F = this.use("F");
    if (!isCellRef(e.data)) return bare({ code: `${F}()`, kind: undefined, safe: false, deps: new Set([CELLS]) });
    const { column, at } = e.data;
    const deps = new Set([...this.#addressDeps(at, ctx, []), CELLS]);
    const index = sheet.columns.get(column);
    // The read of a column that the sheet does not have is an error. A kind of the options lets an op take it.
    if (index === undefined) return bare({ code: `${F}()`, kind: sheet.kinds.get(column), safe: false, deps });
    if (!sheet.kinds.has(column)) throw new NotStandalone(`a formula reads the column "${column}" before its formula, so the column needs its kind in the option kinds`);
    const read = `${READ_CELL}(${String(index)}, ${this.#address(at, ctx, [])})`;
    const v = { code: `${this.use("G")}(${read})`, kind: sheet.kinds.get(column), safe: false, deps };
    // The read itself gives the result or the error sentinel. A move of the address can throw, so then the read is not
    // a value that holds the sentinel.
    return bare(at.every((m) => m.t === "origin") ? { ...v, held: read } : v);
  }

  /**
   * This method gives the parts of a node in the order of the interpreter, when a part reads a cell (COMPILE.MODULE.SHEET).
   * A read of a cell can start the search of the run, and the search decides the cycles. So the module must read each
   * cell that the interpreter reads. With `all`, the interpreter evaluates each part also after an error, so each part
   * goes into a variable that can hold the error. Else the first error stops the parts, so each part goes into a
   * variable before the next part starts.
   *
   * The statements of the parts come before the code of their values. The last part that reads a cell keeps its place
   * only if no statement after it can throw. Also, with `all`, a value before it must not throw, or the code of its value
   * must read no cell.
   */
  #inOrder(parts: readonly Code[], all: boolean): readonly Code[] {
    const last = parts.findLastIndex((x) => x.v.deps.has(CELLS));
    const after = parts.slice(last + 1).every((x) => x.s.length === 0 || x.v.safe);
    const before = !all || parts.slice(0, Math.max(last, 0)).every((x) => x.v.safe) || !READS_IN_CODE.test((parts[last] as Code).v.code);
    return parts.map((x, i) => {
      // A part after the last read of a cell cannot stop a read. A part that cannot throw and reads no cell cannot either.
      if (i > last || (x.v.safe && !x.v.deps.has(CELLS)) || (i === last && after && before)) return x;
      const b = this.fresh("b");
      if (all && !x.v.safe) return { s: this.#store(b, x), v: { ...x.v, code: `${this.use("G")}(${b})`, held: b, plain: false } };
      return { s: [...x.s, `const ${b} = ${x.v.code};`], v: { kind: x.v.kind, deps: x.v.deps, list: x.v.list, code: b, safe: true, plain: true } };
    });
  }

  /**
   * This method gives the code of the index of an address from the focus. `values` has the code of the value of each
   * computed move, in order (NAV.COMPUTED).
   */
  #address(at: readonly Move[], ctx: Ctx, values: readonly Code[]): string {
    let index = ctx.focus;
    let next = 0;
    // A move that can fail keeps its check when a later fixed key, index or origin replaces its index (V-052). The focus
    // and the origin cannot fail, and the code of a move from an index has the code of that index in it. In a tree,
    // the move parent is a move from an index.
    let fails = false;
    const checks: string[] = [];
    for (const m of at) {
      if (fails && index !== undefined && m.t !== "offset" && m.t !== "other" && (m.t !== "parent" || !this.#tree)) checks.push(index);
      index = moveExpr(m) === undefined ? this.#move(m, index, ctx.origin) : this.#computed(m, values[next++] as Code);
      fails = m.t !== "origin";
    }
    // A node of the memo reads neither its origin nor its focus (memo.ts), so the guards of this method do not fail.
    // Stryker disable next-line ConditionalExpression,StringLiteral: see the comment above
    /* v8 ignore next -- @preserve */
    if (index === undefined) throw new NotStandalone("a node of the memo reads its focus");
    return checks.length === 0 ? index : `(${[...checks, index].join(", ")})`;
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
        // In a tree space, an offset goes among the siblings (NAV.OFFSET.TREE).
        if (this.#tree) return `${this.use("SO")}(${this.#part("siblings", "GP")}, SI, ${focus}, ${d})`;
        return `${this.use("X")}(${focus} + ${d}, n)`;
      }
      case "other":
        // Stryker disable next-line ConditionalExpression,StringLiteral: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        return `(n === 2 ? 1 - ${focus} : ${F}())`;
      case "parent":
        // Only a tree space has parents (NAV.PARENT).
        if (!this.#tree) return `${F}()`;
        // Stryker disable next-line ConditionalExpression,StringLiteral: see #address
        /* v8 ignore next -- @preserve */
        if (focus === undefined) throw new NotStandalone("a node of the memo reads its focus");
        return `${this.use("UP")}(P, ${focus})`;
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
    // The interpreter evaluates the expressions of the address before its moves, and the first error stops them.
    const parts = this.#inOrder(this.#settle(values, deps), false);
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
    // A move that can fail keeps the levels of its index when a later move replaces the index (V-052). An offset and
    // other keep the index, so their levels stay.
    let fails = false;
    const kept = new Set<number>();
    for (const m of at) {
      if (fails) for (const d of deps) kept.add(d);
      if (moveExpr(m) !== undefined) deps = (values[next++] as Code).v.deps;
      else if (m.t === "origin") deps = new Set([ctx.originLevel]);
      // The parent of a key of a tree depends on the key. Outside a tree, the move fails at each key.
      else if (m.t === "key" || m.t === "index" || (m.t === "parent" && !this.#tree)) deps = NO_DEPS;
      fails = m.t !== "origin";
    }
    return new Set([...deps, ...kept]);
  }

  #var(name: string, ctx: Ctx): Value {
    const bound = ctx.env.get(name);
    if (bound !== undefined) return this.#read(bound);
    // A name of a loop hides a function with its name, so this check comes after the names of the scope.
    if (ctx.fns.has(name)) throw new NotStandalone(`the name "${name}" is a function, not a value`);
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
    const fns = new Map(ctx.fns);
    const s: string[] = [];
    let deps = new Set<number>();
    const bound: BoundFn[] = [];
    // The bindings of a let at the root of the body of a function are at the start of the body, so a column of the
    // call can read them. A let at the root that is a node of the memo binds variables of its function of the memo, but
    // the memo holds no column of a call (`#callScope`), so these names have no reader.
    const scope = this.#scopes.at(-1);
    const root = scope !== undefined && scope.root === e ? scope : undefined;
    for (const [name, x] of Object.entries(e.bind)) {
      // A binding sees the context of the let, so a function cannot call itself.
      if (x.tag === "fn") {
        // Stryker disable next-line UpdateOperator: the numbers of the bindings only need to be distinct
        const b: BoundFn = { id: this.#fnIds++, fn: x, ctx, specs: new Map(), decls: [], local: false };
        bound.push(b);
        fns.set(name, b);
        env.delete(name);
        continue;
      }
      // A binding takes a list (LIST.VALUE). A value hides a function of its name, because a read looks at the values first.
      this.#wantList.add(x);
      const c = this.#hoist(this.expr(x, ctx), hasLoop(x));
      if (c.v.deps.size === 0) {
        env.set(name, this.#nameOf(c.v));
        continue;
      }
      const b = this.fresh("b");
      s.push(...this.#store(b, c));
      env.set(name, { code: b, kind: c.v.kind, lazy: !c.v.safe, deps: c.v.deps, list: c.v.list });
      root?.names.add(b);
      // The statements of the binding read its keys, so the let is not a constant of the run.
      deps = new Set([...deps, ...c.v.deps]);
    }
    if (root !== undefined) root.root = e.body;
    const body = this.expr(e.body, { ...ctx, env, fns });
    // A function that reads names of the place of the binding comes after them, before the body.
    return { s: [...s, ...bound.flatMap((b) => b.decls), ...body.s], v: { ...body.v, deps: new Set([...deps, ...body.v.deps]) } };
  }

  /**
   * This method prints a call (FN.CALL). Each argument evaluates at the place of the call, as a binding of a let. The
   * call goes to the printed function of the signature of its arguments, with the focus and the origin if it reads them.
   */
  #call(e: ExprOf<"call">, ctx: Ctx): Code {
    const bound = ctx.env.has(e.fn) ? undefined : ctx.fns.get(e.fn);
    if (bound === undefined) throw new NotStandalone(`a call of "${e.fn}", which is not a function`);
    if (bound.fn.params.length !== e.args.length) throw new NotStandalone(`a call of "${e.fn}" with ${String(e.args.length)} arguments, not ${String(bound.fn.params.length)}`);
    const s: string[] = [];
    const args = e.args.map((x): Arg => {
      const c = this.#hoist(this.expr(x, ctx), hasLoop(x));
      // A value that cannot throw is the argument itself. A read of a name that can hold the error passes the name.
      if (c.v.safe) {
        s.push(...c.s);
        return { code: c.v.code, kind: c.v.kind, deps: c.v.deps };
      }
      // Stryker disable next-line ConditionalExpression: the statements with a read of a name bind other names and do not throw, so the read alone has the same value
      if (c.s.length === 0 && c.v.held !== undefined) return { code: c.v.held, kind: c.v.kind, deps: c.v.deps };
      const b = this.fresh("b");
      s.push(...this.#store(b, c));
      return { code: b, kind: c.v.kind, deps: c.v.deps };
    });
    // Each parameter can hold the error of its argument, so one function serves the arguments of one kind.
    const sig = JSON.stringify(args.map((a) => a.kind ?? null));
    const spec = bound.specs.get(sig) ?? this.#printFn(bound, args, sig);
    // Each marker becomes the levels at the call. The levels of the arguments count for each call, because their
    // statements read their keys, so the marker of the parameters gives no level.
    const levels = (d: number): readonly number[] => (d === spec.origin ? [ctx.originLevel] : d === spec.focus ? [ctx.level] : d === spec.param ? [] : [d]);
    const deps = new Set([...args.flatMap((a) => [...a.deps]), ...[...spec.deps].flatMap(levels)]);
    const position = spec.deps.has(spec.origin) ? [ctx.focus, ctx.origin] : spec.deps.has(spec.focus) ? [ctx.focus] : [];
    return { s, v: { code: `${spec.name}(${[...args.map((a) => a.code), ...position].join(", ")})`, kind: spec.kind, safe: spec.safe, deps } };
  }

  /**
   * This method prints a bound function for one signature of its arguments, as one JavaScript function. Its parameters
   * are the arguments, then the focus and the origin, if the body reads them. A function that reads a name of the place
   * of its binding is at that place. Each other function is at the start of a run, so a constant of the run can call it.
   */
  #printFn(bound: BoundFn, args: readonly Arg[], sig: string): Spec {
    // The markers are far from the levels of the axes and of the loops, so they do not meet them. They only need to be
    // distinct.
    // Stryker disable next-line ArithmeticOperator,UpdateOperator: see the comment above
    const origin = 2_000_000 + 1000 * this.#printed++;
    const focus = origin + 1;
    const param = -origin;
    const names = args.map(() => this.fresh("p"));
    const k = this.fresh("k");
    const o = this.fresh("o");
    const env = new Map(bound.ctx.env);
    // A parameter hides a function of its name, because a read looks at the values first.
    bound.fn.params.forEach((p, i) => env.set(p, { code: names[i] as string, kind: (args[i] as Arg).kind, lazy: true, deps: new Set([param]) }));
    const scope: CallScope = { param, focus, repeats: nestsLoops(bound.fn.body), names: new Set(names), decls: [], root: bound.fn.body };
    this.#scopes.push(scope);
    const body = this.expr(bound.fn.body, { origin: o, focus: k, level: focus, originLevel: origin, env, fns: bound.ctx.fns, keys: new Map() });
    this.#scopes.pop();
    const markers = new Set([origin, focus, param]);
    const global = [...body.v.deps].every((d) => markers.has(d));
    const name = this.fresh("fn");
    if (hasLoop(bound.fn.body) || this.#defers(body)) this.#deferred.add(name);
    const position = body.v.deps.has(origin) ? [k, o] : body.v.deps.has(focus) ? [k] : [];
    const head = `const ${name} = (${[...names, ...position].join(", ")}) =>`;
    // The columns of the call come first. Each one reads a binding of the root only after the binding has its value.
    const s = [...scope.decls, ...body.s];
    const decl = s.length === 0 ? [`${head} ${body.v.code};`] : [`${head} {`, ...ind(s), `  return ${body.v.code};`, "};"];
    (global ? this.run : bound.decls).push(...decl);
    if (!global) bound.local = true;
    const spec: Spec = { name, kind: body.v.kind, safe: body.v.safe, deps: body.v.deps, origin, focus, param, global };
    bound.specs.set(sig, spec);
    return spec;
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
    if (head !== undefined && (op === "sortBy" || op === "take")) return this.#order(op, head, args.slice(1), ctx);
    // LIST.BUILD and LIST.GET: a module does not have the ops that build a list, or get, yet. The interpreter evaluates them.
    if (head !== undefined && BUILD_OPS.has(op) && this.#isList(head, ctx)) throw new NotStandalone(`the list op "${op}" is not in a module yet`);
    if (head !== undefined && (LIST_OPS.has(op) || op === "nth") && this.#isList(head, ctx)) return this.#overList(op, head, args.slice(1), ctx);
    const raw = args.map((x) => this.expr(x, ctx));
    const deps = depsOf(...raw);
    // The interpreter evaluates each argument, also after an error.
    const values = this.#inOrder(this.#settle(raw, deps, args), true);
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
      const kinds = values.map((x) => x.v.kind).filter((k): k is Kind => k !== undefined);
      const src = copied(fn, kinds.map((k) => this.#samples(k)), `the op "${op}" of the domain ${d.name}`);
      // An inline form cannot throw for primitive values only.
      this.#forms.set(name, kinds.every((k) => primitiveOf(k) !== undefined) ? inlineForm(src) : undefined);
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
    const [cond, yes, no] = this.#settle(raw, deps, [c, a, b]) as [Code, Code, Code];
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
    const parts = this.#settle(raw, deps, args);
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
    const [first, second] = this.#settle(raw, deps, [a, b]) as [Code, Code];
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
  /**
   * This method gives the loop over the targets of an axis: the statements before it, its bounds and the key that it
   * skips. `start` has the levels of the address, and `inner` is the position at a target. The axes all, others,
   * window and list have a loop. In a tree space, the axes of a tree have a loop too.
   */
  #targetLoop(axis: Axis, at: readonly Move[], ctx: Ctx): {
    readonly s: string[];
    readonly j: string;
    /** The head of the loop, and the statements at the start of each item before the try and inside it. */
    readonly head: string;
    readonly key: readonly string[];
    readonly check: readonly string[];
    readonly skip: string | undefined;
    readonly fixed: boolean;
    readonly start: ReadonlySet<number>;
    /** True when the statements before the loop cannot throw. */
    readonly startSafe: boolean;
    readonly tests: readonly Expr[];
    readonly inner: Ctx;
  } {
    const { base: outer, tests } = testsOf(axis);
    // The reverse order of an axis is a loop from its end (AXIS.REVERSE). The validation keeps a base axis inside.
    const reverse = outer.t === "reverse";
    const base = outer.t === "reverse" ? outer.axis : outer;
    const j = this.fresh("j");
    const inner: Ctx = { ...ctx, focus: j, level: ctx.level + 1 };
    // The axis list goes over the array of its list (AXIS.LIST). The list evaluates at the node, before the loop, and an
    // error item is an item that fails.
    if (base.t === "list") {
      if (at.length > 0) throw new NotStandalone('the axis "list" with an address');
      const list = this.#hoist(this.#listOf(base.list, ctx), hasLoop(base.list));
      const a = this.fresh("A");
      const q = this.fresh("q");
      const head = reverse ? `for (let ${q} = ${a}.length - 1; ${q} >= 0; ${q}--) {` : `for (let ${q} = 0; ${q} < ${a}.length; ${q}++) {`;
      const key = [`const ${j} = ${a}[${q}][0];`];
      const check = [`if (${a}[${q}][1] === E) ${this.use("F")}();`];
      return { s: [...list.s, `const ${a} = ${list.v.code};`], j, head, key, check, skip: undefined, fixed: false, start: list.v.deps, startSafe: list.v.safe, tests, inner };
    }
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
      const parts = this.#inOrder(this.#settle(values, start), false);
      s.push(...stmtsOf(...parts), `const ${f} = ${this.#address(at, ctx, parts)};`);
    }
    const startSafe = at.every((m) => m.t === "origin");
    if (base.t === "window" && (!Number.isInteger(base.from) || !Number.isInteger(base.to))) throw new NotStandalone('the axis "window" with a bound that is not an integer');
    // In a tree space, the targets of a tree axis and of a window are a range of an array of positions.
    if (this.#tree && isTreeAxis(base)) {
      const range = this.#treeRange(base, f as string);
      const q = this.fresh("q");
      return { s: [...s, ...range.s], j, head: forHead(q, range.lo, range.hi, reverse), key: [`const ${j} = ${range.a}[${q}];`], check: [], skip: range.skip, fixed: false, start, startSafe, tests, inner };
    }
    if (base.t === "others") skip = f;
    else if (base.t === "window") {
      const h = this.fresh("h");
      lo = `Math.max(0, ${f as string} + Math.max(${base.from}, -n))`;
      s.push(`const ${h} = Math.min(n, ${f as string} + Math.min(${base.to}, n) + 1);`);
      hi = h;
    } else if (base.t !== "all") throw new NotStandalone(`the axis "${base.t}"`);
    return { s, j, head: forHead(j, lo, hi, reverse), key: [], check: [], skip, fixed: f === undefined, start, startSafe, tests, inner };
  }

  /**
   * This method gives the targets of an axis of a tree space at the position `f`. They are the positions `a[q]` for `q`
   * from `lo` up to `hi`, without the key that the loop skips. The axes come from AXIS.TREE, AXIS.GRAPH and AXIS.WINDOW.
   */
  #treeRange(base: TreeAxis, f: string): TreeRange {
    const a = this.fresh("A");
    const all = (code: string, lo = "0", skip?: string): TreeRange => ({ s: [`const ${a} = ${code};`], a, lo, hi: `${a}.length`, skip });
    switch (base.t) {
      // In a tree, the edges go from a parent to its children.
      case "children":
      case "successors":
        return all(`${this.#part("children", "H")}[${f}]`);
      case "siblings":
        return all(`${this.#part("siblings", "GP")}[${f}]`, "0", f);
      case "ancestors":
        return all(`${this.use("AN")}(P, ${f})`);
      case "predecessors":
        return all(`(P[${f}] < 0 ? [] : [P[${f}]])`);
      case "reachable":
        // The first key of the search is the focus, which is not a target.
        return all(`${this.use("BF")}(${this.#part("children", "H")}, ${f})`, "1");
      case "descendants": {
        // The descendants of a key are the keys after it in the order depth first, as many as its subtree has under it.
        const h = this.fresh("h");
        return { s: [`const ${a} = ${this.#part("order", "PI")}[${f}] + 1;`, `const ${h} = ${a} + SZ[${f}] - 1;`], a: "PO", lo: a, hi: h, skip: undefined };
      }
      case "window": {
        // The offsets among the siblings, from `from` to `to`. The bounds are integers (#targetLoop).
        const { from, to } = base;
        const l = this.fresh("h");
        const h = this.fresh("h");
        const s = [`const ${a} = ${this.#part("siblings", "GP")}[${f}];`, `const ${l} = Math.max(0, SI[${f}] + ${String(from)});`, `const ${h} = Math.min(${a}.length, SI[${f}] + ${String(to)} + 1);`];
        return { s, a, lo: l, hi: h, skip: undefined };
      }
    }
  }

  #list(op: string, target: ExprOf<"each">, rest: readonly Expr[], ctx: Ctx): Code {
    const strict = this.#strict(op, rest);
    const at = target.at ?? [];
    const { s, j, head, key, check, skip, fixed, start, startSafe, tests, inner } = this.#targetLoop(target.axis, at, ctx);
    const { level } = inner;
    // Inside the loop, a constant of the run evaluates once, before the loop over the keys of the run.
    const testCodes = tests.map((t) => this.#hoist(this.expr(t, inner), hasLoop(t)));
    const body = this.#hoist(this.expr(target.body, inner), hasLoop(target.body));
    // A count of all the items, whose body cannot fail, is the count of the records. A safe body covers its statements.
    if (op === "count" && fixed && tests.length === 0 && body.v.safe) return bare(plainValue("n", "number"));
    const deps = new Set([...start, ...[body, ...testCodes].flatMap((x) => [...x.v.deps])].filter((d) => d !== level));
    const r = this.#reduction(op, body.v.kind);
    const { v } = r;
    s.push(r.init);
    const item = [...check, ...testCodes.flatMap((t) => [...t.s, `if (!${this.#boolean(t.v)}) continue;`]), ...body.s];
    // An item whose tests and body cannot fail needs no try.
    const safeItem = check.length === 0 && body.v.safe && testCodes.every((t) => this.#safeBoolean(t.v));
    // The interpreter evaluates each item before the list op (COMPILE.MODULE.SHEET). When an item reads a cell, an error
    // of an item or of a step must not stop the reads of the next items. So the items go into an array first.
    if ([body, ...testCodes].some((x) => x.v.deps.has(CELLS)) && (strict || stepThrows(op, body.v.kind))) {
      const list = this.fresh("L");
      const x = this.fresh("x");
      const all = [...key, ...(skip === undefined ? [] : [`if (${j} === ${skip}) continue;`]), `let ${x};`, "try {", ...ind(item), `  ${x} = ${body.v.code};`, "} catch {", `  ${x} = E;`, "}", `${list}.push(${x});`];
      const reduce = [`for (const ${v} of ${list}) {`, `  if (${v} === E) ${strict ? `${this.use("F")}();` : "continue;"}`, `  ${r.step}`, "}"];
      return { s: [...s, `const ${list} = [];`, head, ...ind(all), "}", ...reduce], v: { code: r.result, kind: listKind(op, body.v.kind), safe: false, deps } };
    }
    const loop = [
      ...key,
      ...(skip === undefined ? [] : [`if (${j} === ${skip}) continue;`]),
      ...(safeItem
        ? [...item, `const ${v} = ${body.v.code};`]
        : [`let ${v};`, "try {", ...ind(item), `  ${v} = ${body.v.code};`, "} catch {", strict ? `  ${this.use("F")}();` : "  continue;", "}"]),
      r.step,
    ];
    s.push(head, ...ind(loop), "}");
    // A count without strict, and any, all and none over booleans without strict, cannot fail. The address of the axis
    // can fail, except at the focus or at the origin.
    const safe = startSafe && !strict && (op === "count" || (BOOLEAN_LIST_OPS.has(op) && body.v.kind === "boolean"));
    return { s, v: { code: r.result, kind: listKind(op, body.v.kind), safe, deps } };
  }

  /**
   * This method gives the parts of a list op that reduces the values of its items. The parts are the variable `v` of
   * the value of an item, the first statement, the step and the result. A value of the wrong kind is an error of the op.
   */
  #reduction(op: string, kind: Kind | undefined): { readonly v: string; readonly init: string; readonly step: string; readonly result: string } {
    const a = this.fresh("a");
    const n = this.fresh("n");
    const v = this.fresh("x");
    const num = kind === "number" ? v : `${this.use("U")}(${v})`;
    const bool = kind === "boolean" ? v : `${this.use("B")}(${v})`;
    const inits: Readonly<Record<string, string>> = {
      count: `let ${n} = 0;`,
      sum: `let ${a} = 0;`,
      mean: `let ${a} = 0, ${n} = 0;`,
      any: `let ${a} = false;`,
      none: `let ${a} = false;`,
      all: `let ${a} = true;`,
    };
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
    const F = this.use("F");
    const results: Readonly<Record<string, string>> = {
      count: n,
      sum: this.#checked("number", a),
      mean: `(${n} === 0 ? ${F}() : ${this.#checked("number", `${a} / ${n}`)})`,
      any: a,
      all: a,
      none: `!${a}`,
    };
    return { v, init: inits[op] ?? `let ${a}, ${n} = 0;`, step: steps[op] as string, result: results[op] ?? `(${n} === 0 ? ${F}() : ${a})` };
  }

  /**
   * This method prints a list as an array (LIST.VALUE): a pair of the key and the value of each item. A test that
   * fails, a body that fails and an error item of the axis list give the error sentinel as the value.
   */
  #eachList(e: ExprOf<"each">, ctx: Ctx): Code {
    const at = e.at ?? [];
    const { s, j, head, key, check, skip, start, startSafe, tests, inner } = this.#targetLoop(e.axis, at, ctx);
    const testCodes = tests.map((t) => this.#hoist(this.expr(t, inner), hasLoop(t)));
    const body = this.#hoist(this.expr(e.body, inner), hasLoop(e.body));
    const deps = new Set([...start, ...[body, ...testCodes].flatMap((x) => [...x.v.deps])].filter((d) => d !== inner.level));
    const list = this.fresh("L");
    const v = this.fresh("x");
    const item = [...check, ...testCodes.flatMap((t) => [...t.s, `if (!${this.#boolean(t.v)}) continue;`]), ...body.s];
    const safeItem = check.length === 0 && body.v.safe && testCodes.every((t) => this.#safeBoolean(t.v));
    const loop = [
      ...key,
      ...(skip === undefined ? [] : [`if (${j} === ${skip}) continue;`]),
      ...(safeItem ? [...item, `${list}.push([${j}, ${body.v.code}]);`] : [`let ${v};`, "try {", ...ind(item), `  ${v} = ${body.v.code};`, "} catch {", `  ${v} = E;`, "}", `${list}.push([${j}, ${v}]);`]),
    ];
    return { s: [...s, `const ${list} = [];`, head, ...ind(loop), "}"], v: { code: list, kind: undefined, safe: startSafe, deps, list: { item: body.v.kind } } };
  }

  /**
   * This method prints sortBy and take (LIST.SORT, LIST.TAKE): a new array from the array of a list. An error item is
   * not in the new list, and with strict it is the error of the op.
   */
  #order(op: "sortBy" | "take", head: Expr, rest: readonly Expr[], ctx: Ctx): Code {
    const list = this.#listOf(head, ctx);
    // A missing count is the literal null, which is not a whole number, so take gives its error.
    const exprs = [head, ...(op === "take" ? [rest[0] ?? lit(null)] : [])];
    const strict = this.#strict(op, rest.slice(exprs.length - 1));
    const raw = [list, ...exprs.slice(1).map((x) => this.expr(x, ctx))];
    const deps = depsOf(...raw);
    const parts = this.#inOrder(this.#settle(raw, deps, exprs), true);
    const item = (list.v.list as ListInfo).item;
    return { s: stmtsOf(...parts), v: { code: `${this.use(op === "sortBy" ? "SB" : "TK")}(${[...parts.map((x) => x.v.code), String(strict)].join(", ")})`, kind: undefined, safe: false, deps, list: { item } } };
  }

  /** This method prints a list op over a list that is not an each: a loop over its array, and nth (LIST.NTH). */
  #overList(op: string, head: Expr, rest: readonly Expr[], ctx: Ctx): Code {
    const list = this.#listOf(head, ctx);
    // A missing position is the literal null, which is not a whole number, so nth gives its error.
    const exprs = [head, ...(op === "nth" ? [rest[0] ?? lit(null)] : [])];
    const strict = this.#strict(op, rest.slice(exprs.length - 1));
    const raw = [list, ...exprs.slice(1).map((x) => this.expr(x, ctx))];
    const deps = depsOf(...raw);
    const parts = this.#inOrder(this.#settle(raw, deps, exprs), true);
    const [l] = parts as [Code];
    const item = (list.v.list as ListInfo).item;
    if (op === "nth") return { s: stmtsOf(...parts), v: { code: `${this.use("NT")}(${[...parts.map((x) => x.v.code), String(strict)].join(", ")})`, kind: item, safe: false, deps } };
    const r = this.#reduction(op, item);
    const { v } = r;
    const s = [...l.s, r.init, `for (const [, ${v}] of ${l.v.code}) {`, `  if (${v} === E) ${strict ? `${this.use("F")}();` : "continue;"}`, `  ${r.step}`, "}"];
    return { s, v: { code: r.result, kind: listKind(op, item), safe: false, deps } };
  }

  /**
   * This method gives the names of a loop (LOOP.NAMES): a variable for each name of `init`, with its first value at the
   * node. Inside the loop, each name has the level `loop`. Thus a part that reads a name stays in the loop. A loop that
   * reads no key of the run is a constant of the run.
   */
  #loopNames(init: Names, ctx: Ctx, loop: number): { readonly s: string[]; readonly env: Map<string, Name>; readonly vars: ReadonlyMap<string, Name>; readonly deps: Set<number> } {
    const s: string[] = [];
    const env = new Map(ctx.env);
    const vars = new Map<string, Name>();
    const deps = new Set<number>();
    for (const [name, x] of Object.entries(init)) {
      const c = this.expr(x, ctx);
      if (c.v.kind === undefined) throw new NotStandalone(`the first value of the name "${name}" of a loop has no kind`);
      const v = this.fresh("l");
      s.push(...c.s, `let ${v} = ${c.v.code};`);
      const read: Name = { code: v, kind: c.v.kind, lazy: false, deps: new Set([loop]) };
      env.set(name, read);
      vars.set(name, read);
      for (const d of c.v.deps) deps.add(d);
    }
    return { s, env, vars, deps };
  }

  /** This method gives the statements of one step of a loop: each new value first, and then each name gets its value. */
  #loopStep(step: Names, inner: Ctx, vars: ReadonlyMap<string, Name>): { readonly s: string[]; readonly deps: ReadonlySet<number> } {
    const s: string[] = [];
    const sets: string[] = [];
    const deps = new Set<number>();
    for (const [name, x] of Object.entries(step)) {
      const c = this.#hoist(this.expr(x, inner), hasLoop(x));
      const v = vars.get(name) as Name;
      if (c.v.kind !== v.kind) throw new NotStandalone(`a step of a loop changes the kind of the name "${name}"`);
      const t = this.fresh("t");
      s.push(...c.s, `const ${t} = ${c.v.code};`);
      sets.push(`${v.code} = ${t};`);
      for (const d of c.v.deps) deps.add(d);
    }
    return { s: [...s, ...sets], deps };
  }

  /**
   * An iteration (ITERATE.LIMIT, ITERATE.UNTIL): a `for` loop with a variable for each name. An error of a value, of the
   * test or of the result throws, so it is the value of the iteration.
   */
  #iterate(e: ExprOf<"iterate">, ctx: Ctx): Code {
    // Stryker disable next-line UpdateOperator: a level of a loop is a name, so a count down gives other names, and the same code
    const loop = this.#loops++;
    const names = this.#loopNames(e.init, ctx, loop);
    const inner: Ctx = { ...ctx, env: names.env };
    const until = e.until === undefined ? undefined : this.expr(e.until, inner);
    const step = this.#loopStep(e.step, inner, names.vars);
    const result = this.expr(e.result, inner);
    const k = this.fresh("k");
    const body = [
      ...(until === undefined ? [] : [...until.s, `if (${this.#boolean(until.v)}) break;`]),
      `if (${k} === ${String(e.limit)}) ${until === undefined ? "break;" : `${this.use("F")}();`}`,
      ...step.s,
    ];
    const inside = [...(until?.v.deps ?? []), ...step.deps, ...result.v.deps].filter((d) => d !== loop);
    const deps = new Set([...names.deps, ...inside]);
    return { s: [...names.s, `for (let ${k} = 0; ; ${k}++) {`, ...ind(body), "}", ...result.s], v: { code: result.v.code, kind: result.v.kind, safe: false, deps } };
  }

  /**
   * A fold (FOLD.ORDER, FOLD.ERROR): the loop over the targets of an axis, with a variable for each name. The tests read
   * only the names outside the fold. An error throws, so it is the value of the fold.
   */
  #fold(e: ExprOf<"fold">, ctx: Ctx): Code {
    // Stryker disable next-line UpdateOperator: a level of a loop is a name, so a count down gives other names, and the same code
    const loop = this.#loops++;
    const names = this.#loopNames(e.init, ctx, loop);
    const t = this.#targetLoop(e.axis, e.at ?? [], ctx);
    const tests = t.tests.map((x) => this.#hoist(this.expr(x, t.inner), hasLoop(x)));
    // The interpreter evaluates the tests at each target before the first step, so a module of a sheet does not have them.
    if (tests.some((x) => x.v.deps.has(CELLS))) throw new NotStandalone("a test of the axis of a fold reads a cell");
    const step = this.#loopStep(e.step, { ...t.inner, env: names.env }, names.vars);
    const result = this.expr(e.result, { ...ctx, env: names.env });
    const body = [
      ...t.key,
      ...(t.skip === undefined ? [] : [`if (${t.j} === ${t.skip}) continue;`]),
      ...t.check,
      ...tests.flatMap((c) => [...c.s, `if (!${this.#boolean(c.v)}) continue;`]),
      ...step.s,
    ];
    const inside = [...tests.flatMap((c) => [...c.v.deps]), ...step.deps].filter((d) => d !== loop && d !== t.inner.level);
    const deps = new Set([...names.deps, ...t.start, ...inside, ...[...result.v.deps].filter((d) => d !== loop)]);
    return { s: [...names.s, ...t.s, t.head, ...ind(body), "}", ...result.s], v: { code: result.v.code, kind: result.v.kind, safe: false, deps } };
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
    const bodyCtx: Ctx = { origin: undefined, focus: undefined, level: 1, originLevel: 1, env: new Map(), fns: new Map(), keys: names };
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
        this.#lists.set(fn, body.v.list);
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
    return { s, v: { code: `${fn}(${args.join(", ")})`, kind: this.#kinds.get(fn), safe: false, deps: depsOf(...values), list: this.#lists.get(fn) } };
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
  #cached(e: Expr, key: Expr, bodyCtx: Ctx, fn: string): { readonly lines: readonly string[]; readonly kind: Kind | undefined } | undefined {
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
  /** This method gives the code of a program at the key `o` of the run. A sheet has one program for each formula. */
  root(expr: Expr): Code {
    return this.#hoist(this.expr(expr, { origin: "o", focus: "o", level: 1, originLevel: 1, env: new Map(), fns: new Map(), keys: new Map() }));
  }

  /** This method removes the declarations that no code reads, after the last program. */
  finish(): void {
    // A function of an op with an inline form at each of its sites needs no declaration.
    for (const [name, form] of this.#forms) if (form !== undefined && !this.#called.has(name)) this.top.delete(name);
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
      const node = x as Expr | undefined;
      if (node?.tag === "var") return { $: ctx.env.get(node.name)?.code ?? node.name };
      // A call gives the number of the binding of its function, so two functions with one name give two keys.
      return node?.tag === "call" ? { "()": node.fn, of: ctx.fns.get(node.fn)?.id ?? null, args: node.args } : undefined;
    });
  }
}

/** This function gives the name of the function of a module, and its space, or the reason that the options are not valid. */
function runOf(options: ModuleOptions): { readonly name: string; readonly tree: boolean } | { readonly reason: string } {
  const name = options.name ?? "run";
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { reason: `the name "${name}" is not a JavaScript name` };
  const tree = options.space === "tree";
  if (!tree && options.space !== undefined && options.space !== "array") return { reason: `the space "${String(options.space)}" is not "array" or "tree"` };
  return { name, tree };
}

/** This function gives the reason of an error of the printer. Another exception is a defect, so it goes to the caller. */
function reasonOf(thrown: unknown): Emitted {
  if (!(thrown instanceof NotStandalone)) throw thrown;
  return { ok: false, reason: thrown.message };
}

/**
 * This function gives the text of a module: the declarations, the helpers, and the function of the run. The run checks
 * its input, computes the parts of the tree and the constants of the run, and then gives the statements `body`.
 */
function printModule(p: Printer, options: ModuleOptions, run: { readonly name: string; readonly tree: boolean }, body: readonly string[]): Emitted {
  p.use("C");
  const helpers = new Set<Helper>();
  // A helper comes after the helpers that it needs. A set keeps the first place of each helper.
  const add = (h: Helper): void => {
    for (const x of NEEDS[h]) add(x);
    helpers.add(h);
  };
  const fields = Object.entries(options.schema.fields ?? {});
  const vars = Object.entries(options.schema.vars ?? {});
  let fieldChecks: string;
  let varChecks: string;
  try {
    fieldChecks = fields.map(([f, k]) => ` || ${p.against(k, `r[${JSON.stringify(f)}]`)}`).join("");
    varChecks = vars.map(([v, k]) => ` || ${p.against(k, `vars[${JSON.stringify(v)}]`)}`).join("");
  } catch (thrown) {
    return reasonOf(thrown);
  }
  const { name, tree } = run;
  // A tree checks its parents, and it computes the parts that the program reads. The siblings and the order need the
  // children.
  if (tree) p.use("PT");
  if (p.treeParts.size > 0) p.treeParts.add("children");
  const parts = (["children", "siblings", "order"] as const).filter((x) => p.treeParts.has(x));
  for (const x of parts) p.use(TREE_PARTS[x][0]);
  [...p.helpers].toSorted().forEach(add);
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
    `export function ${name}(records, vars${tree ? ", parents" : ""}) {`,
    '  if (!Array.isArray(records)) C("the records are not an array");',
    "  const R = records;",
    "  const n = R.length;",
    "  for (let i = 0; i < n; i++) {",
    "    const r = R[i];",
    `    if (typeof r !== "object" || r === null${fieldChecks}) C(\`the record \${i} does not keep the schema\`);`,
    "  }",
    `  if (typeof vars !== "object" || vars === null${varChecks}) C("the variables do not keep the schema");`,
    ...(tree ? ["  const P = PT(parents, n);", ...parts.map((x) => `  ${TREE_PARTS[x][1]}`)] : []),
    ...[...p.vars].map(([v, code]) => `  const ${code} = vars[${JSON.stringify(v)}];`),
    ...ind(p.run),
    ...ind(body),
    "}",
    "",
  ];
  return { ok: true, source: lines.join("\n") };
}

/**
 * This function prints a program as a standalone ES module. The module exports `VexContractError`, `VEX_ERROR` and a
 * function that takes the records and the variables and gives the value at each key. A module of a tree space takes
 * the parents too. The function is pure, so a build can use it. The program can be an expression or a document
 * (DOC.ENTRY).
 */
export function emitModule(source: Expr | Envelope, options: ModuleOptions): Emitted {
  const run = runOf(options);
  if ("reason" in run) return { ok: false, reason: run.reason };
  // DOC.ENTRY: a document gives its expression first, or the reason that it is not valid.
  const read = isDocument(source) ? fromDocument(source, options.domains) : { ok: true as const, value: source };
  if (!read.ok) return { ok: false, reason: read.error.message };
  const expr = read.value;
  // EVAL.SHAPE: a module of an expression that is not valid has no use, so the printer gives the reason.
  const shape = shapeError(expr);
  if (shape !== undefined) return { ok: false, reason: shape };
  const p = new Printer(expr, options);
  let value: Code;
  try {
    value = p.root(expr);
    p.finish();
  } catch (thrown) {
    return reasonOf(thrown);
  }
  const body = ["const out = [];", "for (let o = 0; o < n; o++) {", "  try {", ...ind(ind(value.s)), `    out.push(${value.v.code});`, "  } catch {", "    out.push(VEX_ERROR);", "  }", "}", "return out;"];
  return printModule(p, options, run, body);
}

/** The budget of the stack of the search of a run of a sheet, as `STACK_BUDGET` of `SheetRun`. */
const SHEET_BUDGET = 3000;

/** A formula of a sheet: its column, the position of its cell (undefined for the formula of the column) and its expression. */
interface Formula {
  readonly column: string;
  readonly key: number | undefined;
  readonly expr: Expr;
}

/** This function gives the words for a formula in a reason: the formula of a column, or of one cell. */
const formulaText = (f: Formula): string => (f.key === undefined ? `the formula of the column "${f.column}"` : `the formula of the cell "${f.column}" at "${String(f.key)}"`);

/** This function gives the words for a kind in a reason. */
const kindText = (k: Kind | undefined): string => k ?? "that the printer does not know";

/**
 * This function prints the formula columns of a sheet as a standalone ES module (COMPILE.MODULE.SHEET). The function of
 * the module takes the records and the variables, and the parents for a tree. It gives an object with an array for
 * each column: the result of the column at each key, or `VEX_ERROR`. The results are the results of `SheetRun`.
 *
 * The run fills the columns in the order of `SheetRun.fill`. A read of a finished cell is the read of an array. A read
 * of a cell that is not finished starts the search of `SheetRun`, with the same budget of the stack. Each cell on a
 * cycle of reads gives `VEX_ERROR`.
 */
export function emitSheetModule(columns: ReadonlyMap<string, Expr>, options: SheetModuleOptions): Emitted {
  const run = runOf(options);
  if ("reason" in run) return { ok: false, reason: run.reason };
  const budget = options.budget ?? SHEET_BUDGET;
  if (!Number.isSafeInteger(budget) || budget < 0) return { ok: false, reason: `the budget ${String(budget)} is not a whole number of 0 or more` };
  const cells: CellFormulas = options.cells ?? new Map();
  const names = [...new Set([...columns.keys(), ...cells.keys()])];
  const order = columnOrder(columns, cells);
  // The formulas in the order of the columns. A key of a cell that is not the text of a position is not a key of the
  // space, so no read finds its formula.
  const formulas: Formula[] = order.flatMap((column): Formula[] => {
    const own = [...(cells.get(column) ?? [])].filter(([k]) => /^(0|[1-9]\d*)$/.test(k) && Number.isSafeInteger(Number(k)));
    const formula = columns.get(column);
    return [...(formula === undefined ? [] : [{ column, key: undefined, expr: formula }]), ...own.map(([k, expr]) => ({ column, key: Number(k), expr }))];
  });
  for (const f of formulas) {
    // EVAL.SHAPE: the printer gives the reason for an expression that is not valid.
    const shape = shapeError(f.expr);
    if (shape !== undefined) return { ok: false, reason: `${formulaText(f)}: ${shape}` };
  }
  const kinds = new Map<string, Kind | undefined>(Object.entries(options.kinds ?? {}));
  const index = new Map(names.map((c, i) => [c, i]));
  // The memo of the printer covers each formula, so the formulas share their nodes of the memo.
  const p = new Printer(rec(Object.fromEntries(formulas.map((f, i) => [`f${String(i)}`, f.expr]))), options, { columns: index, kinds });
  const fns: string[] = [];
  const decls: string[] = [];
  try {
    for (const f of formulas) {
      const code = p.root(f.expr);
      const kind = code.v.kind;
      // The first formula of a column without a kind of the options gives the kind of the column.
      if (!kinds.has(f.column)) kinds.set(f.column, kind);
      else if (kinds.get(f.column) !== kind) throw new NotStandalone(`${formulaText(f)} gives a value of the kind ${kindText(kind)}, not of the kind ${kindText(kinds.get(f.column))} of its column`);
      const fn = p.fresh("cf");
      fns.push(fn);
      decls.push(...(code.v.safe && code.s.length === 0 ? [`const ${fn} = (o) => ${code.v.code};`] : [`const ${fn} = (o) => {`, "  try {", ...ind(ind(code.s)), `    return ${code.v.code};`, "  } catch {", "    return E;", "  }", "};"]));
    }
    p.finish();
  } catch (thrown) {
    return reasonOf(thrown);
  }
  // The program of each column, and of each cell with its own formula, with its cost in estimated frames, as in SheetRun.
  const entry = (i: number): string => `[${fns[i] as string}, ${String(3 * nestingOf((formulas[i] as Formula).expr) + 16)}]`;
  const own = names.map((c) => {
    const at = formulas.flatMap((f, i) => (f.column === c && f.key !== undefined ? [`${String(f.key)}: ${entry(i)}`] : []));
    return at.length === 0 ? "undefined" : `{ ${at.join(", ")} }`;
  });
  const cols = names.map((c) => {
    const i = formulas.findIndex((f) => f.column === c && f.key === undefined);
    return i < 0 ? "undefined" : entry(i);
  });
  p.use("SH");
  // A tree gives the keys in the order of a fill with the helper KO, once for each order.
  const orders = new Map<string, string>();
  const fill = order.map((c) => {
    const { reverse, post, back } = keyOrderOf(readsOf(columns, cells, c).directions);
    const at = String(index.get(c));
    if (!run.tree) return reverse ? `for (let o = n - 1; o >= 0; o--) SS.f(${at}, o);` : `for (let o = 0; o < n; o++) SS.f(${at}, o);`;
    const args = `${p.use("KO")}(H, RT, ${String(post)}, ${String(back)})`;
    let keys = orders.get(args);
    if (keys === undefined) {
      keys = p.fresh("K");
      orders.set(args, keys);
    }
    return `for (const o of ${keys}) SS.f(${at}, o);`;
  });
  if (run.tree) p.treeParts.add("children");
  const body = [
    ...decls,
    `const SS = SH(n, [${cols.join(", ")}], [${own.join(", ")}], ${String(budget)});`,
    `const ${READ_CELL} = SS.r;`,
    ...[...orders].map(([args, keys]) => `const ${keys} = ${args};`),
    ...fill,
    `return { ${names.map((c, i) => `${JSON.stringify(c)}: SS.o(${String(i)})`).join(", ")} };`,
  ];
  return printModule(p, options, run, body);
}

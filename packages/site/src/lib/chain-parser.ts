/**
 * A safe reader of Vex chains, for the Lab. It reads a small part of TypeScript: `const` lines, member access, calls,
 * arrow functions, literals, arrays and object literals. It evaluates them against the builder only. The reader
 * cannot reach a global or a constructor, because each member name must be on a list of the builder API. Thus a
 * shared link with a program cannot run other code in the browser.
 */

import { isExpr, type Expr } from "@mark1russell7/vex";

/** A position in the source text, for error messages. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** An error of the reader, with the position of the problem. */
export class ChainError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.name = "ChainError";
    this.span = span;
  }
}

type Token =
  | { readonly t: "id"; readonly v: string; readonly span: Span }
  | { readonly t: "num"; readonly v: number; readonly span: Span }
  | { readonly t: "str"; readonly v: string; readonly span: Span }
  | { readonly t: "op"; readonly v: string; readonly span: Span }
  | { readonly t: "end"; readonly span: Span };

const PUNCT = ["=>", "(", ")", "{", "}", "[", "]", ",", ".", ":", ";", "=", "-"];

/** This function splits the source into tokens. Comments and white space are not tokens. */
export function tokenize(src: string): readonly Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (src.startsWith("//", i)) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    const start = i;
    if (/[A-Za-z_$]/.test(c)) {
      while (i < src.length && /[\w$]/.test(src[i] ?? "")) i++;
      out.push({ t: "id", v: src.slice(start, i), span: { start, end: i } });
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      while (i < src.length && /[\d.eE_]/.test(src[i] ?? "")) {
        // An exponent can have a sign, for example 1e-7.
        if (/[eE]/.test(src[i] ?? "") && /[+-]/.test(src[i + 1] ?? "")) i++;
        i++;
      }
      const v = Number(src.slice(start, i).replaceAll("_", ""));
      if (!Number.isFinite(v)) throw new ChainError(`"${src.slice(start, i)}" is not a number`, { start, end: i });
      out.push({ t: "num", v, span: { start, end: i } });
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      let v = "";
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") {
          const n = src[i + 1] ?? "";
          v += n === "n" ? "\n" : n === "t" ? "\t" : n;
          i += 2;
          continue;
        }
        if (c === "`" && src.startsWith("${", i)) throw new ChainError("a template string with ${...} is not supported", { start: i, end: i + 2 });
        v += src[i];
        i++;
      }
      if (src[i] !== c) throw new ChainError("the string has no end", { start, end: src.length });
      i++;
      out.push({ t: "str", v, span: { start, end: i } });
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (p === undefined) throw new ChainError(`"${c}" is not part of a Vex chain`, { start, end: i + 1 });
    i += p.length;
    out.push({ t: "op", v: p, span: { start, end: i } });
  }
  out.push({ t: "end", span: { start: src.length, end: src.length } });
  return out;
}

/** The syntax tree of a chain program. */
export type Node =
  | { readonly k: "num"; readonly v: number; readonly span: Span }
  | { readonly k: "str"; readonly v: string; readonly span: Span }
  | { readonly k: "const"; readonly v: boolean | null; readonly span: Span }
  | { readonly k: "id"; readonly name: string; readonly span: Span }
  | { readonly k: "member"; readonly obj: Node; readonly name: string; readonly nameSpan: Span; readonly span: Span }
  | { readonly k: "call"; readonly fn: Node; readonly args: readonly Node[]; readonly span: Span }
  | { readonly k: "arrow"; readonly params: readonly string[]; readonly body: Node; readonly span: Span }
  | { readonly k: "object"; readonly fields: readonly (readonly [string, Node])[]; readonly span: Span }
  | { readonly k: "array"; readonly items: readonly Node[]; readonly span: Span };

/** A program: `const` lines, then one expression. */
export interface ChainProgram {
  readonly consts: readonly (readonly [string, Node])[];
  readonly result: Node;
}

/** The greatest nesting of a program in the Lab: parentheses, lists, objects, arguments and arrow functions. */
export const MAX_DEPTH = 100;

/** This function reads a program. It throws a `ChainError` with the position of the first problem. */
export function parseChain(src: string): ChainProgram {
  if (src.length > 6000) throw new ChainError("the program is too long for the Lab", { start: 6000, end: src.length });
  const toks = tokenize(src);
  let i = 0;
  const peek = (): Token => toks[i] ?? toks[toks.length - 1] ?? { t: "end", span: { start: 0, end: 0 } };
  const next = (): Token => {
    const t = peek();
    i = Math.min(i + 1, toks.length - 1);
    return t;
  };
  const isOp = (v: string): boolean => {
    const t = peek();
    return t.t === "op" && t.v === v;
  };
  const expect = (v: string): Token => {
    const t = next();
    if (t.t !== "op" || t.v !== v) throw new ChainError(`a "${v}" is necessary here`, t.span);
    return t;
  };
  const ident = (): { readonly name: string; readonly span: Span } => {
    const t = next();
    if (t.t !== "id") throw new ChainError("a name is necessary here", t.span);
    return { name: t.v, span: t.span };
  };

  // An arrow function starts with "name =>" or with a list of names in parentheses and then "=>".
  const arrowAhead = (): boolean => {
    const t = peek();
    if (t.t === "id") {
      const n = toks[i + 1];
      return n !== undefined && n.t === "op" && n.v === "=>";
    }
    if (!(t.t === "op" && t.v === "(")) return false;
    let j = i + 1;
    for (;;) {
      const a = toks[j];
      if (a === undefined) return false;
      if (a.t === "op" && a.v === ")") break;
      if (a.t !== "id" && !(a.t === "op" && a.v === ",")) return false;
      j++;
    }
    const after = toks[j + 1];
    return after !== undefined && after.t === "op" && after.v === "=>";
  };

  const primary = (): Node => {
    const t = peek();
    if (arrowAhead()) {
      const params: string[] = [];
      if (t.t === "id") params.push(ident().name);
      else {
        expect("(");
        while (!isOp(")")) {
          params.push(ident().name);
          if (!isOp(")")) expect(",");
        }
        expect(")");
      }
      expect("=>");
      const body = expression();
      return { k: "arrow", params, body, span: { start: t.span.start, end: body.span.end } };
    }
    next();
    switch (t.t) {
      case "num":
        return { k: "num", v: t.v, span: t.span };
      case "str":
        return { k: "str", v: t.v, span: t.span };
      case "id":
        if (t.v === "true" || t.v === "false") return { k: "const", v: t.v === "true", span: t.span };
        if (t.v === "null") return { k: "const", v: null, span: t.span };
        return { k: "id", name: t.v, span: t.span };
      case "op": {
        if (t.v === "-") {
          const n = next();
          if (n.t !== "num") throw new ChainError("a number is necessary after a minus", n.span);
          return { k: "num", v: -n.v, span: { start: t.span.start, end: n.span.end } };
        }
        if (t.v === "(") {
          const e = expression();
          expect(")");
          return e;
        }
        if (t.v === "[") {
          const items: Node[] = [];
          while (!isOp("]")) {
            items.push(expression());
            if (!isOp("]")) expect(",");
          }
          const close = expect("]");
          return { k: "array", items, span: { start: t.span.start, end: close.span.end } };
        }
        if (t.v === "{") {
          const fields: (readonly [string, Node])[] = [];
          while (!isOp("}")) {
            const keyTok = next();
            if (keyTok.t !== "id" && keyTok.t !== "str") throw new ChainError("a field name is necessary here", keyTok.span);
            const key = keyTok.v;
            if (isOp(":")) {
              next();
              fields.push([key, expression()]);
            } else if (keyTok.t === "id") {
              // The short form { x } means { x: x }.
              fields.push([key, { k: "id", name: key, span: keyTok.span }]);
            } else throw new ChainError('a ":" is necessary here', peek().span);
            if (!isOp("}")) expect(",");
          }
          const close = expect("}");
          return { k: "object", fields, span: { start: t.span.start, end: close.span.end } };
        }
        throw new ChainError(`"${t.v}" cannot start an expression`, t.span);
      }
      case "end":
        throw new ChainError("the program ends too early", t.span);
    }
  };

  // The reader uses recursion, so a limit on the nesting keeps the call stack small in each browser.
  let depth = 0;
  const expression = (): Node => {
    if (++depth > MAX_DEPTH) throw new ChainError(`the program is nested more than ${MAX_DEPTH} levels deep`, peek().span);
    try {
      return expressionAt();
    } finally {
      depth--;
    }
  };
  const expressionAt = (): Node => {
    let e = primary();
    for (;;) {
      if (isOp(".")) {
        next();
        const n = ident();
        e = { k: "member", obj: e, name: n.name, nameSpan: n.span, span: { start: e.span.start, end: n.span.end } };
        continue;
      }
      if (isOp("(")) {
        next();
        const args: Node[] = [];
        while (!isOp(")")) {
          args.push(expression());
          if (!isOp(")")) expect(",");
        }
        const close = expect(")");
        e = { k: "call", fn: e, args, span: { start: e.span.start, end: close.span.end } };
        continue;
      }
      return e;
    }
  };

  const consts: (readonly [string, Node])[] = [];
  for (;;) {
    const t = peek();
    if (t.t === "id" && (t.v === "const" || t.v === "let")) {
      next();
      const n = ident();
      expect("=");
      consts.push([n.name, expression()]);
      if (isOp(";")) next();
      continue;
    }
    break;
  }
  const result = expression();
  if (isOp(";")) next();
  const rest = peek();
  if (rest.t !== "end") throw new ChainError("the program has more text after its last expression", rest.span);
  return { consts, result };
}

// ---------------------------------------------------------------- evaluation

/** The members that the reader permits on each kind of builder object. */
const ROOT_MEMBERS = new Set(["from", "start", "of", "ofPath", "field", "lit", "rec", "ext"]);
const CHAIN_MEMBERS = new Set([
  "_", "from", "to", "index", "offset", "origin", "other", "parent", "ifError", "fork", "with",
  "others", "neighbors", "each", "children", "ancestors", "descendants", "siblings", "window", "table",
]);
const LIST_MEMBERS = new Set(["count", "sum", "mean", "min", "max", "any", "all", "none", "values", "keys", "errors", "first", "reduce"]);
// An op name of the ops section can be any name, except the names of JavaScript objects.
const FORBIDDEN = new Set([
  "constructor", "__proto__", "prototype", "call", "apply", "bind", "caller", "arguments", "toString", "valueOf",
  "toLocaleString", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__", "then",
]);

type Kind = "root" | "chain" | "list" | "ops";

interface Env {
  readonly vars: ReadonlyMap<string, unknown>;
}

const kindOf = (u: unknown, roots: ReadonlySet<unknown>, ops: WeakSet<object>): Kind | undefined => {
  if (roots.has(u)) return "root";
  if (typeof u === "object" && u !== null) {
    if (ops.has(u)) return "ops";
    const k = (u as { kind?: unknown }).kind;
    if (k === "vex.chain") return "chain";
    if (k === "vex.list-chain") return "list";
  }
  return undefined;
};

/**
 * This function evaluates a program with the builder. `scope` gives the names that the program can read, for
 * example `root`. The result is the value of the last expression, usually a chain.
 */
export function runChain(program: ChainProgram, scope: Readonly<Record<string, unknown>>): unknown {
  const roots = new Set<unknown>(Object.values(scope));
  const ops = new WeakSet<object>();

  const ev = (n: Node, env: Env): unknown => {
    switch (n.k) {
      case "num":
      case "str":
      case "const":
        return n.v;
      case "id": {
        if (!env.vars.has(n.name)) throw new ChainError(`the name "${n.name}" is not defined. The Lab knows root, the names of const lines and the parameters of arrow functions.`, n.span);
        return env.vars.get(n.name);
      }
      case "array":
        return n.items.map((x) => ev(x, env));
      case "object": {
        const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const [k, v] of n.fields) {
          if (FORBIDDEN.has(k)) throw new ChainError(`"${k}" is not a field name that the Lab permits`, n.span);
          out[k] = ev(v, env);
        }
        return { ...out };
      }
      case "arrow":
        return (...args: readonly unknown[]): unknown => {
          const vars = new Map(env.vars);
          n.params.forEach((p, i) => vars.set(p, args[i]));
          return ev(n.body, { vars });
        };
      case "member": {
        const obj = ev(n.obj, env);
        const kind = kindOf(obj, roots, ops);
        if (kind === undefined) throw new ChainError(`".${n.name}" needs a root, a chain or a list chain before it`, n.nameSpan);
        if (kind === "ops") {
          if (FORBIDDEN.has(n.name)) throw new ChainError(`"${n.name}" is not an op name that the Lab permits`, n.nameSpan);
          return (obj as Readonly<Record<string, unknown>>)[n.name];
        }
        const allowed = kind === "root" ? ROOT_MEMBERS : kind === "chain" ? CHAIN_MEMBERS : LIST_MEMBERS;
        if (!allowed.has(n.name)) {
          throw new ChainError(`"${n.name}" is not a member of a ${kind === "list" ? "list chain" : kind} in the Lab`, n.nameSpan);
        }
        const value = (obj as Readonly<Record<string, unknown>>)[n.name];
        if (n.name === "_") {
          if (typeof value === "object" && value !== null) ops.add(value);
          return value;
        }
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(obj) : value;
      }
      case "call": {
        const fn = ev(n.fn, env);
        if (typeof fn !== "function") throw new ChainError("this is not a function", n.fn.span);
        const args = n.args.map((a) => ev(a, env));
        try {
          return (fn as (...a: unknown[]) => unknown)(...args);
        } catch (thrown) {
          if (thrown instanceof ChainError) throw thrown;
          throw new ChainError(thrown instanceof Error ? thrown.message : String(thrown), n.span);
        }
      }
    }
  };

  const vars = new Map<string, unknown>(Object.entries(scope));
  for (const [name, node] of program.consts) {
    if (FORBIDDEN.has(name)) throw new ChainError(`"${name}" is not a name that the Lab permits`, node.span);
    vars.set(name, ev(node, { vars }));
  }
  return ev(program.result, { vars });
}

/**
 * This function gives the program of the value of a chain program. The value must be a chain or a list chain. A text
 * that ends with `._`, an op without a call or a plain value gives a `ChainError`.
 */
export function programOf(value: unknown, src: string): Expr {
  const all = { start: 0, end: src.length };
  if (typeof value === "function") throw new ChainError("the program ends with an op or a member without a call. Add the call, for example ._.add(1)", { start: Math.max(0, src.trimEnd().length - 1), end: src.trimEnd().length });
  const program = typeof value === "object" && value !== null ? (value as { readonly program?: unknown }).program : undefined;
  if (typeof program === "function") throw new ChainError("the program ends with ._, so an op name is necessary, for example ._.add(1)", { start: Math.max(0, src.trimEnd().length - 1), end: src.trimEnd().length });
  if (!isExpr(program)) throw new ChainError("the program must end with a chain, for example root.from(...)", all);
  return program;
}

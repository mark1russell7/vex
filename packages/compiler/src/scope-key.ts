/**
 * The key of an expression at a place of a module. Two expressions at their places have one key only if they have one
 * value. A key holds what each read of the expression means at that place. A read of a name that the expression binds
 * keeps its spelling, because the structure of the key holds its binder. Another read gives a token of its meaning.
 * The root and `./module` of this package do not export this file.
 */
import type { Expr, ExprOf } from "@mark1russell7/vex";

/** A variable of the code of a module. */
interface Variable {
  readonly code: string;
}

/** The place of an expression: what each name that the expression does not bind means there. */
export interface KeyScope {
  /** The nodes of the memo around the place, with the variable of each. */
  readonly keys: ReadonlyMap<Expr, Variable>;
  /** The names around the place. A name that is not in this map is a variable of the run. */
  readonly env: ReadonlyMap<string, Variable>;
  /** The functions around the place, with the number of the binding of each. */
  readonly fns: ReadonlyMap<string, { readonly id: number }>;
  /** The columns of the `fix` forms around the place. */
  readonly columns: ReadonlyMap<string, Variable>;
}

/** A place in the walk: the scope of the expression, and the names of each kind that the expression binds around the part. */
interface Place {
  readonly scope: KeyScope;
  readonly names: ReadonlySet<string>;
  readonly rounds: ReadonlySet<string>;
}

/**
 * This function gives a text that is the same for two expressions with the same structure. -0 is not 0. A part with a
 * token gives the token, so the text does not depend on that part. A token is an object, and a literal of a module is
 * not, so a token is not the text of a literal.
 */
export function canonical(e: Expr, token: (x: unknown) => object | undefined): string {
  return JSON.stringify(e, (_name, x: unknown) => token(x) ?? (Object.is(x, -0) ? { "-0": 0 } : x));
}

/** This function gives the place of a part that sees more names. */
const within = (at: Place, names: readonly string[]): Place => ({ ...at, names: new Set([...at.names, ...names]) });

/** This function gives the key data of an object that is not an expression, for example an axis or a record of names. */
function record(x: object, at: Place): unknown {
  return Object.fromEntries(Object.entries(x).map(([name, part]) => [name, data(part, at)]));
}

/** This function gives the key data of a part of an expression. An array or a record keeps its form, and an expression gets its key data. */
function data(x: unknown, at: Place): unknown {
  if (Array.isArray(x)) return x.map((part) => data(part, at));
  if (typeof x !== "object" || x === null) return x;
  return typeof (x as { tag?: unknown }).tag === "string" ? node(x as Expr, at) : record(x, at);
}

/** This function gives the key data of the read of a name. A name of the run and a name of the code are two tokens, so one text in both does not give one key. */
function read(e: ExprOf<"var">, at: Place): unknown {
  if (at.names.has(e.name)) return e;
  const name = at.scope.env.get(e.name);
  return name === undefined ? { $$: e.name } : { $: name.code };
}

/** This function gives the key data of a loop over names: each part sees the names that its form gives it (LOOP.NAMES). */
function loop(e: ExprOf<"fold"> | ExprOf<"iterate">, at: Place): unknown {
  const names = Object.keys(e.init);
  const inner = within(at, names);
  const outer = e.tag === "fold" ? { axis: data(e.axis, at), at: data(e.at, at) } : { limit: data(e.limit, at) };
  const until = e.tag === "iterate" ? { until: data(e.until, inner) } : {};
  const items = e.tag === "fold" ? (e.as ?? []) : [];
  return { ...e, ...outer, ...until, init: record(e.init, at), step: record(e.step, within(inner, items)), result: node(e.result, inner) };
}

/** This function gives the key data of an expression. The scope of each form is the scope of the interpreter. */
function node(e: Expr, at: Place): unknown {
  const key = at.scope.keys.get(e);
  if (key !== undefined) return { "@": key.code };
  switch (e.tag) {
    case "lit":
    case "ext":
      return e;
    case "var":
      return read(e, at);
    case "last":
      return at.rounds.has(e.name) ? e : { "^": at.scope.columns.get(e.name)?.code };
    case "call":
      // A call of a function around the place gives the number of its binding, so two functions with one name give two keys.
      return at.names.has(e.fn) ? { ...e, args: data(e.args, at) } : { "()": e.fn, of: at.scope.fns.get(e.fn)?.id, args: data(e.args, at) };
    case "fn":
      return { ...e, body: node(e.body, within(at, e.params)) };
    case "let":
      // Each binding sees the outer names, so a binding does not see the other bindings (FN.BIND).
      return { ...e, bind: record(e.bind, at), body: node(e.body, within(at, Object.keys(e.bind))) };
    case "each":
      return { ...e, axis: data(e.axis, at), at: data(e.at, at), body: node(e.body, within(at, e.as ?? [])) };
    case "fold":
    case "iterate":
      return loop(e, at);
    case "fix":
      return { ...e, init: node(e.init, at), step: node(e.step, { ...at, rounds: new Set([...at.rounds, e.name]) }) };
    case "ref":
    case "app":
    case "rec":
      return record(e, at);
  }
}

/**
 * This function gives the key of an expression at a place. Two keys are equal only if the two expressions at their places
 * have one value. Two expressions with one value can have two keys, for example with two spellings of a name that they bind.
 */
export function keyText(e: Expr, scope: KeyScope): string {
  return canonical(node(e, { scope, names: new Set(), rounds: new Set() }) as Expr, () => undefined);
}

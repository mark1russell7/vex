/**
 * The key of an expression at a place of a module. Two expressions at their places have one key only if they have one
 * value. A key holds what each read of the expression means at that place. A read of a name that the expression binds
 * keeps its spelling, because the structure of the key holds its binder. Another read gives a token of its meaning.
 * The root and `./module` of this package do not export this file.
 *
 * A table walks each expression once and keeps its form. A form holds the number of its structure with a hole at each
 * read. It also holds the list of its reads in the order of the structure. So a key at a new place reads the list, and it
 * does not walk the expression again. The lists have shared parts, so the forms of a chain use memory linear in the chain. The
 * cost of a key at each place is linear in the reads and the binders of the expression. A key has a small text.
 *
 * A form depends on the nodes of the memo around it, so a table keeps the forms for each content of `keys`. The table has
 * no copy of the other maps of a scope, because each key reads them as they stand. The table seals a map of `keys` at its
 * first read. So a change of that map after a read is a refusal, and it does not give a wrong key.
 */
import type { Expr, ExprOf } from "@mark1russell7/vex";

/** The error of a construct that a standalone module does not have. */
export class NotStandalone extends Error {}

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

/** A hole of a form: a read of a name, of a round or of a function. */
interface Read {
  readonly hole: "var" | "last" | "call";
  readonly name: string;
}

/** The reads of a part of a form, with the names of a kind that a form binds around that part. */
interface Bound {
  readonly kind: "names" | "rounds";
  readonly names: readonly string[];
  readonly parts: readonly Reads[];
}

/** The reads of an expression, in the order of its structure. A form above an expression shares this object. */
type Reads = Read | Bound;

/** The form of an expression: the key data of its structure, and its reads, if it has reads. */
interface Form {
  readonly data: unknown;
  readonly reads: Reads | undefined;
}

/** The forms of one content of `keys`. */
interface Forms {
  readonly table: KeyTable;
  readonly keys: ReadonlyMap<Expr, Variable>;
  readonly known: Map<Expr, Form>;
}

/** A place in the walk of an expression: the forms, and the reads of the form that the walk makes. */
interface At {
  readonly forms: Forms;
  readonly reads: Reads[];
}

/** This function refuses a change of a map that a table read. */
function sealed(): never {
  throw new NotStandalone("a map of the memo changed after a read of its keys");
}

/** The properties that seal a map. Each method that changes a map refuses. */
const SEAL: PropertyDescriptorMap = { set: { value: sealed, configurable: true }, delete: { value: sealed, configurable: true }, clear: { value: sealed, configurable: true } };

/** This class holds the number of each structure and the forms of each content of `keys`, for the keys of one printer. */
export class KeyTable {
  readonly #numbers = new Map<string, number>();
  readonly #nodes = new WeakMap<Expr, number>();
  readonly #maps = new WeakMap<object, Forms>();
  readonly #forms = new Map<string, Forms>();

  /** This method gives the number of a structure. Two structures have one number only if they have one text. */
  numberOf(text: string): number {
    const known = this.#numbers.get(text);
    if (known !== undefined) return known;
    const fresh = this.#numbers.size;
    this.#numbers.set(text, fresh);
    return fresh;
  }

  /** This method gives the number of a node of the program, the same object. */
  #nodeId(e: Expr): number {
    const known = this.#nodes.get(e);
    if (known !== undefined) return known;
    const fresh = this.numberOf(`node ${String(this.#numbers.size)}`);
    this.#nodes.set(e, fresh);
    return fresh;
  }

  /** This method gives the forms of a map of `keys`, and seals the map. Two maps with one content have one record of forms. */
  formsOf(keys: ReadonlyMap<Expr, Variable>): Forms {
    const held = this.#maps.get(keys);
    if (held !== undefined) return held;
    const text = JSON.stringify([...keys].map(([e, value]) => [this.#nodeId(e), value.code]));
    const forms = this.#forms.get(text) ?? { table: this, keys, known: new Map() };
    this.#forms.set(text, forms);
    this.#maps.set(keys, forms);
    Object.defineProperties(keys, SEAL);
    return forms;
  }
}

/** The text of -0 in a key. JSON gives 0 for -0, and -0 is not 0. */
const NEGATIVE_ZERO = { "-0": 0 };

/**
 * This function gives a text that is the same for two expressions with the same structure. -0 is not 0. A part with a
 * token gives the token, so the text does not depend on that part. A token is an object, and a literal of a module is
 * not, so a token is not the text of a literal.
 */
export function canonical(e: Expr, token: (x: unknown) => object | undefined): string {
  return JSON.stringify(e, (_name, x: unknown) => token(x) ?? (Object.is(x, -0) ? NEGATIVE_ZERO : x));
}

/** The token function of a text with no tokens. */
const NO_TOKEN = (): undefined => undefined;

/** This function gives the text of a literal or of an extension. Only those parts hold data of the program, and a walk of that data finds each -0. */
function leafText(e: ExprOf<"lit"> | ExprOf<"ext">): string {
  // Stryker disable next-line ConditionalExpression: a walk gives the same text as the plain form, so this test only saves the walk.
  if (e.tag === "lit" && typeof e.value !== "object" && !Object.is(e.value, -0)) return JSON.stringify(e);
  return canonical(e, NO_TOKEN);
}

/** This function gives the result of a part that sees more names of a kind, and keeps the reads of that part with those names. */
function within<T>(at: At, kind: Bound["kind"], names: readonly string[], part: (inner: At) => T): T {
  const inner: At = { forms: at.forms, reads: [] };
  const result = part(inner);
  if (inner.reads.length > 0) at.reads.push({ kind, names, parts: inner.reads });
  return result;
}

/** This function gives the key data of an object that is not an expression, for example an axis or a record of names. */
function record(x: object, at: At): unknown {
  // A copy keeps each own property, also a property with the name `__proto__`.
  const out: Record<string, unknown> = { ...x };
  for (const name of Object.keys(out)) out[name] = data(out[name], at);
  return out;
}

/** This function gives the key data of a part of an expression. An array or a record keeps its form, and an expression gets its key data. */
function data(x: unknown, at: At): unknown {
  if (Array.isArray(x)) return x.map((part) => data(part, at));
  if (typeof x !== "object" || x === null) return Object.is(x, -0) ? NEGATIVE_ZERO : x;
  return typeof (x as { tag?: unknown }).tag === "string" ? node(x as Expr, at) : record(x, at);
}

/** This function gives the key data of a hole, and adds the read to the reads of the form. */
function hole(kind: Read["hole"], name: string, at: At): unknown {
  at.reads.push({ hole: kind, name });
  return { "?": kind };
}

/** This function gives the key data of a loop over names: each part sees the names that its form gives it (LOOP.NAMES). */
function loop(e: ExprOf<"fold"> | ExprOf<"iterate">, at: At): unknown {
  const outer = e.tag === "fold" ? { axis: data(e.axis, at), at: data(e.at, at) } : { limit: data(e.limit, at) };
  const init = record(e.init, at);
  const items = e.tag === "fold" ? (e.as ?? []) : [];
  const inner = within(at, "names", Object.keys(e.init), (x) => ({
    ...(e.tag === "iterate" ? { until: data(e.until, x) } : {}),
    step: within(x, "names", items, (y) => record(e.step, y)),
    result: node(e.result, x),
  }));
  return { ...e, ...outer, init, ...inner };
}

/**
 * This function gives the key data of the parts of an expression. The scope of each form is the scope of the interpreter.
 * Each number of an expression goes through `data`, so the plain text of this result keeps each -0.
 */
function parts(e: Exclude<Expr, ExprOf<"lit"> | ExprOf<"ext">>, at: At): unknown {
  switch (e.tag) {
    case "var":
    case "last":
      return hole(e.tag, e.name, at);
    case "call":
      return { ...e, fn: hole("call", e.fn, at), args: data(e.args, at) };
    case "fn":
      return { ...e, body: within(at, "names", e.params, (x) => node(e.body, x)) };
    case "let":
      // Each binding sees the outer names, so a binding does not see the other bindings (FN.BIND).
      return { ...e, bind: record(e.bind, at), body: within(at, "names", Object.keys(e.bind), (x) => node(e.body, x)) };
    case "each":
      return { ...e, axis: data(e.axis, at), at: data(e.at, at), body: within(at, "names", e.as ?? [], (x) => node(e.body, x)) };
    case "fold":
    case "iterate":
      return loop(e, at);
    case "fix":
      return { ...e, init: node(e.init, at), step: within(at, "rounds", [e.name], (x) => node(e.step, x)) };
    case "ref":
    case "app":
    case "rec":
      return record(e, at);
  }
}

/** This function gives the form of an expression from its walk. */
function formOf(e: Expr, forms: Forms): Form {
  const own: At = { forms, reads: [] };
  const structure = { "#": forms.table.numberOf(e.tag === "lit" || e.tag === "ext" ? leafText(e) : JSON.stringify(parts(e, own))) };
  const [first, ...more] = own.reads;
  return { data: structure, reads: more.length === 0 ? first : { kind: "names", names: [], parts: own.reads } };
}

/** This function gives the key data of an expression: the number of its form, or the token of a node of the memo. */
function node(e: Expr, at: At): unknown {
  const key = at.forms.keys.get(e);
  if (key !== undefined) return { "@": key.code };
  let form = at.forms.known.get(e);
  if (form === undefined) {
    form = formOf(e, at.forms);
    at.forms.known.set(e, form);
  }
  if (form.reads !== undefined) at.reads.push(form.reads);
  return form.data;
}

/** The names of each kind that a walk of the reads binds at this time. */
interface Binders {
  readonly names: Set<string>;
  readonly rounds: Set<string>;
}

/** This function gives the meaning of a read. A name of the run and a name of the code are two tokens, so one text in both does not give one key. */
function meaning(x: Read, scope: KeyScope, bound: Binders): unknown {
  switch (x.hole) {
    case "var": {
      if (bound.names.has(x.name)) return { "=": x.name };
      const name = scope.env.get(x.name);
      return name === undefined ? { $$: x.name } : { $: name.code };
    }
    case "last":
      return bound.rounds.has(x.name) ? { "=": x.name } : { "^": scope.columns.get(x.name)?.code };
    case "call":
      // A call of a function around the place gives the number of its binding, so two functions with one name give two keys.
      return bound.names.has(x.name) ? { "=": x.name } : { "()": x.name, of: scope.fns.get(x.name)?.id };
  }
}

/** This function adds the meaning of each read to a list, in the order of the structure. */
function meanings(reads: readonly Reads[], scope: KeyScope, bound: Binders, out: unknown[]): void {
  for (const x of reads) {
    if ("hole" in x) {
      out.push(meaning(x, scope, bound));
      continue;
    }
    const set = bound[x.kind];
    const fresh = x.names.filter((name) => !set.has(name));
    for (const name of fresh) set.add(name);
    meanings(x.parts, scope, bound, out);
    for (const name of fresh) set.delete(name);
  }
}

/**
 * This function gives the key of an expression at a place. Two keys of one table are equal only if the two expressions at
 * their places have one value. Two expressions with one value can have two keys, for example with two spellings of a
 * name that they bind.
 */
export function keyText(e: Expr, scope: KeyScope, table: KeyTable): string {
  const at: At = { forms: table.formsOf(scope.keys), reads: [] };
  const structure = node(e, at);
  if (at.reads.length === 0) return JSON.stringify(structure);
  const reads: unknown[] = [];
  meanings(at.reads, scope, { names: new Set(), rounds: new Set() }, reads);
  return JSON.stringify({ "#": table.numberOf(JSON.stringify([structure, reads])) });
}

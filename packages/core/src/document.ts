/**
 * The documents of Vex. A document is the form of an expression in coeval, the language base of the family. Each term
 * is an envelope `{ type, value }`, and a reference is a path from a root. The rules are decision D12 of coeval:
 * <https://github.com/mark1russell7/coeval/blob/main/docs/DECISIONS.md>.
 *
 * | Expression | Document |
 * |---|---|
 * | `lit` | the JSON value of the literal. A value with the shape of an envelope is `{ "type": "lit", "value": x }`. |
 * | `ref` | `{ "type": "ref", "value": ["self", ...moves, ...fields] }` |
 * | `var` | `{ "type": "ref", "value": ["names", name] }` |
 * | `app` | `{ "type": ["ops", ...keys], "value": [...args] }`. The keys are the name of the op, split at its dots. |
 * | `let` | `{ "type": "let", "value": { "bind", "body" } }` |
 * | `fn` | `{ "type": "fn", "value": { "params", "body" } }` |
 * | `call` | `{ "type": "call", "value": { "fn": { "type": "ref", "value": ["names", name] }, "args" } }` |
 * | `rec` | `{ "type": "record", "value": { ...fields } }` |
 * | `each` | `{ "type": "each", "value": { "axis", "body", "at"? } }` |
 * | `fold` | `{ "type": "fold", "value": { "axis", "init", "step", "result", "at"? } }` |
 * | `iterate` | `{ "type": "iterate", "value": { "limit", "init", "step", "until"?, "result" } }` |
 * | `ext` | `{ "type": ["ext", ...keys], "value": data }` |
 * | a move | `{ "type": ["moves", kind], "value": v }` |
 * | an axis | `{ "type": ["axes", name], "value": { ...parameters } }` |
 *
 * The address `at` of `each` and `fold` is a reference from `self` with moves only. An empty address is no address.
 */
import { isEnvelope, ref as path, typed, typeName, typePath, type Envelope, type Json, type JsonRecord } from "@mark1russell7/coeval";
import { decodeValue, encodeValue, isRecord } from "./codec.ts";
import type { AnyDomain } from "./domain.ts";
import { isStackOverflow, vexError, type VexError } from "./errors.ts";
import { app, call, each, ext, fn, fold, index, iterate, key, let_, lit, offset, origin, other, parent, rec, ref, shapeError, v, type Addr, type Axis, type Expr, type Move, type Names } from "./ir.ts";
import { fail, ok, type Result } from "./result.ts";

export type { Envelope, Json } from "@mark1russell7/coeval";

/** The axes without parameters. */
const PLAIN_AXES: ReadonlySet<string> = new Set(["all", "others", "other", "children", "ancestors", "descendants", "siblings", "successors", "predecessors", "reachable"]);

/** The moves without a value. */
const PLAIN_MOVES: ReadonlyMap<string, Move> = new Map([
  ["other", other],
  ["origin", origin],
  ["parent", parent],
]);

/** The stop of a conversion. The functions of this module throw it, and the top of the conversion gives its error. */
class Stop {
  readonly error: VexError;

  constructor(error: VexError) {
    this.error = error;
  }
}

/** This function gives the location of a child: a JSON Pointer, with the escapes of RFC 6901. */
const into = (where: string, step: string | number): string => `${where}/${String(step).replaceAll("~", "~0").replaceAll("/", "~1")}`;

/** This function stops the reading of a document that is not valid at `where`. */
function bad(where: string, reason: string): never {
  throw new Stop(vexError("bad-expression", `the document is not valid at ${where === "" ? "its root" : `"${where}"`}: ${reason}`));
}

/** This function does a conversion. It gives its value, or the error of the conversion. It does not throw. */
function attempt<T>(work: () => T, threw: string, deep: string): Result<T> {
  try {
    return ok(work());
  } catch (thrown) {
    if (thrown instanceof Stop) return fail(thrown.error);
    if (isStackOverflow(thrown)) return fail(vexError("depth", deep, { thrown }));
    return fail(vexError("threw", threw, { thrown }));
  }
}

/**
 * This function tells if a value is a document: an envelope `{ type, value }`. A node of the tagged IR is not an
 * envelope, because it has the key `tag`. Thus `compile` and `evaluate` can take either one (DOC.ENTRY).
 */
export function isDocument(u: unknown): u is Envelope {
  return isEnvelope(u as Json);
}

/**
 * This function gives the document of an expression (DOC.TERM). The root is always an envelope, so `compile` can tell a
 * document from the tagged IR. A literal value has the JSON form of IR.JSON, so a domain value needs `encode` (DOC.LITERAL).
 * An expression that is not valid, or a literal without a JSON form, gives the error `#VALUE!` (DOC.ERROR).
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain encodes no value
export function toDocument(e: Expr, domains: readonly AnyDomain[] = []): Result<Envelope> {
  const shape = shapeError(e);
  if (shape !== undefined) return fail(vexError("bad-expression", shape));
  // A getter of a literal value can throw, so the conversion is inside the attempt.
  return attempt(() => new Writer(domains).envelope(e), "the expression has no document", "the expression is too deep for the call stack of the engine");
}

/**
 * This function reads an expression from a document (DOC.TERM). It is the inverse of `toDocument`. It checks the
 * expression as `compile` does (EVAL.SHAPE). A document that is not valid gives `#VALUE!` with its location (DOC.ERROR).
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain decodes no value
export function fromDocument(doc: unknown, domains: readonly AnyDomain[] = []): Result<Expr> {
  const read = attempt(() => new Reader(domains).term(doc, ""), "a decoder of a domain threw an exception", "the document is too deep for the call stack of the engine");
  if (!read.ok) return read;
  const shape = shapeError(read.value);
  return shape === undefined ? read : fail(vexError("bad-expression", `the document gives an expression that is not valid: ${shape}`));
}

/** The writer of documents. Its methods throw a `Stop` for a literal without a JSON form. */
class Writer {
  readonly #domains: readonly AnyDomain[];

  constructor(domains: readonly AnyDomain[]) {
    this.#domains = domains;
  }

  /** This method gives the document of a term. A literal is its JSON value, except a value with the shape of an envelope. */
  term(e: Expr): Json {
    if (e.tag !== "lit") return this.envelope(e);
    const value = this.#value(e.value);
    return isEnvelope(value) ? typed("lit", value) : value;
  }

  /** This method gives the document of a term as an envelope. Here a literal is an envelope too. */
  envelope(e: Expr): Envelope {
    switch (e.tag) {
      case "lit":
        return typed("lit", this.#value(e.value));
      case "ref":
        return path("self", ...this.#moves(e.at), ...e.path);
      case "var":
        return path("names", e.name);
      case "app":
        return typed(["ops", ...e.op.split(".")], e.args.map((a) => this.term(a)));
      case "let":
        return typed("let", { bind: this.#names(e.bind), body: this.term(e.body) });
      case "fn":
        return typed("fn", { params: [...e.params], body: this.term(e.body) });
      case "call":
        return typed("call", { fn: path("names", e.fn), args: e.args.map((a) => this.term(a)) });
      case "rec":
        return typed("record", this.#names(e.fields));
      case "each":
        return typed("each", { axis: this.#axis(e.axis), body: this.term(e.body), ...this.#at(e.at) });
      case "fold":
        return typed("fold", { axis: this.#axis(e.axis), init: this.#names(e.init), step: this.#names(e.step), result: this.term(e.result), ...this.#at(e.at) });
      case "iterate":
        return typed("iterate", {
          limit: e.limit,
          init: this.#names(e.init),
          step: this.#names(e.step),
          ...(e.until === undefined ? {} : { until: this.term(e.until) }),
          result: this.term(e.result),
        });
      case "ext":
        return typed(["ext", ...e.kind.split(".")], e.data as Json);
    }
  }

  /** This method gives the JSON form of a literal value (IR.JSON). */
  #value(u: unknown): Json {
    const r = encodeValue(u, this.#domains);
    if (!r.ok) throw new Stop(r.error);
    return r.value as Json;
  }

  /** This method gives the documents of the terms of a record of names. */
  #names(names: Names): JsonRecord {
    return Object.fromEntries(Object.entries(names).map(([name, x]) => [name, this.term(x)]));
  }

  /** This method gives the step documents of the moves of an address. */
  #moves(at: Addr | undefined): Json[] {
    return (at ?? []).map((m) => this.#move(m));
  }

  /** This method gives the step document of a move. A computed key or position is an envelope (DOC.MOVE). */
  #move(m: Move): Envelope {
    switch (m.t) {
      case "key":
        return typed(["moves", "key"], typeof m.key === "string" ? m.key : this.envelope(m.key));
      case "index":
        return typed(["moves", "index"], typeof m.i === "number" ? m.i : this.envelope(m.i));
      case "offset":
        return typed(["moves", "offset"], [...m.d]);
      case "other":
      case "origin":
      case "parent":
        return typed(["moves", m.t], null);
    }
  }

  /** This method gives the field `at` of `each` and `fold`: a reference from `self` with moves only, or no field. */
  #at(at: Addr | undefined): { readonly at?: Envelope } {
    return at === undefined || at.length === 0 ? {} : { at: path("self", ...this.#moves(at)) };
  }

  /** This method gives the document of an axis (DOC.AXIS). */
  #axis(a: Axis): Envelope {
    const name = ["axes", a.t];
    switch (a.t) {
      case "neighbors":
        return typed(name, { n: a.n });
      case "window":
        return typed(name, { from: a.from, to: a.to });
      case "table":
        return typed(name, { name: a.name });
      case "list":
        return typed(name, { list: this.term(a.list) });
      case "reverse":
        return typed(name, { axis: this.#axis(a.axis) });
      case "where":
        return typed(name, { axis: this.#axis(a.axis), test: this.term(a.test) });
      case "all":
      case "others":
      case "other":
      case "children":
      case "ancestors":
      case "descendants":
      case "siblings":
      case "successors":
      case "predecessors":
      case "reachable":
        return typed(name, {});
    }
  }
}

/** The reader of documents. Its methods throw a `Stop` at the first part that is not valid. */
class Reader {
  readonly #domains: readonly AnyDomain[];

  constructor(domains: readonly AnyDomain[]) {
    this.#domains = domains;
  }

  /** This method reads a term. An envelope is a term, and another value is a literal (DOC.TERM). */
  term(u: unknown, where: string): Expr {
    return isDocument(u) ? this.#envelope(u, where) : lit(this.#value(u, where));
  }

  /** This method reads a term in an envelope. */
  #envelope(u: Envelope, where: string): Expr {
    const at = into(where, "value");
    const [head, ...rest] = this.#type(u, where);
    if (rest.length > 0 && (head === "ops" || head === "ext")) {
      const name = this.#name(rest, into(where, "type"));
      return head === "ops" ? app(name, ...this.#list(u.value, at).map((x, i) => this.term(x, into(at, i)))) : ext(name, u.value);
    }
    if (rest.length > 0) return bad(where, `the type "${typeName(u.type)}" is not a term of Vex`);
    switch (head) {
      case "lit":
        return lit(this.#value(u.value, at));
      case "ref":
        return this.#ref(u.value, at);
      case "let": {
        const f = fields(u.value, at, ["bind", "body"]);
        return let_(this.#names(f["bind"], into(at, "bind")), this.term(f["body"], into(at, "body")));
      }
      case "fn": {
        const f = fields(u.value, at, ["params", "body"]);
        const params = this.#list(f["params"], into(at, "params"));
        if (!params.every((p) => typeof p === "string")) return bad(into(at, "params"), "a parameter is not a text");
        return fn(params, this.term(f["body"], into(at, "body")));
      }
      case "call": {
        const f = fields(u.value, at, ["fn", "args"]);
        const name = this.#function(f["fn"], into(at, "fn"));
        return call(name, ...this.#list(f["args"], into(at, "args")).map((x, i) => this.term(x, into(into(at, "args"), i))));
      }
      case "record":
        return rec(this.#names(u.value, at));
      case "each": {
        const f = fields(u.value, at, ["axis", "body"], ["at"]);
        return each(this.#axis(f["axis"], into(at, "axis")), this.term(f["body"], into(at, "body")), this.#address(f["at"], into(at, "at")));
      }
      case "fold": {
        const f = fields(u.value, at, ["axis", "init", "step", "result"], ["at"]);
        const axis = this.#axis(f["axis"], into(at, "axis"));
        const init = this.#names(f["init"], into(at, "init"));
        const step = this.#names(f["step"], into(at, "step"));
        return fold(axis, init, step, this.term(f["result"], into(at, "result")), this.#address(f["at"], into(at, "at")));
      }
      case "iterate": {
        const f = fields(u.value, at, ["limit", "init", "step", "result"], ["until"]);
        const init = this.#names(f["init"], into(at, "init"));
        const step = this.#names(f["step"], into(at, "step"));
        const until = f["until"] === undefined ? undefined : this.term(f["until"], into(at, "until"));
        // The limit is a number of the IR. The check of the expression tells a bad limit (ITERATE.LIMIT).
        return iterate(f["limit"] as number, init, step, this.term(f["result"], into(at, "result")), until);
      }
      default:
        // A construct of a newer version of Vex, or of another language.
        return bad(where, `the type "${typeName(u.type)}" is not a term of Vex`);
    }
  }

  /** This method gives the keys of the type of an envelope. An envelope of a term has no header (DOC.TERM). */
  #type(u: Envelope, where: string): readonly [string | number, ...(string | number)[]] {
    if (u.name !== undefined || u.own !== undefined) return bad(where, "a term of Vex has no name and no own entries");
    const keys = typePath(u.type);
    if (keys === undefined) return bad(into(where, "type"), "the type has a computed step");
    // A type is a text, or a list with one key or more, so its path has a first key.
    return keys as readonly [string | number, ...(string | number)[]];
  }

  /** This method gives the name of an op or an extension: its keys, joined with dots (DOC.OPS, DOC.EXT). */
  #name(keys: readonly (string | number)[], where: string): string {
    return keys.every((k) => typeof k === "string") ? keys.join(".") : bad(where, "a key of the name is not a text");
  }

  /** This method gives the value of a literal from its JSON form (DOC.LITERAL). */
  #value(u: unknown, where: string): unknown {
    const r = decodeValue(u, this.#domains);
    return r.ok ? r.value : bad(where, r.error.message);
  }

  /** This method reads a list. */
  #list(u: unknown, where: string): readonly unknown[] {
    return Array.isArray(u) ? (u as readonly unknown[]) : bad(where, "the value is not a list");
  }

  /** This method reads a record of names and the term of each name. */
  #names(u: unknown, where: string): Names {
    if (!isRecord(u)) return bad(where, "the value is not a record");
    return Object.fromEntries(Object.entries(u).map(([name, x]) => [name, this.term(x, into(where, name))]));
  }

  /** This method reads a reference: the fields of `self` after its moves, or a name of `names` (DOC.REF). */
  #ref(u: unknown, where: string): Expr {
    const [root, ...steps] = this.#list(u, where);
    if (root === "names") return steps.length === 1 && typeof steps[0] === "string" ? v(steps[0]) : bad(where, "a reference to a name has one step: the name");
    if (root !== "self") return bad(into(where, 0), `Vex reads only from the roots "self" and "names", and this reference starts at ${JSON.stringify(root) ?? "nothing"}`);
    const moves: Move[] = [];
    const names: string[] = [];
    steps.forEach((step, i) => {
      const at = into(where, i + 1);
      if (typeof step === "string") names.push(step);
      else if (!isDocument(step)) bad(at, "a step is not a text and not a move");
      else if (names.length > 0) bad(at, "a move comes after a field. Vex reads the fields at the end of the path");
      else moves.push(this.#move(step, at));
    });
    return ref(names, moves);
  }

  /** This method reads the function of a call: a reference to a name (DOC.CALL). */
  #function(u: unknown, where: string): string {
    const e = isDocument(u) ? this.#envelope(u, where) : undefined;
    return e?.tag === "var" ? e.name : bad(where, 'the function of a call is a reference to a name: { "type": "ref", "value": ["names", name] }');
  }

  /** This method reads the field `at` of `each` and `fold`: a reference from `self` with moves only (DOC.ADDRESS). */
  #address(u: unknown, where: string): Addr | undefined {
    if (u === undefined) return undefined;
    const e = isDocument(u) ? this.#envelope(u, where) : undefined;
    return e?.tag === "ref" && e.path.length === 0 ? (e.at ?? []) : bad(where, 'the address is a reference from "self" with moves only: { "type": "ref", "value": ["self", ...moves] }');
  }

  /** This method reads a move (DOC.MOVE). A fixed key is a text, a fixed position is a number, and an envelope is a term. */
  #move(u: Envelope, where: string): Move {
    const [head, kind, ...rest] = this.#type(u, where);
    const at = into(where, "value");
    if (head !== "moves" || typeof kind !== "string" || rest.length > 0) return bad(where, `Vex has no step of the type "${typeName(u.type)}"`);
    const value = u.value;
    switch (kind) {
      case "key":
        return typeof value === "string" ? key(value) : isDocument(value) ? key(this.#envelope(value, at)) : bad(at, "the key is not a text or a term in an envelope");
      case "index":
        return typeof value === "number" ? index(value) : isDocument(value) ? index(this.#envelope(value, at)) : bad(at, "the position is not a number or a term in an envelope");
      case "offset":
        return Array.isArray(value) && value.every((d) => typeof d === "number") ? offset(...(value as readonly number[])) : bad(at, "the offset is not a list of numbers");
      default: {
        const plain = PLAIN_MOVES.get(kind);
        if (plain === undefined) return bad(where, `Vex has no move "${kind}"`);
        return value === null ? plain : bad(at, `the value of the move "${kind}" is not null`);
      }
    }
  }

  /** This method reads an axis (DOC.AXIS). The check of the expression tells a bad parameter. */
  #axis(u: unknown, where: string): Axis {
    if (!isDocument(u)) return bad(where, "the axis is not an envelope");
    const [head, name, ...rest] = this.#type(u, where);
    if (head !== "axes" || typeof name !== "string" || rest.length > 0) return bad(where, `the type "${typeName(u.type)}" is not an axis`);
    const at = into(where, "value");
    switch (name) {
      case "neighbors":
        return { t: name, n: fields(u.value, at, ["n"])["n"] as 4 | 8 };
      case "window": {
        const f = fields(u.value, at, ["from", "to"]);
        return { t: name, from: f["from"] as number, to: f["to"] as number };
      }
      case "table":
        return { t: name, name: fields(u.value, at, ["name"])["name"] as string };
      case "list":
        return { t: name, list: this.term(fields(u.value, at, ["list"])["list"], into(at, "list")) };
      case "reverse":
        return { t: name, axis: this.#axis(fields(u.value, at, ["axis"])["axis"], into(at, "axis")) };
      case "where": {
        const f = fields(u.value, at, ["axis", "test"]);
        return { t: name, axis: this.#axis(f["axis"], into(at, "axis")), test: this.term(f["test"], into(at, "test")) };
      }
      default:
        if (!PLAIN_AXES.has(name)) return bad(where, `Vex has no axis "${name}"`);
        fields(u.value, at, []);
        return { t: name } as Axis;
    }
  }
}

/**
 * This function reads the value of a construct: a record with each necessary field, and no field outside the necessary
 * and the optional fields. Thus a wrong name of a field gives an error, and the round trip keeps each field.
 */
function fields(u: unknown, where: string, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (!isRecord(u)) return bad(where, "the value is not a record");
  for (const name of required) if (!Object.hasOwn(u, name)) bad(where, `the value has no field "${name}"`);
  for (const name of Object.keys(u)) if (!required.includes(name) && !optional.includes(name)) bad(into(where, name), `the field "${name}" is not a field of this term`);
  return u;
}

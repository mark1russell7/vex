/**
 * The documents of Vex. A document is the form of an expression in coeval, the kernel of the family. Each term is an
 * envelope `{ type, value }`, and a reference is a path from a root. The rules are decision D12 of coeval:
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
 * | `each` | `{ "type": "each", "value": { "axis", "as"?, "body", "at"? } }` |
 * | `fold` | `{ "type": "fold", "value": { "axis", "as"?, "init", "step", "result", "at"? } }` |
 * | `iterate` | `{ "type": "iterate", "value": { "limit", "init", "step", "until"?, "result" } }` |
 * | `ext` | `{ "type": ["ext", ...keys], "value": data }` |
 * | a move | `{ "type": ["moves", kind], "value": v }` |
 * | an axis | `{ "type": ["axes", name], "value": { ...parameters } }` |
 *
 * The address `at` of `each` and `fold` is a reference from `self` with moves only. An empty address is no address.
 * The field `as` of `each` and `fold` names the item of a loop over the axis `list`, and then its index (AXIS.LIST.SCOPE).
 *
 * The kernel checks a document by the contracts of `VEX_WORLD` (DOC.CHECK). A contract gives the shape of a kind, the
 * data of its fields and the kinds of each position. Then `fromDocument` reads the expression. It checks only the grammar
 * of Vex: the steps of a reference, the address, the function of a call and the names of a loop. It also checks the
 * names of the items.
 */
import { check, isEnvelope, typeName, typePath, type Envelope, type Issue, type Key, type Machine } from "@mark1russell7/coeval";
import { decodeValue } from "./codec.ts";
import type { AnyDomain } from "./domain.ts";
import { isStackOverflow, vexError, type VexError } from "./errors.ts";
import { app, call, each, ext, fn, fold, index, iterate, key, let_, lit, offset, origin, other, parent, rec, ref, shapeError, v, type Addr, type Axis, type Expr, type ItemNames, type Move, type Names } from "./ir.ts";
import { MAX_DOCUMENT_DEPTH, TERM_KINDS, vexChecker } from "./kernel.ts";
import { fail, ok, type Result } from "./result.ts";
import { itemNamesError } from "./item-names.ts";
import { WriteStop, writeDocument, type WriteOptions } from "./write.ts";

export type { Envelope, Json } from "@mark1russell7/coeval";

/** The stop of a reading. The functions of this module throw it, and the top of the reading gives its error. */
class Stop {
  readonly error: VexError;

  constructor(error: VexError) {
    this.error = error;
  }
}

/** This function gives the location of a child: a JSON Pointer, with the escapes of RFC 6901. */
const into = (where: string, step: Key): string => `${where}/${String(step).replaceAll("~", "~0").replaceAll("/", "~1")}`;

/** This function gives the JSON Pointer of a path of keys. */
const pointer = (keys: readonly Key[]): string => keys.reduce<string>(into, "");

/** This function gives the message of a document that is not valid at `where`. */
const notValid = (where: string, reason: string): string => `the document is not valid at ${where === "" ? "its root" : `"${where}"`}: ${reason}`;

/** This function stops the reading of a document that is not valid at `where`. */
function bad(where: string, reason: string): never {
  throw new Stop(vexError("bad-expression", notValid(where, reason)));
}

/** This function does a conversion. It gives its value, or the error of the conversion. It does not throw. */
function attempt<T>(work: () => T, threw: string, deep: string): Result<T> {
  try {
    return ok(work());
  } catch (thrown) {
    if (thrown instanceof Stop || thrown instanceof WriteStop) return fail(thrown.error);
    if (isStackOverflow(thrown)) return fail(vexError("depth", deep, { thrown }));
    return fail(vexError("threw", threw, { thrown }));
  }
}

/**
 * This function tells if a value is a document: an envelope `{ type, value }`. A node of the tagged IR is not an
 * envelope, because it has the key `tag`. Thus `compile` and `evaluate` can take either one (DOC.ENTRY).
 */
export function isDocument(u: unknown): u is Envelope {
  return isEnvelope(u);
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
  const options: WriteOptions = {
    domains,
    literals: "json",
    // Stryker disable next-line StringLiteral: the writer tests only the order "reads", and each other order is the order of DOC.CONSTRUCT
    order: "document",
  };
  // A getter of a literal value can throw, so the conversion is inside the attempt.
  return attempt(() => writeDocument(e, options), "the expression has no document", "a literal value is too deep for the call stack of the engine");
}

// The machine of the checks: the contracts of Vex, and the names of its evaluators and walkers, without their code.
let checker: Machine | undefined;

/** This function gives the first problem of a document that the kernel finds by the contracts of Vex (DOC.CHECK). */
function problemOf(doc: unknown): Issue | undefined {
  checker ??= vexChecker();
  // A bare value at the root is a literal. The names of a let, a function, a loop and the caller are free names.
  return check(checker, doc, { declaredType: "lit", names: "any" })[0];
}

/**
 * This function reads an expression from a document (DOC.TERM). It is the inverse of `toDocument`. The kernel checks
 * the document first (DOC.CHECK). A document that is not valid gives `#VALUE!` with its location, and a document nested
 * deeper than the kernel takes gives `#DEPTH!` (DOC.ERROR). The expression of a valid document is valid (EVAL.SHAPE).
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain decodes no value
export function fromDocument(doc: unknown, domains: readonly AnyDomain[] = []): Result<Expr> {
  const problem = attempt(() => problemOf(doc), "the check of the document threw an exception", "the document is too deep for the call stack of the engine");
  if (!problem.ok) return problem;
  const issue = problem.value;
  if (issue?.code === "#DEPTH!") return fail(vexError("depth", `the document is nested deeper than ${String(MAX_DOCUMENT_DEPTH)} documents`));
  // Stryker disable next-line ArrayDeclaration: the check of coeval gives each issue the keys of its value
  if (issue !== undefined) return fail(vexError("bad-expression", notValid(pointer(issue.at ?? []), issue.reason)));
  return attempt(() => new Reader(domains).term(doc, ""), "a decoder of a domain threw an exception", "the document is too deep for the call stack of the engine");
}

/** The kinds of the terms, as the first key of their type. */
const TERMS: ReadonlySet<string> = /* @__PURE__ */ new Set(/* @__PURE__ */ TERM_KINDS.map((k) => k[0] as string));

/**
 * The reader of documents. The kernel checked the document, so each kind has the shape of its contract. The reader
 * checks the grammar of Vex, and its methods throw a `Stop` at the first part that is not valid.
 */
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
    const keys = this.#type(u, where);
    const head = String(keys[0]);
    // The contracts permit only the kinds of the terms in the position of a term. The root has no position. The check gave
    // the type a kind of the world, so the first key tells if the type is a term.
    if (!TERMS.has(head)) return bad(where, `the type "${typeName(u.type)}" is not a term of Vex`);
    if (head === "ops" || head === "ext") {
      const name = this.#name(keys.slice(1), into(where, "type"));
      return head === "ops" ? app(name, ...(u.value as readonly unknown[]).map((x, i) => this.term(x, into(at, i)))) : ext(name, u.value);
    }
    const f = u.value as Readonly<Record<string, unknown>>;
    switch (head) {
      case "lit":
        return lit(this.#value(u.value, at));
      case "ref":
        return this.#ref(u.value as readonly unknown[], at);
      case "let":
        return let_(this.#binds(f["bind"], into(at, "bind")), this.term(f["body"], into(at, "body")));
      case "call": {
        const name = this.#function(f["fn"] as Envelope, into(at, "fn"));
        return call(name, ...(f["args"] as readonly unknown[]).map((x, i) => this.term(x, into(into(at, "args"), i))));
      }
      case "record":
        return rec(this.#names(u.value, at));
      case "each": {
        const axis = this.#axis(f["axis"] as Envelope, into(at, "axis"));
        const as = this.#items(f, axis, at);
        return each(axis, this.term(f["body"], into(at, "body")), this.#address(f["at"], into(at, "at")), as);
      }
      case "fold": {
        const [init, step] = this.#loop(f, at);
        const axis = this.#axis(f["axis"] as Envelope, into(at, "axis"));
        const as = this.#items(f, axis, at);
        return fold(axis, init, step, this.term(f["result"], into(at, "result")), this.#address(f["at"], into(at, "at")), as);
      }
      default: {
        // iterate: the contract gives a whole number from 0 to MAX_ITERATIONS for the limit (ITERATE.LIMIT).
        const [init, step] = this.#loop(f, at);
        const until = f["until"] === undefined ? undefined : this.term(f["until"], into(at, "until"));
        return iterate(f["limit"] as number, init, step, this.term(f["result"], into(at, "result")), until);
      }
    }
  }

  /** This method gives the keys of the type of an envelope. A term of Vex has no header (DOC.TERM). */
  #type(u: Envelope, where: string): readonly Key[] {
    if (u.name !== undefined || u.own !== undefined) return bad(where, "a term of Vex has no name and no own entries");
    // The check found the kind of the type, so the type has no computed step.
    return typePath(u.type) as readonly Key[];
  }

  /** This method gives the name of an op or an extension: its keys, joined with dots (DOC.OPS, DOC.EXT). */
  #name(keys: readonly Key[], where: string): string {
    return keys.every((k) => typeof k === "string") ? keys.join(".") : bad(where, "a key of the name is not a text");
  }

  /** This method gives the value of a literal from its JSON form (DOC.LITERAL). */
  #value(u: unknown, where: string): unknown {
    const r = decodeValue(u, this.#domains);
    return r.ok ? r.value : bad(where, r.error.message);
  }

  /** This method reads a record of names and the term of each name. */
  #names(u: unknown, where: string): Names {
    return Object.fromEntries(Object.entries(u as Readonly<Record<string, unknown>>).map(([name, x]) => [name, this.term(x, into(where, name))]));
  }

  /** This method reads the bindings of a let. A binding can be a function (FN.BIND). */
  #binds(u: unknown, where: string): Names {
    return Object.fromEntries(
      Object.entries(u as Readonly<Record<string, unknown>>).map(([name, x]) => {
        const at = into(where, name);
        if (!isDocument(x) || typeName(x.type) !== "fn") return [name, this.term(x, at)];
        this.#type(x, at);
        const f = x.value as { readonly params: readonly string[]; readonly body: unknown };
        return [name, fn(f.params, this.term(f.body, into(into(at, "value"), "body")))];
      }),
    );
  }

  /** This method reads the names of a loop. Each name of `step` is a name of `init` (LOOP.NAMES). */
  #loop(f: Readonly<Record<string, unknown>>, at: string): readonly [Names, Names] {
    const init = this.#names(f["init"], into(at, "init"));
    const step = this.#names(f["step"], into(at, "step"));
    const extra = Object.keys(step).find((name) => !Object.hasOwn(init, name));
    return extra === undefined ? [init, step] : bad(into(into(at, "step"), extra), `the name "${extra}" of step is not a name of init`);
  }

  /**
   * This method reads the names `as` of a loop (AXIS.LIST.SCOPE). The contract gives a list of distinct texts. The
   * grammar of Vex needs one or two names, the axis `list` and no name of `init`.
   */
  #items(f: Readonly<Record<string, unknown>>, axis: Axis, at: string): ItemNames | undefined {
    const reason = itemNamesError({ as: f["as"], axis, init: f["init"] });
    return reason === undefined ? (f["as"] as ItemNames | undefined) : bad(into(at, "as"), reason);
  }

  /** This method reads a reference: the fields of `self` after its moves, or a name of `names` (DOC.REF). */
  #ref(path: readonly unknown[], where: string): Expr {
    const [root, ...steps] = path;
    // The check gives each reference a root that Vex reads: "self" or "names".
    if (root === "names") return steps.length === 1 && typeof steps[0] === "string" ? v(steps[0]) : bad(where, "a reference to a name has one step: the name");
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
  #function(u: Envelope, where: string): string {
    const steps = u.value as readonly unknown[];
    return steps[0] === "names" && steps.length === 2 && typeof steps[1] === "string" ? steps[1] : bad(where, 'the function of a call is a reference to a name: { "type": "ref", "value": ["names", name] }');
  }

  /** This method reads the field `at` of `each` and `fold`: a reference from `self` with moves only (DOC.ADDRESS). */
  #address(u: unknown, where: string): Addr | undefined {
    if (u === undefined) return undefined;
    const e = this.#envelope(u as Envelope, where);
    return e.tag === "ref" && e.path.length === 0 ? (e.at ?? []) : bad(where, 'the address is a reference from "self" with moves only: { "type": "ref", "value": ["self", ...moves] }');
  }

  /**
   * This method reads a move (DOC.MOVE). The value of `key` and `index` is a term: a text key and a number position are
   * fixed, and another term is computed. The check gave the other moves their values.
   */
  #move(u: Envelope, where: string): Move {
    const kind = String(this.#type(u, where)[1]);
    const at = into(where, "value");
    const value = u.value;
    switch (kind) {
      case "key":
        return typeof value === "string" ? key(value) : key(this.term(value, at));
      case "index":
        return typeof value === "number" ? index(value) : index(this.term(value, at));
      case "offset":
        return offset(...(value as readonly number[]));
      case "other":
        return other;
      case "origin":
        return origin;
      default:
        return parent;
    }
  }

  /** This method reads an axis (DOC.AXIS). The check gave it the parameters of its kind. */
  #axis(u: Envelope, where: string): Axis {
    const name = String(this.#type(u, where)[1]);
    const at = into(where, "value");
    const f = u.value as Readonly<Record<string, unknown>>;
    switch (name) {
      case "list":
        return { t: name, list: this.term(f["list"], into(at, "list")) };
      case "reverse":
        return { t: name, axis: this.#axis(f["axis"] as Envelope, into(at, "axis")) };
      case "where":
        return { t: name, axis: this.#axis(f["axis"] as Envelope, into(at, "axis")), test: this.term(f["test"], into(at, "test")) };
      default:
        return { t: name, ...f } as Axis;
    }
  }
}

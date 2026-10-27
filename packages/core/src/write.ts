/**
 * The writer of the documents of Vex: the coeval document of an expression (DOC.TERM). It uses a stack, not recursion,
 * so an expression of any depth has a document. The package index does not export this module: `toDocument`, `deps`
 * and `kernelPlan` use it.
 */
import { isEnvelope, ref as path, typed, type Envelope, type Json, type JsonRecord } from "@mark1russell7/coeval";
import { encodeValue } from "./codec.ts";
import type { AnyDomain } from "./domain.ts";
import type { VexError } from "./errors.ts";
import type { Axis, Expr, Move } from "./ir.ts";

/** The options of the writer. */
export interface WriteOptions {
  /** The domains that encode the values of the literals. */
  readonly domains: readonly AnyDomain[];
  /**
   * The form of a literal without a JSON form. `"json"` stops the writer with its error. `"host"` keeps the value of the
   * host in a literal with the own entry `vex.host`, for an evaluation in the kernel.
   */
  readonly literals: "json" | "host";
  /**
   * The order of the fields of `each` and `fold`. `"document"` is the order of DOC.CONSTRUCT. `"reads"` puts the body or
   * the steps before the axis, in the order of the reads of `deps`.
   */
  readonly order: "document" | "reads";
  /** A map that gets the expression of each envelope of a reference, an axis loop and a call. */
  readonly nodes?: Map<object, Expr>;
}

/** The stop of a write: a literal without a JSON form. The caller gives its error. */
export class WriteStop {
  readonly error: VexError;

  constructor(error: VexError) {
    this.error = error;
  }
}

/** A job of the writer: an expression in the position of a term or of an envelope, an axis or a move. */
type Job = { readonly t: "term" | "envelope"; readonly e: Expr } | { readonly t: "axis"; readonly a: Axis } | { readonly t: "move"; readonly m: Move };

/** The plan of a job: the jobs of its parts, and the function that makes its document from their documents. */
interface Plan {
  readonly jobs: readonly Job[];
  readonly make: (docs: readonly Json[]) => Json;
}

const NONE: readonly Job[] = [];
// Stryker disable next-line StringLiteral: the writer tests only the kind "envelope", so each other kind is the kind "term"
const term = (e: Expr): Job => ({ t: "term", e });
const envelope = (e: Expr): Job => ({ t: "envelope", e });

/** This function gives the field `as` of a loop: a new list of its names, or no field (AXIS.LIST.SCOPE). */
const itemsOf = (as: readonly string[] | undefined): { readonly as?: Json } => (as === undefined ? {} : { as: [...as] });

/** This function gives a record from names and the documents of their values, from an index of the documents. */
function namesOf(names: readonly string[], docs: readonly Json[], from: number): JsonRecord {
  const out: Record<string, Json> = {};
  names.forEach((name, i) => {
    Object.defineProperty(out, name, { value: docs[from + i], enumerable: true, writable: true, configurable: true });
  });
  return out;
}

/** The writer of one document. */
class Writer {
  readonly #opts: WriteOptions;

  constructor(opts: WriteOptions) {
    this.#opts = opts;
  }

  /** This method writes the document of a job, with a stack of plans. */
  write(root: Job): Json {
    const stack: { readonly plan: Plan; readonly docs: Json[] }[] = [{ plan: this.#plan(root), docs: [] }];
    for (;;) {
      const top = stack[stack.length - 1] as (typeof stack)[number];
      const next = top.plan.jobs[top.docs.length];
      if (next !== undefined) {
        stack.push({ plan: this.#plan(next), docs: [] });
        continue;
      }
      const doc = top.plan.make(top.docs);
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent === undefined) return doc;
      parent.docs.push(doc);
    }
  }

  /** This method keeps the expression of an envelope, for `deps`. */
  #keep<T extends Json>(doc: T, e: Expr): T {
    this.#opts.nodes?.set(doc as object, e);
    return doc;
  }

  /** This method gives the document of a literal: its JSON form, or a value of the host (DOC.LITERAL). */
  #literal(value: unknown, root: boolean): Json {
    const host: Json = { type: "lit", value: value as Json, own: { eval: "vex.host" } };
    let r: ReturnType<typeof encodeValue>;
    try {
      r = encodeValue(value, this.#opts.domains);
    } catch (thrown) {
      // A getter of the value threw. In the mode "host", the literal keeps the value of the host.
      if (this.#opts.literals === "json") throw thrown;
      return host;
    }
    if (!r.ok) {
      if (this.#opts.literals === "json") throw new WriteStop(r.error);
      return host;
    }
    const json = r.value as Json;
    // In the position of a term, a literal is its JSON value, except a value with the shape of an envelope (DOC.TERM).
    return root || isEnvelope(json) ? typed("lit", json) : json;
  }

  #plan(job: Job): Plan {
    if (job.t === "axis") return this.#axis(job.a);
    if (job.t === "move") return this.#move(job.m);
    const e = job.e;
    if (e.tag === "lit") return { jobs: NONE, make: () => this.#literal(e.value, job.t === "envelope") };
    return this.#envelope(e);
  }

  #envelope(e: Exclude<Expr, { readonly tag: "lit" }>): Plan {
    const reads = this.#opts.order === "reads";
    switch (e.tag) {
      case "ref":
        return { jobs: (e.at ?? []).map((m): Job => ({ t: "move", m })), make: (docs) => this.#keep(path("self", ...docs, ...e.path), e) };
      case "var":
        return { jobs: NONE, make: () => path("names", e.name) };
      case "app":
        return { jobs: e.args.map(term), make: (docs) => typed(["ops", ...e.op.split(".")], [...docs]) };
      case "let": {
        const names = Object.keys(e.bind);
        return { jobs: [...Object.values(e.bind).map(term), term(e.body)], make: (docs) => typed("let", { bind: namesOf(names, docs, 0), body: docs[names.length] as Json }) };
      }
      case "fn":
        return { jobs: [term(e.body)], make: (docs) => typed("fn", { params: [...e.params], body: docs[0] as Json }) };
      case "call":
        return { jobs: e.args.map(term), make: (docs) => this.#keep(typed("call", { fn: path("names", e.fn), args: [...docs] }), e) };
      case "rec": {
        const names = Object.keys(e.fields);
        return { jobs: Object.values(e.fields).map(term), make: (docs) => typed("record", namesOf(names, docs, 0)) };
      }
      case "each": {
        const at = this.#at(e.at);
        return {
          jobs: [{ t: "axis", a: e.axis }, term(e.body), ...at.jobs],
          make: (docs) => {
            const axis = docs[0] as Json;
            const body = docs[1] as Json;
            const address = at.make(docs.slice(2));
            const as = itemsOf(e.as);
            return this.#keep(typed("each", reads ? { body, axis, ...as, ...address } : { axis, ...as, body, ...address }), e);
          },
        };
      }
      case "fold": {
        const init = Object.keys(e.init);
        const step = Object.keys(e.step);
        const at = this.#at(e.at);
        const after = 1 + init.length + step.length;
        return {
          jobs: [{ t: "axis", a: e.axis }, ...Object.values(e.init).map(term), ...Object.values(e.step).map(term), term(e.result), ...at.jobs],
          make: (docs) => {
            const axis = docs[0] as Json;
            const names = { init: namesOf(init, docs, 1), step: namesOf(step, docs, 1 + init.length) };
            const result = docs[after] as Json;
            const address = at.make(docs.slice(after + 1));
            const as = itemsOf(e.as);
            return this.#keep(typed("fold", reads ? { ...names, axis, ...as, ...address, result } : { axis, ...as, ...names, result, ...address }), e);
          },
        };
      }
      case "iterate": {
        const init = Object.keys(e.init);
        const step = Object.keys(e.step);
        const until = e.until === undefined ? NONE : [term(e.until)];
        const after = init.length + step.length;
        return {
          jobs: [...Object.values(e.init).map(term), ...Object.values(e.step).map(term), ...until, term(e.result)],
          make: (docs) =>
            typed("iterate", {
              limit: e.limit,
              init: namesOf(init, docs, 0),
              step: namesOf(step, docs, init.length),
              ...(e.until === undefined ? {} : { until: docs[after] as Json }),
              result: docs[after + until.length] as Json,
            }),
        };
      }
      case "ext":
        return { jobs: NONE, make: () => typed(["ext", ...e.kind.split(".")], e.data as Json) };
    }
  }

  /** This method gives the plan of the field `at` of `each` and `fold`: a reference from `self` with moves only (DOC.ADDRESS). */
  #at(at: readonly Move[] | undefined): { readonly jobs: readonly Job[]; readonly make: (docs: readonly Json[]) => { readonly at?: Envelope } } {
    // Stryker disable next-line ArrowFunction: a spread of no value adds no fields, as a spread of an empty record does
    if (at === undefined || at.length === 0) return { jobs: NONE, make: () => ({}) };
    return { jobs: at.map((m): Job => ({ t: "move", m })), make: (docs) => ({ at: path("self", ...docs) }) };
  }

  /** This method gives the plan of a move. A computed key or position is an envelope (DOC.MOVE). */
  #move(m: Move): Plan {
    switch (m.t) {
      case "key":
        return typeof m.key === "string" ? this.#fixed(["moves", "key"], m.key) : { jobs: [envelope(m.key)], make: (docs) => typed(["moves", "key"], docs[0] as Json) };
      case "index":
        return typeof m.i === "number" ? this.#fixed(["moves", "index"], m.i) : { jobs: [envelope(m.i)], make: (docs) => typed(["moves", "index"], docs[0] as Json) };
      case "offset":
        return this.#fixed(["moves", "offset"], [...m.d]);
      case "other":
      case "origin":
      case "parent":
        return this.#fixed(["moves", m.t], null);
    }
  }

  #fixed(type: readonly string[], value: Json): Plan {
    return { jobs: NONE, make: () => typed(type, value) };
  }

  /** This method gives the plan of an axis (DOC.AXIS). */
  #axis(a: Axis): Plan {
    const type = ["axes", a.t];
    switch (a.t) {
      case "neighbors":
        return this.#fixed(type, { n: a.n });
      case "window":
        return this.#fixed(type, { from: a.from, to: a.to });
      case "table":
        return this.#fixed(type, { name: a.name });
      case "list":
        return { jobs: [term(a.list)], make: (docs) => typed(type, { list: docs[0] as Json }) };
      case "reverse":
        return { jobs: [{ t: "axis", a: a.axis }], make: (docs) => typed(type, { axis: docs[0] as Json }) };
      case "where":
        return { jobs: [{ t: "axis", a: a.axis }, term(a.test)], make: (docs) => typed(type, { axis: docs[0] as Json, test: docs[1] as Json }) };
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
        return this.#fixed(type, {});
    }
  }
}

/**
 * This function writes the document of a valid expression. The root is always an envelope. It throws a `WriteStop` for
 * a literal without a JSON form in the mode `"json"`, and an exception of a getter of a literal value.
 */
export function writeDocument(e: Expr, opts: WriteOptions): Envelope {
  return new Writer(opts).write({ t: "envelope", e }) as Envelope;
}

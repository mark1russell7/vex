/**
 * Vex in the kernel of coeval (decision D13 of coeval, and decision D13 of Vex in `docs/REVIEW.md`). This module gives
 * the contracts of the kinds of Vex as data, and a machine of the kernel that evaluates the documents of Vex.
 *
 * - The static kit of the kernel checks a document by these contracts (`fromDocument`, DOC.ERROR) and finds its
 *   references (`deps`, DEPS.READS).
 * - The machine is the reference tier of Vex. The closure compiler and the loop compiler give its results
 *   (EVAL.REFERENCE). It evaluates the shared constructs with the formula kit of the kernel, and a profile gives the
 *   rules of Vex. Vex adds only what is its own: the moves, the axes, the loops and the dispatch on the domains.
 */
import {
  type Context,
  type Definitions,
  type EvalError,
  type EvalFn,
  type Failed,
  type ExtFn,
  type FormulaProfile,
  type HostThing,
  type Key,
  type Kind,
  type LazyOp,
  type Machine,
  type PartShape,
  type Part,
  type Result as Outcome,
  type Walker,
  type World,
  Failure,
  Held,
  STD_EXT,
  THING,
  formulaDefinitions,
  formulaEvaluators,
  ok,
} from "@mark1russell7/coeval";
import { decodeValue } from "./codec.ts";
import type { AnyDomain } from "./domain.ts";
import { vexError, type ErrorCode, type ErrorDetails, type ErrorKind, type VexError } from "./errors.ts";
import type { CompileOptions } from "./evaluate.ts";
import { MAX_ITERATIONS, type Axis, type FixedMove } from "./ir.ts";
import { isVexList, LIST_OPS, vexList, type ListItem } from "./list.ts";
import { fail as vexFail, ok as vexOk, type Result } from "./result.ts";
import { isVexError } from "./same.ts";
import { applyMove, axisTargets, type Space } from "./space.ts";

// ---------------------------------------------------------------- the contracts

/** The kinds of the terms of Vex. A part in the position of a term has one of these kinds (DOC.TERM). */
export const TERM_KINDS: readonly (readonly string[])[] = [["lit"], ["ref"], ["record"], ["let"], ["call"], ["each"], ["fold"], ["iterate"], ["ops"], ["ext"]];

/** A term: an envelope of a term kind, or a bare value, which is a literal. */
const TERM: PartShape = { shape: "term", of: "lit", kinds: TERM_KINDS };
const TERMS: PartShape = { shape: "list", item: TERM };
const NAMES: PartShape = { shape: "map", item: TERM };
const AXIS: PartShape = { shape: "term", kinds: [["axes"]] };
/** The address of `each` and `fold`: a reference that gives a key of the space, not a value (DOC.ADDRESS). */
const ADDRESS: PartShape = { shape: "term", kinds: [["ref"]], address: true };
const NO_VALUE: PartShape = { shape: "one", values: [null] };

/** This function gives the shape of a record with these fields and no other fields (DOC.CONSTRUCT). */
const closed = (fields: Readonly<Record<string, PartShape>>, required: readonly string[]): PartShape => ({ shape: "record", fields, required, closed: true });

/** The axes without parameters. */
const PLAIN_AXES = ["all", "others", "other", "children", "ancestors", "descendants", "siblings", "successors", "predecessors", "reachable"] as const;

/** This function gives the kind of an axis with these parameters (DOC.AXIS). */
const axisKind = (fields: Readonly<Record<string, PartShape>>): Kind => ({ verbs: { eval: "vex.axis" }, parts: closed(fields, Object.keys(fields)), summary: "An axis of Vex: the targets of a body." });

/** This function gives the kind of a move. Its document is a step of a path, and a computed key is its part (DOC.MOVE). */
const move = (walker: string, parts: PartShape): Kind => ({ verbs: { eval: "formula.step", step: walker }, parts, summary: "A move of Vex: a step to another key of the space." });

/** The scope of a loop: the names of `init`, for the steps, the test `until` and the result (LOOP.NAMES). */
const LOOP_SCOPE = [{ names: { keysAt: ["init"] }, in: [["step", "*"], ["until"], ["result"]] }] as const;

/**
 * This function gives the world of Vex. The module uses it one time, and the annotation `__PURE__` lets a bundler
 * remove the world from a program that does not use it.
 */
function worldOfVex(): World {
  /** A binding of a `let`: a term, or a function (FN.BIND). */
  const BIND: PartShape = { shape: "term", of: "lit", kinds: [...TERM_KINDS, ["fn"]] };
  /** The axes that `reverse` can hold: each axis but `where`, `reverse` and `table` (AXIS.REVERSE). */
  const BASE_AXES: readonly string[] = [...PLAIN_AXES, "neighbors", "window", "list"];
  return {
    kinds: {
      lit: { verbs: { eval: "vex.lit" }, summary: "A literal: its value in the JSON form of IR.JSON." },
      ref: { verbs: { eval: "formula.ref" }, parts: { shape: "deep" }, summary: "A reference: the fields of self after its moves, or a name." },
      record: { verbs: { eval: "formula.record" }, parts: NAMES, summary: "A record of the values of its fields." },
      let: {
        verbs: { eval: "formula.let" },
        parts: closed({ bind: { shape: "map", item: BIND }, body: TERM }, ["bind", "body"]),
        scope: [{ names: { keysAt: ["bind"] }, in: [["body"]] }],
        summary: "Names for the body. A binding does not see the other bindings.",
      },
      fn: {
        verbs: { eval: "vex.fn" },
        parts: closed({ params: { shape: "list", item: { shape: "text" }, distinct: true }, body: TERM }, ["params", "body"]),
        scope: [{ names: { listAt: ["params"] }, in: [["body"]] }],
        summary: "A function of a let. Its body evaluates at the position of each call.",
      },
      call: { verbs: { eval: "vex.call" }, parts: closed({ fn: { shape: "term", kinds: [["ref"]] }, args: TERMS }, ["fn", "args"]), summary: "A call of a function of a let." },
      each: { verbs: { eval: "vex.each" }, parts: closed({ axis: AXIS, body: TERM, at: ADDRESS }, ["axis", "body"]), summary: "The body at each target of an axis: a list." },
      fold: {
        verbs: { eval: "vex.fold" },
        parts: closed({ axis: AXIS, init: NAMES, step: NAMES, result: TERM, at: ADDRESS }, ["axis", "init", "step", "result"]),
        scope: LOOP_SCOPE,
        summary: "A step at each target of an axis, in order, and a result.",
      },
      iterate: {
        verbs: { eval: "vex.iterate" },
        parts: closed({ limit: { shape: "number", whole: true, min: 0, max: MAX_ITERATIONS }, init: NAMES, step: NAMES, until: TERM, result: TERM }, ["limit", "init", "step", "result"]),
        scope: LOOP_SCOPE,
        summary: "Up to limit steps, until a test is true, and a result.",
      },
      ops: { kinds: {}, fallback: { verbs: { eval: "formula.op" }, parts: TERMS, summary: "An op, applied to the values of its arguments." } },
      ext: { kinds: {}, fallback: { verbs: { eval: "formula.ext" }, summary: "An extension: its handler gives the value of its data." } },
      axes: {
        kinds: {
          ...Object.fromEntries(PLAIN_AXES.map((name) => [name, axisKind({})])),
          neighbors: axisKind({ n: { shape: "one", values: [4, 8] } }),
          window: axisKind({ from: { shape: "number" }, to: { shape: "number" } }),
          table: axisKind({ name: { shape: "text" } }),
          list: axisKind({ list: TERM }),
          reverse: axisKind({ axis: { shape: "term", kinds: BASE_AXES.map((name) => ["axes", name]) } }),
          where: axisKind({ axis: AXIS, test: TERM }),
        },
      },
      moves: {
        kinds: {
          key: move("vex.move.key", TERM),
          index: move("vex.move.index", TERM),
          offset: move("vex.move.offset", { shape: "list", item: { shape: "number" } }),
          other: move("vex.move.other", NO_VALUE),
          origin: move("vex.move.origin", NO_VALUE),
          parent: move("vex.move.parent", NO_VALUE),
        },
      },
    },
    defaults: {},
  };
}

/**
 * The world of Vex: the contract of each kind of a document of Vex, as data. A contract gives the shape of the parts,
 * the data of the fields and the names that the kind binds. The static kit of the kernel reads it.
 */
export const VEX_WORLD: World = /* @__PURE__ */ worldOfVex();

/** The deepest nesting of documents that the machine takes. A deeper document gives `#DEPTH!` (DOC.ERROR). */
export const MAX_DOCUMENT_DEPTH = 4096;

// ---------------------------------------------------------------- errors

/** The kind of a Vex error for each code of the kernel. Another code is a document that is not valid. */
const KIND_OF: Readonly<Partial<Record<string, ErrorKind>>> = {
  "#REF!": "unknown-key",
  "#N/A": "missing-field",
  "#VALUE!": "kind-mismatch",
  "#NAME?": "unbound",
  "#NUM!": "not-finite",
  "#CALC!": "threw",
  "#ARGS": "args",
  "#CYCLE!": "cycle",
  "#DEPTH!": "depth",
};

/** This function gives the error of the kernel for a Vex error. The Vex error is its cause, so no detail is lost. */
export const toKernelError = (e: VexError): EvalError => ({ code: e.code, reason: e.message, cause: e });

/** This function gives the Vex error of an error of the kernel. A code that Vex does not have gives `#VALUE!`. */
export function toVexError(e: EvalError): VexError {
  if (isVexError(e.cause)) return e.cause;
  return vexError(KIND_OF[e.code] ?? "bad-expression", e.reason, e.cause === undefined ? {} : { thrown: e.cause });
}

/** This function gives the Vex result of a result of the kernel. */
export const toVexResult = (r: Outcome): Result<unknown> => (r.ok ? vexOk(r.value) : vexFail(toVexError(r.error)));

/** This function makes an error of the kernel from a kind of Vex error. */
const kernelError = (kind: ErrorKind, message: string, details: ErrorDetails = {}): EvalError => toKernelError(vexError(kind, message, details));

/** This function makes a failed result of the kernel. */
const failed = (kind: ErrorKind, message: string): Failed => ({ ok: false, error: kernelError(kind, message) });

/** This function stops host code with an error of the kernel. The kernel catches the `Failure` and gives its error. */
const stop = (kind: ErrorKind, message: string): never => {
  throw new Failure(kernelError(kind, message));
};

/** This function tells if an error is `#DEPTH!`. Some rules do not hide it (EVAL.DEPTH). */
const isDepth = (e: EvalError): boolean => e.code === ("#DEPTH!" satisfies ErrorCode);

// ---------------------------------------------------------------- the position

/** The segments that are not fields (REF.FORBIDDEN). */
const FORBIDDEN: ReadonlySet<string> = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);

/**
 * A position of an evaluation, as a host thing of the kernel: the space, the tables, the origin and the focus. It is the
 * root `self` of the context. A move gives a new position, and a field step reads the record at the focus. A move that
 * fails gives a position with the failure. The failure is the result when a reader uses the position, so the checks of
 * the computed keys come first (NAV.COMPUTED).
 */
class Place implements HostThing {
  // The constructor sets the brand. A computed field of the class makes a bundler keep the class in each program.
  declare readonly [THING]: true;
  readonly space: Space;
  readonly tables: Readonly<Record<string, Space>>;
  readonly origin: string;
  readonly focus: string;
  readonly failure: EvalError | undefined;

  constructor(space: Space, tables: Readonly<Record<string, Space>>, origin: string, focus: string, failure?: EvalError) {
    (this as { [THING]: true })[THING] = true;
    this.space = space;
    this.tables = tables;
    this.origin = origin;
    this.focus = focus;
    this.failure = failure;
  }

  /** The text of the position for a trace. */
  get label(): string {
    return `key ${this.focus}`;
  }

  /** This method gives the position of a key of the same space, with the same origin. */
  to(focus: string): Place {
    return new Place(this.space, this.tables, this.origin, focus);
  }

  /** This method gives the position with a failure, for a move that failed. */
  failed(failure: EvalError): Place {
    return new Place(this.space, this.tables, this.origin, this.focus, failure);
  }

  /** This method reads one field of the record at the focus. */
  deref(key: Key): unknown {
    return this.resolve([key])?.thing;
  }

  /**
   * This method reads the fields of a path in the record at the focus (REF.PATH). A missing field, `null` and a segment
   * that is not a field reach nothing, and the kernel gives `#N/A` (REF.MISSING, REF.FORBIDDEN). A getter that throws
   * gives `#CALC!`, because the kernel catches the exception.
   */
  resolve(keys: readonly Key[]): { readonly thing: unknown } | undefined {
    if (this.failure !== undefined) throw new Failure(this.failure);
    let value: unknown = this.space.get(this.focus);
    if (value === undefined || value === null) return undefined;
    for (const key of keys) {
      const seg = String(key);
      if ((typeof value !== "object" && typeof value !== "function") || seg === "" || FORBIDDEN.has(seg)) return undefined;
      value = Reflect.get(value, seg);
      if (value === undefined || value === null) return undefined;
    }
    return { thing: value };
  }

  /** This method gives the record at the focus: the value of a reference without fields. */
  toJson(): unknown {
    if (this.failure !== undefined) throw new Failure(this.failure);
    const record = this.space.get(this.focus);
    return record === undefined || record === null ? stop("missing-field", `the record at "${this.focus}" has no value`) : record;
  }
}

/**
 * This function gives the root `self` of an evaluation in the kernel. It is the position at the origin of a space,
 * with the tables of the axis table (AXIS.TABLE).
 */
export function vexSelf(space: Space, origin: string, tables: Readonly<Record<string, Space>> = {}): HostThing {
  return new Place(space, tables, origin, origin);
}

/**
 * This function gives the walker of a kind of move. `fix` gives the fixed move of the value of the step, or the reason
 * why the value is not valid, which gives `#VALUE!` (NAV.COMPUTED).
 */
function moveWalker(fix: (data: unknown) => FixedMove | string): Walker {
  return ({ data, here }) => {
    if (!(here instanceof Place)) return { ok: false, reason: "a move starts at a key of a space", code: "#REF!" };
    const fixed = fix(data);
    if (typeof fixed === "string") return { ok: false, reason: fixed, code: "#VALUE!" };
    // A move after a failed move keeps the first failure, as the address of the closure compiler does (NAV.SEQUENCE).
    if (here.failure !== undefined) return { ok: true, thing: here };
    const r = applyMove(here.space, here, fixed);
    return { ok: true, thing: r.ok ? here.to(r.value) : here.failed(toKernelError(r.error)) };
  };
}

/** The walkers of the moves of Vex. */
const WALKERS: Readonly<Record<string, Walker>> = {
  "vex.move.key": /* @__PURE__ */ moveWalker((d) => (typeof d === "string" ? { t: "key", key: d } : `the key of a move is a ${typeof d}, not a text`)),
  "vex.move.index": /* @__PURE__ */ moveWalker((d) => (typeof d === "number" ? { t: "index", i: d } : `the position of a move is a ${typeof d}, not a number`)),
  "vex.move.offset": /* @__PURE__ */ moveWalker((d) => ({ t: "offset", d: d as readonly number[] })),
  "vex.move.other": /* @__PURE__ */ moveWalker(() => ({ t: "other" })),
  "vex.move.origin": /* @__PURE__ */ moveWalker(() => ({ t: "origin" })),
  "vex.move.parent": /* @__PURE__ */ moveWalker(() => ({ t: "parent" })),
};

// ---------------------------------------------------------------- the axes and the loops

/*
 * The evaluators of Vex are functions of their input, not compilers. Thus a plan of the kernel and the reference
 * interpreter of the kernel use the same code for them, and the reference needs a definition only for the formula kit
 * (`vexDefinitions`).
 */

/** A target of an axis: its key, or its key and an error (AXIS.WHERE, AXIS.LIST). */
interface Target {
  readonly key: string;
  readonly error?: VexError;
}

/** The value of an axis document: the targets from a position. `table` names the table of the axis table. */
interface Targets {
  readonly table: string | undefined;
  targets(from: Place): Outcome<readonly Target[]>;
}

/** This function gives the position of a target. In the space of the axis table, the origin is the target (AXIS.TABLE). */
const placeOf = (axis: Targets, from: Place, key: string): Place => (axis.table === undefined ? from.to(key) : new Place(from.space, from.tables, key, key));

/** This function gives the parts of a record value, by name. */
const partsOf = (value: unknown): Readonly<Record<string, Part | undefined>> => (value ?? {}) as Readonly<Record<string, Part | undefined>>;

/** This function gives the part of a field that the contract makes necessary. */
const partAt = (value: unknown, name: string): Part => partsOf(value)[name] as Part;

/** This function gives the position of a context. A context without a position gives an error. */
function selfOf(ctx: Context): Place | EvalError {
  return ctx.self instanceof Place ? ctx.self : kernelError("unknown-key", "the context has no key of a space");
}

/** This function gives the position where an axis finds its targets: the key of the address, or the focus (AXIS.ADDRESS). */
function startOf(at: Part | undefined, ctx: Context): Place | EvalError {
  if (at === undefined) return selfOf(ctx);
  const r = at.evaluate();
  if (!r.ok) return r.error;
  const where = r.value as Place;
  return where.failure ?? where;
}

/** This function gives the position in the space of the axis: the space of its table for the axis table (AXIS.TABLE). */
function spaceOf(axis: Targets, from: Place): Place | EvalError {
  if (axis.table === undefined) return from;
  const space = Object.hasOwn(from.tables, axis.table) ? from.tables[axis.table] : undefined;
  return space === undefined ? kernelError("no-table", `the evaluation has no table "${axis.table}"`) : new Place(space, from.tables, from.origin, from.focus);
}

/**
 * This function is the evaluator of the axes. An axis document gives a value that finds the targets from a position.
 * The list of `list` evaluates at that position, and the test of `where` at each target (AXIS.LIST, AXIS.WHERE).
 */
const axisEvaluator: EvalFn = ({ typePath, value, context }) => {
  const name = String(typePath[1]);
  const fields = partsOf(value);
  if (name === "table") {
    const table = (value as { readonly name: string }).name;
    return ok<Targets>({ table, targets: (from) => ok(from.space.keys.map((key) => ({ key }))) });
  }
  if (name === "list") {
    const list = fields["list"] as Part;
    return ok<Targets>({
      table: undefined,
      targets: (from) => {
        const r = list.evaluate({ ...context, self: from });
        if (!r.ok) return r;
        if (!isVexList(r.value)) return failed("kind-mismatch", `the axis "list" needs a list, not a ${describe(r.value)}`);
        return ok(r.value.items.map(({ key, result }) => (result.ok ? { key } : { key, error: result.error })));
      },
    });
  }
  if (name === "reverse" || name === "where") {
    const r = (fields["axis"] as Part).evaluate();
    // Stryker disable next-line ConditionalExpression: an axis document fails only when the call stack of the engine is full
    if (!r.ok) return r;
    const base = r.value as Targets;
    const test = fields["test"];
    if (test === undefined) {
      return ok<Targets>({
        table: base.table,
        targets: (from) => {
          const ts = base.targets(from);
          return ts.ok ? ok(ts.value.toReversed()) : ts;
        },
      });
    }
    return ok<Targets>({ table: base.table, targets: (from) => whereTargets(base, test, context, from) });
  }
  const ir = { t: name, ...(value as object) } as Exclude<Axis, { readonly t: "where" }>;
  return ok<Targets>({
    table: undefined,
    targets: (from) => {
      const keys = axisTargets(from.space, from, ir);
      return keys.ok ? ok(keys.value.map((key) => ({ key }))) : { ok: false, error: toKernelError(keys.error) };
    },
  });
};

/** This function keeps the targets where the test gives `true`. A failed test, or a value that is not a boolean, gives an error item. */
function whereTargets(base: Targets, test: Part, ctx: Context, from: Place): Outcome<readonly Target[]> {
  const ts = base.targets(from);
  if (!ts.ok) return ts;
  const out: Target[] = [];
  for (const t of ts.value) {
    if (t.error !== undefined) {
      out.push(t);
      continue;
    }
    const r = test.evaluate({ ...ctx, self: placeOf(base, from, t.key) });
    if (!r.ok) out.push({ key: t.key, error: toVexError(r.error) });
    else if (r.value === true) out.push({ key: t.key });
    else if (r.value !== false) out.push({ key: t.key, error: vexError("kind-mismatch", `the test of "where" gave a ${typeof r.value}, not a boolean`) });
  }
  return ok(out);
}

/** This function finds the targets of the axis of a loop, from the address or the focus, in the space of the axis. */
function targetsOf(value: unknown, ctx: Context): Outcome<{ readonly axis: Targets; readonly from: Place; readonly targets: readonly Target[] }> {
  const start = startOf(partsOf(value)["at"], ctx);
  if (!(start instanceof Place)) return { ok: false, error: start };
  const a = partAt(value, "axis").evaluate();
  // Stryker disable next-line ConditionalExpression: an axis document fails only when the call stack of the engine is full
  if (!a.ok) return a;
  const axis = a.value as Targets;
  const from = spaceOf(axis, start);
  if (!(from instanceof Place)) return { ok: false, error: from };
  const ts = axis.targets(from);
  return ts.ok ? ok({ axis, from, targets: ts.value }) : ts;
}

/**
 * This function sets a name of a new record of names, also a name such as `__proto__`. The record is new and gets each
 * name one time, so the property needs no other attributes. A later record copies it with a spread, so it is enumerable.
 */
function setName(names: Record<string, unknown>, name: string, value: unknown): void {
  Object.defineProperty(names, name, { value, enumerable: true });
}

/**
 * This function evaluates the parts of a record of names in order (LOOP.NAMES). It gives the names with their new
 * values, or the first error. Each value reads the names before the step, so the names change only after all values.
 */
function bindAll(record: Part | undefined, ctx: Context, names: Readonly<Record<string, unknown>>): Outcome<Readonly<Record<string, unknown>>> {
  const values: [string, unknown][] = [];
  for (const [name, part] of Object.entries(partsOf(record))) {
    const r = (part as Part).evaluate(ctx);
    if (!r.ok) return r;
    values.push([name, r.value]);
  }
  const out: Record<string, unknown> = { ...names };
  for (const [name, v] of values) setName(out, name, v);
  return ok(out);
}

/** The evaluators of the loops: each, fold and iterate (LOOP.NAMES, FOLD.ORDER, ITERATE.LIMIT). */
const LOOPS: Readonly<Record<string, EvalFn>> = {
  "vex.each": ({ value, context }) => {
    const found = targetsOf(value, context);
    if (!found.ok) return found;
    const { axis, from, targets } = found.value;
    const body = partAt(value, "body");
    const items: ListItem[] = targets.map(({ key, error }) => ({ key, result: error === undefined ? toVexResult(body.evaluate({ ...context, self: placeOf(axis, from, key) })) : vexFail(error) }));
    return ok(vexList(items));
  },

  "vex.fold": ({ value, context }) => {
    const { init, step } = partsOf(value);
    // The first values come at the node, before the address and the targets (FOLD.ORDER).
    const first = bindAll(init, context, context.names);
    if (!first.ok) return first;
    let names = first.value;
    const found = targetsOf(value, context);
    if (!found.ok) return found;
    const { axis, from, targets } = found.value;
    for (const { key, error } of targets) {
      if (error !== undefined) return { ok: false, error: toKernelError(error) };
      const next = bindAll(step, { ...context, self: placeOf(axis, from, key), names }, names);
      if (!next.ok) return next;
      names = next.value;
    }
    return partAt(value, "result").evaluate({ ...context, names });
  },

  "vex.iterate": ({ value, context }) => {
    const { init, step, until } = partsOf(value);
    const limit = (value as { readonly limit: number }).limit;
    const first = bindAll(init, context, context.names);
    if (!first.ok) return first;
    let names = first.value;
    for (let k = 0; ; k++) {
      const here: Context = { ...context, names };
      if (until !== undefined) {
        const t = until.evaluate(here);
        if (!t.ok) return t;
        if (t.value === true) break;
        if (t.value !== false) return failed("kind-mismatch", `the test "until" of "iterate" gave a ${typeof t.value}, not a boolean`);
      }
      if (k === limit) {
        if (until !== undefined) return failed("limit", `"iterate" made its ${String(limit)} steps, and its test "until" is not true`);
        break;
      }
      const next = bindAll(step, here, names);
      if (!next.ok) return next;
      names = next.value;
    }
    return partAt(value, "result").evaluate({ ...context, names });
  },
};

// ---------------------------------------------------------------- functions

/**
 * A function of a `let` (FN.BIND). A reference to its name is an error, because a function is not a value (FN.VALUE).
 * It keeps the names of the place of its binding, and its body evaluates at the position of each call (FN.CALL).
 */
class Bound extends Held {
  readonly params: readonly string[];
  readonly body: Part;
  readonly names: Readonly<Record<string, unknown>>;

  constructor(params: readonly string[], body: Part, names: Readonly<Record<string, unknown>>) {
    super(kernelError("kind-mismatch", "the name is a function, not a value"));
    this.params = params;
    this.body = body;
    this.names = names;
  }
}

/** The evaluators of the functions of Vex (FN.BIND, FN.CALL, FN.ARGS). */
const FUNCTIONS: Readonly<Record<string, EvalFn>> = {
  "vex.fn": ({ value, context }) => ok(new Bound((value as { readonly params: readonly string[] }).params, partAt(value, "body"), context.names)),

  "vex.call": ({ doc, value, context }) => {
    // The contract and fromDocument make the function a reference to a name: ["names", name] (DOC.CALL).
    const name = String((doc.value as { readonly fn: { readonly value: readonly unknown[] } }).fn.value[1]);
    const args = partsOf(value)["args"] as unknown as readonly Part[];
    if (!Object.hasOwn(context.names, name)) return failed("unbound", `the function "${name}" has no binding`);
    const bound = context.names[name];
    if (!(bound instanceof Bound)) return bound instanceof Held ? { ok: false, error: bound.error } : failed("kind-mismatch", `the name "${name}" is a value, not a function`);
    if (bound.params.length !== args.length) return failed("bad-expression", `the function "${name}" takes ${String(bound.params.length)} arguments, not ${String(args.length)}`);
    // Each parameter gets the result of its argument at the call. An error has an effect only where the body reads it.
    const names: Record<string, unknown> = { ...bound.names };
    bound.params.forEach((p, i) => {
      const r = (args[i] as Part).evaluate();
      setName(names, p, r.ok ? r.value : new Held(r.error));
    });
    return bound.body.evaluate({ ...context, names });
  },
};

// ---------------------------------------------------------------- ops

/** This function gives a short name for the type of a value, for a message. */
function describe(u: unknown): string {
  if (u === null) return "null";
  if (Array.isArray(u)) return "array";
  if (isVexList(u)) return "list";
  return typeof u;
}

/** This function applies the test of a domain to a value. A test that throws rejects the value. */
function accepts(d: AnyDomain, x: unknown): boolean {
  let accepted = false;
  try {
    accepted = d.is(x);
  } catch {
    // The value stays rejected.
  }
  return accepted;
}

/** This function finds an own method of a receiver or of its prototypes, but not of `Object` or `Function` (CALL.METHOD). */
function methodOf(self: unknown, name: string): ((...a: unknown[]) => unknown) | undefined {
  // The loop stops at null, so a null receiver gives undefined too.
  if (FORBIDDEN.has(name) || (typeof self !== "object" && typeof self !== "function")) return undefined;
  for (let o: object | null = self; o !== null && o !== Object.prototype && o !== Function.prototype; o = Object.getPrototypeOf(o) as object | null) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d !== undefined) return typeof d.value === "function" ? (d.value as (...a: unknown[]) => unknown) : undefined;
  }
  return undefined;
}

/** This function checks the value of an op (CALL.RESULT): a value, a finite number, and a valid value of its domain. */
function checked(x: unknown, op: string, domains: readonly AnyDomain[]): unknown {
  if (x === undefined || x === null) return stop("undefined-result", `"${op}" gave no value`);
  if (typeof x === "number" && !Number.isFinite(x)) return stop("not-finite", `"${op}" gave ${String(x)}`);
  const d = domains.find((dom) => accepts(dom, x));
  if (d?.valid !== undefined && !d.valid(x)) return stop("invalid-value", `"${op}" gave a value that is not a valid ${d.name}`);
  return x;
}

/** The op of a domain for a receiver: its spec, and the method of the receiver for an op without `fn`. */
interface Found {
  readonly domain: AnyDomain;
  readonly spec: { readonly fn?: (...a: unknown[]) => unknown; readonly liftScalar?: boolean | readonly boolean[]; readonly params?: readonly string[] } | undefined;
  readonly method: ((...a: unknown[]) => unknown) | undefined;
}

/** This function finds the op of a domain for a receiver, or `undefined` (CALL.UNKNOWN-OP). */
function opOf(d: AnyDomain, self: unknown, op: string): Found | undefined {
  const spec = Object.hasOwn(d.ops, op) && !FORBIDDEN.has(op) ? (d.ops[op] as Found["spec"]) : undefined;
  const method = spec?.fn === undefined && (spec !== undefined || d.methods === "all") ? methodOf(self, op) : undefined;
  return spec?.fn === undefined && method === undefined ? undefined : { domain: d, spec, method };
}

/** This function applies the op of a domain: it lifts the numbers, checks the kinds of the arguments and checks the value. */
function callFound(found: Found, op: string, self: unknown, args: readonly unknown[], domains: readonly AnyDomain[]): unknown {
  const { domain, spec } = found;
  const lift = spec?.liftScalar;
  const from = domain.fromScalar;
  const rest = from === undefined ? args : args.map((a, i): unknown => (typeof a === "number" && (lift === true || (Array.isArray(lift) && lift[i] === true)) ? from(a) : a));
  const params = spec?.params;
  if (params !== undefined) {
    rest.forEach((a, i) => {
      const k = params[i] ?? "any";
      if (k !== "any" && !(k === "domain" ? accepts(domain, a) : typeof a === k)) {
        stop(k === "domain" ? "not-instance" : "kind-mismatch", `argument ${String(i + 1)} of "${op}" is a ${describe(a)}, not a ${k === "domain" ? domain.name : k}`);
      }
    });
  }
  const out = spec?.fn !== undefined ? spec.fn(self, ...rest) : (found.method as (...a: unknown[]) => unknown).call(self, ...rest);
  return checked(out, op, domains);
}

/** The list ops with a second argument before their options: a count, a position, an op name or a list. */
const WITH_ARGUMENT: ReadonlySet<string> = /* @__PURE__ */ new Set(["reduce", "take", "nth", "drop", "append", "without"]);

/**
 * This function gives the items of a list that have a value (LIST.LENIENT). A list op does not skip `#DEPTH!`, so that
 * error comes first (EVAL.DEPTH). With `strict`, the first error item is the result.
 */
function goodOf(items: readonly ListItem[], strict: boolean): readonly ListItem[] {
  const depth = items.find((it) => !it.result.ok && it.result.error.code === "#DEPTH!");
  if (depth !== undefined && !depth.result.ok) throw new Failure(toKernelError(depth.result.error));
  const firstBad = items.find((it) => !it.result.ok);
  if (strict && firstBad !== undefined && !firstBad.result.ok) throw new Failure(toKernelError(firstBad.result.error));
  return items.filter((it) => it.result.ok);
}

/** This function gives the items of the list `other` of `append` and `without` (LIST.BUILD). Another value gives `#VALUE!`. */
function otherOf(op: string, other: unknown, strict: boolean): readonly ListItem[] {
  return isVexList(other) ? goodOf(other.items, strict) : stop("kind-mismatch", `"${op}" needs a list as its second argument, not a ${describe(other)}`);
}

/** This function joins the lists that are the values of the items, in order (LIST.FLAT). Each list follows LIST.BUILD. */
function flat(vs: readonly unknown[], strict: boolean): unknown {
  const out: ListItem[] = [];
  for (const inner of vs) {
    if (!isVexList(inner)) return stop("kind-mismatch", `"flat" needs a list as the value of each item, but an item is a ${describe(inner)}`);
    out.push(...goodOf(inner.items, strict));
  }
  return vexList(out);
}

/** This function applies a list op (LIST.*). The error items are skipped, except with `{ strict: true }`, and except `#DEPTH!`. */
function listOp(op: string, items: readonly ListItem[], rest: readonly unknown[], domains: readonly AnyDomain[]): unknown {
  const o = WITH_ARGUMENT.has(op) ? rest[1] : rest[0];
  const strict = (o as { strict?: unknown } | null | undefined)?.strict === true;
  const good = goodOf(items, strict);
  const vs = good.map((it) => (it.result.ok ? it.result.value : undefined));
  const nums = (): readonly number[] => (vs.every((x) => typeof x === "number") ? vs : stop("kind-mismatch", `"${op}" needs numbers`));
  const bools = (): readonly boolean[] => (vs.every((x) => typeof x === "boolean") ? vs : stop("kind-mismatch", `"${op}" needs booleans`));
  const empty = (): never => stop("empty", `"${op}" has no values to work with`);
  switch (op) {
    case "count":
      return vs.length;
    case "values":
      return Object.freeze([...vs]);
    case "keys":
      return Object.freeze(good.map((it) => it.key));
    case "errors":
      return Object.freeze(items.flatMap((it) => (it.result.ok ? [] : [it.result.error])));
    case "first":
      return vs.length > 0 ? vs[0] : empty();
    case "sortBy": {
      const kind = typeof vs[0];
      if (vs.some((x) => typeof x !== kind || (kind !== "number" && kind !== "string") || Number.isNaN(x))) stop("kind-mismatch", '"sortBy" needs numbers without NaN or texts, all of one kind');
      return vexList(good.map((it, i) => ({ it, i })).toSorted((a, b) => compare(vs[a.i], vs[b.i])).map(({ it }) => it));
    }
    case "take":
    case "drop":
    case "nth": {
      const n = rest[0] as number;
      if (!Number.isSafeInteger(n) || n < 0) return stop("kind-mismatch", `"${op}" needs a whole number from 0`);
      if (op === "take") return vexList(good.slice(0, n));
      if (op === "drop") return vexList(good.slice(n));
      return n < vs.length ? vs[n] : stop("empty", `"nth" has no item at the position ${String(n)}`);
    }
    case "append":
      return vexList([...good, ...otherOf(op, rest[0], strict)]);
    case "without": {
      const gone = new Set(otherOf(op, rest[0], strict).map((it) => it.key));
      return vexList(good.filter((it) => !gone.has(it.key)));
    }
    case "flat":
      return flat(vs, strict);
    case "sum":
      // Stryker disable next-line ArrayDeclaration: a sum needs no domain, and a text in the list accepts no value
      return checked(nums().reduce((s, x) => s + x, 0), op, []);
    case "mean": {
      const n = nums();
      // Stryker disable next-line ArrayDeclaration: a mean needs no domain, and a text in the list accepts no value
      return n.length === 0 ? empty() : checked(n.reduce((s, x) => s + x, 0) / n.length, op, []);
    }
    case "min":
    case "max": {
      const n = nums();
      return n.length === 0 ? empty() : n.reduce((best, x) => (op === "min" ? Math.min(best, x) : Math.max(best, x)));
    }
    case "any":
      return bools().some(Boolean);
    case "all":
      return bools().every(Boolean);
    case "none":
      return !bools().some(Boolean);
    default:
      return reduce(rest[0], vs, o, domains);
  }
}

/** This function compares two numbers or two texts for `sortBy`. Equal values keep their order (LIST.SORT). */
const compare = (a: unknown, b: unknown): number => ((a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0);

/** This function folds the values of a list with a domain op, from the left (LIST.REDUCE, LIST.REDUCE.EMPTY). */
function reduce(name: unknown, vs: readonly unknown[], o: unknown, domains: readonly AnyDomain[]): unknown {
  if (typeof name !== "string") return stop("kind-mismatch", '"reduce" needs an op name');
  if (vs.length === 0) {
    const named = (o as { domain?: unknown } | null | undefined)?.domain;
    if (named !== undefined && !domains.some((d) => d.name === named)) return stop("unknown-op", `"reduce" names the domain ${JSON.stringify(named) ?? "?"}, but the program has no such domain`);
    const ds = domains.filter((d) => Object.hasOwn(d.ops, name) && (d.ops[name] as { identity?: unknown }).identity !== undefined && (named === undefined || d.name === named));
    const only = ds.length === 1 ? (ds[0]?.ops[name] as { identity: () => unknown }) : undefined;
    return only === undefined ? stop("empty", `"reduce" with "${name}" has no values, and no one identity`) : only.identity();
  }
  let acc: unknown = vs[0];
  for (const x of vs.slice(1)) {
    const found = domains.filter((d) => accepts(d, acc)).map((d) => opOf(d, acc, name)).find((f) => f !== undefined);
    if (found === undefined) return stop("unknown-op", `no domain gives "${name}" for a ${describe(acc)}`);
    acc = callFound(found, name, acc, [x], domains);
  }
  return acc;
}

/**
 * This function gives the op of a name: the dispatch of Vex at run time. A list op applies to a list. Else the first
 * domain that accepts the receiver and has the op applies it. Else a free function applies (CALL.FREE).
 */
function dispatch(op: string, domains: readonly AnyDomain[], fns: Readonly<Record<string, (...a: readonly unknown[]) => unknown>>): (...values: unknown[]) => unknown {
  const free = Object.hasOwn(fns, op) ? fns[op] : undefined;
  const listed = LIST_OPS.has(op);
  return (...values) => {
    const self = values[0];
    if (listed && isVexList(self)) return listOp(op, self.items, values.slice(1), domains);
    let accepted = false;
    if (values.length > 0) {
      for (const d of domains) {
        if (!accepts(d, self)) continue;
        accepted = true;
        const found = opOf(d, self, op);
        if (found !== undefined) return callFound(found, op, self, values.slice(1), domains);
      }
    }
    if (free !== undefined) return checked(free(...values), op, domains);
    if (accepted || values.length === 0) return stop("unknown-op", accepted ? `the domain of the receiver has no op "${op}"` : `there is no function "${op}"`);
    return stop("not-instance", `no domain accepts the receiver of "${op}" (${describe(self)})`);
  };
}

/** This function gives an argument of a special form. A missing argument gives `#VALUE!`. */
const argOf = (args: readonly (() => Outcome)[], i: number, op: string): Outcome => args[i]?.() ?? failed("bad-expression", `"${op}" needs argument ${String(i + 1)}`);

/** This function gives an argument of a special form that must be a boolean (FORM.IF, FORM.AND-OR). */
function boolOf(args: readonly (() => Outcome)[], i: number, op: string): Outcome {
  const r = argOf(args, i, op);
  return !r.ok || typeof r.value === "boolean" ? r : failed("kind-mismatch", `argument ${String(i + 1)} of "${op}" is a ${describe(r.value)}, not a boolean`);
}

/** This function gives `and` or `or`: they stop at the first argument that decides (FORM.AND-OR). */
const logic = (op: "and" | "or"): LazyOp => (args) => {
  if (args.length === 0) return failed("bad-expression", `"${op}" needs at least 1 argument`);
  for (let i = 0; i < args.length; i++) {
    const b = boolOf(args, i, op);
    if (!b.ok || b.value === (op === "or")) return b;
  }
  return ok(op === "and");
};

/** The special forms of Vex: lazy ops of the formula kit (FORM.IF, FORM.AND-OR, FORM.IFERROR). */
const FORMS: Readonly<Record<string, LazyOp>> = {
  if: (args) => {
    const c = boolOf(args, 0, "if");
    return c.ok ? argOf(args, c.value === true ? 1 : 2, "if") : c;
  },
  and: /* @__PURE__ */ logic("and"),
  or: /* @__PURE__ */ logic("or"),
  // EVAL.DEPTH: ifError does not hide #DEPTH!, because the engine failed, not the data.
  ifError: (args) => {
    const first = argOf(args, 0, "ifError");
    return first.ok || isDepth(first.error) ? first : argOf(args, 1, "ifError");
  },
};

/**
 * This function gives the profile of Vex for the formula kit: the dispatch of the ops, the special forms and the
 * extensions. Two or more failed arguments or fields give `#ARGS` (CALL.ARGS, REC.FIELDS).
 */
function profileOf(opts: CompileOptions): FormulaProfile {
  // Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain matches no value
  const domains = opts.domains ?? [];
  const fns = opts.fns ?? {};
  const extensions = opts.extensions ?? {};
  // Vex has no standard extension: each extension kind needs its handler, so the standard names give #NAME? too.
  // A record without a prototype, so an extension kind such as `__proto__` is an own entry too.
  const ext = Object.create(null) as Record<string, ExtFn>;
  for (const name of Object.keys(STD_EXT)) ext[name] = () => failed("unknown-op", `no handler for the extension kind "${name}"`);
  for (const [name, handler] of Object.entries(extensions)) {
    ext[name] = (data, ctx) => {
      const self = selfOf(ctx);
      if (!(self instanceof Place)) return { ok: false, error: self };
      // The kernel does not know the path of a node in the tagged IR, so the path is empty.
      const r = handler(data, { space: self.space, position: { origin: self.origin, focus: self.focus }, path: [] });
      if (r.ok) return r;
      // An error without an origin gets the position of the extension (EVAL.LOCATION).
      return { ok: false, error: toKernelError(r.error.origin === undefined ? { ...r.error, origin: self.origin, focus: self.focus } : r.error) };
    };
  }
  return {
    ops: (name) => dispatch(name, domains, fns),
    lazy: FORMS,
    ext,
    // A #DEPTH! argument is the result: #ARGS does not wrap it (EVAL.DEPTH).
    combine: (errors) => errors.find(isDepth) ?? kernelError("args", `${String(errors.length)} arguments failed`, { causes: errors.map(toVexError) }),
  };
}

/** The evaluators of the literals: the JSON form of IR.JSON, and a value of the host (DOC.LITERAL). */
function literals(domains: readonly AnyDomain[]): Readonly<Record<string, EvalFn>> {
  return {
    // The kernel catches a decoder that throws, and gives #CALC! (CALL.THROW) or #DEPTH! (EVAL.DEPTH).
    "vex.lit": ({ doc }) => {
      const decoded = decodeValue(doc.value, domains);
      return decoded.ok ? ok(decoded.value) : { ok: false, error: toKernelError(decoded.error) };
    },
    // A literal of an expression without a JSON form: its document holds the value of the host, with this own entry.
    "vex.host": ({ doc }) => ok(doc.value),
  };
}

/**
 * The rules of the machines of Vex. The values of a space are data, so a field that has the shape of a reference stays
 * a value. A reference starts at `self` or `names`, and a document has a limit of nesting.
 */
const RULES = { plain: true, roots: ["self", "names"], maxDepth: MAX_DOCUMENT_DEPTH } as const;

/**
 * This function makes the machine of the kernel for Vex: the world of Vex, and the formula kit with the profile of
 * Vex. Vex adds its evaluators and its walkers. It is the reference tier of Vex (EVAL.REFERENCE).
 */
export function vexMachine(opts: CompileOptions = {}): Machine {
  // Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain matches no value
  return { world: VEX_WORLD, evaluators: { ...formulaEvaluators(profileOf(opts)), ...literals(opts.domains ?? []), ...LOOPS, ...FUNCTIONS, "vex.axis": axisEvaluator }, walkers: WALKERS, ...RULES };
}

/** The code of each evaluator and walker of the machine of the checks. A check uses only their names. */
const NO_CODE = (): never => stop("bad-expression", "the machine of the checks evaluates nothing");

/**
 * This function makes the machine of the checks (DOC.CHECK). It has the world of Vex, and the names of the evaluators
 * and the walkers of `vexMachine` without their code. The static kit of the kernel needs only the names. Thus a
 * program that only reads documents does not hold the evaluators.
 */
export function vexChecker(): Machine {
  const evaluators: Record<string, EvalFn> = {};
  const walkers: Record<string, Walker> = {};
  const todo: unknown[] = Object.values(VEX_WORLD.kinds);
  for (let x = todo.pop(); x !== undefined; x = todo.pop()) {
    const kind = x as { readonly verbs?: Readonly<Record<string, string>>; readonly kinds?: Readonly<Record<string, unknown>>; readonly fallback?: unknown };
    const { eval: name, step } = kind.verbs ?? {};
    if (name !== undefined) evaluators[name] = NO_CODE;
    if (step !== undefined) walkers[step] = NO_CODE;
    todo.push(...Object.values(kind.kinds ?? {}), ...(kind.fallback === undefined ? [] : [kind.fallback]));
  }
  return { world: VEX_WORLD, evaluators, walkers, ...RULES };
}

/**
 * This function gives the definitions of the machine of Vex for the reference interpreter of the kernel. The formula
 * kit gets its definitions with the profile of Vex. The evaluators of Vex are functions, so they need no definition.
 */
export function vexDefinitions(opts: CompileOptions = {}): Definitions {
  return formulaDefinitions(profileOf(opts));
}

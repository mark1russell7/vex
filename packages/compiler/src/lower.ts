/**
 * The lowering: a Vex expression becomes a program of the loop IR (docs/COMPILER.md §3.3). A list op over a direct
 * `each` becomes one loop with a running value, so it makes no list.
 *
 * Each value that the interpreter can give as an error has a check. The block of the check tells what a failure does
 * (`Fail`). A list op skips an error item, and an error in the first argument of `ifError` gives the second argument.
 * These contexts drop the error, so the check has no error site. In each other context, the check has the site of its
 * error, and the program ends with that error or a binding keeps it (`keeps`). Where the error has a use, a check without
 * a site stops the program with `FALLBACK`. `#DEPTH!` of an extension stops the program too (COMPILE.EXT).
 *
 * A check for a result that only tier 1 can give is no error, so no context drops it (`#decide`, V-071).
 *
 * After a failure, the interpreter still evaluates the later arguments of a node, and two errors give `#ARGS`. The value
 * path of generated code has no flags for this. A failure jumps to a copy of the later arguments (`#chain`), which only
 * the failure path reads. A copy uses flags, so the size of the code stays near the size of the program times its depth.
 */
import {
  addrExprs,
  axisExprs,
  children,
  errorText,
  isFieldName,
  joinKind,
  limitAxis,
  listOf,
  MAX_ITERATIONS,
  nestingError,
  shapeError,
  type Addr,
  type Axis,
  type ErrorText,
  type Expr,
  type ExprOf,
  type FixJoin,
  type Names,
  type PrimitiveKind,
} from "@mark1russell7/vex";
import { factsOf, isFusedOp, MAX_CALLS, primitiveOf, type Facts, type FusedOp, type Schema } from "./facts.ts";
import { memoNodes } from "./memo.ts";
import {
  array,
  bool,
  call,
  constant,
  FALLBACK_EXPR,
  FIXED_LOCALS,
  keeps,
  local,
  num,
  ORIGIN,
  plainOf,
  prim,
  RETURN,
  SPACE,
  STOP,
  TABLES,
  VARS,
  type ErrorSite,
  type Fail,
  type LExpr,
  type LoopProgram,
  type LStmt,
} from "./loop.ts";
import { placesRead, unshared } from "./unshared.ts";

/** The error of an expression that the compiler cannot lower. Then the program operates in tier 1. */
export class Unsupported extends Error {}

/**
 * A bound name: its value, and the flag that tells if its binding gave a value. Without a flag, it always does. After a
 * failure, `error` is the lazy error of the binding, if the context of the binding keeps it.
 */
interface Bound {
  readonly value: LExpr;
  readonly ok?: LExpr;
  readonly error?: LExpr;
}

/** A bound function: its node, the path of its node, and the scope of its binding. */
interface BoundFn {
  readonly fn: ExprOf<"fn">;
  readonly path: readonly number[];
  readonly scope: Scope;
}

/** The facts of the lexical position of a node: its space, its origin, its focus and its bound names. */
interface Scope {
  readonly space: LExpr;
  readonly origin: LExpr;
  readonly focus: LExpr;
  readonly env: ReadonlyMap<string, Bound>;
  /** The bound functions (FN.BIND): a call puts the body of its function at the place of the call. */
  readonly fns: ReadonlyMap<string, BoundFn>;
  /** The record at the focus. In a loop, it reads the record by its index (SPACE.RECORDS). */
  readonly rec: LExpr;
  /** The columns of the steps around the node (COMPILE.FIX): the last round of each name, and its join. */
  readonly columns: ReadonlyMap<string, FixColumn>;
  /** The index of the focus in the keys of the space, if the lowering knows it. A read of a column uses it. */
  readonly slot: LExpr | undefined;
}

/** A column in the step of its `fix`: the local of an array with the value of each row, and the join of the column. */
interface FixColumn {
  readonly local: LExpr;
  readonly join: FixJoin;
}

/** A list of statements, and what a failed check in it does. */
interface Block {
  readonly stmts: LStmt[];
  readonly fail: Fail;
}

const block = (fail: Fail): Block => ({ stmts: [], fail });

/**
 * The number of nodes that the failure paths of a program can copy. Past it, a node with two or more arguments that can
 * fail keeps no error, so tier 1 gives its result. Thus the size of the code has a limit.
 */
export const MAX_COPIED = 2000;

/**
 * The number of arguments of a node that `#chain` takes. Each argument that can fail adds a level of blocks, and the
 * printer and the JavaScript parser recurse over the levels. A node with more arguments keeps no error.
 */
export const MAX_CHAINED = 64;

/** This function gives the axis inside the `where` axes of an axis. */
const baseAxis = (a: Axis): Exclude<Axis, { readonly t: "where" }> => (a.t === "where" ? baseAxis(a.axis) : a);

/** This function gives the tests of the `where` axes of an axis, from the inside out, as the interpreter applies them. */
function whereTests(a: Axis): readonly Expr[] {
  const out: Expr[] = [];
  for (let x: Axis = a; x.t === "where"; x = x.axis) out.unshift(x.test);
  return out;
}

/** This function gives the number of children of an axis: its list, then the tests of `where`. */
const axisChildren = (a: Axis): number => whereTests(a).length + (listOf(a) === undefined ? 0 : 1);

/** This function gives the `each` under the `let` expressions of a list argument, or `undefined`. */
function eachUnderLets(e: Expr | undefined): ExprOf<"each"> | undefined {
  let x = e;
  while (x?.tag === "let") x = x.body;
  return x?.tag === "each" ? x : undefined;
}

/** The targets of a round of a column: each key of the space, with no address. */
const ROWS: Pick<ExprOf<"each">, "axis"> = { axis: { t: "all" } };

/** The primitive operation of each join (FIX.JOIN). The checks of a row give each join a value of its kind. */
const JOINS = { or: "||", and: "&&", max: "max", min: "min" } as const;

/** The kinds of the values of the primitive operations that always give a boolean. */
const BOOLEAN_PRIMS: ReadonlySet<string> = new Set(["!", "===", "!==", "isNumber", "isBoolean", "isString", "isValue", "isObject"]);

/** The checks of the kinds of a schema. */
const KIND_CHECKS = { number: "isNumber", string: "isString", boolean: "isBoolean" } as const;

/** This function gives the kind of two values in the branches of a form, if they have the same kind. */
const join = (a: PrimitiveKind | undefined, b: PrimitiveKind | undefined): PrimitiveKind | undefined => (a === b ? a : undefined);

/**
 * This function lowers an expression into a program of the loop IR. It throws `Unsupported` for an expression it cannot
 * lower. The facts of the options decide the op of a site whose values have known kinds (KIND.STATIC).
 */
export function lower(expr: Expr, facts: Facts = factsOf({}), schema: Schema = {}): LoopProgram {
  // COMPILE.PLACES: the walks below take the time of the places, so the count comes first.
  const places = placesRead([expr]);
  if (places.error !== undefined) throw new Unsupported(places.error);
  // EVAL.SHAPE and EVAL.NESTING: tier 1 gives the error of a program that is not valid or that is nested too deep.
  const shape = shapeError(expr);
  if (shape !== undefined) throw new Unsupported(shape);
  const deep = nestingError(expr);
  if (deep !== undefined) throw new Unsupported(deep);
  const plain = unshared(expr, places.shares);
  const l = new Lowerer(memoNodes(plain, isFusedOp), facts, schema);
  const b = block(RETURN);
  const top: Scope = { space: local(SPACE), origin: local(ORIGIN), focus: local(ORIGIN), env: new Map(), fns: new Map(), rec: prim("get", local(SPACE), local(ORIGIN)), columns: new Map(), slot: undefined };
  l.check(b, call("has", local(SPACE), local(ORIGIN)), "the origin is a key of the space", l.site(b, top, { t: "key" }));
  const value = l.expr(plain, top, [], b);
  b.stmts.push({ t: "return", value });
  return { body: b.stmts, locals: l.locals, constants: l.constants };
}

class Lowerer {
  locals = FIXED_LOCALS;
  labels = 0;
  memos = 0;
  /** The number of bodies of functions that the lowering put at calls (MAX_CALLS). A copy does not count. */
  #calls = 0;
  /** The depth of the copies of the failure paths around the lowering. Inside a copy, a node has no memo. */
  #copying = 0;
  /** The number of nodes that the copies have so far (MAX_COPIED). */
  #copied = 0;
  /** The answers of `#mayExt`, for each map of functions. */
  readonly #exts = new WeakMap<ReadonlyMap<string, BoundFn>, Map<Expr, boolean>>();
  readonly #memo: ReadonlyMap<Expr, readonly Expr[]>;
  /** The keys of the nodes of the memo whose code the lowering makes, with their values. */
  #keys: ReadonlyMap<Expr, Bound> = new Map();
  readonly #facts: Facts;
  readonly #schema: Schema;
  /** The kind of each local whose kind the lowering knows. A local gets its kind where it gets its value. */
  readonly #kinds = new Map<number, PrimitiveKind>();

  constructor(memo: ReadonlyMap<Expr, readonly Expr[]>, facts: Facts, schema: Schema) {
    this.#memo = memo;
    this.#facts = facts;
    this.#schema = schema;
  }

  /** This method gives the kind of a value, if the lowering knows it. */
  kindOf(x: LExpr): PrimitiveKind | undefined {
    if (x.t === "const") {
      const t = typeof this.constants[x.i];
      return t === "number" || t === "string" || t === "boolean" ? t : undefined;
    }
    if (x.t === "local") return this.#kinds.get(x.n);
    // The other values have no kind that the lowering knows.
    return x.t === "prim" && BOOLEAN_PRIMS.has(x.op) ? "boolean" : undefined;
  }

  /** This method gives a local the kind `kind`. A value that is not a local keeps its kind. */
  #typed(x: LExpr, kind: PrimitiveKind | undefined): LExpr {
    if (x.t === "local" && kind !== undefined) this.#kinds.set(x.n, kind);
    return x;
  }

  /**
   * This method checks the kind that the schema declares for a value. A failure is no error of the interpreter, so it
   * stops the program, and tier 1 evaluates it.
   */
  #declared(b: Block, x: LExpr, kind: PrimitiveKind | undefined, reason: string): LExpr {
    if (kind === undefined) return x;
    this.#decide(b, prim(KIND_CHECKS[kind], x), reason);
    return this.#typed(x, kind);
  }

  /**
   * This method adds a check whose failure is no error of the program. Tier 1 decides the result, so the check stops the
   * program in each block. `check` is for an error, and a context that catches an error drops its failure (V-071).
   */
  #decide(b: Block, ok: LExpr, reason: string): void {
    b.stmts.push({ t: "check", ok, reason, fail: STOP });
  }

  readonly constants: unknown[] = [];
  readonly #pool = new Map<unknown, number>();

  /** This method gives the index of the constant of a value. The same value has one constant. A map key does not tell 0 from -0, so -0 has its own. */
  index(value: unknown): number {
    // Stryker disable next-line UnaryOperator: with +0 as the special key, 0 and -0 still get different constants
    const k = Object.is(value, -0) ? NEGATIVE_ZERO : value;
    let i = this.#pool.get(k);
    if (i === undefined) {
      i = this.constants.push(value) - 1;
      this.#pool.set(k, i);
    }
    return i;
  }

  /** This method gives the constant of a value. */
  constant(value: unknown): LExpr {
    return constant(this.index(value));
  }

  /** This method gives the number of a new local of a kind. */
  typedLocal(kind: PrimitiveKind): number {
    const n = this.locals++;
    this.#kinds.set(n, kind);
    return n;
  }

  /** This method gives a new local with a value. */
  value(b: Block, value: LExpr): LExpr {
    const n = this.locals++;
    b.stmts.push({ t: "let", n, value });
    return local(n);
  }

  /**
   * This method gives the lazy error of a site, where the block keeps it. `undefined` tells that the block drops the
   * error, so the site is not a constant of the program.
   */
  site(b: Block, s: Pick<Scope, "origin" | "focus">, site: ErrorSite, ...operands: LExpr[]): LExpr | undefined {
    return keeps(b.fail) ? call("err", { t: "site", i: this.constants.push(site) - 1 }, s.origin, s.focus, ...operands) : undefined;
  }

  /** This method gives the lazy error of a text. */
  #text(b: Block, s: Scope, path: readonly number[], text: ErrorText): LExpr | undefined {
    return this.site(b, s, { t: "text", text, path });
  }

  /** This method adds a check. Without a lazy error, the failure is the plain failure of the block. */
  check(b: Block, ok: LExpr, reason: string, error?: LExpr): void {
    b.stmts.push(error === undefined ? { t: "check", ok, reason, fail: plainOf(b.fail) } : { t: "check", ok, reason, fail: b.fail, error });
  }

  /** This method gives a new local with the value of a call of the runtime, and a check that the value is not `FALLBACK`. */
  checked(b: Block, value: LExpr, reason: string, error?: LExpr): LExpr {
    const x = this.value(b, value);
    this.check(b, prim("!==", x, FALLBACK_EXPR), reason, error);
    return x;
  }

  /** This method adds a failure: the interpreter always gives an error here. */
  fail(b: Block, error?: LExpr): LExpr {
    b.stmts.push(error === undefined ? { t: "fail", fail: plainOf(b.fail) } : { t: "fail", fail: b.fail, error });
    return FALLBACK_EXPR;
  }

  expr(e: Expr, s: Scope, path: readonly number[], b: Block): LExpr {
    // Inside a node of the memo, the value of a key replaces the key. An error of the key is an error at each place.
    const key = this.#keys.get(e);
    if (key !== undefined) {
      if (key.ok !== undefined) this.check(b, key.ok, "a key with a value");
      return key.value;
    }
    const keys = this.#copying > 0 ? undefined : this.#memo.get(e);
    return keys === undefined ? this.#node(e, s, path, b) : this.#memoized(e, keys, s, path, b);
  }

  /** This method lowers a copy of a part of a failure path. */
  #copy(make: () => void): void {
    this.#copying++;
    make();
    this.#copying--;
  }

  /** This method lowers a node itself, without the memo. */
  #node(e: Expr, s: Scope, path: readonly number[], b: Block): LExpr {
    if (this.#copying > 0) this.#copied++;
    switch (e.tag) {
      case "lit":
        return this.constant(e.value);
      case "ref":
        return this.#ref(e, s, path, b);
      case "var": {
        const bound = s.env.get(e.name);
        // A function is not a value (FN.VALUE): tier 1 gives the error. A name of a loop hides a function with its name.
        if (bound === undefined && s.fns.has(e.name)) return this.fail(b, this.#text(b, s, path, errorText.functionValue(e.name)));
        if (bound === undefined) {
          const x = this.checked(b, call("var", local(VARS), this.constant(e.name)), "a variable", this.#text(b, s, path, errorText.unbound(e.name)));
          return this.#declared(b, x, primitiveOf(this.#schema.vars?.[e.name]), "a variable of the schema");
        }
        this.#read(b, bound, "a binding with a value");
        return bound.value;
      }
      case "let":
        return this.expr(e.body, { ...s, ...this.#bind(e, s, path, b) }, [...path, Object.keys(e.bind).length], b);
      // A function is only a binding of let, so the check of the shape stops this node first.
      // Stryker disable next-line all: see the comment above
      /* v8 ignore next -- @preserve */
      case "fn": return this.fail(b);
      case "call":
        return this.#call(e, s, path, b);
      case "rec": {
        const values = this.#all(Object.values(e.fields), s, path, 0, "fields", b);
        return this.value(b, call("rec", this.constant(Object.keys(e.fields)), array(...values)));
      }
      case "app":
        return this.#app(e, s, path, b);
      case "fold":
        return this.#fold(e, s, path, b);
      case "iterate":
        return this.#iterate(e, s, path, b);
      case "fix":
        return this.#fix(e, s, path, b);
      case "last": {
        const column = s.columns.get(e.name);
        // The lowering comes before the checks. A read outside a step fails a check, and that check gives the reason.
        return column === undefined ? this.fail(b) : this.#rowOf(e.name, column, s, path, b);
      }
      case "each": {
        // A list keeps its error items, and generated code makes no error items. Thus an error item stops the program, and
        // tier 1 gives the list.
        const keys = this.locals++;
        const values = this.locals++;
        b.stmts.push({ t: "let", n: keys, value: array() }, { t: "let", n: values, value: array() });
        this.#loop(e, s, path, b, () => STOP, (body, key, v) => {
          body.stmts.push({ t: "push", n: keys, value: key }, { t: "push", n: values, value: v });
        });
        return this.value(b, call("list", local(keys), local(values)));
      }
      case "ext": {
        // COMPILE.EXT: an error of an extension is an error of the block. The runtime throws for #DEPTH!, which stops the program.
        return this.checked(b, call("ext", this.constant(e.kind), this.constant(e.data), s.space, s.origin, s.focus, this.constant(path)), "an extension", this.site(b, s, { t: "ext", kind: e.kind, path }));
      }
    }
  }

  /**
   * This method gives the value of a node that depends only on the space (§7.2). The memo has an entry for each space.
   * Without the entry of the space, the node evaluates in a block, and an error of it makes an entry without a value.
   * An exception stops the program, so the memo gets no entry for it.
   *
   * The entry has no error, because the error of a node depends on its position and on its child nodes. Where the context
   * keeps the error, a copy of the node evaluates after a read of such an entry. The copy gives the error at this position.
   * A node of the memo and its keys use no extension, so this second evaluation has no effect.
   */
  #memoized(e: Expr, keys: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const memo: LExpr = { t: "memo", id: this.memos++ };
    // Each key evaluates here, in a block of its own, as a binding does.
    const values = keys.map((k): Bound => this.#attempt(b, (inner) => this.expr(k, s, path, inner), false));
    const tuple = array(...values.flatMap((k) => [k.value, flag(k)]));
    const h = this.locals++;
    const outer = this.#keys;
    this.#keys = new Map([...outer, ...keys.map((k, i): [Expr, Bound] => [k, values[i] as Bound])]);
    const compute = block(b.fail);
    const node = this.#attempt(compute, (inner) => this.#node(e, s, path, inner), false);
    this.#keys = outer;
    compute.stmts.push({ t: "set", n: h, value: prim("memoPut", memo, s.space, tuple, node.value, flag(node)) });
    b.stmts.push({ t: "let", n: h, value: prim("memoGet", memo, s.space, tuple) }, { t: "if", cond: prim("!", prim("isValue", local(h))), yes: compute.stmts, no: [] });
    const entry = prim("entryOk", local(h));
    const stop: LStmt = { t: "check", ok: entry, reason: "a value of the memo", fail: plainOf(b.fail) };
    if (keeps(b.fail) && this.#copied < MAX_COPIED) {
      const copy = block(b.fail);
      this.#copy(() => this.#node(e, s, path, copy));
      b.stmts.push({ t: "if", cond: prim("!", entry), yes: [...copy.stmts, stop], no: [] });
    } else {
      b.stmts.push(stop);
    }
    // Each entry of the memo comes from the code of the node, so it has the kind of the value of the node.
    return this.#typed(this.value(b, prim("entryValue", local(h))), this.kindOf(node.value));
  }

  /**
   * This method lowers the arguments of an op or the fields of a record, with the child indexes from `first`. After an
   * error, the interpreter still evaluates the later arguments, and two errors give `#ARGS` (`#all` of the interpreter).
   * Where the context keeps the error of two or more arguments that can fail, `#chain` or `#collect` lowers them.
   *
   * An extension in a later argument can give `#DEPTH!`. Thus, where the program catches the error, each argument before
   * the last one that can use an extension has its own block (COMPILE.EXT). Then a failure skips no extension.
   */
  #all(xs: readonly Expr[], s: Scope, path: readonly number[], first: number, what: string, b: Block): LExpr[] {
    if (keeps(b.fail) && xs.filter((x) => x.tag !== "lit").length > 1) {
      if (this.#copying > 0) return this.#collect(xs, s, path, first, what, b);
      if (this.#copied < MAX_COPIED && xs.length <= MAX_CHAINED) return this.#chain(xs, s, path, first, what, b);
      return this.#all(xs, s, path, first, what, { stmts: b.stmts, fail: plainOf(b.fail) });
    }
    const last = b.fail.t === "return" || b.fail.t === "stop" ? -1 : xs.findLastIndex((x) => this.#mayExt(x, s.fns));
    const parts = xs.map((x, i): Bound => {
      const at = [...path, first + i];
      return i < last ? this.#attempt(b, (inner) => this.expr(x, s, at, inner)) : { value: this.expr(x, s, at, b) };
    });
    for (const x of parts) if (x.ok !== undefined) this.check(b, x.ok, "an argument with a value");
    return parts.map((x) => x.value);
  }

  /**
   * This method lowers arguments on the value path, with no new check. A failure of an argument keeps its error in a
   * local of the argument. It then jumps to the copy of the next argument that can fail. After the last copy, the errors
   * give the error of the node (`args` of the runtime). The copies clear the locals, for the next turn of a loop.
   *
   * Each argument evaluates once: the value path gives up at the failure, and the copies start after it.
   */
  #chain(xs: readonly Expr[], s: Scope, path: readonly number[], first: number, what: string, b: Block): LExpr[] {
    const end = this.labels++;
    const parts = xs.map((x, i) => {
      const label = this.labels++;
      const error = this.locals++;
      const part = block({ t: "break", label, keep: error });
      const at = [...path, first + i];
      return { x, at, label, error, value: this.expr(x, s, at, part), stmts: part.stmts };
    });
    const values = parts.map((p) => p.value);
    const failing = parts.filter((p) => p.stmts.length > 0);
    if (failing.length === 0) return values;
    let body: LStmt[] = [...parts.flatMap((p) => p.stmts), { t: "break", label: end }];
    failing.forEach((p, i) => {
      body = [{ t: "block", label: p.label, body }];
      const next = failing[i + 1];
      if (next === undefined) return;
      const label = this.labels++;
      const copy = block({ t: "break", label, keep: next.error });
      this.#copy(() => this.expr(next.x, s, next.at, copy));
      body.push({ t: "block", label, body: copy.stmts });
    });
    const inner = block(b.fail);
    const error = this.value(inner, this.#argsError(s, path, what, failing.map((p) => local(p.error))));
    inner.stmts.push(...failing.map((p): LStmt => ({ t: "set", n: p.error, value: { t: "none" } })));
    this.fail(inner, error);
    b.stmts.push({ t: "block", label: end, body: [...body, ...inner.stmts] });
    return values;
  }

  /**
   * This method lowers arguments in a copy. The value path does not read a copy, so each argument can have its own block
   * and its flag. A node in a copy thus adds no other copy, and the size of the code stays near the size of the node.
   */
  #collect(xs: readonly Expr[], s: Scope, path: readonly number[], first: number, what: string, b: Block): LExpr[] {
    const parts = xs.map((x, i): Bound => this.#attempt(b, (inner) => this.expr(x, s, [...path, first + i], inner)));
    const errors = parts.flatMap((p) => (p.ok === undefined ? [] : [prim("unless", p.ok, p.value)]));
    if (errors.length > 0) {
      const error = this.value(b, this.#argsError(s, path, what, errors));
      this.check(b, prim("!", prim("isValue", error)), "the arguments have values", error);
    }
    return parts.map((p) => p.value);
  }

  /** This method gives the call of the runtime that makes the error of some arguments. */
  #argsError(s: Scope, path: readonly number[], what: string, errors: readonly LExpr[]): LExpr {
    const site = this.constants.push({ t: "args", what, path } satisfies ErrorSite) - 1;
    return call("args", { t: "site", i: site }, s.origin, s.focus, array(...errors));
  }

  /**
   * This method tells if an expression can call an extension. A call reads the body of its function, and the bodies of
   * the functions of that body. A function cannot call itself, so the search ends. Each node has one answer for each
   * map of functions, because functions can call each other many times (V-068).
   */
  #mayExt(e: Expr, fns: ReadonlyMap<string, BoundFn>): boolean {
    let answers = this.#exts.get(fns);
    if (answers === undefined) {
      answers = new Map();
      this.#exts.set(fns, answers);
    }
    const known = answers.get(e);
    if (known !== undefined) return known;
    const bound = e.tag === "call" ? fns.get(e.fn) : undefined;
    const answer = e.tag === "ext" || (bound !== undefined && this.#mayExt(bound.fn.body, bound.scope.fns)) || children(e).some((x) => this.#mayExt(x, fns));
    answers.set(e, answer);
    return answer;
  }

  /**
   * This method evaluates an expression in a block whose errors end the block, as a binding does. It gives the value
   * and the flag that tells if the value exists. Without statements, the expression always has a value, so it gets no
   * flag. With `keep`, a failure keeps its lazy error in the local of the value: only the failure path writes it there.
   */
  #attempt(b: Block, make: (inner: Block) => LExpr, keep = keeps(b.fail)): Bound {
    const label = this.labels++;
    const v = this.locals++;
    const attempt = block(keep ? { t: "break", label, keep: v } : { t: "break", label });
    const value = make(attempt);
    if (attempt.stmts.length === 0) return { value };
    const ok = this.locals++;
    this.#typed(local(v), this.kindOf(value));
    attempt.stmts.push({ t: "set", n: v, value }, { t: "set", n: ok, value: bool(true) });
    b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts });
    return keep ? { value: local(v), ok: local(ok), error: local(v) } : { value: local(v), ok: local(ok) };
  }

  /** This method adds the check of a read of a bound name. An error of the binding is the error of the read. */
  #read(b: Block, bound: Bound, reason: string): void {
    if (bound.ok !== undefined) this.check(b, bound.ok, reason, bound.error);
  }

  /**
   * This method reads a field, as `ref` of the interpreter: the record of the key, and then each segment of the path.
   * A segment that cannot name a field always gives an error.
   */
  #ref(e: ExprOf<"ref">, s: Scope, path: readonly number[], b: Block): LExpr {
    const moved = e.at === undefined || e.at.length === 0 ? undefined : this.#address(e.at, s, path, 0, b);
    const key = moved ?? s.focus;
    const missing = (where: string): LExpr | undefined => this.site(b, s, { t: "missing", where, path }, key);
    const n = this.locals++;
    const x = local(n);
    b.stmts.push({ t: "let", n, value: moved === undefined ? s.rec : prim("get", s.space, moved) });
    this.check(b, prim("isValue", x), "a record", missing(e.path.length === 0 ? "(record)" : e.path.join(".")));
    for (const [i, seg] of e.path.entries()) {
      const where = e.path.slice(0, i + 1).join(".");
      if (!isFieldName(seg)) return this.fail(b, missing(where));
      this.check(b, prim("isObject", x), "an object", missing(where));
      b.stmts.push({ t: "set", n, value: prim("member", x, this.constant(seg)) });
      this.check(b, prim("isValue", x), "a field", missing(where));
    }
    const [field, ...more] = e.path;
    // Tier 2 knows only the primitive kinds. A value of a domain goes through the dispatch of the runtime.
    return field === undefined || more.length > 0 ? x : this.#declared(b, x, primitiveOf(this.#schema.fields?.[field]), "a field of the schema");
  }

  /**
   * This method binds the names of a `let`. The interpreter evaluates each binding in the scope outside the `let`. An
   * error of a binding is an error only where the body reads the name. Thus an error ends the block of the binding, and
   * a flag tells each read of the name that the binding has no value.
   */
  #bind(e: ExprOf<"let">, s: Scope, path: readonly number[], b: Block): Pick<Scope, "env" | "fns"> {
    const env = new Map(s.env);
    const fns = new Map(s.fns);
    Object.entries(e.bind).forEach(([name, x], i) => {
      // A function evaluates at each call. A binding sees the scope of the let, so a function cannot call itself.
      // A value hides a function of its name, because a read looks at the values first.
      if (x.tag === "fn") {
        fns.set(name, { fn: x, path: [...path, i], scope: s });
        env.delete(name);
      } else {
        env.set(name, this.#attempt(b, (inner) => this.expr(x, s, [...path, i], inner)));
      }
    });
    return { env, fns };
  }

  /**
   * This method lowers a call (FN.CALL). The body of the function goes at the place of the call, with the values of the
   * arguments for its parameters. The body sees the names of the place of its binding.
   */
  #call(e: ExprOf<"call">, s: Scope, path: readonly number[], b: Block): LExpr {
    const value = s.env.get(e.fn);
    if (value !== undefined) {
      this.#read(b, value, "a binding with a value");
      return this.fail(b, this.#text(b, s, path, errorText.notFunction(e.fn)));
    }
    const bound = s.fns.get(e.fn);
    // The name can be a variable of the run: only the run tells the error.
    if (bound === undefined) return this.fail(b, this.site(b, s, { t: "call", name: e.fn, path }, local(VARS)));
    if (bound.fn.params.length !== e.args.length) return this.fail(b, this.#text(b, s, path, errorText.arity(e.fn, bound.fn.params.length, e.args.length)));
    if (this.#copying === 0 && ++this.#calls > MAX_CALLS) throw new Unsupported(`the calls put the bodies of functions in more than ${String(MAX_CALLS)} places`);
    const env = new Map(bound.scope.env);
    bound.fn.params.forEach((p, i) => env.set(p, this.#attempt(b, (inner) => this.expr(e.args[i] as Expr, s, [...path, i], inner))));
    return this.expr(bound.fn.body, { ...s, env, fns: bound.scope.fns }, [...bound.path, 0], b);
  }

  #app(e: ExprOf<"app">, s: Scope, path: readonly number[], b: Block): LExpr {
    const { op, args } = e;
    switch (op) {
      case "if":
        return this.#if(args, s, path, b);
      case "and":
      case "or":
        return args.length === 0 ? this.fail(b, this.#text(b, s, path, errorText.needsArguments(op))) : this.#andOr(op === "or", args, 0, s, path, b);
      case "ifError":
        return this.#ifError(args, s, path, b);
    }
    if (isFusedOp(op)) {
      const target = eachUnderLets(args[0]);
      if (target !== undefined) return this.#fused(op, e, target, s, path, b);
    }
    const values = this.#all(args, s, path, 0, "arguments", b);
    const kinds = values.map((x) => this.kindOf(x));
    // A static site checks the kind of its result, so the result has the kind that the op declares (KIND.RETURNS).
    const site = this.#facts.staticSite(op, kinds);
    const x = this.checked(b, { t: "op", name: this.index(op), args: values, kinds }, "an op", this.site(b, s, { t: "op", op, path }));
    return this.#typed(x, site?.t === "fn" ? primitiveOf(site.returns) : undefined);
  }

  /** The condition must be a boolean. Only the branch that the condition selects is evaluated. */
  #if(args: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const [cond, yes, no] = args;
    if (cond === undefined) return this.fail(b, this.#text(b, s, path, errorText.needsArgument("if", 0)));
    const c = this.#boolean(this.expr(cond, s, [...path, 0], b), b, s, { t: "boolean", op: "if", i: 0, path });
    const r = this.locals++;
    const kinds: (PrimitiveKind | undefined)[] = [];
    const branch = (x: Expr | undefined, i: number): LStmt[] => {
      const inner = block(b.fail);
      const value = x === undefined ? this.fail(inner, this.#text(inner, s, path, errorText.needsArgument("if", i))) : this.expr(x, s, [...path, i], inner);
      kinds.push(this.kindOf(value));
      inner.stmts.push({ t: "set", n: r, value });
      return inner.stmts;
    };
    b.stmts.push({ t: "if", cond: c, yes: branch(yes, 1), no: branch(no, 2) });
    return this.#typed(local(r), join(kinds[0], kinds[1]));
  }

  /** `or` stops at the first `true`, and `and` at the first `false`. Each argument before the stop must be a boolean. */
  #andOr(isOr: boolean, args: readonly Expr[], i: number, s: Scope, path: readonly number[], b: Block, r = this.locals++): LExpr {
    const x = this.#boolean(this.expr(args[i] as Expr, s, [...path, i], b), b, s, { t: "boolean", op: isOr ? "or" : "and", i, path });
    this.#typed(local(r), "boolean");
    if (i === args.length - 1) {
      b.stmts.push({ t: "set", n: r, value: x });
    } else {
      const rest = block(b.fail);
      this.#andOr(isOr, args, i + 1, s, path, rest, r);
      const stop: LStmt[] = [{ t: "set", n: r, value: bool(isOr) }];
      b.stmts.push(isOr ? { t: "if", cond: x, yes: stop, no: rest.stmts } : { t: "if", cond: x, yes: rest.stmts, no: stop });
    }
    return local(r);
  }

  /**
   * The value of the first argument, or else the value of the second argument. An error of the first argument ends its
   * block. An exception, for example #DEPTH!, stops the program, so `ifError` does not hide it (EVAL.DEPTH).
   */
  #ifError(args: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const [first, second] = args;
    if (first === undefined) return this.fail(b, this.#text(b, s, path, errorText.needsArgument("ifError", 1)));
    const label = this.labels++;
    const r = this.locals++;
    const ok = this.locals++;
    const attempt = block({ t: "break", label });
    const value = this.expr(first, s, [...path, 0], attempt);
    attempt.stmts.push({ t: "set", n: r, value }, { t: "set", n: ok, value: bool(true) });
    const otherwise = block(b.fail);
    const fallback = second === undefined ? this.fail(otherwise, this.#text(otherwise, s, path, errorText.needsArgument("ifError", 1))) : this.expr(second, s, [...path, 1], otherwise);
    otherwise.stmts.push({ t: "set", n: r, value: fallback });
    b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts }, { t: "if", cond: prim("!", local(ok)), yes: otherwise.stmts, no: [] });
    return this.#typed(local(r), join(this.kindOf(value), this.kindOf(fallback)));
  }

  /** A value of a known kind needs no check. */
  #boolean(x: LExpr, b: Block, s: Pick<Scope, "origin" | "focus">, site: ErrorSite): LExpr {
    if (this.kindOf(x) !== "boolean") this.check(b, prim("isBoolean", x), "a boolean", this.site(b, s, site, x));
    return x;
  }

  #number(x: LExpr, b: Block, s: Scope, site: ErrorSite): LExpr {
    if (this.kindOf(x) !== "number") this.check(b, prim("isNumber", x), "a number", this.site(b, s, site, x));
    return x;
  }

  /**
   * This method lowers a list op over an `each` into one loop. Like the interpreter, the loop skips an error item, and
   * with the option `strict` the list op fails at an error item. `errors` gives the error values, so an error item of
   * `errors` stops the program.
   *
   * The loop checks the items in the order of the interpreter, so the first bad item is the item of the interpreter. Two
   * cases differ. With `strict`, the first error item of the whole list comes before a check of the op. With an extension
   * in the list, the interpreter evaluates each item before the op. In both cases, a check of the op keeps no error.
   * The later arguments evaluate before the loop, and the interpreter evaluates them after the list, so they keep no error.
   */
  #fused(op: FusedOp, e: ExprOf<"app">, target: ExprOf<"each">, s: Scope, path: readonly number[], b: Block): LExpr {
    // The `let` expressions above the `each`, from the outside in.
    let inner = s;
    let at = [...path, 0];
    for (let x = e.args[0] as Expr; x.tag === "let"; x = x.body) {
      inner = { ...inner, ...this.#bind(x, inner, at, b) };
      at = [...at, Object.keys(x.bind).length];
    }
    // COMPILE.EXT: the interpreter evaluates each item of the list before the op, and an extension in an item can give
    // #DEPTH!. Thus a failure that would skip the later items stops the program, if the list can call an extension.
    const skip: Block = this.#mayExt(e.args[0] as Expr, s.fns) ? { stmts: b.stmts, fail: STOP } : b;
    const plain: Block = { stmts: b.stmts, fail: plainOf(skip.fail) };
    const rest = this.#all(e.args.slice(1), s, path, 1, "arguments", plain);
    const options = op === "reduce" ? rest[1] : rest[0];
    const strict = options === undefined ? undefined : this.value(b, prim("===", call("opts", options), bool(true)));
    const name = rest[0];
    if (op === "reduce") {
      if (name === undefined) return this.fail(plain);
      this.check(plain, prim("isString", name), "an op name");
    }
    const items = (label: number): Fail => {
      if (op === "errors") return STOP;
      return strict === undefined ? { t: "continue", label } : { t: "continue", label, strict: { cond: strict, else: skip.fail } };
    };
    const opFail = strict === undefined ? skip.fail : plain.fail;

    const acc = this.locals++;
    const n = this.typedLocal("number");
    const init = (value: LExpr): void => {
      b.stmts.push({ t: "let", n: acc, value });
    };
    b.stmts.push({ t: "let", n, value: num(0) });
    const count = (body: Block): void => {
      body.stmts.push({ t: "set", n, value: prim("+", local(n), num(1)) });
    };
    // A check of the list op itself is in the loop, but its failure is a failure of the list op.
    const opCheck = (body: Block): Block => ({ stmts: body.stmts, fail: opFail });
    const firstThen = (body: Block, v: LExpr, then: (later: Block) => LExpr): void => {
      const later = block(opFail);
      later.stmts.push({ t: "set", n: acc, value: then(later) });
      body.stmts.push({ t: "if", cond: prim("===", local(n), num(0)), yes: [{ t: "set", n: acc, value: v }], no: later.stmts });
    };
    const nonEmpty = (): void => {
      this.check(b, prim("!==", local(n), num(0)), "a list that is not empty", this.#text(b, s, path, errorText.empty(op)));
    };
    const opError = (): LExpr | undefined => this.site(b, s, { t: "op", op, path });
    const numbers: ErrorSite = { t: "items", op, what: "numbers", path };

    switch (op) {
      case "count":
        this.#loop(target, inner, at, b, items, (body) => count(body));
        return local(n);
      case "sum":
      case "mean":
        init(num(0));
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          body.stmts.push({ t: "set", n: acc, value: prim("+", local(acc), this.#number(v, opCheck(body), s, numbers)) });
          count(body);
        });
        if (op === "sum") return this.#typed(this.checked(b, call("result", local(acc)), "a finite sum", opError()), "number");
        nonEmpty();
        return this.#typed(this.checked(b, call("result", prim("/", local(acc), local(n))), "a finite mean", opError()), "number");
      case "min":
      case "max":
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          this.#number(v, opCheck(body), s, numbers);
          firstThen(body, v, () => prim(op, local(acc), v));
          count(body);
        });
        nonEmpty();
        return this.#typed(local(acc), "number");
      case "any":
      case "all":
      case "none":
        init(bool(op === "all"));
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          body.stmts.push({ t: "set", n: acc, value: prim(op === "all" ? "&&" : "||", local(acc), this.#boolean(v, opCheck(body), s, { t: "items", op, what: "booleans", path })) });
        });
        return op === "none" ? prim("!", local(acc)) : this.#typed(local(acc), "boolean");
      case "first":
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          firstThen(body, v, () => local(acc));
          count(body);
        });
        nonEmpty();
        return local(acc);
      case "values":
      case "keys":
        init(array());
        this.#loop(target, inner, at, b, items, (body, key, v) => {
          body.stmts.push({ t: "push", n: acc, value: op === "keys" ? key : v });
        });
        return this.value(b, call("frozen", local(acc)));
      case "errors":
        this.#loop(target, inner, at, b, items, () => undefined);
        return this.value(b, call("frozen", array()));
      case "reduce":
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          firstThen(body, v, (later) => this.checked(later, call("step", name as LExpr, local(acc), v), "a step of reduce", this.site(later, s, { t: "step", path }, name as LExpr)));
          count(body);
        });
        // An empty list can give the identity of the op, so tier 1 gives its result. Without one identity, it is an error.
        if (this.#emptyFails(e)) this.check(plain, prim("!==", local(n), num(0)), "a list that is not empty");
        else this.#decide(b, prim("!==", local(n), num(0)), "a list that is not empty");
        return local(acc);
    }
  }

  /**
   * This method tells if a `reduce` of an empty list always gives an error (LIST.EMPTY). The name of its op is a literal,
   * and the domains do not have exactly one identity of the op. An option can name a domain, so a third argument tells nothing.
   */
  #emptyFails(e: ExprOf<"app">): boolean {
    const name = e.args[1] as Expr;
    return e.args.length === 2 && name.tag === "lit" && this.#facts.identities(name.value as string) !== 1;
  }

  /**
   * This method lowers the loop over the targets of an axis. The tests of `where` and the body evaluate at each target
   * in a block whose failure is `items(label)`. Then `onItem` adds the statements for the value of the body.
   */
  /**
   * This method gives the key of an address. The expressions of its computed moves evaluate first, at the position of
   * the node, and their child indexes start at `first` (NAV.COMPUTED).
   */
  #address(at: Addr, s: Scope, path: readonly number[], first: number, b: Block): LExpr {
    const values = addrExprs(at).map((x, i) => this.expr(x, s, [...path, first + i], b));
    const moves = values.length === 0 ? [] : [array(...values)];
    return this.checked(b, call("addr", s.space, s.origin, s.focus, this.constant(at), ...moves), "an address", this.site(b, s, { t: "addr", at, path }, s.space, ...moves));
  }

  #loop(e: ExprOf<"each">, s: Scope, path: readonly number[], b: Block, items: (label: number) => Fail, onItem: (body: Block, key: LExpr, value: LExpr) => void): void {
    this.#targetLoop(e, s, path, 1, b, items, (body, key, at, names) => {
      onItem(body, key, this.expr(e.body, { ...at, env: new Map([...at.env, ...names]) }, [...path, 0], body));
    });
  }

  /**
   * This method lowers the loop over the targets of an axis with an address. The list of the axis `list` has the child
   * index `firstTest`. The tests of `where` come next, and the expressions of the address come after them. `each` adds
   * the statements of a target. The map `names` has the names `as` of the item. Only the body or the step reads them.
   */
  #targetLoop(
    e: Pick<ExprOf<"each">, "axis" | "at" | "as">,
    s: Scope,
    path: readonly number[],
    firstTest: number,
    b: Block,
    items: (label: number) => Fail,
    each: (body: Block, key: LExpr, at: Scope, names: ReadonlyMap<string, Bound>) => void,
  ): void {
    const { axis, at: addr, as } = e;
    const list = listOf(axis);
    const tests = firstTest + axisChildren(axis) - whereTests(axis).length;
    const from = addr === undefined || addr.length === 0 ? s.focus : this.#address(addr, s, path, firstTest + axisChildren(axis), b);
    const base = baseAxis(axis);
    let space = s.space;
    let over: LExpr;
    let skip: LExpr | undefined;
    // The index of the record of each target: the index of the loop, or else the index that the axis gives.
    let idx: LExpr | undefined;
    // The value and the position of each item of the axis list.
    let item: { readonly values: LExpr; readonly nth: LExpr } | undefined;
    if (list !== undefined) {
      // The list evaluates at the key of the address (AXIS.LIST).
      const moved: Scope = from === s.focus ? s : { ...s, focus: from, rec: prim("get", s.space, from), slot: undefined };
      const value = this.value(b, this.expr(list, moved, [...path, firstTest], b));
      const targets = this.checked(b, call("items", value, bool(base.t === "reverse")), "a list of the axis list", this.site(b, moved, { t: "listAxis", path }, value));
      over = prim("keysOf", targets);
      item = { values: prim("valuesOf", targets), nth: prim("idxOf", targets) };
    } else if (base.t === "table") {
      // The axis table moves the evaluation to the space of its table, and there the origin is the target.
      space = this.checked(b, call("table", local(TABLES), this.constant(base.name)), "a table", this.#text(b, s, path, errorText.noTable(base.name)));
      over = call("keys", space);
    } else if (base.t === "all" || base.t === "others") {
      over = call("keys", s.space);
      if (base.t === "others") skip = from;
    } else {
      const targets = this.checked(b, { t: "targets", axis: this.index(base), args: [s.space, s.origin, from] }, "the targets of an axis", this.site(b, s, { t: "axis", axis: base, path }, s.space, from));
      over = prim("keysOf", targets);
      idx = this.value(b, prim("idxOf", targets));
    }
    // A key of a list can be outside the space, and it has no index of the space, so the record comes from the key.
    const records = list === undefined ? this.value(b, prim("records", space)) : undefined;
    const label = this.labels++;
    const array_ = this.locals++;
    const index = this.locals++;
    const target = this.locals++;
    const key = local(target);
    const body = block(items(label));
    if (skip !== undefined) body.stmts.push({ t: "if", cond: prim("===", key, skip), yes: [{ t: "next" }], no: [] });
    const slot = idx === undefined ? local(index) : prim("member", idx, local(index));
    const rec = records === undefined ? prim("get", space, key) : prim("recordAt", records, slot, space, key);
    const at: Scope = { space, origin: base.t === "table" ? key : s.origin, focus: key, env: s.env, fns: s.fns, rec, columns: s.columns, slot: list === undefined ? slot : undefined };
    whereTests(axis).forEach((test, i) => {
      const testPath = [...path, tests + i];
      const ok = this.#boolean(this.expr(test, at, testPath, body), body, at, { t: "test", path: testPath });
      body.stmts.push({ t: "if", cond: prim("!", ok), yes: [{ t: "next" }], no: [] });
    });
    const names = new Map<string, Bound>();
    const [name, position] = as ?? [];
    if (name !== undefined && item !== undefined) names.set(name, { value: this.value(body, prim("member", item.values, local(index))) });
    if (position !== undefined && item !== undefined) names.set(position, { value: this.#typed(this.value(body, prim("member", item.nth, local(index))), "number") });
    each(body, key, at, names);
    b.stmts.push({ t: "loop", label, item: target, index, array: array_, over, body: body.stmts });
  }

  /** This method gives a local for each name of a loop, with its first value at the node (LOOP.NAMES). */
  #loopNames(init: Names, s: Scope, path: readonly number[], b: Block): { readonly env: ReadonlyMap<string, Bound>; readonly locals: ReadonlyMap<string, number> } {
    const env = new Map(s.env);
    const locals = new Map<string, number>();
    Object.entries(init).forEach(([name, x], i) => {
      const value = this.expr(x, s, [...path, i], b);
      const n = this.locals++;
      b.stmts.push({ t: "let", n, value });
      this.#typed(local(n), this.kindOf(value));
      env.set(name, { value: local(n) });
      locals.set(name, n);
    });
    return { env, locals };
  }

  /**
   * This method lowers one step of a loop: each new value first, and then each name gets its value. A name keeps the
   * kind of its first value, so a new value of another kind stops the program, and tier 1 evaluates it.
   */
  #loopStep(step: Names, s: Scope, path: readonly number[], first: number, b: Block, locals: ReadonlyMap<string, number>): void {
    const values = Object.entries(step).map(([name, x], i): [number, LExpr] => {
      const n = locals.get(name) as number;
      const value = this.value(b, this.expr(x, s, [...path, first + i], b));
      return [n, this.#declared(b, value, this.kindOf(local(n)), "a value of the kind of a name of a loop")];
    });
    for (const [n, value] of values) b.stmts.push({ t: "set", n, value });
  }

  /** This method lowers an iteration (ITERATE.LIMIT, ITERATE.UNTIL): a repeated block with a count of its steps. */
  #iterate(e: ExprOf<"iterate">, s: Scope, path: readonly number[], b: Block): LExpr {
    const first = Object.keys(e.init).length;
    const tests = first + Object.keys(e.step).length;
    const { env, locals } = this.#loopNames(e.init, s, path, b);
    const inner: Scope = { ...s, env };
    const limit = this.#limit(e, s, path, tests, b);
    const untilAt = tests + axisChildren(limitAxis(e) ?? { t: "all" });
    const label = this.labels++;
    const k = this.typedLocal("number");
    b.stmts.push({ t: "let", n: k, value: num(0) });
    const body = block(b.fail);
    if (e.until !== undefined) {
      const stop = this.#boolean(this.expr(e.until, inner, [...path, untilAt], body), body, inner, { t: "until", path: [...path, untilAt] });
      body.stmts.push({ t: "check", ok: prim("!", stop), reason: "the test until", fail: { t: "break", label } });
    }
    // At the limit, an iteration without a test ends, and an iteration with a test fails.
    const more = prim("!==", local(k), limit);
    if (e.until === undefined) body.stmts.push({ t: "check", ok: more, reason: "the limit of iterate", fail: { t: "break", label } });
    else this.check(body, more, "the limit of iterate", this.site(body, s, { t: "limit", path }, limit));
    this.#loopStep(e.step, inner, path, first, body, locals);
    body.stmts.push({ t: "set", n: k, value: prim("+", local(k), num(1)) });
    b.stmts.push({ t: "repeat", label, body: body.stmts });
    return this.expr(e.result, inner, [...path, untilAt + (e.until === undefined ? 0 : 1)], b);
  }

  /**
   * This method lowers a fixed point (FIX.ROUNDS). The column is an array with the value of each key, in the order of
   * the keys. The rows of `init` give its first values, and each round makes the array of the next values. A round
   * without a change ends the loop with the old array, as the interpreter does. After the last round, an error stops
   * the column (FIX.LIMIT). The value of the node is the row of the focus.
   */
  #fix(e: ExprOf<"fix">, s: Scope, path: readonly number[], b: Block): LExpr {
    const n = this.locals++;
    const column: FixColumn = { local: local(n), join: e.join };
    b.stmts.push({ t: "let", n, value: array() });
    this.#rows(e, e.init, s, path, 0, b, (row, _at, v) => {
      row.stmts.push({ t: "push", n, value: v });
    });
    const limit = this.value(b, call("rounds", s.space));
    const label = this.labels++;
    const k = this.typedLocal("number");
    b.stmts.push({ t: "let", n: k, value: num(0) });
    const body = block(b.fail);
    this.check(body, prim("!==", local(k), limit), "the limit of the rounds", this.site(body, s, { t: "fixLimit", name: e.name, path }, limit));
    const next = this.locals++;
    const changed = this.locals++;
    body.stmts.push({ t: "let", n: next, value: array() }, { t: "let", n: changed, value: bool(false) });
    // The step has the column in its scope, so an inner `fix` with the same name hides the column.
    this.#rows(e, e.step, { ...s, columns: new Map([...s.columns, [e.name, column]]) }, path, 1, body, (row, at, v) => {
      const old = this.value(row, prim("member", column.local, at.slot as LExpr));
      const value = this.value(row, prim(JOINS[e.join], old, v));
      row.stmts.push({ t: "if", cond: prim("!==", value, old), yes: [{ t: "set", n: changed, value: bool(true) }], no: [] }, { t: "push", n: next, value });
    });
    body.stmts.push(
      { t: "check", ok: local(changed), reason: "a round that changes a row", fail: { t: "break", label } },
      { t: "set", n, value: local(next) },
      { t: "set", n: k, value: prim("+", local(k), num(1)) },
    );
    b.stmts.push({ t: "repeat", label, body: body.stmts });
    return this.#rowOf(e.name, column, s, path, b);
  }

  /**
   * This method lowers the evaluation of `x` at each row of a column. An error in a row does not stop the next rows, so
   * each extension of the round evaluates (FIX.ERROR). After the loop, the errors of the rows give the error of the
   * node. `each` adds the statements of a row with a good value.
   */
  #rows(e: ExprOf<"fix">, x: Expr, s: Scope, path: readonly number[], child: number, b: Block, each: (row: Block, at: Scope, value: LExpr) => void): void {
    const errors = this.locals++;
    b.stmts.push({ t: "let", n: errors, value: array() });
    const kind: ErrorSite = { t: "row", name: e.name, join: e.join, path };
    // Stryker disable next-line ArrowFunction: each check of a row is in its own block, so the loop reads no failure
    this.#targetLoop(ROWS, s, path, 0, b, () => b.fail, (body, _key, at) => {
      const row = this.#attempt(
        body,
        (inner) => {
          const v = this.value(inner, this.expr(x, at, [...path, child], inner));
          if (joinKind(e.join) === "boolean") this.#boolean(v, inner, at, kind);
          else this.check(inner, prim("isFinite", v), "a finite number", this.site(inner, at, kind, v));
          each(inner, at, v);
          return v;
        },
        true,
      );
      body.stmts.push({ t: "if", cond: prim("!", row.ok as LExpr), yes: [{ t: "push", n: errors, value: row.value }], no: [] });
    });
    const site = this.constants.push({ t: "rows", path } satisfies ErrorSite) - 1;
    this.check(b, prim("===", prim("member", local(errors), this.constant("length")), num(0)), "the rows have values", call("args", { t: "site", i: site }, s.origin, s.focus, local(errors)));
  }

  /** This method reads the row of the focus. A focus that is not a key of the space has no row (FIX.LAST). */
  #rowOf(name: string, column: FixColumn, s: Scope, path: readonly number[], b: Block): LExpr {
    const x = this.value(b, prim("member", column.local, s.slot ?? call("rowIndex", s.space, s.focus)));
    this.check(b, prim("isValue", x), "a row of the column", this.site(b, s, { t: "lastKey", name, path }));
    return this.#typed(x, joinKind(column.join));
  }

  /**
   * This method gives the number of steps of an iteration. A data limit counts the targets of its axis. Its failure
   * stops the program, and tier 1 gives the error (ITERATE.LIMIT.ERROR).
   */
  #limit(e: ExprOf<"iterate">, s: Scope, path: readonly number[], firstTest: number, b: Block): LExpr {
    const axis = limitAxis(e);
    if (axis === undefined) return num(e.limit as number);
    const n = this.typedLocal("number");
    b.stmts.push({ t: "let", n, value: num(0) });
    // The error of a limit that is not valid keeps its cause, so each failure here is the plain failure of the block.
    // COMPILE.EXT: the interpreter evaluates each test, and an extension in a test can give #DEPTH!. Thus a failed test stops the program.
    const plain: Block = { stmts: b.stmts, fail: axisExprs(axis).some((x) => this.#mayExt(x, s.fns)) ? STOP : plainOf(b.fail) };
    this.#targetLoop({ axis }, s, path, firstTest, plain, () => plain.fail, (body) => {
      body.stmts.push({ t: "set", n, value: prim("+", local(n), num(1)) });
    });
    this.check(b, prim("===", prim("min", local(n), num(MAX_ITERATIONS)), local(n)), "a data limit in the cap");
    return local(n);
  }

  /** This method lowers a fold (FOLD.ORDER): the loop over the targets, with a step at each target. */
  #fold(e: ExprOf<"fold">, s: Scope, path: readonly number[], b: Block): LExpr {
    const first = Object.keys(e.init).length;
    const tests = first + Object.keys(e.step).length;
    const { env, locals } = this.#loopNames(e.init, s, path, b);
    // An error of a test or of a step is the error of the fold.
    this.#targetLoop(e, s, path, tests, b, () => b.fail, (body, _key, at, names) => {
      this.#loopStep(e.step, { ...at, env: new Map([...env, ...names]) }, path, first, body, locals);
    });
    return this.expr(e.result, { ...s, env }, [...path, tests + axisChildren(e.axis) + addrExprs(e.at).length], b);
  }
}

const NEGATIVE_ZERO = Symbol("-0");

/** This function gives the flag of a bound value: its local, or `true` for a value without a flag. */
// Stryker disable next-line BooleanLiteral: a value without a flag always exists, so each constant gives the same entries
const flag = (b: Bound): LExpr => b.ok ?? bool(true);

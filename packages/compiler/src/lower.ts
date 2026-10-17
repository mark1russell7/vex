/**
 * The lowering: a Vex expression becomes a program of the loop IR (docs/COMPILER.md §3.3). A list op over a direct
 * `each` becomes one loop with a running value, so it makes no list.
 *
 * Each value that the interpreter can give as an error has a check. The block of the check tells what a failure does
 * (`Fail`). A list op skips an error item, and an error in the first argument of `ifError` gives the second argument.
 * Each other error stops the program with `FALLBACK`.
 */
import { addrExprs, isFieldName, isListOp, MAX_NESTING, nestingOf, shapeError, type Addr, type Axis, type Expr, type ExprOf, type ListOp, type Names, type PrimitiveKind } from "@mark1russell7/vex";
import { factsOf, listReason, MAX_CALLS, primitiveOf, type Facts, type Schema } from "./facts.ts";
import { memoNodes } from "./memo.ts";
import {
  array,
  bool,
  call,
  constant,
  FALLBACK_EXPR,
  FIXED_LOCALS,
  local,
  num,
  ORIGIN,
  prim,
  RETURN,
  SPACE,
  TABLES,
  VARS,
  type Fail,
  type LExpr,
  type LoopProgram,
  type LStmt,
} from "./loop.ts";

/** The error of an expression that the compiler cannot lower. Then the program operates in tier 1. */
export class Unsupported extends Error {}

/** A bound name: its value, and the flag that tells if its binding gave a value. Without a flag, it always does. */
interface Bound {
  readonly value: LExpr;
  readonly ok?: LExpr;
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
}

/** A list of statements, and what a failed check in it does. */
interface Block {
  readonly stmts: LStmt[];
  readonly fail: Fail;
}

const block = (fail: Fail): Block => ({ stmts: [], fail });

/** This function gives the axis inside the `where` axes of an axis. */
const baseAxis = (a: Axis): Exclude<Axis, { readonly t: "where" }> => (a.t === "where" ? baseAxis(a.axis) : a);

/** This function gives the tests of the `where` axes of an axis, from the inside out, as the interpreter applies them. */
function whereTests(a: Axis): readonly Expr[] {
  const out: Expr[] = [];
  for (let x: Axis = a; x.t === "where"; x = x.axis) out.unshift(x.test);
  return out;
}

/** This function gives the `each` under the `let` expressions of a list argument, or `undefined`. */
function eachUnderLets(e: Expr | undefined): ExprOf<"each"> | undefined {
  let x = e;
  while (x?.tag === "let") x = x.body;
  return x?.tag === "each" ? x : undefined;
}

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
  // EVAL.SHAPE and EVAL.NESTING: tier 1 gives the error of a program that is not valid or that is nested too deep.
  const shape = shapeError(expr);
  if (shape !== undefined) throw new Unsupported(shape);
  if (nestingOf(expr) > MAX_NESTING) throw new Unsupported(`the expression is nested deeper than ${MAX_NESTING} levels`);
  const lists = listReason(expr);
  if (lists !== undefined) throw new Unsupported(lists);
  const l = new Lowerer(memoNodes(expr), facts, schema);
  const b = block(RETURN);
  l.check(b, call("has", local(SPACE), local(ORIGIN)), "the origin is a key of the space");
  const top: Scope = { space: local(SPACE), origin: local(ORIGIN), focus: local(ORIGIN), env: new Map(), fns: new Map(), rec: prim("get", local(SPACE), local(ORIGIN)) };
  const value = l.expr(expr, top, [], b);
  b.stmts.push({ t: "return", value });
  return { body: b.stmts, locals: l.locals, constants: l.constants };
}

class Lowerer {
  locals = FIXED_LOCALS;
  labels = 0;
  memos = 0;
  /** The number of bodies of functions that the lowering put at calls (MAX_CALLS). */
  #calls = 0;
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
    b.stmts.push({ t: "check", ok: prim(KIND_CHECKS[kind], x), reason, fail: RETURN });
    return this.#typed(x, kind);
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

  check(b: Block, ok: LExpr, reason: string): void {
    b.stmts.push({ t: "check", ok, reason, fail: b.fail });
  }

  /** This method gives a new local with the value of a call of the runtime, and a check that the value is not `FALLBACK`. */
  checked(b: Block, value: LExpr, reason: string): LExpr {
    const x = this.value(b, value);
    this.check(b, prim("!==", x, FALLBACK_EXPR), reason);
    return x;
  }

  /** This method adds a failure: the interpreter always gives an error here. */
  fail(b: Block): LExpr {
    b.stmts.push({ t: "fail", fail: b.fail });
    return FALLBACK_EXPR;
  }

  expr(e: Expr, s: Scope, path: readonly number[], b: Block): LExpr {
    // Inside a node of the memo, the value of a key replaces the key. An error of the key is an error at each place.
    const key = this.#keys.get(e);
    if (key !== undefined) {
      if (key.ok !== undefined) this.check(b, key.ok, "a key with a value");
      return key.value;
    }
    const keys = this.#memo.get(e);
    return keys === undefined ? this.#node(e, s, path, b) : this.#memoized(e, keys, s, path, b);
  }

  /** This method lowers a node itself, without the memo. */
  #node(e: Expr, s: Scope, path: readonly number[], b: Block): LExpr {
    switch (e.tag) {
      case "lit":
        return this.constant(e.value);
      case "ref":
        return this.#ref(e, s, path, b);
      case "var": {
        const bound = s.env.get(e.name);
        // A function is not a value (FN.VALUE): tier 1 gives the error. A name of a loop hides a function with its name.
        if (bound === undefined && s.fns.has(e.name)) return this.fail(b);
        if (bound === undefined) {
          const x = this.checked(b, call("var", local(VARS), this.constant(e.name)), "a variable");
          return this.#declared(b, x, primitiveOf(this.#schema.vars?.[e.name]), "a variable of the schema");
        }
        if (bound.ok !== undefined) this.check(b, bound.ok, "a binding with a value");
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
        const values = Object.values(e.fields).map((x, i) => this.expr(x, s, [...path, i], b));
        return this.value(b, call("rec", this.constant(Object.keys(e.fields)), array(...values)));
      }
      case "app":
        return this.#app(e, s, path, b);
      case "fold":
        return this.#fold(e, s, path, b);
      case "iterate":
        return this.#iterate(e, s, path, b);
      case "each": {
        // A list keeps its error items, and generated code makes no error values. Thus an error item stops the program.
        const keys = this.locals++;
        const values = this.locals++;
        b.stmts.push({ t: "let", n: keys, value: array() }, { t: "let", n: values, value: array() });
        this.#loop(e, s, path, b, () => RETURN, (body, key, v) => {
          body.stmts.push({ t: "push", n: keys, value: key }, { t: "push", n: values, value: v });
        });
        return this.value(b, call("list", local(keys), local(values)));
      }
      case "ext": {
        // An extension can give the error #DEPTH!, which a list op does not skip. Thus an error of an extension stops the program.
        const x = this.value(b, call("ext", this.constant(e.kind), this.constant(e.data), s.space, s.origin, s.focus, this.constant(path)));
        b.stmts.push({ t: "check", ok: prim("!==", x, FALLBACK_EXPR), reason: "an extension", fail: RETURN });
        return x;
      }
    }
  }

  /**
   * This method gives the value of a node that depends only on the space (§7.2). The memo has an entry for each space.
   * Without the entry of the space, the node evaluates in a block, and an error of it makes an entry without a value.
   * An exception stops the program, so the memo gets no entry for it.
   */
  #memoized(e: Expr, keys: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const memo: LExpr = { t: "memo", id: this.memos++ };
    // Each key evaluates here, in a block of its own, as a binding does.
    const values = keys.map((k): Bound => this.#attempt(b, (inner) => this.expr(k, s, path, inner)));
    const tuple = array(...values.flatMap((k) => [k.value, flag(k)]));
    const h = this.locals++;
    const outer = this.#keys;
    this.#keys = new Map([...outer, ...keys.map((k, i): [Expr, Bound] => [k, values[i] as Bound])]);
    const compute = block(b.fail);
    const node = this.#attempt(compute, (inner) => this.#node(e, s, path, inner));
    this.#keys = outer;
    compute.stmts.push({ t: "set", n: h, value: prim("memoPut", memo, s.space, tuple, node.value, flag(node)) });
    b.stmts.push({ t: "let", n: h, value: prim("memoGet", memo, s.space, tuple) }, { t: "if", cond: prim("!", prim("isValue", local(h))), yes: compute.stmts, no: [] });
    this.check(b, prim("entryOk", local(h)), "a value of the memo");
    // Each entry of the memo comes from the code of the node, so it has the kind of the value of the node.
    return this.#typed(this.value(b, prim("entryValue", local(h))), this.kindOf(node.value));
  }

  /**
   * This method evaluates an expression in a block whose errors end the block, as a binding does. It gives the value
   * and the flag that tells if the value exists. Without statements, the expression always has a value, so it gets no flag.
   */
  #attempt(b: Block, make: (inner: Block) => LExpr): Bound {
    const label = this.labels++;
    const attempt = block({ t: "break", label });
    const value = make(attempt);
    if (attempt.stmts.length === 0) return { value };
    const v = this.locals++;
    const ok = this.locals++;
    this.#typed(local(v), this.kindOf(value));
    attempt.stmts.push({ t: "set", n: v, value }, { t: "set", n: ok, value: bool(true) });
    b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts });
    return { value: local(v), ok: local(ok) };
  }

  /**
   * This method reads a field, as `ref` of the interpreter: the record of the key, and then each segment of the path.
   * A segment that cannot name a field always gives an error.
   */
  #ref(e: ExprOf<"ref">, s: Scope, path: readonly number[], b: Block): LExpr {
    const record = e.at === undefined || e.at.length === 0 ? s.rec : prim("get", s.space, this.#address(e.at, s, path, 0, b));
    if (!e.path.every(isFieldName)) return this.fail(b);
    const n = this.locals++;
    const x = local(n);
    b.stmts.push({ t: "let", n, value: record });
    this.check(b, prim("isValue", x), "a record");
    for (const seg of e.path) {
      this.check(b, prim("isObject", x), "an object");
      b.stmts.push({ t: "set", n, value: prim("member", x, this.constant(seg)) });
      this.check(b, prim("isValue", x), "a field");
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
   * arguments for its parameters. The body sees the names of the place of its binding. A call that is not valid goes
   * to tier 1.
   */
  #call(e: ExprOf<"call">, s: Scope, path: readonly number[], b: Block): LExpr {
    const bound = s.env.has(e.fn) ? undefined : s.fns.get(e.fn);
    if (bound?.fn.params.length !== e.args.length) return this.fail(b);
    if (++this.#calls > MAX_CALLS) throw new Unsupported(`the calls put the bodies of functions in more than ${String(MAX_CALLS)} places`);
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
        return args.length === 0 ? this.fail(b) : this.#andOr(op === "or", args, 0, s, path, b);
      case "ifError":
        return this.#ifError(args, s, path, b);
    }
    if (isListOp(op)) {
      const target = eachUnderLets(args[0]);
      if (target !== undefined) return this.#fused(op, e, target, s, path, b);
    }
    const values = args.map((x, i) => this.expr(x, s, [...path, i], b));
    const kinds = values.map((x) => this.kindOf(x));
    // A static site checks the kind of its result, so the result has the kind that the op declares (KIND.RETURNS).
    const site = this.#facts.staticSite(op, kinds);
    const x = this.checked(b, { t: "op", name: this.index(op), args: values, kinds }, "an op");
    return this.#typed(x, site?.t === "fn" ? primitiveOf(site.returns) : undefined);
  }

  /** The condition must be a boolean. Only the branch that the condition selects is evaluated. */
  #if(args: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const [cond, yes, no] = args;
    if (cond === undefined) return this.fail(b);
    const c = this.#boolean(this.expr(cond, s, [...path, 0], b), b);
    const r = this.locals++;
    const kinds: (PrimitiveKind | undefined)[] = [];
    const branch = (x: Expr | undefined, i: number): LStmt[] => {
      const inner = block(b.fail);
      const value = x === undefined ? this.fail(inner) : this.expr(x, s, [...path, i], inner);
      kinds.push(this.kindOf(value));
      inner.stmts.push({ t: "set", n: r, value });
      return inner.stmts;
    };
    b.stmts.push({ t: "if", cond: c, yes: branch(yes, 1), no: branch(no, 2) });
    return this.#typed(local(r), join(kinds[0], kinds[1]));
  }

  /** `or` stops at the first `true`, and `and` at the first `false`. Each argument before the stop must be a boolean. */
  #andOr(isOr: boolean, args: readonly Expr[], i: number, s: Scope, path: readonly number[], b: Block, r = this.locals++): LExpr {
    const x = this.#boolean(this.expr(args[i] as Expr, s, [...path, i], b), b);
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
    if (first === undefined) return this.fail(b);
    const label = this.labels++;
    const r = this.locals++;
    const ok = this.locals++;
    const attempt = block({ t: "break", label });
    const value = this.expr(first, s, [...path, 0], attempt);
    attempt.stmts.push({ t: "set", n: r, value }, { t: "set", n: ok, value: bool(true) });
    const otherwise = block(b.fail);
    const fallback = second === undefined ? this.fail(otherwise) : this.expr(second, s, [...path, 1], otherwise);
    otherwise.stmts.push({ t: "set", n: r, value: fallback });
    b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts }, { t: "if", cond: prim("!", local(ok)), yes: otherwise.stmts, no: [] });
    return this.#typed(local(r), join(this.kindOf(value), this.kindOf(fallback)));
  }

  /** A value of a known kind needs no check. */
  #boolean(x: LExpr, b: Block): LExpr {
    if (this.kindOf(x) !== "boolean") this.check(b, prim("isBoolean", x), "a boolean");
    return x;
  }

  #number(x: LExpr, b: Block): LExpr {
    if (this.kindOf(x) !== "number") this.check(b, prim("isNumber", x), "a number");
    return x;
  }

  /**
   * This method lowers a list op over an `each` into one loop. Like the interpreter, the loop skips an error item, and
   * with the option `strict` the list op fails at an error item. `errors` gives the error values, so an error item of
   * `errors` stops the program.
   */
  #fused(op: ListOp, e: ExprOf<"app">, target: ExprOf<"each">, s: Scope, path: readonly number[], b: Block): LExpr {
    // The `let` expressions above the `each`, from the outside in.
    let inner = s;
    let at = [...path, 0];
    for (let x = e.args[0] as Expr; x.tag === "let"; x = x.body) {
      inner = { ...inner, ...this.#bind(x, inner, at, b) };
      at = [...at, Object.keys(x.bind).length];
    }
    const rest = e.args.slice(1).map((x, i) => this.expr(x, s, [...path, i + 1], b));
    const options = op === "reduce" ? rest[1] : rest[0];
    const strict = options === undefined ? undefined : this.value(b, prim("===", call("opts", options), bool(true)));
    const name = rest[0];
    if (op === "reduce") {
      if (name === undefined) return this.fail(b);
      this.check(b, prim("isString", name), "an op name");
    }
    const items = (label: number): Fail => {
      if (op === "errors") return RETURN;
      return strict === undefined ? { t: "continue", label } : { t: "continue", label, strict: { cond: strict, else: b.fail } };
    };

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
    const opCheck = (body: Block): Block => ({ stmts: body.stmts, fail: b.fail });
    const firstThen = (body: Block, v: LExpr, then: (later: Block) => LExpr): void => {
      const later = block(b.fail);
      later.stmts.push({ t: "set", n: acc, value: then(later) });
      body.stmts.push({ t: "if", cond: prim("===", local(n), num(0)), yes: [{ t: "set", n: acc, value: v }], no: later.stmts });
    };
    const nonEmpty = (): void => {
      this.check(b, prim("!==", local(n), num(0)), "a list that is not empty");
    };

    switch (op) {
      case "count":
        this.#loop(target, inner, at, b, items, (body) => count(body));
        return local(n);
      case "sum":
      case "mean":
        init(num(0));
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          body.stmts.push({ t: "set", n: acc, value: prim("+", local(acc), this.#number(v, opCheck(body))) });
          count(body);
        });
        if (op === "sum") return this.#typed(this.checked(b, call("result", local(acc)), "a finite sum"), "number");
        nonEmpty();
        return this.#typed(this.checked(b, call("result", prim("/", local(acc), local(n))), "a finite mean"), "number");
      case "min":
      case "max":
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          this.#number(v, opCheck(body));
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
          body.stmts.push({ t: "set", n: acc, value: prim(op === "all" ? "&&" : "||", local(acc), this.#boolean(v, opCheck(body))) });
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
          firstThen(body, v, (later) => this.checked(later, call("step", name as LExpr, local(acc), v), "a step of reduce"));
          count(body);
        });
        nonEmpty();
        return local(acc);
      // listReason stops a program with these ops before the lowering, so this case is defensive.
      case "sortBy":
      case "take":
      case "nth":
        /* v8 ignore next -- @preserve */
        // Stryker disable next-line all: listReason stops these ops before the lowering
        throw new Unsupported(`the list op "${op}"`);
    }
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
    const args = [s.space, s.origin, s.focus, this.constant(at), ...(values.length === 0 ? [] : [array(...values)])];
    return this.checked(b, call("addr", ...args), "an address");
  }

  #loop(e: ExprOf<"each">, s: Scope, path: readonly number[], b: Block, items: (label: number) => Fail, onItem: (body: Block, key: LExpr, value: LExpr) => void): void {
    this.#targetLoop(e.axis, e.at, s, path, 1, b, items, (body, key, at) => {
      onItem(body, key, this.expr(e.body, at, [...path, 0], body));
    });
  }

  /**
   * This method lowers the loop over the targets of an axis with the address `addr`. The tests of `where` have the child
   * indexes from `firstTest`, and the expressions of the address come after them. `each` adds the statements of a target.
   */
  #targetLoop(
    axis: Axis,
    addr: Addr | undefined,
    s: Scope,
    path: readonly number[],
    firstTest: number,
    b: Block,
    items: (label: number) => Fail,
    each: (body: Block, key: LExpr, at: Scope) => void,
  ): void {
    const from = addr === undefined || addr.length === 0 ? s.focus : this.#address(addr, s, path, firstTest + whereTests(axis).length, b);
    const base = baseAxis(axis);
    let space = s.space;
    let over: LExpr;
    let skip: LExpr | undefined;
    // The index of the record of each target: the index of the loop, or else the index that the axis gives.
    let idx: LExpr | undefined;
    if (base.t === "table") {
      // The axis table moves the evaluation to the space of its table, and there the origin is the target.
      space = this.checked(b, call("table", local(TABLES), this.constant(base.name)), "a table");
      over = call("keys", space);
    } else if (base.t === "all" || base.t === "others") {
      over = call("keys", s.space);
      if (base.t === "others") skip = from;
    } else {
      const targets = this.checked(b, { t: "targets", axis: this.index(base), args: [s.space, s.origin, from] }, "the targets of an axis");
      over = prim("keysOf", targets);
      idx = this.value(b, prim("idxOf", targets));
    }
    const records = this.value(b, prim("records", space));
    const label = this.labels++;
    const array_ = this.locals++;
    const index = this.locals++;
    const item = this.locals++;
    const key = local(item);
    const body = block(items(label));
    if (skip !== undefined) body.stmts.push({ t: "if", cond: prim("===", key, skip), yes: [{ t: "next" }], no: [] });
    const slot = idx === undefined ? local(index) : prim("member", idx, local(index));
    const at: Scope = { space, origin: base.t === "table" ? key : s.origin, focus: key, env: s.env, fns: s.fns, rec: prim("recordAt", records, slot, space, key) };
    whereTests(axis).forEach((test, i) => {
      const ok = this.#boolean(this.expr(test, at, [...path, firstTest + i], body), body);
      body.stmts.push({ t: "if", cond: prim("!", ok), yes: [{ t: "next" }], no: [] });
    });
    each(body, key, at);
    b.stmts.push({ t: "loop", label, item, index, array: array_, over, body: body.stmts });
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
    const label = this.labels++;
    const k = this.typedLocal("number");
    b.stmts.push({ t: "let", n: k, value: num(0) });
    const body = block(b.fail);
    if (e.until !== undefined) {
      const stop = this.#boolean(this.expr(e.until, inner, [...path, tests], body), body);
      body.stmts.push({ t: "check", ok: prim("!", stop), reason: "the test until", fail: { t: "break", label } });
    }
    // At the limit, an iteration without a test ends, and an iteration with a test fails.
    body.stmts.push({ t: "check", ok: prim("!==", local(k), num(e.limit)), reason: "the limit of iterate", fail: e.until === undefined ? { t: "break", label } : b.fail });
    this.#loopStep(e.step, inner, path, first, body, locals);
    body.stmts.push({ t: "set", n: k, value: prim("+", local(k), num(1)) });
    b.stmts.push({ t: "repeat", label, body: body.stmts });
    return this.expr(e.result, inner, [...path, tests + (e.until === undefined ? 0 : 1)], b);
  }

  /** This method lowers a fold (FOLD.ORDER): the loop over the targets, with a step at each target. */
  #fold(e: ExprOf<"fold">, s: Scope, path: readonly number[], b: Block): LExpr {
    const first = Object.keys(e.init).length;
    const tests = first + Object.keys(e.step).length;
    const { env, locals } = this.#loopNames(e.init, s, path, b);
    // An error of a test or of a step is the error of the fold.
    this.#targetLoop(e.axis, e.at, s, path, tests, b, () => b.fail, (body, _key, at) => {
      this.#loopStep(e.step, { ...at, env }, path, first, body, locals);
    });
    return this.expr(e.result, { ...s, env }, [...path, tests + whereTests(e.axis).length + addrExprs(e.at).length], b);
  }
}

const NEGATIVE_ZERO = Symbol("-0");

/** This function gives the flag of a bound value: its local, or `true` for a value without a flag. */
// Stryker disable next-line BooleanLiteral: a value without a flag always exists, so each constant gives the same entries
const flag = (b: Bound): LExpr => b.ok ?? bool(true);

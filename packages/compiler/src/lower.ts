/**
 * The lowering: a Vex expression becomes a program of the loop IR (docs/COMPILER.md §3.3). A list op over a direct
 * `each` becomes one loop with a running value, so it makes no list.
 *
 * Each value that the interpreter can give as an error has a check. The block of the check tells what a failure does
 * (`Fail`). A list op skips an error item, and an error in the first argument of `ifError` gives the second argument.
 * Each other error stops the program with `FALLBACK`.
 */
import { isFieldName, isListOp, MAX_NESTING, nestingOf, type Axis, type Expr, type ExprOf, type ListOp } from "@mark1russell7/vex";
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

/** The facts of the lexical position of a node: its space, its origin, its focus and its bound names. */
interface Scope {
  readonly space: LExpr;
  readonly origin: LExpr;
  readonly focus: LExpr;
  readonly env: ReadonlyMap<string, Bound>;
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

/** This function lowers an expression into a program of the loop IR. It throws `Unsupported` for an expression it cannot lower. */
export function lower(expr: Expr): LoopProgram {
  // EVAL.NESTING: tier 1 gives the error of a program that is nested too deep.
  if (nestingOf(expr) > MAX_NESTING) throw new Unsupported(`the expression is nested deeper than ${MAX_NESTING} levels`);
  const l = new Lowerer();
  const b = block(RETURN);
  l.check(b, call("has", local(SPACE), local(ORIGIN)), "the origin is a key of the space");
  const top: Scope = { space: local(SPACE), origin: local(ORIGIN), focus: local(ORIGIN), env: new Map(), rec: prim("get", local(SPACE), local(ORIGIN)) };
  const value = l.expr(expr, top, [], b);
  b.stmts.push({ t: "return", value });
  return { body: b.stmts, locals: l.locals, constants: l.constants };
}

class Lowerer {
  locals = FIXED_LOCALS;
  labels = 0;
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
    switch (e.tag) {
      case "lit":
        return this.constant(e.value);
      case "ref":
        return this.#ref(e, s, b);
      case "var": {
        const bound = s.env.get(e.name);
        if (bound === undefined) return this.checked(b, call("var", local(VARS), this.constant(e.name)), "a variable");
        if (bound.ok !== undefined) this.check(b, bound.ok, "a binding with a value");
        return bound.value;
      }
      case "let": {
        const env = this.#bind(e, s, path, b);
        return this.expr(e.body, { ...s, env }, [...path, Object.keys(e.bind).length], b);
      }
      case "rec": {
        const values = Object.values(e.fields).map((x, i) => this.expr(x, s, [...path, i], b));
        return this.value(b, call("rec", this.constant(Object.keys(e.fields)), array(...values)));
      }
      case "app":
        return this.#app(e, s, path, b);
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
   * This method reads a field, as `ref` of the interpreter: the record of the key, and then each segment of the path.
   * A segment that cannot name a field always gives an error.
   */
  #ref(e: ExprOf<"ref">, s: Scope, b: Block): LExpr {
    const record = e.at === undefined || e.at.length === 0 ? s.rec : prim("get", s.space, this.checked(b, call("addr", s.space, s.origin, s.focus, this.constant(e.at)), "an address"));
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
    return x;
  }

  /**
   * This method binds the names of a `let`. The interpreter evaluates each binding in the scope outside the `let`. An
   * error of a binding is an error only where the body reads the name. Thus an error ends the block of the binding, and
   * a flag tells each read of the name that the binding has no value.
   */
  #bind(e: ExprOf<"let">, s: Scope, path: readonly number[], b: Block): ReadonlyMap<string, Bound> {
    const env = new Map(s.env);
    Object.entries(e.bind).forEach(([name, x], i) => {
      const label = this.labels++;
      const attempt = block({ t: "break", label });
      const value = this.expr(x, s, [...path, i], attempt);
      // A binding without statements is a constant or a bound name, so it always has a value.
      if (attempt.stmts.length === 0) {
        env.set(name, { value });
        return;
      }
      const v = this.locals++;
      const ok = this.locals++;
      attempt.stmts.push({ t: "set", n: v, value }, { t: "set", n: ok, value: bool(true) });
      b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts });
      env.set(name, { value: local(v), ok: local(ok) });
    });
    return env;
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
    return this.checked(b, { t: "op", name: this.index(op), args: values }, "an op");
  }

  /** The condition must be a boolean. Only the branch that the condition selects is evaluated. */
  #if(args: readonly Expr[], s: Scope, path: readonly number[], b: Block): LExpr {
    const [cond, yes, no] = args;
    if (cond === undefined) return this.fail(b);
    const c = this.#boolean(this.expr(cond, s, [...path, 0], b), b);
    const r = this.locals++;
    const branch = (x: Expr | undefined, i: number): LStmt[] => {
      const inner = block(b.fail);
      inner.stmts.push({ t: "set", n: r, value: x === undefined ? this.fail(inner) : this.expr(x, s, [...path, i], inner) });
      return inner.stmts;
    };
    b.stmts.push({ t: "if", cond: c, yes: branch(yes, 1), no: branch(no, 2) });
    return local(r);
  }

  /** `or` stops at the first `true`, and `and` at the first `false`. Each argument before the stop must be a boolean. */
  #andOr(isOr: boolean, args: readonly Expr[], i: number, s: Scope, path: readonly number[], b: Block, r = this.locals++): LExpr {
    const x = this.#boolean(this.expr(args[i] as Expr, s, [...path, i], b), b);
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
    attempt.stmts.push({ t: "set", n: r, value: this.expr(first, s, [...path, 0], attempt) }, { t: "set", n: ok, value: bool(true) });
    const otherwise = block(b.fail);
    otherwise.stmts.push({ t: "set", n: r, value: second === undefined ? this.fail(otherwise) : this.expr(second, s, [...path, 1], otherwise) });
    b.stmts.push({ t: "let", n: ok, value: bool(false) }, { t: "block", label, body: attempt.stmts }, { t: "if", cond: prim("!", local(ok)), yes: otherwise.stmts, no: [] });
    return local(r);
  }

  #boolean(x: LExpr, b: Block): LExpr {
    this.check(b, prim("isBoolean", x), "a boolean");
    return x;
  }

  #number(x: LExpr, b: Block): LExpr {
    this.check(b, prim("isNumber", x), "a number");
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
      inner = { ...inner, env: this.#bind(x, inner, at, b) };
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
    const n = this.locals++;
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
        if (op === "sum") return this.checked(b, call("result", local(acc)), "a finite sum");
        nonEmpty();
        return this.checked(b, call("result", prim("/", local(acc), local(n))), "a finite mean");
      case "min":
      case "max":
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          this.#number(v, opCheck(body));
          firstThen(body, v, () => prim(op, local(acc), v));
          count(body);
        });
        nonEmpty();
        return local(acc);
      case "any":
      case "all":
      case "none":
        init(bool(op === "all"));
        this.#loop(target, inner, at, b, items, (body, _key, v) => {
          body.stmts.push({ t: "set", n: acc, value: prim(op === "all" ? "&&" : "||", local(acc), this.#boolean(v, opCheck(body))) });
        });
        return op === "none" ? prim("!", local(acc)) : local(acc);
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
    }
  }

  /**
   * This method lowers the loop over the targets of an axis. The tests of `where` and the body evaluate at each target
   * in a block whose failure is `items(label)`. Then `onItem` adds the statements for the value of the body.
   */
  #loop(e: ExprOf<"each">, s: Scope, path: readonly number[], b: Block, items: (label: number) => Fail, onItem: (body: Block, key: LExpr, value: LExpr) => void): void {
    const from = e.at === undefined || e.at.length === 0 ? s.focus : this.checked(b, call("addr", s.space, s.origin, s.focus, this.constant(e.at)), "an address");
    const base = baseAxis(e.axis);
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
    const at: Scope = { space, origin: base.t === "table" ? key : s.origin, focus: key, env: s.env, rec: prim("recordAt", records, slot, space, key) };
    whereTests(e.axis).forEach((test, i) => {
      const ok = this.#boolean(this.expr(test, at, [...path, i + 1], body), body);
      body.stmts.push({ t: "if", cond: prim("!", ok), yes: [{ t: "next" }], no: [] });
    });
    onItem(body, key, this.expr(e.body, at, [...path, 0], body));
    b.stmts.push({ t: "loop", label, item, index, array: array_, over, body: body.stmts });
  }
}

const NEGATIVE_ZERO = Symbol("-0");

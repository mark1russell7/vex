import { fromDocument, isDocument, type Envelope } from "./document.ts";
import { liftsAt, resolveOp, type AnyDomain, type ParamKind, type ResolvedOp } from "./domain.ts";
import { formatError, isDepthError, isStackOverflow, vexError, type ErrorKind, type VexError } from "./errors.ts";
import { addrExprs, children, shapeError, type Addr, type Axis, type Expr, type ExprOf, type FixedMove, type Move } from "./ir.ts";
import { isListOp, isVexList, vexList, type ListItem, type ListOp, type ListOptions, type VexList } from "./list.ts";
import { fail, ok, type Result } from "./result.ts";
import { axisTargets, fixAddr, resolveAddr, type Position, type Space } from "./space.ts";
import type { Read, Trace, TraceEvent, TraceSink } from "./trace.ts";

/** A free function op. The interpreter gives it the values of all arguments. */
export type FreeFn = (...args: readonly unknown[]) => unknown;

/** The context of an extension handler. */
export interface ExtContext {
  readonly space: Space;
  readonly position: Position;
  readonly path: readonly number[];
}

/** The handler of an extension expression kind. */
export type ExtHandler = (data: unknown, ctx: ExtContext) => Result<unknown>;

/** The options of an evaluation. */
export interface EvalOptions {
  /** The space that the program reads. */
  readonly space: Space;
  /** The key where the evaluation starts. Relative references read here. */
  readonly origin: string;
  /** The domains. The interpreter finds the op of a value in the first domain that accepts the value. */
  readonly domains?: readonly AnyDomain[];
  /** Free function ops, for ops that are not domain ops. */
  readonly fns?: Readonly<Record<string, FreeFn>>;
  /** The handlers of extension expression kinds. */
  readonly extensions?: Readonly<Record<string, ExtHandler>>;
  /** Variables that the program can read with `v(name)`. */
  readonly vars?: Readonly<Record<string, unknown>>;
  /** The other spaces of the evaluation, by name. The axis `table(name)` reads them. */
  readonly tables?: Readonly<Record<string, Space>>;
  /** A receiver of trace events. */
  readonly trace?: TraceSink;
}

type Env = ReadonlyMap<string, Result<unknown>>;

interface Frame {
  readonly pos: Position;
  readonly env: Env;
}

/** The name of a special form. */
export type SpecialForm = "if" | "and" | "or" | "ifError";

/** The names of the special forms. Their arguments are not evaluated before the call. */
export const SPECIAL_FORMS: ReadonlySet<string> = new Set<SpecialForm>(["if", "and", "or", "ifError"]);

const isSpecialForm = (op: string): op is SpecialForm => SPECIAL_FORMS.has(op);

/** The options that a compiled program keeps: the domains, the free functions and the extension handlers. */
export type CompileOptions = Pick<EvalOptions, "domains" | "fns" | "extensions">;

/** The options of one run of a compiled program. */
export type RunOptions = Pick<EvalOptions, "space" | "origin" | "vars" | "trace" | "tables">;

/**
 * A compiled program: the expression as a tree of functions. A program evaluates many times at different origins,
 * and over different spaces, without a new walk of the expression.
 */
export interface Program {
  /**
   * The expression of the program. For a document, it is the expression of the document. A document that is not valid
   * stays as it is, as an expression that is not valid stays (DOC.ENTRY).
   */
  readonly expr: Expr;
  /** This method evaluates the program at an origin. It does not throw. */
  run(opts: RunOptions): Result<unknown>;
  /** This method evaluates the program at an origin, with a trace of each node. */
  explain(opts: Omit<RunOptions, "trace">): Trace;
}

/** A bound function (FN.BIND): its parameters, its compiled body and the names of the place of its binding. */
class Closure {
  readonly params: readonly string[];
  readonly body: Node;
  readonly env: ReadonlyMap<string, Result<unknown>>;

  constructor(params: readonly string[], body: Node, env: ReadonlyMap<string, Result<unknown>>) {
    this.params = params;
    this.body = body;
    this.env = env;
  }
}

/** The deepest nesting of an expression that `compile` accepts (EVAL.NESTING). */
export const MAX_NESTING = 500;

const DEPTH_MESSAGE = "the evaluation is too deep for the call stack of the engine";

/** This function gives the number of nodes on the longest path from the root of `e`. It uses a stack, not recursion. */
export function nestingOf(e: Expr): number {
  let deepest = 0;
  const todo: [Expr, number][] = [[e, 1]];
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const [x, d] = item;
    if (d > deepest) deepest = d;
    for (const child of children(x)) todo.push([child, d + 1]);
  }
  return deepest;
}

/**
 * This function compiles an expression or a document (DOC.ENTRY). The result gives the same results and the same traces
 * as `evaluate`, because `evaluate` uses it too.
 */
export function compile(source: Expr | Envelope, opts: CompileOptions = {}): Program {
  // DOC.ENTRY: a document gives its expression first. A document that is not valid gives the error of fromDocument.
  const read = isDocument(source) ? fromDocument(source, opts.domains) : ok(source);
  const expr = read.ok ? read.value : (source as unknown as Expr);
  // EVAL.SHAPE: an expression that is not valid, for example from a newer version of Vex, gives an error before a walk.
  // EVAL.NESTING: a program nested too deep gives an error before the compiler walks it with recursion.
  const shape = read.ok ? shapeError(expr) : read.error.message;
  const nesting = shape === undefined ? nestingOf(expr) : 0;
  const bad = shape ?? (nesting > MAX_NESTING ? `the expression is nested ${nesting} levels deep, and the limit is ${MAX_NESTING}` : undefined);
  const kind = read.ok ? "bad-expression" : read.error.kind;
  const root: Node = bad === undefined ? new Compiler(opts).node(expr, []) : (f) => fail(vexError(kind, bad, { path: [], origin: f.pos.origin, focus: f.pos.focus }));
  const run = (r: RunOptions): Result<unknown> => {
    const { space, origin } = r;
    if (!space.has(origin)) return fail(vexError("unknown-key", `the space has no key "${origin}"`, { origin, focus: origin }));
    const env = new Map<string, Result<unknown>>(Object.entries(r.vars ?? {}).map(([k, val]) => [k, ok(val)]));
    try {
      return root({ pos: { origin, focus: origin }, env }, { space, trace: r.trace, tables: r.tables });
    } catch (thrown) {
      // A defect in an extension handler or in a test of the interpreter itself. Totality still holds.
      if (isStackOverflow(thrown)) return fail(vexError("depth", DEPTH_MESSAGE, { origin, focus: origin, thrown }));
      return fail(vexError("threw", "the evaluation threw an exception", { origin, focus: origin, thrown }));
    }
  };
  return {
    expr,
    run,
    explain: (r) => {
      const sink: TraceSink = { events: [] };
      const result = run({ ...r, trace: sink });
      return { events: sink.events, result };
    },
  };
}

// The cache of compiled programs: one entry for each expression object or document, for the last options.
const CACHE = new WeakMap<Expr | Envelope, { readonly domains: unknown; readonly fns: unknown; readonly extensions: unknown; readonly program: Program }>();

function compiled(expr: Expr | Envelope, opts: CompileOptions): Program {
  // V-056: a program that is not an object cannot be a key of the cache. Its compilation gives #VALUE! (EVAL.SHAPE).
  if (typeof expr !== "object" || expr === null) return compile(expr, opts);
  const hit = CACHE.get(expr);
  // Without the cache, each evaluation compiles again: the result is the same, so a mutant that removes a hit is
  // equivalent. A false hit changes results, and the tests find it.
  // Stryker disable next-line ConditionalExpression: a missed hit only compiles again
  if (hit !== undefined && hit.domains === opts.domains && hit.fns === opts.fns && hit.extensions === opts.extensions) return hit.program;
  const program = compile(expr, opts);
  CACHE.set(expr, { domains: opts.domains, fns: opts.fns, extensions: opts.extensions, program });
  return program;
}

/** This function evaluates an expression or a document at the origin of a space. It does not throw. */
export function evaluate(expr: Expr | Envelope, opts: EvalOptions): Result<unknown> {
  return compiled(expr, opts).run(opts);
}

/** This function evaluates an expression or a document and records a trace of each node. */
export function explain(expr: Expr | Envelope, opts: Omit<EvalOptions, "trace">): Trace {
  return compiled(expr, opts).explain(opts);
}

/** The state of one run that the nodes read: the space, the trace sink and the other spaces. */
interface Ctx {
  readonly space: Space;
  readonly trace: TraceSink | undefined;
  readonly tables: Readonly<Record<string, Space>> | undefined;
}

/** This function gives the axis inside the `where` axes of an axis. */
const baseAxis = (a: Axis): Exclude<Axis, { readonly t: "where" }> => (a.t === "where" ? baseAxis(a.axis) : a);

/** A compiled node: it evaluates in a frame of a run. */
type Node = (f: Frame, c: Ctx) => Result<unknown>;

/** The static facts of a node for its trace events. */
interface Info {
  readonly path: readonly number[];
  readonly tag: Expr["tag"];
  readonly label: string;
}

class Compiler {
  readonly #domains: readonly AnyDomain[];
  readonly #fns: Readonly<Record<string, FreeFn>> | undefined;
  readonly #extensions: Readonly<Record<string, ExtHandler>> | undefined;

  constructor(opts: CompileOptions) {
    // Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain matches no value
    this.#domains = opts.domains ?? [];
    this.#fns = opts.fns;
    this.#extensions = opts.extensions;
  }

  #err(kind: ErrorKind, message: string, f: Frame, path: readonly number[], extra: { op?: string; causes?: readonly VexError[]; thrown?: unknown } = {}): Result<never> {
    return fail(vexError(kind, message, { path, origin: f.pos.origin, focus: f.pos.focus, ...extra }));
  }

  #emit(c: Ctx, info: Info, f: Frame, result: Result<unknown>, reads?: readonly Read[]): Result<unknown> {
    if (c.trace !== undefined) {
      const event: TraceEvent = {
        path: info.path,
        tag: info.tag,
        label: info.label,
        origin: f.pos.origin,
        focus: f.pos.focus,
        ...(reads === undefined ? {} : { reads }),
        result,
      };
      c.trace.events.push(event);
    }
    return result;
  }

  /** This method compiles the expression `e` at the position `path` of the tree. */
  node(e: Expr, path: readonly number[]): Node {
    const info: Info = { path, tag: e.tag, label: labelOf(e) };
    switch (e.tag) {
      case "lit": {
        const r = ok(e.value);
        return (f, c) => this.#emit(c, info, f, r);
      }
      case "ref":
        return this.#ref(e, info);
      case "var": {
        const name = e.name;
        return (f, c) => {
          const bound = f.env.get(name);
          // A function is not a value (FN.VALUE).
          if (bound?.ok === true && bound.value instanceof Closure) return this.#emit(c, info, f, this.#err("kind-mismatch", `the name "${name}" is a function, not a value`, f, path));
          return this.#emit(c, info, f, bound ?? this.#err("unbound", `the name "${name}" has no binding`, f, path));
        };
      }
      case "fn":
        return this.#fn(e, path);
      case "call":
        return this.#callFn(e, info);
      case "let": {
        const binds = Object.entries(e.bind).map(([name, be], i): readonly [string, Node] => [name, this.node(be, [...path, i])]);
        const body = this.node(e.body, [...path, binds.length]);
        return (f, c) => {
          const env = new Map(f.env);
          for (const [name, n] of binds) env.set(name, n(f, c));
          return this.#emit(c, info, f, body({ pos: f.pos, env }, c));
        };
      }
      case "rec": {
        const names = Object.keys(e.fields);
        const fields = this.#nodes(Object.values(e.fields), path);
        return (f, c) => {
          const values = this.#all(fields, f, c, path, "fields");
          if (!values.ok) return this.#emit(c, info, f, values);
          const out: Record<string, unknown> = {};
          names.forEach((n, i) => {
            out[n] = values.value[i];
          });
          return this.#emit(c, info, f, ok(Object.freeze(out)));
        };
      }
      case "app":
        return isSpecialForm(e.op) ? this.#special(e.op, this.#nodes(e.args, path), info) : this.#app(e.op, this.#nodes(e.args, path), info);
      case "each":
        return this.#each(e, info);
      case "fold":
        return this.#fold(e, info);
      case "iterate":
        return this.#iterate(e, info);
      case "ext": {
        const extensions = this.#extensions ?? {};
        const handler = Object.hasOwn(extensions, e.kind) ? extensions[e.kind] : undefined;
        const { kind, data } = e;
        if (handler === undefined) return (f, c) => this.#emit(c, info, f, this.#err("unknown-op", `no handler for the extension kind "${kind}"`, f, path));
        return (f, c) =>
          this.#emit(c, info, f, this.#locate(this.#guard(() => handler(data, { space: c.space, position: f.pos, path }), f, path, kind), f, path));
      }
    }
  }

  #nodes(es: readonly Expr[], path: readonly number[]): readonly Node[] {
    return es.map((x, i) => this.node(x, [...path, i]));
  }

  /**
   * This method compiles a function (FN.BIND). Its value is a closure: the parameters, the body, and the names of the
   * place of its binding. A binding of `let` does not see the other bindings, so a function cannot call itself.
   */
  #fn(e: ExprOf<"fn">, path: readonly number[]): Node {
    const body = this.node(e.body, [...path, 0]);
    return (f) => ok(new Closure(e.params, body, f.env));
  }

  /**
   * This method compiles a call (FN.CALL, FN.ARGS). Each parameter gets the result of its argument at the call, so an
   * argument that fails has an effect only where the body reads it. The body evaluates at the position of the call.
   */
  #callFn(e: ExprOf<"call">, info: Info): Node {
    const { path } = info;
    const args = this.#nodes(e.args, path);
    return (f, c) => {
      const bound = f.env.get(e.fn);
      if (bound === undefined) return this.#emit(c, info, f, this.#err("unbound", `the function "${e.fn}" has no binding`, f, path));
      if (!bound.ok) return this.#emit(c, info, f, bound);
      const callee = bound.value;
      if (!(callee instanceof Closure)) return this.#emit(c, info, f, this.#err("kind-mismatch", `the name "${e.fn}" is a value, not a function`, f, path));
      if (callee.params.length !== args.length) return this.#emit(c, info, f, this.#err("bad-expression", `the function "${e.fn}" takes ${String(callee.params.length)} arguments, not ${String(args.length)}`, f, path));
      const env = new Map(callee.env);
      callee.params.forEach((p, i) => env.set(p, (args[i] as Node)(f, c)));
      return this.#emit(c, info, f, callee.body({ pos: f.pos, env }, c));
    };
  }

  /** This method gives an error of a handler the path, the origin and the focus of its node, if it has no origin. */
  #locate(r: Result<unknown>, f: Frame, path: readonly number[]): Result<unknown> {
    if (r.ok || r.error.origin !== undefined) return r;
    return fail({ ...r.error, path, origin: f.pos.origin, focus: f.pos.focus });
  }

  #guard(run: () => Result<unknown>, f: Frame, path: readonly number[], op: string): Result<unknown> {
    try {
      return run();
    } catch (thrown) {
      return this.#threw(thrown, `"${op}" threw an exception`, f, path, { op });
    }
  }

  /** This method gives the error of an exception: `#DEPTH!` for a full call stack, and `#CALC!` for each other exception. */
  #threw(thrown: unknown, message: string, f: Frame, path: readonly number[], extra: Partial<VexError> = {}): Result<never> {
    return isStackOverflow(thrown) ? this.#err("depth", DEPTH_MESSAGE, f, path, { ...extra, thrown }) : this.#err("threw", message, f, path, { ...extra, thrown });
  }

  /**
   * This method compiles an address. Its function gives the key where the address points. The expressions of the
   * computed moves evaluate first, at the position of the node, and their child indexes start at `first`. An error of
   * an expression keeps its path, and an error of a move gets the path of the node.
   */
  #address(at: Addr, path: readonly number[], first: number): (f: Frame, c: Ctx) => Result<string> {
    const nodes = addrExprs(at).map((x, i) => this.node(x, [...path, first + i]));
    const moved = (r: Result<string>): Result<string> => (r.ok ? r : fail({ ...r.error, path }));
    if (nodes.length === 0) return (f, c) => moved(resolveAddr(c.space, f.pos, at as readonly FixedMove[]));
    return (f, c) => {
      const values: unknown[] = [];
      for (const n of nodes) {
        const r = n(f, c);
        if (!r.ok) return r;
        values.push(r.value);
      }
      const fixed = fixAddr(at, values, f.pos);
      return fixed.ok ? moved(resolveAddr(c.space, f.pos, fixed.value)) : moved(fixed);
    };
  }

  #ref(e: ExprOf<"ref">, info: Info): Node {
    const { path } = info;
    const segs = e.path;
    const at = e.at ?? [];
    const address = this.#address(at, path, 0);
    const label = segs.join(".");
    const steps = segs.map((seg, i) => ({ seg, where: segs.slice(0, i + 1).join("."), valid: isFieldName(seg) }));
    return (f, c) => {
      let key = f.pos.focus;
      // The empty address resolves to the focus, so this fast path changes no result.
      // Stryker disable next-line ConditionalExpression,EqualityOperator: resolveAddr of [] gives the focus too
      if (at.length > 0) {
        const where = address(f, c);
        if (!where.ok) return this.#emit(c, info, f, where);
        key = where.value;
      }
      const failed = (r: Result<unknown>): Result<unknown> => this.#emit(c, info, f, r, [{ key, path: segs, ok: false }]);
      const missing = (where: string): Result<unknown> => failed(this.#err("missing-field", `the record at "${key}" has no value at "${where}"`, f, path));
      let value: unknown = c.space.get(key);
      if (value === undefined || value === null) return missing(label === "" ? "(record)" : label);
      for (const { seg, where, valid } of steps) {
        if ((typeof value !== "object" && typeof value !== "function") || !valid) return missing(where);
        try {
          value = Reflect.get(value, seg);
        } catch (thrown) {
          return failed(this.#threw(thrown, `reading "${where}" at "${key}" threw an exception`, f, path));
        }
        if (value === undefined || value === null) return missing(where);
      }
      return this.#emit(c, info, f, ok(value), [{ key, path: segs, ok: true }]);
    };
  }

  /** This method evaluates nodes applicatively. One failure stays as it is. Two or more give `#ARGS`. */
  #all(nodes: readonly Node[], f: Frame, c: Ctx, path: readonly number[], what: string): Result<readonly unknown[]> {
    const values: unknown[] = [];
    let first: VexError | undefined;
    let errors: VexError[] | undefined;
    for (const n of nodes) {
      const r = n(f, c);
      if (r.ok) values.push(r.value);
      else if (first === undefined) first = r.error;
      else (errors ??= [first]).push(r.error);
    }
    if (first === undefined) return ok(values);
    // A #DEPTH! argument is the result, so #ARGS does not wrap it, and ifError cannot hide it.
    const depth = [first, ...(errors ?? [])].find(isDepthError);
    if (depth !== undefined) return fail(depth);
    return errors === undefined ? fail(first) : this.#err("args", `${errors.length} ${what} failed`, f, path, { causes: errors });
  }

  #each(e: ExprOf<"each">, info: Info): Node {
    const { path } = info;
    const at = e.at ?? [];
    const counter = { next: 1 };
    const targets = this.#targets(e.axis, path, counter);
    const body = this.node(e.body, [...path, 0]);
    const address = this.#address(at, path, counter.next);
    return (f, c) => {
      // An axis with an address finds its targets from the key of the address. The origin does not change.
      let from = f;
      // Stryker disable next-line ConditionalExpression,EqualityOperator: resolveAddr of [] gives the focus too
      if (at.length > 0) {
        const where = address(f, c);
        if (!where.ok) return this.#emit(c, info, f, where);
        from = { pos: { origin: f.pos.origin, focus: where.value }, env: f.env };
      }
      // The axis table moves the evaluation to the space of its table, where the origin of this space is not a key.
      // Thus there the origin is the target, and a value of this space goes in through a variable.
      const base = baseAxis(e.axis);
      let inner = c;
      if (base.t === "table") {
        const space = c.tables !== undefined && Object.hasOwn(c.tables, base.name) ? c.tables[base.name] : undefined;
        if (space === undefined) return this.#emit(c, info, f, this.#err("no-table", `the evaluation has no table "${base.name}"`, f, path));
        inner = { ...c, space };
      }
      const ts = targets(from, inner);
      if (!ts.ok) return this.#emit(c, info, f, ts);
      const items: ListItem[] = ts.value.map(({ key, test }) => {
        if (test !== undefined && !test.ok) return { key, result: test };
        return { key, result: body({ pos: { origin: base.t === "table" ? key : f.pos.origin, focus: key }, env: f.env }, inner) };
      });
      return this.#emit(c, info, f, ok(vexList(items)));
    };
  }

  /**
   * This method compiles the names of a loop: `init` at the indexes from 0, and `step` after them (LOOP.NAMES). Its
   * functions give the first values, and the values after one step. The first error stops each of them.
   */
  #names(e: ExprOf<"fold"> | ExprOf<"iterate">, path: readonly number[]): {
    readonly first: (f: Frame, c: Ctx) => Result<Map<string, Result<unknown>>>;
    readonly next: (f: Frame, c: Ctx) => Result<Map<string, Result<unknown>>>;
  } {
    const inits = Object.entries(e.init).map(([name, x], i) => [name, this.node(x, [...path, i])] as const);
    const steps = Object.entries(e.step).map(([name, x], i) => [name, this.node(x, [...path, inits.length + i])] as const);
    return {
      first: (f, c) => {
        const env = new Map(f.env);
        for (const [name, n] of inits) {
          const r = n(f, c);
          if (!r.ok) return r;
          env.set(name, r);
        }
        return ok(env);
      },
      // Each value of a step reads the values before the step, so the names change only after all the values.
      next: (f, c) => {
        const values: (readonly [string, Result<unknown>])[] = [];
        for (const [name, n] of steps) {
          const r = n(f, c);
          if (!r.ok) return r;
          values.push([name, r]);
        }
        const env = new Map(f.env);
        for (const [name, r] of values) env.set(name, r);
        return ok(env);
      },
    };
  }

  /**
   * This method compiles a fold (FOLD.ORDER, FOLD.ERROR). `init` evaluates at the node, then the address and the
   * targets. A step evaluates at each target in order. `result` evaluates at the node with the last values.
   */
  #fold(e: ExprOf<"fold">, info: Info): Node {
    const { path } = info;
    const at = e.at ?? [];
    const names = this.#names(e, path);
    const counter = { next: Object.keys(e.init).length + Object.keys(e.step).length };
    const targets = this.#targets(e.axis, path, counter);
    const address = this.#address(at, path, counter.next);
    const result = this.node(e.result, [...path, counter.next + addrExprs(at).length]);
    const base = baseAxis(e.axis);
    return (f, c) => {
      const first = names.first(f, c);
      if (!first.ok) return this.#emit(c, info, f, first);
      let env = first.value;
      let from = f;
      // Stryker disable next-line ConditionalExpression,EqualityOperator: resolveAddr of [] gives the focus too
      if (at.length > 0) {
        const where = address(f, c);
        if (!where.ok) return this.#emit(c, info, f, where);
        from = { pos: { origin: f.pos.origin, focus: where.value }, env: f.env };
      }
      let inner = c;
      if (base.t === "table") {
        const space = c.tables !== undefined && Object.hasOwn(c.tables, base.name) ? c.tables[base.name] : undefined;
        if (space === undefined) return this.#emit(c, info, f, this.#err("no-table", `the evaluation has no table "${base.name}"`, f, path));
        inner = { ...c, space };
      }
      const ts = targets(from, inner);
      if (!ts.ok) return this.#emit(c, info, f, ts);
      for (const { key, test } of ts.value) {
        if (test !== undefined && !test.ok) return this.#emit(c, info, f, test);
        const after = names.next({ pos: { origin: base.t === "table" ? key : f.pos.origin, focus: key }, env }, inner);
        if (!after.ok) return this.#emit(c, info, f, after);
        env = after.value;
      }
      return this.#emit(c, info, f, result({ pos: f.pos, env }, c));
    };
  }

  /**
   * This method compiles an iteration (ITERATE.LIMIT, ITERATE.UNTIL, ITERATE.ERROR). The test `until` evaluates before
   * each step and after the last step. `result` evaluates with the last values.
   */
  #iterate(e: ExprOf<"iterate">, info: Info): Node {
    const { path } = info;
    const names = this.#names(e, path);
    const untilAt = Object.keys(e.init).length + Object.keys(e.step).length;
    const untilPath = [...path, untilAt];
    const until = e.until === undefined ? undefined : this.node(e.until, untilPath);
    const result = this.node(e.result, [...path, untilAt + (until === undefined ? 0 : 1)]);
    const { limit } = e;
    return (f, c) => {
      const first = names.first(f, c);
      if (!first.ok) return this.#emit(c, info, f, first);
      let env = first.value;
      for (let k = 0; ; k++) {
        const frame: Frame = { pos: f.pos, env };
        if (until !== undefined) {
          const t = until(frame, c);
          if (!t.ok) return this.#emit(c, info, f, t);
          if (t.value === true) break;
          if (t.value !== false) return this.#emit(c, info, f, this.#err("kind-mismatch", `the test "until" of "iterate" gave a ${typeof t.value}, not a boolean`, f, untilPath));
        }
        if (k === limit) {
          if (until !== undefined) return this.#emit(c, info, f, this.#err("limit", `"iterate" made its ${String(limit)} steps, and its test "until" is not true`, f, path));
          break;
        }
        const after = names.next(frame, c);
        if (!after.ok) return this.#emit(c, info, f, after);
        env = after.value;
      }
      return this.#emit(c, info, f, result({ pos: f.pos, env }, c));
    };
  }

  /** This method compiles the targets of an axis. For `where`, a failed test keeps the target with its error. */
  #targets(a: Axis, path: readonly number[], counter: { next: number }): (f: Frame, c: Ctx) => Result<readonly { readonly key: string; readonly test?: Result<unknown> }[]> {
    if (a.t === "table") return (_f, c) => ok(c.space.keys.map((key) => ({ key })));
    const base = a.t === "reverse" ? a.axis : a;
    if (base.t === "list") return this.#listTargets(base.list, a.t === "reverse", path, counter);
    if (a.t !== "where") {
      return (f, c) => {
        const keys = axisTargets(c.space, f.pos, a);
        return keys.ok ? ok(keys.value.map((key) => ({ key }))) : fail({ ...keys.error, path });
      };
    }
    const inner = this.#targets(a.axis, path, counter);
    const testPath = [...path, counter.next++];
    const test = this.node(a.test, testPath);
    // In the space of the axis table, the origin of the test is the target, as for the body.
    const sameOrigin = baseAxis(a).t === "table";
    return (f, c) => {
      const ts = inner(f, c);
      if (!ts.ok) return ts;
      const out: { key: string; test?: Result<unknown> }[] = [];
      for (const t of ts.value) {
        if (t.test !== undefined && !t.test.ok) {
          out.push(t);
          continue;
        }
        const at: Frame = { pos: { origin: sameOrigin ? t.key : f.pos.origin, focus: t.key }, env: f.env };
        const r = test(at, c);
        if (!r.ok) out.push({ key: t.key, test: r });
        else if (r.value === true) out.push({ key: t.key });
        else if (r.value !== false) {
          out.push({ key: t.key, test: this.#err("kind-mismatch", `the test of "where" gave a ${typeof r.value}, not a boolean`, at, testPath) });
        }
      }
      return ok(out);
    };
  }

  /**
   * This method compiles the targets of the axis list (AXIS.LIST): the keys of the items of a list, in its order. The
   * expression evaluates at the key of the address. An error item keeps its target with its error.
   */
  #listTargets(list: Expr, reverse: boolean, path: readonly number[], counter: { next: number }): (f: Frame, c: Ctx) => Result<readonly { readonly key: string; readonly test?: Result<unknown> }[]> {
    const node = this.node(list, [...path, counter.next++]);
    return (f, c) => {
      const r = node(f, c);
      if (!r.ok) return r;
      if (!isVexList(r.value)) return this.#err("kind-mismatch", `the axis "list" needs a list, not a ${describeType(r.value)}`, f, path);
      const items = r.value.items.map(({ key, result }) => (result.ok ? { key } : { key, test: result }));
      return ok(reverse ? items.toReversed() : items);
    };
  }

  #app(op: string, args: readonly Node[], info: Info): Node {
    const { path } = info;
    const listOp = isListOp(op) ? op : undefined;
    const fn = this.#fns !== undefined && Object.hasOwn(this.#fns, op) ? this.#fns[op] : undefined;
    return (f, c) => {
      const all = this.#all(args, f, c, path, "arguments");
      if (!all.ok) return this.#emit(c, info, f, all);
      const values = all.value;
      const self = values[0];
      if (listOp !== undefined && isVexList(self)) return this.#emit(c, info, f, this.#listOp(listOp, self, values.slice(1), f, path));
      let accepted: AnyDomain | undefined;
      // Without arguments, the receiver is undefined, and no domain of a test accepts it.
      // Stryker disable next-line ConditionalExpression,EqualityOperator: the loop finds no domain for undefined
      if (values.length > 0) {
        for (const d of this.#domains) {
          if (!safeIs(d, self)) continue;
          accepted ??= d;
          const resolved = resolveOp(d, self, op);
          if (resolved !== undefined) return this.#emit(c, info, f, this.#call(resolved, op, values.slice(1), f, path));
        }
      }
      if (fn !== undefined) return this.#emit(c, info, f, this.#checkResult(this.#invoke(() => fn(...values), op, f, path), f, path, op));
      if (accepted !== undefined) return this.#emit(c, info, f, this.#err("unknown-op", `the domain "${accepted.name}" has no op "${op}"`, f, path, { op }));
      if (values.length === 0) return this.#emit(c, info, f, this.#err("unknown-op", `there is no function "${op}"`, f, path, { op }));
      return this.#emit(c, info, f, this.#err("not-instance", `no domain accepts the receiver of "${op}" (${describeType(self)})`, f, path, { op }));
    };
  }

  #special(op: SpecialForm, args: readonly Node[], info: Info): Node {
    const { path } = info;
    const arg = (i: number, f: Frame, c: Ctx): Result<unknown> => {
      const n = args[i];
      return n === undefined ? this.#err("bad-expression", `"${op}" needs argument ${i + 1}`, f, path, { op }) : n(f, c);
    };
    const bool = (i: number, f: Frame, c: Ctx): Result<boolean> => {
      const r = arg(i, f, c);
      if (!r.ok) return r;
      return typeof r.value === "boolean" ? ok(r.value) : this.#err("kind-mismatch", `argument ${i + 1} of "${op}" is a ${describeType(r.value)}, not a boolean`, f, path, { op });
    };
    switch (op) {
      case "if":
        return (f, c) => {
          const cond = bool(0, f, c);
          return this.#emit(c, info, f, cond.ok ? arg(cond.value ? 1 : 2, f, c) : cond);
        };
      case "and":
      case "or": {
        const stop = op === "or";
        return (f, c) => {
          if (args.length === 0) return this.#emit(c, info, f, this.#err("bad-expression", `"${op}" needs at least 1 argument`, f, path, { op }));
          for (let i = 0; i < args.length; i++) {
            const b = bool(i, f, c);
            if (!b.ok) return this.#emit(c, info, f, b);
            if (b.value === stop) return this.#emit(c, info, f, ok(b.value));
          }
          return this.#emit(c, info, f, ok(!stop));
        };
      }
      case "ifError":
        return (f, c) => {
          const first = arg(0, f, c);
          // EVAL.DEPTH: ifError does not hide #DEPTH!, because the engine, not the data, failed.
          return this.#emit(c, info, f, first.ok || isDepthError(first.error) ? first : arg(1, f, c));
        };
    }
  }

  #call(op: ResolvedOp, name: string, rest: readonly unknown[], f: Frame, path: readonly number[]): Result<unknown> {
    const { domain, spec } = op;
    const lift = spec.liftScalar;
    const from = domain.fromScalar;
    let callArgs: readonly unknown[] = rest;
    if (lift && from !== undefined) {
      const lifted = this.#invoke(() => rest.map((a, i): unknown => (typeof a === "number" && liftsAt(lift, i) ? from(a) : a)), `${domain.name}.fromScalar`, f, path);
      if (!lifted.ok) return lifted;
      callArgs = lifted.value as readonly unknown[];
    }
    if (spec.params !== undefined) {
      for (let i = 0; i < callArgs.length; i++) {
        const kind = spec.params[i] ?? "any";
        if (!matchesKind(kind, callArgs[i], domain)) {
          const k: ErrorKind = kind === "domain" ? "not-instance" : "kind-mismatch";
          return this.#err(k, `argument ${i + 1} of "${name}" is a ${describeType(callArgs[i])}, not a ${kind === "domain" ? domain.name : kind}`, f, path, { op: name });
        }
      }
    }
    return this.#checkResult(this.#invoke(() => op.call(callArgs), name, f, path), f, path, name);
  }

  #invoke(run: () => unknown, op: string, f: Frame, path: readonly number[]): Result<unknown> {
    try {
      return ok(run());
    } catch (thrown) {
      return this.#threw(thrown, `"${op}" threw an exception`, f, path, { op });
    }
  }

  /** This method checks the value that an op gave: no `undefined`, finite numbers, and valid domain values. */
  #checkResult(r: Result<unknown>, f: Frame, path: readonly number[], op: string): Result<unknown> {
    if (!r.ok) return r;
    const value = r.value;
    const extra = { op };
    if (value === undefined || value === null) return this.#err("undefined-result", `"${op}" gave no value`, f, path, extra);
    if (typeof value === "number" && !Number.isFinite(value)) return this.#err("not-finite", `"${op}" gave ${value}`, f, path, extra);
    const d = this.#domains.find((dom) => safeIs(dom, value));
    if (d?.valid !== undefined) {
      let valid: boolean;
      try {
        valid = d.valid(value);
      } catch (thrown) {
        return this.#threw(thrown, `the "valid" check of "${d.name}" threw an exception`, f, path, extra);
      }
      if (!valid) return this.#err("invalid-value", `"${op}" gave a value that is not a valid ${d.name}`, f, path, extra);
    }
    return r;
  }

  #listOp(op: ListOp, list: VexList, rest: readonly unknown[], f: Frame, path: readonly number[]): Result<unknown> {
    // The options come after the second argument of an op with one, for example the count of take.
    const optsArg = WITH_ARGUMENT.has(op) ? rest[1] : rest[0];
    const strict = (optsArg as ListOptions | null | undefined)?.strict === true;
    const good = goodItems(list, strict);
    if (!good.ok) return good;
    const okItems = good.value;
    // Stryker disable next-line ConditionalExpression,ArrayDeclaration: each item of okItems has a value
    const okValues = okItems.flatMap((it) => (it.result.ok ? [it.result.value] : []));
    const numbers = (): Result<readonly number[]> => {
      const bad = okValues.find((x) => typeof x !== "number");
      return bad === undefined ? ok(okValues as readonly number[]) : this.#err("kind-mismatch", `"${op}" needs numbers, but an item is a ${describeType(bad)}`, f, path, { op });
    };
    const booleans = (): Result<readonly boolean[]> => {
      const bad = okValues.find((x) => typeof x !== "boolean");
      return bad === undefined ? ok(okValues as readonly boolean[]) : this.#err("kind-mismatch", `"${op}" needs booleans, but an item is a ${describeType(bad)}`, f, path, { op });
    };
    const empty = (): Result<never> => this.#err("empty", `"${op}" has no values to work with`, f, path, { op });
    // A count or a position of take, drop and nth is a whole number from 0.
    const whole = (): Result<number> => {
      const n = rest[0] as number;
      return Number.isSafeInteger(n) && n >= 0 ? ok(n) : this.#err("kind-mismatch", `"${op}" needs a whole number from 0, not ${describeType(n)}`, f, path, { op });
    };
    // The second list of append and without follows the rules of the first list (LIST.BUILD).
    const other = (): Result<readonly ListItem[]> => (isVexList(rest[0]) ? goodItems(rest[0], strict) : this.#err("kind-mismatch", `"${op}" needs a list as its second argument, not a ${describeType(rest[0])}`, f, path, { op }));
    switch (op) {
      case "sortBy":
        return this.#sortBy(okItems, okValues, f, path);
      case "take":
      case "drop": {
        const n = whole();
        if (!n.ok) return n;
        return ok(vexList(op === "take" ? okItems.slice(0, n.value) : okItems.slice(n.value)));
      }
      case "append": {
        const more = other();
        return more.ok ? ok(vexList([...okItems, ...more.value])) : more;
      }
      case "without": {
        const more = other();
        if (!more.ok) return more;
        const gone = new Set(more.value.map((it) => it.key));
        return ok(vexList(okItems.filter((it) => !gone.has(it.key))));
      }
      case "flat":
        return this.#flat(okValues, strict, f, path);
      case "nth": {
        const i = whole();
        if (!i.ok) return i;
        return i.value < okValues.length ? ok(okValues[i.value]) : this.#err("empty", `"nth" has no item at the position ${String(i.value)}, and the list has ${String(okValues.length)} items`, f, path, { op });
      }
      case "count":
        return ok(okValues.length);
      case "values":
        return ok(Object.freeze([...okValues]));
      case "keys":
        return ok(Object.freeze(okItems.map((it) => it.key)));
      case "errors":
        return ok(Object.freeze(list.items.flatMap((it) => (it.result.ok ? [] : [it.result.error]))));
      case "first":
        return okValues.length > 0 ? ok(okValues[0]) : empty();
      case "sum": {
        const n = numbers();
        return n.ok ? this.#checkResult(ok(n.value.reduce((s, x) => s + x, 0)), f, path, op) : n;
      }
      case "mean": {
        const n = numbers();
        if (!n.ok) return n;
        return n.value.length === 0 ? empty() : this.#checkResult(ok(n.value.reduce((s, x) => s + x, 0) / n.value.length), f, path, op);
      }
      case "min":
      case "max": {
        const n = numbers();
        if (!n.ok) return n;
        if (n.value.length === 0) return empty();
        return ok(n.value.reduce((best, x) => (op === "min" ? Math.min(best, x) : Math.max(best, x))));
      }
      case "any":
      case "all":
      case "none": {
        const b = booleans();
        if (!b.ok) return b;
        if (op === "any") return ok(b.value.some((x) => x));
        if (op === "all") return ok(b.value.every((x) => x));
        return ok(!b.value.some((x) => x));
      }
      case "reduce":
        return this.#reduce(rest[0], okValues, f, path, optsArg);
    }
  }

  /**
   * This method joins the lists that are the values of the items of a list, in order (LIST.FLAT). Each list follows the
   * rules of LIST.BUILD. A value that is not a list gives `#VALUE!`.
   */
  #flat(values: readonly unknown[], strict: boolean, f: Frame, path: readonly number[]): Result<VexList> {
    const out: ListItem[] = [];
    for (const inner of values) {
      if (!isVexList(inner)) return this.#err("kind-mismatch", `"flat" needs a list as the value of each item, but an item is a ${describeType(inner)}`, f, path, { op: "flat" });
      const good = goodItems(inner, strict);
      if (!good.ok) return good;
      out.push(...good.value);
    }
    return ok(vexList(out));
  }

  /**
   * This method sorts the items of a list by their values, from the smallest (LIST.SORT). The sort is stable. The values
   * are all numbers without NaN, or all texts. Texts compare by their UTF-16 code units.
   */
  #sortBy(items: readonly ListItem[], values: readonly unknown[], f: Frame, path: readonly number[]): Result<VexList> {
    const kind = typeof values[0];
    const bad = values.findIndex((x) => typeof x !== kind || (kind !== "number" && kind !== "string") || Number.isNaN(x));
    if (bad >= 0) return this.#err("kind-mismatch", `"sortBy" needs numbers without NaN or texts, all of one kind, but an item is ${Number.isNaN(values[bad]) ? "NaN" : `a ${describeType(values[bad])}`}`, f, path, { op: "sortBy" });
    const order = values.map((_x, i) => i).toSorted((i, j) => {
      const a = values[i] as number | string;
      const b = values[j] as number | string;
      // The sort of Node reads only a negative result, and the sort of another engine needs the whole comparison.
      // Stryker disable next-line ConditionalExpression,EqualityOperator: see the comment above
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return ok(vexList(order.map((i) => items[i] as ListItem)));
  }

  /**
   * This method folds the values with a domain op, from the left. An empty list gives the identity of the op, if one
   * domain has an identity for the op (LIST.EMPTY). The option `domain` names that domain when more domains have one.
   */
  #reduce(opName: unknown, values: readonly unknown[], f: Frame, path: readonly number[], opts: unknown): Result<unknown> {
    if (typeof opName !== "string") return this.#err("kind-mismatch", `"reduce" needs an op name, but got a ${describeType(opName)}`, f, path, { op: "reduce" });
    if (values.length === 0) {
      const named = (opts as { domain?: unknown } | null | undefined)?.domain;
      const candidates = this.#domains.filter((d) => Object.hasOwn(d.ops, opName) && (d.ops[opName] as { identity?: () => unknown }).identity !== undefined && (named === undefined || d.name === named));
      if (named !== undefined && !this.#domains.some((d) => d.name === named)) {
        return this.#err("unknown-op", `"reduce" names the domain ${JSON.stringify(named)}, but the program has no such domain`, f, path, { op: opName });
      }
      const [only, second] = candidates;
      if (only === undefined) return this.#err("empty", `"reduce" with "${opName}" has no values and the op has no identity`, f, path, { op: opName });
      if (second !== undefined) {
        const names = candidates.map((d) => d.name).join(", ");
        return this.#err("empty", `"reduce" with "${opName}" has no values, and more domains have an identity for it (${names}). Name one with { domain }`, f, path, { op: opName });
      }
      return this.#invoke((only.ops[opName] as { identity: () => unknown }).identity, opName, f, path);
    }
    let acc: unknown = values[0];
    for (let i = 1; i < values.length; i++) {
      const d = this.#domains.find((dom) => safeIs(dom, acc) && resolveOp(dom, acc, opName) !== undefined);
      const op = d === undefined ? undefined : resolveOp(d, acc, opName);
      if (op === undefined) return this.#err("unknown-op", `no domain gives "${opName}" for a ${describeType(acc)}`, f, path, { op: opName });
      const r = this.#call(op, opName, [values[i]], f, path);
      if (!r.ok) return r;
      acc = r.value;
    }
    return ok(acc);
  }
}

/** The list ops with a second argument before their options: a count, a position, an op name or a list. */
const WITH_ARGUMENT: ReadonlySet<ListOp> = new Set<ListOp>(["reduce", "take", "nth", "drop", "append", "without"]);

/**
 * This function gives the items of a list that have a value (LIST.LENIENT). A list op does not skip `#DEPTH!`, so that
 * error comes first (EVAL.DEPTH). With `strict`, the first error item is the result.
 */
function goodItems(list: VexList, strict: boolean): Result<readonly ListItem[]> {
  const depth = list.items.find((it) => !it.result.ok && isDepthError(it.result.error))?.result;
  if (depth !== undefined && !depth.ok) return fail(depth.error);
  const firstError = list.items.find((it) => !it.result.ok)?.result;
  if (strict && firstError !== undefined && !firstError.ok) return fail(firstError.error);
  return ok(list.items.filter((it) => it.result.ok));
}

const FORBIDDEN_FIELDS = new Set(["__proto__", "constructor", "prototype"]);
/** This function tells if a segment of a path can name a field. A compiler uses the same rule as the interpreter. */
export const isFieldName = (seg: string): boolean => seg.length > 0 && !FORBIDDEN_FIELDS.has(seg);

/** This function runs the `is` test of a domain. A test that throws counts as `false`. */
// Stryker disable BlockStatement: an empty catch gives undefined, which also counts as false
export function safeIs(d: AnyDomain, value: unknown): boolean {
  try {
    return d.is(value);
  } catch {
    return false;
  }
}
// Stryker restore BlockStatement


/** This function tells if an argument has the kind of a parameter of an op of the domain `domain`. */
export function matchesKind(kind: ParamKind, value: unknown, domain: AnyDomain): boolean {
  switch (kind) {
    case "domain":
      return safeIs(domain, value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
    case "any":
      return true;
  }
}

/** This function gives a short name for the type of a value, for error messages. */
export function describeType(u: unknown): string {
  if (u === null) return "null";
  if (Array.isArray(u)) return "array";
  if (isVexList(u)) return "list";
  if (typeof u === "object") {
    const name = (Object.getPrototypeOf(u) as { constructor?: { name?: unknown } } | null)?.constructor?.name;
    return typeof name === "string" && name !== "Object" ? name : "object";
  }
  return typeof u;
}

/** This function gives the label of a node, for traces. */
export function labelOf(e: Expr): string {
  switch (e.tag) {
    case "lit":
      return previewValue(e.value);
    case "ref":
      return e.path.length === 0 ? "(record)" : e.path.join(".");
    case "app":
      return e.op;
    case "let":
      return `let ${Object.keys(e.bind).join(", ")}`;
    // A function makes no event of the trace, so its label only completes the switch.
    // Stryker disable next-line all: see the comment above
    case "fn": return `fn (${e.params.join(", ")})`;
    case "call":
      return `call ${e.fn}`;
    case "var":
      return e.name;
    case "rec":
      return `{ ${Object.keys(e.fields).join(", ")} }`;
    case "each":
    case "fold":
      return e.at === undefined ? `${e.tag} ${e.axis.t}` : `${e.tag} ${e.axis.t} from ${e.at.map(moveText).join(".")}`;
    case "iterate":
      return `iterate ${String(e.limit)}`;
    case "ext":
      return e.kind;
  }
}

/** This function gives a short text for a move, for the label of an axis with an address. */
function moveText(m: Move): string {
  switch (m.t) {
    case "key":
      return `key(${typeof m.key === "string" ? m.key : labelOf(m.key)})`;
    case "index":
      return `index(${typeof m.i === "number" ? String(m.i) : labelOf(m.i)})`;
    case "offset":
      return `offset(${m.d.join(", ")})`;
    case "other":
    case "origin":
    case "parent":
      return m.t;
  }
}

/** This function gives a short text for a value. */
export function previewValue(u: unknown): string {
  // JSON has no NaN and no Infinity, so a number gets its own text. JSON gives the text of the other primitives.
  if (typeof u === "number") return String(u);
  if (isVexList(u)) return `list(${u.items.length})`;
  try {
    const json = JSON.stringify(u);
    // A function, a symbol and undefined have no JSON form.
    // Stryker disable next-line ConditionalExpression: without the test, undefined.length throws, and the catch gives the same text
    if (json !== undefined) return json.length > 60 ? `${json.slice(0, 57)}...` : json;
  } catch {
    // A value with cycles has no JSON form.
  }
  return describeType(u);
}

// The reads of a reference show the key and the path, for example "read B.position" or "no value at A.mass".
const formatRead = (r: Read): string => `${r.ok ? "read" : "no value at"} ${r.key}.${r.path.length === 0 ? "(record)" : r.path.join(".")}`;

/**
 * This function gives a text form of a trace. Each event has one line, in finish order. The indent of a line
 * shows the depth of the node. A domain with `show` gives the text of its values. The golden tests compare this text.
 */
// Stryker disable next-line ArrayDeclaration: a list with a value that is not a domain shows no value
export function formatTrace(trace: Trace, domains: readonly AnyDomain[] = []): string {
  const show = (u: unknown): string => {
    if (isVexList(u)) return `[${u.items.map((it) => `${it.key}: ${result(it.result)}`).join(", ")}]`;
    const d = domains.find((dom) => dom.show !== undefined && safeIs(dom, u));
    try {
      // Stryker disable next-line ConditionalExpression,OptionalChaining: without a domain, d.show throws, and the catch gives the same text
      if (d?.show !== undefined) return d.show(u);
    } catch {
      // A show function that throws gives the default text.
    }
    return previewValue(u);
  };
  const result = (r: Result<unknown>): string => (r.ok ? show(r.value) : formatError(r.error));
  const line = (e: TraceEvent): string => {
    const reads = e.reads === undefined ? "" : ` [${e.reads.map(formatRead).join(", ")}]`;
    return `${"  ".repeat(e.path.length)}${e.label} @${e.focus}${reads} = ${result(e.result)}`;
  };
  const lines = trace.events.map(line);
  return [...lines, `result = ${result(trace.result)}`, ""].join("\n");
}

/** This function gives the number of nodes of an expression. */
export const sizeOf = (e: Expr): number => 1 + children(e).reduce((s, c) => s + sizeOf(c), 0);

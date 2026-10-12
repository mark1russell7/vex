/**
 * The builder model test (docs/QUALITY-PLAN.md §4.1). A generator (`builder-model-arbitraries.ts`) makes random
 * sequences of builder calls. The runner applies a sequence to the real builder. The model gives the expected
 * expression of the same sequence. It follows the rules of the spec and the API reference, and it does not use the
 * builder. The reference evaluator evaluates the expression of the model. Thus the test compares the builder with an
 * implementation that shares no code with it.
 */
import { app, each, index as indexMove, key as keyMove, let_, lit, offset as offsetMove, origin as originMove, other as otherMove, parent as parentMove, rec, ref, toPath, v, type Axis, type Expr, type Move, type Result } from "@mark1russell7/vex";

/** An argument of a builder call. A field is a bare string, so it reads at the address of the chain. */
export type Arg =
  | { readonly k: "field"; readonly path: string }
  | { readonly k: "lit"; readonly value: number | boolean }
  | { readonly k: "of"; readonly key: string; readonly path: string }
  | { readonly k: "chain"; readonly chain: BuilderChain }
  | { readonly k: "var"; readonly name: string }
  /** `root.lit(value)`: a literal. A string is a string, not a field. */
  | { readonly k: "rootLit"; readonly value: number | boolean | string }
  /** `root.field(path)`: the field at the focus. It does not read at the address of the chain. */
  | { readonly k: "rootField"; readonly path: string }
  /** `root.rec({ a, b })`: a record. A bare string in it reads at the focus. */
  | { readonly k: "rec"; readonly a: Arg; readonly b: Arg };

/** A move of the builder. */
export type MoveCall =
  | { readonly t: "to"; readonly key: string }
  | { readonly t: "index"; readonly i: number }
  | { readonly t: "offset"; readonly d: readonly number[] }
  | { readonly t: "other" }
  | { readonly t: "origin" }
  | { readonly t: "parent" };

/** The axes of the builder. */
export type AxisName = "others" | "each" | "neighbors4" | "neighbors8" | "children" | "ancestors" | "descendants" | "siblings";

/** A reduction of a list chain. */
export interface Reduction {
  readonly op: "count" | "sum" | "mean" | "min" | "max" | "any" | "all" | "none" | "values" | "first" | "keys" | "errors" | "reduce";
  /** The op of `reduce`. */
  readonly with?: string;
  readonly strict: boolean;
}

/** One call of a chain. */
export type Step =
  | { readonly t: "from"; readonly path: string }
  | { readonly t: "move"; readonly m: MoveCall }
  | { readonly t: "op"; readonly op: string; readonly args: readonly Arg[] }
  | { readonly t: "call"; readonly name: string; readonly args: readonly Arg[] }
  | { readonly t: "ifError"; readonly fallback: Arg }
  | { readonly t: "fork"; readonly a: readonly Step[]; readonly b: readonly Step[] }
  | { readonly t: "with"; readonly bind: Arg; readonly body: readonly Step[] }
  | { readonly t: "axis"; readonly axis: AxisName; readonly body: readonly Step[]; readonly where?: readonly Step[]; readonly reduce?: Reduction };

/** A chain from the root: a start, and then the calls. */
export interface BuilderChain {
  readonly head: { readonly t: "from"; readonly path: string } | { readonly t: "start"; readonly value: number | boolean | string };
  readonly steps: readonly Step[];
}

/** The options of the generator. */
export interface ModelOptions {
  /** The keys of the space, for the moves `to` and the arguments `of`. */
  readonly keys: readonly string[];
  /** The field paths, for `from` and for field arguments. */
  readonly paths: readonly string[];
  /** The op names of `._`. */
  readonly ops: readonly string[];
  /** The names of the free functions of `call`. */
  readonly fns: readonly string[];
  /** The ops of `reduce`. */
  readonly reduceOps: readonly string[];
  /** The reductions that the generator uses. */
  readonly reductions: readonly Reduction["op"][];
  /** The maximum nesting of bodies and chain arguments. */
  readonly depth: number;
  /** `false` leaves out the calls `with`. The default is `true`. Without free functions, the generator makes no `call`. */
  readonly binds?: boolean;
}

/** The name that `with` binds. The generator, the runner and the model use it. */
export const VAR = "x";

// ---------------------------------------------------------------- the runner: the real builder

/** The builder as the runner sees it: the members by name, without the types. */
export interface DynChain {
  readonly kind: string;
  readonly program: Expr;
  readonly _: Readonly<Record<string, (...a: readonly unknown[]) => DynChain>>;
  [member: string]: unknown;
  result?(k: string): Result<unknown>;
}

/** The root as the runner sees it. */
export interface DynRoot {
  from(p: string): DynChain;
  start(v: unknown): DynChain;
  of(k: string, p: string): unknown;
  lit(v: unknown): unknown;
  field(p: string): unknown;
  rec(fields: Readonly<Record<string, unknown>>): unknown;
}

type Member = (...a: readonly unknown[]) => DynChain;
const member = (c: DynChain, name: string): Member => {
  const m = c[name];
  if (typeof m !== "function") throw new Error(`the chain has no member "${name}"`);
  return (m as Member).bind(c);
};

function runArg(a: Arg, root: DynRoot, vars: Readonly<Record<string, unknown>>): unknown {
  switch (a.k) {
    case "field":
      return a.path;
    case "lit":
      return a.value;
    case "of":
      return root.of(a.key, a.path);
    case "chain":
      return runChain(a.chain, root, vars);
    case "var":
      return vars[a.name];
    case "rootLit":
      return root.lit(a.value);
    case "rootField":
      return root.field(a.path);
    case "rec":
      return root.rec({ a: runArg(a.a, root, vars), b: runArg(a.b, root, vars) });
  }
}

const AXIS_MEMBER: Readonly<Record<AxisName, readonly [string, ...unknown[]]>> = {
  others: ["others"],
  each: ["each"],
  neighbors4: ["neighbors", 4],
  neighbors8: ["neighbors", 8],
  children: ["children"],
  ancestors: ["ancestors"],
  descendants: ["descendants"],
  siblings: ["siblings"],
};

function runSteps(c: DynChain, steps: readonly Step[], root: DynRoot, vars: Readonly<Record<string, unknown>>): DynChain {
  let out = c;
  for (const s of steps) {
    switch (s.t) {
      case "from":
        out = member(out, "from")(s.path);
        break;
      case "move": {
        const m = s.m;
        out = m.t === "to" ? member(out, "to")(m.key) : m.t === "index" ? member(out, "index")(m.i) : m.t === "offset" ? member(out, "offset")(...m.d) : member(out, m.t)();
        break;
      }
      case "op": {
        const f = out._[s.op];
        if (f === undefined) throw new Error(`the op proxy has no "${s.op}"`);
        out = f(...s.args.map((a) => runArg(a, root, vars)));
        break;
      }
      case "call":
        out = member(out, "call")(s.name, ...s.args.map((a) => runArg(a, root, vars)));
        break;
      case "ifError":
        out = member(out, "ifError")(runArg(s.fallback, root, vars));
        break;
      case "fork":
        out = member(out, "fork")({ a: (b: DynChain) => runSteps(b, s.a, root, vars), b: (b: DynChain) => runSteps(b, s.b, root, vars) });
        break;
      case "with":
        out = member(out, "with")({ [VAR]: runArg(s.bind, root, vars) }, (b: DynChain, vs: Readonly<Record<string, unknown>>) => runSteps(b, s.body, root, { ...vars, ...vs }));
        break;
      case "axis": {
        const [name, ...pre] = AXIS_MEMBER[s.axis];
        const where = s.where;
        const opts = where === undefined ? undefined : { where: (b: DynChain) => runSteps(b, where, root, vars) };
        const list = member(out, name)(...pre, (b: DynChain) => runSteps(b, s.body, root, vars), opts);
        const r = s.reduce;
        out = r === undefined ? list : r.op === "reduce" ? member(list, "reduce")(r.with, r.strict ? { strict: true } : undefined) : member(list, r.op)(r.strict ? { strict: true } : undefined);
        break;
      }
    }
  }
  return out;
}

/** This function applies a chain to the real builder. */
export function runChain(c: BuilderChain, root: DynRoot, vars: Readonly<Record<string, unknown>> = {}): DynChain {
  const start = c.head.t === "from" ? root.from(c.head.path) : root.start(c.head.value);
  return runSteps(start, c.steps, root, vars);
}

// ---------------------------------------------------------------- the model: the expected expression

interface ModelState {
  readonly value: Expr;
  /** The address of the later field references and axes. An axis body starts with the empty address. */
  readonly addr: readonly Move[];
}

const toMove = (m: MoveCall): Move =>
  m.t === "to" ? keyMove(m.key) : m.t === "index" ? indexMove(m.i) : m.t === "offset" ? offsetMove(...m.d) : m.t === "other" ? otherMove : m.t === "origin" ? originMove : parentMove;

const AXES: Readonly<Record<AxisName, Axis>> = {
  others: { t: "others" },
  each: { t: "all" },
  neighbors4: { t: "neighbors", n: 4 },
  neighbors8: { t: "neighbors", n: 8 },
  children: { t: "children" },
  ancestors: { t: "ancestors" },
  descendants: { t: "descendants" },
  siblings: { t: "siblings" },
};

/** The expected expression of a chain, after the rules of the spec and the API reference. */
export function modelChain(c: BuilderChain): Expr {
  let fresh = 0;
  // Stryker disable next-line UpdateOperator: fresh-- also gives a new name at each call
  const name = (): string => `model${fresh++}`;

  const arg = (a: Arg, addr: readonly Move[], vars: Readonly<Record<string, string>>): Expr => {
    switch (a.k) {
      case "field":
        // A bare string is a field reference at the address of the chain.
        return ref(toPath(a.path), addr);
      case "lit":
        return lit(a.value);
      case "of":
        return ref(toPath(a.path), [keyMove(a.key)]);
      case "chain":
        return chain(a.chain, vars);
      case "var":
        return v(vars[a.name] ?? a.name);
      case "rootLit":
        return lit(a.value);
      case "rootField":
        // root.field(path) reads at the focus: it has no address.
        return ref(toPath(a.path));
      case "rec":
        // A record of root.rec has the fields as arguments with the empty address.
        return rec({ a: arg(a.a, [], vars), b: arg(a.b, [], vars) });
    }
  };

  const steps = (s0: ModelState, list: readonly Step[], vars: Readonly<Record<string, string>>): ModelState => {
    let s = s0;
    for (const st of list) {
      switch (st.t) {
        case "from":
          // from(field) starts a new value: the field at the current address.
          s = { value: ref(toPath(st.path), s.addr), addr: s.addr };
          break;
        case "move":
          // A move changes the address of the later field references and axes.
          s = { value: s.value, addr: [...s.addr, toMove(st.m)] };
          break;
        case "op":
          s = { value: app(st.op, s.value, ...st.args.map((a) => arg(a, s.addr, vars))), addr: s.addr };
          break;
        case "call":
          // BUILD.CALL: call(name, ...args) is app(name, value, ...args).
          s = { value: app(st.name, s.value, ...st.args.map((a) => arg(a, s.addr, vars))), addr: s.addr };
          break;
        case "ifError":
          s = { value: app("ifError", s.value, arg(st.fallback, s.addr, vars)), addr: s.addr };
          break;
        case "fork": {
          // fork evaluates each branch with the current value, and gives a record.
          const x = name();
          const start: ModelState = { value: v(x), addr: s.addr };
          s = { value: let_({ [x]: s.value }, rec({ a: steps(start, st.a, vars).value, b: steps(start, st.b, vars).value })), addr: s.addr };
          break;
        }
        case "with": {
          // with binds names. The body continues the chain with the same value and the same address.
          const x = name();
          const bound = arg(st.bind, s.addr, vars);
          s = { value: let_({ [x]: bound }, steps(s, st.body, { ...vars, [VAR]: x }).value), addr: s.addr };
          break;
        }
        case "axis": {
          // The body starts with the value at the origin. Inside the body the focus is the target, so the address
          // starts empty. The moves before the axis are its address (BUILD.AXIS.ADDRESS).
          const x = name();
          const inner: ModelState = { value: v(x), addr: [] };
          const body = steps(inner, st.body, vars).value;
          const base = AXES[st.axis];
          const axis: Axis = st.where === undefined ? base : { t: "where", axis: base, test: steps(inner, st.where, vars).value };
          const items = let_({ [x]: s.value }, each(axis, body, s.addr));
          const r = st.reduce;
          const strict = r?.strict === true ? [lit({ strict: true })] : [];
          s = { value: r === undefined ? items : app(r.op, items, ...(r.op === "reduce" ? [lit(r.with)] : []), ...strict), addr: s.addr };
          break;
        }
      }
    }
    return s;
  };

  function chain(c2: BuilderChain, vars: Readonly<Record<string, string>>): Expr {
    const h = c2.head;
    // start(value): a string is a field reference.
    const value = h.t === "from" ? ref(toPath(h.path)) : typeof h.value === "string" ? ref(toPath(h.value)) : lit(h.value);
    return steps({ value, addr: [] }, c2.steps, vars).value;
  }

  return chain(c, {});
}

// ---------------------------------------------------------------- the text of a chain

const value = (u: number | boolean | string): string => JSON.stringify(u);
const opts = (r: Reduction): string => (r.strict ? "{ strict: true }" : "");

/**
 * This function gives the TypeScript text of a chain, with `root` as the root, for example
 * `root.from("p")._.add("q").others((e0) => e0).sum()`. The Lab reads this text.
 */
export function chainText(c: BuilderChain): string {
  let fresh = 0;
  const param = (): string => `e${fresh++}`;
  const arg = (a: Arg): string => {
    switch (a.k) {
      case "field":
        return value(a.path);
      case "lit":
        return value(a.value);
      case "of":
        return `root.of(${value(a.key)}, ${value(a.path)})`;
      case "chain":
        return chainText1(a.chain);
      case "var":
        return `vars.${a.name}`;
      case "rootLit":
        return `root.lit(${value(a.value)})`;
      case "rootField":
        return `root.field(${value(a.path)})`;
      case "rec":
        return `root.rec({ a: ${arg(a.a)}, b: ${arg(a.b)} })`;
    }
  };
  const steps = (list: readonly Step[]): string =>
    list
      .map((s): string => {
        switch (s.t) {
          case "from":
            return `.from(${value(s.path)})`;
          case "move": {
            const m = s.m;
            return m.t === "to" ? `.to(${value(m.key)})` : m.t === "index" ? `.index(${m.i})` : m.t === "offset" ? `.offset(${m.d.join(", ")})` : `.${m.t}()`;
          }
          case "op":
            return `._.${s.op}(${s.args.map(arg).join(", ")})`;
          case "call":
            return `.call(${[value(s.name), ...s.args.map(arg)].join(", ")})`;
          case "ifError":
            return `.ifError(${arg(s.fallback)})`;
          case "fork": {
            const a = param();
            const b = param();
            return `.fork({ a: (${a}) => ${a}${steps(s.a)}, b: (${b}) => ${b}${steps(s.b)} })`;
          }
          case "with": {
            const p = param();
            return `.with({ x: ${arg(s.bind)} }, (${p}, vars) => ${p}${steps(s.body)})`;
          }
          case "axis": {
            const [name, ...pre] = AXIS_MEMBER[s.axis];
            const p = param();
            const body = `(${p}) => ${p}${steps(s.body)}`;
            const where = s.where === undefined ? "" : (() => {
              const w = param();
              return `, { where: (${w}) => ${w}${steps(s.where)} }`;
            })();
            const r = s.reduce;
            const reduce = r === undefined ? "" : r.op === "reduce" ? `.reduce(${[value(r.with ?? ""), ...(r.strict ? [opts(r)] : [])].join(", ")})` : `.${r.op}(${opts(r)})`;
            return `.${name}(${[...pre.map(String), body].join(", ")}${where})${reduce}`;
          }
        }
      })
      .join("");
  function chainText1(c1: BuilderChain): string {
    const h = c1.head;
    return `${h.t === "from" ? `root.from(${value(h.path)})` : `root.start(${value(h.value)})`}${steps(c1.steps)}`;
  }
  return chainText1(c);
}

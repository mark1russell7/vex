/**
 * The builder model test (docs/QUALITY-PLAN.md §4.1). A generator makes random sequences of builder calls. The runner
 * applies a sequence to the real builder. The model gives the expected expression of the same sequence. It follows
 * the rules of the spec and the API reference, and it does not use the builder. The reference evaluator evaluates the
 * expression of the model. Thus the test compares the builder with an implementation that shares no code with it.
 */
import { app, each, index as indexMove, key as keyMove, let_, lit, offset as offsetMove, origin as originMove, other as otherMove, parent as parentMove, rec, ref, toPath, v, type Axis, type Expr, type Move, type Result } from "@mark1russell7/vex";
import * as fc from "fast-check";

/** An argument of a builder call. A field is a bare string, so it reads at the address of the chain. */
export type Arg =
  | { readonly k: "field"; readonly path: string }
  | { readonly k: "lit"; readonly value: number | boolean }
  | { readonly k: "of"; readonly key: string; readonly path: string }
  | { readonly k: "chain"; readonly chain: BuilderChain }
  | { readonly k: "var"; readonly name: string };

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
}

const VAR = "x";

const arbMoveCall = (o: ModelOptions): fc.Arbitrary<MoveCall> =>
  fc.oneof(
    fc.constantFrom(...o.keys, "Z").map((key): MoveCall => ({ t: "to", key })),
    fc.integer({ min: -1, max: 4 }).map((i): MoveCall => ({ t: "index", i })),
    fc.oneof(fc.tuple(fc.integer({ min: -1, max: 1 })), fc.tuple(fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))).map((d): MoveCall => ({ t: "offset", d })),
    fc.constantFrom<MoveCall>({ t: "other" }, { t: "origin" }, { t: "parent" }),
  );

const arbReduction = (o: ModelOptions): fc.Arbitrary<Reduction> =>
  fc.tuple(fc.constantFrom(...o.reductions), fc.constantFrom(...o.reduceOps), fc.boolean()).map(([op, w, strict]): Reduction => (op === "reduce" ? { op, with: w, strict } : { op, strict }));

function arbArg(o: ModelOptions, depth: number, vars: boolean): fc.Arbitrary<Arg> {
  const leaves: fc.Arbitrary<Arg>[] = [
    fc.constantFrom(...o.paths).map((path): Arg => ({ k: "field", path })),
    fc.oneof(fc.integer({ min: -3, max: 3 }), fc.boolean()).map((value): Arg => ({ k: "lit", value })),
    fc.tuple(fc.constantFrom(...o.keys, "Z"), fc.constantFrom(...o.paths)).map(([key, path]): Arg => ({ k: "of", key, path })),
  ];
  if (vars) leaves.push(fc.constant<Arg>({ k: "var", name: VAR }));
  if (depth <= 0) return fc.oneof(...leaves);
  return fc.oneof(...leaves, arbChain(o, depth - 1, vars).map((chain): Arg => ({ k: "chain", chain })));
}

/** The calls of a chain. Only the last call can be an axis without a reduction, because a list chain has no other calls. */
function arbSteps(o: ModelOptions, depth: number, vars: boolean): fc.Arbitrary<readonly Step[]> {
  const args = fc.array(arbArg(o, depth, vars), { maxLength: 2 });
  const simple: fc.Arbitrary<Step>[] = [
    fc.constantFrom(...o.paths).map((path): Step => ({ t: "from", path })),
    arbMoveCall(o).map((m): Step => ({ t: "move", m })),
    fc.tuple(fc.constantFrom(...o.ops), args).map(([op, a]): Step => ({ t: "op", op, args: a })),
    fc.tuple(fc.constantFrom(...o.fns), args).map(([name, a]): Step => ({ t: "call", name, args: a })),
    arbArg(o, depth, vars).map((fallback): Step => ({ t: "ifError", fallback })),
  ];
  const axisNames = fc.constantFrom<AxisName>("others", "each", "neighbors4", "neighbors8", "children", "ancestors", "descendants", "siblings");
  const nested: fc.Arbitrary<Step>[] =
    depth <= 0
      ? []
      : [
          fc.tuple(axisNames, arbSteps(o, depth - 1, vars), fc.option(arbSteps(o, depth - 1, vars), { nil: undefined }), arbReduction(o)).map(
            ([axis, body, where, reduce]): Step => (where === undefined ? { t: "axis", axis, body, reduce } : { t: "axis", axis, body, where, reduce }),
          ),
          fc.tuple(arbSteps(o, depth - 1, vars), arbSteps(o, depth - 1, vars)).map(([a, b]): Step => ({ t: "fork", a, b })),
          fc.tuple(arbArg(o, depth - 1, vars), arbSteps(o, depth - 1, true)).map(([bind, body]): Step => ({ t: "with", bind, body })),
        ];
  const last: fc.Arbitrary<Step | undefined> =
    depth <= 0
      ? fc.constant(undefined)
      : fc.option(
          fc.tuple(axisNames, arbSteps(o, depth - 1, vars)).map(([axis, body]): Step => ({ t: "axis", axis, body })),
          { nil: undefined, freq: 4 },
        );
  return fc.tuple(fc.array(fc.oneof(...simple, ...nested), { maxLength: 4 }), last).map(([steps, end]) => (end === undefined ? steps : [...steps, end]));
}

/** A chain from the root. */
export function arbChain(o: ModelOptions, depth: number = o.depth, vars = false): fc.Arbitrary<BuilderChain> {
  const head = fc.oneof(
    fc.constantFrom(...o.paths).map((path): BuilderChain["head"] => ({ t: "from", path })),
    fc.oneof(fc.integer({ min: -3, max: 3 }), fc.boolean(), fc.constantFrom(...o.paths)).map((value): BuilderChain["head"] => ({ t: "start", value })),
  );
  return fc.tuple(head, arbSteps(o, depth, vars)).map(([h, steps]) => ({ head: h, steps }));
}

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

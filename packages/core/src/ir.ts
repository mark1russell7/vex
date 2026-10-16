/**
 * The expression IR of Vex. It is plain JSON data. Its first three kinds (`lit`, `ref`, `app`) have the same
 * shape as the expressions of `render`.
 */

/**
 * One move of an address. The moves of an address apply in order, from the focus of the evaluation. The key of `key`
 * and the position of `index` can be an expression, which evaluates before the moves (NAV.COMPUTED).
 */
export type Move =
  | { readonly t: "key"; readonly key: string | Expr }
  | { readonly t: "index"; readonly i: number | Expr }
  | { readonly t: "other" }
  | { readonly t: "offset"; readonly d: readonly number[] }
  | { readonly t: "origin" }
  | { readonly t: "parent" };

/** A move with a fixed key or position: a move with no expression. */
export type FixedMove = Exclude<Move, { readonly t: "key" | "index" }> | { readonly t: "key"; readonly key: string } | { readonly t: "index"; readonly i: number };

/** An address: a list of moves. The empty list is the focus. */
export type Addr = readonly Move[];

/** An axis: the relation between a position and the targets that a body reads. */
export type Axis =
  | { readonly t: "all" }
  | { readonly t: "others" }
  | { readonly t: "other" }
  | { readonly t: "neighbors"; readonly n: 4 | 8 }
  | { readonly t: "children" }
  | { readonly t: "ancestors" }
  | { readonly t: "descendants" }
  | { readonly t: "siblings" }
  | { readonly t: "window"; readonly from: number; readonly to: number }
  | { readonly t: "table"; readonly name: string }
  | { readonly t: "successors" }
  | { readonly t: "predecessors" }
  | { readonly t: "reachable" }
  | { readonly t: "where"; readonly axis: Axis; readonly test: Expr };

/** A Vex expression. */
export type Expr =
  | { readonly tag: "lit"; readonly value: unknown }
  | { readonly tag: "ref"; readonly path: readonly string[]; readonly at?: Addr }
  | { readonly tag: "app"; readonly op: string; readonly args: readonly Expr[] }
  | { readonly tag: "let"; readonly bind: Readonly<Record<string, Expr>>; readonly body: Expr }
  | { readonly tag: "var"; readonly name: string }
  | { readonly tag: "rec"; readonly fields: Readonly<Record<string, Expr>> }
  | { readonly tag: "each"; readonly axis: Axis; readonly body: Expr; readonly at?: Addr }
  | { readonly tag: "fold"; readonly axis: Axis; readonly init: Names; readonly step: Names; readonly result: Expr; readonly at?: Addr }
  | { readonly tag: "iterate"; readonly limit: number; readonly init: Names; readonly step: Names; readonly until?: Expr; readonly result: Expr }
  | { readonly tag: "ext"; readonly kind: string; readonly data: unknown };

/** The names of a loop and an expression for each (LOOP.NAMES). */
export type Names = Readonly<Record<string, Expr>>;

/** The largest number of steps of `iterate` (ITERATE.LIMIT). */
export const MAX_ITERATIONS = 100_000;

/** The tag of an expression kind. */
export type ExprTag = Expr["tag"];

/** An expression of one kind. */
export type ExprOf<T extends ExprTag> = Extract<Expr, { readonly tag: T }>;

// ---------------------------------------------------------------- constructors

/** This function makes a literal. */
export const lit = (value: unknown): ExprOf<"lit"> => ({ tag: "lit", value });

/** This function splits a dotted path, for example `"pos.x"`, into its segments. */
export const toPath = (path: string | readonly string[]): readonly string[] =>
  typeof path === "string" ? path.split(".").filter((s) => s.length > 0) : path;

/** This function makes a reference to a field path. With `at`, the reference reads at that address. */
export function ref(path: string | readonly string[], at?: Addr): ExprOf<"ref"> {
  const segments = toPath(path);
  return at === undefined || at.length === 0 ? { tag: "ref", path: segments } : { tag: "ref", path: segments, at };
}

/** This function makes the application of an op to arguments. For a method op, the first argument is the receiver. */
export const app = (op: string, ...args: readonly Expr[]): ExprOf<"app"> => ({ tag: "app", op, args });

/** This function binds names to expressions for the body. */
export const let_ = (bind: Readonly<Record<string, Expr>>, body: Expr): ExprOf<"let"> => ({ tag: "let", bind, body });

/** This function makes a reference to a bound name. */
export const v = (name: string): ExprOf<"var"> => ({ tag: "var", name });

/** This function makes a record from field expressions. */
export const rec = (fields: Readonly<Record<string, Expr>>): ExprOf<"rec"> => ({ tag: "rec", fields });

/**
 * This function evaluates `body` once for each target of `axis`. The result is a list. With `at`, the axis finds its
 * targets from the key of that address, not from the focus.
 */
export function each(axis: Axis, body: Expr, at?: Addr): ExprOf<"each"> {
  return at === undefined || at.length === 0 ? { tag: "each", axis, body } : { tag: "each", axis, body, at };
}

/**
 * This function makes a fold: a step at each target of `axis`, in order. `init` gives the names and their first
 * values, and `step` gives the next values. `result` gives the value from the last values (LOOP.NAMES, FOLD.ORDER).
 */
export function fold(axis: Axis, init: Names, step: Names, result: Expr, at?: Addr): ExprOf<"fold"> {
  return at === undefined || at.length === 0 ? { tag: "fold", axis, init, step, result } : { tag: "fold", axis, init, step, result, at };
}

/**
 * This function makes an iteration: up to `limit` steps. `init` gives the names and their first values, and `step`
 * gives the next values. A true `until` stops it, and `result` gives the value (ITERATE.LIMIT, ITERATE.UNTIL).
 */
export function iterate(limit: number, init: Names, step: Names, result: Expr, until?: Expr): ExprOf<"iterate"> {
  return until === undefined ? { tag: "iterate", limit, init, step, result } : { tag: "iterate", limit, init, step, until, result };
}

/** This function makes an expression of an extension kind. */
export const ext = (kind: string, data: unknown): ExprOf<"ext"> => ({ tag: "ext", kind, data });

// ---------------------------------------------------------------- moves and axes

/** The move to an absolute key. The key can be an expression that gives a text. */
export function key(k: string): FixedMove;
export function key(k: string | Expr): Move;
export function key(k: string | Expr): Move {
  return { t: "key", key: k };
}
/** The move to a position in the key order. The position can be an expression that gives a number. */
export function index(i: number): FixedMove;
export function index(i: number | Expr): Move;
export function index(i: number | Expr): Move {
  return { t: "index", i };
}

/** This function gives the expression of a move with a computed key or position, or `undefined`. */
export function moveExpr(m: Move): Expr | undefined {
  if (m.t === "key") return typeof m.key === "string" ? undefined : m.key;
  return m.t === "index" && typeof m.i !== "number" ? m.i : undefined;
}

/** This function gives the expressions of the computed moves of an address, in the order of the moves. */
export const addrExprs = (at: Addr | undefined): readonly Expr[] => (at ?? []).flatMap((m) => moveExpr(m) ?? []);

/** This function tells if each move of an address is fixed. */
export const isFixedAddr = (at: Addr | undefined): at is readonly FixedMove[] => addrExprs(at).length === 0;
/** The move to the other key of a space with two keys. */
export const other: FixedMove = Object.freeze({ t: "other" });
/** The relative move in an array (one number) or a grid (two numbers). */
export const offset = (...d: readonly number[]): FixedMove => ({ t: "offset", d });
/** The move back to the origin of the evaluation. */
export const origin: FixedMove = Object.freeze({ t: "origin" });
/** The move to the parent of the focus in a tree space. */
export const parent: FixedMove = Object.freeze({ t: "parent" });

/** The axes. */
export const axes = {
  /** Each key of the space. */
  all: Object.freeze({ t: "all" }) as Axis,
  /** Each key except the focus. */
  others: Object.freeze({ t: "others" }) as Axis,
  /** The other key of a pair. */
  other: Object.freeze({ t: "other" }) as Axis,
  /** The neighbors of the focus in a grid. */
  neighbors: (n: 4 | 8 = 8): Axis => ({ t: "neighbors", n }),
  /** The children of the focus in a tree, in key order. */
  children: Object.freeze({ t: "children" }) as Axis,
  /** The ancestors of the focus in a tree: the parent first, the root last. */
  ancestors: Object.freeze({ t: "ancestors" }) as Axis,
  /** The descendants of the focus in a tree, depth first, each parent before its children. */
  descendants: Object.freeze({ t: "descendants" }) as Axis,
  /** The other children of the parent of the focus. For a root, the other roots. */
  siblings: Object.freeze({ t: "siblings" }) as Axis,
  /**
   * The keys at the offsets from `from` to `to` of the focus, in order: a window of rows. The offset 0 is the focus. In
   * a tree space, the offsets go among the siblings. An offset outside the space has no target.
   */
  window: (from: number, to: number): Axis => ({ t: "window", from, to }),
  /**
   * Each key of the table `name` of the evaluation, in key order. The body evaluates in the space of that table, and
   * there the origin is the target.
   */
  table: (name: string): Axis => ({ t: "table", name }),
  /** The keys at the ends of the edges from the focus, in a graph space. In a tree space, the children. */
  successors: Object.freeze({ t: "successors" }) as Axis,
  /** The keys with an edge to the focus, in key order. In a tree space, the parent. */
  predecessors: Object.freeze({ t: "predecessors" }) as Axis,
  /** Each key that a path of edges reaches from the focus, in breadth-first order, without the focus. */
  reachable: Object.freeze({ t: "reachable" }) as Axis,
  /** The targets of `axis` where `test` gives `true`. */
  where: (axis: Axis, test: Expr): Axis => ({ t: "where", axis, test }),
} as const;

// ---------------------------------------------------------------- validation

const isObject = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null;

const isStringArray = (u: unknown): u is readonly string[] => Array.isArray(u) && u.every((s) => typeof s === "string");

/** This function tells if a value is a valid move. The expression of a computed move must be valid too. */
export function isMove(u: unknown): u is Move {
  const exprs = moveParts(u);
  return exprs !== undefined && exprs.every(isExpr);
}

/**
 * A test of a number of a move or of a window. The JSON form needs a whole number. An expression in code can have any
 * number, and a number that is not whole has a meaning at run time (EVAL.SHAPE).
 */
type NumberTest = (x: unknown) => boolean;

const anyNumber: NumberTest = (x) => typeof x === "number";

/** This function checks the fixed parts of a move. It gives the expressions of the move, or `undefined` for a bad move. */
function moveParts(u: unknown, isNumber: NumberTest = Number.isInteger): readonly unknown[] | undefined {
  if (!isObject(u)) return undefined;
  switch (u["t"]) {
    case "key":
      return typeof u["key"] === "string" ? [] : isObject(u["key"]) ? [u["key"]] : undefined;
    case "index":
      return isNumber(u["i"]) ? [] : isObject(u["i"]) ? [u["i"]] : undefined;
    case "offset":
      return Array.isArray(u["d"]) && u["d"].every((n) => isNumber(n)) ? [] : undefined;
    case "other":
    case "origin":
    case "parent":
      return [];
    default:
      return undefined;
  }
}

/** This function tells if a value is a valid axis. It checks the tests of `where` too. */
export function isAxis(u: unknown): u is Axis {
  return badPart([{ axis: true, u }], true) === undefined;
}

/** This function tells if a value is a valid expression. It checks the whole tree. */
export function isExpr(u: unknown): u is Expr {
  return badPart([{ axis: false, u }], true) === undefined;
}

/** The tags of the expressions of this version of Vex. */
const TAGS: ReadonlySet<unknown> = new Set(["lit", "ref", "app", "let", "var", "rec", "each", "fold", "iterate", "ext"]);

/**
 * This function gives the reason that a value is not a valid expression, or `undefined` for a valid expression
 * (EVAL.SHAPE). An expression from a newer version of Vex can have a tag that this version does not know. Unlike
 * `isExpr`, it accepts a number that is not whole in a move or in a window, because it has a meaning at run time.
 */
export function shapeError(u: unknown): string | undefined {
  const bad = badPart([{ axis: false, u }], false);
  if (bad === undefined) return undefined;
  const tag = isObject(bad.u) ? bad.u["tag"] : undefined;
  if (bad.axis) return "the expression has an axis that is not valid";
  if (typeof tag === "string" && !TAGS.has(tag)) return `the expression has a node with the tag "${tag}", and this version of Vex does not know it`;
  return typeof tag === "string" ? `the expression has a node "${tag}" with parts that are not valid` : "the expression has a part that is not a node";
}

/**
 * This function checks the names of a loop: `init` and `step` are records, and each name of `step` is a name of `init`.
 * It gives the expressions of `init`, of `step` and `result`, or `undefined` (LOOP.NAMES).
 */
function loopParts(u: Readonly<Record<string, unknown>>): readonly unknown[] | undefined {
  const { init, step } = u;
  if (!isObject(init) || Array.isArray(init) || !isObject(step) || Array.isArray(step)) return undefined;
  if (!Object.keys(step).every((n) => Object.hasOwn(init, n))) return undefined;
  return [...Object.values(init), ...Object.values(step), u["result"]];
}

/** This function checks the fixed parts of an address. It gives the expressions of its moves, or `undefined`. */
function addrParts(u: unknown, isNumber: NumberTest): readonly unknown[] | undefined {
  if (u === undefined) return [];
  if (!Array.isArray(u)) return undefined;
  const out: unknown[] = [];
  for (const m of u) {
    const parts = moveParts(m, isNumber);
    if (parts === undefined) return undefined;
    out.push(...parts);
  }
  return out;
}

/**
 * This function checks a tree of expressions and axes, and it gives the first part that is not valid. It uses a stack,
 * not recursion, so the input can be deep. For example, a deep JSON file from a stranger does not need a deep call
 * stack (EVAL.NESTING). With `whole`, the numbers of the moves and of the windows must be whole, as the JSON form needs.
 */
function badPart(todo: { readonly axis: boolean; readonly u: unknown }[], whole: boolean): { readonly axis: boolean; readonly u: unknown } | undefined {
  const moveNumber = whole ? Number.isInteger : anyNumber;
  const windowNumber = whole ? Number.isSafeInteger : anyNumber;
  const push = (axis: boolean, values: readonly unknown[]): void => {
    for (const u of values) todo.push({ axis, u });
  };
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const { u } = item;
    if (!isObject(u)) return item;
    if (item.axis) {
      const t = u["t"];
      if (t === "neighbors") {
        if (u["n"] !== 4 && u["n"] !== 8) return item;
      } else if (t === "window") {
        if (!windowNumber(u["from"]) || !windowNumber(u["to"])) return item;
      } else if (t === "table") {
        if (typeof u["name"] !== "string") return item;
      } else if (t === "where") {
        push(true, [u["axis"]]);
        push(false, [u["test"]]);
      } else if (!["all", "others", "other", "children", "ancestors", "descendants", "siblings", "successors", "predecessors", "reachable"].includes(t as string)) {
        return item;
      }
      continue;
    }
    switch (u["tag"]) {
      case "lit":
        if (!("value" in u)) return item;
        break;
      case "ref": {
        const at = addrParts(u["at"], moveNumber);
        if (!isStringArray(u["path"]) || at === undefined) return item;
        push(false, at);
        break;
      }
      case "app":
        if (typeof u["op"] !== "string" || !Array.isArray(u["args"])) return item;
        push(false, u["args"]);
        break;
      case "let":
        if (!isObject(u["bind"]) || Array.isArray(u["bind"])) return item;
        push(false, [...Object.values(u["bind"]), u["body"]]);
        break;
      case "var":
        if (typeof u["name"] !== "string") return item;
        break;
      case "rec":
        if (!isObject(u["fields"]) || Array.isArray(u["fields"])) return item;
        push(false, Object.values(u["fields"]));
        break;
      case "each": {
        const at = addrParts(u["at"], moveNumber);
        if (at === undefined) return item;
        push(true, [u["axis"]]);
        push(false, [u["body"], ...at]);
        break;
      }
      case "fold": {
        const at = addrParts(u["at"], moveNumber);
        const names = loopParts(u);
        if (at === undefined || names === undefined) return item;
        push(true, [u["axis"]]);
        push(false, [...names, ...at]);
        break;
      }
      case "iterate": {
        const limit = u["limit"];
        const names = loopParts(u);
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > MAX_ITERATIONS || names === undefined) return item;
        push(false, [...names, ...(u["until"] === undefined ? [] : [u["until"]])]);
        break;
      }
      case "ext":
        if (typeof u["kind"] !== "string" || !("data" in u)) return item;
        break;
      default:
        return item;
    }
  }
  return undefined;
}

/**
 * This function gives the child expressions of an expression, in the order of their child index. The expressions of
 * the computed moves of an address come last. They evaluate at the position of their node, also for an axis.
 */
export function children(e: Expr): readonly Expr[] {
  switch (e.tag) {
    case "app":
      return e.args;
    case "let":
      return [...Object.values(e.bind), e.body];
    case "rec":
      return Object.values(e.fields);
    case "each":
      return [e.body, ...whereTests(e.axis), ...addrExprs(e.at)];
    case "fold":
      return [...Object.values(e.init), ...Object.values(e.step), ...whereTests(e.axis), ...addrExprs(e.at), e.result];
    case "iterate":
      return [...Object.values(e.init), ...Object.values(e.step), ...(e.until === undefined ? [] : [e.until]), e.result];
    case "ref":
      return addrExprs(e.at);
    case "lit":
    case "var":
    case "ext":
      return [];
  }
}

/** This function gives the tests of the `where` axes of an axis, from the inside out. It uses a loop, not recursion. */
function whereTests(a: Axis): readonly Expr[] {
  const out: Expr[] = [];
  for (let x: Axis = a; x.t === "where"; x = x.axis) out.unshift(x.test);
  return out;
}

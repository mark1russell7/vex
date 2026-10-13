/**
 * The expression IR of Vex. It is plain JSON data. Its first three kinds (`lit`, `ref`, `app`) have the same
 * shape as the expressions of `render`.
 */

/** One move of an address. The moves of an address apply in order, from the focus of the evaluation. */
export type Move =
  | { readonly t: "key"; readonly key: string }
  | { readonly t: "index"; readonly i: number }
  | { readonly t: "other" }
  | { readonly t: "offset"; readonly d: readonly number[] }
  | { readonly t: "origin" }
  | { readonly t: "parent" };

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
  | { readonly tag: "ext"; readonly kind: string; readonly data: unknown };

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

/** This function makes an expression of an extension kind. */
export const ext = (kind: string, data: unknown): ExprOf<"ext"> => ({ tag: "ext", kind, data });

// ---------------------------------------------------------------- moves and axes

/** The move to an absolute key. */
export const key = (k: string): Move => ({ t: "key", key: k });
/** The move to a position in the key order. */
export const index = (i: number): Move => ({ t: "index", i });
/** The move to the other key of a space with two keys. */
export const other: Move = Object.freeze({ t: "other" });
/** The relative move in an array (one number) or a grid (two numbers). */
export const offset = (...d: readonly number[]): Move => ({ t: "offset", d });
/** The move back to the origin of the evaluation. */
export const origin: Move = Object.freeze({ t: "origin" });
/** The move to the parent of the focus in a tree space. */
export const parent: Move = Object.freeze({ t: "parent" });

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
  /** The targets of `axis` where `test` gives `true`. */
  where: (axis: Axis, test: Expr): Axis => ({ t: "where", axis, test }),
} as const;

// ---------------------------------------------------------------- validation

const isObject = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null;

const isStringArray = (u: unknown): u is readonly string[] => Array.isArray(u) && u.every((s) => typeof s === "string");

/** This function tells if a value is a valid move. */
export function isMove(u: unknown): u is Move {
  if (!isObject(u)) return false;
  switch (u["t"]) {
    case "key":
      return typeof u["key"] === "string";
    case "index":
      return Number.isInteger(u["i"]);
    case "offset":
      return Array.isArray(u["d"]) && u["d"].every((n) => Number.isInteger(n));
    case "other":
    case "origin":
    case "parent":
      return true;
    default:
      return false;
  }
}

/** This function tells if a value is a valid axis. It checks the tests of `where` too. */
export function isAxis(u: unknown): u is Axis {
  return validTree([{ axis: true, u }]);
}

/** This function tells if a value is a valid expression. It checks the whole tree. */
export function isExpr(u: unknown): u is Expr {
  return validTree([{ axis: false, u }]);
}

const isAddr = (u: unknown): boolean => u === undefined || (Array.isArray(u) && u.every(isMove));

/**
 * This function checks a tree of expressions and axes. It uses a stack, not recursion, so the input can be deep. For
 * example, a deep JSON file from a stranger does not need a deep call stack (EVAL.NESTING).
 */
function validTree(todo: { readonly axis: boolean; readonly u: unknown }[]): boolean {
  const push = (axis: boolean, values: readonly unknown[]): void => {
    for (const u of values) todo.push({ axis, u });
  };
  for (let item = todo.pop(); item !== undefined; item = todo.pop()) {
    const { u } = item;
    if (!isObject(u)) return false;
    if (item.axis) {
      const t = u["t"];
      if (t === "neighbors") {
        if (u["n"] !== 4 && u["n"] !== 8) return false;
      } else if (t === "window") {
        if (!Number.isSafeInteger(u["from"]) || !Number.isSafeInteger(u["to"])) return false;
      } else if (t === "table") {
        if (typeof u["name"] !== "string") return false;
      } else if (t === "where") {
        push(true, [u["axis"]]);
        push(false, [u["test"]]);
      } else if (!["all", "others", "other", "children", "ancestors", "descendants", "siblings"].includes(t as string)) {
        return false;
      }
      continue;
    }
    switch (u["tag"]) {
      case "lit":
        if (!("value" in u)) return false;
        break;
      case "ref":
        if (!isStringArray(u["path"]) || !isAddr(u["at"])) return false;
        break;
      case "app":
        if (typeof u["op"] !== "string" || !Array.isArray(u["args"])) return false;
        push(false, u["args"]);
        break;
      case "let":
        if (!isObject(u["bind"]) || Array.isArray(u["bind"])) return false;
        push(false, [...Object.values(u["bind"]), u["body"]]);
        break;
      case "var":
        if (typeof u["name"] !== "string") return false;
        break;
      case "rec":
        if (!isObject(u["fields"]) || Array.isArray(u["fields"])) return false;
        push(false, Object.values(u["fields"]));
        break;
      case "each":
        if (!isAddr(u["at"])) return false;
        push(true, [u["axis"]]);
        push(false, [u["body"]]);
        break;
      case "ext":
        if (typeof u["kind"] !== "string" || !("data" in u)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

/** This function gives the child expressions of an expression, in the order of their child index. */
export function children(e: Expr): readonly Expr[] {
  switch (e.tag) {
    case "app":
      return e.args;
    case "let":
      return [...Object.values(e.bind), e.body];
    case "rec":
      return Object.values(e.fields);
    case "each":
      return [e.body, ...whereTests(e.axis)];
    case "lit":
    case "ref":
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

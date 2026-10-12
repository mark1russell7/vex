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

/** This function tells if a value is a valid axis. */
export function isAxis(u: unknown): u is Axis {
  if (!isObject(u)) return false;
  switch (u["t"]) {
    case "all":
    case "others":
    case "other":
    case "children":
    case "ancestors":
    case "descendants":
    case "siblings":
      return true;
    case "neighbors":
      return u["n"] === 4 || u["n"] === 8;
    case "where":
      return isAxis(u["axis"]) && isExpr(u["test"]);
    default:
      return false;
  }
}

const isExprRecord = (u: unknown): u is Readonly<Record<string, Expr>> =>
  isObject(u) && !Array.isArray(u) && Object.values(u).every((e) => isExpr(e));

/** This function tells if a value is a valid expression. It checks the whole tree. */
export function isExpr(u: unknown): u is Expr {
  if (!isObject(u)) return false;
  switch (u["tag"]) {
    case "lit":
      return "value" in u;
    case "ref":
      return isStringArray(u["path"]) && (u["at"] === undefined || (Array.isArray(u["at"]) && u["at"].every(isMove)));
    case "app":
      return typeof u["op"] === "string" && Array.isArray(u["args"]) && u["args"].every((a) => isExpr(a));
    case "let":
      return isExprRecord(u["bind"]) && isExpr(u["body"]);
    case "var":
      return typeof u["name"] === "string";
    case "rec":
      return isExprRecord(u["fields"]);
    case "each":
      return isAxis(u["axis"]) && isExpr(u["body"]) && (u["at"] === undefined || (Array.isArray(u["at"]) && u["at"].every(isMove)));
    case "ext":
      return typeof u["kind"] === "string" && "data" in u;
    default:
      return false;
  }
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

function whereTests(a: Axis): readonly Expr[] {
  return a.t === "where" ? [...whereTests(a.axis), a.test] : [];
}

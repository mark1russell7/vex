/**
 * A depth-first search that keeps its state in lists (LIST.SETNTH, LOOP.LIST). A layer search has this shape: a list of
 * states, one for each node, and a stack in two parallel lists. Each step changes one item of a list.
 *
 * The program has two forms of that change, so a test can compare them. `putEach` makes the list again with an `each`,
 * and `putItem` uses `setNth`. The search gives the nodes in the order of their ends, and the count of back edges. A
 * graph with no back edge has no cycle, and the reverse of the order is a topological order.
 *
 * All edges are in one flat list. Each record gives the node its range of that list, so a module knows each kind.
 */
import { app, axes, each, iterate, isVexList, let_, lit, rec, ref, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";

/** The result of a search. */
export interface SearchResult {
  /** The nodes in the order of their ends. */
  readonly order: readonly number[];
  /** The count of the edges to a node on the stack. */
  readonly back: number;
}

/** A change of one item: the list with the value `x` at the position `i`. */
export type Put = (list: Expr, i: Expr, x: Expr) => Expr;

/** The form without the op: an `each` over the list gives the new value at one position. */
export const putEach: Put = (list, i, x) => each(axes.list(list), app("if", app("eq", v("$j"), i), x, v("$old")), undefined, ["$old", "$j"]);

/** The form with the op `setNth`. */
export const putItem: Put = (list, i, x) => app("setNth", list, i, x);

/** An empty list of numbers. A module takes the kind of the items of a name from its first value (COMPILE.MODULE.FILL). */
const NONE = app("fill", lit(0), lit(0));
/** The states of a node: not seen, on the stack, and at its end. */
const NEW = 0;
const OPEN = 1;
const DONE = 2;
/** The most steps of a search. Each edge and each node takes a small number of steps. */
const LIMIT = 100_000;

const name = v;
const one = (x: Expr): Expr => app("fill", lit(1), x);
const push = (list: Expr, x: Expr): Expr => app("append", list, one(x));
const below = (x: Expr): Expr => app("subtract", x, lit(1));
const pop = (list: Expr): Expr => app("take", list, below(app("count", list)));
const top = (list: Expr): Expr => app("nth", list, below(app("count", list)));
const is = (x: Expr, value: number): Expr => app("eq", x, lit(value));

/** This function gives the program of the search, at any key of a space with one record for each node. */
export function searchProgram(put: Put): Expr {
  const [st, sv, si, root, done, back] = [name("st"), name("sv"), name("si"), name("root"), name("done"), name("back")];
  const count = app("count", name("ats"));
  const idle = is(app("count", sv), 0);
  const fresh = is(app("nth", st, root), NEW);
  const u = name("u");
  const w = name("w");
  // The top of the stack: the node u and its next edge i.
  const atNode = (body: Expr): Expr => let_({ u: top(sv), i: top(si) }, body);
  const end = app("eq", name("i"), app("nth", name("stops"), u));
  // The edge i goes to w, and s is the state of w.
  const atEdge = (body: Expr): Expr => let_({ w: app("nth", name("to"), name("i")) }, let_({ s: app("nth", st, w) }, body));
  const first = (node: Expr): Expr => app("nth", name("ats"), node);
  const seen = is(name("s"), NEW);
  const step = {
    st: app("if", idle, app("if", fresh, put(st, root, lit(OPEN)), st), atNode(app("if", end, put(st, u, lit(DONE)), atEdge(app("if", seen, put(st, w, lit(OPEN)), st))))),
    sv: app("if", idle, app("if", fresh, push(sv, root), sv), atNode(app("if", end, pop(sv), atEdge(app("if", seen, push(sv, w), sv))))),
    si: app("if", idle, app("if", fresh, push(si, first(root)), si), atNode(app("if", end, pop(si), atEdge(let_({ moved: put(si, below(app("count", si)), app("add", name("i"), lit(1))) }, app("if", seen, push(name("moved"), first(w)), name("moved"))))))),
    root: app("if", idle, app("add", root, lit(1)), root),
    done: app("if", idle, done, atNode(app("if", end, push(done, u), done))),
    back: app("if", idle, back, atNode(app("if", end, back, atEdge(app("if", is(name("s"), OPEN), app("add", back, lit(1)), back))))),
  };
  const init = { st: app("fill", count, lit(NEW)), sv: NONE, si: NONE, root: lit(0), done: NONE, back: lit(0) };
  const until = app("and", idle, app("gte", root, count));
  const input = { to: app("flat", each(axes.all, ref("next"))), ats: each(axes.all, ref("at")), stops: each(axes.all, ref("stop")) };
  return let_(input, iterate(LIMIT, init, step, rec({ order: done, back }), until));
}

/** The program with `setNth`. */
export const SEARCH_ITEM = searchProgram(putItem);
/** The program with an `each` for each change. */
export const SEARCH_EACH = searchProgram(putEach);

export const SEARCH_DOMAINS = [NumDomain, BoolDomain];
export const SEARCH_SCHEMA = { fields: { next: { list: "number" }, at: "number", stop: "number" } } as const;

/** This record is one node of a graph. It has the ends of its edges, and their range in the flat list of all edges. */
export interface SearchRecord {
  readonly next: readonly number[];
  readonly at: number;
  readonly stop: number;
}

/** This function gives the records of a graph. */
export function searchRecords(next: readonly (readonly number[])[]): readonly SearchRecord[] {
  let at = 0;
  return next.map((x) => {
    const record = { next: x, at, stop: at + x.length };
    at = record.stop;
    return record;
  });
}

/** This function gives the plain form of the value of the program. The order is a list in a tier, and an array in a plain module. */
export function searchResult(value: unknown): SearchResult {
  const { order, back } = value as { readonly order: unknown; readonly back: number };
  return { order: isVexList(order) ? order.items.map((it) => (it.result.ok ? (it.result.value as number) : Number.NaN)) : (order as readonly number[]), back };
}

/** This function is the search in plain TypeScript. */
export function searchReference(next: readonly (readonly number[])[]): SearchResult {
  const states = next.map(() => NEW);
  const order: number[] = [];
  let back = 0;
  const visit = (u: number): void => {
    states[u] = OPEN;
    for (const w of next[u] ?? []) {
      if (states[w] === NEW) visit(w);
      else if (states[w] === OPEN) back += 1;
    }
    states[u] = DONE;
    order.push(u);
  };
  for (const u of next.keys()) if (states[u] === NEW) visit(u);
  return { order, back };
}

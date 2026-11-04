// The walk of a between program as a standalone module (LIMITCOST, COMPILE.MODULE.LIMIT.ONCE). The limit of the walk is the
// data limit over the list of the parents, so it has one target for each node. The gate compares the module with a
// variant that counts at each key, as the module did before the fix. The test in `limit-walk.test.ts` checks the edit.
import { app, axes, dataLimit, index, iterate, let_, lit, rec, ref, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { emitModule } from "../src/index.ts";

/** This type is the run of the module: an edge of a tree gives its ancestor and the two children below it. */
export type WalkRun = (records: unknown, vars: unknown) => readonly unknown[];

/** An edge of the tree. The first edge holds the parents, because a variable of a module cannot be a list. */
export interface WalkRecord {
  readonly s: number;
  readonly t: number;
  readonly parents: readonly number[];
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const parentOf = (x: Expr): Expr => op("nth", v("$parents"), x);
const A_ABOVE = op("gt", v("a"), v("b"));
const B_ABOVE = op("lt", v("a"), v("b"));

/**
 * The walk to the lowest common ancestor of the ends of an edge. A parent has a lower position than its children, so
 * each step moves the end with the higher position to its parent. The data limit is the count of the nodes.
 */
export const WALK_PROGRAM: Expr = let_(
  { $parents: ref("parents", [index(0)]) },
  iterate(
    dataLimit(axes.list(v("$parents"))),
    { a: ref("s"), b: ref("t"), fromChild: lit(-1), toChild: lit(-1) },
    {
      a: op("if", A_ABOVE, parentOf(v("a")), v("a")),
      b: op("if", B_ABOVE, parentOf(v("b")), v("b")),
      fromChild: op("if", A_ABOVE, v("a"), v("fromChild")),
      toChild: op("if", B_ABOVE, v("b"), v("toChild")),
    },
    rec({ owner: v("a"), from: v("fromChild"), to: v("toChild") }),
    op("eq", v("a"), v("b")),
  ),
);

/** The options of the module of the walk. */
export const WALK_OPTIONS = {
  domains: [NumDomain, BoolDomain],
  schema: { fields: { s: "number", t: "number", parents: { list: "number" } }, vars: {} },
  lists: "plain",
  name: "walk",
} as const;

// The emitter writes a count that reads no key as `const c = L(() => {`, the statements of its loop, `return n;` and `});`.
const LAZY_COUNT = /^ {2}const (c\d+) = L\(\(\) => \{\n((?: {4}.*\n)+?) {4}return (\w+);\n {2}\}\);\n/gm;

/** This edit moves the count of the data limit into the loop over the keys, so each key counts again. */
export const countAtEachKey = (source: string): string => {
  const found = [...source.matchAll(LAZY_COUNT)];
  const [text, name, body, value] = found[0] ?? [];
  if (found.length !== 1 || text === undefined || name === undefined || body === undefined || value === undefined) throw new Error("limit-walk: the edit needs one lazy count in the module of the walk.");
  const read = `G(${name}())`;
  const at = source.indexOf(read);
  if (at < 0) throw new Error(`limit-walk: the module of the walk has no read of the count ${name}.`);
  const line = source.lastIndexOf("\n", at) + 1;
  const moved = body.trimEnd().replaceAll(/^/gm, "  ");
  return `${source.slice(0, line)}${moved}\n${source.slice(line, at)}${value}${source.slice(at + read.length)}`.replace(text, "");
};

/** This function loads the module of the walk, with the source changed by `edit`. */
export const loadWalk = (edit: (source: string) => string): WalkRun => {
  const m = emitModule(WALK_PROGRAM, WALK_OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  const load = new Function(`${edit(m.source.replaceAll(/^export /gm, ""))}\nreturn walk;`) as () => WalkRun;
  return load();
};

/** This function gives one edge for each node of a tree: a root and `depth` levels of `branch` children. */
export function walkRecords(branch: number, depth: number): readonly WalkRecord[] {
  const nodes = Array.from({ length: depth + 1 }, (_x, d) => branch ** d).reduce((a, b) => a + b, 0);
  const parents = Array.from({ length: nodes }, (_x, i) => (i === 0 ? -1 : Math.floor((i - 1) / branch)));
  return parents.map((_p, i) => ({ s: i, t: (i * 37 + 11) % nodes, parents: i === 0 ? parents : [] }));
}

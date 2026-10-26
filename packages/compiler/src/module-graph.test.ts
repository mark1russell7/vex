/**
 * Graph spaces and `reduce` in standalone modules (docs/COMPILER.md, the force pilot). The run of a graph space takes the
 * edges as positions (COMPILE.MODULE.GRAPH). A module has `reduce` with the op of a domain (COMPILE.MODULE.REDUCE).
 */
import { app, axes, cell, each, evaluate, fold, index, iterate, let_, lit, offset, rec, ref, SheetRun, space, v, vexList, type Expr, type ListItem, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, XYDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown, edges?: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
  readonly VexContractError: new (m: string) => Error;
}

const SCHEMA = { fields: { n: "number", w: "number", s: "string", b: "boolean" }, vars: { a: "number" } } as const;
const GRAPH: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA, space: "graph" };
const ARRAY: ModuleOptions = { ...GRAPH, space: "array" };
const RECORDS = [
  { n: 1, w: 4, s: "x", b: true },
  { n: 2, w: 0, s: "yz", b: false },
  { n: 3, w: 2.5, s: "", b: true },
  { n: 4, w: -1, s: "x", b: false },
  { n: 5, w: 1, s: "q", b: true },
];
/**
 * The edges of the records: 0 has a duplicate edge to 1 and an edge to itself. The edges 1 to 2 to 0 make a cycle. 3
 * has an edge to 0, and 4 has no edges and no edge goes to it.
 */
const EDGES: readonly (readonly number[])[] = [[1, 0, 1], [2], [0], [0, 2], []];
const VARS = { a: 2 };

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR, VexContractError };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, options: ModuleOptions = GRAPH): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the reason that a program cannot be a module, or "" for a module. */
function reasonOf(e: Expr, options: ModuleOptions = GRAPH): string {
  const m = emitModule(e, options);
  return m.ok ? "" : m.reason;
}

/** This function gives the graph space of some records: the key of a record is the text of its position. */
function graphOf(records: readonly unknown[], edges: readonly (readonly number[])[]): Space {
  return space.graph(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(edges.map((ends, i) => [String(i), ends.map(String)])));
}

/** This function gives the values of the interpreter at each key of a space, or `VEX_ERROR` for an error. */
function interpreted(e: Expr, s: Space, error: unknown, options: ModuleOptions = GRAPH, vars: Readonly<Record<string, unknown>> = VARS): unknown[] {
  return s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars, domains: options.domains ?? [] });
    return r.ok ? r.value : error;
  });
}

/** This function compares the values of a module of a graph space with the interpreter at each key, and gives the values. */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS, edges: readonly (readonly number[])[] = EDGES, options: ModuleOptions = GRAPH): readonly unknown[] {
  const m = make(sourceOf(e, options));
  const got = m.run(structuredClone(records), VARS, structuredClone(edges));
  expect(got).toStrictEqual(interpreted(e, graphOf(records, edges), m.VEX_ERROR, options));
  return got;
}

/** This function compares the values of a module of an array space with the interpreter at each key, and gives the values. */
function expectSameArray(e: Expr, options: ModuleOptions = ARRAY): readonly unknown[] {
  const m = make(sourceOf(e, options));
  const got = m.run(structuredClone(RECORDS), VARS);
  expect(got).toStrictEqual(interpreted(e, space.array(RECORDS), m.VEX_ERROR, options));
  return got;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const PARENT = { t: "parent" } as const;
/** The keys of the targets of an axis, in the order of the axis: a fold that adds each key as a digit. */
const order = (axis: Parameters<typeof each>[0]): Expr => fold(axis, { s: lit(0) }, { s: op("add", op("multiply", v("s"), lit(10)), op("subtract", n, lit(1))) }, v("s"));
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });

describe("COMPILE.MODULE.GRAPH: a module of a graph space", () => {
  it("COMPILE.MODULE.GRAPH: the run takes the edges, and edges that are not an array of positions for each record throw a VexContractError", () => {
    const source = sourceOf(op("count", each(axes.successors, n)));
    expect(source).toContain("export function run(records, vars, edges) {");
    const m = make(source);
    const fails = (edges: unknown, message: string): void => {
      expect(() => m.run(structuredClone(RECORDS), VARS, edges)).toThrow(m.VexContractError);
      expect(() => m.run(structuredClone(RECORDS), VARS, edges)).toThrow(message);
    };
    const all = "the edges are not an array with the ends of the edges of each record";
    fails(undefined, all);
    fails({}, all);
    fails([[], [], [], []], all);
    fails([[], [], [], [], [], []], all);
    fails([[], [], { 0: 1 }, [], []], "the edges of the record 2 are not an array");
    for (const end of [5, -1, 1.5, "1", Number.NaN, null]) fails([[], [], [], [end], []], "an edge of the record 3 does not go to the position of a record");
    // The check comes before the first value, so no record gets a value.
    expect(m.run([], VARS, [])).toStrictEqual([]);
    expect(m.run(structuredClone(RECORDS), VARS, [[4], [4], [4], [4], [0, 1, 2, 3]])).toStrictEqual([1, 1, 1, 1, 4]);
  });

  it("COMPILE.MODULE.GRAPH AXIS.GRAPH: successors, predecessors and reachable give the targets of the interpreter, in its order", () => {
    // The successors keep the first edge of two edges to one record, and an edge to the record itself.
    expect(expectSame(order(axes.successors))).toStrictEqual([10, 2, 0, 2, 0]);
    // The predecessors come in key order, once for each record.
    expect(expectSame(order(axes.predecessors))).toStrictEqual([23, 0, 13, 0, 0]);
    // The search of reachable goes breadth first, without the focus, and once for each record on a cycle.
    expect(expectSame(order(axes.reachable))).toStrictEqual([12, 20, 1, 21, 0]);
    expect(expectSame(order(axes.reverse(axes.successors)))).toStrictEqual([1, 2, 0, 20, 0]);
    expect(expectSame(order(axes.reverse(axes.predecessors)))).toStrictEqual([320, 0, 31, 0, 0]);
    expect(expectSame(order(axes.reverse(axes.reachable)))).toStrictEqual([21, 2, 10, 120, 0]);
    // The axes with a test, from another address, and the axes of each space.
    expectSame(op("sum", each(axes.where(axes.reachable, op("gt", w, lit(0))), n)));
    expectSame(op("sum", each(axes.successors, n, [index(3)])));
    expectSame(op("count", each(axes.predecessors, n, [{ t: "origin" }])));
    expectSame(rec({ all: order(axes.all), others: order(axes.others), any: op("any", each(axes.reachable, ref("b"))), none: op("none", each(axes.predecessors, ref("b"))) }));
    // An empty graph and a graph with no edges.
    expectSame(order(axes.reachable), [], []);
    expectSame(rec({ s: order(axes.successors), p: order(axes.predecessors), r: order(axes.reachable) }), RECORDS, RECORDS.map(() => []));
  });

  it("COMPILE.MODULE.GRAPH NAV.OFFSET NAV.PARENT: an offset and the move parent give an error at each key of a graph", () => {
    const m = make(sourceOf(rec({ next: op("ifError", ref("n", [offset(1)]), lit(-1)), up: op("ifError", ref("n", [PARENT]), lit(-2)), zero: op("ifError", ref("n", [offset(0)]), lit(-3)) })));
    expect(m.run(structuredClone(RECORDS), VARS, EDGES)).toStrictEqual(RECORDS.map(() => ({ next: -1, up: -2, zero: -3 })));
    expectSame(rec({ next: ref("n", [offset(1)]), up: ref("w", [PARENT]) }));
    // In an array space, the same offset gives the value of the next record.
    expect(expectSameArray(op("ifError", ref("n", [offset(1)]), lit(-1)))).toStrictEqual([2, 3, 4, 5, -1]);
  });

  it("COMPILE.MODULE.GRAPH: a window and the axes of a tree or a grid give a reason in a graph space", () => {
    expect(reasonOf(op("count", each(axes.window(-1, 0), n)))).toBe('the axis "window" in a graph space');
    expect(reasonOf(op("count", each(axes.window(0.5, 1), n)))).toBe('the axis "window" with a bound that is not an integer');
    expect(reasonOf(op("count", each(axes.children, n)))).toBe('the axis "children"');
    expect(reasonOf(op("count", each(axes.ancestors, n)))).toBe('the axis "ancestors"');
    expect(reasonOf(op("count", each(axes.neighbors(4), n)))).toBe('the axis "neighbors"');
    // The axes of a graph give a reason in an array space.
    expect(reasonOf(op("count", each(axes.successors, n)), ARRAY)).toBe('the axis "successors"');
    expect(reasonOf(n, { ...GRAPH, space: "grid" as "graph" })).toBe('the space "grid" is not "array", "tree" or "graph"');
  });

  it("COMPILE.MODULE.GRAPH: a module computes the predecessors and the search of reachable only for a program that reads them", async () => {
    const parts = (e: Expr): string => {
      const source = sourceOf(e);
      return ["GR(", "GI(", "RB("].filter((x) => source.includes(x)).join(" ");
    };
    expect(parts(n)).toBe("GR(");
    expect(parts(order(axes.successors))).toBe("GR(");
    expect(parts(order(axes.predecessors))).toBe("GR( GI(");
    expect(parts(order(axes.reachable))).toBe("GR( RB(");
    expect(sourceOf(n)).toContain("  const GO = GR(edges, n);\n  const out = [];");
    expect(sourceOf(order(axes.predecessors))).toContain("  const GO = GR(edges, n);\n  const GN = GI(GO, n);\n");
    expect(sourceOf(n, ARRAY)).not.toContain("GR(");
    const e = rec({ out: order(axes.successors), into: order(axes.predecessors), all: op("sum", each(axes.reachable, op("multiply", n, w))) });
    await expect(sourceOf(e)).toMatchFileSnapshot("./__golden__/module-graph.js");
    expectSame(e);
  });

  it("COMPILE.MODULE.GRAPH SHEET.FILL: a sheet of a graph space fills its columns in key order and gives the results of SheetRun", () => {
    const columns = new Map<string, Expr>([
      ["A", op("add", n, op("sum", each(axes.successors, cell("B"))))],
      ["B", op("multiply", n, lit(2))],
      ["C", op("sum", each(axes.reachable, cell("A")))],
      // The edges of 0, 1 and 2 make cycles, so D is on a cycle at 0, 1 and 2. The sum at 3 skips these errors (LIST.LENIENT).
      ["D", op("add", n, op("sum", each(axes.successors, cell("D"))))],
    ]);
    const m = emitSheetModule(columns, { ...GRAPH, kinds: { A: "number", B: "number", C: "number", D: "number" } });
    if (!m.ok) throw new Error(m.reason);
    expect(m.source).toContain("export function run(records, vars, edges) {");
    const loaded = make(m.source) as unknown as { readonly run: (r: unknown, v: unknown, e: unknown) => Readonly<Record<string, readonly unknown[]>>; readonly VEX_ERROR: unknown };
    const s = graphOf(RECORDS, EDGES);
    const run = new SheetRun(columns, { space: s, domains: GRAPH.domains ?? [] });
    const want = Object.fromEntries(["A", "B", "C", "D"].map((c) => [c, s.keys.map((k) => {
      const r = run.cell(c, k);
      return r.ok ? r.value : loaded.VEX_ERROR;
    })]));
    expect(loaded.run(structuredClone(RECORDS), VARS, EDGES)).toStrictEqual(want);
    expect(want["D"]).toStrictEqual([loaded.VEX_ERROR, loaded.VEX_ERROR, loaded.VEX_ERROR, 4, 5]);
    expect(want["C"]).toStrictEqual([13, 12, 15, 20, 0]);
  });
});

describe("COMPILE.MODULE.REDUCE: reduce with the op of a domain in a module", () => {
  const ns = each(axes.all, n);
  const inv = each(axes.all, op("divide", lit(1), w));
  const none = each(axes.where(axes.all, lit(false)), n);
  const guard = (e: Expr): Expr => op("ifError", e, lit(-1));

  it("COMPILE.MODULE.REDUCE LIST.REDUCE: reduce over an axis, a let, a list op and a literal gives the value of the interpreter", () => {
    expect(
      expectSameArray(
        rec({
          sum: op("reduce", ns, lit("add")),
          product: op("reduce", ns, lit("multiply")),
          // The order of the items counts: 1 - 2 - 3 - 4 - 5.
          minus: op("reduce", ns, lit("subtract")),
          most: op("reduce", ns, lit("max")),
          let: let_({ l: ns }, op("reduce", v("l"), lit("add"))),
          take: op("reduce", op("take", ns, lit(2)), lit("subtract")),
          literal: op("reduce", lit(vexList([item("a", 2), item("b", 5)])), lit("multiply")),
          bools: op("reduce", each(axes.all, ref("b")), lit("xor")),
          loop: iterate(2, { l: ns }, { l: each(axes.all, op("add", n, op("reduce", v("l"), lit("add")))) }, op("reduce", v("l"), lit("max"))),
        }),
      )[0],
    ).toStrictEqual({ sum: 15, product: 120, minus: -13, most: 5, let: 15, take: -1, literal: 10, bools: true, loop: 95 });
  });

  it("COMPILE.MODULE.REDUCE LIST.EMPTY: no items give the identity of the one domain with one, or of the domain of the option", () => {
    expect(
      expectSameArray(
        rec({
          add: op("reduce", none, lit("add")),
          multiply: op("reduce", none, lit("multiply")),
          and: op("reduce", each(axes.where(axes.all, lit(false)), ref("b")), lit("and")),
          named: op("reduce", none, lit("add"), lit({ domain: "Num" })),
          // An op with no identity, a domain without the op and a domain that the program does not have.
          max: guard(op("reduce", none, lit("max"))),
          other: guard(op("reduce", none, lit("add"), lit({ domain: "Bool" }))),
          unknown: guard(op("reduce", none, lit("add"), lit({ domain: "Nope" }))),
        }),
      )[0],
    ).toStrictEqual({ add: 0, multiply: 1, and: true, named: 0, max: -1, other: -1, unknown: -1 });
    // Two domains with an identity of "add" need the option domain. With the option, the identity has the kind of that domain.
    const XY: ModuleOptions = { domains: [NumDomain, XYDomain], schema: SCHEMA, space: "array" };
    const points = each(axes.where(axes.all, ref("b")), op("xy", n, w));
    const empty = each(axes.where(axes.all, lit(false)), op("xy", n, w));
    expect(expectSameArray(rec({ two: guard(op("reduce", empty, lit("add"))), named: op("reduce", empty, lit("add"), lit({ domain: "XY" })), sum: op("reduce", points, lit("add")) }), XY)[0]).toStrictEqual({
      two: -1,
      named: { x: 0, y: 0 },
      sum: { x: 9, y: 7.5 },
    });
    // The identity of Num is a number, so the result of "add" over points with the option Num has no known kind.
    expect(reasonOf(op("xy", op("reduce", empty, lit("add"), lit({ domain: "Num" })), lit(1)), XY)).toBe('the kinds of the values of "xy" do not decide its op');
    expect(expectSameArray(op("reduce", empty, lit("add"), lit({ domain: "Num" })), XY)[0]).toBe(0);
  });

  it("COMPILE.MODULE.REDUCE LIST.LENIENT: reduce skips an error item, and the option strict gives the error", () => {
    const [first] = expectSameArray(rec({ lenient: op("reduce", inv, lit("add")), strict: guard(op("reduce", inv, lit("add"), lit({ strict: true }))), both: guard(op("reduce", inv, lit("add"), lit({ strict: true, domain: "Num" }))) }));
    expect(first).toMatchObject({ strict: -1, both: -1 });
    expect((first as { readonly lenient: number }).lenient).toBeCloseTo(0.65, 12);
    // A step that gives a value that is not finite is an error of the op, also without strict.
    expectSameArray(guard(op("reduce", each(axes.all, op("multiply", n, lit(1e308))), lit("multiply"))));
    // A graph space has reduce too: the force pilot adds the forces of the successors and of the predecessors.
    expectSame(rec({ out: op("reduce", each(axes.successors, w), lit("add")), into: guard(op("reduce", each(axes.predecessors, n), lit("subtract"))), far: op("reduce", each(axes.reachable, w), lit("max"), lit({ strict: true })) }));
  });

  it("COMPILE.MODULE.REDUCE COMPILE.MODULE.SHEET: an error of a step does not stop the reads of the cells of the next items", () => {
    // At the key 0, J multiplies the values of X. The second step overflows. The third item reads J at the key 0, so the
    // interpreter puts J and X at the key 2 on a cycle. A module that stops at the step reads no cell of the third item.
    const columns = new Map<string, Expr>([
      ["J", op("reduce", each(axes.all, cell("X")), lit("multiply"))],
      ["X", op("if", op("gt", n, lit(1)), n, op("ifError", cell("J", [index(0)]), lit(5)))],
    ]);
    const records = [{ n: 1e200, w: 0, s: "", b: true }, { n: 1e200, w: 0, s: "", b: true }, { n: 0, w: 0, s: "", b: true }];
    const m = emitSheetModule(columns, { ...ARRAY, kinds: { J: "number", X: "number" } });
    if (!m.ok) throw new Error(m.reason);
    const loaded = make(m.source) as unknown as { readonly run: (r: unknown, v: unknown) => Readonly<Record<string, readonly unknown[]>>; readonly VEX_ERROR: unknown };
    const s = space.array(records);
    const run = new SheetRun(columns, { space: s, domains: ARRAY.domains ?? [] });
    const want = Object.fromEntries(["J", "X"].map((c) => [c, s.keys.map((k) => {
      const r = run.cell(c, k);
      return r.ok ? r.value : loaded.VEX_ERROR;
    })]));
    expect(want["X"]).toStrictEqual([1e200, 1e200, loaded.VEX_ERROR]);
    expect(loaded.run(structuredClone(records), VARS)).toStrictEqual(want);
  });

  it("COMPILE.MODULE.REDUCE: reduce without a literal op, with other options, or with an op of another kind gives a reason", () => {
    expect(reasonOf(op("reduce", ns, ref("s")), ARRAY)).toBe('"reduce" without a literal text as its op');
    expect(reasonOf(op("reduce", ns), ARRAY)).toBe('"reduce" without a literal text as its op');
    expect(reasonOf(op("reduce", ns, lit(1)), ARRAY)).toBe('"reduce" without a literal text as its op');
    expect(reasonOf(op("reduce", ns, lit("add"), lit({ step: 1 })), ARRAY)).toBe('the options of "reduce" are not a literal with strict or domain');
    expect(reasonOf(op("reduce", ns, lit("add"), lit({}), lit({})), ARRAY)).toBe('"reduce" with more than one option');
    expect(reasonOf(op("reduce", ns, lit("eq")), ARRAY)).toBe('the op "eq" of "reduce" gives a value of the kind boolean, not of the kind number of the items');
    expect(reasonOf(op("reduce", ns, lit("and")), ARRAY)).toBe('the kinds of the values of "and" do not decide its op');
    expect(reasonOf(op("reduce", each(axes.all, op("if", ref("b"), n, ref("s"))), lit("add")), ARRAY)).toBe('the kinds of the values of "add" do not decide its op');
    // The other list ops keep their reason for other options.
    expect(reasonOf(op("sum", ns, lit({ domain: "Num" })), ARRAY)).toBe('the options of "sum" are not a literal with strict');
  });
});

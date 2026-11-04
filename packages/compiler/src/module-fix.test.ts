/**
 * A fixed-point column in a standalone module (COMPILE.FIX.MODULE) and the differential property over the tiers (P17).
 * The tests compare each result with the interpreter, with `SheetRun` for a sheet.
 */
import { app, axes, call, cell, each, evaluate, fix, fn, last, let_, lit, ref, SheetRun, space, v, vexList, type Expr, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { arbFixGraph, arbFixProgram, type FixGraph } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";
import { tiered } from "./tiers.ts";

type Run = (records: unknown, vars: unknown, links?: unknown) => readonly unknown[];
type SheetFn = (records: unknown, vars: unknown, links?: unknown) => Readonly<Record<string, readonly unknown[]>>;
interface Loaded<R> {
  readonly run: R;
  readonly VEX_ERROR: unknown;
}

const DOMAINS = [NumDomain, BoolDomain, TextDomain];
const SCHEMA = { fields: { n: "number", b: "boolean" } } as const;
const ARRAY: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const GRAPH: ModuleOptions = { ...ARRAY, space: "graph" };
const TREE: ModuleOptions = { ...ARRAY, space: "tree" };
const RECORDS = [
  { n: 3, b: true },
  { n: 1, b: false },
  { n: 4, b: true },
  { n: 2, b: false },
];
const EDGES: readonly (readonly number[])[] = [[1], [2, 0], [], [3]];
const PARENTS = [-1, 0, 0, 1];
const ZEROS = [
  { n: 0, b: true },
  { n: 1, b: false },
  { n: 0, b: true },
];

const X = last("x");
const LIMIT = fix("x", "max", lit(0), app("add", X, lit(1)));
const SPREAD = fix("x", "max", ref("n"), app("max", X, app("max", each(axes.all, X))));
const REACH = fix("x", "or", ref("b"), app("any", each(axes.predecessors, X)));
const SETTLED = fix("x", "min", ref("n"), X);

/** This function makes the module of a source with `new Function`. */
function make<R>(source: string): Loaded<R> {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded<R>;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, options: ModuleOptions = ARRAY): string {
  const m = emitModule(e, options);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the graph space of some records: the key of a record is the text of its position. */
function graphOf(records: readonly unknown[], edges: readonly (readonly number[])[]): Space {
  return space.graph(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(edges.map((ends, i) => [String(i), ends.map(String)])));
}

/** This function gives the tree space of some records: the position of the parent of each record, or -1. */
function treeOf(records: readonly unknown[], parents: readonly number[]): Space {
  return space.tree(Object.fromEntries(records.map((r, i) => [String(i), r])), Object.fromEntries(parents.flatMap((p, i) => (p < 0 ? [] : [[String(i), String(p)]]))));
}

/** This function compares a module with the interpreter at each key of a space. */
function expectModule(e: Expr, s: Space, records: readonly unknown[], links?: unknown, options: ModuleOptions = ARRAY, source = sourceOf(e, options)): string {
  const m = make<Run>(source);
  const want = s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, domains: DOMAINS });
    return r.ok ? r.value : m.VEX_ERROR;
  });
  expect(m.run(structuredClone(records), {}, links)).toStrictEqual(want);
  return source;
}

/** This function compares a module over an array with the interpreter. */
const sameInArray = (e: Expr, records: readonly unknown[] = RECORDS): string => expectModule(e, space.array(records), records);

/** This function compares a module of a sheet with `SheetRun` at each cell of each column. */
function sameSheet(columns: ReadonlyMap<string, Expr>, kinds: Readonly<Record<string, "number" | "boolean">>, records: readonly unknown[] = RECORDS): string {
  const emitted = emitSheetModule(columns, { ...ARRAY, kinds });
  if (!emitted.ok) throw new Error(emitted.reason);
  const m = make<SheetFn>(emitted.source);
  const s = space.array(records);
  const run = new SheetRun(columns, { space: s, domains: DOMAINS });
  const want = Object.fromEntries([...columns.keys()].map((c) => [c, s.keys.map((k) => {
    const r = run.cell(c, k);
    return r.ok ? r.value : m.VEX_ERROR;
  })]));
  expect(m.run(structuredClone(records), {})).toStrictEqual(want);
  return emitted.source;
}

describe("COMPILE.FIX.MODULE: a module of a column", () => {
  it("COMPILE.FIX.MODULE: a module gives the rows of a column in an array, a graph and a tree", () => {
    expect(sameInArray(SPREAD)).toContain("Math.max(");
    sameInArray(SETTLED);
    sameInArray(fix("x", "and", ref("b"), app("and", X, app("all", each(axes.all, X)))));
    expectModule(REACH, graphOf(RECORDS, EDGES), RECORDS, EDGES, GRAPH);
    expectModule(fix("x", "max", ref("n"), app("max", X, app("max", each(axes.children, X)))), treeOf(RECORDS, PARENTS), RECORDS, PARENTS, TREE);
  });

  it("COMPILE.FIX.MODULE: a column in another node gives the value of the interpreter", () => {
    const bindings = [let_({ y: SPREAD }, app("add", v("y"), lit(1))), let_({ f: fn([], SPREAD) }, call("f")), let_({ f: fn(["p"], fix("x", "max", v("p"), X)) }, call("f", ref("n")))];
    for (const e of bindings) sameInArray(e);
    sameInArray(app("sum", each(axes.all, SPREAD)));
    sameInArray(app("not", fix("x", "or", ref("b"), X)));
    sameInArray(app("ifError", LIMIT, lit(-1)));
    sameInArray(app("if", ref("b"), SETTLED, lit(0)));
  });

  it("COMPILE.FIX.MODULE: an inner column has its own rows, and an inner name hides the name outside", () => {
    const inner = fix("x", "max", lit(1), app("min", lit(3), app("add", X, lit(1))));
    sameInArray(fix("y", "max", ref("n"), app("max", last("y"), inner)));
    sameInArray(fix("x", "max", ref("n"), app("max", X, fix("x", "max", lit(2), app("add", lit(0), X)))));
    // The column of the first values reads the row of the key, so each key has its own column.
    sameInArray(fix("x", "max", ref("n"), app("max", X, app("max", each(axes.others, X)))));
  });

  it("COMPILE.FIX.MODULE FIX.LIMIT: a column at the round limit is an error at each key", () => {
    const m = make<Run>(sameInArray(LIMIT));
    expect(m.run(structuredClone(RECORDS), {})).toStrictEqual(RECORDS.map(() => m.VEX_ERROR));
  });

  it("COMPILE.FIX.MODULE FIX.ERROR: an error in a row is an error of the column at each key", () => {
    const broken = app("divide", lit(1), ref("n"));
    for (const e of [fix("x", "max", broken, X), fix("x", "max", lit(0), app("max", X, broken))]) {
      const m = make<Run>(sameInArray(e, ZEROS));
      expect(m.run(structuredClone(ZEROS), {})).toStrictEqual(ZEROS.map(() => m.VEX_ERROR));
    }
    sameInArray(app("ifError", fix("x", "max", lit(0), app("max", X, broken)), lit(7)), ZEROS);
  });

  it("COMPILE.FIX.MODULE FIX.KIND: a value of the wrong kind or a number that is not finite is an error", () => {
    const wrong = [fix("x", "max", ref("b"), X), fix("x", "min", lit(1), app("if", ref("b"), lit(true), X)), fix("x", "or", ref("n"), X), fix("x", "and", lit(true), app("if", ref("b"), lit(0), X))];
    for (const e of wrong) {
      const m = make<Run>(sameInArray(e));
      expect(m.run(structuredClone(RECORDS), {})).toStrictEqual(RECORDS.map(() => m.VEX_ERROR));
    }
    const records = [{ n: Number.POSITIVE_INFINITY, b: true }, { n: 1, b: false }];
    const m = make<Run>(sameInArray(fix("x", "max", ref("n"), X), records));
    expect(m.run(structuredClone(records), {})).toStrictEqual(records.map(() => m.VEX_ERROR));
  });

  it("COMPILE.FIX.MODULE FIX.ROUNDS: a round that moves 0 to -0 changes no row, so the row keeps 0", () => {
    const m = make<Run>(sameInArray(fix("x", "min", lit(0), lit(-0))));
    expect(m.run(structuredClone(RECORDS), {})).toStrictEqual(RECORDS.map(() => 0));
  });

  it("COMPILE.FIX.MODULE: an empty collection gives no rows and no error", () => {
    expect(make<Run>(sourceOf(LIMIT)).run([], {})).toStrictEqual([]);
    expect(make<Run>(sourceOf(REACH, GRAPH)).run([], {}, [])).toStrictEqual([]);
  });

  it("COMPILE.FIX.MODULE: a column that reads no key evaluates once, on its first read", () => {
    const source = sameInArray(app("if", lit(false), LIMIT, lit(1)));
    expect(source).toContain("L(() => {");
    // A part that depends on the key has its loop for each key.
    const keyed = fix("x", "max", ref("n", [{ t: "origin" }]), X);
    expect(sameInArray(keyed)).not.toContain("L(() => {");
    const called = let_({ f: fn(["p"], app("max", each(axes.all, fix("x", "max", v("p"), X)))) }, app("if", ref("b"), call("f", lit(1)), lit(2)));
    expect(sameInArray(called)).toContain("L(() => {");
  });

  it("COMPILE.FIX.MODULE: a part that a `let` drops needs no run", () => {
    expect(make<Run>(sourceOf(let_({ y: LIMIT }, lit(1)))).run(structuredClone(RECORDS), {})).toStrictEqual([1, 1, 1, 1]);
  });

  it("COMPILE.FIX.MODULE: a list that a part appends to keeps its items in each row", () => {
    const list = app("fill", lit(2), lit(1));
    const longer = app("count", app("append", v("l"), app("fill", lit(1), lit(1))));
    sameInArray(let_({ l: list }, fix("x", "max", longer, X)));
    sameInArray(let_({ l: list }, fix("x", "max", lit(0), app("max", X, longer))));
  });

  it("COMPILE.FIX.MODULE: a sum over a column reads the rows of the array, and a part with a row stays in the round", () => {
    const heavy = (x: Expr): Expr => app("sum", each(axes.all, app("add", app("multiply", x, lit(2)), app("multiply", ref("n"), app("add", ref("n"), lit(1))))));
    sameInArray(app("sum", each(axes.all, app("add", SETTLED, ref("n")))));
    const grow = fix("x", "max", lit(0), app("max", X, app("min", lit(5), app("add", app("max", each(axes.all, X)), lit(1)))));
    sameInArray(let_({ f: fn(["p"], app("sum", each(axes.all, app("add", heavy(v("p")), grow)))) }, app("sum", each(axes.all, call("f", ref("n"))))));
    const inFn = let_({ f: fn(["p"], fix("x", "max", lit(0), app("max", X, app("min", lit(4), app("add", app("max", each(axes.all, app("add", app("max", each(axes.all, X)), app("min", lit(1), app("multiply", v("p"), app("multiply", v("p"), v("p"))))))), lit(0)))))) }, call("f", lit(1)));
    sameInArray(inFn);
  });

  it("COMPILE.FIX.MODULE: a column at a key of a literal has no row, so a module refuses it with a reason", () => {
    const keys = vexList([{ key: "z", result: { ok: true, value: 1 } }]);
    const m = emitModule(app("count", each(axes.list(lit(keys)), SETTLED)), ARRAY);
    expect(m).toEqual({ ok: false, reason: expect.stringContaining('the axis "list" reads a record at a key of a literal or of "fill"') as string });
  });
});

describe("COMPILE.FIX.MODULE: a module of a sheet with a column", () => {
  it("COMPILE.FIX.MODULE: a direct fill gives the results of SheetRun, with a column that reads a finished cell", () => {
    const columns = new Map<string, Expr>([["A", app("add", ref("n"), lit(1))], ["B", fix("x", "max", cell("A"), app("max", X, app("max", each(axes.all, X))))]]);
    expect(sameSheet(columns, { A: "number", B: "number" })).not.toContain("RC(");
  });

  it("COMPILE.FIX.MODULE: a read of a cell at each row is no finished cell, so the search gives the results of SheetRun", () => {
    // The row of the key reads the cell of the key, so B is on a cycle at each key. A has its value.
    const columns = new Map<string, Expr>([["A", app("add", ref("n"), lit(1))], ["B", fix("x", "max", ref("n"), app("max", X, app("ifError", cell("B"), lit(0))))], ["C", fix("x", "max", cell("A"), X)]]);
    expect(sameSheet(columns, { A: "number", B: "number", C: "number" })).toContain("RC(");
  });

  it("COMPILE.FIX.MODULE FIX.ERROR: a row that fails does not stop the reads of the next rows", () => {
    const broken = app("divide", lit(1), app("subtract", ref("n"), lit(3)));
    // The first row fails, and the next rows read a cell of A. The search evaluates the cells of A in the order of the reads.
    const columns = new Map<string, Expr>([["B", fix("x", "max", lit(0), app("max", X, app("add", cell("A"), broken)))], ["A", app("multiply", ref("n"), lit(2))]]);
    const source = sameSheet(columns, { A: "number", B: "number" });
    expect(source).toContain("catch {");
    const fine = new Map<string, Expr>([["B", fix("x", "max", lit(0), app("max", X, cell("A")))], ["A", app("multiply", ref("n"), lit(2))]]);
    sameSheet(fine, { A: "number", B: "number" });
  });
});

const EMPTY: FixGraph = { records: {}, edges: {} };

/** This function compares tier 1, tier 2 and the module of a program at each key of a graph. */
function sameInTiers(e: Expr, g: FixGraph): void {
  const records = Object.values(g.records);
  const s = space.graph(g.records, g.edges);
  const options = { domains: DOMAINS, schema: SCHEMA };
  const p = tiered(e, options);
  expect(p.reason).toBeUndefined();
  const m = make<Run>(sourceOf(e, GRAPH));
  const values = m.run(structuredClone(records), {}, Object.keys(g.records).map((k) => (g.edges[k] ?? []).map(Number)));
  expect(values).toHaveLength(s.keys.length);
  s.keys.forEach((at, i) => {
    const r = evaluate(e, { ...options, space: s, origin: at });
    expect(p.run({ space: s, origin: at })).toEqual(r);
    expect(values[i]).toStrictEqual(r.ok ? r.value : m.VEX_ERROR);
  });
}

describe("P17: random columns in each tier", () => {
  it("COMPILE.FIX COMPILE.FIX.MODULE P17: tier 1, tier 2 and the module give one result at each key of each generated program", () => {
    const graph = fc.oneof({ weight: 8, arbitrary: arbFixGraph }, { weight: 1, arbitrary: fc.constant(EMPTY) });
    fc.assert(fc.property(arbFixProgram(), graph, sameInTiers), { numRuns: 300 });
  });

  it("COMPILE.FIX P17: the generator reaches the cases that the property needs", () => {
    const seen = new Set<string>();
    const note = (e: Expr, inStep: boolean): void => {
      if (e.tag === "fix") {
        if (inStep) seen.add("another column");
        if (JSON.stringify(e.step).includes('"tag":"last"')) seen.add("last of itself");
        if (JSON.stringify(e.step).includes('"op":"add"')) seen.add("a monotone op");
      }
    };
    const walk = (u: unknown, inStep: boolean): void => {
      if (typeof u !== "object" || u === null) return;
      if ("tag" in u) note(u as Expr, inStep);
      for (const [k, x] of Object.entries(u)) walk(x, inStep || ((u as Expr).tag === "fix" && k === "step"));
    };
    const g: FixGraph = { records: { 0: { n: 0, b: true }, 1: { n: 2, b: false }, 2: { n: 1, b: true } }, edges: { 0: ["1"], 1: ["2", "0"], 2: [] } };
    const s = space.graph(g.records, g.edges);
    for (const e of fc.sample(arbFixProgram(), { numRuns: 600, seed: 17 })) {
      walk(e, false);
      const r = evaluate(e, { domains: DOMAINS, space: s, origin: "1" });
      if (r.ok) seen.add("a value");
      else seen.add(r.error.message.includes("round") ? "the round limit" : r.error.message.includes("divi") || r.error.code === "#ARGS" ? "an error in a step" : "another error");
    }
    expect([...seen].toSorted()).toEqual(["a monotone op", "a value", "an error in a step", "another column", "another error", "last of itself", "the round limit"]);
  });
});

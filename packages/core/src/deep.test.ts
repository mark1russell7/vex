import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { evaluate, MAX_NESTING, nestingOf } from "./evaluate.ts";
import { app, axes, each, ext, index, isExpr, lit, offset, ref, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { cell, SheetRun } from "./sheet.ts";
import { space } from "./space.ts";
import { error, value } from "./test-support.ts";
import { defineDomain } from "./domain.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: { add: { fn: (a: number, b: number) => a + b, identity: () => 0, params: ["domain"] } },
});

/** A function that calls itself without an end, so it fills the call stack. */
const forever = (n: number): number => forever(n + 1) + 1;

/** An expression of `n` nested adds: add(add(add(1, 1), 1), 1) ... */
function nested(n: number): Expr {
  let e: Expr = lit(1);
  for (let i = 1; i < n; i++) e = app("add", e, lit(1));
  return e;
}

// These tests build structures 100000 levels deep. With the coverage of `pnpm check`, one test takes some seconds.
// The tests examine the depth, not the speed, so they have a longer time limit.
describe("evaluations that do not depend on the call stack", { timeout: 30_000 }, () => {
  it("SHEET.DEEP: a roll-up from the root of a tree 100000 levels deep gives the sum", () => {
    const n = 100_000;
    const records: Record<string, { size: number }> = {};
    const parents: Record<string, string | null> = {};
    for (let i = 0; i < n; i++) {
      records[`k${i}`] = { size: 1 };
      parents[`k${i}`] = i === 0 ? null : `k${i - 1}`;
    }
    const total = app("add", ref("size"), app("sum", each(axes.children, cell("total")), lit({ strict: true })));
    const run = new SheetRun(new Map([["total", total]]), { space: space.tree(records, parents), domains: [Num] });
    // The root is the first key, so the warm-up does not help: the run goes down the whole tree.
    expect(value(run.cell("total", "k0"))).toBe(n);
    expect(value(run.cell("total", "k99999"))).toBe(1);
  });

  it("SHEET.DEEP: a chain that reads the next row, read at the first row, gives the length of the chain", () => {
    const n = 100_000;
    const rows = Array.from({ length: n }, () => ({ v: 1 }));
    // The last row has no next row: ifError gives 0 for the #REF! there.
    const chain = app("add", ref("v"), app("ifError", cell("c", [offset(1)]), lit(0)));
    const run = new SheetRun(new Map([["c", chain]]), { space: space.array(rows), domains: [Num] });
    expect(value(run.cell("c", "0"))).toBe(n);
  });

  it("EVAL.NESTING: an expression deeper than the limit gives #VALUE! before the evaluation, and the limit itself works", () => {
    const s = space.record({ A: {} });
    expect(value(evaluate(nested(MAX_NESTING), { space: s, origin: "A", domains: [Num] }))).toBe(MAX_NESTING);
    const deep = error(evaluate(nested(MAX_NESTING + 1), { space: s, origin: "A", domains: [Num] }));
    expect([deep.code, deep.message]).toEqual(["#VALUE!", `the expression is nested ${MAX_NESTING + 1} levels deep, and the limit is ${MAX_NESTING}`]);
    expect(nestingOf(nested(7))).toBe(7);
  });

  it("EVAL.NESTING: isExpr, deps and nestingOf take an expression 200000 levels deep without a deep call stack", () => {
    const e = nested(200_000);
    expect(isExpr(e)).toBe(true);
    expect(nestingOf(e)).toBe(200_000);
    expect(deps(app("add", e, ref("x")))).toEqual([{ at: [], path: ["x"], axes: [], axisAt: [] }]);
    // The expressions of computed moves are a part of the tree too.
    let moves: Expr = ref("x");
    for (let i = 0; i < 200_000; i++) moves = ref("x", [index(moves)]);
    expect(isExpr(moves)).toBe(true);
    expect(nestingOf(moves)).toBe(200_001);
    expect(deps(moves)).toHaveLength(200_001);
  });

  it("EVAL.DEPTH V-050: a full call stack in host code gives #DEPTH!, and ifError, a sum and #ARGS do not hide it", () => {
    // V-050: a stack overflow became #CALC!, so ifError gave its fallback, and a sheet showed a wrong number.
    const s = space.record({ A: {} });
    const opts = { space: s, origin: "A", domains: [Num], extensions: { deep: () => ({ ok: true as const, value: forever(0) }) } };
    const deep = ext("deep", null);
    const r = error(evaluate(deep, opts));
    expect([r.code, r.kind, r.message]).toEqual(["#DEPTH!", "depth", "the evaluation is too deep for the call stack of the engine"]);
    expect(error(evaluate(app("ifError", deep, lit(0)), opts)).code).toBe("#DEPTH!");
    expect(error(evaluate(app("sum", each(axes.all, deep)), opts)).code).toBe("#DEPTH!");
    expect(error(evaluate(app("add", app("add", lit("x"), lit(1)), deep), opts)).code).toBe("#DEPTH!");
    // An error that is not #DEPTH! still goes to the fallback of ifError.
    expect(value(evaluate(app("ifError", ext("missing", null), lit(0)), opts))).toBe(0);
  });

  it("EVAL.DEPTH: serialize and parse give #DEPTH! for data deeper than the call stack, not an exception", () => {
    let data: unknown = 1;
    for (let i = 0; i < 200_000; i++) data = [data];
    expect(error(serialize(lit(data))).code).toBe("#DEPTH!");
    const text = `{"tag":"lit","value":${"[".repeat(200_000)}1${"]".repeat(200_000)}}`;
    const parsed = parse(text);
    expect(parsed.ok ? "a value" : parsed.error.code).toMatch(/#DEPTH!|#VALUE!/);
  });
});

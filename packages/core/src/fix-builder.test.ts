/**
 * The tests of the method `fix` of the builder (BUILD.FIX). `fix.test.ts` has the tests of the semantics of the node.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { vex, type FixValue } from "./builder.ts";
import { defineDomain } from "./domain.ts";
import { evaluate } from "./evaluate.ts";
import { app, axes, each, fix, last, let_, lit, origin, ref, v, type Expr } from "./ir.ts";
import { isVexList } from "./list.ts";
import type { Result } from "./result.ts";
import { space } from "./space.ts";
import { error, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  size: "fixed",
  primitive: "number",
  is: (u: unknown): u is number => typeof u === "number",
  ops: { add: { fn: (a: number, b: number): number => a + b, params: ["number"], returns: "number", monotone: ["up", "up"] } },
});
const Text = defineDomain({
  name: "Text",
  size: "fixed",
  primitive: "string",
  is: (u: unknown): u is string => typeof u === "string",
  ops: { eq: { fn: (a: string, b: string): boolean => a === b, params: ["string"], returns: "boolean" } },
});
const DOMAINS = [Num, Text];

/** The graph has the cycle a b, an exit from b to c, and a loop at d. */
const GRAPH = space.graph(
  { a: { id: "a", flag: true }, b: { id: "b", flag: false }, c: { id: "c", flag: false }, d: { id: "d", flag: false } },
  { a: ["b"], b: ["a", "c"], c: [], d: ["d"] },
);
const G = vex(Num, Text).over(GRAPH);
const TREE = vex(Num, Text).over(space.tree({ top: { flag: true }, kid: { flag: false } }, { kid: "top" }));

const isStart = G.from("id")._.eq(G.start(0).origin().from("id"));
const FAR = 1000;
const wideJoin = (): "max" | "or" => "max";

/** A row is true when a path from the origin reaches it. */
const reach = G.start(0).fix("reach", "or", isStart, (lastRound) => G.start(0).predecessors(() => lastRound).any());
/** The number of edges of a shortest path from the origin, or `FAR`. */
const hops = G.start(0).fix("hops", "min", isStart.if(0, FAR), (lastRound) => G.start(0).predecessors(() => lastRound._.add(1)).min().ifError(FAR));

/** This function gives the value of the column at each row, for the origin `a`. */
function columnOf(program: Expr): readonly unknown[] {
  const list = value(evaluate(each(axes.all, program), { space: GRAPH, origin: "a", domains: DOMAINS }));
  if (!isVexList(list)) throw new TypeError("the result is not a list");
  return list.items.map((item) => value(item.result));
}

describe("the method fix of a chain (BUILD.FIX)", () => {
  it("BUILD.FIX: the method gives the node of the IR, with the number of the open steps after the name", () => {
    expect(G.start(0).fix("x", "or", false, (lastRound) => lastRound).program).toEqual(fix("x$0", "or", lit(false), last("x$0")));
    expect(G.start(0).fix("x", "max", 1, () => 2).program).toEqual(fix("x$0", "max", lit(1), lit(2)));
  });

  it("BUILD.FIX: a column of the builder gives the column of the IR at each row", () => {
    const anyIn = app("any", each(axes.predecessors, last("r")));
    const rawReach = fix("r", "or", app("eq", ref("id"), ref("id", [origin])), anyIn);
    expect(columnOf(reach.program)).toEqual([true, true, true, false]);
    expect(columnOf(reach.program)).toEqual(columnOf(rawReach));
    expect(columnOf(hops.program)).toEqual([0, 1, 2, FAR]);
    expect(value(reach.result("d"))).toBe(true);
  });

  it("BUILD.FIX: the types take the kind of the join, and the chain has that kind", () => {
    expectTypeOf(reach.result("a")).toEqualTypeOf<Result<boolean>>();
    expectTypeOf(hops.result("a")).toEqualTypeOf<Result<number>>();
    expectTypeOf<FixValue<"or" | "and">>().toEqualTypeOf<boolean>();
    expectTypeOf<FixValue<"max" | "min">>().toEqualTypeOf<number>();
    expectTypeOf<FixValue<"or" | "max">>().toBeNever();
    const refused = (): void => {
      // @ts-expect-error -- "unknown" is not a join
      G.start(0).fix("x", "unknown", false, () => false);
      // @ts-expect-error -- a number is not a value of the join "or"
      G.start(0).fix("x", "or", 0, () => false);
      // @ts-expect-error -- a boolean is not a value of the join "max"
      G.start(0).fix("x", "max", 0, () => true);
      // @ts-expect-error -- a union of joins has no one kind
      G.start(0).fix("x", wideJoin(), 0, () => 0);
    };
    expect(refused).toBeTypeOf("function");
  });

  it("BUILD.FIX: the program has no read without a step, because only the step gets the chain of the last round", () => {
    const seen: { read?: { result(k: "a"): Result<boolean> } } = {};
    G.start(0).fix("x", "or", false, (lastRound) => {
      seen.read = lastRound;
      return lastRound;
    });
    const { read } = seen;
    if (read === undefined) throw new TypeError("the step did not run");
    expect(error(read.result("a")).kind).toBe("bad-expression");
    expect(error(read.result("a")).message).toContain('the read "last" of "x$0" has no "fix" of that name around it');
  });

  it("BUILD.FIX: the start and the step read a field at the address of the chain", () => {
    const moved = TREE.start(0).parent().fix("x", "or", "flag", () => "flag");
    expect(moved.program).toEqual(fix("x$0", "or", ref("flag", [{ t: "parent" }]), ref("flag", [{ t: "parent" }])));
  });

  it("BUILD.FIX: a chain of the last round has no address, and its axis has its own name", () => {
    const moved = TREE.start(0).parent().fix("x", "or", false, (lastRound) => lastRound.predecessors((c) => c).any());
    expect(moved.program).toEqual(fix("x$0", "or", lit(false), app("any", let_({ $1: last("x$0") }, each(axes.predecessors, v("$1"))))));
  });

  it("BUILD.FIX: a column inside a step has another name, also when its chain starts at the root", () => {
    const nested = G.start(0).fix("x", "or", false, () => G.start(0).fix("x", "or", false, (inner) => inner)).program;
    expect(nested).toEqual(fix("x$0", "or", lit(false), fix("x$1", "or", lit(false), last("x$1"))));
  });

  it("BUILD.FIX: an inner step that reads the outer column gets the refusal of the check, and it does not read the inner column", () => {
    const crossed = G.start(0).fix("x", "or", false, (outer) => G.start(0).fix("x", "or", false, () => outer));
    expect(error(crossed.result("a")).message).toContain('the step of the "fix" "x$1" reads the last round');
  });

  it("BUILD.FIX: the number of the open steps goes back after a step, also when a step throws", () => {
    const after = G.start(0).fix("y", "or", G.start(0).fix("z", "or", false, () => false), () => false);
    expect(after.program).toMatchObject({ name: "y$0", init: { name: "z$0" } });
    expect(() =>
      G.start(0).fix("x", "or", false, () => {
        throw new RangeError("the step stops");
      }),
    ).toThrow("the step stops");
    expect(G.start(0).fix("x", "or", false, () => false).program).toMatchObject({ name: "x$0" });
  });
});

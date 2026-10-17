/**
 * Functions (FN.*): a binding of `let` can be a function, and `call` applies it. The body evaluates at the position of
 * the call, with the names of the place of the binding. A function cannot call itself, so each call ends.
 */
import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { defineDomain } from "./domain.ts";
import { evaluate, explain } from "./evaluate.ts";
import { app, axes, call, each, fn, fold, isExpr, iterate, let_, lit, ref, shapeError, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { space } from "./space.ts";
import { error, value } from "./test-support.ts";

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    add: { fn: (a: number, b: number): number => a + b, params: ["number"] },
    multiply: { fn: (a: number, b: number): number => a * b, params: ["number"] },
  },
});

const rows = space.array([
  { n: 1, w: 10 },
  { n: 2, w: 20 },
  { n: 3, w: 30 },
]);
const run = (e: Expr, origin = "0", vars: Readonly<Record<string, unknown>> = {}): ReturnType<typeof evaluate> => evaluate(e, { space: rows, origin, domains: [Num], vars });
const twice = fn(["x"], app("multiply", v("x"), lit(2)));
/** The read of the field w at the focus, inside some axes. */
const read = (inside: readonly string[]): object => ({ at: [], path: ["w"], axes: inside, axisAt: inside.map(() => []) });

describe("functions", () => {
  it("FN.BIND FN.CALL: a binding of let is a function, and a call gives its body with the values of the arguments", () => {
    expect(value(run(let_({ twice }, call("twice", ref("n"))), "2"))).toBe(6);
    // Two parameters, and a function in the body of another let.
    const add = fn(["a", "b"], app("add", v("a"), v("b")));
    expect(value(run(let_({ add }, let_({ k: lit(5) }, call("add", v("k"), call("add", ref("n"), lit(1))))), "0"))).toBe(7);
  });

  it("FN.CALL: the body evaluates at the position of the call, also inside an axis, with the names of the place of its binding", () => {
    // The body reads the field w at the target of the axis.
    const weight = fn(["k"], app("multiply", ref("w"), v("k")));
    expect(value(run(let_({ weight }, app("sum", each(axes.all, call("weight", lit(2))))), "0"))).toBe(120);
    // The body sees y of the place of its binding (1), not y of the place of the call (100).
    const plusY = fn(["x"], app("add", v("x"), v("y")));
    expect(value(run(let_({ y: lit(1) }, let_({ plusY }, let_({ y: lit(100) }, call("plusY", lit(5))))), "0"))).toBe(6);
    // A parameter hides a name of the place of the binding.
    const own = fn(["y"], v("y"));
    expect(value(run(let_({ y: lit(1) }, let_({ own }, call("own", lit(9)))), "0"))).toBe(9);
  });

  it("FN.TOTAL: a function cannot call itself or another binding of its let, so each call ends", () => {
    const loop = let_({ f: fn(["x"], call("f", v("x"))) }, call("f", lit(1)));
    expect(error(run(loop))).toMatchObject({ code: "#NAME?", kind: "unbound", message: 'the function "f" has no binding' });
    const pair = let_({ f: fn(["x"], v("x")), g: fn(["x"], call("f", v("x"))) }, call("g", lit(1)));
    expect(error(run(pair)).code).toBe("#NAME?");
    // A function of an outer let is in the scope of an inner function.
    expect(value(run(let_({ f: twice }, let_({ g: fn(["x"], call("f", call("f", v("x")))) }, call("g", lit(3))))))).toBe(12);
  });

  it("FN.ARGS FN.VALUE: the number of arguments, a call of a value, a function as a value, and an argument that fails", () => {
    expect(error(run(let_({ twice }, call("twice", lit(1), lit(2)))))).toMatchObject({ code: "#VALUE!", kind: "bad-expression", message: 'the function "twice" takes 1 arguments, not 2' });
    expect(error(run(let_({ k: lit(1) }, call("k", lit(1)))))).toMatchObject({ code: "#VALUE!", kind: "kind-mismatch", message: 'the name "k" is a value, not a function' });
    expect(error(run(let_({ twice }, v("twice"))))).toMatchObject({ code: "#VALUE!", kind: "kind-mismatch", message: 'the name "twice" is a function, not a value' });
    expect(error(run(call("nope", lit(1))))).toMatchObject({ code: "#NAME?", kind: "unbound", message: 'the function "nope" has no binding' });
    // A binding that fails gives its error to a call of its name.
    expect(error(run(let_({ bad: ref("missing") }, call("bad")))).code).toBe("#N/A");
    // An argument that fails has an effect only where the body reads it.
    const first = fn(["a", "b"], v("a"));
    expect(value(run(let_({ first }, call("first", lit(4), ref("missing")))))).toBe(4);
    expect(error(run(let_({ first }, call("first", ref("missing"), lit(4))))).code).toBe("#N/A");
  });

  it("FN.BIND: a function is only a binding of let, with distinct names of parameters, and JSON keeps it", () => {
    const e = let_({ twice }, call("twice", lit(1)));
    expect(isExpr(e)).toBe(true);
    expect(value(parse(value(serialize(e)), []))).toEqual(e);
    expect(shapeError(app("add", lit(1), twice))).toBe("the expression has a function outside the bindings of a let, or a function with parameters that are not distinct names");
    expect(shapeError(let_({ f: fn(["x", "x"], v("x")) }, lit(1)))).toBe("the expression has a function outside the bindings of a let, or a function with parameters that are not distinct names");
    expect(isExpr({ tag: "call", fn: 1, args: [] })).toBe(false);
    expect(isExpr({ tag: "call", fn: "f", args: {} })).toBe(false);
  });

  it("DEPS.READS: the reads of a call are the reads of the body at the call, inside the axes of the call", () => {
    const weight = fn(["k"], app("multiply", ref("w"), v("k")));
    // The body is not a read where it is bound, and a function without a call reads nothing.
    expect(deps(let_({ weight }, lit(1)))).toEqual([]);
    expect(deps(let_({ weight }, app("sum", each(axes.all, call("weight", ref("n"))))))).toEqual([
      { at: [], path: ["n"], axes: ["all"], axisAt: [[]] },
      { at: [], path: ["w"], axes: ["all"], axisAt: [[]] },
    ]);
    // A parameter or a binding with the name of a function hides it.
    expect(deps(let_({ weight }, let_({ weight: lit(1) }, call("weight", lit(1)))))).toEqual([]);
    expect(deps(call("weight", ref("n")))).toEqual([{ at: [], path: ["n"], axes: [], axisAt: [] }]);
  });

  it("FN.CALL DEPS.READS: a name of a loop hides a function with its name in the steps, the test of until and the result", () => {
    expect(value(run(let_({ twice }, iterate(2, { twice: lit(1) }, { twice: app("add", v("twice"), lit(1)) }, v("twice")))))).toBe(3);
    expect(error(run(let_({ twice }, fold(axes.all, { twice: lit(0) }, { twice: call("twice", v("twice")) }, v("twice")))))).toMatchObject({ kind: "kind-mismatch", message: 'the name "twice" is a value, not a function' });
    // The value of init sees the function. Then the name of the loop hides it.
    expect(value(run(let_({ twice }, iterate(1, { twice: call("twice", lit(4)) }, { twice: app("add", v("twice"), lit(1)) }, v("twice")))))).toBe(9);
    const weight = fn(["k"], app("multiply", ref("w"), v("k")));
    // The step, the result and the test of until do not read the body of the function.
    expect(deps(let_({ weight }, fold(axes.all, { weight: lit(0) }, { weight: call("weight", lit(1)) }, call("weight", lit(1)))))).toEqual([]);
    expect(deps(let_({ weight }, iterate(1, { weight: lit(0) }, { weight: call("weight", lit(1)) }, call("weight", lit(1)), call("weight", lit(1)))))).toEqual([]);
    // The value of init and a test of where see the function.
    expect(deps(let_({ weight }, iterate(1, { k: call("weight", lit(1)) }, { k: v("k") }, v("k"))))).toEqual([read([])]);
    expect(deps(let_({ weight }, fold(axes.where(axes.all, app("gt", call("weight", lit(1)), lit(0))), { weight: lit(0) }, { weight: lit(1) }, v("weight"))))).toEqual([read(["where"])]);
  });

  it("TRACE.EVENTS: the trace has an event for the call, with its label", () => {
    const trace = explain(let_({ twice }, call("twice", ref("n"))), { space: rows, origin: "1", domains: [Num] });
    expect(trace.events.some((x) => x.label === "call twice" && x.result.ok && x.result.value === 4)).toBe(true);
  });
});

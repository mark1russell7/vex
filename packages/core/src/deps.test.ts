/**
 * The static reads of `deps` (DEPS.READS): the axes around a read in the documents of the axes and the loops, the reads
 * of a function at each of its calls, and the order of the reads.
 */
import { describe, expect, it } from "vitest";
import { deps, type Dependency } from "./deps.ts";
import { app, axes, call, each, fn, fold, let_, lit, rec, ref } from "./ir.ts";

/** The read of a field at the focus, inside the axes `around`, each with the empty address. */
const read = (field: string, around: readonly Dependency["axes"][number][] = []): Dependency => ({ at: [], path: [field], axes: around, axisAt: around.map(() => []) });

describe("the axes around a read (DEPS.READS)", () => {
  it("DEPS.READS AXIS.LIST: the list of an axis list is outside the axis, and a loop in it has its own axis", () => {
    expect(deps(each(axes.list(each(axes.all, ref("x"))), ref("y")))).toEqual([read("y", ["list"]), read("x", ["all"])]);
  });

  it("DEPS.READS AXIS.WHERE: a test of where reads inside the axis, also the test of an inner where", () => {
    expect(deps(each(axes.where(axes.where(axes.all, ref("a")), ref("b")), lit(1)))).toEqual([read("a", ["where"]), read("b", ["where"])]);
  });

  it("DEPS.READS FOLD.ORDER: the init and the result of a fold are outside its axis, and a loop there has its own axis", () => {
    expect(deps(fold(axes.all, { s: each(axes.siblings, ref("i")) }, { s: lit(1) }, each(axes.children, ref("x"))))).toEqual([read("i", ["siblings"]), read("x", ["children"])]);
  });
});

describe("the reads of the functions (DEPS.READS, FN.CALL)", () => {
  it("DEPS.READS FN.CALL: a function bound inside a loop reads inside the axes of its call, and not again inside the axes of its binding", () => {
    expect(deps(each(axes.all, let_({ f: fn([], ref("w")) }, call("f"))))).toEqual([read("w", ["all"])]);
    expect(deps(each(axes.all, let_({ f: fn([], each(axes.children, ref("w"))) }, call("f"))))).toEqual([read("w", ["all", "children"])]);
  });

  it("FN.CALL DEPS.READS: a parameter with the name of a function hides the function", () => {
    expect(deps(let_({ f: fn([], ref("w")) }, let_({ g: fn(["f"], call("f")) }, call("g", lit(1)))))).toEqual([]);
    expect(deps(let_({ f: fn([], ref("w")) }, let_({ g: fn(["k"], call("f")) }, call("g", lit(1)))))).toEqual([read("w")]);
  });

  it("FN.CALL DEPS.READS: the reads of a call come after the reads of its arguments, and before the reads after the call", () => {
    const f = fn(["k"], ref("w"));
    expect(deps(let_({ f }, app("add", call("f", lit(1)), call("f", ref("x")))))).toEqual([read("w"), read("x"), read("w")]);
    expect(deps(let_({ f }, app("add", call("f", ref("x")), ref("y"))))).toEqual([read("x"), read("w"), read("y")]);
  });

  it("DEPS.READS REC.FIELDS: a field with the name fn of a record is a read, not a call", () => {
    expect(deps(let_({ x: fn([], ref("w")) }, rec({ fn: ref("x") })))).toEqual([read("x")]);
  });

  it("DEPS.READS FN.CALL: a function whose only reads are in an inner function reads nothing at its call", () => {
    expect(deps(let_({ f: fn([], let_({ g: fn([], ref("w")) }, lit(1))) }, call("f")))).toEqual([]);
    expect(deps(let_({ f: fn([], let_({ g: fn([], ref("w")) }, call("g"))) }, call("f")))).toEqual([read("w")]);
  });
});

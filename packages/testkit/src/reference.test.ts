/**
 * The reference interpreter against the core interpreter, one program for each rule of the semantics. The
 * property tests use random programs. These programs reach the rare paths: each kind of error, each special form,
 * each list op and each step of an op call.
 */
import {
  app,
  axes,
  defineDomain,
  each,
  evaluate,
  ext,
  index,
  key,
  let_,
  lit,
  offset,
  other,
  parent,
  rec,
  ref,
  space,
  v,
  type AnyDomain,
  type Expr,
  type Space,
} from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { fromCore, fromReference } from "./compare.ts";
import { referenceEvaluate } from "./reference.ts";

class Thing {
  readonly n: number;
  constructor(n: number) {
    this.n = n;
  }
  twice(): Thing {
    return new Thing(this.n * 2);
  }
  nothing(): undefined {
    return undefined;
  }
  explode(): never {
    throw new Error("explode");
  }
  nul(): null {
    return null;
  }
}

const AllMethods = defineDomain({ name: "Thing", is: (u: unknown): u is Thing => u instanceof Thing, ops: {}, methods: "all" });
const Lifty = defineDomain({
  name: "Lifty",
  is: (u: unknown): u is Vec2 => u instanceof Vec2,
  fromScalar: (): Vec2 => {
    throw new Error("no lift");
  },
  ops: { add: { liftScalar: [true] } },
});
const Fussy = defineDomain({
  name: "Fussy",
  is: (u: unknown): u is Vec2 => u instanceof Vec2,
  valid: (): boolean => {
    throw new Error("no check");
  },
  ops: { add: {} },
});
// Methods-all domains of primitives and of functions: a primitive has no methods, and a function stops at
// Function.prototype, so the inherited members are not ops.
const AllNumbers = defineDomain({ name: "AllNumbers", is: (u: unknown): u is number => typeof u === "number", ops: {}, methods: "all" });
const AllFns = defineDomain({ name: "AllFns", is: (u: unknown): u is () => number => typeof u === "function", ops: {}, methods: "all" });
// Two domains with the op "join": the first has no identity, the second has one. A reduce of nothing takes the second.
const JoinNoId = defineDomain({ name: "JoinNoId", is: (u: unknown): u is string => typeof u === "string", ops: { join: { fn: (a: string, b: string): string => a + b } } });
const JoinId = defineDomain({ name: "JoinId", is: (u: unknown): u is number => typeof u === "number", ops: { join: { fn: (a: number, b: number): number => a + b, identity: (): number => 0 } } });
// A domain with a fn op, for values that it does not accept: the op does not apply.
const Strings = defineDomain({ name: "Strings", is: (u: unknown): u is string => typeof u === "string", ops: { double: { fn: (a: string): string => a + a } } });
// Lifting: a list of flags lifts only the marked arguments, false lifts none, and a domain without fromScalar lifts none.
const lift = (liftScalar: boolean | readonly boolean[], from: boolean): AnyDomain =>
  defineDomain({
    name: "Lift",
    is: (u: unknown): u is Vec2 => u instanceof Vec2,
    ...(from ? { fromScalar: (n: number): Vec2 => Vec2.scalar(n) } : {}),
    ops: { mix: { fn: (a: Vec2, b: unknown, c: unknown): unknown => (b instanceof Vec2 ? a.add(b) : c instanceof Vec2 ? c : 0), liftScalar, params: ["any", "any"] } },
  });
const Nan = defineDomain({ name: "Nan", is: (u: unknown): u is number => typeof u === "number", ops: { nan: { fn: (): number => Number.NaN } } });
const Throws = defineDomain({
  name: "Throws",
  is: (_u: unknown): _u is Vec2 => {
    throw new Error("is");
  },
  ops: {},
});

const throwing = {
  get boom(): number {
    throw new Error("getter");
  },
};

const s = space.record({
  A: { p: new Vec2(1, 2), q: new Vec2(3, 4), n: 2, b: true, name: "a", deep: { x: 1 }, bad: throwing, t: new Thing(3), f: (): number => 1, z: null },
  B: { p: new Vec2(5, 6), q: new Vec2(0, 0), n: 3, b: false, name: "b", deep: { x: null }, t: new Thing(4) },
  C: { p: new Vec2(7, 8), n: 5, b: true, name: "c", deep: 7 },
  N: null,
});
const row = space.array([{ v: 1 }, { v: 2 }]);
const tree = space.tree({ top: { n: 1 }, leaf: { n: 2 } }, { leaf: "top" });

const D: readonly AnyDomain[] = [Vec2Domain, NumDomain, BoolDomain];
const ps = each(axes.all, ref("p"));
const ns = each(axes.all, ref("n"));
const bs = each(axes.all, ref("b"));
const nothing = each(axes.where(axes.all, lit(false)), ref("n"));

interface Case {
  readonly name: string;
  readonly expr: Expr;
  readonly space?: Space;
  readonly origin?: string;
  readonly domains?: readonly AnyDomain[];
}

const CASES: readonly Case[] = [
  // References and addresses
  { name: "an origin that is not a key", expr: ref("p"), origin: "Z" },
  { name: "a field", expr: ref("p") },
  { name: "the whole record", expr: ref([]) },
  { name: "a null record", expr: ref("p"), origin: "N" },
  { name: "a missing field", expr: ref("mass") },
  { name: "a null field in a path", expr: ref("deep.x"), origin: "B" },
  { name: "a path through a number", expr: ref("deep.x"), origin: "C" },
  { name: "a prototype name in a path", expr: ref("deep.__proto__") },
  { name: "a getter that throws", expr: ref("bad.boom") },
  { name: "an empty segment in a path", expr: ref(["deep", ""]) },
  { name: "the constructor of a value in a path", expr: ref("t.constructor") },
  { name: "the prototype of a function in a path", expr: ref("f.prototype") },
  { name: "a null field", expr: ref("z") },
  { name: "a path through a number at the end", expr: ref("n.x") },
  { name: "a key move", expr: ref("p", [key("B")]) },
  { name: "an unknown key", expr: ref("p", [key("Z")]) },
  { name: "other outside a pair", expr: ref("p", [other]) },
  { name: "an index", expr: ref("p", [index(2)]) },
  { name: "an index outside the keys", expr: ref("p", [index(9)]) },
  { name: "an offset in a record space", expr: ref("p", [offset(1)]) },
  { name: "an offset in an array", expr: ref("v", [offset(1)]), space: row, origin: "0" },
  { name: "an offset outside an array", expr: ref("v", [offset(-1)]), space: row, origin: "0" },
  { name: "parent in a tree", expr: ref("n", [parent]), space: tree, origin: "leaf" },
  { name: "the parent of a root", expr: ref("n", [parent]), space: tree, origin: "top" },
  { name: "parent outside a tree", expr: ref("p", [parent]) },
  // Bindings, records and extensions
  { name: "an unbound name", expr: v("nope") },
  { name: "a let binding", expr: let_({ x: ref("n") }, app("add", v("x"), lit(1))) },
  { name: "a failed binding that no var reads", expr: let_({ x: ref("mass") }, lit(1)) },
  { name: "a record", expr: rec({ a: ref("n"), b: ref("name") }) },
  { name: "a record with one failed field", expr: rec({ a: ref("mass"), b: ref("n") }) },
  { name: "a record with two failed fields", expr: rec({ a: ref("mass"), b: ref("speed") }) },
  { name: "an extension without a handler", expr: ext("sheet", null) },
  // Special forms
  { name: "if true", expr: app("if", lit(true), lit(1), ref("mass")) },
  { name: "if false", expr: app("if", lit(false), ref("mass"), lit(2)) },
  { name: "if without a branch", expr: app("if", lit(true)) },
  { name: "if with a number", expr: app("if", ref("n"), lit(1), lit(2)) },
  { name: "if with a failed condition", expr: app("if", ref("mass"), lit(1), lit(2)) },
  { name: "and without arguments", expr: app("and") },
  { name: "and that stops", expr: app("and", lit(false), ref("mass")) },
  { name: "and of true values", expr: app("and", lit(true), lit(true)) },
  { name: "and with a false second value", expr: app("and", lit(true), lit(false), ref("mass")) },
  { name: "or with a true second value", expr: app("or", lit(false), lit(true), ref("mass")) },
  { name: "or that stops", expr: app("or", lit(true), ref("mass")) },
  { name: "or of false values", expr: app("or", lit(false), lit(false)) },
  { name: "or with a number", expr: app("or", lit(false), ref("n")) },
  { name: "or with a failed argument", expr: app("or", ref("mass")) },
  { name: "ifError with a value", expr: app("ifError", ref("n"), lit(0)) },
  { name: "ifError with an error", expr: app("ifError", ref("mass"), lit(0)) },
  { name: "ifError without a fallback", expr: app("ifError", ref("mass")) },
  // Axes
  { name: "each all", expr: ps },
  { name: "each others", expr: each(axes.others, ref("n")) },
  { name: "each other outside a pair", expr: each(axes.other, ref("n")) },
  { name: "neighbors outside a grid", expr: each(axes.neighbors(4), ref("n")) },
  { name: "children in a tree", expr: each(axes.children, ref("n")), space: tree, origin: "top" },
  { name: "children outside a tree", expr: each(axes.children, ref("n")) },
  { name: "where with a number test", expr: each(axes.where(axes.all, ref("n")), ref("n")) },
  { name: "where with a failed test", expr: each(axes.where(axes.all, ref("mass")), ref("n")) },
  { name: "where in where", expr: each(axes.where(axes.where(axes.all, ref("mass")), lit(true)), ref("n")) },
  { name: "where that keeps some targets", expr: each(axes.where(axes.all, ref("b")), ref("n")) },
  // List ops
  { name: "count", expr: app("count", ns) },
  { name: "values", expr: app("values", ns) },
  { name: "keys", expr: app("keys", ns) },
  { name: "errors", expr: app("errors", ns) },
  { name: "first", expr: app("first", ns) },
  { name: "first of nothing", expr: app("first", nothing) },
  { name: "sum", expr: app("sum", ns) },
  { name: "sum of vectors", expr: app("sum", ps) },
  { name: "mean", expr: app("mean", ns) },
  { name: "mean of nothing", expr: app("mean", nothing) },
  { name: "mean of vectors", expr: app("mean", ps) },
  { name: "min", expr: app("min", ns) },
  { name: "max", expr: app("max", ns) },
  { name: "min of nothing", expr: app("min", nothing) },
  { name: "max of vectors", expr: app("max", ps) },
  { name: "any", expr: app("any", bs) },
  { name: "all", expr: app("all", bs) },
  { name: "none", expr: app("none", bs) },
  { name: "any of numbers", expr: app("any", ns) },
  { name: "a strict sum with an error item", expr: app("sum", ns, lit({ strict: true })) },
  { name: "a sum with strict false and an error item", expr: app("sum", ns, lit({ strict: false })) },
  { name: "a sum with a null option and an error item", expr: app("sum", ns, lit(null)) },
  { name: "a sum with a text option and an error item", expr: app("sum", ns, lit("strict")) },
  { name: "reduce with strict in the second option", expr: app("reduce", ns, lit("add"), lit({ strict: true })) },
  { name: "a strict sum without an error item", expr: app("sum", each(axes.where(axes.all, ref("b")), ref("n")), lit({ strict: true })) },
  { name: "reduce with add", expr: app("reduce", ps, lit("add")) },
  { name: "reduce with a number as the op", expr: app("reduce", ps, lit(1)) },
  { name: "reduce of nothing with an identity", expr: app("reduce", each(axes.where(axes.all, lit(false)), ref("p")), lit("add")) },
  { name: "reduce of nothing without an identity", expr: app("reduce", nothing, lit("subtract")) },
  { name: "reduce with an op that the values do not have", expr: app("reduce", each(axes.where(axes.all, lit(true)), ref("name")), lit("add")) },
  { name: "reduce with a strict option", expr: app("reduce", ps, lit("add"), lit({ strict: true })) },
  { name: "a list op that is not a list op", expr: app("shuffle", ns) },
  { name: "reduce of nothing takes the identity of the domain that has one", expr: app("reduce", nothing, lit("join")), domains: [JoinNoId, JoinId] },
  { name: "reduce of nothing with an op that only a later domain has", expr: app("reduce", nothing, lit("join")), domains: [NumDomain, JoinId] },
  { name: "reduce with an op of another domain than the value", expr: app("reduce", ns, lit("double")), domains: [Strings, NumDomain] },
  // Op calls
  { name: "an op of a domain", expr: app("add", ref("p"), ref("q")) },
  { name: "a lifted number", expr: app("add", ref("p"), lit(1)) },
  { name: "an op that the domain does not have", expr: app("fly", ref("p")) },
  { name: "a function without arguments", expr: app("nothing") },
  { name: "a receiver that no domain accepts", expr: app("shout", ref("name")) },
  { name: "a domain argument of another kind", expr: app("add", ref("p"), ref("name")) },
  { name: "a number argument of another kind", expr: app("scale", ref("p"), ref("name")) },
  { name: "a number argument", expr: app("scale", ref("p"), lit(2)) },
  { name: "more arguments than parameters", expr: app("scale", ref("p"), lit(2), lit("extra")) },
  { name: "a division by zero", expr: app("divide", ref("n"), lit(0)) },
  { name: "an invalid domain value", expr: app("divide", ref("p"), lit(0)) },
  { name: "a method of a methods-all domain", expr: app("twice", ref("t")), domains: [AllMethods] },
  { name: "a method that gives no value", expr: app("nothing", ref("t")), domains: [AllMethods] },
  { name: "an inherited name of a methods-all domain", expr: app("toString", ref("t")), domains: [AllMethods] },
  { name: "a lift that throws", expr: app("add", ref("p"), lit(1)), domains: [Lifty] },
  { name: "a valid check that throws", expr: app("add", ref("p"), ref("q")), domains: [Fussy] },
  { name: "an op that gives NaN", expr: app("nan", ref("n")), domains: [Nan] },
  { name: "a domain whose is test throws", expr: app("add", ref("p"), ref("q")), domains: [Throws, Vec2Domain] },
  { name: "an argument that no domain accepts", expr: app("add", lit(new Vec2(1, 1)), lit(throwing)) },
  { name: "a method that throws", expr: app("explode", ref("t")), domains: [AllMethods] },
  { name: "a method that gives null", expr: app("nul", ref("t")), domains: [AllMethods] },
  { name: "the name constructor in a methods-all domain", expr: app("constructor", ref("t")), domains: [AllMethods] },
  { name: "the name prototype in a methods-all domain", expr: app("prototype", ref("t")), domains: [AllMethods] },
  { name: "the name __proto__ in a methods-all domain", expr: app("__proto__", ref("t")), domains: [AllMethods] },
  { name: "a member of Object.prototype in a methods-all domain", expr: app("hasOwnProperty", ref("t"), lit("n")), domains: [AllMethods] },
  { name: "a data field as a method name", expr: app("n", ref("t")), domains: [AllMethods] },
  { name: "a method of a primitive in a methods-all domain", expr: app("toFixed", ref("n")), domains: [AllNumbers] },
  { name: "a member of Function.prototype in a methods-all domain", expr: app("call", ref("f")), domains: [AllFns] },
  { name: "a fn op of a domain that does not accept the value", expr: app("double", ref("n")), domains: [Strings] },
  { name: "a constructor name as an op of a domain", expr: app("constructor", ref("name")), domains: [Strings] },
  { name: "a lift of the marked argument only", expr: app("mix", ref("p"), lit(1), lit(2)), domains: [lift([true, false], true)] },
  { name: "a lift of no argument with false", expr: app("mix", ref("p"), lit(1), lit(2)), domains: [lift(false, true)] },
  { name: "a lift without fromScalar", expr: app("mix", ref("p"), lit(1), lit(2)), domains: [lift(true, false)] },
  { name: "a lift of each argument with true", expr: app("mix", ref("p"), lit(1), lit(2)), domains: [lift(true, true)] },
  { name: "a lift with a list that marks the second argument", expr: app("mix", ref("p"), lit(1), lit(2)), domains: [lift([false, true], true)] },
  { name: "reduce with a method of a methods-all domain", expr: app("reduce", each(axes.all, ref("t")), lit("twice")), domains: [AllMethods] },
  { name: "reduce with a name that is not a method", expr: app("reduce", each(axes.all, ref("t")), lit("nope")), domains: [AllMethods] },
  { name: "reduce with a method that throws", expr: app("reduce", each(axes.all, ref("t")), lit("explode")), domains: [AllMethods] },
  {
    name: "a host space that throws",
    expr: ref("p"),
    space: {
      kind: "record",
      keys: ["A"],
      has: (k: string): k is string => k === "A",
      get: () => {
        throw new Error("disk");
      },
      coords: () => undefined,
      keyAt: () => undefined,
    },
  },
];

describe("the reference interpreter against the core (EVAL.REFERENCE)", () => {
  it.each(CASES)("EVAL.REFERENCE: $name", (c) => {
    const opts = { space: c.space ?? s, origin: c.origin ?? "A", domains: c.domains ?? D };
    expect(fromReference(referenceEvaluate(c.expr, opts))).toEqual(fromCore(evaluate(c.expr, opts)));
  });

  it("EVAL.REFERENCE: without domains, an op call gives the error of a receiver that no domain accepts", () => {
    expect(referenceEvaluate(app("add", lit(1), lit(2)), { space: s, origin: "A" })).toEqual({ ok: false, code: "#VALUE!" });
  });

  it("the comparison reads accessors as a mark, an error as its code, and arrays item by item", () => {
    expect(fromReference({ ok: true, value: [throwing, { code: "#N/A", kind: "missing-field", message: "x" }] })).toEqual({
      ok: true,
      value: [{ boom: "<accessor>" }, { code: "#N/A" }],
    });
    expect(fromReference({ ok: true, value: new Vec2(1, 2) })).toEqual({ ok: true, value: new Vec2(1, 2) });
    expect(fromReference({ ok: false, code: "#REF!" })).toEqual({ ok: false, code: "#REF!" });
  });
});

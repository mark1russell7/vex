import { describe, expect, it } from "vitest";
import { deps } from "./deps.ts";
import { compile, evaluate, explain, type EvalOptions } from "./evaluate.ts";
import { app, axes, each, ext, key, let_, lit, origin as toOrigin, other, parent, ref, rec, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { isVexList } from "./list.ts";
import { fail, ok } from "./result.ts";
import { axisTargets, space, type Space } from "./space.ts";
import { defineDomain } from "./domain.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";
import { vexError } from "./errors.ts";

const A = { position: new Pt(0, 0), size: new Pt(2, 2), name: "a", weight: 2 };
const B = { position: new Pt(3, 4), size: new Pt(1, 1), name: "b", weight: 3 };
const C = { position: new Pt(6, 8), size: new Pt(1, 1), name: "c", weight: 5 };
const D = { position: new Pt(0, 1), size: new Pt(1, 1), name: "d", weight: 7 };

const at = (s: EvalOptions["space"], origin: string, extra: Partial<EvalOptions> = {}): EvalOptions => ({
  space: s,
  origin,
  domains: [PtDomain],
  ...extra,
});

describe("references (REF.*)", () => {
  const s = space.record({ A, B, nested: { p: { x: 1, y: null } } });

  it("REF.FOCUS: a reference reads the field at the focus", () => {
    expect(value(evaluate(ref("position"), at(s, "A")))).toEqual(new Pt(0, 0));
    expect(value(evaluate(ref("position"), at(s, "B")))).toEqual(new Pt(3, 4));
  });

  it("REF.PATH: a dotted path reads a nested field", () => {
    expect(value(evaluate(ref("p.x"), at(s, "nested")))).toBe(1);
    expect(value(evaluate(ref([]), at(s, "nested")))).toEqual({ p: { x: 1, y: null } });
  });

  it("REF.MISSING: a missing or null field gives #N/A", () => {
    expect(error(evaluate(ref("p.z"), at(s, "nested"))).code).toBe("#N/A");
    expect(error(evaluate(ref("p.y"), at(s, "nested"))).code).toBe("#N/A");
    expect(error(evaluate(ref("p.x.deeper"), at(s, "nested"))).code).toBe("#N/A");
  });

  it("REF.FORBIDDEN: prototype names are not fields", () => {
    expect(error(evaluate(ref("__proto__"), at(s, "A"))).code).toBe("#N/A");
    expect(error(evaluate(ref("position.constructor"), at(s, "A"))).code).toBe("#N/A");
  });

  it("REF.ADDRESS: an address moves the read, and a bad address gives #REF!", () => {
    expect(value(evaluate(ref("position", [key("B")]), at(s, "A")))).toEqual(new Pt(3, 4));
    expect(error(evaluate(ref("position", [key("Z")]), at(s, "A"))).code).toBe("#REF!");
  });

  it("EVAL.ORIGIN: an unknown origin gives #REF!", () => {
    expect(error(evaluate(lit(1), at(s, "Z"))).kind).toBe("unknown-key");
  });
});

describe("ops (CALL.*)", () => {
  const pair = space.record({ A, B });

  it("CALL.METHOD: an op calls the method of the receiver", () => {
    expect(value(evaluate(app("add", ref("position"), ref("size")), at(pair, "A")))).toEqual(new Pt(2, 2));
  });

  it("CALL.FN: an op with fn calls the function", () => {
    expect(value(evaluate(app("dot", ref("size"), ref("size")), at(pair, "A")))).toBe(8);
  });

  it("CALL.UNKNOWN-OP: an undeclared op gives #NAME?, also for inherited members (V-008)", () => {
    expect(error(evaluate(app("nope", ref("position")), at(pair, "A"))).code).toBe("#NAME?");
    expect(error(evaluate(app("toString", ref("position")), at(pair, "A"))).code).toBe("#NAME?");
    expect(error(evaluate(app("constructor", ref("position")), at(pair, "A"))).code).toBe("#NAME?");
  });

  it("CALL.RECEIVER: a receiver that no domain accepts gives #VALUE!", () => {
    expect(error(evaluate(app("add", ref("name"), lit(1)), at(pair, "A"))).code).toBe("#VALUE!");
  });

  it("CALL.PARAMS: a declared domain parameter checks its argument (V-007)", () => {
    const e = error(evaluate(app("add", ref("position"), lit(true)), at(pair, "A")));
    expect(e.code).toBe("#VALUE!");
    expect(e.kind).toBe("not-instance");
    expect(error(evaluate(app("scale", ref("position"), lit("x")), at(pair, "A"))).kind).toBe("kind-mismatch");
  });

  it("CALL.LIFT: a number argument lifts with fromScalar when the op declares liftScalar", () => {
    expect(value(evaluate(app("add", ref("position"), lit(5)), at(pair, "A")))).toEqual(new Pt(5, 5));
  });

  it("CALL.THROW: an op that throws gives #CALC! with the thrown value", () => {
    const e = error(evaluate(app("boom", ref("position")), at(pair, "A")));
    expect(e.code).toBe("#CALC!");
    expect(e.thrown).toBeInstanceOf(Error);
  });

  it("CALL.RESULT: a non-finite number or an invalid domain value gives #NUM! (V-022)", () => {
    const zero = space.record({ A: { p: new Pt(0, 0) } });
    expect(error(evaluate(app("scale", ref("p"), lit(Number.NaN)), at(zero, "A"))).code).toBe("#NUM!");
    expect(error(evaluate(app("scale", ref("p"), lit(Number.POSITIVE_INFINITY)), at(zero, "A"))).code).toBe("#NUM!");
  });

  it("CALL.ARGS: one failed argument stays as it is, two or more give #ARGS with each cause", () => {
    const one = error(evaluate(app("add", ref("position"), ref("missing")), at(pair, "A")));
    expect(one.code).toBe("#N/A");
    expect(one.path).toEqual([1]);
    const two = error(evaluate(app("add", ref("nope1"), ref("nope2")), at(pair, "A")));
    expect(two.code).toBe("#ARGS");
    expect(two.causes?.map((c) => c.path)).toEqual([[0], [1]]);
  });

  it("CALL.STRING-ARGS: a string literal is a value, not a reference (V-038)", () => {
    expect(value(evaluate(app("pick", ref("position"), lit(["x", "q"])), at(pair, "A")))).toEqual(["x"]);
  });

  it("CALL.FREE: a free function applies when no domain accepts the receiver", () => {
    const opts = at(pair, "A", { fns: { concat: (...xs: readonly unknown[]) => xs.join("") } });
    expect(value(evaluate(app("concat", ref("name"), lit("!")), opts))).toBe("a!");
  });

  it("EXAMPLE.SEPARATION: the separation test of a pair", () => {
    const sep = app("anyNonPositive", app("subtract", app("add", ref("position"), ref("size")), ref("position", [other])));
    expect(value(evaluate(sep, at(pair, "A")))).toBe(true);
    expect(value(evaluate(sep, at(pair, "B")))).toBe(false);
  });
});

describe("bindings (LET.*)", () => {
  const pair = space.record({ A, B });

  it("LET.BIND: let binds names for the body (V-006)", () => {
    const e = let_({ base: ref("position"), k: lit(2) }, app("scale", app("add", v("base"), ref("size")), v("k")));
    expect(value(evaluate(e, at(pair, "A")))).toEqual(new Pt(4, 4));
  });

  it("LET.LAZY-ERROR: a failed binding has an effect only where a var reads it", () => {
    expect(value(evaluate(let_({ bad: ref("missing") }, ref("position")), at(pair, "A")))).toEqual(new Pt(0, 0));
    const e = error(evaluate(let_({ bad: ref("missing") }, v("bad")), at(pair, "A")));
    expect(e.code).toBe("#N/A");
    expect(e.path).toEqual([0]);
  });

  it("LET.UNBOUND: an unbound name gives #NAME?", () => {
    expect(error(evaluate(v("nope"), at(pair, "A"))).kind).toBe("unbound");
  });

  it("LET.VARS: the caller can give variables", () => {
    expect(value(evaluate(app("scale", ref("position", [key("B")]), v("k")), at(pair, "A", { vars: { k: 2 } })))).toEqual(new Pt(6, 8));
  });

  it("REC.FIELDS: a record collects its fields, and failed fields give #ARGS", () => {
    expect(value(evaluate(rec({ x: lit(1), p: ref("position") }), at(pair, "A")))).toEqual({ x: 1, p: new Pt(0, 0) });
    expect(error(evaluate(rec({ x: ref("q"), y: ref("r") }), at(pair, "A"))).code).toBe("#ARGS");
  });
});

describe("axes (AXIS.*) and list ops (LIST.*)", () => {
  const four = space.record({ A, B, C, D });
  const distances = let_(
    { base: ref("position") },
    each(axes.others, app("length", app("subtract", v("base"), ref("position")))),
  );

  it("AXIS.OTHERS.ORIGIN and EXAMPLE.NEAREST: the base evaluates at the origin, the body at each target (V-001, V-042)", () => {
    expect(value(evaluate(app("min", distances), at(four, "A")))).toBe(1);
    const list = value(evaluate(distances, at(four, "A")));
    expect(isVexList(list) && list.items.map((item) => item.key)).toEqual(["B", "C", "D"]);
  });

  it("EXAMPLE.OFFSETS: reduce with a domain op over the others", () => {
    const three = space.record({ A, B, C });
    const offsets = let_({ base: ref("position") }, each(axes.others, app("subtract", v("base"), ref("position"))));
    expect(value(evaluate(app("reduce", offsets, lit("add")), at(three, "A")))).toEqual(new Pt(-9, -12));
  });

  it("AXIS.WHERE: where keeps the targets whose test gives true", () => {
    const heavy = each(axes.where(axes.all, app("gt", ref("weight"), lit(2))), ref("name"));
    const opts = at(four, "A", { fns: { gt: (a: unknown, b: unknown) => (a as number) > (b as number) } });
    const list = value(evaluate(app("values", heavy), opts));
    expect(list).toEqual(["b", "c", "d"]);
  });

  it("AXIS.OTHER.PAIR: the other axis outside a pair gives #REF!", () => {
    expect(error(evaluate(each(axes.other, ref("name")), at(four, "A"))).code).toBe("#REF!");
  });

  it("LIST.LENIENT: list ops skip error items by default, and strict makes the first error the result (V-013)", () => {
    const withMissing = space.record({ A, B, X: { name: "x" } });
    const lengths = each(axes.all, app("length", ref("position")));
    expect(value(evaluate(app("count", lengths), at(withMissing, "A")))).toBe(2);
    expect(value(evaluate(app("sum", lengths), at(withMissing, "A")))).toBe(5);
    expect(error(evaluate(app("sum", lengths, lit({ strict: true })), at(withMissing, "A"))).code).toBe("#N/A");
    expect(value(evaluate(app("errors", lengths), at(withMissing, "A")))).toHaveLength(1);
  });

  it("LIST.EMPTY: min of nothing gives #N/A, sum of nothing gives 0, reduce of nothing gives the identity", () => {
    const one = space.record({ A });
    const others = each(axes.others, ref("position"));
    expect(error(evaluate(app("min", each(axes.others, app("length", ref("position")))), at(one, "A"))).kind).toBe("empty");
    expect(value(evaluate(app("sum", each(axes.others, ref("weight"))), at(one, "A")))).toBe(0);
    expect(value(evaluate(app("reduce", others, lit("add")), at(one, "A")))).toEqual(new Pt(0, 0));
    expect(error(evaluate(app("reduce", others, lit("subtract")), at(one, "A"))).kind).toBe("empty");
  });

  it("LIST.REDUCE.EMPTY V-049: an empty reduce needs one domain with an identity, or the option domain", () => {
    const one = space.record({ A });
    const others = each(axes.others, ref("position"));
    const two = defineDomain({ name: "Two", is: (u: unknown): u is number => typeof u === "number", ops: { add: { fn: (a: number, b: number) => a + b, identity: () => 0 } } });
    const opts = (domains: NonNullable<Parameters<typeof evaluate>[1]["domains"]>): Parameters<typeof evaluate>[1] => ({ space: one, origin: "A", domains });
    // One domain with an identity: the identity.
    expect(value(evaluate(app("reduce", others, lit("add")), opts([PtDomain])))).toEqual(new Pt(0, 0));
    // Two domains with an identity: #N/A with the names, and the option domain names one.
    const unclear = error(evaluate(app("reduce", others, lit("add")), opts([two, PtDomain])));
    expect([unclear.code, unclear.message]).toEqual(["#N/A", '"reduce" with "add" has no values, and more domains have an identity for it (Two, Pt). Name one with { domain }']);
    expect(value(evaluate(app("reduce", others, lit("add"), lit({ domain: "Pt" })), opts([two, PtDomain])))).toEqual(new Pt(0, 0));
    expect(value(evaluate(app("reduce", others, lit("add"), lit({ domain: "Two" })), opts([two, PtDomain])))).toBe(0);
    // A name that is not a domain of the program gives #NAME?. A domain without the identity gives #N/A.
    expect(error(evaluate(app("reduce", others, lit("add"), lit({ domain: "Nope" })), opts([two, PtDomain]))).code).toBe("#NAME?");
    expect(error(evaluate(app("reduce", others, lit("subtract"), lit({ domain: "Pt" })), opts([two, PtDomain]))).code).toBe("#N/A");
  });

  it("LIST.KINDS: sum needs numbers and any needs booleans", () => {
    expect(error(evaluate(app("sum", each(axes.all, ref("name"))), at(four, "A"))).kind).toBe("kind-mismatch");
    expect(value(evaluate(app("any", each(axes.all, app("anyNonPositive", ref("position")))), at(four, "A")))).toBe(true);
  });

  it("AXIS.NEIGHBORS: a cellular automaton rule over a grid", () => {
    const g = space.grid([
      [{ alive: false }, { alive: true }, { alive: false }],
      [{ alive: false }, { alive: true }, { alive: false }],
      [{ alive: false }, { alive: true }, { alive: false }],
    ]);
    const liveNeighbors = app("count", each(axes.where(axes.neighbors(8), ref("alive")), lit(1)));
    expect(value(evaluate(liveNeighbors, { space: g, origin: "1,0" }))).toBe(3);
    expect(value(evaluate(liveNeighbors, { space: g, origin: "1,1" }))).toBe(2);
  });

  it("AXIS.TABLE: the axis table reads another space, there the origin is the target, and a variable brings a value in", () => {
    const Calc = defineDomain({
      name: "Calc",
      is: (u: unknown): u is number => typeof u === "number",
      ops: { eq: { fn: (a: number, b: number): boolean => a === b, params: ["number"] }, multiply: { fn: (a: number, b: number): number => a * b, params: ["number"] } },
    });
    const orders = space.array([{ product: 2, qty: 3 }, { product: 1, qty: 10 }]);
    const products = space.array([{ id: 1, price: 1.5 }, { id: 2, price: 12 }, { id: 3, price: 4 }]);
    const opts = (origin: string): EvalOptions => ({ space: orders, origin, domains: [Calc], tables: { products } });
    // The body reads the fields of the table: 1.5 + 12 + 4.
    expect(value(evaluate(app("sum", each(axes.table("products"), ref("price"))), opts("0")))).toBe(17.5);
    // The product of each order goes into the test through a variable, and the test and the body read the product.
    const price = let_({ $p: ref("product") }, app("first", each(axes.where(axes.table("products"), app("eq", ref("id"), v("$p"))), ref("price"))));
    expect([value(evaluate(price, opts("0"))), value(evaluate(price, opts("1")))]).toEqual([12, 1.5]);
    // In the space of the table, the origin is the target, so a read at the origin reads the product, not the order.
    expect(value(evaluate(app("sum", each(axes.table("products"), ref("price", [toOrigin]))), opts("0")))).toBe(17.5);
    expect(value(evaluate(app("count", each(axes.where(axes.table("products"), app("eq", ref("id", [toOrigin]), lit(3))), lit(1))), opts("1")))).toBe(1);
    // A name that is not a table of the evaluation gives #REF!.
    expect(error(evaluate(each(axes.table("nope"), lit(1)), opts("0")))).toMatchObject({ code: "#REF!", message: 'the evaluation has no table "nope"' });
    expect(error(evaluate(each(axes.table("products"), lit(1)), { space: orders, origin: "0" })).code).toBe("#REF!");
    const r = axisTargets(orders, { origin: "0", focus: "0" }, { t: "table", name: "products" });
    expect(r.ok ? "targets" : [r.error.code, r.error.message]).toEqual(["#REF!", 'the axis "table" needs the tables of the evaluation, and "products" is not one of them']);
  });

  it("AXIS.WINDOW: a window of rows gives a moving sum, goes among the siblings in a tree, and needs an array or a tree", () => {
    const rows = space.array([{ v: 1 }, { v: 2 }, { v: 4 }, { v: 8 }]);
    const moving = app("sum", each(axes.window(-1, 0), ref("v")));
    expect(["0", "1", "2", "3"].map((k) => value(evaluate(moving, { space: rows, origin: k })))).toEqual([1, 3, 6, 12]);
    const count = (w: ReturnType<typeof axes.window>, k: string): unknown => value(evaluate(app("count", each(w, lit(1))), { space: rows, origin: k }));
    // An offset outside the space has no target. A window with its start after its end has no target.
    expect([count(axes.window(-5, 5), "0"), count(axes.window(1, -1), "1"), count(axes.window(1, 1), "3")]).toEqual([4, 0, 0]);
    // A very large window loops over the keys of the space, not over its offsets.
    expect(count(axes.window(-1e15, 1e15), "2")).toBe(4);
    // In a tree space, the offsets go among the siblings. The roots are siblings.
    const tree = space.tree({ a: { v: 1 }, b: { v: 2 }, c: { v: 4 }, d: { v: 8 } }, { a: null, b: "a", c: "a", d: null });
    const around = app("sum", each(axes.window(-1, 1), ref("v")));
    expect(["a", "b", "c", "d"].map((k) => value(evaluate(around, { space: tree, origin: k })))).toEqual([9, 6, 6, 9]);
    // A record space and a grid have no offsets with one number.
    expect(error(evaluate(moving, { space: space.record({ A: { v: 1 } }), origin: "A" }))).toMatchObject({ code: "#REF!", message: '"window" needs an array space or a tree space, but this space is a record' });
    expect(error(evaluate(moving, { space: space.grid([[{ v: 1 }]]), origin: "0,0" })).code).toBe("#REF!");
  });
});

describe("special forms (FORM.*)", () => {
  const s = space.record({ A });
  it("FORM.IF is lazy", () => {
    expect(value(evaluate(app("if", lit(true), lit(1), ref("missing")), at(s, "A")))).toBe(1);
    expect(error(evaluate(app("if", lit(1), lit(1), lit(2)), at(s, "A"))).kind).toBe("kind-mismatch");
  });
  it("FORM.AND-OR: and and or short-circuit", () => {
    expect(value(evaluate(app("and", lit(false), ref("missing")), at(s, "A")))).toBe(false);
    expect(value(evaluate(app("or", lit(true), ref("missing")), at(s, "A")))).toBe(true);
  });
  it("FORM.IFERROR catches an error value", () => {
    expect(value(evaluate(app("ifError", ref("missing"), lit(0)), at(s, "A")))).toBe(0);
    expect(value(evaluate(app("ifError", lit(5), ref("missing")), at(s, "A")))).toBe(5);
  });
});

describe("totality (EVAL.TOTAL)", () => {
  it("EVAL.TOTAL: an op that throws inside a reduction gives an error value, not an exception (V-009)", () => {
    const s = space.record({ A, B });
    const r = evaluate(app("reduce", each(axes.all, ref("position")), lit("boom")), { space: s, origin: "A", domains: [PtDomain] });
    expect(error(r).code).toBe("#CALC!");
    const thrower = evaluate(app("reduce", each(axes.all, ref("position")), lit("add")), {
      space: space.record({ A: { position: new Pt(Number.NaN, 0) }, B }),
      origin: "A",
      domains: [PtDomain],
    });
    expect(thrower.ok).toBe(false);
  });

  it("a domain whose is test throws does not throw through evaluate", () => {
    const evil = { name: "Evil", kind: "vex.domain", ops: {}, is: (): boolean => { throw new Error("no"); } } as const;
    const s = space.record({ A });
    const r = evaluate(app("add", ref("position"), ref("size")), { space: s, origin: "A", domains: [evil as never, PtDomain] });
    expect(value(r)).toEqual(new Pt(2, 2));
  });

  it("an extension handler that throws gives #CALC!", () => {
    const s = space.record({ A });
    const r = evaluate(ext("bad", null), { space: s, origin: "A", extensions: { bad: () => { throw new Error("x"); } } });
    expect(error(r).code).toBe("#CALC!");
    const good = evaluate(ext("seven", null), { space: s, origin: "A", extensions: { seven: () => ok(7) } });
    expect(value(good)).toBe(7);
    const failed = evaluate(ext("no", null), { space: s, origin: "A", extensions: { no: () => fail(vexError("empty", "x")) } });
    expect(error(failed).kind).toBe("empty");
  });
});

describe("folds: explain, deps, JSON", () => {
  const pair = space.record({ A, B });
  const sep: Expr = app("subtract", app("add", ref("position"), ref("size")), ref("position", [other]));

  it("TRACE.EVENTS: explain records one event for each node, in finish order, with reads", () => {
    const t = explain(sep, at(pair, "A"));
    expect(t.events.map((e) => `${e.tag}:${e.label}`)).toEqual(["ref:position", "ref:size", "app:add", "ref:position", "app:subtract"]);
    expect(t.events[3]?.reads).toEqual([{ key: "B", path: ["position"], ok: true }]);
    expect(t.events[3]?.focus).toBe("A");
    expect(value(t.result)).toEqual(new Pt(-1, -2));
  });

  it("TRACE.AXIS: inside an axis, the focus of each event is the target", () => {
    const four = space.record({ A, B, C, D });
    const t = explain(each(axes.others, ref("name")), at(four, "A"));
    expect(t.events.filter((e) => e.tag === "ref").map((e) => e.focus)).toEqual(["B", "C", "D"]);
  });

  it("DEPS.READS: deps gives each static read with its address, its axes and the address of each axis", () => {
    const e = let_({ base: ref("position") }, each(axes.others, app("subtract", v("base"), ref("position", [key("B")]))));
    expect(deps(e)).toEqual([
      { at: [], path: ["position"], axes: [], axisAt: [] },
      { at: [{ t: "key", key: "B" }], path: ["position"], axes: ["others"], axisAt: [[]] },
    ]);
    const nested = each(axes.children, each(axes.all, ref("w")), [parent]);
    expect(deps(nested)).toEqual([{ at: [], path: ["w"], axes: ["children", "all"], axisAt: [[{ t: "parent" }], []] }]);
  });

  it("AXIS.ADDRESS: an axis with an address finds its targets from the key of the address, and the origin stays", () => {
    const t = space.tree({ r: { w: 1 }, a: { w: 2 }, b: { w: 3 }, c: { w: 4 } }, { a: "r", b: "r", c: "a" });
    const names = (e: Expr, origin: string): unknown => {
      const r = evaluate(e, { space: t, origin, domains: [] });
      return r.ok && isVexList(r.value) ? r.value.items.map((i) => i.key) : r;
    };
    expect(names(each(axes.children, ref("w"), [parent]), "c")).toEqual(["c"]);
    expect(names(each(axes.children, ref("w"), [parent]), "b")).toEqual(["a", "b"]);
    expect(names(each(axes.others, ref("w"), [key("a")]), "r")).toEqual(["r", "b", "c"]);
    // The empty address is the focus, and each() leaves it out of the expression.
    expect(each(axes.children, ref("w"), [])).toEqual(each(axes.children, ref("w")));
    // A failed address gives #REF! with the path of the axis.
    const failed = evaluate(each(axes.children, ref("w"), [parent]), { space: t, origin: "r", domains: [] });
    expect(failed.ok ? null : { code: failed.error.code, path: failed.error.path }).toEqual({ code: "#REF!", path: [] });
    // Inside the body, the origin is still the origin of the evaluation.
    const atOrigin = evaluate(each(axes.children, ref("w", [toOrigin]), [parent]), { space: t, origin: "b", domains: [] });
    expect(atOrigin.ok && isVexList(atOrigin.value) ? atOrigin.value.items.map((i) => (i.result.ok ? i.result.value : null)) : null).toEqual([3, 3]);
    // The trace names the address of the axis.
    const trace = explain(each(axes.children, ref("w"), [parent, key("r")]), { space: t, origin: "c", domains: [] });
    expect(trace.events.at(-1)?.label).toBe("each children from parent.key(r)");
  });

  it("IR.JSON: an expression round-trips, and domain literals need encode", () => {
    const e = app("add", ref("position"), lit(new Pt(1, 2)));
    const text = value(serialize(e, [PtDomain]));
    const back = value(parse(text, [PtDomain]));
    expect(back).toEqual(e);
    expect(error(serialize(e)).code).toBe("#VALUE!");
    expect(error(parse("{\"tag\":\"nope\"}")).code).toBe("#VALUE!");
    expect(error(parse("not json")).code).toBe("#VALUE!");
  });

  it("IR.JSON V-044: a domain value with toJSON round-trips as a domain value, not as its toJSON form", () => {
    // V-044: JSON.stringify applies toJSON before the replacer, so serialize wrote { x, y } and parse gave a plain object.
    class Tagged {
      constructor(readonly x: number) {}
      toJSON(): unknown {
        return { x: this.x };
      }
    }
    const TaggedDomain = defineDomain({ name: "Tagged", is: (u: unknown): u is Tagged => u instanceof Tagged, encode: (t: Tagged) => t.x, decode: (u: unknown) => new Tagged(Number(u)), ops: {} });
    const text = value(serialize(lit(new Tagged(3)), [TaggedDomain]));
    expect(JSON.parse(text)).toEqual({ tag: "lit", value: { $vex: "domain", domain: "Tagged", value: 3 } });
    const back = value(parse(text, [TaggedDomain]));
    expect(back.tag === "lit" && back.value instanceof Tagged ? back.value.x : null).toBe(3);
  });

  it("IR.JSON.ESCAPE V-045: a JSON literal with the key $vex round-trips as JSON data, not as a domain value", () => {
    const plain = lit({ $vex: "domain", domain: "Pt", value: [1, 2] });
    const back = value(parse(value(serialize(plain, [PtDomain])), [PtDomain]));
    expect(back).toEqual(plain);
    // The escape works at each depth, and a domain value in a record or a list keeps its domain.
    const deep = lit([{ a: { $vex: "number", value: "-0" } }, { b: new Pt(1, 2), $vex: "escape" }]);
    const text = value(serialize(deep, [PtDomain]));
    expect(text).toContain('"$vex":"escape"');
    expect(value(parse(text, [PtDomain]))).toEqual(deep);
    // A record with an unknown form of $vex stays data, so a file of an older version reads as before.
    expect(value(parse('{"tag":"lit","value":{"$vex":"later","x":1}}'))).toEqual(lit({ $vex: "later", x: 1 }));
  });

  it("IR.JSON.NUMBER V-046: -0, NaN and the infinities round-trip, in a literal and in a list", () => {
    // V-046: JSON.stringify writes -0 as 0, so a literal -0 came back as 0. Property P13 found it.
    for (const n of [-0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const back = value(parse(value(serialize(lit(n)))));
      expect(back.tag === "lit" && Object.is(back.value, n)).toBe(true);
    }
    const list = value(parse(value(serialize(lit([0, -0, 1])))));
    expect(list.tag === "lit" && Array.isArray(list.value) && list.value.map((x) => Object.is(x, -0))).toEqual([false, true, false]);
    // Only the value of a literal gets the form. A number in an argument of an op is in a literal too.
    expect(value(serialize(app("add", lit(-0), ref("x"))))).toBe('{"tag":"app","op":"add","args":[{"tag":"lit","value":{"$vex":"number","value":"-0"}},{"tag":"ref","path":["x"]}]}');
  });

  it("IR.JSON: a literal without a JSON form, and a domain literal without a decoder, give #VALUE!", () => {
    expect(error(serialize(lit(() => 1))).code).toBe("#VALUE!");
    const throwing = {
      get x(): number {
        throw new Error("no");
      },
    };
    expect(error(serialize(lit(throwing))).code).toBe("#CALC!");
    const text = value(serialize(lit(new Pt(1, 2)), [PtDomain]));
    expect(error(parse(text)).message).toContain('no domain "Pt"');
    expect(value(parse(value(serialize(lit({ a: [1, null, "s"] })))))).toEqual(lit({ a: [1, null, "s"] }));
  });
});

describe("compiled programs (EVAL.COMPILE)", () => {
  it("EVAL.COMPILE: one program runs at each origin of two spaces, with the results and traces of evaluate", () => {
    const e = let_({ base: ref("position") }, app("min", each(axes.others, app("length", app("subtract", v("base"), ref("position"))))));
    const program = compile(e, { domains: [PtDomain] });
    expect(program.expr).toBe(e);
    for (const s of [space.record({ A, B, C, D }), space.record({ A, C })]) {
      for (const k of s.keys) {
        expect(program.run({ space: s, origin: k })).toEqual(evaluate(e, at(s, k)));
        expect(program.explain({ space: s, origin: k })).toEqual(explain(e, at(s, k)));
      }
    }
    expect(error(program.run({ space: space.record({ A }), origin: "Z" })).code).toBe("#REF!");
    expect(value(compile(lit(1)).run({ space: space.record({ A }), origin: "A" }))).toBe(1);
  });
});

describe("the edges of the interpreter", () => {
  const s = space.record({ A, B });
  const run = (e: Expr, extra: Partial<EvalOptions> = {}) => evaluate(e, at(s, "A", extra));
  const pts = each(axes.all, ref("position"));
  const nums = each(axes.all, ref("weight"));
  const flags = each(axes.all, app("anyNonPositive", ref("position")));
  const nothing = each(axes.where(axes.all, lit(false)), ref("weight"));

  it("EVAL.TOTAL: a host space that throws gives #CALC!, not an exception", () => {
    const broken: Space = {
      kind: "record",
      keys: ["A"],
      has: (k: string): k is string => k === "A",
      get: () => {
        throw new Error("disk");
      },
      coords: () => undefined,
      keyAt: () => undefined,
    };
    expect(error(evaluate(ref("position"), { space: broken, origin: "A" }))).toMatchObject({ code: "#CALC!", origin: "A" });
  });

  it("EVAL.LOCATION: an error has the path, the origin and the focus of its node", () => {
    const fromHandler = run(app("add", ref("position"), ext("no", null)), { extensions: { no: () => fail(vexError("empty", "nothing")) } });
    expect(error(fromHandler)).toMatchObject({ code: "#N/A", path: [1], origin: "A", focus: "A" });
    const located = run(ext("no", null), { extensions: { no: () => fail(vexError("empty", "nothing", { origin: "B", focus: "B", path: [7] })) } });
    expect(error(located)).toMatchObject({ path: [7], origin: "B", focus: "B" });
    const test = run(app("count", each(axes.where(axes.others, ref("weight")), ref("position")), lit({ strict: true })));
    expect(error(test)).toMatchObject({ code: "#VALUE!", path: [0, 1], origin: "A", focus: "B" });
  });

  it("an extension kind without a handler gives #NAME?", () => {
    expect(error(run(ext("sheet", null))).code).toBe("#NAME?");
  });

  it("a free function must be an own property of the options", () => {
    expect(error(run(app("toString", lit(1)), { fns: {} })).code).toBe("#VALUE!");
    expect(error(run(app("hasOwnProperty"), { fns: {} })).code).toBe("#NAME?");
  });

  it("CALL.PARAMS: boolean, string and any parameters, and arguments past the declared list", () => {
    const Tagged = defineDomain({
      name: "Tagged",
      is: (u: unknown): u is Pt => u instanceof Pt,
      ops: { label: { params: ["boolean", "string", "any"], fn: (p: Pt, b: boolean, t: string, x: unknown) => `${t}:${b}:${String(x)}:${p.x}` } },
    });
    const call = (...args: readonly Expr[]) => run(app("label", ref("position"), ...args), { domains: [Tagged] });
    expect(value(call(lit(true), lit("t"), lit(1), lit("past")))).toBe("t:true:1:0");
    expect(error(call(lit(1), lit("t"))).code).toBe("#VALUE!");
    expect(error(call(lit(true), lit(2))).code).toBe("#VALUE!");
    expect(value(run(app("scale", ref("position"), lit(2), lit("past"))))).toEqual(new Pt(0, 0));
  });

  it("CALL.LIFT: a fromScalar that throws gives #CALC!", () => {
    const Lifty = defineDomain({
      name: "Lifty",
      is: (u: unknown): u is Pt => u instanceof Pt,
      fromScalar: (): Pt => {
        throw new Error("no lift");
      },
      ops: { add: { liftScalar: true } },
    });
    expect(error(run(app("add", ref("position"), lit(1)), { domains: [Lifty] })).code).toBe("#CALC!");
  });

  it("CALL.RESULT: a valid check that throws gives #CALC!", () => {
    const Fussy = defineDomain({
      name: "Fussy",
      is: (u: unknown): u is Pt => u instanceof Pt,
      valid: (): boolean => {
        throw new Error("no check");
      },
      ops: { add: {} },
    });
    expect(error(run(app("add", ref("position"), ref("size")), { domains: [Fussy] })).code).toBe("#CALC!");
  });

  it("FORM.IF: a false condition takes the third argument, and a missing argument gives #VALUE!", () => {
    expect(value(run(app("if", lit(false), lit(1), lit(2))))).toBe(2);
    expect(error(run(app("if", lit(true)))).code).toBe("#VALUE!");
    expect(error(run(app("and"))).code).toBe("#VALUE!");
    expect(value(run(app("or", lit(false), lit(true))))).toBe(true);
  });

  it("LIST.KINDS: the list ops keys, errors, first, mean, max and none", () => {
    const withError = each(axes.all, ref("missing"));
    expect(value(run(app("keys", nums)))).toEqual(["A", "B"]);
    expect(value(run(app("errors", withError)))).toMatchObject([{ code: "#N/A" }, { code: "#N/A" }]);
    expect(value(run(app("first", nums)))).toBe(2);
    expect(error(run(app("first", nothing))).code).toBe("#N/A");
    expect(value(run(app("mean", nums)))).toBe(2.5);
    expect(error(run(app("mean", nothing))).code).toBe("#N/A");
    expect(error(run(app("mean", pts))).code).toBe("#VALUE!");
    expect(error(run(app("max", pts))).code).toBe("#VALUE!");
    expect(value(run(app("max", nums)))).toBe(3);
    expect(value(run(app("all", flags)))).toBe(false);
    expect(value(run(app("none", flags)))).toBe(false);
    expect(error(run(app("all", nums))).code).toBe("#VALUE!");
  });

  it("LIST.EMPTY and reduce: the op name must be a string, and the values need the op", () => {
    expect(error(run(app("reduce", pts, lit(1)))).code).toBe("#VALUE!");
    expect(error(run(app("reduce", nums, lit("add")))).code).toBe("#NAME?");
    expect(error(run(app("reduce", nothing, lit("subtract")))).code).toBe("#N/A");
    expect(error(run(app("reduce", nothing, lit("nope")))).code).toBe("#N/A");
    expect(value(run(app("reduce", pts, lit("subtract"))))).toEqual(new Pt(-3, -4));
  });
});

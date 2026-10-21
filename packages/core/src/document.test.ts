/**
 * The documents of Vex (spec §4.1): the coeval form of each kind of expression, the round trip, the entry points that
 * take a document, and the errors of a document that is not valid.
 */
import { describe, expect, it } from "vitest";
import { fromDocument, isDocument, toDocument, type Envelope } from "./document.ts";
import { compile, evaluate, explain } from "./evaluate.ts";
import { app, axes, call, each, ext, fn, fold, index, iterate, key, let_, lit, offset, origin, other, parent, rec, ref, v, type Axis, type Expr } from "./ir.ts";
import { parse } from "./json.ts";
import { space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

/** This function gives a value with the type of an expression, for a test of a value that is not valid. */
const asExpr = (u: unknown): Expr => u as Expr;

/** This function gives the document of an expression, or throws in a test. */
const doc = (e: Expr): Envelope => value(toDocument(e, [PtDomain]));

/** The message of the error of `fromDocument` for a document. */
const reason = (d: unknown): string => error(fromDocument(d, [PtDomain])).message;

/** The steps of the moves of a reference, without its root and its field. */
const steps = (e: Expr): unknown => (doc(e).value as readonly unknown[]).slice(1, -1);

/** The message of a document that is not valid at `where`. */
const at = (where: string, why: string): string => `the document is not valid at ${where === "" ? "its root" : `"${where}"`}: ${why}`;

/** A reference with one move of a kind and a value. */
const move = (kind: string, data: unknown): unknown => ({ type: "ref", value: ["self", { type: ["moves", kind], value: data }] });

/** A let with a function `f` and a call with the function `f`. */
const callOf = (f: unknown): unknown => ({ type: "let", value: { bind: { f: { type: "fn", value: { params: [], body: 1 } } }, body: { type: "call", value: { fn: f, args: [] } } } });

/** An each with an axis and more fields. */
const eachOf = (axis: unknown, extra: Readonly<Record<string, unknown>> = {}): unknown => ({ type: "each", value: { axis, body: 1, ...extra } });

/** Each axis, also the axes with an expression inside. */
const AXES: readonly Axis[] = [
  axes.all,
  axes.others,
  axes.other,
  axes.neighbors(4),
  axes.neighbors(8),
  axes.children,
  axes.ancestors,
  axes.descendants,
  axes.siblings,
  axes.window(-1, 2),
  axes.table("T"),
  axes.successors,
  axes.predecessors,
  axes.reachable,
  axes.list(v("xs")),
  axes.reverse(axes.children),
  axes.reverse(axes.list(each(axes.all, ref("x")))),
  axes.where(axes.reverse(axes.others), app("gt", ref("x"), lit(1))),
];

/** An expression of each kind, each move and each axis, with fixed and computed moves. */
const CORPUS: readonly Expr[] = [
  lit(1),
  lit("text"),
  lit(true),
  lit(null),
  lit([1, { type: "a", value: 2 }]),
  lit({ a: 1, b: [true, null] }),
  lit({ type: "ref", value: ["self", "x"] }),
  lit({ $vex: "domain", domain: "Pt", value: [1, 2] }),
  lit(Number.NaN),
  lit(-0),
  lit(Number.POSITIVE_INFINITY),
  lit(new Pt(3, 4)),
  ref("x"),
  ref("pos.x"),
  ref([]),
  ref(["a.b"]),
  ref("x", [key("A"), index(2), other, offset(-1, 1), origin, parent]),
  ref("x", [key(lit("A")), index(lit(0)), key(app("concat", ref("k"), lit("!"))), index(v("i"))]),
  v("a"),
  app("add", ref("x"), lit(1)),
  app("list.sum", each(axes.all, ref("v"))),
  app(""),
  app("if", app("gt", ref("x"), lit(0)), lit({ type: "lit", value: 1 }), lit("no")),
  let_({ a: lit(1), b: ref("y") }, app("add", v("a"), v("b"))),
  let_({ weight: fn(["k"], app("multiply", ref("w"), v("k"))) }, call("weight", lit(2))),
  let_({ none: fn([], lit(0)) }, call("none")),
  rec({ x: lit(1), type: ref("t"), value: lit({ type: "a", value: 1 }) }),
  rec({}),
  ...AXES.map((axis) => each(axis, ref("x"))),
  each(axes.all, ref("x"), [parent]),
  each(axes.children, ref("x"), [key(v("k")), offset(1)]),
  fold(axes.all, { s: lit(0) }, { s: app("add", v("s"), ref("v")) }, v("s")),
  fold(axes.window(-2, 0), { a: lit(0), b: lit(1) }, { a: v("b") }, rec({ a: v("a"), b: v("b") }), [origin]),
  iterate(10, { n: lit(0) }, { n: app("add", v("n"), lit(1)) }, v("n")),
  iterate(0, { n: lit(0) }, {}, v("n"), app("gt", v("n"), lit(3))),
  ext("vex.cell", { column: "a", at: [{ t: "offset", d: [-1] }] }),
  ext("custom", null),
  ext("", [1, 2]),
];

describe("the documents of the expressions (DOC.*)", () => {
  it("DOC.ROUND-TRIP: each expression of the corpus gives the same expression after toDocument and fromDocument", () => {
    for (const e of CORPUS) expect(fromDocument(doc(e), [PtDomain])).toEqual({ ok: true, value: e });
  });

  it("DOC.ROUND-TRIP: a document is JSON data, so it gives the same expression after JSON text", () => {
    for (const e of CORPUS) expect(fromDocument(JSON.parse(JSON.stringify(doc(e))), [PtDomain])).toEqual({ ok: true, value: e });
  });

  it("DOC.ADDRESS DOC.ROUND-TRIP: an empty address and no address give the same document and the same expression", () => {
    const bare = asExpr({ tag: "ref", path: ["x"], at: [] });
    expect(doc(bare)).toEqual(doc(ref("x")));
    expect(value(fromDocument(doc(bare)))).toStrictEqual(ref("x"));
    expect(doc(asExpr({ tag: "each", axis: axes.all, body: lit(1), at: [] }))).toEqual({ type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: 1 } });
    expect(value(fromDocument({ type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: 1, at: { type: "ref", value: ["self"] } } }))).toStrictEqual(each(axes.all, lit(1)));
    expect(value(fromDocument({ type: "fold", value: { axis: { type: ["axes", "all"], value: {} }, init: {}, step: {}, result: 1, at: { type: "ref", value: ["self"] } } }))).toStrictEqual(fold(axes.all, {}, {}, lit(1)));
  });

  it("DOC.TERM: a literal is its JSON value, except at the root and with the shape of an envelope", () => {
    expect(doc(lit(1))).toEqual({ type: "lit", value: 1 });
    expect(doc(lit({ type: "a", value: 1 }))).toEqual({ type: "lit", value: { type: "a", value: 1 } });
    expect(doc(app("f", lit(1), lit("x"), lit(null), lit([1]), lit({ a: 1 })))).toEqual({ type: ["ops", "f"], value: [1, "x", null, [1], { a: 1 }] });
    expect(doc(app("f", lit({ type: "a", value: 1 }), lit({ type: "a", value: 1, more: 2 })))).toEqual({
      type: ["ops", "f"],
      value: [{ type: "lit", value: { type: "a", value: 1 } }, { type: "a", value: 1, more: 2 }],
    });
    // fromDocument reads a bare literal at the root, and a literal in an envelope anywhere.
    expect(value(fromDocument(5))).toEqual(lit(5));
    expect(value(fromDocument({ type: "a", value: 1, more: 2 }))).toEqual(lit({ type: "a", value: 1, more: 2 }));
    expect(value(fromDocument({ type: ["ops", "f"], value: [{ type: "lit", value: 2 }] }))).toEqual(app("f", lit(2)));
  });

  it("DOC.TERM: a type can be a text, a list of keys or the expanded reference into the world", () => {
    const body = { bind: { a: 1 }, body: { type: "ref", value: ["names", "a"] } };
    const expected = let_({ a: lit(1) }, v("a"));
    expect(value(fromDocument({ type: "let", value: body }))).toEqual(expected);
    expect(value(fromDocument({ type: ["let"], value: body }))).toEqual(expected);
    expect(value(fromDocument({ type: { type: "ref", value: ["world", "let"] }, value: body }))).toEqual(expected);
    expect(value(fromDocument({ type: { type: "ref", value: ["world", "ops", "add"] }, value: [1, 2] }))).toEqual(app("add", lit(1), lit(2)));
  });

  it("DOC.LITERAL: the value of a literal has the JSON form of IR.JSON", () => {
    expect(doc(lit(Number.NaN))).toEqual({ type: "lit", value: { $vex: "number", value: "NaN" } });
    expect(doc(app("f", lit(-0)))).toEqual({ type: ["ops", "f"], value: [{ $vex: "number", value: "-0" }] });
    expect(doc(lit(new Pt(1, 2)))).toEqual({ type: "lit", value: { $vex: "domain", domain: "Pt", value: [1, 2] } });
    expect(doc(lit({ $vex: 1 }))).toEqual({ type: "lit", value: { $vex: "escape", value: { $vex: 1 } } });
    const back = value(fromDocument({ type: ["ops", "f"], value: [{ $vex: "domain", domain: "Pt", value: [1, 2] }] }, [PtDomain]));
    expect(back.tag === "app" && back.args[0]?.tag === "lit" ? back.args[0].value : undefined).toBeInstanceOf(Pt);
    expect(error(toDocument(lit(new Pt(1, 2))))).toMatchObject({ code: "#VALUE!", kind: "bad-expression", message: "a literal value is not JSON data and no domain encodes it" });
  });

  it("DOC.OPS: an op is a type under ops, with the name split at its dots", () => {
    expect(doc(app("list.sum", ref("x")))).toEqual({ type: ["ops", "list", "sum"], value: [{ type: "ref", value: ["self", "x"] }] });
    expect(doc(app(""))).toEqual({ type: ["ops", ""], value: [] });
    expect(value(fromDocument({ type: ["ops", "a", "", "b"], value: [] }))).toEqual(app("a..b"));
  });

  it("DOC.REF: a reference reads the fields of self after its moves, and a name of names", () => {
    expect(doc(ref("pos.x"))).toEqual({ type: "ref", value: ["self", "pos", "x"] });
    expect(doc(ref([]))).toEqual({ type: "ref", value: ["self"] });
    expect(doc(v("a"))).toEqual({ type: "ref", value: ["names", "a"] });
    expect(doc(ref("x", [parent, key("A")]))).toEqual({
      type: "ref",
      value: ["self", { type: ["moves", "parent"], value: null }, { type: ["moves", "key"], value: "A" }, "x"],
    });
  });

  it("DOC.MOVE: a fixed key is a text, a fixed position is a number, and a computed one is an envelope", () => {
    expect(steps(ref("x", [key("A"), index(2), other, offset(-1, 1), origin, parent]))).toEqual([
      { type: ["moves", "key"], value: "A" },
      { type: ["moves", "index"], value: 2 },
      { type: ["moves", "other"], value: null },
      { type: ["moves", "offset"], value: [-1, 1] },
      { type: ["moves", "origin"], value: null },
      { type: ["moves", "parent"], value: null },
    ]);
    // A computed key that is a literal stays an envelope, so it does not become a fixed key.
    expect(steps(ref("x", [key(lit("A")), index(lit(0)), index(v("i"))]))).toEqual([
      { type: ["moves", "key"], value: { type: "lit", value: "A" } },
      { type: ["moves", "index"], value: { type: "lit", value: 0 } },
      { type: ["moves", "index"], value: { type: "ref", value: ["names", "i"] } },
    ]);
    expect(value(fromDocument({ type: "ref", value: ["self", { type: ["moves", "key"], value: { type: "lit", value: "A" } }, "x"] }))).toEqual(ref("x", [key(lit("A"))]));
  });

  it("DOC.CONSTRUCT: let, fn, record, each, fold and iterate are constructs with their fields", () => {
    expect(doc(let_({ a: lit(1) }, v("a")))).toEqual({ type: "let", value: { bind: { a: 1 }, body: { type: "ref", value: ["names", "a"] } } });
    expect(doc(let_({ f: fn(["k"], v("k")) }, lit(0)))).toEqual({
      type: "let",
      value: { bind: { f: { type: "fn", value: { params: ["k"], body: { type: "ref", value: ["names", "k"] } } } }, body: 0 },
    });
    expect(doc(rec({ type: lit(1), value: ref("v") }))).toEqual({ type: "record", value: { type: 1, value: { type: "ref", value: ["self", "v"] } } });
    expect(doc(each(axes.all, ref("x"), [offset(1)]))).toEqual({
      type: "each",
      value: { axis: { type: ["axes", "all"], value: {} }, body: { type: "ref", value: ["self", "x"] }, at: { type: "ref", value: ["self", { type: ["moves", "offset"], value: [1] }] } },
    });
    expect(doc(fold(axes.all, { s: lit(0) }, { s: v("s") }, v("s"), [origin]))).toEqual({
      type: "fold",
      value: {
        axis: { type: ["axes", "all"], value: {} },
        init: { s: 0 },
        step: { s: { type: "ref", value: ["names", "s"] } },
        result: { type: "ref", value: ["names", "s"] },
        at: { type: "ref", value: ["self", { type: ["moves", "origin"], value: null }] },
      },
    });
    expect(doc(iterate(3, { n: lit(0) }, {}, v("n"), lit(true)))).toEqual({
      type: "iterate",
      value: { limit: 3, init: { n: 0 }, step: {}, until: true, result: { type: "ref", value: ["names", "n"] } },
    });
    expect(doc(iterate(3, { n: lit(0) }, {}, v("n")))).toEqual({ type: "iterate", value: { limit: 3, init: { n: 0 }, step: {}, result: { type: "ref", value: ["names", "n"] } } });
  });

  it("DOC.CALL: a call names its function with a reference into names", () => {
    expect(doc(let_({ f: fn([], lit(1)) }, call("f", ref("x"), lit(2))))).toEqual({
      type: "let",
      value: {
        bind: { f: { type: "fn", value: { params: [], body: 1 } } },
        body: { type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: [{ type: "ref", value: ["self", "x"] }, 2] } },
      },
    });
  });

  it("DOC.AXIS: an axis is a type under axes, with its parameters as the value", () => {
    expect(AXES.map((a) => (doc(each(a, lit(0))).value as { readonly axis: unknown }).axis)).toEqual([
      { type: ["axes", "all"], value: {} },
      { type: ["axes", "others"], value: {} },
      { type: ["axes", "other"], value: {} },
      { type: ["axes", "neighbors"], value: { n: 4 } },
      { type: ["axes", "neighbors"], value: { n: 8 } },
      { type: ["axes", "children"], value: {} },
      { type: ["axes", "ancestors"], value: {} },
      { type: ["axes", "descendants"], value: {} },
      { type: ["axes", "siblings"], value: {} },
      { type: ["axes", "window"], value: { from: -1, to: 2 } },
      { type: ["axes", "table"], value: { name: "T" } },
      { type: ["axes", "successors"], value: {} },
      { type: ["axes", "predecessors"], value: {} },
      { type: ["axes", "reachable"], value: {} },
      { type: ["axes", "list"], value: { list: { type: "ref", value: ["names", "xs"] } } },
      { type: ["axes", "reverse"], value: { axis: { type: ["axes", "children"], value: {} } } },
      {
        type: ["axes", "reverse"],
        value: { axis: { type: ["axes", "list"], value: { list: { type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: { type: "ref", value: ["self", "x"] } } } } } },
      },
      {
        type: ["axes", "where"],
        value: {
          axis: { type: ["axes", "reverse"], value: { axis: { type: ["axes", "others"], value: {} } } },
          test: { type: ["ops", "gt"], value: [{ type: "ref", value: ["self", "x"] }, 1] },
        },
      },
    ]);
  });

  it("DOC.EXT: an extension is a type under ext, with its data as the value", () => {
    expect(doc(ext("vex.cell", { column: "a", at: [] }))).toEqual({ type: ["ext", "vex", "cell"], value: { column: "a", at: [] } });
    expect(value(fromDocument({ type: ["ext", "a", "b"], value: { type: "lit", value: 1 } }))).toEqual(ext("a.b", { type: "lit", value: 1 }));
  });

  it("DOC.ENTRY: isDocument tells an envelope from a node of the tagged IR", () => {
    expect([isDocument({ type: "lit", value: 1 }), isDocument({ type: ["ops", "f"], value: [] }), isDocument(lit(1)), isDocument(1), isDocument(null), isDocument({ type: "lit" })]).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("DOC.ENTRY: compile, evaluate, explain and parse take a document, and give the results of its expression", () => {
    const s = space.record({ A: { v: 1, w: 2 }, B: { v: 3, w: 4 }, C: { v: 5, w: 6 } });
    const fns = { add: (a: unknown, b: unknown): number => (a as number) + (b as number) };
    const programs = [
      app("count", each(axes.others, ref("v"))),
      fold(axes.all, { s: lit(0) }, { s: app("add", v("s"), ref("v")) }, v("s")),
      let_({ f: fn(["k"], app("add", ref("w"), v("k"))) }, call("f", ref("v", [key("B")]))),
      ref("v", [key(lit("C"))]),
      app("values", each(axes.reverse(axes.all), rec({ w: ref("w") }))),
    ];
    for (const e of programs) {
      const d = doc(e);
      for (const k of s.keys) {
        expect(evaluate(d, { space: s, origin: k, fns })).toEqual(evaluate(e, { space: s, origin: k, fns }));
        expect(explain(d, { space: s, origin: k, fns })).toEqual(explain(e, { space: s, origin: k, fns }));
      }
      const program = compile(d, { fns });
      expect(program.expr).toEqual(e);
      expect(program.run({ space: s, origin: "A" })).toEqual(evaluate(e, { space: s, origin: "A", fns }));
      expect(parse(JSON.stringify(d))).toEqual({ ok: true, value: e });
    }
  });

  it("DOC.ENTRY: a document that is not valid gives #VALUE! with its reason at each run, and the program keeps the document", () => {
    const s = space.record({ A: { v: 1 } });
    const bad = { type: "ref", value: ["world", "x"] };
    const program = compile(bad);
    expect(program.expr).toBe(bad);
    const message = 'the document is not valid at "/value/0": Vex reads only from the roots "self" and "names", and this reference starts at "world"';
    expect(program.run({ space: s, origin: "A" })).toEqual({ ok: false, error: { code: "#VALUE!", kind: "bad-expression", message, path: [], origin: "A", focus: "A" } });
    expect(error(evaluate(bad, { space: s, origin: "A" }))).toMatchObject({ code: "#VALUE!", message });
    expect(error(parse(JSON.stringify(bad))).message).toBe(message);
    // A deep document gives the error of fromDocument, with its kind.
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i++) deep = { type: ["ops", "f"], value: [deep] };
    expect(error(evaluate(deep as Envelope, { space: s, origin: "A" }))).toMatchObject({ code: "#DEPTH!", kind: "depth", origin: "A", focus: "A" });
  });

  it("DOC.ENTRY: parse checks a document as isExpr does, so a move needs whole numbers", () => {
    const half = { type: "ref", value: ["self", { type: ["moves", "offset"], value: [0.5] }, "x"] };
    expect(value(fromDocument(half))).toEqual(ref("x", [offset(0.5)]));
    expect(error(parse(JSON.stringify(half)))).toMatchObject({ kind: "bad-expression", message: "the JSON is not a valid Vex expression" });
  });
});

describe("the errors of the documents (DOC.ERROR)", () => {
  const all = { type: ["axes", "all"], value: {} };

  it("DOC.ERROR: a type that is not a term of Vex, a header and a computed type give their reasons", () => {
    expect(reason({ type: "nope", value: 1 })).toBe(at("", 'the type "nope" is not a term of Vex'));
    expect(reason({ type: ["foo", "bar"], value: 1 })).toBe(at("", 'the type "foo.bar" is not a term of Vex'));
    expect(reason({ type: ["ops"], value: [] })).toBe(at("", 'the type "ops" is not a term of Vex'));
    expect(reason({ type: ["axes", "all"], value: {} })).toBe(at("", 'the type "axes.all" is not a term of Vex'));
    // A construct of Vex with more keys in its type is not that construct.
    expect(reason({ type: ["let", "x"], value: { bind: {}, body: 1 } })).toBe(at("", 'the type "let.x" is not a term of Vex'));
    expect(reason({ type: ["lit", "x"], value: 1 })).toBe(at("", 'the type "lit.x" is not a term of Vex'));
    expect(reason({ type: ["ops", 1], value: [] })).toBe(at("/type", "a key of the name is not a text"));
    expect(reason({ type: ["ext", "a", 0], value: [] })).toBe(at("/type", "a key of the name is not a text"));
    expect(reason({ type: "lit", value: 1, name: "x" })).toBe(at("", "a term of Vex has no name and no own entries"));
    expect(reason({ type: "lit", value: 1, own: {} })).toBe(at("", "a term of Vex has no name and no own entries"));
    expect(reason({ type: { type: "ref", value: ["world", { type: "x", value: 1 }] }, value: 1 })).toBe(at("/type", "the type has a computed step"));
  });

  it("DOC.ERROR: a reference that Vex cannot read gives its reason and its location", () => {
    expect(reason({ type: "ref", value: "x" })).toBe(at("/value", "the value is not a list"));
    expect(reason({ type: "ref", value: ["world", "x"] })).toBe(at("/value/0", 'Vex reads only from the roots "self" and "names", and this reference starts at "world"'));
    expect(reason({ type: "ref", value: [] })).toBe(at("/value/0", 'Vex reads only from the roots "self" and "names", and this reference starts at nothing'));
    for (const path of [["names"], ["names", "a", "b"], ["names", 1], ["names", { type: ["moves", "parent"], value: null }]]) {
      expect(reason({ type: "ref", value: path })).toBe(at("/value", "a reference to a name has one step: the name"));
    }
    expect(reason({ type: "ref", value: ["self", 1] })).toBe(at("/value/1", "a step is not a text and not a move"));
    expect(reason({ type: "ref", value: ["self", "x", { type: ["moves", "parent"], value: null }] })).toBe(at("/value/2", "a move comes after a field. Vex reads the fields at the end of the path"));
    expect(reason({ type: "ref", value: ["self", { type: "lit", value: 1 }] })).toBe(at("/value/1", 'Vex has no step of the type "lit"'));
    expect(reason({ type: "ref", value: ["self", { type: ["moves"], value: null }] })).toBe(at("/value/1", 'Vex has no step of the type "moves"'));
    expect(reason({ type: "ref", value: ["self", { type: ["moves", 1], value: null }] })).toBe(at("/value/1", 'Vex has no step of the type "moves.1"'));
    expect(reason({ type: "ref", value: ["self", { type: ["moves", "key", "x"], value: "A" }] })).toBe(at("/value/1", 'Vex has no step of the type "moves.key.x"'));
    expect(reason({ type: "ref", value: ["self", { type: ["moves", "jump"], value: null }] })).toBe(at("/value/1", 'Vex has no move "jump"'));
    expect(reason({ type: "ref", value: ["self", { type: ["moves", "toString"], value: null }] })).toBe(at("/value/1", 'Vex has no move "toString"'));
  });

  it("DOC.ERROR: a move with a value of the wrong kind gives its reason", () => {
    expect(reason(move("key", 1))).toBe(at("/value/1/value", "the key is not a text or a term in an envelope"));
    expect(reason(move("index", "2"))).toBe(at("/value/1/value", "the position is not a number or a term in an envelope"));
    expect(reason(move("offset", [1, "x"]))).toBe(at("/value/1/value", "the offset is not a list of numbers"));
    expect(reason(move("offset", 1))).toBe(at("/value/1/value", "the offset is not a list of numbers"));
    expect(reason(move("parent", {}))).toBe(at("/value/1/value", 'the value of the move "parent" is not null'));
    expect(reason(move("other", 0))).toBe(at("/value/1/value", 'the value of the move "other" is not null'));
    expect(reason(move("key", { type: "ref", value: ["caps"] }))).toBe(at("/value/1/value/value/0", 'Vex reads only from the roots "self" and "names", and this reference starts at "caps"'));
  });

  it("DOC.ERROR: a construct with a missing field, an extra field or a part of the wrong kind gives its reason", () => {
    expect(reason({ type: "let", value: 1 })).toBe(at("/value", "the value is not a record"));
    expect(reason({ type: "let", value: [] })).toBe(at("/value", "the value is not a record"));
    expect(reason({ type: "let", value: { bind: {} } })).toBe(at("/value", 'the value has no field "body"'));
    expect(reason({ type: "let", value: { bind: {}, body: 1, extra: 2 } })).toBe(at("/value/extra", 'the field "extra" is not a field of this term'));
    expect(reason({ type: "let", value: { bind: [], body: 1 } })).toBe(at("/value/bind", "the value is not a record"));
    expect(reason({ type: "let", value: { bind: { "a/b~c": { type: "nope", value: 1 } }, body: 1 } })).toBe(at("/value/bind/a~1b~0c", 'the type "nope" is not a term of Vex'));
    expect(reason({ type: "record", value: 1 })).toBe(at("/value", "the value is not a record"));
    expect(reason({ type: "fn", value: { params: "k", body: 1 } })).toBe(at("/value/params", "the value is not a list"));
    expect(reason({ type: "fn", value: { params: [1], body: 1 } })).toBe(at("/value/params", "a parameter is not a text"));
    expect(reason({ type: ["ops", "f"], value: { a: 1 } })).toBe(at("/value", "the value is not a list"));
    expect(reason({ type: ["ops", "f"], value: [1, { type: "nope", value: 0 }] })).toBe(at("/value/1", 'the type "nope" is not a term of Vex'));
    const message = 'the function of a call is a reference to a name: { "type": "ref", "value": ["names", name] }';
    expect(reason(callOf("f"))).toBe(at("/value/body/value/fn", message));
    expect(reason(callOf({ type: "ref", value: ["self", "f"] }))).toBe(at("/value/body/value/fn", message));
    expect(reason({ type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: 1 } })).toBe(at("/value/args", "the value is not a list"));
    expect(reason({ type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: [{ type: "x", value: 1 }] } })).toBe(at("/value/args/0", 'the type "x" is not a term of Vex'));
  });

  it("DOC.ERROR: an axis or an address that is not valid gives its reason", () => {
    expect(reason(eachOf("all"))).toBe(at("/value/axis", "the axis is not an envelope"));
    expect(reason(eachOf({ type: "lit", value: 1 }))).toBe(at("/value/axis", 'the type "lit" is not an axis'));
    expect(reason(eachOf({ type: ["axes"], value: {} }))).toBe(at("/value/axis", 'the type "axes" is not an axis'));
    expect(reason(eachOf({ type: ["axes", 2], value: {} }))).toBe(at("/value/axis", 'the type "axes.2" is not an axis'));
    expect(reason(eachOf({ type: ["axes", "all", "x"], value: {} }))).toBe(at("/value/axis", 'the type "axes.all.x" is not an axis'));
    expect(reason(eachOf({ type: ["axes", "nope"], value: {} }))).toBe(at("/value/axis", 'Vex has no axis "nope"'));
    expect(reason(eachOf({ type: ["axes", "all"], value: { x: 1 } }))).toBe(at("/value/axis/value/x", 'the field "x" is not a field of this term'));
    expect(reason(eachOf({ type: ["axes", "all"], value: null }))).toBe(at("/value/axis/value", "the value is not a record"));
    expect(reason(eachOf({ type: ["axes", "neighbors"], value: {} }))).toBe(at("/value/axis/value", 'the value has no field "n"'));
    expect(reason(eachOf({ type: ["axes", "window"], value: { from: 0 } }))).toBe(at("/value/axis/value", 'the value has no field "to"'));
    expect(reason(eachOf({ type: ["axes", "table"], value: {} }))).toBe(at("/value/axis/value", 'the value has no field "name"'));
    expect(reason(eachOf({ type: ["axes", "list"], value: {} }))).toBe(at("/value/axis/value", 'the value has no field "list"'));
    expect(reason(eachOf({ type: ["axes", "reverse"], value: { axis: 1 } }))).toBe(at("/value/axis/value/axis", "the axis is not an envelope"));
    expect(reason(eachOf({ type: ["axes", "where"], value: { axis: all, test: { type: "x", value: 1 } } }))).toBe(at("/value/axis/value/test", 'the type "x" is not a term of Vex'));
    const address = 'the address is a reference from "self" with moves only: { "type": "ref", "value": ["self", ...moves] }';
    expect(reason(eachOf(all, { at: [] }))).toBe(at("/value/at", address));
    expect(reason(eachOf(all, { at: { type: "lit", value: 1 } }))).toBe(at("/value/at", address));
    expect(reason(eachOf(all, { at: { type: "ref", value: ["self", "x"] } }))).toBe(at("/value/at", address));
    expect(reason(eachOf(all, { at: { type: "ref", value: ["names", "x"] } }))).toBe(at("/value/at", address));
    expect(reason({ type: "fold", value: { axis: all, init: {}, step: {}, result: 1, at: null } })).toBe(at("/value/at", address));
    expect(reason({ type: "fold", value: { axis: all, init: 1, step: {}, result: 1 } })).toBe(at("/value/init", "the value is not a record"));
    expect(reason({ type: "iterate", value: { limit: 1, init: {}, step: 1, result: 1 } })).toBe(at("/value/step", "the value is not a record"));
    expect(reason({ type: "iterate", value: { limit: 1, init: {}, step: {}, result: 1, until: { type: "x", value: 1 } } })).toBe(at("/value/until", 'the type "x" is not a term of Vex'));
  });

  it("DOC.ERROR: the checks of the expression apply after the reading (EVAL.SHAPE)", () => {
    const shape = "the document gives an expression that is not valid: ";
    expect(reason({ type: "each", value: { axis: { type: ["axes", "neighbors"], value: { n: 5 } }, body: 1 } })).toBe(`${shape}the expression has an axis that is not valid`);
    expect(reason({ type: "fn", value: { params: [], body: 1 } })).toBe(
      `${shape}the expression has a function outside the bindings of a let, or a function with parameters that are not distinct names`,
    );
    expect(reason({ type: "iterate", value: { limit: -1, init: {}, step: {}, result: 1 } })).toBe(`${shape}the expression has a node "iterate" with parts that are not valid`);
  });

  it("DOC.ERROR: a literal without a decoder, a decoder that throws and a deep document give their errors", () => {
    expect(reason({ $vex: "domain", domain: "Other", value: 1 })).toBe(at("", 'no domain "Other" decodes a literal'));
    expect(reason({ type: "lit", value: { $vex: "domain", domain: "Other", value: 1 } })).toBe(at("/value", 'no domain "Other" decodes a literal'));
    const Throwing = { ...PtDomain, decode: (): never => { throw new Error("decode"); } };
    const threw = error(fromDocument({ type: "lit", value: { $vex: "domain", domain: "Pt", value: [1, 2] } }, [Throwing]));
    expect(threw).toMatchObject({ code: "#CALC!", kind: "threw", message: "a decoder of a domain threw an exception" });
    expect(threw.thrown).toBeInstanceOf(Error);
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i++) deep = { type: ["ops", "f"], value: [deep] };
    expect(error(fromDocument(deep))).toMatchObject({ code: "#DEPTH!", kind: "depth", message: "the document is too deep for the call stack of the engine" });
  });

  it("DOC.ERROR: toDocument gives an error for an expression that is not valid, a literal without a JSON form and a deep expression", () => {
    expect(error(toDocument(asExpr({ tag: "nope" })))).toEqual({ code: "#VALUE!", kind: "bad-expression", message: 'the expression has a node with the tag "nope", and this version of Vex does not know it', path: [] });
    expect(error(toDocument(lit({ f: (): number => 1 })))).toMatchObject({ code: "#VALUE!", kind: "bad-expression", message: "a literal value is not JSON data and no domain encodes it" });
    const throwing = {
      get x(): number {
        throw new Error("getter");
      },
    };
    const threw = error(toDocument(lit(throwing)));
    expect(threw).toMatchObject({ code: "#CALC!", kind: "threw", message: "the expression has no document" });
    expect(threw.thrown).toBeInstanceOf(Error);
    let deep: Expr = lit(1);
    for (let i = 0; i < 100_000; i++) deep = app("f", deep);
    expect(error(toDocument(deep))).toMatchObject({ code: "#DEPTH!", kind: "depth", message: "the expression is too deep for the call stack of the engine" });
  });
});

/**
 * The documents of Vex (spec §4.1): the coeval form of each kind of expression, the round trip, the entry points that
 * take a document, and the errors of a document that is not valid.
 */
import { describe, expect, it } from "vitest";
import { fromDocument, isDocument, toDocument, type Envelope } from "./document.ts";
import { MAX_DOCUMENT_DEPTH } from "./kernel.ts";
import { compile, evaluate, explain } from "./evaluate.ts";
import { app, axes, call, each, ext, fn, fold, index, iterate, key, let_, lit, offset, origin, other, parent, rec, ref, shapeError, v, type Axis, type Expr } from "./ir.ts";
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
    const message = 'the document is not valid at "/value/0": The root world is not open here. The open roots are self, names.';
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
  /** The code of the error of a document, and the JSON Pointer of the part that is not valid. */
  const fault = (d: unknown): readonly [string, string] => {
    const e = error(fromDocument(d, [PtDomain]));
    return [e.code, /^the document is not valid at (?:its root|"([^"]*)"): /.exec(e.message)?.[1] ?? ""];
  };
  const invalid = (where: string): readonly [string, string] => ["#VALUE!", where];

  it("DOC.CHECK DOC.ERROR: the kernel checks the kinds by the contracts of VEX_WORLD, at the root and in each position", () => {
    expect(reason({ type: "nope", value: 1 })).toBe(at("", "The world has no kind nope."));
    for (const type of [["foo", "bar"], ["ops"], ["let", "x"], ["lit", "x"]]) expect(fault({ type, value: 1 })).toEqual(invalid(""));
    // An axis or a function is not a term: the root has no position, so the grammar of Vex refuses them there.
    expect(reason({ type: ["axes", "all"], value: {} })).toBe(at("", 'the type "axes.all" is not a term of Vex'));
    expect(reason({ type: "fn", value: { params: [], body: 1 } })).toBe(at("", 'the type "fn" is not a term of Vex'));
    // In a position, the contract permits only the kinds of the terms, and a function only in the bindings of a let.
    expect(reason({ type: ["ops", "f"], value: [1, { type: "fn", value: { params: [], body: 1 } }] })).toContain('at "/value/1": The kind fn is not permitted here.');
    expect(fault({ type: ["ops", "f"], value: [1, { type: "nope", value: 0 }] })).toEqual(invalid("/value/1"));
    expect(fault({ type: "let", value: { bind: { "a/b~c": { type: "nope", value: 1 } }, body: 1 } })).toEqual(invalid("/value/bind/a~1b~0c"));
    expect(fault({ type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: [{ type: "x", value: 1 }] } })).toEqual(invalid("/value/args/0"));
    expect(fault(eachOf(all, { body: { type: ["moves", "parent"], value: null } }))).toEqual(invalid("/value/body"));
  });

  it("DOC.ERROR: the grammar of Vex refuses a header, a name of an op with a key that is not a text, and a computed type", () => {
    expect(reason({ type: ["ops", 1], value: [] })).toBe(at("/type", "a key of the name is not a text"));
    expect(reason({ type: ["ext", "a", 0], value: [] })).toBe(at("/type", "a key of the name is not a text"));
    expect(reason({ type: "lit", value: 1, name: "x" })).toBe(at("", "a term of Vex has no name and no own entries"));
    expect(reason({ type: "lit", value: 1, own: {} })).toBe(at("", "a term of Vex has no name and no own entries"));
    expect(reason(eachOf({ type: ["axes", "all"], value: {}, name: "a" }))).toBe(at("/value/axis", "a term of Vex has no name and no own entries"));
    expect(reason({ type: "let", value: { bind: { f: { type: "fn", value: { params: [], body: 1 }, own: {} } }, body: 1 } })).toBe(at("/value/bind/f", "a term of Vex has no name and no own entries"));
    expect(fault({ type: { type: "ref", value: ["world", { type: "x", value: 1 }] }, value: 1 })).toEqual(invalid(""));
  });

  it("DOC.ERROR: a reference that Vex cannot read gives its reason and its location", () => {
    expect(reason({ type: "ref", value: "x" })).toBe(at("/value", "The value of ref is a path: a list that starts with a root."));
    expect(reason({ type: "ref", value: ["world", "x"] })).toBe(at("/value/0", "The root world is not open here. The open roots are self, names."));
    expect(fault({ type: "ref", value: [] })).toEqual(invalid("/value"));
    for (const path of [["names"], ["names", "a", "b"], ["names", 1], ["names", { type: ["moves", "parent"], value: null }]]) {
      expect(reason({ type: "ref", value: path })).toBe(at("/value", "a reference to a name has one step: the name"));
    }
    expect(reason({ type: "ref", value: ["self", 1] })).toBe(at("/value/1", "a step is not a text and not a move"));
    expect(reason({ type: "ref", value: ["self", "x", { type: ["moves", "parent"], value: null }] })).toBe(at("/value/2", "a move comes after a field. Vex reads the fields at the end of the path"));
    for (const type of ["lit", ["moves"], ["moves", 1], ["moves", "key", "x"], ["moves", "jump"], ["moves", "toString"]]) {
      expect(reason({ type: "ref", value: ["self", { type, value: null }] })).toBe(at("/value/1", "A step is a key, or a document of a kind with the verb step."));
    }
  });

  it("DOC.MOVE DOC.ERROR: a move with a value of the wrong kind gives its reason, and a key or a position is a term", () => {
    expect(fault(move("offset", [1, "x"]))).toEqual(invalid("/value/1/value/1"));
    expect(fault(move("offset", 1))).toEqual(invalid("/value/1/value"));
    expect(fault(move("parent", {}))).toEqual(invalid("/value/1/value"));
    expect(fault(move("other", 0))).toEqual(invalid("/value/1/value"));
    expect(fault(move("key", { type: "ref", value: ["caps"] }))).toEqual(invalid("/value/1/value/value/0"));
    // A key or a position is a term: a bare value of another kind is a literal, which gives #VALUE! at run time.
    expect(value(fromDocument(move("key", 1)))).toEqual(ref([], [key(lit(1))]));
    expect(value(fromDocument(move("index", "2")))).toEqual(ref([], [index(lit("2"))]));
    expect(error(evaluate(move("key", 1) as Envelope, { space: space.record({ A: {} }), origin: "A" })).code).toBe("#VALUE!");
  });

  it("DOC.CONSTRUCT DOC.ERROR: a construct with a missing field, an extra field or a part of the wrong kind gives its reason", () => {
    expect(reason({ type: "let", value: 1 })).toBe(at("/value", "The value must be a record. The kind is let."));
    expect(fault({ type: "let", value: [] })).toEqual(invalid("/value"));
    expect(reason({ type: "let", value: { bind: {} } })).toBe(at("/value", "The field body is missing. The kind is let."));
    expect(fault({ type: "let", value: { bind: {}, body: 1, extra: 2 } })).toEqual(invalid("/value/extra"));
    expect(fault({ type: "let", value: { bind: [], body: 1 } })).toEqual(invalid("/value/bind"));
    expect(fault({ type: "record", value: 1 })).toEqual(invalid("/value"));
    expect(fault({ type: "fn", value: { params: "k", body: 1 } })).toEqual(invalid("/value/params"));
    expect(fault({ type: "let", value: { bind: { f: { type: "fn", value: { params: "k", body: 1 } } }, body: 1 } })).toEqual(invalid("/value/bind/f/value/params"));
    expect(fault({ type: "let", value: { bind: { f: { type: "fn", value: { params: [1], body: 1 } } }, body: 1 } })).toEqual(invalid("/value/bind/f/value/params/0"));
    expect(fault({ type: "let", value: { bind: { f: { type: "fn", value: { params: ["a", "a"], body: 1 } } }, body: 1 } })).toEqual(invalid("/value/bind/f/value/params/1"));
    expect(fault({ type: ["ops", "f"], value: { a: 1 } })).toEqual(invalid("/value"));
    const message = 'the function of a call is a reference to a name: { "type": "ref", "value": ["names", name] }';
    expect(fault(callOf("f"))).toEqual(invalid("/value/body/value/fn"));
    expect(reason(callOf({ type: "ref", value: ["self", "f"] }))).toBe(at("/value/body/value/fn", message));
    expect(reason(callOf({ type: "ref", value: ["names", "f", "g"] }))).toBe(at("/value/body/value/fn", message));
    expect(fault({ type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: 1 } })).toEqual(invalid("/value/args"));
    expect(fault({ type: "call", value: { fn: { type: "ref", value: ["names", "f"] } } })).toEqual(invalid("/value"));
  });

  it("DOC.AXIS DOC.ADDRESS DOC.ERROR: an axis or an address that is not valid gives its reason", () => {
    for (const axis of ["all", { type: "lit", value: 1 }]) expect(fault(eachOf(axis))).toEqual(invalid("/value/axis"));
    for (const type of [["axes"], ["axes", 2], ["axes", "all", "x"], ["axes", "nope"]]) expect(fault(eachOf({ type, value: {} }))).toEqual(invalid("/value/axis"));
    expect(fault(eachOf({ type: ["axes", "all"], value: { x: 1 } }))).toEqual(invalid("/value/axis/value/x"));
    expect(fault(eachOf({ type: ["axes", "all"], value: null }))).toEqual(invalid("/value/axis/value"));
    for (const name of ["neighbors", "window", "table", "list"]) expect(fault(eachOf({ type: ["axes", name], value: {} }))).toEqual(invalid("/value/axis/value"));
    expect(fault(eachOf({ type: ["axes", "neighbors"], value: { n: 5 } }))).toEqual(invalid("/value/axis/value/n"));
    expect(fault(eachOf({ type: ["axes", "window"], value: { from: 0, to: "1" } }))).toEqual(invalid("/value/axis/value/to"));
    expect(fault(eachOf({ type: ["axes", "table"], value: { name: 1 } }))).toEqual(invalid("/value/axis/value/name"));
    expect(fault(eachOf({ type: ["axes", "reverse"], value: { axis: 1 } }))).toEqual(invalid("/value/axis/value/axis"));
    // The inner axis of reverse is a base axis (AXIS.REVERSE).
    for (const inner of [{ type: ["axes", "table"], value: { name: "T" } }, { type: ["axes", "reverse"], value: { axis: all } }, { type: ["axes", "where"], value: { axis: all, test: true } }]) {
      expect(fault(eachOf({ type: ["axes", "reverse"], value: { axis: inner } }))).toEqual(invalid("/value/axis/value/axis"));
    }
    expect(fault(eachOf({ type: ["axes", "where"], value: { axis: all, test: { type: "x", value: 1 } } }))).toEqual(invalid("/value/axis/value/test"));
    const address = 'the address is a reference from "self" with moves only: { "type": "ref", "value": ["self", ...moves] }';
    expect(fault(eachOf(all, { at: [] }))).toEqual(invalid("/value/at"));
    expect(fault(eachOf(all, { at: { type: "lit", value: 1 } }))).toEqual(invalid("/value/at"));
    expect(reason(eachOf(all, { at: { type: "ref", value: ["self", "x"] } }))).toBe(at("/value/at", address));
    expect(reason(eachOf(all, { at: { type: "ref", value: ["names", "x"] } }))).toBe(at("/value/at", address));
    expect(fault({ type: "fold", value: { axis: all, init: {}, step: {}, result: 1, at: null } })).toEqual(invalid("/value/at"));
    expect(fault({ type: "fold", value: { axis: all, init: 1, step: {}, result: 1 } })).toEqual(invalid("/value/init"));
    expect(fault({ type: "iterate", value: { limit: 1, init: {}, step: 1, result: 1 } })).toEqual(invalid("/value/step"));
    expect(fault({ type: "iterate", value: { limit: 1, init: {}, step: {}, result: 1, until: { type: "x", value: 1 } } })).toEqual(invalid("/value/until"));
  });

  it("LOOP.NAMES ITERATE.LIMIT DOC.ERROR: the limit of iterate and the names of a loop give their reasons", () => {
    for (const limit of [-1, 1.5, 100_001, "3"]) expect(fault({ type: "iterate", value: { limit, init: {}, step: {}, result: 1 } })).toEqual(invalid("/value/limit"));
    expect(reason({ type: "iterate", value: { limit: 1, init: {}, step: { a: 1 }, result: 1 } })).toBe(at("/value/step/a", 'the name "a" of step is not a name of init'));
    expect(reason({ type: "fold", value: { axis: all, init: { a: 0 }, step: { a: 1, b: 2 }, result: 1 } })).toBe(at("/value/step/b", 'the name "b" of step is not a name of init'));
  });

  it("EVAL.SHAPE DOC.CHECK: the expression of each document that fromDocument reads is valid", () => {
    // The contracts and the grammar of Vex check each rule of isExpr for documents, so no expression needs shapeError.
    const docs: unknown[] = [
      eachOf({ type: ["axes", "window"], value: { from: 0.5, to: 2 } }),
      move("index", 1.5),
      move("offset", [0.5, -1]),
      { type: "let", value: { bind: { f: { type: "fn", value: { params: ["a", "b"], body: { type: "ref", value: ["names", "a"] } } } }, body: { type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: [1, 2] } } } },
      { type: "iterate", value: { limit: 100_000, init: { n: 0 }, step: { n: 1 }, result: { type: "ref", value: ["names", "n"] } } },
    ];
    for (const d of docs) expect(shapeError(value(fromDocument(d)))).toBeUndefined();
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
    expect(error(fromDocument(deep))).toMatchObject({ code: "#DEPTH!", kind: "depth", message: `the document is nested deeper than ${String(MAX_DOCUMENT_DEPTH)} documents` });
    // A getter of a document that throws stops the check: the error is #CALC!.
    const getter = Object.defineProperty({ type: "lit" }, "value", { enumerable: true, get: (): never => { throw new Error("getter"); } });
    expect(error(fromDocument({ type: ["ops", "f"], value: [getter] }))).toMatchObject({ code: "#CALC!", kind: "threw" });
  });

  it("DOC.ERROR: toDocument gives an error for an expression that is not valid and a literal without a JSON form, and a deep expression has a document", () => {
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
    // The writer uses a stack, so a deep expression has a document. The kernel takes documents up to its depth.
    let deep: Expr = lit(1);
    for (let i = 0; i < 100_000; i++) deep = app("f", deep);
    expect(isDocument(value(toDocument(deep)))).toBe(true);
    let data: unknown = 1;
    for (let i = 0; i < 100_000; i++) data = [data];
    expect(error(toDocument(lit(data)))).toMatchObject({ code: "#DEPTH!", kind: "depth", message: "a literal value is too deep for the call stack of the engine" });
  });
});

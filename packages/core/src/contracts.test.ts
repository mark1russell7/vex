/**
 * The exact contracts of the kernel: the messages and the details of errors, and the inputs at the edges (a
 * function with properties, an object without a prototype, a field with an empty name). The mutation lane showed
 * that the other tests did not check these facts.
 */
import { describe, expect, it } from "vitest";
import { vex } from "./builder.ts";
import { defineDomain, findMethod, resolveOp } from "./domain.ts";
import { vexError } from "./errors.ts";
import { compile, describeType, evaluate, explain, formatTrace, previewValue } from "./evaluate.ts";
import { app, axes, each, ext, index, isExpr, isMove, key, lit, offset, ref, shapeError, toPath, type Axis, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { isVexList } from "./list.ts";
import { isSome, none, ok } from "./result.ts";
import { cell, SheetRun } from "./sheet.ts";
import { applyMove, axisTargets, space, type Space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";
import { monoids, traversal } from "./traversal.ts";

/** This function gives a value with the type of an expression, for a test of a value that is not valid. */
const bad = (u: unknown): Expr => u as Expr;

class Thing {
  readonly n: number;
  constructor(n: number) {
    this.n = n;
  }
  twice(): Thing {
    return new Thing(this.n * 2);
  }
}

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: { plus: { fn: (a: number, b: number): number => a + b, params: ["number"] } },
});

const A = { position: new Pt(0, 0), size: new Pt(2, 2), weight: 2, flag: true };
const B = { position: new Pt(3, 4), size: new Pt(1, 1), weight: 3, flag: true };
const s = space.record({ A, B });
const at = (e: Expr, extra: Partial<Parameters<typeof evaluate>[1]> = {}) => evaluate(e, { space: s, origin: "A", domains: [PtDomain], ...extra });

describe("the contracts of sheets", () => {
  const one = space.record({ A: {} });
  const run = (columns: Readonly<Record<string, Expr>>, sp: Space = one) => new SheetRun(new Map(Object.entries(columns)), { space: sp, domains: [Num] });

  it("SHEET.CELL: cell() without an address reads at the focus", () => {
    expect(value(run({ v: lit(1), c: cell("v") }).cell("c", "A"))).toBe(1);
  });

  it("SHEET.CELL: a cell reference that is not valid data gives #VALUE! with its message", () => {
    const fnData = Object.assign(() => 1, { column: "v", at: [] });
    // The data of an extension is not an expression, so a cell reference takes only fixed moves.
    const computed = { column: "v", at: [{ t: "index", i: lit(0) }] };
    for (const data of [fnData, { column: 7, at: [] }, null, computed]) {
      expect(error(run({ v: lit(1), c: ext("vex.cell", data) }).cell("c", "A"))).toMatchObject({
        code: "#VALUE!",
        kind: "bad-expression",
        message: "a cell reference needs a column name and an address of fixed moves",
        path: [],
      });
    }
    expect(error(run({ c: app("plus", lit(1), ext("vex.cell", null)) }).cell("c", "A")).path).toEqual([1]);
  });

  it("SHEET.CELL: an address outside the space gives the #REF! of the address", () => {
    expect(error(run({ v: lit(1), c: cell("v", [key("Z")]) }).cell("c", "A"))).toMatchObject({ code: "#REF!", message: 'the space has no key "Z"', path: [] });
  });

  it("SHEET.CELL: an unknown column gives #NAME? with the column and the key", () => {
    expect(error(run({}).cell("nope", "A"))).toMatchObject({ code: "#NAME?", kind: "unbound", message: 'the sheet has no column "nope"', origin: "A", focus: "A" });
  });

  it("SHEET.CYCLE: the error names the cell, and a cell that reads itself is on a cycle also behind ifError", () => {
    const r = run({ a: cell("b"), b: cell("a"), self: app("ifError", cell("self"), lit(0)) });
    expect(error(r.cell("a", "A"))).toMatchObject({ code: "#CYCLE!", kind: "cycle", message: 'the cell "a" at "A" is on a cycle of cell references', origin: "A", focus: "A" });
    expect(error(r.cell("self", "A")).code).toBe("#CYCLE!");
  });

  it("SHEET.RECURRENCE: result() evaluates the cells before the key first, and no cell after it", () => {
    const log: string[] = [];
    const rows = vex(Num)
      .withOptions({ extensions: { tick: (_d, ctx) => (log.push(ctx.position.focus), ok(1)) } })
      .over(space.array([{}, {}, {}, {}]));
    const sheet = rows.sheet().column("c", (r) => r.start(r.ext<number>("tick")));
    expect(value(sheet.result("2", "c"))).toBe(1);
    expect(log).toEqual(["0", "1", "2"]);
    log.length = 0;
    expect(sheet.explain("2", "c").result).toEqual(ok(1));
    expect(log.slice(0, 2)).toEqual(["0", "1"]);
  });

  it("SHEET.CELL: a sheet gives its free functions to each formula", () => {
    const withHalf = vex(Num)
      .withOptions({ fns: { half: (n: number): number => n / 2 } })
      .over(one);
    expect(value(withHalf.sheet().column("h", (r) => r.start(4).call("half")).result("A", "h"))).toBe(2);
  });
});

describe("the contracts of the JSON form", () => {
  const NoEncode = defineDomain({ name: "PtNoEncode", is: (u: unknown): u is Pt => u instanceof Pt, ops: {} });

  it("IR.JSON: only the value of a literal changes, and the first domain with encode encodes it", () => {
    const data = value(serialize(ext("k", { value: new Pt(1, 2) }), [PtDomain]));
    expect(data).toContain('"value":{"x":1,"y":2}');
    expect(data).not.toContain("$vex");
    // An object with the tag "lit" inside other data is not a literal node, so its other fields are not values.
    expect(value(serialize(ext("k", { tag: "lit", other: new Pt(1, 2) }), [PtDomain]))).not.toContain("$vex");
    expect(value(serialize(lit(new Pt(1, 2)), [NoEncode, PtDomain]))).toContain('"$vex":"domain","domain":"Pt"');
  });

  it("IR.JSON: values without a JSON form give their errors with messages", () => {
    expect(error(serialize(lit({ a: 1, f: () => 1 })))).toMatchObject({ kind: "bad-expression", message: "a literal value is not JSON data and no domain encodes it" });
    expect(error(serialize(lit(Object.setPrototypeOf(() => 1, null) as object))).kind).toBe("bad-expression");
    const throwing = {
      get x(): number {
        throw new Error("getter");
      },
    };
    const threw = error(serialize(lit(throwing)));
    expect(threw).toMatchObject({ kind: "threw", message: "the expression has no JSON form" });
    expect(threw.thrown).toBeInstanceOf(Error);
    expect(value(serialize(lit(Object.assign(Object.create(null) as object, { a: 1 }))))).toBe('{"tag":"lit","value":{"a":1}}');
  });

  it("IR.JSON: null, and a record with the field domain, round-trip without a decoder", () => {
    for (const e of [lit(null), lit({ domain: "Pt", value: [1, 2] }), lit({ $vex: "other", domain: "Pt" }), lit({ $vex: "domain", domain: 5 })]) {
      expect(value(parse(value(serialize(e)), [PtDomain]))).toEqual(e);
    }
  });

  it("IR.JSON: parse gives a message for an unknown domain, for text that is not JSON and for JSON that is not an expression", () => {
    const unknown = '{"tag":"lit","value":{"$vex":"domain","domain":"Other","value":1}}';
    expect(error(parse(unknown, [PtDomain]))).toMatchObject({ kind: "bad-expression", message: 'no domain "Other" decodes a literal' });
    const notJson = error(parse("{"));
    expect(notJson).toMatchObject({ kind: "bad-expression", message: "the text is not JSON" });
    expect(notJson.thrown).toBeInstanceOf(SyntaxError);
    expect(error(parse('{"tag":"nope"}')).message).toBe("the JSON is not a valid Vex expression");
  });
});

describe("the contracts of op lookup", () => {
  it("findMethod: an empty name, a forbidden name, an object without a prototype and a function", () => {
    expect(findMethod({ "": () => 1 }, "")).toBeUndefined();
    for (const name of ["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]) {
      const o = Object.defineProperty({}, name, { value: () => 1, enumerable: true });
      expect(findMethod(o, name)).toBeUndefined();
    }
    expect(findMethod(Object.create(null) as object, "x")).toBeUndefined();
    const fn = Object.assign(function f(): number {
      return 1;
    }, { twice: (): number => 2 });
    expect(findMethod(fn, "twice")).toBeTypeOf("function");
    expect(findMethod(fn, "call")).toBeUndefined();
  });

  it("resolveOp: a forbidden name is not an op, also when the domain declares it, and an undeclared method is not an op", () => {
    const Weird = defineDomain({ name: "Weird", is: (u: unknown): u is number => typeof u === "number", ops: { __defineGetter__: { fn: (): number => 1 } } });
    expect(resolveOp(Weird, 1, "__defineGetter__")).toBeUndefined();
    const Declared = defineDomain({ name: "Thing", is: (u: unknown): u is Thing => u instanceof Thing, ops: {} });
    expect(resolveOp(Declared, new Thing(1), "twice")).toBeUndefined();
  });

  it("vexError keeps only the details that the caller gives", () => {
    expect(Object.keys(vexError("empty", "m"))).toEqual(["code", "kind", "message", "path"]);
    expect(Object.keys(vexError("empty", "m", { origin: "A", focus: "B", op: "o", causes: [], thrown: 1 }))).toEqual([
      "code",
      "kind",
      "message",
      "path",
      "origin",
      "focus",
      "op",
      "causes",
      "thrown",
    ]);
  });
});

describe("the contracts of the interpreter", () => {
  it("EVAL.TOTAL EVAL.SHAPE V-056: a program that is not an object gives #VALUE!, also in a sheet with a compiler", () => {
    // V-056: the caches of compiled programs take only objects, so evaluate, explain and a sheet threw a TypeError.
    const rows = space.array([{ a: 1 }]);
    for (const program of [0, "A", null, true]) {
      const e = bad(program);
      expect(error(evaluate(e, { space: rows, origin: "0" }))).toMatchObject({ code: "#VALUE!", kind: "bad-expression" });
      expect(error(explain(e, { space: rows, origin: "0" }).result)).toMatchObject({ code: "#VALUE!" });
      const run = new SheetRun(new Map([["c", e]]), { space: rows, compile: (x, o) => compile(x, o) });
      expect(error(run.cell("c", "0"))).toMatchObject({ code: "#VALUE!" });
    }
  });

  it("EVAL.SHAPE V-053: an expression that is not valid gives #VALUE! with its reason, and compile does not throw", () => {
    // V-053: a node with a tag of a newer version of Vex (fold, in 0.6.0) made compile throw a TypeError.
    const rows = space.array([{ a: 1 }]);
    const run = (e: Expr): unknown => {
      const r = error(evaluate(e, { space: rows, origin: "0", domains: [Num] }));
      return [r.code, r.kind, r.message];
    };
    const newer = bad({ tag: "loop", body: lit(1) });
    const unknown = ["#VALUE!", "bad-expression", 'the expression has a node with the tag "loop", and this version of Vex does not know it'];
    expect(() => compile(newer)).not.toThrow();
    expect(run(newer)).toEqual(unknown);
    expect(run(app("add", lit(1), newer))).toEqual(unknown);
    expect(run(bad({ tag: "app", op: "add" }))).toEqual(["#VALUE!", "bad-expression", 'the expression has a node "app" with parts that are not valid']);
    expect(run(each({ t: "diagonal" } as unknown as Axis, lit(1)))).toEqual(["#VALUE!", "bad-expression", "the expression has an axis that is not valid"]);
    expect(run(app("add", lit(1), bad(5)))).toEqual(["#VALUE!", "bad-expression", "the expression has a part that is not a node"]);
    expect(run(bad({ value: 1 }))).toEqual(["#VALUE!", "bad-expression", "the expression has a part that is not a node"]);
    expect(run(app("add", lit(1), bad(null)))).toEqual(["#VALUE!", "bad-expression", "the expression has a part that is not a node"]);
    expect(shapeError(app("add", lit(1), lit(2)))).toBeUndefined();
    // A node of a known tag with a missing part is not a node of a newer version.
    for (const tag of ["lit", "ref", "app", "let", "var", "rec", "each", "fold", "iterate", "fn", "call", "ext"]) expect(shapeError({ tag })).not.toMatch(/does not know/);
    expect(shapeError({ tag: "each", axis: axes.all, body: lit(1), at: 5 })).toBe('the expression has a node "each" with parts that are not valid');
    // A sheet gives the same error for its column, and the other columns work.
    const sheetRun = new SheetRun(new Map([["bad", newer], ["good", lit(2)]]), { space: rows, domains: [Num] });
    expect(error(sheetRun.cell("bad", "0")).message).toBe(unknown[2]);
    expect(value(sheetRun.cell("good", "0"))).toBe(2);
  });

  it("EVAL.TOTAL: a host space that throws gives the message of the evaluation", () => {
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
    expect(error(evaluate(ref("p"), { space: broken, origin: "A" })).message).toBe("the evaluation threw an exception");
  });

  it("EVAL.COMPILE: one expression object with other domains, functions or extensions gives their results", () => {
    // One list of domains for each call, so only the changed option is different.
    const domains = [PtDomain];
    const e = app("length", ref("position"));
    expect(value(at(e, { domains }))).toBe(0);
    expect(error(at(e, { domains: [] })).code).toBe("#VALUE!");
    const f = app("f", lit("x"));
    expect(value(at(f, { domains, fns: { f: () => 1 } }))).toBe(1);
    expect(value(at(f, { domains, fns: { f: () => 2 } }))).toBe(2);
    const x = ext("k", null);
    expect(value(at(x, { domains, extensions: { k: () => ok(1) } }))).toBe(1);
    expect(value(at(x, { domains, extensions: { k: () => ok(2) } }))).toBe(2);
  });

  it("TRACE.EVENTS: an event without reads has no reads field, and a literal line has no reads", () => {
    const t = explain(lit(5), { space: s, origin: "A" });
    expect(Object.keys(t.events[0] ?? {})).not.toContain("reads");
    expect(formatTrace(t)).toBe("5 @A = 5\nresult = 5\n");
  });

  it("REF.MISSING: the message names the path, the first missing segment and a record that is not there", () => {
    const sp = space.record({ N: null, U: undefined, E: {}, F: { f: Object.assign(() => 1, { tag: "x" }) } });
    const msg = (e: Expr, origin: string) => error(evaluate(e, { space: sp, origin })).message;
    expect(msg(ref("deep.x"), "N")).toBe('the record at "N" has no value at "deep.x"');
    expect(msg(ref("a"), "U")).toBe('the record at "U" has no value at "a"');
    expect(msg(ref("deep.x"), "U")).toBe('the record at "U" has no value at "deep.x"');
    expect(msg(ref("deep.x.y"), "E")).toBe('the record at "E" has no value at "deep"');
    expect(value(evaluate(ref("f.tag"), { space: sp, origin: "F" }))).toBe("x");
  });

  it("REF.FORBIDDEN: an empty name and the prototype names are not fields, also as own fields", () => {
    const own = JSON.parse('{"":5,"__proto__":6,"constructor":7,"prototype":8}') as Record<string, number>;
    const sp = space.record({ O: own });
    for (const name of ["", "__proto__", "constructor", "prototype"]) {
      expect(error(evaluate(ref([name]), { space: sp, origin: "O" })).code).toBe("#N/A");
    }
  });

  it("AXIS.WHERE: each where test of a nested where has its own path", () => {
    const e = app("count", each(axes.where(axes.where(axes.all, lit(true)), ref("weight")), ref("weight")), lit({ strict: true }));
    expect(error(at(e))).toMatchObject({ code: "#VALUE!", path: [0, 2] });
  });

  it("CALL.LIFT and CALL.PARAMS: no lift without fromScalar, and a missing argument goes to the op", () => {
    const NoFrom = defineDomain({ name: "NoFrom", is: (u: unknown): u is Pt => u instanceof Pt, ops: { add: { liftScalar: true, params: ["domain"] } } });
    expect(error(at(app("add", ref("position"), lit(1)), { domains: [NoFrom] }))).toMatchObject({ code: "#VALUE!", kind: "not-instance" });
    expect(error(at(app("scale", ref("position")))).code).toBe("#NUM!");
  });

  it("CALL.RESULT: a result of null gives #CALC!, and the first domain that accepts a value checks it", () => {
    expect(error(at(app("nul", lit("x")), { fns: { nul: () => null } }))).toMatchObject({ code: "#CALC!", kind: "undefined-result" });
    const evil = defineDomain({
      name: "Evil",
      is: (_u: unknown): _u is Pt => {
        throw new Error("is");
      },
      ops: {},
    });
    expect(error(at(app("scale", ref("position"), lit(Number.POSITIVE_INFINITY)), { domains: [evil, PtDomain] })).code).toBe("#NUM!");
  });

  it("LIST.KINDS: all, none and any of lists with one kind of boolean", () => {
    const sp = space.record({ A: { b: true }, B: { b: true }, C: { b: false }, D: { b: false } });
    const yes = each(axes.where(axes.all, ref("b")), ref("b"));
    const no = each(axes.where(axes.all, app("not", ref("b"))), ref("b"));
    const Bool = defineDomain({ name: "Bool", is: (u: unknown): u is boolean => typeof u === "boolean", ops: { not: { fn: (b: boolean): boolean => !b } } });
    const run = (e: Expr) => value(evaluate(e, { space: sp, origin: "A", domains: [Bool] }));
    expect([run(app("all", yes)), run(app("none", yes)), run(app("any", yes))]).toEqual([true, false, true]);
    expect([run(app("all", no)), run(app("none", no)), run(app("any", no))]).toEqual([false, true, false]);
  });

  it("LIST.EMPTY: reduce takes the op from the first domain that accepts the value and has the op", () => {
    const NoOps = defineDomain({ name: "PtNoOps", is: (u: unknown): u is Pt => u instanceof Pt, ops: {} });
    const sum = app("reduce", each(axes.all, ref("position")), lit("add"));
    expect(value(at(sum, { domains: [Num, NoOps, PtDomain] }))).toEqual(new Pt(3, 4));
    expect(error(at(sum, { domains: [NoOps] }))).toMatchObject({ kind: "unknown-op", op: "add" });
  });

  it("previewValue and describeType at their edges", () => {
    expect(previewValue(Number.NaN)).toBe("NaN");
    expect(previewValue(Number.POSITIVE_INFINITY)).toBe("Infinity");
    expect(previewValue(true)).toBe("true");
    expect(previewValue(null)).toBe("null");
    const sixty = "x".repeat(58);
    expect(previewValue(sixty)).toBe(JSON.stringify(sixty));
    expect(previewValue("x".repeat(59))).toHaveLength(60);
    expect(previewValue("x".repeat(59)).endsWith("...")).toBe(true);
    expect(describeType(Object.create(Object.create(null) as object) as object)).toBe("object");
  });

  it("formatTrace takes show from the first domain that accepts the value", () => {
    const Other = defineDomain({ name: "Other", is: (u: unknown): u is number => typeof u === "number", show: (): string => "number!", ops: {} });
    const NoShow = defineDomain({ name: "PtNoShow", is: (u: unknown): u is Pt => u instanceof Pt, ops: {} });
    const t = explain(lit(new Pt(1, 2)), { space: s, origin: "A" });
    expect(formatTrace(t, [Other, NoShow, PtDomain])).toBe("{\"x\":1,\"y\":2} @A = Pt(1, 2)\nresult = Pt(1, 2)\n");
  });

  it("formatTrace shows each read of an event, also for a trace that a host makes", () => {
    const reads = [
      { key: "A", path: ["x"], ok: true },
      { key: "B", path: [], ok: false },
    ];
    const t = { events: [{ path: [], tag: "ref" as const, label: "x", origin: "A", focus: "A", reads, result: ok(1) }], result: ok(1) };
    expect(formatTrace(t)).toBe("x @A [read A.x, no value at B.(record)] = 1\nresult = 1\n");
  });
});

describe("the contracts of the IR checks", () => {
  it("isMove and isExpr reject values that are close to valid", () => {
    expect(isMove(Object.assign(() => 1, { t: "other" }))).toBe(false);
    expect(isMove({ t: "offset", d: [1, 0.5] })).toBe(false);
    for (const u of [
      { tag: "ref", path: [1] },
      { tag: "ref", path: ["a"], at: [{ t: "other" }, { t: "jump" }] },
      { tag: "rec", fields: { a: lit(1), b: 1 } },
      { tag: "app", op: 1, args: [] },
      { tag: "app", op: "x", args: "nope" },
      { tag: "ext", kind: 1, data: 0 },
    ]) {
      expect(isExpr(u)).toBe(false);
    }
    expect(toPath("a..b")).toEqual(["a", "b"]);
    expect(toPath(".a.")).toEqual(["a"]);
    expect(isVexList({ kind: "vex.list", items: "x" })).toBe(false);
    expect(isVexList(null)).toBe(false);
    expect(isSome(none())).toBe(false);
  });
});

describe("the contracts of spaces and traversals", () => {
  it("the kinds and keyAt of each space, and index 0", () => {
    const arr = space.array([1, 2]);
    expect(arr.kind).toBe("array");
    expect(arr.keyAt([5])).toBeUndefined();
    expect(space.grid([[1, 2]]).keyAt([5, 5])).toBeUndefined();
    expect(value(applyMove(space.record({ A: 1, B: 2 }), { origin: "B", focus: "B" }, index(0)))).toBe("A");
    expect(error(applyMove(arr, { origin: "0", focus: "0" }, offset(-1))).message).toBe('the offset [-1] from "0" is outside the space');
    expect(error(applyMove(space.grid([[1]]), { origin: "0,0", focus: "0,0" }, offset(1, 1))).message).toBe('the offset [1,1] from "0,0" is outside the space');
  });

  it("SPACE.TREE: the messages of the constructor, and a parent of undefined is a root", () => {
    expect(() => space.tree({ a: 1 }, { zzz: "a" } as never)).toThrow('the tree has no key "zzz", but the parents name it');
    expect(() => space.tree({ a: 1 }, { a: "nope" as "a" })).toThrow('the parent "nope" of "a" is not a key of the tree');
    // A JavaScript caller can give undefined, which the type does not allow.
    const t = space.tree({ a: 1, b: 2 }, { a: undefined, b: "a" } as unknown as { b: "a" });
    expect(t.childrenOf?.("a")).toEqual(["b"]);
  });

  it("AXIS.TREE: a space needs both parentOf and childrenOf, and the other axis of a pair has one target", () => {
    const base = { kind: "tree" as const, keys: ["A"], has: (k: string): k is string => k === "A", get: () => ({}), coords: () => undefined, keyAt: () => undefined };
    const onlyParent: Space = { ...base, parentOf: () => undefined };
    const onlyChildren: Space = { ...base, childrenOf: () => [] };
    for (const sp of [onlyParent, onlyChildren]) {
      expect(error(axisTargets(sp, { origin: "A", focus: "A" }, { t: "children" })).kind).toBe("no-tree");
    }
    expect(value(axisTargets(space.record({ A: 1, B: 2 }), { origin: "A", focus: "A" }, { t: "other" }))).toEqual(["B"]);
  });

  it("monoids: all and any over lists of one kind, and the error of a map function", () => {
    const env = { domains: [] };
    const trues = traversal([{ key: "A", result: ok(true) }, { key: "B", result: ok(true) }], env);
    const falses = traversal([{ key: "A", result: ok(false) }, { key: "B", result: ok(false) }], env);
    expect(trues.fold(monoids.all, (x) => x)).toBe(true);
    expect(falses.fold(monoids.any, (x) => x)).toBe(false);
    const thrown = new Error("no");
    const mapped = traversal([{ key: "A", result: ok(1) }], env).map(() => {
      throw thrown;
    });
    expect(mapped.errors()[0]).toMatchObject({ kind: "threw", message: "the map function threw an exception", focus: "A", thrown });
  });
});

describe("the contracts of the builder", () => {
  const root = vex(PtDomain).over(s);

  it("the ops section has no symbols and no reserved names", () => {
    const ops = root.from("position")._ as unknown as Record<string | symbol, unknown>;
    expect(ops[Symbol.iterator]).toBeUndefined();
    for (const name of ["then", "catch", "finally", "toJSON", "valueOf", "toString", "constructor", "inspect", "asymmetricMatch", "$$typeof", "nodeType"]) {
      expect(ops[name]).toBeUndefined();
    }
    expect(ops["add"]).toBeTypeOf("function");
  });

  it("with(): the names of the variables have the depth of the scope, so a nested scope can use the same name", () => {
    const c = vex(Num)
      .over(s)
      .start(1)
      .with({ k: 2 }, (outer, { k }) => outer.with({ k }, (inner, { k: same }) => inner._.plus(same)));
    expect(c.program).toMatchObject({ tag: "let", bind: { k$0: lit(2) }, body: { tag: "let", bind: { k$1: { tag: "var", name: "k$0" } } } });
    expect(value(c.result("A"))).toBe(3);
  });

  it("start() with a field name reads the field at the focus", () => {
    expect(value(root.start("weight").result("B"))).toBe(3);
  });
});

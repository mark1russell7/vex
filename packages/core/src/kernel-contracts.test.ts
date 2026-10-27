/**
 * The contracts of the kernel tier: the exact messages of its errors, the parts of the world of Vex and the rare paths
 * of its machine. The property tests compare the codes of the tiers, so these tests check what they do not see.
 */
import { check, context, prepare, type EvalError } from "@mark1russell7/coeval";
import { describe, expect, it } from "vitest";
import { defineDomain } from "./domain.ts";
import { toDocument, fromDocument, type Envelope } from "./document.ts";
import { vexError, type ErrorCode, type ErrorKind } from "./errors.ts";
import { evaluate, MAX_NESTING, type CompileOptions, type ExtHandler } from "./evaluate.ts";
import { app, axes, call, each, ext, fn, fold, index, iterate, key, let_, lit, parent, ref, rec, v, type Expr } from "./ir.ts";
import { toVexError, VEX_WORLD, vexChecker, vexMachine, vexSelf } from "./kernel.ts";
import { isVexList } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import { sameVex } from "./same.ts";
import { space, type Space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

/** A value of a class with methods that give no value, NaN and a value that its domain does not accept as valid. */
class Thing {
  nothing(): undefined {
    return undefined;
  }
  nan(): number {
    return Number.NaN;
  }
  bad(): Thing {
    return new Thing();
  }
  twice(): number {
    return 2;
  }
}

const ThingDomain = defineDomain({ name: "Thing", is: (u: unknown): u is Thing => u instanceof Thing, valid: () => false, ops: { nothing: {}, nan: {}, bad: {} } });
const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: { add: { fn: (a: number, b: number): number => a + b }, gt: { fn: (a: number, b: number): boolean => a > b } },
});
const DOMAINS = [PtDomain, ThingDomain, Num];
const s = space.record({ A: { n: 1, p: new Pt(1, 2), t: "x", b: true, th: new Thing() }, B: { n: 2, p: new Pt(3, 4), t: "y", b: false }, N: null });
const ns = each(axes.all, ref("n"));
const none = each(axes.where(axes.all, lit(false)), lit(1));

/** This function gives the code, the message and the kind of the result of the kernel, or the value. */
function kernel(e: Expr | Envelope, origin = "A", opts: CompileOptions = { domains: DOMAINS }, at: Space = s): unknown {
  const r = kernelPlan(e, opts).evaluate({ space: at, origin });
  if (r.ok) return r.value;
  return [r.error.code, r.error.reason, (r.error.cause as { readonly kind?: string } | undefined)?.kind];
}

/** This function gives the value of a result, or the code of its error. */
function plain(r: { readonly ok: boolean; readonly value?: unknown; readonly error?: { readonly code: string } }): unknown {
  return r.ok ? r.value : r.error?.code;
}

/** This function gives the result of tier 1 and of the kernel, as codes or values, for a comparison. */
function both(e: Expr, opts: CompileOptions, at: Space = s, origin = "A"): readonly [unknown, unknown] {
  const k = kernelPlan(e, opts);
  return [plain(evaluate(e, { ...opts, space: at, origin })), plain(k.run({ space: at, origin }))];
}

/** This function gives the keys of a list of `sortBy` with some options (LIST.SORT.BY). */
const sortBy = (opts: unknown, list: Expr = each(axes.all, ref("n"))): Expr => app("keys", app("sortBy", list, lit(opts)));

describe("the messages of the kernel tier (EVAL.REFERENCE)", () => {
  const cases: readonly (readonly [Expr, string, unknown])[] = [
    [ref([]), "N", ["#N/A", 'the record at "N" has no value', "missing-field"]],
    [ref("n", [key(lit(1))]), "A", ["#VALUE!", "the key of a move is a number, not a text", undefined]],
    [ref("n", [index(lit("x"))]), "A", ["#VALUE!", "the position of a move is a string, not a number", undefined]],
    [each(axes.list(lit(1)), lit(1)), "A", ["#VALUE!", 'the axis "list" needs a list, not a number', "kind-mismatch"]],
    [iterate(3, { x: lit(0) }, { x: app("add", v("x"), lit(1)) }, v("x"), lit(1)), "A", ["#VALUE!", 'the test "until" of "iterate" gave a number, not a boolean', "kind-mismatch"]],
    [iterate(2, { x: lit(0) }, { x: app("add", v("x"), lit(1)) }, v("x"), app("gt", v("x"), lit(9))), "A", ["#NUM!", '"iterate" made its 2 steps, and its test "until" is not true', "limit"]],
    [call("f"), "A", ["#NAME?", 'the function "f" has no binding', "unbound"]],
    [let_({ f: lit(1) }, call("f")), "A", ["#VALUE!", 'the name "f" is a value, not a function', "kind-mismatch"]],
    [let_({ f: fn(["a"], v("a")) }, call("f")), "A", ["#VALUE!", 'the function "f" takes 1 arguments, not 0', "bad-expression"]],
    [app("add", ref("p"), lit(null)), "A", ["#VALUE!", 'argument 1 of "add" is a null, not a Pt', "not-instance"]],
    [app("scale", ref("p"), lit([1])), "A", ["#VALUE!", 'argument 1 of "scale" is a array, not a number', "kind-mismatch"]],
    [app("scale", ref("p"), ns), "A", ["#VALUE!", 'argument 1 of "scale" is a list, not a number', "kind-mismatch"]],
    [app("nope", lit({ a: 1 })), "A", ["#VALUE!", 'no domain accepts the receiver of "nope" (object)', "not-instance"]],
    [app("nope", ref("p")), "A", ["#NAME?", 'the domain of the receiver has no op "nope"', "unknown-op"]],
    [app("nope"), "A", ["#NAME?", 'there is no function "nope"', "unknown-op"]],
    [app("nothing", ref("th")), "A", ["#CALC!", '"nothing" gave no value', "undefined-result"]],
    [app("nan", ref("th")), "A", ["#NUM!", '"nan" gave NaN', "not-finite"]],
    [app("bad", ref("th")), "A", ["#NUM!", '"bad" gave a value that is not a valid Thing', "invalid-value"]],
    [app("sum", each(axes.all, ref("t"))), "A", ["#VALUE!", '"sum" needs numbers', "kind-mismatch"]],
    [app("any", ns), "A", ["#VALUE!", '"any" needs booleans', "kind-mismatch"]],
    [app("first", none), "A", ["#N/A", '"first" has no values to work with', "empty"]],
    [app("sortBy", each(axes.all, app("if", ref("b"), ref("n"), ref("t")))), "A", ["#VALUE!", '"sortBy" needs numbers without NaN or texts, all of one kind', "kind-mismatch"]],
    [app("sortBy", ns, lit({ by: 1 })), "A", ["#VALUE!", '"sortBy" needs an op name in the option "by"', "kind-mismatch"]],
    [app("sortBy", ns, lit({ by: "nope" })), "A", ["#NAME?", 'no domain gives "nope" for a number', "unknown-op"]],
    [app("sortBy", each(axes.all, ref("th")), lit({ by: "nan" })), "A", ["#NUM!", '"nan" gave NaN', "not-finite"]],
    [app("take", ns, lit(-1)), "A", ["#VALUE!", '"take" needs a whole number from 0', "kind-mismatch"]],
    [app("drop", ns, lit("1")), "A", ["#VALUE!", '"drop" needs a whole number from 0', "kind-mismatch"]],
    [app("nth", ns, lit(5)), "A", ["#N/A", '"nth" has no item at the position 5', "empty"]],
    [app("append", ns, lit(1)), "A", ["#VALUE!", '"append" needs a list as its second argument, not a number', "kind-mismatch"]],
    [app("flat", ns), "A", ["#VALUE!", '"flat" needs a list as the value of each item, but an item is a number', "kind-mismatch"]],
    [app("reduce", ns, lit(1)), "A", ["#VALUE!", '"reduce" needs an op name', "kind-mismatch"]],
    [app("reduce", none, lit("add"), lit({ domain: "Nope" })), "A", ["#NAME?", '"reduce" names the domain "Nope", but the program has no such domain', "unknown-op"]],
    [app("reduce", none, lit("add"), lit({ domain: (): number => 1 })), "A", ["#NAME?", '"reduce" names the domain ?, but the program has no such domain', "unknown-op"]],
    [app("reduce", none, lit("dot")), "A", ["#N/A", '"reduce" with "dot" has no values, and no one identity', "empty"]],
    [app("reduce", each(axes.all, ref("t")), lit("nope")), "A", ["#NAME?", 'no domain gives "nope" for a string', "unknown-op"]],
    [app("if", lit(true)), "A", ["#VALUE!", '"if" needs argument 2', "bad-expression"]],
    [app("if", lit(1), lit(1), lit(2)), "A", ["#VALUE!", 'argument 1 of "if" is a number, not a boolean', "kind-mismatch"]],
    [app("and"), "A", ["#VALUE!", '"and" needs at least 1 argument', "bad-expression"]],
    [app("or", lit(false), lit(2)), "A", ["#VALUE!", 'argument 2 of "or" is a number, not a boolean', "kind-mismatch"]],
    [app("ifError"), "A", ["#VALUE!", '"ifError" needs argument 2', "bad-expression"]],
    [app("ifError", ref("zz")), "A", ["#VALUE!", '"ifError" needs argument 2', "bad-expression"]],
    [ext("number", 1), "A", ["#NAME?", 'no handler for the extension kind "number"', "unknown-op"]],
    [rec({ a: ref("zz"), b: ref("yy") }), "A", ["#ARGS", "2 arguments failed", "args"]],
  ];

  it.each(cases)("EVAL.REFERENCE CALL.RESULT: the kernel gives the message of the rule (%#)", (e, origin, expected) => {
    expect(kernel(e, origin)).toEqual(expected);
  });

  it("REF.MISSING: a key of the space without a record has no value at the focus", () => {
    expect(kernel(ref([]), "U", {}, space.record({ U: undefined }))).toEqual(["#N/A", 'the record at "U" has no value', "missing-field"]);
  });

  it("AXIS.WHERE: a test of where that is not a boolean gives an error item with its message", () => {
    const errors = kernel(app("errors", each(axes.where(axes.all, lit(1)), lit(1))));
    expect(errors).toEqual(["A", "B", "N"].map(() => vexError("kind-mismatch", 'the test of "where" gave a number, not a boolean')));
  });

  it("NAV.SEQUENCE REF.FOCUS: a move that does not start at a position, and a context without a position, give #REF! with a reason", () => {
    const machine = vexMachine();
    const afterField = { type: "ref", value: ["self", "n", { type: ["moves", "parent"], value: null }] };
    expect(prepare(machine, afterField).evaluate(context({ self: vexSelf(s, "A") }))).toMatchObject({ ok: false, error: { code: "#REF!", reason: "a move starts at a key of a space" } });
    const loop = { type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: 1 } };
    expect(prepare(machine, loop).evaluate(context({}))).toMatchObject({ ok: false, error: { code: "#REF!", reason: "the context has no key of a space" } });
  });

  it("DOC.LITERAL: a literal that its domains cannot decode gives #VALUE!, and the position reads a missing record as nothing", () => {
    const literal = { type: "lit", value: { $vex: "domain", domain: "Nope", value: 1 } };
    expect(prepare(vexMachine({ domains: DOMAINS }), literal).evaluate(context({ self: vexSelf(s, "A") }))).toMatchObject({ ok: false, error: { code: "#VALUE!" } });
    const empty = vexSelf(s, "N") as unknown as { resolve(keys: readonly string[]): unknown };
    expect(empty.resolve([])).toBeUndefined();
  });
});

describe("the errors of the kernel and of Vex (EVAL.REFERENCE)", () => {
  it("EVAL.REFERENCE: each code of the kernel gives the kind of Vex for it", () => {
    const kinds: readonly (readonly [ErrorCode, ErrorKind])[] = [
      ["#REF!", "unknown-key"],
      ["#N/A", "missing-field"],
      ["#VALUE!", "kind-mismatch"],
      ["#NAME?", "unbound"],
      ["#NUM!", "not-finite"],
      ["#CALC!", "threw"],
      ["#ARGS", "args"],
      ["#CYCLE!", "cycle"],
      ["#DEPTH!", "depth"],
    ];
    for (const [code, kind] of kinds) expect(toVexError({ code, reason: "r" })).toEqual(vexError(kind, "r"));
    // Without a cause, the error has no thrown value.
    expect("thrown" in toVexError({ code: "#KIND?", reason: "r" })).toBe(false);
  });

  it("EVAL.REFERENCE: a cause without the code, the kind, the message or the path of a Vex error is a thrown value", () => {
    const causes = [
      { kind: "missing-field", message: "m", path: [] },
      { code: "#N/A", message: "m", path: [] },
      { code: "#N/A", kind: "missing-field", path: [] },
      { code: "#N/A", kind: "missing-field", message: "m" },
      null,
    ];
    for (const cause of causes) {
      const failure: EvalError = { code: "#CALC!", reason: "r", cause };
      expect(toVexError(failure)).toMatchObject({ code: "#CALC!", kind: "threw", message: "r", thrown: cause });
    }
  });
});

/** This function gives no value: it calls itself with no end, and fills the call stack of the engine. */
function forever(): unknown {
  return forever();
}

/** This function calls itself with no end, and fills the call stack of the engine. */
function down(n: number): number {
  return down(n + 1) + 1;
}

/** This free function fills the call stack of the engine. */
function deep(): number {
  return down(0);
}

/** This extension handler gives the origin of its position and its path. */
const where: ExtHandler = (_data, ctx) => ({ ok: true, value: [ctx.position.origin, ctx.path] });

/** This function gives the document of a program. */
function docOf(e: Expr): Envelope {
  return value(toDocument(e, [PtDomain]));
}

/** This function gives each kind of the world with its path, also the kinds of the groups and the fallbacks. */
function kindsOf(kinds: Readonly<Record<string, unknown>>, at: string): (readonly [string, { readonly summary?: string }])[] {
  return Object.entries(kinds).flatMap(([name, k]) => {
    const kind = k as { readonly kinds?: Readonly<Record<string, unknown>>; readonly fallback?: { readonly summary?: string }; readonly summary?: string };
    if (kind.kinds === undefined) return [[`${at}${name}`, kind] as const];
    return [...kindsOf(kind.kinds, `${at}${name}.`), ...(kind.fallback === undefined ? [] : [[`${at}${name}.*`, kind.fallback] as const])];
  });
}

/** This function gives the document of a program without one field of its construct. */
function without(e: Expr, field: string): unknown {
  const d = docOf(e) as { readonly type: unknown; readonly value: Readonly<Record<string, unknown>> };
  const { [field]: _gone, ...rest } = d.value;
  return { type: d.type, value: rest };
}

describe("the rare paths of the machine (EVAL.REFERENCE)", () => {
  const fns = { deep };

  it("EVAL.DEPTH: ifError, #ARGS and a list op do not hide a full call stack in the kernel", () => {
    for (const e of [app("ifError", app("deep"), lit(1)), rec({ a: app("deep"), b: app("deep") }), app("count", each(axes.all, app("deep"))), app("count", each(axes.all, app("deep")), lit({ strict: true }))]) {
      expect(both(e, { fns })).toEqual(["#DEPTH!", "#DEPTH!"]);
    }
  });

  it("LIST.SORT: sortBy sorts numbers and texts that are not in order, and equal values keep their order", () => {
    const rows = space.array([{ n: 3, t: "c" }, { n: 1, t: "a" }, { n: 2, t: "b" }, { n: 1, t: "z" }, { n: 3, t: "a" }]);
    const keysOf = (e: Expr): unknown => {
      const r = kernelPlan(e).run({ space: rows, origin: "0" });
      return r.ok && isVexList(r.value) ? r.value.items.map((item) => item.key) : r;
    };
    expect(keysOf(app("sortBy", each(axes.all, ref("n"))))).toEqual(["1", "3", "2", "0", "4"]);
    expect(keysOf(app("sortBy", each(axes.all, ref("t"))))).toEqual(["1", "4", "2", "0", "3"]);
    expect(both(app("values", app("sortBy", each(axes.all, ref("n")))), {}, rows, "0")).toEqual([
      [1, 1, 2, 3, 3],
      [1, 1, 2, 3, 3],
    ]);
  });

  it("LIST.SORT.BY: the kernel sorts by the op of the option by, as tier 1 does", () => {
    const Neg = defineDomain({ name: "Neg", is: (u: unknown): u is number => typeof u === "number", ops: { neg: { fn: (a: number): number => -a }, odd: { fn: (a: number): boolean => a % 2 === 1 } } });
    const AllNumbers = defineDomain({ name: "AllNumbers", is: (u: unknown): u is number => typeof u === "number", ops: {} });
    // A domain of texts with the op neg does not accept a number, so its op does not apply.
    const Texts = defineDomain({ name: "Texts", is: (u: unknown): u is string => typeof u === "string", ops: { neg: { fn: (): string => "x" } } });
    const rows = space.array([{ n: 3 }, { n: 1 }, { n: 2 }, { n: 1 }, {}]);
    const run = (e: Expr): readonly [unknown, unknown] => both(e, { domains: [Texts, AllNumbers, Neg] }, rows, "0");
    expect(run(sortBy({ by: "neg" }))).toEqual([
      ["0", "2", "1", "3"],
      ["0", "2", "1", "3"],
    ]);
    expect(run(sortBy({}))).toEqual([
      ["1", "3", "2", "0"],
      ["1", "3", "2", "0"],
    ]);
    expect(run(sortBy({ by: "neg", strict: true }))).toEqual(["#N/A", "#N/A"]);
    expect(run(sortBy({ by: "odd" }))).toEqual(["#VALUE!", "#VALUE!"]);
    expect(run(sortBy({ by: "nope" }, each(axes.where(axes.all, lit(false)), ref("n"))))).toEqual([[], []]);
  });

  it("LIST.REDUCE CALL.METHOD: reduce takes the first domain that has the op, after a domain of the value without it", () => {
    const AllNumbers = defineDomain({ name: "AllNumbers", is: (u: unknown): u is number => typeof u === "number", ops: {}, methods: "all" });
    expect(both(app("reduce", ns, lit("add")), { domains: [AllNumbers, Num] })).toEqual([3, 3]);
  });

  it("CALL.FREE CALL.UNKNOWN-OP: a call without arguments has no receiver, also for a domain that accepts each value", () => {
    const Any = defineDomain({ name: "Any", is: (_u: unknown): _u is unknown => true, ops: { zero: { fn: (): number => 0 } } });
    expect(both(app("zero"), { domains: [Any] })).toEqual(["#NAME?", "#NAME?"]);
  });

  it("CALL.METHOD CALL.RECEIVER: a method of a value is not an op of a domain without methods all, and a test that throws rejects the value", () => {
    expect(both(app("twice", ref("th")), { domains: DOMAINS })).toEqual(["#NAME?", "#NAME?"]);
    const Throws = defineDomain({ name: "Throws", is: (u: unknown): u is Thing => (u instanceof Thing ? (() => { throw new Error("is"); })() : false), ops: { twice: {} } });
    expect(both(app("twice", ref("th")), { domains: [Throws] })).toEqual(["#VALUE!", "#VALUE!"]);
  });

  it("FN.CALL: the body of a function reads the names of the place of its binding in the kernel", () => {
    const plusY = fn(["x"], app("add", v("x"), v("y")));
    expect(both(let_({ y: lit(1) }, let_({ plusY }, let_({ y: lit(100) }, call("plusY", lit(5))))), { domains: [Num] })).toEqual([6, 6]);
  });

  it("LOOP.NAMES LET.UNBOUND: a loop binds only the names of init", () => {
    expect(both(iterate(1, { x: lit(0) }, { x: lit(1) }, v("S")), { domains: [Num] })).toEqual(["#NAME?", "#NAME?"]);
  });

  it("LOOP.NAMES: a name of init that the steps do not change stays for each step", () => {
    const e = fold(axes.all, { s: lit(0), c: lit(5) }, { s: app("add", v("s"), v("c")) }, v("s"));
    expect(both(e, { domains: [Num] })).toEqual([15, 15]);
    const loop = iterate(4, { x: lit(0), c: lit(2) }, { x: app("add", v("x"), v("c")) }, v("x"));
    expect(both(loop, { domains: [Num] })).toEqual([8, 8]);
  });

  it("REF.PATH: a value of a space with the shape of a document stays a value", () => {
    const shaped = { type: "ref", value: ["self", "n"] };
    const data = space.record({ A: { e: shaped, n: 1 } });
    expect(kernel(ref("e"), "A", {}, data)).toBe(shaped);
  });

  it("EVAL.LOCATION: an extension handler of the kernel gets the position and an empty path", () => {
    expect(kernel(ext("where", null), "B", { extensions: { where } })).toEqual(["B", []]);
  });
});

describe("the world of Vex (DOC.CHECK)", () => {
  it("DOC.CHECK: each kind of the world has a summary of one or more sentences", () => {
    const kinds = kindsOf(VEX_WORLD.kinds, "");
    expect(kinds.length).toBe(33);
    for (const [name, kind] of kinds) expect([name, /^[A-Z].*\.$/.test(kind.summary ?? "")]).toEqual([name, true]);
  });

  it("DOC.CONSTRUCT DOC.CHECK: a construct without a necessary field, or with a field that it does not have, is not valid", () => {
    const programs: readonly (readonly [Expr, string])[] = [
      [let_({ a: lit(1) }, v("a")), "body"],
      [let_({ a: fn(["k"], v("k")) }, call("a", lit(1))), "bind"],
      [call("f", lit(1)), "args"],
      [each(axes.all, lit(1)), "body"],
      [fold(axes.all, { s: lit(0) }, { s: lit(1) }, v("s")), "step"],
      [iterate(1, { x: lit(0) }, { x: lit(1) }, v("x")), "limit"],
    ];
    for (const [e, field] of programs) expect([field, fromDocument(without(e, field)).ok]).toEqual([field, false]);
    const fnDoc = { type: "let", value: { bind: { f: { type: "fn", value: { body: 1 } } }, body: 1 } };
    expect(fromDocument(fnDoc).ok).toBe(false);
    const extra = { type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: 1, extra: 1 } };
    expect(fromDocument(extra).ok).toBe(false);
  });

  it("FN.BIND DOC.ADDRESS: a binding is a term or a function, and an address is a reference", () => {
    const axisBinding = { type: "let", value: { bind: { a: { type: ["axes", "all"], value: {} } }, body: 1 } };
    expect(fromDocument(axisBinding).ok).toBe(false);
    const literalAddress = { type: "each", value: { axis: { type: ["axes", "all"], value: {} }, body: 1, at: { type: "lit", value: 1 } } };
    expect(fromDocument(literalAddress)).toMatchObject({ ok: false, error: { message: expect.stringContaining('"/value/at"') as unknown } });
  });

  it("DOC.CHECK: the code of the machine of the checks stops with #VALUE!", () => {
    const code = (vexChecker().evaluators ?? {})["vex.each"] as () => unknown;
    let caught: unknown;
    try {
      code();
    } catch (thrown) {
      caught = thrown;
    }
    expect(caught).toMatchObject({ error: { code: "#VALUE!", reason: "the machine of the checks evaluates nothing", cause: { kind: "bad-expression" } } });
  });

  it("DOC.CHECK FN.CALL: the parameters of a function and the names of a let are bound in the body for the check", () => {
    expect(check(vexMachine(), docOf(let_({ f: fn(["k"], v("k")) }, call("f", lit(1)))), { declaredType: "lit" })).toEqual([]);
    expect(check(vexMachine(), docOf(let_({ a: lit(1) }, v("a"))), { declaredType: "lit" })).toEqual([]);
  });
});

/** A literal that no domain decodes. The reader stops at its location. */
const UNKNOWN = { $vex: "domain", domain: "Nope", value: 1 };
const ALL = { type: ["axes", "all"], value: {} };
/** This function gives an axis list with the literal that no domain decodes. */
const listOfUnknown = (): unknown => ({ type: ["axes", "list"], value: { list: UNKNOWN } });

/** This function gives a document with a getter of the value of a literal. */
function withGetter(get: () => unknown): unknown {
  return { type: ["ops", "f"], value: [Object.defineProperty({ type: "lit" }, "value", { enumerable: true, get })] };
}

/** This function throws an exception. */
function threw(): never {
  throw new Error("getter");
}

describe("the reader of the documents (DOC.ERROR)", () => {
  it("DOC.ERROR DOC.CONSTRUCT DOC.AXIS: the reader gives the location of a literal that it cannot decode, in each position", () => {
    const cases: readonly (readonly [unknown, string])[] = [
      [{ type: "call", value: { fn: { type: "ref", value: ["names", "f"] }, args: [1, UNKNOWN] } }, "/value/args/1"],
      [{ type: "each", value: { axis: ALL, body: UNKNOWN } }, "/value/body"],
      [{ type: "fold", value: { axis: { type: ["axes", "where"], value: { axis: ALL, test: UNKNOWN } }, init: {}, step: {}, result: 1 } }, "/value/axis/value/test"],
      [{ type: "fold", value: { axis: ALL, init: {}, step: {}, result: UNKNOWN } }, "/value/result"],
      [{ type: "fold", value: { axis: ALL, init: {}, step: {}, result: 1, at: { type: "ref", value: ["self", { type: ["moves", "key"], value: UNKNOWN }] } } }, "/value/at/value/1/value"],
      [{ type: "iterate", value: { limit: 1, init: {}, step: {}, until: UNKNOWN, result: 1 } }, "/value/until"],
      [{ type: "iterate", value: { limit: 1, init: {}, step: {}, result: UNKNOWN } }, "/value/result"],
      [{ type: "iterate", value: { limit: 1, init: { a: UNKNOWN }, step: {}, result: 1 } }, "/value/init/a"],
      [{ type: "iterate", value: { limit: 1, init: { a: 0 }, step: { a: UNKNOWN }, result: 1 } }, "/value/step/a"],
      [{ type: "let", value: { bind: { f: { type: "fn", value: { params: [], body: UNKNOWN } } }, body: 1 } }, "/value/bind/f/value/body"],
      [{ type: "each", value: { axis: listOfUnknown(), body: 1 } }, "/value/axis/value/list"],
      [{ type: "each", value: { axis: { type: ["axes", "reverse"], value: { axis: listOfUnknown() } }, body: 1 } }, "/value/axis/value/axis/value/list"],
      [{ type: "each", value: { axis: { type: ["axes", "where"], value: { axis: listOfUnknown(), test: true } }, body: 1 } }, "/value/axis/value/axis/value/list"],
    ];
    for (const [d, pointer] of cases) {
      const message = `the document is not valid at "${pointer}": no domain "Nope" decodes a literal`;
      expect([pointer, error(fromDocument(d))]).toEqual([pointer, { code: "#VALUE!", kind: "bad-expression", message, path: [] }]);
    }
  });

  it("DOC.CALL DOC.ERROR: the function of a call is a reference to a name that is a text", () => {
    const d = { type: "call", value: { fn: { type: "ref", value: ["names", 1] }, args: [] } };
    expect(error(fromDocument(d)).message).toBe('the document is not valid at "/value/fn": the function of a call is a reference to a name: { "type": "ref", "value": ["names", name] }');
  });

  it("DOC.ERROR EVAL.DEPTH: a getter that throws or fills the call stack in the check, and a decoder that fills it, give their errors", () => {
    expect(error(fromDocument(withGetter(threw)))).toMatchObject({ code: "#CALC!", kind: "threw", message: "the check of the document threw an exception" });
    const full = error(fromDocument(withGetter(forever)));
    expect(full).toMatchObject({ code: "#DEPTH!", kind: "depth", message: "the document is too deep for the call stack of the engine" });
    expect(full.thrown).toBeInstanceOf(RangeError);
    const Looping = { ...PtDomain, decode: forever };
    const decoded = error(fromDocument({ type: "lit", value: { $vex: "domain", domain: "Pt", value: [1, 2] } }, [Looping]));
    expect(decoded).toMatchObject({ code: "#DEPTH!", kind: "depth", message: "the document is too deep for the call stack of the engine" });
  });
});

/** This function gives the names of the fields of the document of an expression, in their order. */
function fieldsOf(e: Expr): readonly string[] {
  return Object.keys(docOf(e).value as object);
}

describe("the writer of the documents (DOC.TERM, DOC.CONSTRUCT)", () => {
  it("DOC.CONSTRUCT: the fields of each and fold come in the order of their contracts", () => {
    expect(fieldsOf(each(axes.all, lit(1)))).toEqual(["axis", "body"]);
    expect(fieldsOf(each(axes.all, lit(1), [parent]))).toEqual(["axis", "body", "at"]);
    expect(fieldsOf(fold(axes.all, { s: lit(0) }, { s: lit(1) }, v("s")))).toEqual(["axis", "init", "step", "result"]);
    expect(fieldsOf(fold(axes.all, { s: lit(0) }, { s: lit(1) }, v("s"), [parent]))).toEqual(["axis", "init", "step", "result", "at"]);
  });

  it("DOC.TERM: a record of names in a document is plain data, so each name is writable, enumerable and configurable", () => {
    const d = docOf(let_({ a: lit(1) }, v("a"))).value as { readonly bind: object };
    expect(Object.getOwnPropertyDescriptor(d.bind, "a")).toEqual({ value: 1, writable: true, enumerable: true, configurable: true });
  });
});

describe("the plan of the kernel (EVAL.REFERENCE, EVAL.AGREE)", () => {
  it("EVAL.NESTING: the kernel tier evaluates an expression at the limit of the nesting", () => {
    let e: Expr = lit(1);
    for (let i = 1; i < MAX_NESTING; i++) e = app("add", e, lit(1));
    expect(kernel(e, "A", { domains: [Num] })).toBe(MAX_NESTING);
  });

  it("DOC.LITERAL: the document of a plan has the JSON form of a literal that has one", () => {
    expect(kernelPlan(lit(new Pt(1, 2)), { domains: [PtDomain] }).doc).toEqual({ type: "lit", value: { $vex: "domain", domain: "Pt", value: [1, 2] } });
  });

  it("EVAL.ORIGIN EVAL.AGREE: an origin outside the space gives its error at its position, and agree gives the reason of a tier that differs", () => {
    const plan = kernelPlan(lit(1));
    const outside = { space: s, origin: "Z" };
    expect(plan.run(outside)).toEqual({ ok: false, error: { code: "#REF!", kind: "unknown-key", message: 'the space has no key "Z"', path: [], origin: "Z", focus: "Z" } });
    const first = plan.evaluate(outside);
    expect(plan.agree(outside)).toEqual({ ok: true, result: first, effects: [] });
    const reason = "The plan does not evaluate the program, and the tier gives another result.";
    expect(plan.agree(outside, () => ({ ok: true, value: 1 }))).toEqual({ ok: false, tier: "other", plan: first, other: { ok: true, value: 1 }, reason });
  });
});

/** A class with the fields of `Pt`, but another prototype. */
class Other {
  readonly x = 1;
  readonly y = 2;
}

describe("the comparison of agree (EVAL.AGREE)", () => {
  it("EVAL.AGREE: two Vex errors agree by their code, and two values of one class by their fields", () => {
    const [a, b, c] = [vexError("unknown-key", "a", { origin: "A" }), vexError("unknown-key", "b"), vexError("missing-field", "a")];
    expect([sameVex(a, b), sameVex(a, c)]).toEqual([true, false]);
    expect([sameVex(new Pt(1, 2), new Pt(1, 2)), sameVex(new Pt(1, 2), new Pt(1, 3)), sameVex(new Pt(1, 2), new Other())]).toEqual([true, false, false]);
  });

  it("EVAL.AGREE: the rules of the kernel compare each other pair, also a value with only some fields of a Vex error", () => {
    const pairs: readonly (readonly [unknown, unknown])[] = [
      [vexError("unknown-key", "a"), { code: "#REF!" }],
      [{ code: "#REF!" }, vexError("unknown-key", "a")],
      [new Pt(1, 2), { x: 1, y: 2 }],
      [{ x: 1, y: 2 }, new Pt(1, 2)],
      [[1], [1]],
      [null, null],
      [Object.create(null), Object.create(null)],
      [1, 1],
      [forever, forever],
    ];
    for (const [a, b] of pairs) expect(sameVex(a, b)).toBeUndefined();
  });
});

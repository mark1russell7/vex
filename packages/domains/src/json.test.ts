import { app, evaluate, lit, space, vexList, type AnyDomain, type Result } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { LocalDate } from "./date.ts";
import { JsonDomain, type JsonValue } from "./json.ts";
import { BoolDomain, NumDomain } from "./scalars.ts";
import { TextDomain } from "./text.ts";
import { Vec2 } from "./vec2.ts";

const ONE = space.record({ A: {} });
const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain, JsonDomain];
const run = (self: unknown, op: string, ...args: readonly unknown[]): Result<unknown> => evaluate(app(op, lit(self), ...args.map((a) => lit(a))), { space: ONE, origin: "A", domains: DOMAINS });
const value = (r: Result<unknown>): unknown => (r.ok ? r.value : `${r.error.code} ${r.error.kind}`);
/** The message of the exception of an op that threw, or the value of the op. */
const thrown = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.thrown instanceof Error ? r.error.thrown.message : `${r.error.code} ${r.error.kind}`);
const { kind, kinds, fields, field, leaves } = JsonDomain.ops;

describe("the domain of JSON values (JsonDomain)", () => {
  it("JSON.IS: accepts texts, finite numbers, booleans, arrays and plain objects, and nothing else", () => {
    const plain = Object.assign(Object.create(null) as object, { a: 1 });
    expect(["", "x", 0, -2.5, true, false, [], [1, null], {}, { a: null }, plain].map((u) => JsonDomain.is(u))).toEqual(Array.from({ length: 11 }, () => true));
    const no = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, new Vec2(1, 2), LocalDate.of(2026, 10, 27), new Map(), new Date(0), vexList([]), (): number => 1, 1n, Symbol("s")];
    expect(no.map((u) => JsonDomain.is(u))).toEqual(no.map(() => false));
    // A list of Vex is a plain object with the fields kind and items, but it is not a JSON value.
    const lists = [{ kind: "vex.list", items: [] }, { kind: "vex.list", items: {} }, { kind: "vex.list" }, { kind: "list", items: [] }, { items: [] }];
    expect(lists.map((u) => JsonDomain.is(u))).toEqual([false, true, true, true, true]);
  });

  it("JSON.KIND: gives the kind of a value, also through the interpreter after the scalar domains", () => {
    const values: readonly JsonValue[] = ["x", 2, true, [1], {}];
    expect(values.map((u) => kind.fn(u))).toEqual(["string", "number", "boolean", "array", "object"]);
    expect(["x", 2, false, [], { a: 1 }].map((u) => value(run(u, "kind")))).toEqual(["string", "number", "boolean", "array", "object"]);
    // No domain accepts null, so its kind is an error, and ifError can catch it.
    expect(value(run(null, "kind"))).toBe("#VALUE! not-instance");
  });

  it("JSON.KINDS: gives the kind of each item by position, with null for null, undefined and a hole, and keeps the repeats", () => {
    // The position 1 is a hole.
    const sparse: unknown[] = [];
    sparse.length = 9;
    const holes: readonly unknown[] = Object.assign(sparse, { 0: 1, 2: "x", 3: null, 4: undefined, 5: [2], 6: { a: 1 }, 7: true, 8: 1 });
    expect(1 in holes).toBe(false);
    expect(kinds.fn(holes)).toEqual(["number", "null", "string", "null", "null", "array", "object", "boolean", "number"]);
    expect(kinds.fn([])).toEqual([]);
    expect(kinds.fn(Object.assign(Object.create(null) as object, { z: [] }) as JsonValue)).toEqual(["array"]);
    // For an object, the kinds have the order of its fields.
    expect(kinds.fn({ b: "x", a: null, c: { d: 1 }, n: -0 })).toEqual(["string", "null", "object", "number"]);
    expect(value(run({ a: [1], b: 2 }, "kinds"))).toEqual(["array", "number"]);
    // The result is an array, so the list ops read it (LIST.ARRAY): count and nth do not go to JsonDomain.
    expect(value(run(["x", "y"], "count"))).toBe(2);
    expect(value(evaluate(app("nth", app("kinds", lit({ a: 1, b: [] })), lit(1)), { space: ONE, origin: "A", domains: DOMAINS }))).toBe("array");
  });

  it("JSON.KINDS: an item that is not JSON, or a receiver that is not an array or an object, throws", () => {
    expect(() => kinds.fn([1, new Vec2(1, 2)])).toThrow('"kinds" found a value that is not JSON at the position 1');
    expect(() => kinds.fn({ a: 1, b: 2, f: (): number => 1 })).toThrow('"kinds" found a value that is not JSON at the position 2');
    for (const bad of [Number.NaN, 1n, Symbol("s"), new Map()]) expect(() => kinds.fn([bad])).toThrow('"kinds" found a value that is not JSON at the position 0');
    expect(() => kinds.fn("ab")).toThrow('"kinds" needs an array or an object, not a string');
    expect(() => kinds.fn(2)).toThrow('"kinds" needs an array or an object, not a number');
    expect(thrown(run("ab", "kinds"))).toBe('"kinds" needs an array or an object, not a string');
    expect(value(run(true, "kinds"))).toBe("#CALC! threw");
  });

  it("JSON.FIELDS: gives the keys in the order of Object.keys, also the keys __proto__ and constructor", () => {
    const parsed = JSON.parse('{"b":1,"__proto__":{"x":1},"constructor":2,"1":3,"a":null}') as Readonly<Record<string, unknown>>;
    expect(fields.fn(parsed)).toEqual(["1", "b", "__proto__", "constructor", "a"]);
    expect(fields.fn({})).toEqual([]);
    expect(value(run({ y: 1, x: [] }, "fields"))).toEqual(["y", "x"]);
    expect(() => fields.fn([1])).toThrow('"fields" needs an object, not an array');
    expect(() => fields.fn("ab")).toThrow('"fields" needs an object, not a string');
    expect(thrown(run(3, "fields"))).toBe('"fields" needs an object, not a number');
    expect(value(run([], "fields"))).toBe("#CALC! threw");
  });

  it("JSON.FIELD: gives an own field, and a missing key, a null field, a key that is not text or a wrong receiver throws", () => {
    const parsed = JSON.parse('{"__proto__":{"x":1},"constructor":2,"n":null,"z":0,"f":false,"s":""}') as Readonly<Record<string, unknown>>;
    expect(field.fn(parsed, "__proto__")).toEqual({ x: 1 });
    expect([field.fn(parsed, "constructor"), field.fn(parsed, "z"), field.fn(parsed, "f"), field.fn(parsed, "s")]).toEqual([2, 0, false, ""]);
    expect(value(run({ a: { b: [1] } }, "field", "a"))).toEqual({ b: [1] });
    // An inherited member is not a field.
    expect(() => field.fn({}, "constructor")).toThrow('the object has no field "constructor"');
    expect(() => field.fn({}, "toString")).toThrow('the object has no field "toString"');
    expect(() => field.fn(parsed, "n")).toThrow('the field "n" is null');
    expect(() => field.fn({ u: undefined }, "u")).toThrow('the field "u" is null');
    expect(() => field.fn({ a: 1 }, 1)).toThrow('"field" needs a text key, not a number');
    expect(() => field.fn([1], "0")).toThrow('"field" needs an object, not an array');
    expect(() => field.fn("ab", "length")).toThrow('"field" needs an object, not a string');
    // Through the interpreter, each of them gives #CALC! with the message of the exception.
    expect(thrown(run({ a: 1 }, "field", "b"))).toBe('the object has no field "b"');
    expect(thrown(run({ a: null }, "field", "a"))).toBe('the field "a" is null');
    expect(thrown(run({ a: 1 }, "field", true))).toBe('"field" needs a text key, not a boolean');
    expect(thrown(run(7, "field", "a"))).toBe('"field" needs an object, not a number');
    expect(value(run({ a: 1 }, "field", "b"))).toBe("#CALC! threw");
  });

  it("JSON.LEAVES: gives a leaf for each field in the order of a walk, and goes into an object with fields under the depth", () => {
    const doc = { _id: "a", n: 1, tags: ["x", 2], o: { p: true, q: { r: { s: 1 } }, e: {} }, z: null, u: undefined };
    expect(leaves.fn(doc, 3)).toEqual([
      { path: "_id", kind: "string", value: "a" },
      { path: "n", kind: "number", value: 1 },
      { path: "tags", kind: "array", value: ["x", 2] },
      { path: "o.p", kind: "boolean", value: true },
      // The path o.q.r has 3 keys, so the walk does not go into its object.
      { path: "o.q.r", kind: "object", value: { s: 1 } },
      { path: "o.e", kind: "object", value: {} },
      { path: "z", kind: "null" },
      { path: "u", kind: "null" },
    ]);
    // A leaf of the kind null has no field value.
    expect(Object.keys(leaves.fn({ z: null }, 1)[0] ?? {})).toEqual(["path", "kind"]);
    expect(leaves.fn(doc, 1).map((l) => l.path)).toEqual(["_id", "n", "tags", "o", "z", "u"]);
    expect(leaves.fn(doc, 2).map((l) => l.path)).toEqual(["_id", "n", "tags", "o.p", "o.q", "o.e", "z", "u"]);
    expect(leaves.fn(doc, 4).map((l) => l.path)).toEqual(["_id", "n", "tags", "o.p", "o.q.r.s", "o.e", "z", "u"]);
    expect(leaves.fn(doc, 100).map((l) => l.path)).toEqual(["_id", "n", "tags", "o.p", "o.q.r.s", "o.e", "z", "u"]);
    expect(leaves.fn({}, 3)).toEqual([]);
    // The result and each leaf are frozen.
    const out = leaves.fn(doc, 3);
    expect([Object.isFrozen(out), out.every((l) => Object.isFrozen(l))]).toEqual([true, true]);
  });

  it("JSON.LEAVES: reads own fields only, with the keys __proto__ and constructor, and after an empty path the path is the key alone", () => {
    const parsed = JSON.parse('{"b":{"1":2,"a":[null]},"__proto__":{"p":1},"":{"q":{"":3}},"constructor":"c"}') as JsonValue;
    expect(leaves.fn(parsed, 3)).toEqual([
      { path: "b.1", kind: "number", value: 2 },
      { path: "b.a", kind: "array", value: [null] },
      { path: "__proto__.p", kind: "number", value: 1 },
      // After the empty path of the key "", the path is the key q alone. The empty key after q adds the dot.
      { path: "q.", kind: "number", value: 3 },
      { path: "constructor", kind: "string", value: "c" },
    ]);
    expect(leaves.fn(Object.assign(Object.create(null) as object, { k: Object.assign(Object.create(null) as object, { m: 0 }) }) as JsonValue, 2)).toEqual([{ path: "k.m", kind: "number", value: 0 }]);
    // An inherited field is not a field.
    expect(leaves.fn(Object.create({ inherited: 1 }) as JsonValue, 3)).toEqual([]);
  });

  it("JSON.LEAVES: a receiver that is not an object, a bad depth or a value that is not JSON throws, and the interpreter gives #CALC!", () => {
    expect(() => leaves.fn([1], 3)).toThrow('"leaves" needs an object, not an array');
    expect(() => leaves.fn("ab", 3)).toThrow('"leaves" needs an object, not a string');
    for (const d of [0, -1, 1.5, 101, Number.NaN]) expect(() => leaves.fn({ a: 1 }, d)).toThrow(`"leaves" needs a depth that is a whole number from 1 to 100, not ${String(d)}`);
    expect(leaves.fn({ a: 1 }, 1)).toEqual([{ path: "a", kind: "number", value: 1 }]);
    for (const bad of [Number.NaN, new Vec2(1, 2), (): number => 1, 1n]) expect(() => leaves.fn({ a: { b: bad } }, 3)).toThrow('"leaves" found a value that is not JSON at the path "a.b"');
    // A cycle of objects stops at the depth.
    const cycle: Record<string, unknown> = { n: 1 };
    cycle["self"] = cycle;
    expect(leaves.fn(cycle as JsonValue, 3).map((l) => l.path)).toEqual(["n", "self.n", "self.self.n", "self.self.self"]);
    expect(value(run({ a: { b: 1 }, c: [] }, "leaves", 3))).toEqual([{ path: "a.b", kind: "number", value: 1 }, { path: "c", kind: "array", value: [] }]);
    expect(thrown(run({ a: 1 }, "leaves", 0))).toBe('"leaves" needs a depth that is a whole number from 1 to 100, not 0');
    expect(value(run([], "leaves", 3))).toBe("#CALC! threw");
    expect(value(run({ a: 1 }, "leaves", "3"))).toBe("#VALUE! kind-mismatch");
    // The result is an array of records, so the list ops and the axis list read it (LIST.ARRAY).
    expect(value(evaluate(app("count", app("leaves", lit({ a: { b: 1, c: 2 } }), lit(3))), { space: ONE, origin: "A", domains: DOMAINS }))).toBe(2);
  });

  // The mutation lane puts the counters of Stryker into the source of the op. A copy of that source cannot read them, so
  // this test runs only on the source that Stryker did not change.
  it.skipIf(Function.prototype.toString.call(leaves.fn).includes("stryMutAct"))("JSON.LEAVES: the function reads no name outside itself, so a copy of its source gives the same leaves", () => {
    // oxlint-disable-next-line typescript/no-implied-eval -- the test copies the source of the op, as a module does.
    const copy = new Function(`"use strict"; return (${Function.prototype.toString.call(leaves.fn)});`) as () => typeof leaves.fn;
    const doc = JSON.parse('{"a":{"b":[1],"c":{"d":null}},"":{"e":"x"}}') as JsonValue;
    expect(copy()(doc, 3)).toEqual(leaves.fn(doc, 3));
    expect(() => copy()([], 3)).toThrow('"leaves" needs an object, not an array');
  });

  it("JSON.IS: with JsonDomain last, add, eq and concat still go to the scalar domains, and a list op still reads an array", () => {
    expect([value(run(2, "add", 3)), value(run(2, "eq", 2)), value(run("a", "eq", "a")), value(run(true, "eq", false))]).toEqual([5, true, true, false]);
    expect([value(run("a", "concat", [1])), value(run("ab", "length")), value(run([1, 2, 3], "sum")), value(run([3, 1], "min"))]).toEqual(["a1", 2, 6, 1]);
    // A value of JsonDomain without the op keeps the error of the first domain that accepts it.
    expect([value(run("a", "add", 1)), value(run({ a: 1 }, "add", 1)), value(run([1], "nope"))]).toEqual(["#NAME? unknown-op", "#NAME? unknown-op", "#NAME? unknown-op"]);
    expect(run("a", "add", 1)).toMatchObject({ error: { message: 'the domain "Text" has no op "add"' } });
    expect(run({ a: 1 }, "add", 1)).toMatchObject({ error: { message: 'the domain "Json" has no op "add"' } });
  });

  it("declares the parameters and the results of its ops, and its samples are JSON values", () => {
    expect([kind.params, kind.returns, kinds.params, kinds.returns, fields.params, fields.returns, field.params, field.returns, leaves.params, leaves.returns]).toEqual([[], "string", [], undefined, [], undefined, ["any"], "any", ["number"], undefined]);
    const samples = JsonDomain.samples?.() ?? [];
    expect(samples).toEqual([{ a: 1, b: [true, null], c: { d: "x" } }, [1, "x", null, [2]], "x", 2, false]);
    expect(samples.every((s) => JsonDomain.is(s))).toBe(true);
    expect([JsonDomain.name, JsonDomain.valid, JsonDomain.show, JsonDomain.fromScalar, JsonDomain.primitive]).toEqual(["Json", undefined, undefined, undefined, undefined]);
  });
});

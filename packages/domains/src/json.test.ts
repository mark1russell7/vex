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
const { kind, kinds, fields, field } = JsonDomain.ops;

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
    const holes: readonly unknown[] = Object.assign(new Array<unknown>(9), { 0: 1, 2: "x", 3: null, 4: undefined, 5: [2], 6: { a: 1 }, 7: true, 8: 1 });
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

  it("JSON.IS: with JsonDomain last, add, eq and concat still go to the scalar domains, and a list op still reads an array", () => {
    expect([value(run(2, "add", 3)), value(run(2, "eq", 2)), value(run("a", "eq", "a")), value(run(true, "eq", false))]).toEqual([5, true, true, false]);
    expect([value(run("a", "concat", [1])), value(run("ab", "length")), value(run([1, 2, 3], "sum")), value(run([3, 1], "min"))]).toEqual(["a1", 2, 6, 1]);
    // A value of JsonDomain without the op keeps the error of the first domain that accepts it.
    expect([value(run("a", "add", 1)), value(run({ a: 1 }, "add", 1)), value(run([1], "nope"))]).toEqual(["#NAME? unknown-op", "#NAME? unknown-op", "#NAME? unknown-op"]);
    expect(run("a", "add", 1)).toMatchObject({ error: { message: 'the domain "Text" has no op "add"' } });
    expect(run({ a: 1 }, "add", 1)).toMatchObject({ error: { message: 'the domain "Json" has no op "add"' } });
  });

  it("declares the parameters and the results of its ops, and its samples are JSON values", () => {
    expect([kind.params, kind.returns, kinds.params, kinds.returns, fields.params, fields.returns, field.params, field.returns]).toEqual([[], "string", [], undefined, [], undefined, ["any"], "any"]);
    const samples = JsonDomain.samples?.() ?? [];
    expect(samples).toEqual([{ a: 1, b: [true, null], c: { d: "x" } }, [1, "x", null, [2]], "x", 2, false]);
    expect(samples.every((s) => JsonDomain.is(s))).toBe(true);
    expect([JsonDomain.name, JsonDomain.valid, JsonDomain.show, JsonDomain.fromScalar, JsonDomain.primitive]).toEqual(["Json", undefined, undefined, undefined, undefined]);
  });
});

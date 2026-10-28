import { evaluate, space } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { SCHEMA_DOMAINS, SCHEMA_PROGRAM, schemaOf, type JsonFieldSchema } from "./schema.ts";

const DOCS: readonly unknown[] = [
  { id: 1, a: { b: { c: { d: 1 } } }, t: [1, "s", null, [2], { x: 1 }, true], n: null },
  { id: "2", a: { b: { c: 2 } }, t: [], extra: { y: false } },
  { id: 3, n: { m: null }, a: {} },
];

const WANT: readonly JsonFieldSchema[] = [
  { path: "id", kinds: ["number", "string"], count: 3 },
  { path: "a.b.c", kinds: ["object", "number"], count: 2 },
  { path: "t", kinds: ["array<number|string|null|array|object|boolean>", "array"], count: 2 },
  { path: "n", kinds: ["null"], count: 1 },
  { path: "extra.y", kinds: ["boolean"], count: 1 },
  { path: "n.m", kinds: ["null"], count: 1 },
  { path: "a", kinds: ["object"], count: 1 },
];

describe("the schema program (SCHEMA_PROGRAM)", () => {
  it("EXAMPLE.SCHEMA: gives the schema of nested objects to the depth 3, arrays of mixed kinds, null leaves and fields of some documents only", () => {
    const r = evaluate(SCHEMA_PROGRAM, { space: space.array([{}]), origin: "0", domains: SCHEMA_DOMAINS, vars: { docs: DOCS } });
    expect(r).toEqual({ ok: true, value: WANT });
  });

  it("EXAMPLE.SCHEMA: schemaOf gives the records of the program, and skips a document that is not an object", () => {
    expect(schemaOf(DOCS)).toEqual(WANT);
    expect(schemaOf([])).toEqual([]);
    expect(schemaOf([null, 7, "s", [1], {}])).toEqual([]);
    expect(schemaOf([[{ a: 1 }], { a: [] }])).toEqual([{ path: "a", kinds: ["array"], count: 1 }]);
  });

  it("EXAMPLE.SCHEMA: schemaOf skips a document with a value that is not JSON, and throws the code of an error of the program", () => {
    expect(schemaOf([{ a: Number.NaN }, { b: { c: new Map() } }, { d: 1 }])).toEqual([{ path: "d", kinds: ["number"], count: 1 }]);
    expect(() => schemaOf("notalist" as unknown as readonly unknown[])).toThrow(/^the schema program gave #ARGS: /);
  });
});

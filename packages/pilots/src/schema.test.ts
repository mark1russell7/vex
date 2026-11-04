import * as fc from "fast-check";
import { JsonDomain, type JsonValue } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { SCHEMA_DEEP, SCHEMA_EXAMPLE, SCHEMA_ODD_KEYS, schemaDocs as docsArb, schemaSample } from "./inputs.ts";
import { isJsonObject, jsonKind, jsonLeaves, schemaReference } from "./schema-reference.ts";
import { schemaOf, type JsonFieldSchema } from "./schema.ts";

// The pilots have no types of Node, so the test reads the clock and the log through globalThis.
const { performance: clock, console: log } = globalThis as unknown as { readonly performance: { now(): number }; readonly console: { info(message: string): void } };

describe("the schema pilot", () => {
  it("EXAMPLE.SCHEMA: gives the schema of the example", () => {
    const docs = SCHEMA_EXAMPLE;
    expect(schemaOf(docs)).toEqual([
      { path: "_id", kinds: ["string"], count: 2 },
      { path: "n", kinds: ["number", "string"], count: 2 },
      { path: "tags", kinds: ["array<string>"], count: 1 },
      { path: "o.p", kinds: ["boolean"], count: 1 },
      { path: "o", kinds: ["object"], count: 1 },
    ]);
    expect(schemaOf([])).toEqual([]);
  });

  it("EXAMPLE.SCHEMA: stops at the depth 3, and reads null fields and items, nested and empty arrays, and a document that is not an object", () => {
    const docs = SCHEMA_DEEP;
    const expected: JsonFieldSchema[] = [
      { path: "a.b.c", kinds: ["object"], count: 2 },
      { path: "z", kinds: ["array<number|null|string|array|object>", "null"], count: 2 },
      { path: "e", kinds: ["array"], count: 1 },
      { path: "a.b", kinds: ["number"], count: 1 },
      { path: "x.y", kinds: ["number", "string"], count: 1 },
    ];
    expect(schemaOf(docs)).toEqual(expected);
    expect(schemaReference(docs)).toEqual(expected);
  });

  it("EXAMPLE.SCHEMA: skips null and array documents, and reads the keys __proto__, constructor and the empty key", () => {
    const docs = SCHEMA_ODD_KEYS;
    const expected: JsonFieldSchema[] = [
      { path: "__proto__.p", kinds: ["number"], count: 1 },
      // After an empty key, the path has no dot.
      { path: "q", kinds: ["array<null>"], count: 1 },
      { path: "constructor", kinds: ["string"], count: 1 },
    ];
    expect(schemaOf(docs)).toEqual(expected);
    expect(schemaReference(docs)).toEqual(expected);
  });

  it("EXAMPLE.SCHEMA: gives the records of schemaReference for random JSON documents", () => {
    fc.assert(
      fc.property(docsArb, (docs) => {
        expect(schemaOf(docs)).toEqual(schemaReference(docs));
      }),
      { numRuns: 100 },
    );
  });

  it("JSON.LEAVES: leaves(d, 3) of JsonDomain gives the walk of schemaReference for random JSON documents", () => {
    fc.assert(
      fc.property(docsArb, (docs) => {
        for (const d of docs.filter(isJsonObject)) {
          const notes = JsonDomain.ops.leaves.fn(d as JsonValue, 3).map((l) => [l.path, l.kind === "array" ? jsonKind(l.value) : l.kind, l.value] as const);
          expect(notes).toEqual(jsonLeaves(d).map((l) => [l.path, l.kind, l.value ?? undefined]));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("EXAMPLE.SCHEMA: gives the records of schemaReference for 20 documents of 30 fields", () => {
    const docs = schemaSample();
    const want = schemaReference(docs);
    expect(schemaOf(docs)).toEqual(want);
    const runs = 5;
    const start = clock.now();
    for (let i = 0; i < runs; i++) schemaOf(docs);
    log.info(`the schema of 20 documents of 30 fields takes ${((clock.now() - start) / runs).toFixed(1)} ms in the interpreter`);
    expect(want).toHaveLength(30);
  });
});

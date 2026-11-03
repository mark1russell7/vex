import * as fc from "fast-check";
import { JsonDomain, type JsonValue } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { SCHEMA_DEEP, SCHEMA_EXAMPLE, SCHEMA_ODD_KEYS, schemaDocs as docsArb, schemaSample } from "./inputs.ts";
import { schemaOf, type JsonFieldSchema } from "./schema.ts";

// A copy of `valueKind` and `inferSchema` of Graph (stage-schema.ts). The pilot must keep this behavior, so do not
// change these functions to fit the program.
const isRec = (u: unknown): u is Readonly<Record<string, unknown>> => !!u && typeof u === "object" && !Array.isArray(u);
function valueKind(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    const items = [...new Set(value.map((x: unknown) => (Array.isArray(x) ? "array" : valueKind(x))))];
    return items.length > 0 ? `array<${items.join("|")}>` : "array";
  }
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" ? t : t === "object" ? "object" : "string";
}
function inferSchema(docs: readonly unknown[]): JsonFieldSchema[] {
  const fields = new Map<string, { kinds: Set<string>; docs: Set<number> }>();
  const note = (p: string, k: string, d: number): void => {
    let f = fields.get(p);
    if (!f) fields.set(p, (f = { kinds: new Set(), docs: new Set() }));
    f.kinds.add(k);
    f.docs.add(d);
  };
  const walk = (val: Readonly<Record<string, unknown>>, prefix: string, depth: number, doc: number): void => {
    for (const [key, v] of Object.entries(val)) {
      const p = prefix ? `${prefix}.${key}` : key;
      if (isRec(v) && Object.keys(v).length && depth < 3) walk(v, p, depth + 1, doc);
      else note(p, valueKind(v), doc);
    }
  };
  docs.forEach((d, i) => {
    if (isRec(d)) walk(d, "", 1, i);
  });
  return [...fields].map(([path, f]) => ({ path, kinds: [...f.kinds], count: f.docs.size }));
}

/** The notes of the walk of `inferSchema` for one document: the path and the kind of each leaf, in the order of the walk. */
function graphNotes(doc: Readonly<Record<string, unknown>>): readonly (readonly [string, string, unknown])[] {
  const out: (readonly [string, string, unknown])[] = [];
  const walk = (val: Readonly<Record<string, unknown>>, prefix: string, depth: number): void => {
    for (const [key, v] of Object.entries(val)) {
      const p = prefix ? `${prefix}.${key}` : key;
      if (isRec(v) && Object.keys(v).length && depth < 3) walk(v, p, depth + 1);
      else out.push([p, valueKind(v), v ?? undefined]);
    }
  };
  walk(doc, "", 1);
  return out;
}

// The pilots have no types of Node, so the test reads the clock and the log through globalThis.
const { performance: clock, console: log } = globalThis as unknown as { readonly performance: { now(): number }; readonly console: { info(message: string): void } };

describe("the schema pilot", () => {
  it("EXAMPLE.SCHEMA: gives the schema of the example of Graph", () => {
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
    expect(inferSchema(docs)).toEqual(expected);
  });

  it("EXAMPLE.SCHEMA: skips null and array documents, and reads the keys __proto__, constructor and the empty key as Graph does", () => {
    const docs = SCHEMA_ODD_KEYS;
    const expected: JsonFieldSchema[] = [
      { path: "__proto__.p", kinds: ["number"], count: 1 },
      // After an empty key, the path of Graph has no dot.
      { path: "q", kinds: ["array<null>"], count: 1 },
      { path: "constructor", kinds: ["string"], count: 1 },
    ];
    expect(schemaOf(docs)).toEqual(expected);
    expect(inferSchema(docs)).toEqual(expected);
  });

  it("EXAMPLE.SCHEMA: gives the records of inferSchema of Graph for random JSON documents", () => {
    fc.assert(
      fc.property(docsArb, (docs) => {
        expect(schemaOf(docs)).toEqual(inferSchema(docs));
      }),
      { numRuns: 100 },
    );
  });

  it("JSON.LEAVES: leaves(d, 3) of JsonDomain gives the walk of inferSchema of Graph for random JSON documents", () => {
    fc.assert(
      fc.property(docsArb, (docs) => {
        for (const d of docs.filter(isRec)) {
          const notes = JsonDomain.ops.leaves.fn(d as JsonValue, 3).map((l) => [l.path, l.kind === "array" ? valueKind(l.value) : l.kind, l.value] as const);
          expect(notes).toEqual(graphNotes(d));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("EXAMPLE.SCHEMA: gives the records of inferSchema for 20 documents of 30 fields, the size of a sample of Graph", () => {
    const docs = schemaSample();
    const want = inferSchema(docs);
    expect(schemaOf(docs)).toEqual(want);
    const runs = 5;
    const start = clock.now();
    for (let i = 0; i < runs; i++) schemaOf(docs);
    log.info(`the schema of 20 documents of 30 fields takes ${((clock.now() - start) / runs).toFixed(1)} ms in the interpreter`);
    expect(want).toHaveLength(30);
  });
});

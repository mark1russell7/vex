/**
 * The JSON Schema of the IR in public/ir.schema.json, against the function isExpr of @mark1russell7/vex. The two accept
 * the same values, so a program that a model writes from the schema is a program that Vex accepts.
 */
import { readFileSync } from "node:fs";
import { isExpr, type Expr } from "@mark1russell7/vex";
import { arbExpr } from "@mark1russell7/vex-testkit";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

const schema: unknown = JSON.parse(readFileSync(new URL("../public/ir.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ strict: false }).compile(schema as object);
const json = (u: unknown): unknown => JSON.parse(JSON.stringify(u) ?? "null");

describe("the JSON Schema of the IR (IR.JSON)", () => {
  it("IR.JSON: the schema accepts each expression of the arbitraries", () => {
    fc.assert(
      fc.property(arbExpr({ ops: ["add", "length"], domainValue: fc.constant({ x: 1, y: 2 }) }), (e: Expr) => {
        const data = json(e);
        expect(validate(data)).toBe(isExpr(data));
      }),
      { numRuns: 300 },
    );
  });

  it("IR.JSON: the schema and isExpr agree on random JSON values and on broken expressions", () => {
    const broken = fc.oneof(
      fc.jsonValue(),
      fc.record({ tag: fc.constantFrom("lit", "ref", "app", "let", "var", "rec", "each", "ext", "loop"), path: fc.jsonValue(), args: fc.jsonValue(), name: fc.jsonValue() }),
      fc.record({ tag: fc.constant("each"), axis: fc.record({ t: fc.constantFrom("all", "neighbors", "where", "children", "ancestors", "descendants", "siblings", "up"), n: fc.integer({ min: 3, max: 9 }) }), body: fc.constant({ tag: "lit", value: 1 }) }),
      fc.record({ tag: fc.constant("each"), axis: fc.record({ t: fc.constant("window"), from: fc.oneof(fc.integer(), fc.double(), fc.constant(2 ** 53), fc.string()), to: fc.oneof(fc.integer(), fc.double()) }, { requiredKeys: ["t"] }), body: fc.constant({ tag: "lit", value: 1 }) }),
      fc.record({ tag: fc.constant("ref"), path: fc.array(fc.string()), at: fc.array(fc.record({ t: fc.constantFrom("key", "index", "other", "offset", "origin", "parent", "jump"), key: fc.jsonValue(), i: fc.double(), d: fc.jsonValue() })) }),
    );
    fc.assert(
      fc.property(broken, (u) => {
        const data = json(u);
        expect(validate(data)).toBe(isExpr(data));
      }),
      { numRuns: 1000 },
    );
  });
});

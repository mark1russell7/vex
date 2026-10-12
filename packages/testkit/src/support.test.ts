/**
 * The contracts of the support code of the test kit: the comparable form of an outcome (`compare.ts`), and the law
 * checker (`laws.ts`). The checks of the other tests rely on these functions, so each function gets exact checks.
 */
import { defineDomain, ok, vexError, fail, vexList } from "@mark1russell7/vex";
import { Vec2 } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromCore, fromReference } from "./compare.ts";
import { assertLaws, checkLaws, lawProperties, structuralEqual } from "./laws.ts";

const num = (u: unknown): u is number => typeof u === "number";

describe("the comparable form of an outcome", () => {
  it("gives each item of a list with its key, and an error item with its code", () => {
    const list = vexList([
      { key: "A", result: ok(vexList([{ key: "x", result: ok(1) }])) },
      { key: "B", result: fail(vexError("missing-field", "no field")) },
    ]);
    expect(fromCore(ok(list))).toEqual({
      ok: true,
      value: [
        { key: "A", ok: true, value: [{ key: "x", ok: true, value: 1 }] },
        { key: "B", ok: false, code: "#N/A" },
      ],
    });
  });

  it("keeps a class value, reads the fields of a plain record, and does not call a getter", () => {
    const v = new Vec2(1, 2);
    const withGetter = {
      a: [new Vec2(3, 4)],
      get b(): number {
        throw new Error("no");
      },
    };
    const bare = Object.assign(Object.create(null) as object, { c: 5 });
    // toStrictEqual checks the class: a class value stays, and a record becomes a plain record.
    expect(fromCore(ok(v))).toStrictEqual({ ok: true, value: v });
    expect(fromCore(ok(withGetter))).toStrictEqual({ ok: true, value: { a: [new Vec2(3, 4)], b: "<accessor>" } });
    const plainBare = fromCore(ok(bare));
    expect(plainBare.ok && Object.getPrototypeOf(plainBare.value)).toBe(Object.prototype);
    expect(plainBare).toStrictEqual({ ok: true, value: { c: 5 } });
    expect(fromCore(ok(null))).toEqual({ ok: true, value: null });
    // An error value inside a value gives only its code.
    expect(fromCore(ok({ e: vexError("unknown-op", "x") }))).toEqual({ ok: true, value: { e: { code: "#NAME?" } } });
    expect(fromReference({ ok: false, code: "#REF!" })).toEqual({ ok: false, code: "#REF!" });
    expect(fromCore(fail(vexError("out-of-bounds", "x")))).toEqual({ ok: false, code: "#REF!" });
  });
});

describe("structural equality", () => {
  it("does not equal a primitive and a boxed primitive, and compares null with an object without an exception", () => {
    expect(structuralEqual(1, new Number(1))).toBe(false);
    expect(structuralEqual(new Number(1), 1)).toBe(false);
    expect(structuralEqual({}, null)).toBe(false);
    expect(structuralEqual(null, {})).toBe(false);
    expect(structuralEqual("a", "a")).toBe(true);
  });
});

describe("the law checker", () => {
  // `pick` claims each law, and holds each one: it gives the larger number. `nothing` claims none.
  const Claims = defineDomain({
    name: "Claims",
    is: num,
    ops: {
      pick: { fn: (a: number, b: number): number => Math.max(a, b), laws: ["commutative", "associative", "idempotent"], identity: (): number => -1000 },
      nothing: {},
      gone: undefined as never,
    },
  });

  it("gives one property for each declared law and identity, with its name", () => {
    expect(lawProperties(Claims, { arb: fc.integer({ min: -9, max: 9 }) }).map((p) => p.name)).toEqual([
      "Claims.pick commutative",
      "Claims.pick associative",
      "Claims.pick idempotent",
      "Claims.pick identity",
    ]);
    expect(checkLaws(Claims, { arb: fc.integer({ min: -9, max: 9 }), numRuns: 20 }).every((r) => r.ok)).toBe(true);
  });

  it("finds a false claim of each kind of law", () => {
    const False = defineDomain({
      name: "False",
      is: num,
      ops: {
        // Subtraction is not commutative, not associative and not idempotent. 0 is its identity on the right only.
        minus: { fn: (a: number, b: number): number => a - b, laws: ["commutative", "associative", "idempotent"], identity: (): number => 0 },
      },
    });
    const results = checkLaws(False, { arb: fc.integer({ min: 1, max: 9 }), numRuns: 30 });
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ["False.minus commutative", false],
      ["False.minus associative", false],
      ["False.minus idempotent", false],
      ["False.minus identity", false],
    ]);
    expect(results.every((r) => r.message?.includes("Counterexample"))).toBe(true);
  });

  it("assertLaws lists each failed law with its message, separated by an empty line", () => {
    const Two = defineDomain({ name: "Two", is: num, ops: { minus: { fn: (a: number, b: number): number => a - b, laws: ["commutative", "associative"] } } });
    let message = "";
    try {
      assertLaws(Two, { arb: fc.integer({ min: 1, max: 9 }), numRuns: 20 });
    } catch (e) {
      message = e instanceof Error ? e.message : "";
    }
    expect(message.startsWith("Two.minus commutative: Property failed")).toBe(true);
    expect(message).toContain("\n\nTwo.minus associative: Property failed");
  });

  it("runs each property the given number of times", () => {
    let calls = 0;
    const Counted = defineDomain({
      name: "Counted",
      is: num,
      ops: {
        add: {
          fn: (a: number, b: number): number => {
            calls++;
            return a + b;
          },
          laws: ["commutative"],
        },
      },
    });
    checkLaws(Counted, { arb: fc.integer({ min: 0, max: 9 }), numRuns: 7 });
    // Each run calls the op twice: a op b, and b op a.
    expect(calls).toBe(14);
  });

  it("gives the cause of a failure: the op that the values do not have, a thrown text, or a false result", () => {
    const NoOp = defineDomain({ name: "NoOp", is: num, ops: { join: { laws: ["commutative"] } } });
    expect(checkLaws(NoOp, { arb: fc.integer(), numRuns: 3 })[0]?.message).toContain('Cause: NoOp has no op "join" for the value');
    const Throws = defineDomain({
      name: "Throws",
      is: num,
      ops: {
        join: {
          fn: (): number => {
            // oxlint-disable-next-line no-throw-literal -- the test needs a thrown value that is not an Error
            throw "plain text";
          },
          laws: ["commutative"],
        },
      },
    });
    expect(checkLaws(Throws, { arb: fc.integer(), numRuns: 3 })[0]?.message).toContain("Cause: plain text");
    const Minus = defineDomain({ name: "Minus", is: num, ops: { minus: { fn: (a: number, b: number): number => a - b, laws: ["commutative"] } } });
    expect(checkLaws(Minus, { arb: fc.integer({ min: 1, max: 9 }), numRuns: 30 })[0]?.message).toContain("Cause: Property failed by returning false");
  });
});

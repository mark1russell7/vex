/**
 * The list op `includes` (LIST.INCLUDES) in tier 1 and in the kernel tier (EVAL.REFERENCE). Each case runs in both
 * tiers. The tiers give the same values and the same codes, and the messages of each tier are pinned.
 */
import { describe, expect, it } from "vitest";
import { defineDomain } from "./domain.ts";
import { vexError } from "./errors.ts";
import { evaluate, type CompileOptions } from "./evaluate.ts";
import { app, axes, each, lit, ref, v, type Expr } from "./ir.ts";
import { vexList, type VexList } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import { fail } from "./result.ts";
import { space } from "./space.ts";

/** A point of a test domain. Two points with the same parts are equal by `eq`, but not by `===`. */
class Pt {
  readonly x: number;
  readonly y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

/** A value of a test domain whose `eq` gives a number. */
class Odd {
  readonly name = "odd";
}

/** A value of a test domain whose `eq` throws. */
class Boom {
  readonly name = "boom";
}

const Num = defineDomain({ name: "Num", is: (u: unknown): u is number => typeof u === "number", ops: { eq: { fn: (a: number, b: number): boolean => a === b, params: ["number"] } } });
const Text = defineDomain({ name: "Text", is: (u: unknown): u is string => typeof u === "string", ops: { eq: { fn: (a: string, b: string): boolean => a === b, params: ["string"] } } });
const Point = defineDomain({ name: "Point", is: (u: unknown): u is Pt => u instanceof Pt, ops: { eq: { fn: (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y, params: ["domain"] } } });
const OddDomain = defineDomain({ name: "Odd", is: (u: unknown): u is Odd => u instanceof Odd, ops: { eq: { fn: (): number => 1 } } });
const BoomDomain = defineDomain({
  name: "Boom",
  is: (u: unknown): u is Boom => u instanceof Boom,
  ops: {
    eq: {
      fn: (): boolean => {
        throw new Error("a defect of eq");
      },
    },
  },
});

const rows = space.array([{ kind: "ask", state: "open" }, { kind: "request", state: "done" }, { kind: "note" }, { state: "open" }, { kind: "ask", state: "open" }]);
const OPTS: CompileOptions = { domains: [Num, Text, Point, OddDomain, BoomDomain] };
const strict = lit({ strict: true });
// The kinds in key order: ask, request, note, #N/A and ask.
const kinds = each(axes.all, ref("kind"));
const none = each(axes.where(axes.all, lit(false)), ref("kind"));
const deep: VexList = vexList([{ key: "0", result: fail(vexError("depth", "the call stack is full")) }]);

/** This function gives the value, or the code and the message of the error, of a result. */
const shown = (r: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }): unknown => (r.ok ? r.value : [r.error.code, r.error.message]);

/** This function gives the code of an error that `shown` gives, or the value. */
const codeOf = (r: unknown): unknown => (Array.isArray(r) ? (r as unknown[])[0] : r);

/** This function gives the result of tier 1 and of the kernel tier for an expression at a key. */
function both(e: Expr, vars: Readonly<Record<string, unknown>> = {}, opts: CompileOptions = OPTS, origin = "0"): readonly [unknown, unknown] {
  return [shown(evaluate(e, { ...opts, space: rows, origin, vars })), shown(kernelPlan(e, opts).run({ space: rows, origin, vars }))];
}

/** This function checks that both tiers give the value `want`. */
const expectSame = (e: Expr, want: unknown, vars?: Readonly<Record<string, unknown>>, opts?: CompileOptions): void => {
  expect(both(e, vars, opts)).toEqual([want, want]);
};

/** This function checks the code of both tiers, and the message of each tier. */
const expectFails = (e: Expr, code: string, messages: readonly [string, string], vars?: Readonly<Record<string, unknown>>): void => {
  expect(both(e, vars)).toEqual([
    [code, messages[0]],
    [code, messages[1]],
  ]);
};

describe("the list op includes (LIST.INCLUDES)", () => {
  it("LIST.INCLUDES: gives true when an item equals the value by eq, and false when no item does", () => {
    expectSame(app("includes", kinds, lit("request")), true);
    expectSame(app("includes", kinds, lit("idea")), false);
    expectSame(app("includes", v("ns"), lit(3)), true, { ns: [1, 2, 3] });
    expectSame(app("includes", v("ns"), lit(4)), false, { ns: [1, 2, 3] });
    // The op eq of the domain decides, not ===: two points with the same parts are equal.
    expectSame(app("includes", v("pts"), v("p")), true, { pts: [new Pt(0, 0), new Pt(1, 2)], p: new Pt(1, 2) });
    expectSame(app("includes", v("pts"), v("p")), false, { pts: [new Pt(0, 0), new Pt(1, 2)], p: new Pt(2, 1) });
    // An empty list gives false.
    expectSame(app("includes", none, lit("ask")), false);
    expectSame(app("includes", v("xs"), lit("ask")), false, { xs: [] });
  });

  it("LIST.INCLUDES LIST.ARRAY: a literal array is a list, so a filter of a field is one op", () => {
    const facet = app("and", app("includes", lit(["ask", "request"]), ref("kind")), app("eq", ref("state"), lit("open")));
    const at = (origin: string): readonly [unknown, unknown] => both(facet, {}, OPTS, origin);
    expect(["0", "1", "4"].map(at)).toEqual([
      [true, true],
      [false, false],
      [true, true],
    ]);
    // A record without the field gives #N/A, and ifError gives a default for it (FORM.IFERROR).
    expect(at("3").map(codeOf)).toEqual(["#N/A", "#N/A"]);
    const withDefault = app("includes", lit(["ask", "request"]), app("ifError", ref("kind"), lit("")));
    expect(both(withDefault, {}, OPTS, "3")).toEqual([false, false]);
  });

  it("LIST.INCLUDES LIST.LENIENT: skips the error items, and strict gives the first error item", () => {
    expectSame(app("includes", kinds, lit("note")), true);
    expectSame(app("includes", kinds, lit("idea")), false);
    expectFails(app("includes", kinds, lit("idea"), strict), "#N/A", ['the record at "3" has no value at "kind"', "The path kind reaches nothing."]);
    expect(both(app("includes", lit(deep), lit("a"))).map(codeOf)).toEqual(["#DEPTH!", "#DEPTH!"]);
  });

  it("LIST.INCLUDES: stops at the first true, and an error of eq is the result", () => {
    // The text eq takes a text, so the number after "a" is not compared when "a" is the value.
    expectSame(app("includes", v("xs"), lit("a")), true, { xs: ["a", 1] });
    expectFails(app("includes", v("xs"), lit("b")), "#VALUE!", ['argument 1 of "eq" is a number, not a string', 'argument 1 of "eq" is a number, not a string'], { xs: ["a", 1] });
    expectFails(app("includes", v("xs"), v("x")), "#VALUE!", ['"includes" needs a boolean from "eq", but "eq" gave a number', '"includes" needs a boolean from "eq"'], { xs: [1], x: new Odd() });
    expectFails(app("includes", v("xs"), v("x")), "#CALC!", ['"eq" threw an exception', "The operation includes threw: Error: a defect of eq"], { xs: [1], x: new Boom() });
    // eq does not run for an empty list, so the result is false.
    expectSame(app("includes", v("xs"), v("x")), false, { xs: [], x: new Boom() });
  });

  it("LIST.INCLUDES: a value without eq gives #NAME?, also for an empty list, and a missing value gives #VALUE!", () => {
    expectFails(app("includes", v("xs"), lit(true)), "#NAME?", ['no domain gives "eq" for a boolean', 'no domain gives "eq" for a boolean'], { xs: [true] });
    expectFails(app("includes", v("xs"), lit(true)), "#NAME?", ['no domain gives "eq" for a boolean', 'no domain gives "eq" for a boolean'], { xs: [] });
    expectFails(app("includes", kinds), "#VALUE!", ['"includes" needs argument 2', '"includes" needs argument 2']);
    // A program without domains has no eq.
    expect(both(app("includes", lit(["a"]), lit("a")), {}, {}).map(codeOf)).toEqual(["#NAME?", "#NAME?"]);
  });

  it("LIST.INCLUDES LIST.ARRAY: a function of the host with the op comes first on an array, and the list op comes first on a list", () => {
    const opts: CompileOptions = { ...OPTS, fns: { includes: (): string => "host" } };
    expect(both(app("includes", lit(["a"]), lit("a")), {}, opts)).toEqual(["host", "host"]);
    expect(both(app("includes", kinds, lit("ask")), {}, opts)).toEqual([true, true]);
  });
});

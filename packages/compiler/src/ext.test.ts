/**
 * The errors of extensions in tier 2 (COMPILE.EXT). An error that the program catches stays in tier 2, and the result is
 * the result of the interpreter, also each error value. `#DEPTH!` stops tier 2, so tier 1 gives it.
 */
import { app, axes, call, each, evaluate, ext, fail, fn, let_, lit, ok, rec, ref, space, v, vexError, type ErrorKind, type Expr, type ExtHandler, type Space } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { arbOrigin, arbSpace } from "@mark1russell7/vex-testkit";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tiered, type GenerateOptions } from "./tiers.ts";

/** One error kind for each error code. */
const KINDS: readonly ErrorKind[] = ["unknown-key", "missing-field", "kind-mismatch", "unknown-op", "not-finite", "threw", "args", "cycle", "depth"];

/** These functions tell if a key gets an error from the extensions that depend on the focus. */
const odd = (key: string): boolean => key.charCodeAt(key.length - 1) % 2 === 1;
const third = (key: string): boolean => key.charCodeAt(key.length - 1) % 3 === 0;

const EXTENSIONS: Readonly<Record<string, ExtHandler>> = {
  ...Object.fromEntries(KINDS.map((kind): [string, ExtHandler] => [kind, () => fail(vexError(kind, `the extension gives ${kind}`))])),
  value: () => ok(2),
  text: () => ok("t"),
  throws: () => {
    throw new Error("ext");
  },
  overflow: () => {
    throw new RangeError("Maximum call stack size exceeded");
  },
  // An error at some keys, and a value at the others.
  some: (_data, ctx) => (odd(ctx.position.focus) ? fail(vexError("unknown-key", "no row")) : ok(1)),
  someDepth: (_data, ctx) => (third(ctx.position.focus) ? fail(vexError("depth", "too deep")) : ok(1)),
};

/** The names of the extensions, and a name without a handler. */
const NAMES = [...Object.keys(EXTENSIONS), "nohandler"];

const OPTIONS: GenerateOptions = { domains: [Vec2Domain, NumDomain, BoolDomain], extensions: EXTENSIONS };
const S = space.record({ A: { n: 1 }, B: { n: 2 }, C: { n: 3 } });

/** This function compares the result of a tiered program at each key with the interpreter, and gives the fallbacks. */
function fallbacks(e: Expr, s: Space = S, options: GenerateOptions = OPTIONS): number {
  const p = tiered(e, options);
  expect(p.tier).toBe(2);
  for (const origin of s.keys) expect(p.run({ space: s, origin })).toEqual(evaluate(e, { ...options, space: s, origin }));
  return p.stats.fallbacks;
}

const all = (body: Expr): Expr => each(axes.all, body);
const missing = ref("missing");

describe("COMPILE.EXT: an error of an extension that the program catches stays in tier 2", () => {
  it.each(KINDS.filter((k) => k !== "depth"))("COMPILE.EXT: ifError catches the error %s of an extension", (kind) => {
    expect(fallbacks(app("ifError", ext(kind, null), lit(792)))).toBe(0);
  });

  it("COMPILE.EXT: ifError catches an extension without a handler, and an exception of a handler", () => {
    expect(fallbacks(app("ifError", ext("nohandler", null), lit(792)))).toBe(0);
    expect(fallbacks(app("ifError", ext("throws", null), lit(792)))).toBe(0);
  });

  it("COMPILE.EXT EVAL.DEPTH: ifError does not hide #DEPTH! of an extension or a full call stack", () => {
    expect(fallbacks(app("ifError", ext("depth", null), lit(792)))).toBe(3);
    expect(fallbacks(app("ifError", ext("overflow", null), lit(792)))).toBe(3);
  });

  it("COMPILE.EXT: an error of an extension at the result goes to tier 1, which gives the error value", () => {
    expect(fallbacks(ext("unknown-key", null))).toBe(3);
    expect(fallbacks(app("add", ref("n"), ext("cycle", null)))).toBe(3);
  });

  it("COMPILE.EXT LIST.LENIENT: a list op skips the error item of an extension", () => {
    expect(fallbacks(app("count", all(ext("some", null))))).toBe(0);
    expect(fallbacks(app("sum", all(app("ifError", ext("some", null), lit(5)))))).toBe(0);
    // With strict, the first error item is the error of the op. That error would skip the later items, so tier 1 gives it.
    expect(fallbacks(app("ifError", app("sum", all(ext("some", null)), lit({ strict: true })), lit(0)))).toBe(3);
  });

  it("COMPILE.EXT EVAL.DEPTH: a list op does not skip #DEPTH! of an extension", () => {
    expect(fallbacks(app("count", all(ext("someDepth", null))))).toBe(3);
    // The interpreter makes each item before the op, so #DEPTH! of a later item comes before the first error item.
    expect(fallbacks(app("ifError", app("sum", all(app("if", app("gt", ref("n"), lit(1)), ext("depth", null), ext("missing-field", null))), lit({ strict: true })), lit(0)))).toBe(3);
    // A failure of the op at an earlier item, and an argument of the op that fails, skip no later item.
    expect(fallbacks(app("ifError", app("sum", all(app("if", app("gt", ref("n"), lit(1)), ext("depth", null), lit("x")))), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", app("count", all(ext("someDepth", null)), missing), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", app("reduce", all(ext("someDepth", null))), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", app("reduce", all(ext("someDepth", null)), lit(1)), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", app("reduce", all(app("if", app("gt", ref("n"), lit(1)), ext("depth", null), lit(1))), lit("nope")), lit(0)))).toBe(3);
  });

  it("COMPILE.EXT EVAL.DEPTH: after an error that the program catches, the interpreter still evaluates the later arguments", () => {
    // The error of the first argument is not the result: #DEPTH! of the later extension is.
    expect(fallbacks(app("ifError", app("add", missing, ext("depth", null)), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", app("add", ext("missing-field", null), ext("depth", null)), lit(0)))).toBe(3);
    expect(fallbacks(app("ifError", rec({ a: missing, b: rec({ c: ext("depth", null) }) }), lit(0)))).toBe(3);
    expect(fallbacks(app("count", all(app("add", ext("some", null), ext("someDepth", null)))))).toBe(3);
    // A function whose body calls the extension, also through the body of another function.
    const body = app("ifError", app("add", missing, call("g")), lit(0));
    expect(fallbacks(let_({ f: fn([], ext("depth", null)) }, let_({ g: fn([], call("f")) }, body)))).toBe(3);
    // A binding does not see the other bindings of its let, so this g calls no function.
    expect(fallbacks(let_({ f: fn([], ext("depth", null)), g: fn([], call("f")) }, body))).toBe(0);
    // Without #DEPTH!, the error of the first argument is caught in tier 2.
    expect(fallbacks(app("ifError", app("add", missing, ext("value", null)), lit(0)))).toBe(0);
    expect(fallbacks(let_({ h: fn([], lit(1)) }, app("ifError", app("add", missing, call("h"), ext("cycle", null)), lit(0))))).toBe(0);
  });

  it("COMPILE.EXT: a binding of let with an error of an extension has no value only where the body reads it", () => {
    expect(fallbacks(let_({ x: ext("missing-field", null) }, app("ifError", v("x"), lit(5))))).toBe(0);
    expect(fallbacks(let_({ x: ext("missing-field", null) }, lit(5)))).toBe(0);
    expect(fallbacks(let_({ x: ext("missing-field", null) }, v("x")))).toBe(3);
  });

  it("COMPILE.EXT COMPILE.MEMO: a node of the memo next to an error of an extension keeps its value", () => {
    const p = tiered(app("ifError", app("add", app("sum", all(ref("n"))), ext("some", null)), lit(0)), OPTIONS);
    for (const origin of [...S.keys, ...S.keys]) expect(p.run({ space: S, origin })).toEqual(evaluate(p.expr, { ...OPTIONS, space: S, origin }));
    expect(p.stats).toEqual({ runs: 6, fallbacks: 0 });
  });
});

/** An extension node of any name. */
const arbExt: fc.Arbitrary<Expr> = fc.constantFrom(...NAMES).map((name) => ext(name, null));

/** Programs with extensions in each context: ifError, the items of a list op, let, a node of the memo, and the result. */
const arbProgram: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => {
  const e = tie("e");
  const leaf = fc.oneof(
    { weight: 4, arbitrary: arbExt },
    { weight: 1, arbitrary: fc.integer({ min: -2, max: 3 }).map((x) => lit(x)) },
    { weight: 1, arbitrary: fc.constantFrom(ref("n"), missing, app("sum", all(ref("n")))) },
  );
  const listOp = fc
    .tuple(fc.constantFrom("count", "sum", "mean", "min", "max", "any", "first", "values", "errors", "reduce"), fc.boolean(), fc.option(e, { nil: undefined }), e)
    .map(([op, strict, test, body]): Expr => {
      const list = each(test === undefined ? axes.all : axes.where(axes.all, app("gt", test, lit(0))), body);
      const options = strict ? [lit({ strict: true })] : [];
      return app(op, ...(op === "reduce" ? [list, lit("add"), ...options] : [list, ...options]));
    });
  return {
    e: fc.oneof(
      { maxDepth: 5, depthSize: "medium" },
      leaf,
      fc.tuple(e, e).map(([a, b]) => app("ifError", a, b)),
      fc.tuple(e, e, e).map(([a, b, c]) => app("add", a, b, c)),
      fc.tuple(e, e).map(([a, b]) => rec({ a, b })),
      fc.tuple(e, e).map(([a, b]) => let_({ x: a }, app("ifError", v("x"), b))),
      fc.tuple(e, e).map(([a, b]) => let_({ x: a }, app("add", v("x"), b))),
      fc.tuple(e, e, e).map(([c, a, b]) => app("if", app("gt", c, lit(0)), a, b)),
      listOp,
    ),
  };
}).e;

const vec = fc.tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 })).map(([x, y]) => new Vec2(x, y));
const runs = arbSpace(vec).chain((s) => fc.tuple(fc.constant(s), arbProgram, arbOrigin(s)));

describe("COMPILE.EXT: random programs with extensions", () => {
  it("P17 COMPILE.EXT COMPILE.TIERED: a tiered program gives the result of the interpreter, also each error value", () => {
    fc.assert(
      fc.property(runs, ([s, e, origin]) => {
        const p = tiered(e, OPTIONS);
        expect(p.run({ space: s, origin })).toEqual(evaluate(e, { ...OPTIONS, space: s, origin }));
      }),
      { numRuns: 500 },
    );
  });

  it("COMPILE.EXT: on a fixed sample, tier 2 gives most values of the programs that catch an error of an extension", () => {
    // A fixed sample gives the same share in each run, so a change that sends caught errors to tier 1 fails at once.
    let values = 0;
    let fast = 0;
    for (const [s, e, origin] of fc.sample(runs, { seed: 20261103, numRuns: 300 })) {
      const p = tiered(e, OPTIONS);
      const r = p.run({ space: s, origin });
      if (!r.ok) continue;
      values++;
      if (p.stats.fallbacks === 0) fast++;
    }
    expect(fast / values).toBeGreaterThan(0.8);
  });
});

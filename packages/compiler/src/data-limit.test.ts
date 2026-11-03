/**
 * The data limit of `iterate` in tier 2 and in the fallback to tier 1 (ITERATE.LIMIT.DATA, ITERATE.LIMIT.ERROR, STEP.MAX).
 * The tests of the modules are in `module.test.ts` and `module-sheet.test.ts`.
 */
import { app, axes, dataLimit, each, evaluate, ext, fail, iterate, lit, ok, ref, space, v, vexError, type Axis, type Expr, type ExtHandler } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule } from "./module.ts";
import { generate, tiered, type GenerateOptions } from "./tiers.ts";

const EXTENSIONS: Readonly<Record<string, ExtHandler>> = {
  deep: () => fail(vexError("depth", "too deep")),
  other: () => fail(vexError("missing-field", "no field")),
  value: () => ok([1, 2]),
};
const OPTIONS: GenerateOptions = { domains: [NumDomain, BoolDomain], extensions: EXTENSIONS };
const S = space.array([
  { n: 1, ok: true },
  { n: 2, ok: false },
  { n: 3, ok: true },
]);
const TREE = space.tree({ r: { n: 1 }, a: { n: 2 }, b: { n: 3 } }, { r: null, a: "r", b: "r" });
const LOOP = { i: lit(0) };
const STEP = { i: app("add", v("i"), lit(1)) };
const count = (axis: Axis, until?: Expr): Expr => iterate(dataLimit(axis), LOOP, STEP, v("i"), until);
const CAP = app("fill", lit(100_000), lit(0));

/** This function compares each key with the interpreter, and it gives the fallbacks of the program. */
function fallbacks(e: Expr, s = S): number {
  const p = tiered(e, OPTIONS);
  expect(p.tier).toBe(2);
  for (const origin of s.keys) expect(p.run({ space: s, origin })).toEqual(evaluate(e, { ...OPTIONS, space: s, origin }));
  return p.stats.fallbacks;
}

describe("a data limit in tier 2 (ITERATE.LIMIT.DATA)", () => {
  it("ITERATE.LIMIT.DATA P17: tier 2 counts the targets of an axis with no fallback", () => {
    for (const axis of [axes.all, axes.others, axes.window(-1, 0), axes.reverse(axes.all), axes.where(axes.all, ref("ok")), axes.where(axes.where(axes.all, ref("ok")), app("gt", ref("n"), lit(1)))]) {
      expect(fallbacks(count(axis))).toBe(0);
    }
    expect(fallbacks(count(axes.children), TREE)).toBe(0);
    expect(fallbacks(count(axes.list(each(axes.all, ref("n")))))).toBe(0);
    expect(fallbacks(count(axes.list(app("fill", lit(4), lit(0)))))).toBe(0);
  });

  it("ITERATE.LIMIT.DATA ITERATE.UNTIL P17: the test sees the count, and a test that is never true gives #NUM! with the count", () => {
    expect(fallbacks(count(axes.all, app("gt", v("i"), lit(1))))).toBe(0);
    expect(fallbacks(count(axes.where(axes.all, ref("ok")), app("gt", v("i"), lit(0))))).toBe(0);
    expect(fallbacks(app("ifError", count(axes.all, app("gt", v("i"), lit(9))), lit(-1)))).toBe(0);
    const r = tiered(count(axes.all, app("gt", v("i"), lit(9))), OPTIONS).run({ space: S, origin: "0" });
    expect(r).toMatchObject({ ok: false, error: { code: "#NUM!", kind: "limit" } });
    expect(fallbacks(count(axes.all, app("gt", v("i"), lit(9))))).toBeGreaterThan(0);
  });

  it("ITERATE.LIMIT.DATA P17: the limit reads an outer name, and it evaluates after init", () => {
    const outer = iterate(2, { xs: lit([1, 2]), s: lit(0) }, { s: app("add", v("s"), count(axes.list(v("xs")))) }, v("s"));
    expect(fallbacks(outer)).toBe(0);
    const first = iterate(dataLimit(axes.list(lit(3))), { i: ref("missing") }, {}, v("i"));
    expect(tiered(first, OPTIONS).run({ space: S, origin: "0" })).toMatchObject({ ok: false, error: { kind: "missing-field" } });
    fallbacks(first);
  });

  it("ITERATE.LIMIT.ERROR P17: each limit that is not valid gives the error of the interpreter", () => {
    const bad: readonly Axis[] = [axes.where(axes.all, ref("missing")), axes.where(axes.all, ref("n")), axes.list(lit(3)), axes.list(ref("missing")), axes.list(each(axes.all, ref("missing"))), axes.table("none")];
    for (const axis of bad) {
      fallbacks(count(axis));
      fallbacks(app("ifError", count(axis), lit(-1)));
      expect(tiered(count(axis), OPTIONS).run({ space: S, origin: "0" })).toMatchObject({ ok: false, error: { code: "#NUM!", kind: "limit" } });
    }
    fallbacks(count(axes.children));
  });

  it("ITERATE.LIMIT.ERROR P17: tier 2 takes a count of 100000, and a count above the cap is an error", () => {
    const at = { space: S, origin: "0" };
    const fits = iterate(dataLimit(axes.list(CAP)), {}, {}, lit(1));
    expect(tiered(fits, OPTIONS).run(at)).toEqual(evaluate(fits, { ...OPTIONS, ...at }));
    const above = iterate(dataLimit(axes.list(app("append", CAP, lit([1])))), {}, {}, lit(1));
    expect(tiered(above, OPTIONS).run(at)).toMatchObject({ ok: false, error: { code: "#NUM!", kind: "limit", message: 'the data limit of "iterate" is 100001, above the cap of 100000' } });
  });

  it("ITERATE.LIMIT.ERROR EVAL.DEPTH P17: #DEPTH! stays as it is, also after an earlier error of an item", () => {
    const items = axes.list(each(axes.all, app("if", app("gt", ref("n"), lit(1)), ext("deep", null), ext("other", null))));
    for (const e of [count(axes.list(ext("deep", null))), count(items), app("ifError", count(items), lit(0))]) {
      fallbacks(e);
      expect(tiered(e, OPTIONS).run({ space: S, origin: "0" })).toMatchObject({ ok: false, error: { code: "#DEPTH!" } });
    }
  });
});

describe("a data limit and the steps (STEP.MAX)", () => {
  const e = count(axes.all);
  const reason = 'the program needs step B, and the host accepts the steps up to A: the node "iterate.size" at the root needs step B (STEP.MAX)';
  const refused = { ...OPTIONS, maxStep: "A", schema: { fields: { n: "number" } } } as const;

  it("STEP.MAX ITERATE.LIMIT.DATA: tier 2, a module and a module of a sheet refuse a data limit at maxStep A", () => {
    expect(generate(e, refused)).toStrictEqual({ ok: false, reason });
    expect(tiered(e, refused).run({ space: S, origin: "0" })).toMatchObject({ ok: false, error: { code: "#VALUE!", message: reason } });
    expect(emitModule(e, refused)).toStrictEqual({ ok: false, reason });
    expect(emitSheetModule(new Map([["A", e]]), { ...refused, kinds: { A: "number" } })).toMatchObject({ ok: false, reason });
  });

  it("STEP.MAX ITERATE.LIMIT.DATA: the default accepts a data limit, and maxStep A accepts a constant limit", () => {
    expect(generate(e, OPTIONS).ok).toBe(true);
    expect(emitModule(e, { ...OPTIONS, schema: { fields: { n: "number" } } }).ok).toBe(true);
    expect(generate(iterate(2, LOOP, STEP, v("i")), refused).ok).toBe(true);
  });
});

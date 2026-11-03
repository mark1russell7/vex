/**
 * The check of sizes in the tiers and the modules (LOOP.SIZE). Tier 2, `emitModule` and `emitSheetModule` refuse the
 * steps that the interpreter refuses, with the same reason.
 */
import { app, axes, evaluate, fold, lit, rec, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule } from "./module.ts";
import { generate, tiered } from "./tiers.ts";

const NONE = lit(vexList([]));
const doubling = (next: (xs: Expr) => Expr): Expr => fold(axes.all, { xs: NONE }, { xs: next(v("xs")) }, app("count", v("xs")));
const DOUBLED = doubling((xs) => app("append", xs, xs));
const GROWN = doubling((xs) => app("append", xs, app("fill", lit(1), lit(1))));
const REASON = 'the expression has a node "fold" whose step gives the name "xs" a value that uses the lists of the loop more than one time in its size, at the op "append" (LOOP.SIZE)';
const RECORDS = space.array([{ v: 1 }, { v: 2 }, { v: 3 }]);
const OPTIONS = { domains: [NumDomain], schema: { fields: { v: "number" } } } as const;
const text = (next: (t: Expr) => Expr): Expr => fold(axes.all, { t: lit("ab") }, { t: next(v("t")) }, v("t"));

describe("the check of sizes in the tiers and the modules (LOOP.SIZE)", () => {
  it("LOOP.SIZE: tier 2 refuses a step that doubles a text, and the tiered program gives the error of tier 1", () => {
    const options = { ...OPTIONS, domains: [NumDomain, TextDomain] };
    const doubled = text((t) => app("concat", t, t));
    const reason = 'the expression has a node "fold" whose step gives the name "t" a value that uses the lists of the loop more than one time in its size, at the op "concat" (LOOP.SIZE)';
    expect(generate(doubled, options)).toStrictEqual({ ok: false, reason });
    const run = tiered(doubled, options).run({ space: RECORDS, origin: "0" });
    expect(run.ok ? run.value : run.error.message).toBe(reason);
    expect(evaluate(doubled, { space: RECORDS, origin: "0", domains: options.domains })).toStrictEqual(run);
    expect(generate(text((t) => app("concat", t, lit("c"))), options).ok).toBe(true);
  });

  it("LOOP.SIZE: a record that holds the old record two times doubles, so tier 2 refuses it", () => {
    const nested = fold(axes.all, { r: rec({ n: lit(0) }) }, { r: rec({ a: v("r"), b: v("r") }) }, lit(1));
    expect(generate(nested, OPTIONS)).toStrictEqual({ ok: false, reason: 'the expression has a node "fold" whose step gives the name "r" a value that uses the lists of the loop more than one time in its size, at a node "rec" (LOOP.SIZE)' });
  });

  it("LOOP.SIZE: a module and a module of a sheet refuse a step that doubles a list", () => {
    expect(emitModule(DOUBLED, OPTIONS)).toStrictEqual({ ok: false, reason: REASON });
    expect(emitModule(GROWN, OPTIONS).ok).toBe(true);
    const sheet = emitSheetModule(new Map([["A", DOUBLED]]), { ...OPTIONS, kinds: { A: "number" } });
    expect(sheet.ok ? "" : sheet.reason).toContain(REASON);
    expect(emitSheetModule(new Map([["A", GROWN]]), { ...OPTIONS, kinds: { A: "number" } }).ok).toBe(true);
  });
});

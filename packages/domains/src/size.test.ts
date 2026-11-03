/**
 * The size rules of the ops of the domains (LOOP.SIZE.OPS). Each op of each domain of this package has a size rule, so a
 * step of a loop can use each op. Only the ops that start a function of the value have no rule. The test reads each
 * domain that the package exports.
 */
import { app, fold, iterate, lit, axes, ruleOf, sizeError, v, type AnyDomain } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import * as all from "./index.ts";
import { Vec2 } from "./vec2.ts";

/** The domains that the package exports. */
const isDomain = (x: unknown): x is AnyDomain => typeof x === "object" && x !== null && "ops" in x && typeof (x as { is?: unknown }).is === "function";
const DOMAINS: readonly AnyDomain[] = (Object.values(all) as readonly unknown[]).filter(isDomain);

describe("the size rules of the domains (LOOP.SIZE.OPS)", () => {
  it("LOOP.SIZE.OPS: each op of each domain has a size rule", () => {
    expect(DOMAINS.length).toBeGreaterThan(10);
    const missing = DOMAINS.flatMap((d) => Object.entries(d.ops).flatMap(([op, spec]) => (ruleOf(d, spec, DOMAINS) === undefined ? [`${d.name}.${op}`] : [])));
    // These ops start a function of the value, so their size has no bound, and a step of a loop cannot use them.
    expect(missing).toStrictEqual(["Fn.invoke", "Maybe.map", "Maybe.chain"]);
  });

  it("LOOP.SIZE: a text that a step joins to itself doubles, so the check refuses it, and a text with a constant is valid", () => {
    const doubled = iterate(12, { t: lit("ab") }, { t: app("concat", v("t"), v("t")) }, v("t"));
    expect(sizeError(doubled, { domains: DOMAINS })).toContain('whose step gives the name "t" a value that uses the lists of the loop more than one time in its size, at the op "concat" (LOOP.SIZE)');
    const grown = iterate(12, { t: lit("ab") }, { t: app("concat", v("t"), lit("c")) }, v("t"));
    expect(sizeError(grown, { domains: DOMAINS })).toBeUndefined();
    // `upper` keeps the size of its text.
    expect(sizeError(fold(axes.all, { t: lit("") }, { t: app("upper", app("concat", v("t"), lit("x"))) }, v("t")), { domains: DOMAINS })).toBeUndefined();
  });

  it("LOOP.SIZE: the ops of a vector keep a fixed size, so a step can use the vector more than one time", () => {
    const sum = fold(axes.all, { p: lit(new Vec2(0, 0)) }, { p: app("add", v("p"), v("p")) }, v("p"));
    expect(sizeError(sum, { domains: DOMAINS })).toBeUndefined();
  });
});

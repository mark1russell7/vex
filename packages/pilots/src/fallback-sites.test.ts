import { app, axes, each, ext, fail, lit, ok, ref, space, vexError } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { pilotCases } from "./fallback-cases.ts";
import { measureShare } from "./fallback-share.ts";
import { siteProbe, TOP } from "./fallback-sites.ts";

const BLOCK = "in a block that ends at an error (ifError, a binding of let, or a memo)";
const s = space.record({ A: { x: 1, fr: [1, 2] }, B: { x: 0, fr: [] }, C: {} });
const options = { domains: [NumDomain] };

/** This function gives the sum of the counts of a list. */
const sum = (list: readonly { readonly count: number }[] | undefined): number => (list ?? []).reduce((n, r) => n + r.count, 0);

describe("the probe of the sites of the fallbacks (FALLBACKOPS)", () => {
  it("gives no probe for a program of tier 1", () => {
    expect(siteProbe(app("append", each(axes.all, ref("x")), each(axes.all, ref("x"))), options)).toBeUndefined();
  });

  it("gives the value of tier 2 when no check fails", () => {
    const probe = siteProbe(ref("x"), options);
    expect(probe?.run({ space: s, origin: "A" })).toStrictEqual({ value: 1 });
    expect(probe?.site({ space: s, origin: "A" })).toStrictEqual({ site: "the probe gave a value", context: TOP });
  });

  it("names the check of a field and the op of a failed op", () => {
    expect(siteProbe(ref("x"), options)?.site({ space: s, origin: "C" })).toStrictEqual({ site: "a field", context: TOP });
    const divide = siteProbe(app("divide", lit(1), ref("x")), options);
    expect(divide?.site({ space: s, origin: "B" })).toStrictEqual({ site: "an op: divide", context: TOP });
  });

  it("names an exception of the runtime", () => {
    // Tier 2 gives FALLBACK for a list op on an array (V-064), with an exception.
    const probe = siteProbe(app("count", each(axes.all, app("keys", ref("fr")))), options);
    expect(probe?.site({ space: s, origin: "A" }).site).toBe("an exception: tier 1 gives a list op on an array");
  });

  it("names the error of an extension and the block of ifError around it", () => {
    const extensions = { "t.missing": () => fail(vexError("out-of-bounds", "no row")), "t.one": () => ok(1) };
    const probe = siteProbe(app("ifError", ext("t.missing", null), lit(5)), { ...options, extensions });
    expect(probe?.site({ space: s, origin: "A" })).toStrictEqual({ site: "an extension: t.missing gave #REF!", context: BLOCK });
    expect(siteProbe(ext("t.one", null), { ...options, extensions })?.run({ space: s, origin: "A" })).toStrictEqual({ value: 1 });
    expect(siteProbe(ext("t.none", null), options)?.site({ space: s, origin: "A" })).toStrictEqual({ site: "an extension: t.none, no handler", context: TOP });
  });

  it("names the item of a list op", () => {
    const extensions = { "t.missing": () => fail(vexError("out-of-bounds", "no row")) };
    const probe = siteProbe(app("count", each(axes.all, ext("t.missing", null))), { ...options, extensions });
    expect(probe?.site({ space: s, origin: "A" })).toStrictEqual({ site: "an extension: t.missing gave #REF!", context: "in an item of a list op" });
  });

  it("names the failed check of a memo, in this run or in an earlier run", () => {
    // The sum does not depend on the origin, so a memo keeps it for the space.
    const strict = app("sum", each(axes.all, app("divide", lit(1), ref("x"))), lit({ strict: true }));
    const probe = siteProbe(strict, options);
    expect(probe?.site({ space: s, origin: "A" })).toStrictEqual({ site: "a value of the memo, after an op: divide", context: TOP });
    expect(probe?.site({ space: s, origin: "B" })).toStrictEqual({ site: "a value of the memo, after an error of an earlier run", context: TOP });
  });

  it("gives the same counts with the probe, and a site for each fallback", () => {
    const cases = pilotCases({ seed: 7, scale: 0.1 }).filter((c) => c.name === "loan" || c.name === "invoice");
    const off = measureShare(cases);
    const on = measureShare(cases, { sites: true });
    expect(off.totals.valueSites).toBeUndefined();
    expect({ ...on.totals, valueSites: undefined, errorSites: undefined }).toStrictEqual({ ...off.totals, valueSites: undefined, errorSites: undefined });
    const values = on.totals.fallbackReasons.find((r) => r.reason === "tier 1 gave a value")?.count ?? 0;
    expect(sum(on.totals.valueSites)).toBe(values);
    expect(sum(on.totals.errorSites)).toBe(on.totals.fallbacks - values);
    // The first row of a loan reads the row before it, inside IFERROR.
    expect(on.totals.valueSites?.[0]?.reason).toBe(`an extension: vex.cell gave #REF!, ${BLOCK}`);
    expect(on.totals.valueSites?.[0]?.example).toBe('loan.opening at the origin "0"');
    for (const p of on.programs) expect(sum(p.valueSites) + sum(p.errorSites)).toBe(p.fallbacks);
  });
});

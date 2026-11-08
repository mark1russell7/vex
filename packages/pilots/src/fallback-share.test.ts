import { app, axes, each, lit, MAX_NESTING, ref, space, type Expr } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { pilotCases } from "./fallback-cases.ts";
import { measureShare, type ShareReport } from "./fallback-share.ts";

/** This function checks that the counts of a report are well formed. */
function wellFormed(report: ShareReport): void {
  const t = report.totals;
  for (const p of report.programs) {
    expect(p.runs).toBeGreaterThanOrEqual(p.fallbacks);
    expect(p.fallbacks).toBeGreaterThanOrEqual(0);
    expect(p.runs).toBeGreaterThanOrEqual(p.values);
    expect(p.values).toBeGreaterThanOrEqual(p.tier2Values);
    expect(p.tier === 2 ? p.tier2Values + p.tier2Errors : p.runs - p.fallbacks).toBe(p.runs - p.fallbacks);
    expect(p.tier === 2 ? p.tier2Values : 0).toBe(p.tier2Values);
    expect(p.runs - p.values).toBeGreaterThanOrEqual(p.tier2Errors);
    expect(p.fallbackReasons.reduce((n, r) => n + r.count, 0)).toBe(p.fallbacks);
    expect(p.tier === 2 || typeof p.reason === "string").toBe(true);
  }
  expect(t.programs).toBe(report.programs.length);
  expect(t.runs).toBeGreaterThanOrEqual(t.tier2Runs + t.fallbacks);
  expect(t.tier2Runs).toBe(t.tier2ValueRuns + t.tier2ErrorRuns);
  expect(t.runShare).toBeCloseTo(t.valueRunShare + t.tier2ErrorRuns / Math.max(t.runs, 1));
  expect(t.programShare).toBeGreaterThanOrEqual(0);
  expect(t.programShare).toBeLessThanOrEqual(1);
  expect(t.runShare).toBeGreaterThanOrEqual(0);
  expect(t.runShare).toBeLessThanOrEqual(1);
  expect(t.tier1Reasons.reduce((n, r) => n + r.count, 0)).toBe(t.programs - t.tier2);
}

describe("the share of tier 2 on real programs", () => {
  it("counts the runs and the fallbacks of two pilot programs", () => {
    const cases = pilotCases({ seed: 7, scale: 0.1 }).filter((c) => c.name === "escape" || c.name === "heat");
    expect(cases.map((c) => c.name)).toStrictEqual(["escape", "heat"]);
    const report = measureShare(cases);
    expect(report.skipped).toStrictEqual([]);
    expect(report.programs.map((p) => p.name)).toStrictEqual(["escape", "heat"]);
    for (const p of report.programs) expect(p.runs).toBeGreaterThan(0);
    wellFormed(report);
  });

  it("counts a fallback with the result of tier 1, and puts a case that throws in the skipped programs", () => {
    // The error item of a hole has the position of the call, so tier 1 gives `errors` of the array (COMPILE.LIST.ARRAY).
    const s = space.record({ A: { fr: [1, null] }, B: { fr: [null] }, C: { fr: [null, 3] } });
    const errors = app("count", each(axes.all, app("errors", ref("fr"))));
    const report = measureShare([
      {
        name: "errors",
        run: (m) => {
          const p = m.program("errors", errors, { domains: [NumDomain] });
          for (const origin of s.keys) p.run({ space: s, origin });
        },
      },
      {
        name: "broken",
        run: () => {
          throw new Error("no inputs");
        },
      },
    ]);
    expect(report.skipped).toStrictEqual([{ name: "broken", reason: "no inputs" }]);
    expect(report.programs).toHaveLength(1);
    const [p] = report.programs;
    expect([p?.tier, p?.runs, p?.fallbacks]).toStrictEqual([2, 3, 3]);
    expect(p?.fallbackReasons).toStrictEqual([{ reason: "tier 1 gave a value", count: 3 }]);
    expect(report.totals.runShare).toBe(0);
    wellFormed(report);
  });

  it("V-101: a name with compiles of two tiers counts as tier 1, with no runs of tier 2", () => {
    const s = space.record({ A: { n: 1 }, B: { n: 2 } });
    // Tier 2 refuses a program that is nested deeper than the limit, so its compile is tier 1.
    let deep: Expr = lit(1);
    for (let i = 0; i < MAX_NESTING; i++) deep = app("add", deep, lit(1));
    const report = measureShare([
      {
        name: "two tiers",
        run: (m) => {
          const fast = m.program("n", ref("n"), { domains: [NumDomain] });
          for (const origin of s.keys) fast.run({ space: s, origin });
          m.program("n", deep, { domains: [NumDomain] });
        },
      },
    ]);
    const [p] = report.programs;
    expect([p?.tier, p?.runs, p?.values, p?.tier2Values, p?.tier2Errors]).toStrictEqual([1, 2, 2, 0, 0]);
    expect([report.totals.tier2ValueRuns, report.totals.valueRunShare]).toStrictEqual([0, 0]);
    wellFormed(report);
  });
});

/**
 * The rule of the gate of the time of a print of each module (COMPILE.MODULE.COST). The gate `bench/module-cost.ts` runs
 * in the speed gate. This file tests the rule and the class of each module with no measure of a time.
 */
import { describe, expect, it } from "vitest";
import { placesRead } from "../../compiler/src/unshared.ts";
import { BUILD_ROW, limitOf, MODULE_LINES, moduleCostFaults, NOT_SHARED_LIMIT, readingOf, SHARED_LIMIT, worstIsNoise, type ModuleTimes } from "../bench/module-cost-limits.ts";
import { IREKO_MODULES, irekoExprs } from "./ireko-modules.ts";

/** This function gives a row of 3 rounds with a base of 100 ms. */
function row(branch: readonly number[], module = "grid", shares = true): ModuleTimes {
  return { module, shares, base: [100, 100, 100], branch, aa: [100, 100, 100] };
}

describe("COMPILE.MODULE.COST", () => {
  it("COMPILE.MODULE.COST: the table has 16 modules, and only direction and label have no shared object", () => {
    expect(IREKO_MODULES).toHaveLength(16);
    expect(IREKO_MODULES.filter((m) => !placesRead(irekoExprs(m)).shares)).toEqual(["direction", "label"]);
  });

  it("COMPILE.MODULE.COST: the program of a module picks its limit, and a line of a module comes first", () => {
    expect(limitOf("grid", true)).toBe(SHARED_LIMIT);
    expect(limitOf("grid", false)).toBe(NOT_SHARED_LIMIT);
    expect(limitOf("bounds", true)).toBe(MODULE_LINES["bounds"]);
    expect(limitOf("bounds", false)).toBe(MODULE_LINES["bounds"]);
    expect(limitOf("toString", true)).toBe(SHARED_LIMIT);
    expect(limitOf(BUILD_ROW, true)).toBe(MODULE_LINES[BUILD_ROW]);
    expect(limitOf(BUILD_ROW, true).median).toBe(1.1);
  });

  it("COMPILE.MODULE.COST: each limit states its reason", () => {
    expect([SHARED_LIMIT, NOT_SHARED_LIMIT, ...Object.values(MODULE_LINES)].filter((l) => l.why === "")).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a row reads the medians and the largest ratio of one round", () => {
    expect(readingOf({ module: "grid", shares: true, base: [100, 200, 100], branch: [110, 110, 300], aa: [100, 100, 105] })).toEqual({ baseMs: 100, branchMs: 110, ratio: 1.1, aa: 1, worstPair: 3, aaWorst: 1.05 });
  });

  it("COMPILE.MODULE.COST: a value at the limit passes, and a value over the limit fails", () => {
    expect(moduleCostFaults(row([110, 110, 120]))).toEqual([]);
    expect(moduleCostFaults(row([111, 111, 111]))).toEqual(["grid: the median ratio 1.110 is over the limit 1.100"]);
    expect(moduleCostFaults(row([100, 100, 121]))).toEqual(["grid: the worst pair 1.210 is over the limit 1.200 and over the worst pair 1.000 of the A/A arm"]);
    expect(moduleCostFaults(row([125, 125, 125]))).toEqual(["grid: the median ratio 1.250 is over the limit 1.100", "grid: the worst pair 1.250 is over the limit 1.200 and over the worst pair 1.000 of the A/A arm"]);
  });

  it("COMPILE.MODULE.COST: a fault prints three decimals, so a row does not round on to its line", () => {
    expect(moduleCostFaults(row([110.2, 110.2, 110.2]))).toEqual(["grid: the median ratio 1.102 is over the limit 1.100"]);
  });

  it("COMPILE.MODULE.COST: a worst pair inside the worst pair of the A/A arm is noise, and the row says so", () => {
    const noisy: ModuleTimes = { module: "grid", shares: true, base: [100, 100, 100], branch: [100, 100, 125], aa: [100, 100, 125] };
    const real: ModuleTimes = { ...noisy, aa: [100, 100, 124] };
    expect(moduleCostFaults(noisy)).toEqual([]);
    expect(worstIsNoise(readingOf(noisy), SHARED_LIMIT)).toBe(true);
    expect(moduleCostFaults(real)).toHaveLength(1);
    expect(worstIsNoise(readingOf(real), SHARED_LIMIT)).toBe(false);
  });

  it("COMPILE.MODULE.COST: a worst pair under its limit is not noise, because it has no fault to explain", () => {
    expect(worstIsNoise(readingOf({ module: "grid", shares: true, base: [100], branch: [120], aa: [130] }), SHARED_LIMIT)).toBe(false);
  });

  it("COMPILE.MODULE.COST: the limits read each module alone, so a fast module hides no slow module", () => {
    const rows = [row([50, 50, 50], "avoid"), row([115, 115, 115], "measure")];
    expect(rows.map((r) => moduleCostFaults(r).length)).toEqual([0, 1]);
  });

  it("COMPILE.MODULE.COST: a line of a module sets its limit", () => {
    expect(moduleCostFaults(row([116, 116, 117], "bounds"))).toEqual([]);
    expect(moduleCostFaults(row([121, 121, 121], "bounds"))).toEqual(["bounds: the median ratio 1.210 is over the limit 1.200", "bounds: the worst pair 1.210 is over the limit 1.200 and over the worst pair 1.000 of the A/A arm"]);
  });

  it("COMPILE.MODULE.COST: no times, or arms with different rounds, are a fault", () => {
    expect(moduleCostFaults({ module: "grid", shares: true, base: [], branch: [], aa: [] })).toEqual(["grid: the arms have 0 and 0 rounds"]);
    expect(moduleCostFaults(row([100, 100]))).toEqual(["grid: the arms have 3 and 2 rounds"]);
  });
});

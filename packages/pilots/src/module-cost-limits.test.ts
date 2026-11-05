/**
 * The rule of the gate of the time of a print of each module (COMPILE.MODULE.COST). The gate `bench/module-cost.ts` runs
 * in the speed gate. This file tests the rule and the class of each module with no measure of a time.
 */
import { describe, expect, it } from "vitest";
import { placesRead } from "../../compiler/src/unshared.ts";
import { BUILD_ROW, limitOf, MODULE_LINES, moduleCostFaults, NOT_SHARED_LIMIT, readingOf, runAaWorst, SHARED_LIMIT, worstIsNoise, type ModuleTimes } from "../bench/module-cost-limits.ts";
import { IREKO_MODULES, irekoExprs } from "./ireko-modules.ts";

/** This function gives a row of 3 rounds with a base of 100 ms, for a module with no line of its own. */
function row(branch: readonly number[], module = "next", shares = true): ModuleTimes {
  return { module, shares, base: [100, 100, 100], branch, aa: [100, 100, 100] };
}

describe("COMPILE.MODULE.COST", () => {
  it("COMPILE.MODULE.COST: the table has 16 modules, and only direction and label have no shared object", () => {
    expect(IREKO_MODULES).toHaveLength(16);
    expect(IREKO_MODULES.filter((m) => !placesRead(irekoExprs(m)).shares)).toEqual(["direction", "label"]);
  });

  it("COMPILE.MODULE.COST: each module and the row of one process have a line, and no other name has one", () => {
    expect(new Set(Object.keys(MODULE_LINES))).toEqual(new Set([...IREKO_MODULES, BUILD_ROW]));
  });

  it("COMPILE.MODULE.COST: no limit is over the cap of 1.25 without a ruling", () => {
    expect(Object.entries(MODULE_LINES).filter(([, l]) => l.median > 1.25 || l.worst > 1.25)).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a line of a module comes first, and the program of a new module picks its limit", () => {
    expect(limitOf("next", true)).toBe(SHARED_LIMIT);
    expect(limitOf("next", false)).toBe(NOT_SHARED_LIMIT);
    expect(limitOf("bounds", true)).toBe(MODULE_LINES["bounds"]);
    expect(limitOf("bounds", false)).toBe(MODULE_LINES["bounds"]);
    expect(limitOf("toString", true)).toBe(SHARED_LIMIT);
    expect(limitOf(BUILD_ROW, true)).toBe(MODULE_LINES[BUILD_ROW]);
  });

  it("COMPILE.MODULE.COST: each limit states its reason", () => {
    expect([SHARED_LIMIT, NOT_SHARED_LIMIT, ...Object.values(MODULE_LINES)].filter((l) => l.why === "")).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a row reads the medians and the two largest ratios of one round", () => {
    expect(readingOf({ module: "next", shares: true, base: [100, 200, 100], branch: [110, 110, 300], aa: [100, 100, 105] })).toEqual({ baseMs: 100, branchMs: 110, ratio: 1.1, aa: 1, worstPair: 3, secondPair: 1.1, aaWorst: 1.05 });
  });

  it("COMPILE.MODULE.COST: a row of one round has its one pair as its second pair", () => {
    expect(readingOf({ module: "next", shares: true, base: [100], branch: [120], aa: [100] }).secondPair).toBe(1.2);
  });

  it("COMPILE.MODULE.COST: a value at the limit passes, and a value over the limit fails", () => {
    expect(moduleCostFaults(row([110, 110, 120]), 1)).toEqual([]);
    expect(moduleCostFaults(row([111, 111, 111]), 1)).toEqual(["next: the median ratio 1.110 is over the limit 1.100"]);
    expect(moduleCostFaults(row([100, 100, 121]), 1)).toEqual(["next: the worst pair 1.210 is over the limit 1.200 and over the worst pair 1.000 of the A/A arm of the run"]);
    expect(moduleCostFaults(row([125, 125, 125]), 1)).toEqual(["next: the median ratio 1.250 is over the limit 1.100", "next: the worst pair 1.250 is over the limit 1.200 and over the worst pair 1.000 of the A/A arm of the run"]);
  });

  it("COMPILE.MODULE.COST: a fault prints three decimals, so a row does not round on to its line", () => {
    expect(moduleCostFaults(row([110.2, 110.2, 110.2]), 1)).toEqual(["next: the median ratio 1.102 is over the limit 1.100"]);
  });

  it("COMPILE.MODULE.COST: the noise of a worst pair is the worst pair of the A/A arm over all the rows of the run", () => {
    const quiet = row([100, 100, 125]);
    const loud: ModuleTimes = { ...row([100, 100, 100], "other"), aa: [100, 100, 130] };
    expect(runAaWorst([quiet, loud])).toBe(1.3);
    expect(moduleCostFaults(quiet, runAaWorst([quiet, loud]))).toEqual([]);
    expect(moduleCostFaults(quiet, runAaWorst([quiet]))).toHaveLength(1);
  });

  it("COMPILE.MODULE.COST: a worst pair inside the worst pair of the A/A arm is noise, and the row says so", () => {
    const noisy = row([100, 100, 125]);
    expect(moduleCostFaults(noisy, 1.25)).toEqual([]);
    expect(worstIsNoise(readingOf(noisy), SHARED_LIMIT, 1.25)).toBe(true);
    expect(moduleCostFaults(noisy, 1.24)).toHaveLength(1);
    expect(worstIsNoise(readingOf(noisy), SHARED_LIMIT, 1.24)).toBe(false);
  });

  it("COMPILE.MODULE.COST: a worst pair under its limit is not noise, because it has no fault to explain", () => {
    expect(worstIsNoise(readingOf({ module: "next", shares: true, base: [100], branch: [120], aa: [130] }), SHARED_LIMIT, 1.3)).toBe(false);
  });

  it("COMPILE.MODULE.COST: the limits read each module alone, so a fast module hides no slow module", () => {
    const rows = [row([50, 50, 50], "avoid"), row([117, 117, 117], "measure")];
    expect(rows.map((r) => moduleCostFaults(r, 1).length)).toEqual([0, 1]);
  });

  it("COMPILE.MODULE.COST: a line of a module sets its limit", () => {
    expect(moduleCostFaults(row([116, 116, 125], "bounds"), 1)).toEqual([]);
    expect(moduleCostFaults(row([121, 121, 126], "bounds"), 1)).toEqual(["bounds: the median ratio 1.210 is over the limit 1.200", "bounds: the worst pair 1.260 is over the limit 1.250 and over the worst pair 1.000 of the A/A arm of the run"]);
  });

  it("COMPILE.MODULE.COST: the line of the row of one process holds the gain", () => {
    expect(moduleCostFaults(row([98, 98, 98], BUILD_ROW), 1)).toEqual([]);
    expect(moduleCostFaults(row([99, 99, 99], BUILD_ROW), 1)).toEqual(["build: the median ratio 0.990 is over the limit 0.980"]);
  });

  it("COMPILE.MODULE.COST: no times, or arms with different rounds, are a fault", () => {
    expect(moduleCostFaults({ module: "next", shares: true, base: [], branch: [], aa: [] }, 1)).toEqual(["next: the arms have 0 and 0 rounds"]);
    expect(moduleCostFaults(row([100, 100]), 1)).toEqual(["next: the arms have 3 and 2 rounds"]);
  });
});

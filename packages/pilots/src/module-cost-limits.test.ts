/**
 * The rule of the gate of the time of a print of each module (COMPILE.MODULE.COST). The gate `bench/module-cost.ts` runs
 * in the speed gate. This file tests the rule and the class of each module with no measure of a time.
 */
import { describe, expect, it } from "vitest";
import { placesRead } from "../../compiler/src/unshared.ts";
import { AA_CAP, BUILD_NO_AVOID_ROW, BUILD_ROW, CATCH_ADD, catchFaults, CATCH_MUST_FAIL, falseFails, isLoud, limitOf, MODULE_LINES, moduleCostFaults, NOT_SHARED_LIMIT, readingOf, runAaSecond, SHARED_LIMIT, type ModuleTimes } from "../bench/module-cost-limits.ts";
import { IREKO_MODULES, irekoExprs } from "./ireko-modules.ts";

/** This function gives a row of 3 rounds with a base of 100 ms, for a module with no line of its own. */
function row(branch: readonly number[], module = "next", shares = true): ModuleTimes {
  return { module, shares, base: [100, 100, 100], branch, aa: [100, 100, 100] };
}

/** This function gives a row whose A/A arm has the given second pair. */
function loudAt(second: number): ModuleTimes {
  return { ...row([100, 100, 100]), aa: [100, 100 * second, 100 * second] };
}

describe("COMPILE.MODULE.COST", () => {
  it("COMPILE.MODULE.COST: the table has 16 modules, and only direction and label have no shared object", () => {
    expect(IREKO_MODULES).toHaveLength(16);
    expect(IREKO_MODULES.filter((m) => !placesRead(irekoExprs(m)).shares)).toEqual(["direction", "label"]);
  });

  it("COMPILE.MODULE.COST: each module and the rows of one process have a line, and no other name has one", () => {
    expect(new Set(Object.keys(MODULE_LINES))).toEqual(new Set([...IREKO_MODULES, BUILD_ROW, BUILD_NO_AVOID_ROW]));
  });

  it("COMPILE.MODULE.COST: no limit is over the cap of 1.25 without a ruling", () => {
    expect(Object.entries(MODULE_LINES).filter(([, l]) => l.median > 1.25 || l.second > 1.25)).toEqual([]);
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

  it("COMPILE.MODULE.COST: a row reads the medians and the two largest ratios of one round on both arms", () => {
    expect(readingOf({ module: "next", shares: true, base: [100, 200, 100], branch: [110, 110, 300], aa: [100, 100, 105] })).toEqual({ baseMs: 100, branchMs: 110, ratio: 1.1, aa: 1, worstPair: 3, secondPair: 1.1, aaWorst: 1.05, aaSecond: 1 });
  });

  it("COMPILE.MODULE.COST: a row of one round has its one pair as its second pair", () => {
    const reading = readingOf({ module: "next", shares: true, base: [100], branch: [120], aa: [130] });
    expect([reading.secondPair, reading.aaSecond]).toEqual([1.2, 1.3]);
  });

  it("COMPILE.MODULE.COST: a value at the limit passes, and a value over the limit fails", () => {
    expect(moduleCostFaults(row([110, 110, 120]), 1)).toEqual([]);
    expect(moduleCostFaults(row([111, 111, 111]), 1)).toEqual(["next: the median ratio 1.110 is over the limit 1.100"]);
    expect(moduleCostFaults(row([100, 121, 121]), 1)).toEqual(["next: the median ratio 1.210 is over the limit 1.100", "next: the second pair 1.210 is over the limit 1.200 and over the second pair 1.000 of the A/A arm of the run"]);
  });

  it("COMPILE.MODULE.COST: a fault prints three decimals, so a row does not round on to its line", () => {
    expect(moduleCostFaults(row([110.2, 110.2, 110.2]), 1)).toEqual(["next: the median ratio 1.102 is over the limit 1.100"]);
  });

  it("COMPILE.MODULE.COST: one slow round does not fail a row, because the rule reads the second pair", () => {
    expect(moduleCostFaults(row([100, 100, 200]), 1)).toEqual([]);
  });

  it("COMPILE.MODULE.COST: the noise of a second pair is the worst second pair of the A/A arm over all the rows of the run", () => {
    const slow = row([100, 125, 125]);
    const loud: ModuleTimes = { ...row([100, 100, 100], "other"), aa: [100, 130, 130] };
    expect(runAaSecond([slow, loud])).toBe(1.3);
    expect(moduleCostFaults(slow, runAaSecond([slow, loud]))).toEqual(["next: the median ratio 1.250 is over the limit 1.100"]);
    expect(moduleCostFaults(slow, runAaSecond([slow]))).toEqual(["next: the median ratio 1.250 is over the limit 1.100", "next: the second pair 1.250 is over the limit 1.200 and over the second pair 1.000 of the A/A arm of the run"]);
  });

  it("COMPILE.MODULE.COST: one maximum of the A/A arm does not decide a row", () => {
    const quiet: ModuleTimes = { ...row([100, 100, 100], "other"), aa: [100, 100, 900] };
    expect(runAaSecond([quiet])).toBe(1);
  });

  it("COMPILE.MODULE.COST: a read over the cap of the A/A arm does not decide, and a read at the cap decides", () => {
    expect(isLoud([loudAt(AA_CAP)])).toBe(false);
    expect(isLoud([loudAt(AA_CAP + 0.01)])).toBe(true);
  });

  it("COMPILE.MODULE.COST: the count of false fails reads each A/A arm as a branch, against the other rows", () => {
    const quiet = row([100, 100, 100], "quiet");
    const spike: ModuleTimes = { ...row([100, 100, 100], "spike"), aa: [100, 130, 130] };
    expect(falseFails([quiet, spike])).toEqual(["spike"]);
    expect(falseFails([quiet, spike, { ...spike, module: "twin" }])).toEqual(["spike", "twin"]);
  });

  it("COMPILE.MODULE.COST: a row with a limit under 1 fails the count of false fails by its limit", () => {
    expect(falseFails([row([100, 100, 100], "avoid"), row([100, 100, 100], "next")])).toEqual(["avoid"]);
  });

  it("COMPILE.MODULE.COST: the read that tests the gate finds a module that the gate passes", () => {
    const failed = (module: string): ModuleTimes => row([121, 121, 121], module);
    expect(catchFaults([failed("grid"), failed("shape")], 1)).toEqual([]);
    expect(catchFaults([failed("grid"), row([100, 100, 100], "shape")], 1)).toEqual(["shape: the gate passes a module with an added cost"]);
    expect(catchFaults([failed("grid")], 1)).toEqual(["shape: the gate passes a module with an added cost"]);
  });

  it("COMPILE.MODULE.COST: the read that tests the gate adds a cost in each module that must fail", () => {
    expect(CATCH_MUST_FAIL.filter((module) => !Object.hasOwn(CATCH_ADD, module))).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a case of 1.11 on a limit of 1.12 passes, and that is what the limit lets through", () => {
    expect(limitOf("radial", true).median).toBe(1.12);
    expect(moduleCostFaults(row([111, 111, 111], "radial"), 1)).toEqual([]);
  });

  it("COMPILE.MODULE.COST: the limits read each module alone, so a fast module hides no slow module", () => {
    const rows = [row([50, 50, 50], "avoid"), row([117, 117, 117], "measure")];
    expect(rows.map((r) => moduleCostFaults(r, 1).length)).toEqual([0, 1]);
  });

  it("COMPILE.MODULE.COST: a line of a module sets its limit", () => {
    expect(moduleCostFaults(row([116, 116, 125], "bounds"), 1)).toEqual([]);
    expect(moduleCostFaults(row([121, 126, 126], "bounds"), 1)).toEqual(["bounds: the median ratio 1.260 is over the limit 1.200", "bounds: the second pair 1.260 is over the limit 1.250 and over the second pair 1.000 of the A/A arm of the run"]);
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

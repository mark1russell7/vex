/**
 * The rule of the gate of the time of a print of each module (COMPILE.MODULE.COST). The gate `bench/module-cost.ts` runs
 * in the speed gate. This file tests the limits, the use of the home rule and the class of each module with no measure of a time.
 */
import { readFileSync } from "node:fs";
import { armOrder } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { placesRead } from "../../compiler/src/unshared.ts";
import { measureIsolated } from "../../core/bench/measure.ts";
import { AA_CAP, ARMS, BUILD_NO_AVOID_ROW, BUILD_ROW, CATCH_ADD, catchFaults, CATCH_MUST_FAIL, ceilingOnly, falseFails, GAIN_BASE, GAIN_MODELS, limitOf, medianLimit, MODULE_LINES, moduleCostFaults, moduleVerdict, NOT_SHARED_LIMIT, readingOf, recordsOf, SHARED_LIMIT, type ModuleTimes } from "../bench/module-cost-limits.ts";
import { IREKO_MODULES, irekoExprs } from "./ireko-modules.ts";

/** A model where the reads show the gain. */
const HELD = "AMD EPYC 7763 64-Core Processor";

/** The model where the reads do not show the gain. */
const NOT_HELD = "AMD EPYC 9V45 96-Core Processor";

/** This function gives a row of 7 rounds with a base of 100 ms, and with the same ratio in each round of the branch. */
function row(ratio: number, module = "next", shares = true): ModuleTimes {
  return { module, shares, base: Array.from({ length: 7 }, () => 100), branch: Array.from({ length: 7 }, () => 100 * ratio), aa: Array.from({ length: 7 }, () => 100) };
}

/** This function gives a row of 7 rounds with a ratio of 1, and with the given ratio in the 2 last rounds of the branch. */
function tail(second: number, module = "next"): ModuleTimes {
  return { ...row(1, module), branch: [100, 100, 100, 100, 100, 100 * second, 100 * second] };
}

/** This function gives a row with no cost, and with the given ratio in the 2 last rounds of the A/A arm. */
function loud(second: number, module = "other"): ModuleTimes {
  return { ...row(1, module), aa: [100, 100, 100, 100, 100, 100 * second, 100 * second] };
}

/** This function gives the words of the faults of the first row of a read. */
function faultsOf(rows: readonly ModuleTimes[], model = HELD): readonly string[] {
  const verdict = moduleVerdict(rows, model);
  const first = verdict.cases[0];
  return first === undefined ? [] : moduleCostFaults(first, verdict.aaTail);
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
    expect(Object.entries(MODULE_LINES).filter(([, l]) => Math.max(l.median, l.second ?? 0, l.ceiling ?? 0) > 1.25)).toEqual([]);
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

  it("COMPILE.MODULE.COST: a row reads the median of its ratios and the two largest ratios of one round on both arms", () => {
    const reading = readingOf({ module: "next", shares: true, base: [100, 200, 100, 100, 100], branch: [110, 110, 300, 110, 120], aa: [100, 100, 105, 102, 100] });
    expect(reading.baseMs).toBe(100);
    expect(reading.branchMs).toBe(110);
    expect(reading.ratio).toBeCloseTo(1.1, 9);
    expect(reading.aa).toBeCloseTo(1, 9);
    expect(reading.worstPair).toBe(3);
    expect(reading.secondPair).toBe(1.2);
    expect(reading.aaWorst).toBe(1.05);
    expect(reading.aaSecond).toBe(1.02);
  });

  it("COMPILE.MODULE.COST: the median of a row is the median of its ratios, not a ratio of two medians", () => {
    const reading = readingOf({ module: "next", shares: true, base: [100, 100, 100, 200, 200], branch: [200, 200, 200, 200, 200], aa: [100, 100, 100, 200, 200] });
    expect(reading.ratio).toBeCloseTo(2, 9);
    expect(reading.branchMs / reading.baseMs).toBe(2);
    const moved = readingOf({ module: "next", shares: true, base: [100, 100, 200, 200, 200], branch: [100, 100, 220, 220, 220], aa: [100, 100, 200, 200, 200] });
    expect(moved.ratio).toBeCloseTo(1.1, 9);
    expect(moved.branchMs / moved.baseMs).toBeCloseTo(1.1, 9);
  });

  it("COMPILE.MODULE.COST: the first arm of each record is the arm that started first", async () => {
    const starts: (readonly unknown[])[] = [];
    const report = await measureIsolated({
      arms: [
        { id: "base", command: ["base"] },
        { id: "branch", command: ["branch"] },
      ],
      inputs: [{ id: "next" }],
      repeats: 7,
      warmup: 0,
      mode: "fresh",
      startChild: async (command) => {
        starts.push(command);
        return { ms: starts.length };
      },
    });
    expect(report.arms).toEqual(ARMS);
    const ms = report.inputs[0]?.ms ?? {};
    const times: ModuleTimes = { module: "next", shares: true, base: ms["base"] ?? [], branch: ms["branch"] ?? [], aa: ms["base~aa"] ?? [] };
    // The child gives the place of its start as its time, so the smaller time of a pair is the arm that started first.
    for (const side of ["branch", "aa"] as const) {
      const records = recordsOf([times], side);
      expect(records.map((r) => r.first)).toEqual(records.map((r) => (r.a < r.b ? "a" : "b")));
    }
  });

  it("COMPILE.MODULE.COST: the order of the arms comes from armOrder, so each pair of the gate turns evenly", () => {
    const firsts = (arm: string): number => Array.from({ length: 7 }, (_round, round) => armOrder(ARMS, round)).filter((order) => order.indexOf("base") < order.indexOf(arm)).length;
    expect([firsts("branch"), firsts("base~aa")]).toEqual([4, 4]);
  });

  it("COMPILE.MODULE.COST: a value under the limit passes, and a value over the limit fails", () => {
    expect(faultsOf([row(1.099)])).toEqual([]);
    expect(faultsOf([row(1.11)])).toEqual(["next: the median ratio 1.110 is over the limit 1.100"]);
    expect(faultsOf([row(1.21)])).toEqual(["next: the median ratio 1.210 is over the limit 1.100", "next: the second pair 1.210 is over the limit 1.200 and over the second pair 1.000 of the A/A arm of the run"]);
  });

  it("COMPILE.MODULE.COST: a fault prints three decimals, so a row does not round on to its line", () => {
    expect(faultsOf([row(1.102)])).toEqual(["next: the median ratio 1.102 is over the limit 1.100"]);
  });

  it("COMPILE.MODULE.COST: one slow round does not fail a row, because the rule reads the second pair", () => {
    expect(faultsOf([{ ...row(1), branch: [100, 100, 100, 100, 100, 100, 200] }])).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a second pair under the median limit fails alone, and only over the worst second pair of the A/A arm of the run", () => {
    expect(faultsOf([tail(1.25)])).toEqual(["next: the second pair 1.250 is over the limit 1.200 and over the second pair 1.000 of the A/A arm of the run"]);
    expect(faultsOf([tail(1.25), loud(1.3)])).toEqual([]);
  });

  it("COMPILE.MODULE.COST: one maximum of the A/A arm does not decide a row", () => {
    expect(moduleVerdict([{ ...row(1, "other"), aa: [100, 100, 100, 100, 100, 100, 900] }], HELD).aaTail).toBe(1);
  });

  it("COMPILE.MODULE.COST: a read over the cap of the A/A arm does not decide, and a read at the cap decides", () => {
    expect(moduleVerdict([loud(AA_CAP)], HELD).outcome).toBe("within");
    const over = moduleVerdict([loud(AA_CAP + 0.01)], HELD);
    expect(over.outcome).toBe("cannot decide");
    expect(over.reason).toContain("over the cap");
  });

  it("COMPILE.MODULE.COST: a read of 3 rows decides, because the read that tests the gate has 3 rows", () => {
    expect(moduleVerdict([row(1, "grid"), row(1, "radial"), row(1, "shape")], HELD).outcome).toBe("within");
  });

  it("COMPILE.MODULE.COST: a read of a row with few rounds does not decide", () => {
    const few: ModuleTimes = { module: "next", shares: true, base: [100, 100, 100], branch: [100, 100, 100], aa: [100, 100, 100] };
    expect(moduleVerdict([few], HELD).outcome).toBe("cannot decide");
  });

  it("COMPILE.MODULE.COST: the count of false fails reads each A/A arm as a branch, against the other rows", () => {
    const quiet = row(1, "quiet");
    const spike = loud(1.3, "spike");
    expect(falseFails([quiet, spike], HELD).fails).toEqual(["spike"]);
    expect(falseFails([quiet, spike, { ...spike, module: "twin" }], HELD).fails).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a row with a limit under 1 has no read in the count of false fails, on a model that reads its gain", () => {
    const rows = [row(1, "avoid"), row(1, "next")];
    expect(falseFails(rows, HELD).fails).toEqual([]);
    expect(falseFails(rows, HELD).gains.map((gain) => gain.case)).toEqual(["avoid"]);
    expect(falseFails(rows, NOT_HELD).gains).toEqual([]);
  });

  it("COMPILE.MODULE.COST: the read that tests the gate finds a module that the gate passes", () => {
    const failed = (module: string): ModuleTimes => row(1.3, module);
    expect(catchFaults(moduleVerdict([failed("grid"), failed("shape")], HELD))).toEqual([]);
    expect(catchFaults(moduleVerdict([failed("grid"), row(1, "shape")], HELD))).toEqual(["shape: the gate passes a module with an added cost"]);
    expect(catchFaults(moduleVerdict([failed("grid")], HELD))).toEqual(["shape: the gate passes a module with an added cost"]);
  });

  it("COMPILE.MODULE.COST: the read that tests the gate adds a cost in each module that must fail", () => {
    expect(CATCH_MUST_FAIL.filter((module) => !Object.hasOwn(CATCH_ADD, module))).toEqual([]);
  });

  it("COMPILE.MODULE.COST: a case of 1.17 on a limit of 1.18 passes, and that is what the limit lets through", () => {
    expect(limitOf("radial", true).median).toBe(1.18);
    expect(faultsOf([row(1.17, "radial")])).toEqual([]);
  });

  it("COMPILE.MODULE.COST: the limits read each module alone, so a fast module hides no slow module", () => {
    expect(moduleVerdict([row(0.5, "avoid"), row(1.23, "measure")], HELD).cases.map((c) => c.outcome)).toEqual(["within", "beyond"]);
  });

  it("COMPILE.MODULE.COST: a line of a module sets its limit", () => {
    expect(faultsOf([row(1.16, "bounds")])).toEqual([]);
    expect(faultsOf([row(1.26, "bounds")])).toEqual(["bounds: the median ratio 1.260 is over the limit 1.250"]);
  });

  it("COMPILE.MODULE.COST: a line with no limit of the second pair fails nothing on that pair, and each other line fails on it", () => {
    expect(limitOf("bounds", true).second).toBeUndefined();
    expect(faultsOf([tail(1.9, "bounds")])).toEqual([]);
    expect(Object.keys(MODULE_LINES).filter((module) => faultsOf([tail(1.9, module)]).length === 0)).toEqual(["bounds"]);
  });

  it("COMPILE.MODULE.COST: the line of the row of one process holds the gain", () => {
    expect(faultsOf([row(0.979, BUILD_ROW)])).toEqual([]);
    expect(faultsOf([row(0.99, BUILD_ROW)])).toEqual(["build: the median ratio 0.990 is over the limit 0.980"]);
  });

  it("COMPILE.MODULE.COST: a model outside the list reads the ceiling of a gain row, and that row does not read the gain", () => {
    expect(GAIN_MODELS.has(NOT_HELD)).toBe(false);
    for (const model of [NOT_HELD, "a model with no reads"]) {
      expect(faultsOf([row(1.039, BUILD_ROW)], model)).toEqual([]);
      expect(faultsOf([row(1.05, BUILD_ROW)], model)).toEqual(["build: the median ratio 1.050 is over the limit 1.040"]);
      expect(faultsOf([row(1.029, "avoid")], model)).toEqual([]);
      expect(faultsOf([row(1.04, "avoid")], model)).toEqual(["avoid: the median ratio 1.040 is over the limit 1.030"]);
      expect(ceilingOnly(limitOf(BUILD_ROW, true), model)).toBe(true);
      expect(medianLimit(limitOf("avoid", true), model)).toBe(1.03);
    }
    expect(ceilingOnly(limitOf(BUILD_ROW, true), HELD)).toBe(false);
    expect(medianLimit(limitOf("avoid", true), HELD)).toBe(0.89);
  });

  it("COMPILE.MODULE.COST: a row with no ceiling has one limit on each model", () => {
    expect(Object.keys(MODULE_LINES).filter((module) => limitOf(module, true).ceiling !== undefined)).toEqual(["avoid", BUILD_ROW]);
    expect(ceilingOnly(limitOf("grid", true), NOT_HELD)).toBe(false);
    expect(medianLimit(limitOf("grid", true), NOT_HELD)).toBe(1.18);
    expect(faultsOf([row(1.19, "grid")], NOT_HELD)).toEqual(["grid: the median ratio 1.190 is over the limit 1.180"]);
  });

  it("COMPILE.MODULE.COST: the fixed commit of the limits is the commit that the job of the gate checks out", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/speed-gate.yml", import.meta.url), "utf8");
    expect(workflow).toContain(`BASE: ${GAIN_BASE}`);
  });

  it("COMPILE.MODULE.COST: no times, or arms with different rounds, are a fault", () => {
    expect(() => moduleVerdict([{ module: "next", shares: true, base: [], branch: [], aa: [] }], HELD)).toThrow("next: the arms have 0 and 0 rounds");
    expect(() => moduleVerdict([{ ...row(1), branch: [100, 100] }], HELD)).toThrow("next: the arms have 7 and 2 rounds");
    expect(() => moduleVerdict([{ ...row(1), aa: [100, 100] }], HELD)).toThrow("next: the arms have 7 and 2 rounds");
  });
});

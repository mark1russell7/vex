import type { CpuEntry, ProcessLimits } from "@mark1russell7/rigor-bench";
import { cpuEntry, processVerdict } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { limitsText, parseReads, processRead, readLine, type GateRead } from "./gate-reads.ts";

const LIMITS: CpuEntry<ProcessLimits> = { model: "7763", value: { limit: 1.2, slow: 1.3, maxSlow: 2 } };
const READ: GateRead = { case: "nearest", ratio: 1.1, aa: [0.98, 1.02], tier: 2, fallbacks: 0, limits: LIMITS };

describe("gate-reads", () => {
  it("gives back each read of the output of a process, at full precision", () => {
    const precise = { ...READ, ratio: 1.123_456_789, aa: [0.987_654_321, 1.012_345_678] as const };
    const out = ["runner: a CPU", "ok   nearest: a line for a person", readLine(precise), ""].join("\n");
    expect(parseReads(out)).toEqual([precise]);
  });

  it("gives no read for an output with no read line", () => {
    expect(parseReads("ok   nearest: a line for a person\n")).toEqual([]);
  });

  it("refuses a read line that is not valid", () => {
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, ratio: Number.NaN })}`)).toThrow(/ratio/u);
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, ratio: 0 })}`)).toThrow(/ratio/u);
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, aa: [1.02, 0.98] })}`)).toThrow(/A\/A band/u);
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, tier: 1.5 })}`)).toThrow(/tier/u);
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, limits: { model: "7763", value: {} } })}`)).toThrow(/limits/u);
    expect(() => parseReads(`read ${JSON.stringify({ ...READ, case: 3 })}`)).toThrow(/no case/u);
    expect(() => parseReads("read {")).toThrow(SyntaxError);
  });

  it("V-075: finds the model in a CPU name with another case, and keeps the spelling of the limits", () => {
    const BY_NAME = { Xeon: { limit: 2.08, slow: 2.08 }, other: { limit: 1.74, slow: 1.74 } };
    const names = ["INTEL(R) XEON(R) PLATINUM 8573C", "Intel(R) Xeon(R) Platinum 8573C CPU @ 2.30GHz", "intel(r) xeon(r)"];
    expect(names.map((n) => cpuEntry<ProcessLimits>(BY_NAME, n))).toEqual(names.map(() => ({ model: "Xeon", value: { limit: 2.08, slow: 2.08 } })));
    expect(cpuEntry<ProcessLimits>(BY_NAME, "AMD EPYC 9V45 96-CORE PROCESSOR")).toMatchObject({ model: "other" });
  });

  it("gives the limits text with the slow line, the slow count and the model", () => {
    expect(limitsText(LIMITS)).toBe("limit 1.2, slow line 1.3, at most 2 slow, for 7763");
    expect(limitsText({ model: "other", value: { limit: 2 } })).toBe("limit 2, slow line 2, a record only, for other");
  });

  it("gives a read with no fault for a read of tier 2 with no fallbacks and the same limits", () => {
    expect(processRead("p1", "nearest", LIMITS, READ)).toEqual({ process: "p1", case: "nearest", ratio: 1.1, aa: [0.98, 1.02] });
  });

  it("gives a fault for a wrong tier, a fallback, another case or other limits", () => {
    const other: CpuEntry<ProcessLimits> = { model: "other", value: { limit: 2 } };
    const r = processRead("p2", "nearest", LIMITS, { ...READ, case: "life", tier: 1, fallbacks: 3, limits: other });
    expect(r.fault).toBe('the case "life", not "nearest", tier 1, 3 fallbacks, the limits limit 2, slow line 2, a record only, for other, not limit 1.2, slow line 1.3, at most 2 slow, for 7763');
  });

  it("makes processVerdict block a case with a fault, and decide a case with k valid reads", () => {
    const reads = ["p1", "p2", "p3"].map((p) => processRead(p, "nearest", LIMITS, READ));
    expect(processVerdict(reads, { k: 3, limits: LIMITS.value }).cases[0]?.outcome).toBe("within");
    const faulty = [...reads.slice(0, 2), processRead("p3", "nearest", LIMITS, { ...READ, fallbacks: 1 })];
    expect(processVerdict(faulty, { k: 3, limits: LIMITS.value }).cases[0]?.outcome).toBe("beyond");
  });
});

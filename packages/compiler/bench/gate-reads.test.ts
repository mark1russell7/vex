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
    expect(parseReads(out)).toEqual({ reads: [precise], bad: [] });
  });

  it("gives no read for an output with no read line", () => {
    expect(parseReads("ok   nearest: a line for a person\n")).toEqual({ reads: [], bad: [] });
  });

  it("gives the reason of a read line that is not valid, with no read and no throw", () => {
    const cases: [string, RegExp][] = [
      [`read ${JSON.stringify({ ...READ, ratio: Number.NaN })}`, /^the ratio of the read line /u],
      [`read ${JSON.stringify({ ...READ, ratio: 0 })}`, /^the ratio of /u],
      [`read ${JSON.stringify({ ...READ, aa: [1.02, 0.98] })}`, /^the A\/A band of /u],
      [`read ${JSON.stringify({ ...READ, tier: 1.5 })}`, /^the tier or the fallbacks of /u],
      [`read ${JSON.stringify({ ...READ, limits: { model: "7763", value: {} } })}`, /^the limits of /u],
      [`read ${JSON.stringify({ ...READ, case: 3 })}`, / has no case$/u],
      ["read {", /^the read line \{ is not a JSON object$/u],
      ["read null", / is not a JSON object$/u],
      ["read [1]", / is not a JSON object$/u],
    ];
    for (const [line, reason] of cases) {
      const parsed = parseReads(line);
      expect({ line, reads: parsed.reads, bad: parsed.bad }).toEqual({ line, reads: [], bad: [expect.stringMatching(reason)] });
    }
  });

  it("keeps a valid read line next to a line that is not valid", () => {
    const out = ["read {", readLine(READ), `read ${JSON.stringify({ ...READ, ratio: -1 })}`].join("\n");
    const parsed = parseReads(out);
    expect(parsed.reads).toEqual([READ]);
    expect(parsed.bad).toHaveLength(2);
  });

  it("V-075: finds the model in a CPU name with another case, and keeps the spelling of the limits", () => {
    const BY_NAME = { Xeon: { limit: 2.08, slow: 2.08 }, other: { limit: 1.74, slow: 1.74 } };
    const names = ["INTEL(R) XEON(R) PLATINUM 8573C", "Intel(R) Xeon(R) Platinum 8573C CPU @ 2.30GHz", "intel(r) xeon(r)"];
    expect(names.map((n) => cpuEntry<ProcessLimits>(BY_NAME, n))).toEqual(names.map(() => ({ model: "Xeon", value: { limit: 2.08, slow: 2.08 } })));
    expect(cpuEntry<ProcessLimits>(BY_NAME, "AMD EPYC 9V45 96-CORE PROCESSOR")).toMatchObject({ model: "other" });
  });

  it("gives the limits text with the slow line, the slow count, the noise cap and the model", () => {
    expect(limitsText(LIMITS)).toBe("limit 1.2, slow line 1.3, at most 2 slow, no noise cap, for 7763");
    expect(limitsText({ model: "other", value: { limit: 2 } })).toBe("limit 2, slow line 2, a record only, no noise cap, for other");
    expect(limitsText({ model: "other", value: { limit: 2, noiseCap: 0.0312 } })).toBe("limit 2, slow line 2, a record only, noise cap 0.0312, for other");
  });

  it("keeps the noise cap of the limits in a read line, and refuses a noise cap that is not a number", () => {
    const capped = { ...READ, limits: { model: "7763", value: { ...LIMITS.value, noiseCap: 0.031_2 } } };
    expect(parseReads(readLine(capped))).toEqual({ reads: [capped], bad: [] });
    expect(parseReads(`read ${JSON.stringify({ ...READ, limits: { model: "7763", value: { limit: 1.2, noiseCap: "0.03" } } })}`).bad[0]).toMatch(/^the limits of /u);
  });

  it("gives a fault for a read with another noise cap", () => {
    const capped: CpuEntry<ProcessLimits> = { model: "7763", value: { ...LIMITS.value, noiseCap: 0.03 } };
    expect(processRead("p1", "nearest", capped, READ).fault).toMatch(/no noise cap, for 7763, not .*noise cap 0\.03, for 7763$/u);
  });

  it("makes processVerdict leave out a read above the noise cap, so a noisy case gets more processes", () => {
    const capped: CpuEntry<ProcessLimits> = { model: "7763", value: { ...LIMITS.value, noiseCap: 0.03 } };
    const quiet = { ...READ, limits: capped };
    const noisy = { ...quiet, aa: [0.95, 1.06] as const };
    const reads = [processRead("p1", "nearest", capped, quiet), processRead("p2", "nearest", capped, quiet), processRead("p3", "nearest", capped, noisy)];
    const v = processVerdict(reads, { k: 3, limits: capped.value }).cases[0];
    expect(v?.outcome).toBe("cannot decide");
    expect(v?.more).toBeGreaterThan(0);
  });

  it("gives a read with no fault for a read of tier 2 with no fallbacks and the same limits", () => {
    expect(processRead("p1", "nearest", LIMITS, READ)).toEqual({ process: "p1", case: "nearest", ratio: 1.1, aa: [0.98, 1.02] });
  });

  it("gives a fault for a wrong tier, a fallback, another case or other limits", () => {
    const other: CpuEntry<ProcessLimits> = { model: "other", value: { limit: 2 } };
    const r = processRead("p2", "nearest", LIMITS, { ...READ, case: "life", tier: 1, fallbacks: 3, limits: other });
    expect(r.fault).toBe(
      'the case "life", not "nearest", tier 1, 3 fallbacks, the limits limit 2, slow line 2, a record only, no noise cap, for other, not limit 1.2, slow line 1.3, at most 2 slow, no noise cap, for 7763',
    );
  });

  it("makes processVerdict block a case with a fault, and decide a case with k valid reads", () => {
    const reads = ["p1", "p2", "p3"].map((p) => processRead(p, "nearest", LIMITS, READ));
    expect(processVerdict(reads, { k: 3, limits: LIMITS.value }).cases[0]?.outcome).toBe("within");
    const faulty = [...reads.slice(0, 2), processRead("p3", "nearest", LIMITS, { ...READ, fallbacks: 1 })];
    expect(processVerdict(faulty, { k: 3, limits: LIMITS.value }).cases[0]?.outcome).toBe("beyond");
  });
});

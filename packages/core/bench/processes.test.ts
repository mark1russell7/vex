// The tests of the decision of a speed gate over fresh processes. The lines have the form that the gate scripts print.
import { describe, expect, it } from "vitest";
import { complete, decide, decisionLine, isValid, limitsText, parseLine, parseProcess, type CaseLimits, type CaseSample } from "./processes.ts";

const TREE: CaseLimits = { limit: 1.1, slow: 1.2, maxSlow: 2 };

/** This function gives a result line of the compiler gate for the tree case. */
function line(ratio: number, aa: readonly [number, number] = [0.98, 1.02], tier = 2, fallbacks = 0, limits: CaseLimits = TREE): string {
  return `ok   a tree module, the team and the depth of each of 1000 nodes: tier ${String(tier)}, ${String(fallbacks)} fallbacks, generated 90.1 µs, loops 91.0 µs, generated/loops time ${ratio.toFixed(2)} (lower is better, ${limitsText(limits)}), A/A noise ${aa[0].toFixed(2)} to ${aa[1].toFixed(2)}`;
}

/** This function gives the samples of processes with one tree line each. */
function processes(...ratios: readonly number[]): readonly (readonly CaseSample[])[] {
  return ratios.map((r) => parseProcess(line(r)));
}

describe("parseLine", () => {
  it("reads a line of a case with its limits", () => {
    expect(parseLine(line(1.31))).toEqual({ title: "a tree module, the team and the depth of each of 1000 nodes", ratio: 1.31, tierOk: true, aa: [0.98, 1.02], limits: TREE });
  });

  it("reads the line of the growth case, and a FAIL line", () => {
    const s = parseLine(`FAIL the share of each value in the total: tier 2, 0 fallbacks, 1000 values 50.0 µs, 500 values 25.0 µs, growth 2.01 (${limitsText({ limit: 2.23, slow: 2.3, maxSlow: 1 })}), A/A noise 0.97 to 1.03`);
    expect(s?.title).toBe("the share of each value in the total");
    expect(s?.ratio).toBe(2.01);
    expect(s?.limits).toEqual({ limit: 2.23, slow: 2.3, maxSlow: 1 });
  });

  it("gives tierOk false for tier 1 or a fallback", () => {
    expect(parseLine(line(1, undefined, 1))?.tierOk).toBe(false);
    expect(parseLine(line(1, undefined, 2, 3))?.tierOk).toBe(false);
  });

  it("gives undefined for another line, a line with no slow line, and a record line with its process number", () => {
    expect(parseLine("runner: AMD EPYC 7763 (4 cores), Node.js v26.13.0")).toBeUndefined();
    expect(parseLine(line(1).replace(", slow line 1.2, at most 2 slow", ""))).toBeUndefined();
    expect(parseLine(`  p3 ${line(1)}`)).toBeUndefined();
  });
});

describe("isValid and complete", () => {
  it("counts a process only when its A/A band contains 1.0", () => {
    expect(isValid({ title: "t", ratio: 1, tierOk: true, aa: [0.9, 1], limits: TREE })).toBe(true);
    expect(isValid({ title: "t", ratio: 1, tierOk: true, aa: [1.01, 1.2], limits: TREE })).toBe(false);
    expect(isValid({ title: "t", ratio: 1, tierOk: true, aa: [0.8, 0.99], limits: TREE })).toBe(false);
  });

  it("is complete only with k valid processes of each case", () => {
    const valid = processes(1, 1);
    const invalid = [parseProcess(line(1, [1.01, 1.2]))];
    expect(complete(valid, 2)).toBe(true);
    expect(complete([...valid.slice(0, 1), ...invalid], 2)).toBe(false);
    expect(complete([...valid.slice(0, 1), ...invalid, ...valid.slice(1)], 2)).toBe(true);
  });
});

describe("decide", () => {
  it("passes on the median, with slow processes up to the largest count", () => {
    const [d] = decide(processes(1, 1.3, 1.02, 1.35, 0.98), 5);
    expect(d).toMatchObject({ ok: true, median: 1.02, slowCount: 2, reasons: [] });
  });

  it("fails check (a) when the median is above the limit", () => {
    const [d] = decide(processes(1.12, 1.15, 1.11, 1, 1), 5);
    expect(d?.ok).toBe(false);
    expect(d?.reasons).toEqual(["the median is above the limit"]);
  });

  it("fails check (b) when more processes than the largest count are above the slow line", () => {
    const [d] = decide(processes(1, 1.3, 1.25, 1.21, 1, 1, 1), 7);
    expect(d?.median).toBe(1);
    expect(d?.slowCount).toBe(3);
    expect(d?.reasons).toEqual(["more than 2 processes above the slow line"]);
  });

  it("counts a ratio on the slow line as not slow", () => {
    expect(decide(processes(1.2, 1.2, 1.2, 1), 4)[0]?.slowCount).toBe(0);
  });

  it("uses only the first k valid processes, and leaves out the invalid ones", () => {
    const ps = [parseProcess(line(5, [1.01, 1.3])), ...processes(1, 1.05, 1.3)];
    const [d] = decide(ps, 2);
    expect(d?.ratios).toEqual([1, 1.05]);
    expect(d?.ok).toBe(true);
  });

  it("fails closed with fewer than k valid processes", () => {
    const [d] = decide([...processes(1), parseProcess(line(1, [1.01, 1.3]))], 2);
    expect(d?.reasons).toEqual(["1 valid processes, not 2"]);
  });

  it("fails when a process has a wrong tier, when a process gave no line, and on different limits", () => {
    expect(decide([...processes(1), parseProcess(line(1, undefined, 1))], 1)[0]?.reasons).toContain("a process had a wrong tier or a fallback");
    expect(decide([...processes(1), []], 1)[0]?.reasons).toEqual(["1 processes gave no line"]);
    expect(decide([...processes(1), parseProcess(line(1, undefined, 2, 0, { ...TREE, limit: 1.5 }))], 1)[0]?.reasons).toEqual(["the processes gave different limits"]);
  });

  it("gives no decision for no line", () => {
    expect(decide([[], []], 2)).toEqual([]);
  });
});

describe("decisionLine", () => {
  it("starts with ok or FAIL, and gives the median, the slow count and each process", () => {
    const [ok] = decide(processes(1, 1.3, 1.02), 3);
    const [bad] = decide(processes(1.2, 1.3), 2);
    expect(ok === undefined ? "" : decisionLine(ok)).toBe(
      "ok   a tree module, the team and the depth of each of 1000 nodes: median 1.02 of 3 valid processes (lower is better, limit 1.1), 1 above the slow line 1.2 (at most 2), processes 1.00, 1.30, 1.02",
    );
    expect(bad === undefined ? "" : decisionLine(bad)).toMatch(/^FAIL .*processes 1\.20, 1\.30\. the median is above the limit$/u);
  });
});

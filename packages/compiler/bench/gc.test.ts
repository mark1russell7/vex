// The tests of the GC instrument: the share of each gc entry to the arm of its timed batch, and the summary lines.
import { constants, type PerformanceEntry } from "node:perf_hooks";
import type { ArmRounds } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { armsOf, gcLine, gcSummary, parseGc, type ArmGc } from "./gc.ts";

/** This function gives a gc entry of one kind, at one time, with one duration. */
const entry = (startTime: number, duration: number, kind?: number): PerformanceEntry =>
  ({ name: "gc", entryType: "gc", startTime, duration, detail: kind === undefined ? null : { kind } }) as unknown as PerformanceEntry;

// Two rounds of the arms base and cand. Round 0 times base first, and round 1 times cand first.
// Arm `a` of each record is the base, and arm `b` is cand, so each span has the time of its arm in the record.
const ROUNDS: ArmRounds = {
  pairs: {
    cand: [
      { case: "one", round: 0, first: "a", a: 10, b: 20 },
      { case: "one", round: 1, first: "b", a: 12, b: 18 },
    ],
  },
  orders: [
    ["base", "cand"],
    ["cand", "base"],
  ],
  spans: [
    [
      { start: 0, end: 10 },
      { start: 10, end: 30 },
    ],
    [
      { start: 30, end: 48 },
      { start: 48, end: 60 },
    ],
  ],
  count: 1,
  sink: 0,
};

describe("armsOf", () => {
  it("gives each gc entry to the arm of the timed batch that holds its start", () => {
    const entries = [
      entry(5, 1, constants.NODE_PERFORMANCE_GC_MINOR),
      entry(20, 3, constants.NODE_PERFORMANCE_GC_MAJOR),
      entry(35, 2, constants.NODE_PERFORMANCE_GC_MINOR),
      entry(50, 0.5),
      // This entry is out of each timed batch, so no arm counts it.
      entry(100, 9, constants.NODE_PERFORMANCE_GC_MAJOR),
    ];
    expect(armsOf(ROUNDS, entries)).toEqual([
      { arm: "base", minor: 1, minorMs: 1, major: 0, majorMs: 0, other: 1, otherMs: 0.5, timedMs: 22 },
      { arm: "cand", minor: 1, minorMs: 2, major: 1, majorMs: 3, other: 0, otherMs: 0, timedMs: 38 },
    ]);
  });

  it("gives zero counts and the timed sums when no gc occurred", () => {
    expect(armsOf(ROUNDS, []).map((g) => [g.arm, g.minor + g.major + g.other, g.timedMs])).toEqual([
      ["base", 0, 22],
      ["cand", 0, 38],
    ]);
  });

  it("refuses spans that do not agree with the rounds", () => {
    expect(() => armsOf({ ...ROUNDS, spans: [ROUNDS.spans[0] ?? []] }, [])).toThrow("the spans do not agree with the rounds");
    const short = [[{ start: 0, end: 10 }], ROUNDS.spans[1] ?? []];
    expect(() => armsOf({ ...ROUNDS, spans: short }, [])).toThrow("round 0 does not agree with the rounds");
    const late = [[{ start: 0, end: 11 }, { start: 11, end: 31 }], ROUNDS.spans[1] ?? []];
    expect(() => armsOf({ ...ROUNDS, spans: late }, [])).toThrow("the batch of base in round 0 does not agree with the rounds");
  });

  it("refuses rounds with no base arm", () => {
    expect(() => armsOf({ ...ROUNDS, orders: [["cand"], ["cand"]] }, [])).toThrow("the spans do not agree with the rounds");
  });
});

/** This function gives the gc of one arm with 2 minor collections. */
const g = (arm: string, minorMs: number, timedMs: number): ArmGc => ({ arm, minor: 2, minorMs, major: 0, majorMs: 0, other: 0, otherMs: 0, timedMs });

describe("gcLine and gcSummary", () => {
  it("writes a line that parseGc reads back", () => {
    const one = g("base", 1.25, 40);
    expect(parseGc(`x\n${gcLine(one, "base")}\ny`)).toEqual([one]);
  });

  it("gives the median GC share of the processes with timed runs, and no read without them", () => {
    const lines = gcSummary("shapes", [
      { ratio: 1.1, gc: [g("base", 1, 10), g("cand", 0, 0)] },
      { ratio: 0.9, gc: [g("base", 3, 10), g("cand", 0, 0)] },
    ]);
    expect(lines[0]).toContain("base 2 minor 2.00 ms, 0 major 0.00 ms, 0 other 0.00 ms, GC share 20.0 %");
    expect(lines[0]).toContain("cand 2 minor 0.00 ms, 0 major 0.00 ms, 0 other 0.00 ms, GC share no read");
    expect(lines[1]).toBe("gc shapes: each process as its ratio and the GC share in % of base/cand, by ratio: 0.90 30.0/NaN, 1.10 10.0/NaN");
  });
});

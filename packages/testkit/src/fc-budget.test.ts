import { describe, expect, it } from "vitest";
import { deriveMinimums, parseRecords, verdict, type RunRecord } from "./fc-budget.ts";

const record = (key: string, runs: number, more: Partial<RunRecord> = {}): RunRecord => ({ key, runs, target: 1_000_000, interrupted: true, failed: false, cpu: "test", ...more });

describe("the minimum of runs of the weekly long run", () => {
  it("passes a property that did all its runs, also with no minimum", () => {
    expect(verdict(record("a", 1_000_000, { interrupted: false }), {}, false)).toBeUndefined();
  });

  it("fails a property that reached its budget with no minimum", () => {
    expect(verdict(record("a", 700), {}, false)).toMatch(/after 700 of 1000000 runs, and it has no minimum/);
  });

  it("fails a property under its minimum, and passes it at the minimum", () => {
    expect(verdict(record("a", 699), { a: 700 }, false)).toMatch(/Its minimum is 700 runs/);
    expect(verdict(record("a", 700), { a: 700 }, false)).toBeUndefined();
  });

  it("applies no minimum when it only collects the records", () => {
    expect(verdict(record("a", 1), {}, true)).toBeUndefined();
  });

  it("reads one record on each line, and skips the empty lines", () => {
    const text = `${JSON.stringify(record("a", 5))}\n\n${JSON.stringify(record("b", 6))}\n`;
    expect(parseRecords(text).map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("gives the worst runs times 0.9 for each property that reached its budget, in sorted order", () => {
    const sets = Object.fromEntries([1000, 900, 1100, 950, 1200].map((n, i) => [`run-${String(i)}`, [record("z", n), record("a", n * 2), record("full", 1_000_000, { interrupted: false })]]));
    const m = deriveMinimums(sets);
    expect(m.minimums).toEqual({ a: 1620, z: 810 });
    expect(Object.keys(m.minimums)).toEqual(["a", "z"]);
    expect(m.sources).toHaveLength(5);
    expect(m.derivation).toMatch(/over 5 green runs/);
  });

  it("takes a property that reached its budget in only some sets", () => {
    const sets = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`run-${String(i)}`, [record("a", i === 0 ? 800 : 1_000_000, { interrupted: i === 0 })]]));
    expect(deriveMinimums(sets).minimums).toEqual({ a: 720 });
  });

  it("refuses fewer than 5 sets, a set with a failure, and a property not in each set", () => {
    const four = Object.fromEntries([0, 1, 2, 3].map((i) => [`run-${String(i)}`, [record("a", 9)]]));
    expect(() => deriveMinimums(four)).toThrow(/4 sets of records/);
    expect(() => deriveMinimums({ ...four, bad: [record("a", 9, { failed: true })] })).toThrow(/has a failure of "a"/);
    expect(() => deriveMinimums({ ...four, other: [record("b", 9)] })).toThrow(/"a" is in 4 of 5 sets/);
  });
});

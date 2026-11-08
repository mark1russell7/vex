import { describe, expect, it } from "vitest";
import { deriveMinimums, parseRecords, recordOnlyOf, runSummary, sharedKeys, ungatedNote, verdict, type RunRecord } from "./fc-budget.ts";

const record = (key: string, runs: number, more: Partial<RunRecord> = {}): RunRecord => ({ key, runs, target: 1_000_000, interrupted: true, failed: false, cpu: "test", ...more });
/** One set of records for each number, each with the one property `a`. */
const setsOf = (xs: readonly number[]): Record<string, RunRecord[]> => Object.fromEntries(xs.map((n, i) => [`run-${String(i)}`, [record("a", n)]]));

describe("the minimum of runs of the weekly long run", () => {
  it("V-099: only 1 and true turn on the mode of records, and another value throws", () => {
    for (const value of [undefined, "", "0", "false"]) expect(recordOnlyOf(value)).toBe(false);
    for (const value of ["1", "true"]) expect(recordOnlyOf(value)).toBe(true);
    for (const value of ["no", "False", " 1"]) expect(() => recordOnlyOf(value)).toThrow(RangeError);
  });

  it("V-100: a key of more than one property has a line in the summary, and a derivation refuses it", () => {
    const records = [record("a", 700), record("b", 700), record("a", 900)];
    expect(sharedKeys(records)).toStrictEqual(["a"]);
    expect(sharedKeys([record("a", 700), record("b", 700)])).toStrictEqual([]);
    expect(runSummary(records, { minimums: { a: 1, b: 1 } }, false).slice(-2)).toStrictEqual(["- Keys of more than one property, so one minimum gates each of them: 1. Give each test a different name.", "  - a"]);
    expect(runSummary([record("a", 700)], { minimums: { a: 1 } }, false)).toHaveLength(3);
    const sets = { ...setsOf([1000, 1010, 1020, 1030]), "run-4": records };
    expect(() => deriveMinimums(sets)).toThrow(`weekly-minimums: in the set run-4, more than one property has the key "a". Give each test a different name.`);
  });

  it("tells a property with no minimum apart from a failed property in the summary of a run", () => {
    const records = [record("a", 700), record("b", 700), record("c", 5, { failed: true }), record("d", 1_000_000, { interrupted: false })];
    expect(verdict(record("a", 700), { minimums: {} }, false)).toMatch(/^no minimums yet: The property "a" stopped/);
    expect(runSummary(records, { minimums: {} }, false)).toStrictEqual([
      "- Failed properties, each with a counterexample: 1 of 4.",
      "  - c",
      "- Properties under their minimum of runs: 0.",
      "- Properties that stopped at the budget, with no minimums yet: 2.",
    ]);
    expect(runSummary(records, { minimums: { a: 800 } }, false)).toStrictEqual([
      "- Failed properties, each with a counterexample: 1 of 4.",
      "  - c",
      "- Properties under their minimum of runs: 1.",
      "- Properties that stopped at the budget, with no minimums yet: 1.",
    ]);
    expect(runSummary(records, { minimums: {} }, true).at(-1)).toBe("- Properties that stopped at the budget, with no minimums yet: 0.");
  });

  it("passes a property that did all its runs, also with no minimum", () => {
    expect(verdict(record("a", 1_000_000, { interrupted: false }), { minimums: {} }, false)).toBeUndefined();
  });

  it("fails a property that reached its budget with no minimum", () => {
    expect(verdict(record("a", 700), { minimums: {} }, false)).toMatch(/after 700 of 1000000 runs, and it has no minimum/);
  });

  it("fails a property under its minimum, and passes it at the minimum", () => {
    expect(verdict(record("a", 699), { minimums: { a: 700 } }, false)).toMatch(/Its minimum is 700 runs/);
    expect(verdict(record("a", 700), { minimums: { a: 700 } }, false)).toBeUndefined();
  });

  it("applies no minimum when it only collects the records", () => {
    expect(verdict(record("a", 1), { minimums: {} }, true)).toBeUndefined();
  });

  it("passes an ungated property and names it with its numbers, only when it reached its budget", () => {
    const gates = { minimums: {}, ungated: { a: { reason: "not gated (noise > worst)" as const, worst: 100, spread: 200 } } };
    expect(verdict(record("a", 5), gates, false)).toBeUndefined();
    expect(ungatedNote(record("a", 5), gates)).toBe('The property "a" is not gated (noise > worst): 5 of 1000000 runs, worst 100, spread 200. Add reps or a larger budget.');
    expect([ungatedNote(record("a", 1_000_000, { interrupted: false }), gates), ungatedNote(record("b", 5), gates)]).toEqual([undefined, undefined]);
    expect(verdict(record("b", 5), gates, false)).toMatch(/has no minimum/);
  });

  it("reads one record on each line, and skips the empty lines", () => {
    const text = `${JSON.stringify(record("a", 5))}\n\n${JSON.stringify(record("b", 6))}\n`;
    expect(parseRecords(text).map((r) => r.key)).toEqual(["a", "b"]);
  });

  it("gives the lower of the worst runs divided by 1.1 and the worst runs minus the spread, in sorted order", () => {
    const sets = Object.fromEntries([1000, 900, 1100, 950, 1200].map((n, i) => [`run-${String(i)}`, [record("z", n), record("a", n * 2), record("full", 1_000_000, { interrupted: false })]]));
    const m = deriveMinimums(sets);
    expect(m.minimums).toEqual({ a: 1200, z: 600 });
    expect(Object.keys(m.minimums)).toEqual(["a", "z"]);
    expect(m.sources).toHaveLength(5);
    expect(m.derivation).toMatch(/over 5 green runs/);
  });

  it("divides by 1.1 when the spread is small, and does not gate a property whose spread is as large as its worst runs", () => {
    expect(deriveMinimums(setsOf([1000, 1010, 1020, 1030, 1040])).minimums).toEqual({ a: 909 });
    const noisy = deriveMinimums(setsOf([100, 300, 300, 300, 300]));
    expect([noisy.minimums, noisy.ungated]).toEqual([{}, { a: { reason: "not gated (noise > worst)", worst: 100, spread: 200 } }]);
    expect(deriveMinimums(setsOf([100, 200, 200, 200, 200])).ungated).toEqual({ a: { reason: "not gated (noise > worst)", worst: 100, spread: 100 } });
  });

  it("takes a property that reached its budget in only some sets", () => {
    const sets = Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`run-${String(i)}`, [record("a", i === 0 ? 800 : 1_000_000, { interrupted: i === 0 })]]));
    expect(deriveMinimums(sets).minimums).toEqual({ a: 727 });
  });

  it("refuses fewer than 5 sets, a set with a failure, and a property not in each set", () => {
    const four = Object.fromEntries([0, 1, 2, 3].map((i) => [`run-${String(i)}`, [record("a", 9)]]));
    expect(() => deriveMinimums(four)).toThrow(/4 sets of records/);
    expect(() => deriveMinimums({ ...four, bad: [record("a", 9, { failed: true })] })).toThrow(/has a failure of "a"/);
    expect(() => deriveMinimums({ ...four, other: [record("b", 9)] })).toThrow(/"a" is in 4 of 5 sets/);
  });
});

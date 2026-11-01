// The tests of the measure helper against the decided points of the interface paired-time/1. A fake clock and a fake
// start of a child give exact times, so no test depends on the speed of the machine.
import { afterEach, describe, expect, it } from "vitest";
import { context, env, measureIsolated, type Arm, type ChildResult } from "./measure.ts";

/** This function gives arms whose timed run takes the given time on a fake clock. */
function fakeArms(costs: Readonly<Record<string, number>>): { arms: Arm<number>[]; clock: () => number } {
  let now = 0;
  const arms = Object.entries(costs).map(([id, cost]) => ({ id, run: (scale: number) => (now += cost * scale) }));
  return { arms, clock: () => now };
}

describe("measureIsolated, mode process", () => {
  it("puts the A/A arm last, and gives no ratio for the base", () => {
    const { arms, clock } = fakeArms({ hand: 2, vex: 6 });
    const r = measureIsolated({ arms, inputs: [{ id: "one", value: 1 }], repeats: 4, mode: "process", clock, env: env(), context: "test" });
    expect(r.arms).toEqual(["hand", "vex", "hand~aa"]);
    expect(Object.keys(r.ratios)).toEqual(["vex", "hand~aa"]);
    expect(r.inputs[0]?.ratio).toEqual({ vex: 3, "hand~aa": 1 });
    expect(r.noiseFloor).toEqual({ median: 1, p10: 1, p90: 1 });
    expect(r.context).toBe("test");
  });

  it("gives no ratio on an input whose base median is 0, and counts only the inputs with a ratio", () => {
    const { arms, clock } = fakeArms({ hand: 1, vex: 2 });
    const r = measureIsolated({ arms, inputs: [{ id: "zero", value: 0 }, { id: "one", value: 1 }], repeats: 2, mode: "process", clock });
    expect(r.inputs[0]?.ratio).toEqual({});
    expect(r.ratios["vex"]?.inputs).toBe(1);
    expect(r.ratios["vex"]?.median).toBe(2);
    expect(r.ratios["vex"]?.moved).toBe(1);
  });

  it("sorts the groups, and puts an input with no group in the group all", () => {
    const { arms, clock } = fakeArms({ hand: 1, vex: 2 });
    const inputs = [{ id: "a", group: "z", value: 1 }, { id: "b", value: 2 }, { id: "c", group: "m", value: 3 }];
    const r = measureIsolated({ arms, inputs, repeats: 1, mode: "process", clock, aa: false });
    expect(Object.keys(r.ratios["vex"]?.groups ?? {})).toEqual(["all", "m", "z"]);
    expect(r.ratios["vex"]?.moved).toBeNull();
    expect(r.noiseFloor).toBeNull();
  });

  it("refuses a peakRss that an arm gives in mode process", () => {
    const arms = [{ id: "a", run: () => ({ peakRss: 1 }) }, { id: "b", run: () => 0 }];
    expect(() => measureIsolated({ arms, inputs: [{ id: "one" }], repeats: 1, mode: "process" })).toThrow(/only in mode fresh/);
  });

  const a = { id: "a", run: () => 0 };
  const b = { id: "b", run: () => 0 };
  const arms = [a, b];
  const inputs = [{ id: "one" }];
  const bad: [string, () => unknown][] = [
    ["repeats", () => measureIsolated({ arms, inputs, repeats: 0, mode: "process" })],
    ["warmup", () => measureIsolated({ arms, inputs, repeats: 1, warmup: -1, mode: "process" })],
    ["no arm", () => measureIsolated({ arms: [], inputs, repeats: 1, mode: "process" })],
    ["one arm", () => measureIsolated({ arms: [a], inputs, repeats: 1, mode: "process", aa: false })],
    ["arm ids", () => measureIsolated({ arms: [a, a], inputs, repeats: 1, mode: "process" })],
    ["no run", () => measureIsolated({ arms: [{ id: "a" }, b], inputs, repeats: 1, mode: "process" })],
    ["no input", () => measureIsolated({ arms, inputs: [], repeats: 1, mode: "process" })],
    ["input ids", () => measureIsolated({ arms, inputs: [{ id: "x" }, { id: "x" }], repeats: 1, mode: "process" })],
    ["mode", () => measureIsolated({ arms, inputs, repeats: 1, mode: "other" as "process" })],
  ];
  it.each(bad)("throws a RangeError for a bad option: %s", (_name, f) => {
    expect(f).toThrow(RangeError);
  });
});

/** A fake child: the arm vex takes 4 ms and peaks at 9 bytes, and the base takes 2 ms with no peak. */
const startChild = async (command: readonly string[]): Promise<ChildResult> => (command[0] === "vex" ? { ms: 4, peakRss: 9 } : { ms: 2 });

describe("measureIsolated, mode fresh", () => {
  const vex = { id: "vex", command: ["vex"] };
  const arms = [{ id: "hand", command: ["hand"] }, vex];

  it("keeps the largest peak of each arm, and omits an arm with no peak", async () => {
    const r = await measureIsolated({ arms, inputs: [{ id: "one" }], repeats: 2, mode: "fresh", startChild });
    expect(r.inputs[0]?.peakRss).toEqual({ vex: 9 });
    expect(r.inputs[0]?.ratio).toEqual({ vex: 2, "hand~aa": 1 });
  });

  it("omits peakRss when no child gives one", async () => {
    const r = await measureIsolated({ arms, inputs: [{ id: "one" }], repeats: 1, mode: "fresh", startChild: async () => ({ ms: 1 }) });
    expect(r.inputs[0]).not.toHaveProperty("peakRss");
  });

  it("rejects the promise for a bad option", async () => {
    await expect(measureIsolated({ arms: [{ id: "hand" }, vex], inputs: [{ id: "one" }], repeats: 1, mode: "fresh" })).rejects.toThrow(RangeError);
  });
});

describe("env and context", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["BENCH_RUNNER", "RUNNER_NAME", "BENCH_MODE", "CI"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("takes RUNNER_NAME when BENCH_RUNNER is empty", () => {
    process.env["BENCH_RUNNER"] = "";
    process.env["RUNNER_NAME"] = "runner-7";
    expect(env().runner).toBe("runner-7");
  });

  it("gives ci for each non-empty CI, and local without it, when BENCH_MODE is empty", () => {
    process.env["BENCH_MODE"] = "";
    process.env["CI"] = "1";
    expect(context().split(" ")[0]).toBe("ci");
    delete process.env["CI"];
    expect(context().split(" ")[0]).toBe("local");
  });
});

import { programStep } from "@mark1russell7/vex";
import { describe, expect, it } from "vitest";
import { PILOTS } from "./programs.ts";

describe("the steps of the pilots", () => {
  it("STEP.LOWEST: each program of the pilots is of step A", () => {
    const steps = Object.fromEntries(PILOTS.map(([name, e]) => [name, programStep(e).step]));
    expect(Object.keys(steps).length).toBeGreaterThan(20);
    expect(Object.entries(steps).filter(([, step]) => step !== "A")).toEqual([]);
  });
});

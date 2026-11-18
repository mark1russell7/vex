// The tests of the machine and context fields of a bench record. The paired comparison has its tests in paired.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { context, env } from "./measure.ts";

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

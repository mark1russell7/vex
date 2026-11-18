// The tests of the first line of a bench record. benchEnv has its tests in rigor-bench, and the paired comparison in paired.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { context, envLine } from "./measure.ts";

describe("context and envLine", () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["BENCH_MODE", "CI"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("gives ci for each non-empty CI, and local without it, when BENCH_MODE is empty", () => {
    process.env["BENCH_MODE"] = "";
    process.env["CI"] = "1";
    expect(context().split(" ")[0]).toBe("ci");
    delete process.env["CI"];
    expect(context().split(" ")[0]).toBe("local");
  });

  it("gives the machine, the mode and the context in one line", () => {
    process.env["BENCH_MODE"] = "probe";
    const line = envLine("fresh", { cpu: "AMD EPYC 7763 64-Core Processor", cores: 4, os: "linux", arch: "x64", node: "v24.11.0" });
    expect(line).toBe(`runner: AMD EPYC 7763 64-Core Processor (4 cores), Node.js v24.11.0, linux/x64, mode fresh, ${["probe", ...process.execArgv].join(" ")}`);
  });
});

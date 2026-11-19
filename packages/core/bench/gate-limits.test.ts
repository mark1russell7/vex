import { limitVerdict, type PairedTime } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { CORE_LIMITS, coreReadLine, noiseReason, type CoreLimits } from "./gate-limits.ts";

/** This function gives one record for each ratio `b / a`, with `a` 1 ms and the first arm turning each round. */
const records = (ratios: readonly number[]): PairedTime[] => ratios.map((r, round) => ({ case: "one", round, first: round % 2 === 0 ? "a" : "b", a: 1, b: r }));

const ROUNDS = 16;
const PAIRS = records(Array.from({ length: ROUNDS }, (_, i) => 20 * (1 + (i % 2 === 0 ? 0.01 : -0.01))));
const QUIET = records(Array.from({ length: ROUNDS }, (_, i) => 1 + (i % 2 === 0 ? 0.01 : -0.01)));
const NOISY = records(Array.from({ length: ROUNDS }, (_, i) => 1 + (i % 2 === 0 ? 0.3 : -0.3)));
const BIASED = records(Array.from({ length: ROUNDS }, (_, i) => 1.2 + (i % 2 === 0 ? 0.001 : -0.001)));

/** This function gives the reason of `noiseReason` for the A/A records `aa` and the limits `limits`. */
const reasonOf = (aa: readonly PairedTime[], limits: CoreLimits): string | undefined => {
  const { noiseCap } = limits;
  const c = limitVerdict(PAIRS, aa, { limit: limits.limit, aaFrom: "rounds", ...(noiseCap === undefined ? {} : { noiseCap }) }).cases[0];
  return noiseReason(c, limits);
};

describe("gate-limits", () => {
  it("lets a case with no noise cap decide, also on a noisy run", () => {
    expect(reasonOf(NOISY, { limit: 23.4 })).toBeUndefined();
  });

  it("lets a quiet run decide under its noise cap", () => {
    expect(reasonOf(QUIET, { limit: 23.4, noiseCap: 0.05 })).toBeUndefined();
  });

  it("gives a reason for a run with an A/A spread above the noise cap", () => {
    expect(reasonOf(NOISY, { limit: 23.4, noiseCap: 0.05 })).toMatch(/^the A\/A rounds are out of the noise cap 0\.05: spread 0\.\d{4}, median ratio [01]\.\d{4}$/u);
  });

  it("gives a reason for a run with an A/A median out of the band of the noise cap", () => {
    expect(reasonOf(BIASED, { limit: 23.4, noiseCap: 0.05 })).toMatch(/^the A\/A rounds are out of the noise cap 0\.05: spread 0\.18\d{2}, median ratio 1\.2000$/u);
  });

  it("gives a reason for a verdict with no case", () => {
    expect(noiseReason(undefined, { limit: 23.4 })).toBe("the limit verdict has no case");
  });

  it("gives the read line as JSON at full precision", () => {
    const read = { case: "nearest", ratio: 14.812_345_6, aa: { case: "one", median: 0.001_234_5, spread: 0.023_456_7, rounds: 16 }, bound: 15.451_234, limits: CORE_LIMITS.nearest } as const;
    expect(coreReadLine(read)).toBe(`read ${JSON.stringify(read)}`);
    expect(JSON.parse(coreReadLine(read).slice("read ".length))).toEqual(read);
  });
});

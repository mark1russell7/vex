// The tests of the paired comparison of the speed gates. A fake clock gives exact times, so no test depends on the
// speed of the machine.
import { armOrder } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { batchMs, paired } from "./paired.ts";

/** This function gives two functions whose calls move a fake clock by `costA` and `costB` milliseconds. */
function fake(costA: number, costB: number): { a: () => void; b: () => void; now: () => number } {
  let t = 0;
  return { a: () => void (t += costA), b: () => void (t += costB), now: () => t };
}

describe("paired", () => {
  it("gives the ratio of a over b, the time of one call in µs and an A/A noise of 1", () => {
    const { a, b, now } = fake(3, 1);
    const r = paired(a, b, { repeats: 4, targetMs: 10, now });
    expect(r.ratio).toBe(3);
    expect(r.a).toBe(3000);
    expect(r.b).toBe(1000);
    expect(r.noise).toEqual({ p10: 1, p90: 1 });
    // A batch of the base takes from targetMs to 2 times targetMs.
    expect(r.rounds.count).toBe(16);
  });

  it("turns the order of the arms at each round, and keeps one pair for each round", () => {
    const { a, b, now } = fake(2, 1);
    const r = paired(a, b, { repeats: 5, targetMs: 4, now });
    expect(r.rounds.orders).toEqual([0, 1, 2, 3, 4].map((round) => armOrder(["b", "a", "b~aa"], round)));
    expect(r.rounds.pairs["a"]).toHaveLength(5);
    expect(r.rounds.pairs["b~aa"]).toHaveLength(5);
  });

  it("gives a span time equal to the time of its pair", () => {
    const { a, b, now } = fake(5, 2);
    const r = paired(a, b, { repeats: 3, targetMs: 8, now });
    r.rounds.orders.forEach((order, round) => {
      const span = (id: string) => {
        const s = r.rounds.spans[round]?.[order.indexOf(id)];
        return s === undefined ? Number.NaN : s.end - s.start;
      };
      expect(span("b")).toBe(r.rounds.pairs["a"]?.[round]?.a);
      expect(span("a")).toBe(r.rounds.pairs["a"]?.[round]?.b);
    });
  });
});

describe("batchMs", () => {
  it("divides the time of the slower arm by the limit, with a limit of 1 or more", () => {
    expect(batchMs(30, 15)).toBe(2);
    expect(batchMs(30, 0.5)).toBe(30);
  });
});

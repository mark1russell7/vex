/**
 * The tests of the global settings of `fc-setup.ts`, the setup file of the property tests. The setup runs before this
 * file, as it runs before each file of tests of the packages that name it.
 */
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

describe("the global settings of fast-check", () => {
  it("V-095: the setup clears the records of each spy before each run of a property", () => {
    const spy = vi.fn<(n: number) => number>((n) => n);
    let runs = 0;
    fc.assert(
      fc.property(fc.nat(), (n) => {
        runs += 1;
        spy(n);
        spy(n + 1);
      }),
      { numRuns: 20 },
    );
    expect(runs).toBe(20);
    // Without the hook of the setup, the records hold the 2 calls of each of the 20 runs, so 40.
    expect(spy.mock.calls.length).toBe(2);
  });

  it("V-095: the hook of the setup also clears the records of a spy before each run of an async property", async () => {
    const spy = vi.fn<(n: number) => number>((n) => n);
    let runs = 0;
    await fc.assert(
      fc.asyncProperty(fc.nat(), async (n) => {
        runs += 1;
        spy(await Promise.resolve(n));
      }),
      { numRuns: 20 },
    );
    expect(runs).toBe(20);
    expect(spy.mock.calls.length).toBe(1);
  });
});

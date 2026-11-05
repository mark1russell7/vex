/**
 * This file is the property of the flip of the gate of the minimum runs (`scripts/gate-flip.ts`). Each run of the
 * property waits for 1 ms, so a time budget of 300 ms stops it before its target. The flip gives the property a
 * minimum that it reaches and a minimum that it cannot reach. The normal test runs do not read this file.
 */
import * as fc from "fast-check";
import { it } from "vitest";

// oxlint-disable-next-line vitest/expect-expect -- the check is fc.assert, and the setup reads its time budget.
it("the property of the budget flip", () => {
  fc.assert(
    fc.property(fc.nat(), () => {
      const end = performance.now() + 1;
      while (performance.now() < end);
    }),
  );
});

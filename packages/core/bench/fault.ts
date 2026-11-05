/**
 * The fault of a flip test (`scripts/gate-flip.ts`). A flip test shows that a gate of a measure can fail. The same job
 * reads the gate on a clean copy and with a known cost, and only the second read must fail.
 *
 * `GATE_FAULT_TIMES` sets the count of calls of the measured arm in each measured call. A count of 4 makes the arm 4
 * times slower with no other change. With no setting, this function gives the arm itself, so a normal read of a gate
 * measures the code that it measured before.
 */

import process from "node:process";

/** This function gives the measured arm of a gate, with the fault of a flip test when the environment sets one. */
export function withFault(run: () => void): () => void {
  const setting = process.env["GATE_FAULT_TIMES"];
  if (setting === undefined) return run;
  const times = Number(setting);
  if (!Number.isInteger(times) || times < 2) throw new RangeError(`GATE_FAULT_TIMES is "${setting}", not a whole number of 2 or more.`);
  return () => {
    for (let i = 0; i < times; i++) run();
  };
}

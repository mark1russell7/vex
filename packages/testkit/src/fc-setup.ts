/**
 * The global fast-check settings of the test runs. The variable `FC_SEED` sets the seed, so a failure in CI can
 * run again with the same values. The variable `FC_NUM_RUNS` sets the number of runs (the nightly run uses
 * 10000). Without `FC_SEED`, each run gets a new seed, and the setup prints it.
 *
 * The variable `FC_TIME_LIMIT_MS` gives each property a time budget (the weekly run of one million runs). A property
 * that reaches the budget stops without a failure, and the setup prints the number of its runs. A counterexample
 * found before the budget is a failure, as without a budget.
 */
import * as fc from "fast-check";

const seed = Number(process.env["FC_SEED"] ?? Math.floor(Math.random() * 2 ** 31));
const numRuns = Number(process.env["FC_NUM_RUNS"] ?? 200);
const limit = process.env["FC_TIME_LIMIT_MS"] === undefined ? undefined : Number(process.env["FC_TIME_LIMIT_MS"]);
fc.configureGlobal({
  seed,
  numRuns,
  ...(limit === undefined
    ? {}
    : {
        interruptAfterTimeLimit: limit,
        markInterruptAsFailure: false,
        // This reporter replaces the default one, so it throws for a failure as the default does.
        reporter: (details: fc.RunDetails<unknown>): void => {
          if (details.failed) throw new Error(fc.defaultReportMessage(details));
          if (details.interrupted) console.info(`fast-check: the time budget of ${String(limit)} ms stopped a property after ${String(details.numRuns)} of ${String(numRuns)} runs`);
        },
      }),
});
console.info(`fast-check seed ${seed}, ${numRuns} runs${limit === undefined ? "" : `, at most ${String(limit)} ms for each property`} (set FC_SEED to repeat)`);

/**
 * The global fast-check settings of the test runs. The variable `FC_SEED` sets the seed, so a failure in CI can
 * run again with the same values. The variable `FC_NUM_RUNS` sets the number of runs (the nightly run uses
 * 10000). Without `FC_SEED`, each run gets a new seed, and the setup prints it.
 *
 * The variable `FC_TIME_LIMIT_MS` gives each property a time budget (the weekly run of one million runs). A property
 * that reaches the budget fails when it did fewer runs than its minimum in the file of `FC_MIN_RUNS_FILE`
 * (`fc-budget.ts`). An ungated property passes, and the run names it in its log and in its job summary. With
 * `FC_RECORD_ONLY`, no minimum applies. `FC_RECORD_FILE` gets one record for each property, and
 * `scripts/weekly-summary.ts` counts these records for the job summary.
 * A counterexample is a failure, as without a budget.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import * as fc from "fast-check";
import { expect } from "vitest";
import { ungatedNote, verdict, type Gates, type RunRecord } from "./fc-budget.ts";

const seed = Number(process.env["FC_SEED"] ?? Math.floor(Math.random() * 2 ** 31));
const numRuns = Number(process.env["FC_NUM_RUNS"] ?? 200);
const limit = process.env["FC_TIME_LIMIT_MS"] === undefined ? undefined : Number(process.env["FC_TIME_LIMIT_MS"]);

/** This function gives the reporter of a run with a time budget. It replaces the default one, so it throws for a failure as the default does. */
function budgetReporter(budget: number): (details: fc.RunDetails<unknown>) => void {
  const file = process.env["FC_MIN_RUNS_FILE"];
  const gates: Gates = file === undefined ? { minimums: {} } : (JSON.parse(readFileSync(file, "utf8")) as Gates);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  const recordOnly = Boolean(process.env["FC_RECORD_ONLY"]);
  const out = process.env["FC_RECORD_FILE"];
  const cpu = cpus()[0]?.model.trim() || "unknown";
  // A test can have more than one property, so the key has the place of the property in its test.
  const seen = new Map<string, number>();
  return (details) => {
    const test = `${process.env["npm_package_name"] ?? "?"} > ${expect.getState().currentTestName ?? "?"}`;
    const place = seen.get(test) ?? 0;
    seen.set(test, place + 1);
    const record: RunRecord = { key: place === 0 ? test : `${test} #${String(place + 1)}`, runs: details.numRuns, target: numRuns, interrupted: details.interrupted, failed: details.failed, cpu };
    if (out !== undefined) appendFileSync(out, `${JSON.stringify(record)}\n`);
    if (details.failed) throw new Error(fc.defaultReportMessage(details));
    if (details.interrupted) console.info(`fast-check: the time budget of ${String(budget)} ms stopped "${record.key}" after ${String(details.numRuns)} of ${String(numRuns)} runs`);
    const note = ungatedNote(record, gates);
    if (note !== undefined) {
      console.info(`fast-check: ${note}`);
      if (summary !== undefined) appendFileSync(summary, `- ${note}
`);
    }
    const message = verdict(record, gates, recordOnly);
    if (message !== undefined) throw new Error(message);
  };
}

fc.configureGlobal({
  seed,
  numRuns,
  ...(limit === undefined ? {} : { interruptAfterTimeLimit: limit, markInterruptAsFailure: false, reporter: budgetReporter(limit) }),
});
console.info(`fast-check seed ${seed}, ${numRuns} runs${limit === undefined ? "" : `, at most ${String(limit)} ms for each property`} (set FC_SEED to repeat)`);

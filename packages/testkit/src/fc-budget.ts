/**
 * The minimum of runs of the weekly long run (`docs/QUALITY-PLAN.md` §8). Each property has a time budget. A property
 * that reaches its budget fails when it did fewer runs than its minimum. The minimum comes from 5 or more green runs of
 * the weekly, with the margin on the safe side (rule 1e10f489 of the strategist). This module is not a part of the API
 * of the test kit: `fc-setup.ts` and `scripts/weekly-minimums.ts` use it.
 */

/** The record of one property in one run of the weekly. */
export interface RunRecord {
  /** The package, the name of the test and the place of the property in the test. */
  readonly key: string;
  /** The number of runs that the property did. */
  readonly runs: number;
  /** The number of runs that the property must do. */
  readonly target: number;
  /** This value is `true` when the time budget stopped the property. */
  readonly interrupted: boolean;
  /** This value is `true` when the property found a counterexample. */
  readonly failed: boolean;
  /** The model of the CPU of the runner. */
  readonly cpu: string;
}

/** The minimums of runs, with their derivation. */
export interface Minimums {
  readonly schema: "weekly-runs/1";
  /** The rule that gives each minimum. */
  readonly derivation: string;
  /** The sets of records that gave the minimums. */
  readonly sources: readonly string[];
  /** The minimum of runs of each property that reached its budget in a source. */
  readonly minimums: Readonly<Record<string, number>>;
  /** This field names each property whose noise is as large as its worst number of runs. Each run names it again. */
  readonly ungated: Readonly<Record<string, Ungated>>;
}

/**
 * A property without a minimum, because the spread of its runs is as large as its worst number of runs. A minimum of 0
 * cannot fail, so the file names the property, as "cannot decide" in rule a2aa4cec. More reps or a larger budget fix it.
 */
export interface Ungated {
  readonly reason: "not gated (noise > worst)";
  /** The worst number of runs over the sets. */
  readonly worst: number;
  /** The largest minus the smallest number of runs of the sets where the budget stopped the property. */
  readonly spread: number;
}

/** These are the parts of `Minimums` that a run of the weekly reads. A file without `ungated` has no ungated property. */
export type Gates = Pick<Minimums, "minimums"> & Partial<Pick<Minimums, "ungated">>;

/** The number of green runs that a derivation needs. */
export const minimumSources = 5;
/** The margin of a minimum: the worst number of runs, divided by 1.1. */
export const minimumMargin = 1.1;
/** The words at the start of the message of a property with no minimum. Such a message tells of the file of the minimums, and not of the code. */
const noMinimumYet = "no minimums yet";

/**
 * This function gives the message of a failure for a record, or `undefined` when the record passes. With `recordOnly`,
 * no minimum applies: the runs that collect the records use it. An ungated property passes, and `ungatedNote` names it.
 */
export function verdict(record: RunRecord, gates: Gates, recordOnly: boolean): string | undefined {
  if (!record.interrupted || recordOnly || gates.ungated?.[record.key] !== undefined) return undefined;
  const least = gates.minimums[record.key];
  const done = `The property "${record.key}" stopped at its time budget after ${String(record.runs)} of ${String(record.target)} runs`;
  if (least === undefined) return `${noMinimumYet}: ${done}, and it has no minimum of runs. Derive the minimums with scripts/weekly-minimums.ts.`;
  return record.runs < least ? `${done}. Its minimum is ${String(least)} runs.` : undefined;
}

/**
 * This function gives the lines of the summary of a run. The counts are apart, so a file with no minimums does not
 * read as a fault of the code. Each failed property has a line with its key.
 */
export function runSummary(records: readonly RunRecord[], gates: Gates, recordOnly: boolean): string[] {
  const failed = records.filter((r) => r.failed);
  const messages = records.filter((r) => !r.failed).flatMap((r) => verdict(r, gates, recordOnly) ?? []);
  const waiting = messages.filter((m) => m.startsWith(noMinimumYet)).length;
  return [
    `- Failed properties, each with a counterexample: ${String(failed.length)} of ${String(records.length)}.`,
    ...failed.map((r) => `  - ${r.key}`),
    `- Properties under their minimum of runs: ${String(messages.length - waiting)}.`,
    `- Properties that stopped at the budget, with ${noMinimumYet}: ${String(waiting)}.`,
  ];
}

/** This function gives the note of a record of an ungated property that reached its budget, or `undefined`. */
export function ungatedNote(record: RunRecord, gates: Gates): string | undefined {
  const u = gates.ungated?.[record.key];
  if (!record.interrupted || u === undefined) return undefined;
  return `The property "${record.key}" is ${u.reason}: ${String(record.runs)} of ${String(record.target)} runs, worst ${String(u.worst)}, spread ${String(u.spread)}. Add reps or a larger budget.`;
}

/** This function reads the records of one file, one JSON object on each line. */
export function parseRecords(text: string): RunRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunRecord);
}

/**
 * This function gives the minimums from the sets of records, one set for each green run of the weekly. The sets are
 * A/A runs, so their spread is the noise. A minimum is the lower of the worst number of runs divided by 1.1, and the
 * worst number minus the spread. The spread comes from the sets where the budget stopped the property. A count at the
 * target is not a measure of the speed. The result is rounded down. A result under 1 cannot fail, so the property
 * goes to `ungated` with its numbers.
 *
 * Only a property that reached its budget in a set gets a minimum. A property must be in each set. Fewer than 5 sets, a
 * set with a failure, or a property not in each set throws a `RangeError`.
 */
export function deriveMinimums(sets: Readonly<Record<string, readonly RunRecord[]>>): Minimums {
  const sources = Object.keys(sets);
  if (sources.length < minimumSources) throw new RangeError(`weekly-minimums: ${String(sources.length)} sets of records. A derivation needs ${String(minimumSources)} or more.`);
  const runs = new Map<string, number[]>();
  const stopped = new Map<string, number[]>();
  for (const source of sources) {
    for (const r of sets[source] ?? []) {
      if (r.failed) throw new RangeError(`weekly-minimums: the set ${source} has a failure of "${r.key}". Use only green runs.`);
      runs.set(r.key, [...(runs.get(r.key) ?? []), r.runs]);
      if (r.interrupted) stopped.set(r.key, [...(stopped.get(r.key) ?? []), r.runs]);
    }
  }
  const keys = [...stopped.keys()];
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  // oxlint-disable-next-line unicorn/no-array-sort
  keys.sort();
  const minimums: Record<string, number> = {};
  const ungated: Record<string, Ungated> = {};
  for (const key of keys) {
    const xs = runs.get(key) ?? [];
    if (xs.length !== sources.length) throw new RangeError(`weekly-minimums: the property "${key}" is in ${String(xs.length)} of ${String(sources.length)} sets.`);
    const measured = stopped.get(key) ?? [];
    const worst = Math.min(...xs);
    const spread = Math.max(...measured) - Math.min(...measured);
    const least = Math.floor(Math.min(worst / minimumMargin, worst - spread));
    if (least >= 1) minimums[key] = least;
    else ungated[key] = { reason: "not gated (noise > worst)", worst, spread };
  }
  return {
    schema: "weekly-runs/1",
    derivation: `For each property over ${String(sources.length)} green runs of the weekly: the lower of the worst number of runs divided by ${String(minimumMargin)}, and the worst number minus the spread of the runs that the budget stopped, rounded down (rule 1e10f489). A property with a spread as large as its worst number is not gated: ungated names it.`,
    sources,
    minimums,
    ungated,
  };
}

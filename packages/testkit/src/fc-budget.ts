/**
 * The minimum of runs of the weekly long run (`docs/QUALITY-PLAN.md` §8). Each property has a time budget. A property
 * that reaches its budget fails when it did fewer runs than its minimum. The minimum of a property is the worst
 * number of runs of 5 or more green runs of the weekly, times 0.9. This module is not a part of the API of the test
 * kit: `fc-setup.ts` and `scripts/weekly-minimums.ts` use it.
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
}

/** The number of green runs that a derivation needs. */
export const minimumSources = 5;
/** The part of the worst number of runs that a minimum keeps. */
export const minimumFactor = 0.9;

/**
 * This function gives the message of a failure for a record, or `undefined` when the record passes. With `recordOnly`,
 * no minimum applies: the runs that collect the records use it.
 */
export function verdict(record: RunRecord, minimums: Readonly<Record<string, number>>, recordOnly: boolean): string | undefined {
  if (!record.interrupted || recordOnly) return undefined;
  const least = minimums[record.key];
  const done = `The property "${record.key}" stopped at its time budget after ${String(record.runs)} of ${String(record.target)} runs`;
  if (least === undefined) return `${done}, and it has no minimum of runs. Derive the minimums with scripts/weekly-minimums.ts.`;
  return record.runs < least ? `${done}. Its minimum is ${String(least)} runs.` : undefined;
}

/** This function reads the records of one file, one JSON object on each line. */
export function parseRecords(text: string): RunRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RunRecord);
}

/**
 * This function gives the minimums from the sets of records, one set for each green run of the weekly. A minimum is the
 * worst number of runs of a property over the sets, times 0.9. Only a property that reached its budget in a set gets one. A
 * property must be in each set. Fewer than 5 sets, a set with a failure, or a property not in each set throws a
 * `RangeError`.
 */
export function deriveMinimums(sets: Readonly<Record<string, readonly RunRecord[]>>): Minimums {
  const sources = Object.keys(sets);
  if (sources.length < minimumSources) throw new RangeError(`weekly-minimums: ${String(sources.length)} sets of records. A derivation needs ${String(minimumSources)} or more.`);
  const runs = new Map<string, number[]>();
  const stopped = new Set<string>();
  for (const source of sources) {
    for (const r of sets[source] ?? []) {
      if (r.failed) throw new RangeError(`weekly-minimums: the set ${source} has a failure of "${r.key}". Use only green runs.`);
      runs.set(r.key, [...(runs.get(r.key) ?? []), r.runs]);
      if (r.interrupted) stopped.add(r.key);
    }
  }
  const keys = [...stopped];
  // The type-aware lint does not have Array#toSorted, and sort() changes only the copy.
  // oxlint-disable-next-line unicorn/no-array-sort
  keys.sort();
  const minimums: Record<string, number> = {};
  for (const key of keys) {
    const xs = runs.get(key) ?? [];
    if (xs.length !== sources.length) throw new RangeError(`weekly-minimums: the property "${key}" is in ${String(xs.length)} of ${String(sources.length)} sets.`);
    minimums[key] = Math.floor(Math.min(...xs) * minimumFactor);
  }
  return {
    schema: "weekly-runs/1",
    derivation: `The worst number of runs of each property over ${String(sources.length)} green runs of the weekly, times ${String(minimumFactor)}, rounded down.`,
    sources,
    minimums,
  };
}

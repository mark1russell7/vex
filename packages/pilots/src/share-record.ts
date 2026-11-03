/// <reference types="node" />
/**
 * The record of the share of tier 2 for each source of programs (roadmap item CORPUSGATE). The file `share-record.json`
 * of this package keeps the record. A test computes the public rows again, and it fails when a share is lower than its
 * record. The script `bench/share-record.ts` writes the public rows again.
 */
import { readFileSync } from "node:fs";
import { corpusCases, readCorpora, type Corpus } from "./corpus.ts";
import { pilotCases, sheetCases } from "./fallback-cases.ts";
import { measureShare, type ReasonCount, type ShareCase } from "./fallback-share.ts";

/** The seed of the random inputs of the pilots in the record. */
export const RECORD_SEED = 1;
/** The factor for the number of random inputs of the pilots in the record. The value 1 gives the runs of their tests, in less than 1 second. */
export const RECORD_SCALE = 1;

/** One row of the record: the counts of one source of programs. */
export interface ShareRow {
  readonly source: string;
  readonly programs: number;
  readonly tier2: number;
  readonly programShare: number;
  readonly runs: number;
  readonly valueRuns: number;
  readonly tier2ValueRuns: number;
  readonly valueShare: number;
  readonly tier1Reasons: readonly ReasonCount[];
  /** The value `false` marks a row that CI does not compute: a private source, measured on a local computer. */
  readonly ci?: false;
  /** A note on the row. */
  readonly note?: string;
}

/** The record: the inputs of the public rows, and the rows. */
export interface ShareRecord {
  readonly seed: number;
  readonly scale: number;
  readonly rows: readonly ShareRow[];
}

/** The file of the record. */
export const RECORD_FILE: URL = new URL("../share-record.json", import.meta.url);

/** This function reads the record. */
export function readRecord(file: URL = RECORD_FILE): ShareRecord {
  return JSON.parse(readFileSync(file, "utf8")) as ShareRecord;
}

/** This function measures the cases of one source, and it gives its row. A case that throws makes an error. */
export function shareRow(source: string, cases: readonly ShareCase[]): ShareRow {
  const report = measureShare(cases);
  if (report.skipped.length > 0) throw new Error(`${source}: a case threw: ${report.skipped.map((s) => `${s.name}: ${s.reason}`).join("; ")}`);
  const t = report.totals;
  return {
    source,
    programs: t.programs,
    tier2: t.tier2,
    programShare: t.programShare,
    runs: t.runs,
    valueRuns: t.valueRuns,
    tier2ValueRuns: t.tier2ValueRuns,
    valueShare: t.valueShare,
    tier1Reasons: t.tier1Reasons,
  };
}

/** This function computes the public rows: the pilots, the example sheets, and each corpus file. */
export function publicRows(corpora: readonly Corpus[] = readCorpora()): ShareRow[] {
  return [
    shareRow("pilots", pilotCases({ seed: RECORD_SEED, scale: RECORD_SCALE })),
    shareRow("example sheets", sheetCases()),
    ...corpora.map((c) => shareRow(c.source, corpusCases(c))),
  ];
}

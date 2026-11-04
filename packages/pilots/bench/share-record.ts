/**
 * The script of the record of the share of tier 2 (roadmap item CORPUSGATE). It computes the public rows again, and it
 * writes them to `packages/pilots/share-record.json`. It keeps each row with `ci: false` as it is.
 *
 * Start it with `pnpm --filter @vex/pilots run share-record`. It needs Node 24 or later, for the type stripping.
 */
import { writeFileSync } from "node:fs";
import { publicRows, readRecord, RECORD_FILE, RECORD_SCALE, RECORD_SEED, type ShareRow } from "../src/share-record.ts";

const start = performance.now();
const rows = publicRows();
const ms = performance.now() - start;
let kept: readonly ShareRow[] = [];
try {
  kept = readRecord().rows.filter((r) => r.ci === false);
} catch {
  // The first run has no record.
}
writeFileSync(RECORD_FILE, `${JSON.stringify({ seed: RECORD_SEED, scale: RECORD_SCALE, rows: [...rows, ...kept] }, null, 2)}\n`);
for (const r of rows) {
  console.log(`${r.source}: ${String(r.tier2)} of ${String(r.programs)} programs, ${(r.programShare * 100).toFixed(1)} %; ${String(r.tier2ValueRuns)} of ${String(r.valueRuns)} values, ${(r.valueShare * 100).toFixed(1)} %`);
}
console.log(`The public rows took ${ms.toFixed(0)} ms.`);

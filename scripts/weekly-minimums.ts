/**
 * This script derives the minimums of runs of the weekly long run, and writes them to `spec/weekly-runs.json`.
 * Download the records of 5 or more green runs first, one folder for each run:
 * `gh run download <id> -p "weekly-runs-*" -D runs/<id>`. Then start `pnpm exec tsx scripts/weekly-minimums.ts runs/*`.
 * Each file `runs-rep<k>.jsonl` of a folder is a part of the set `<folder>-rep<k>`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { deriveMinimums, parseRecords, type RunRecord } from "../packages/testkit/src/fc-budget.ts";

/** This function gives the paths of the record files under a folder. */
function recordFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? recordFiles(join(dir, e.name)) : /^runs-rep\d+\.jsonl$/.test(e.name) ? [join(dir, e.name)] : []));
}

const sets: Record<string, RunRecord[]> = {};
for (const dir of process.argv.slice(2)) {
  for (const file of recordFiles(dir)) {
    const set = `${basename(dir)}-${basename(file, ".jsonl").replace("runs-", "")}`;
    sets[set] = [...(sets[set] ?? []), ...parseRecords(readFileSync(file, "utf8"))];
  }
}
const minimums = deriveMinimums(sets);
writeFileSync("spec/weekly-runs.json", `${JSON.stringify(minimums, null, 2)}\n`);
console.info(`weekly-minimums: ${String(Object.keys(minimums.minimums).length)} minimums from ${String(minimums.sources.length)} sets`);
for (const [key, u] of Object.entries(minimums.ungated)) console.info(`weekly-minimums: "${key}" is ${u.reason}: worst ${String(u.worst)}, spread ${String(u.spread)}`);

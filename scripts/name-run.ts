/**
 * The record of the name run. It prints each property of a record file with its draws. It fails on a failed property.
 * It also fails when the time budget stopped a property before its target. A run with no record also fails. Start
 * `node scripts/name-run.ts <records> <seed>`.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseRecords } from "../packages/testkit/src/fc-budget.ts";

const [file, seed] = process.argv.slice(2);
const records = file !== undefined && existsSync(file) ? parseRecords(readFileSync(file, "utf8")) : [];
for (const r of records) console.info(`name-run: seed ${String(seed)}, ${String(r.runs)} of ${String(r.target)} draws, failed ${String(r.failed)}: ${r.key}`);
const short = records.filter((r) => r.failed || r.runs < r.target);
console.info(`name-run: seed ${String(seed)}, ${String(records.length)} properties, ${String(short.length)} short or failed`);
process.exitCode = records.length === 0 || short.length > 0 ? 1 : 0;

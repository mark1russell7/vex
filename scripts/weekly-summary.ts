/**
 * This script writes the counts of one job of the weekly long run. Start it with the file of the records and the file of
 * the minimums. A job that stopped before its first property has no file of records, and then the script writes a line that tells this.
 */
import { existsSync, readFileSync } from "node:fs";
import { parseRecords, runSummary, type Gates } from "../packages/testkit/src/fc-budget.ts";

const [recordFile, gateFile] = process.argv.slice(2) as [string, string];
if (existsSync(recordFile)) {
  const gates = JSON.parse(readFileSync(gateFile, "utf8")) as Gates;
  for (const line of runSummary(parseRecords(readFileSync(recordFile, "utf8")), gates, Boolean(process.env["FC_RECORD_ONLY"]))) console.info(line);
} else console.info("- This job has no records of properties.");

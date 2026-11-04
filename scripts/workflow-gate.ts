/**
 * The gate that a workflow does not hide a failed test and does not make a record with no gate. It reads each file of
 * `.github/workflows`, and it fails on each place that `workflowFaults` finds. Start `node scripts/workflow-gate.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { workflowFaults } from "../packages/testkit/src/workflow-faults.ts";

const DIR = ".github/workflows";
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/u.test(f));
const faults = files.flatMap((f) => workflowFaults(readFileSync(`${DIR}/${f}`, "utf8")).map((x) => `${f}: ${x}`));
for (const fault of faults) console.error(`workflow-gate: ${fault}`);
console.info(`workflow-gate: ${String(files.length)} workflows, ${String(faults.length)} faults`);
process.exitCode = faults.length === 0 ? 0 : 1;

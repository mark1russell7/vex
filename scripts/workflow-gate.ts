/**
 * The gate that a workflow does not hide a failed test and that a run by hand starts the gate. It reads each file of
 * `.github/workflows`, and it fails on each place that `workflowFaults` finds. Start `node scripts/workflow-gate.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { listFaults, workflowFaults } from "../packages/testkit/src/workflow-faults.ts";

const DIR = ".github/workflows";
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/u.test(f));
const texts = new Map(files.map((f) => [f, readFileSync(`${DIR}/${f}`, "utf8")]));
const faults = [...[...texts].flatMap(([f, text]) => workflowFaults(text, f).map((x) => `${f}: ${x}`)), ...listFaults(texts)];
for (const fault of faults) console.error(`workflow-gate: ${fault}`);
console.info(`workflow-gate: ${String(files.length)} workflows, ${String(faults.length)} faults`);
process.exitCode = faults.length === 0 ? 0 : 1;

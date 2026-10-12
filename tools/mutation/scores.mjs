// This script reads the report of Stryker and gives the mutation score of each package. Stryker has one threshold
// for all files, so its own break is off, and this script applies the threshold of 95 % to each package
// (docs/QUALITY-PLAN.md). A run that mutates only some packages (with --mutate) gets the gate for those packages.
// The score counts the killed and the timed-out mutants, out of the mutants that a test covers or that survive.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @typedef {{ status: string, mutatorName: string, location: { start: { line: number } } }} Mutant */
/** @typedef {{ files: Record<string, { mutants: Mutant[] }> }} Report */
/** @typedef {{ detected: number, valid: number, survived: string[] }} Total */

const BREAK = 95;
// The packages with the gate: the three published packages.
const GATED = new Set(["core", "domains", "testkit"]);
const report = /** @type {Report} */ (JSON.parse(readFileSync(fileURLToPath(new URL("../../reports/mutation/mutation.json", import.meta.url)), "utf8")));
/** @type {Map<string, Total>} */
const totals = new Map();
for (const [file, data] of Object.entries(report.files)) {
  const pkg = /work[\\/](\w+)[\\/]/.exec(file)?.[1] ?? "other";
  const t = totals.get(pkg) ?? { detected: 0, valid: 0, survived: [] };
  for (const m of data.mutants) {
    if (m.status === "Killed" || m.status === "Timeout") t.detected++;
    if (m.status === "Killed" || m.status === "Timeout" || m.status === "Survived" || m.status === "NoCoverage") t.valid++;
    if (m.status === "Survived" || m.status === "NoCoverage") t.survived.push(`${file.replace(/.*work[\\/]/, "")}:${m.location.start.line} ${m.mutatorName}`);
  }
  totals.set(pkg, t);
}
let failed = false;
for (const [pkg, t] of totals) {
  const score = t.valid === 0 ? 100 : (100 * t.detected) / t.valid;
  const gated = GATED.has(pkg);
  console.info(`${pkg}: ${score.toFixed(2)} % (${t.detected} of ${t.valid}, ${t.survived.length} survived)${gated ? "" : ", no gate"}`);
  if (gated && score < BREAK) {
    failed = true;
    for (const s of t.survived) console.info(`  survived: ${s}`);
  }
}
if (failed) {
  console.error(`A package is under ${BREAK} %.`);
  process.exitCode = 1;
}

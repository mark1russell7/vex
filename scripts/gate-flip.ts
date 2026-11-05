/**
 * The flip test of the speed gates (rule 8i of the fleet). A gate of a measure holds a gain only if it can fail. This
 * script reads each gate two times in one job: on a clean copy, and with a known cost in the measured arm
 * (`packages/core/bench/fault.ts`). The clean read must pass. The read with the fault must fail on each of its cases, and
 * it must fail on the measure, so a crash does not count. The growth gate has a fault of its own, `GROWTH_FAULT`.
 *
 * The script starts the entry of each gate, the file that CI starts, so the flip reads the exit code that CI reads.
 * Start: node scripts/gate-flip.ts
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The cost of the fault: the measured arm has 4 calls in each call. Each limit of the speed gates is under 4 times its ratio. */
const FAULT_TIMES = "4";

const root = fileURLToPath(new URL("..", import.meta.url));

/** This function starts a file of the repository with more settings, and gives its exit code and its text. */
function start(file: string, env: Readonly<Record<string, string>>, args: readonly string[] = []): { readonly code: number | null; readonly text: string } {
  const run = spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...env } });
  return { code: run.status, text: `${run.stdout}${run.stderr}` };
}

/** This function gives the case numbers that the flip reads in the compiler gate: the first case and the growth case. */
function compilerCases(): string {
  const count = /^cases (\d+)$/mu.exec(start("packages/compiler/bench/gate.ts", { GATE_CASE: "count" }).text)?.[1];
  if (count === undefined) throw new Error("gate-flip: the compiler gate gave no count of cases.");
  return `0,${String(Number(count) - 1)}`;
}

/** This function gives the count of the lines of a read that report a failed case. */
function failedCases(text: string): number {
  return text.split("\n").filter((line) => line.startsWith("FAIL ")).length;
}

/** A gate of the flip. `fault` gives the setting of its fault. `cases` is the count of the lines of a read with the fault that start with `FAIL `. */
interface FlipGate {
  readonly name: string;
  readonly file: string;
  readonly env: Readonly<Record<string, string>>;
  readonly args?: readonly string[];
  readonly fault: Readonly<Record<string, string>>;
  readonly cases: number;
}

const COST: Readonly<Record<string, string>> = { GATE_FAULT_TIMES: FAULT_TIMES };

const GATES: readonly FlipGate[] = [
  { name: "the speed gate of the core", file: "packages/core/bench/gate.ts", env: {}, fault: COST, cases: 2 },
  { name: "the speed gate of the compiler", file: "packages/compiler/bench/gate-processes.ts", env: { GATE_CASE: compilerCases() }, fault: COST, cases: 2 },
  // The fault gives a quadratic time and quadratic bytes. So the module and the source each fail a row, a time clause and a bytes clause.
  { name: "the growth gate of the compiler", file: "packages/compiler/bench/growth.ts", env: {}, args: ["chain"], fault: { GROWTH_FAULT: "1" }, cases: 6 },
];

let held = true;
for (const gate of GATES) {
  const clean = start(gate.file, gate.env, gate.args);
  const injected = start(gate.file, { ...gate.env, ...gate.fault }, gate.args);
  const red = injected.code === 1 && failedCases(injected.text) === gate.cases;
  const green = clean.code === 0 && failedCases(clean.text) === 0;
  console.info(`${red && green ? "ok" : "FAIL"} ${gate.name}: clean exit ${String(clean.code)}, with the fault exit ${String(injected.code)}, ${String(failedCases(injected.text))} of ${String(gate.cases)} cases failed`);
  if (!green) console.error(`The clean read did not pass:\n${clean.text}`);
  if (!red) console.error(`The read with the fault did not fail on each case:\n${injected.text}`);
  held &&= red && green;
}
process.exit(held ? 0 : 1);

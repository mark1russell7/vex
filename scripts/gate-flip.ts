/**
 * The flip test of the speed gates (rule 8i of the fleet). A gate of a measure holds a gain only if it can fail. This
 * script reads each gate two times in one job: on a clean copy, and with a known cost in the measured arm
 * (`packages/core/bench/fault.ts`). The clean read must pass. The read with the fault must fail on each of its cases, and
 * it must fail on the measure, so a crash does not count. The growth gate has two faults of its own: `GROWTH_FAULT` and `GROWTH_BYTES_FAULT`.
 *
 * The script starts the entry of each gate, the file that CI starts, so the flip reads the exit code that CI reads.
 * The gates of a rule read a file and not a time. So a flip of a rule gives the gate a clean file and a file with a fault.
 * Start: node scripts/gate-flip.ts
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The cost of the fault: the measured arm has 4 calls in each call. Each limit of the speed gates is under 4 times its ratio. */
const FAULT_TIMES = "4";

const root = fileURLToPath(new URL("..", import.meta.url));

/** This function starts a file of the repository with more settings, and gives its exit code and its text. */
function start(file: string, env: Readonly<Record<string, string>>, args: readonly string[] = [], cwd: string = root): Read {
  const run = spawnSync(process.execPath, [join(root, file), ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...env } });
  return { code: run.status, text: `${run.stdout}${run.stderr}` };
}

/** This function gives the record of one property of a name run. */
function nameRecord(key: string, runs: number, failed: boolean): string {
  return `${JSON.stringify({ key, runs, target: 100, failed })}\n`;
}

/** This function reads the record of a name run. The record with the fault has one short property and one failed property. */
function nameRunFlip(dir: string): FlipReads {
  const file = join(dir, "records.jsonl");
  writeFileSync(file, nameRecord("a", 100, false) + nameRecord("b", 100, false));
  const clean = start("scripts/name-run.ts", {}, [file, "1"]);
  writeFileSync(file, nameRecord("a", 99, false) + nameRecord("b", 100, true));
  return { clean, injected: start("scripts/name-run.ts", {}, [file, "1"]), mark: /2 short or failed$/mu };
}

/** This function reads the workflows of the repository, and then the same workflows with one more file that hides a failed test. */
function workflowFlip(dir: string): FlipReads {
  const folder = join(dir, ".github/workflows");
  cpSync(join(root, ".github/workflows"), folder, { recursive: true });
  const clean = start("scripts/workflow-gate.ts", {}, [], dir);
  writeFileSync(join(folder, "zz-fault.yml"), "on: pull_request\njobs:\n  fault:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test || true\n");
  return { clean, injected: start("scripts/workflow-gate.ts", {}, [], dir), mark: /workflow-gate: zz-fault\.yml: .*\|\|/u };
}

/** This function prints each committed module into a folder, reads the folder, and reads it again with one more space in one file. */
function moduleBytesFlip(dir: string): FlipReads {
  const script = "packages/pilots/scripts/module-bytes.ts";
  const first = /^(.+): \d+ bytes$/mu.exec(start(script, {}, [dir, "--write"]).text)?.[1];
  if (first === undefined) throw new Error("gate-flip: the print of the modules gave no file.");
  const clean = start(script, {}, [dir]);
  appendFileSync(join(dir, first), " ");
  return { clean, injected: start(script, {}, [dir]), mark: /1 of \d+ committed modules differ/u };
}

/** This function reads one gate of a rule in its own folder. The clean read must pass, and the read with the fault must fail on its mark. */
function ruleHolds(name: string, read: (dir: string) => FlipReads): boolean {
  const dir = mkdtempSync(join(tmpdir(), "gate-flip-"));
  try {
    const { clean, injected, mark } = read(dir);
    const held = clean.code === 0 && injected.code === 1 && mark.test(injected.text);
    console.info(`${held ? "ok" : "FAIL"} ${name}: clean exit ${String(clean.code)}, with the fault exit ${String(injected.code)}, the mark ${mark.test(injected.text) ? "is" : "is not"} in its text`);
    if (!held) console.error(`The reads of the gate:\n${clean.text}\n${injected.text}`);
    return held;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The exit code and the text of one read of a gate. */
interface Read {
  readonly code: number | null;
  readonly text: string;
}

/** The two reads of a gate of a rule, and the words that show that the fault made the gate fail. */
interface FlipReads {
  readonly clean: Read;
  readonly injected: Read;
  readonly mark: RegExp;
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
  // The fault gives a quadratic time and quadratic bytes. The module fails a row, a time clause and a bytes clause. The source fails a row and a bytes clause, because its time is report only.
  { name: "the growth gate of the compiler", file: "packages/compiler/bench/growth.ts", env: {}, args: ["chain"], fault: { GROWTH_FAULT: "1" }, cases: 5 },
  // The fault gives 5 % more bytes at the large size of the source, with no other change. The source fails a row and a bytes clause.
  { name: "the growth gate of the bytes of the source", file: "packages/compiler/bench/growth.ts", env: {}, args: ["chain"], fault: { GROWTH_BYTES_FAULT: "1.05" }, cases: 2 },
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
const RULES: readonly (readonly [string, (dir: string) => FlipReads])[] = [
  ["the gate of the name run", nameRunFlip],
  ["the gate of the workflows", workflowFlip],
  ["the gate of the module bytes", moduleBytesFlip],
];
for (const [name, read] of RULES) held = ruleHolds(name, read) && held;
process.exit(held ? 0 : 1);

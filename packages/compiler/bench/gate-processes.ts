/**
 * The speed gate of the compiler over fresh processes (GATENOISE). This script starts `gate.ts` in `GATE_PROCESSES`
 * fresh processes (11 by default), one after the other, and decides each case on the processes with
 * `core/bench/processes.ts`: (a) the median ratio against the limit, and (b) the count of slow processes.
 *
 * A process is valid for a case only when its A/A band contains 1.0. When a case has fewer than k valid processes, the
 * script starts more processes, up to 2k in all. A case that still has fewer fails: the gate fails closed.
 *
 * Each line of a process stands in the output with its number, so the record keeps each process. Only the decision
 * lines start with `ok` or `FAIL`. Start: node packages/compiler/bench/gate-processes.ts
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { envLine } from "../../core/bench/measure.ts";
import { complete, decide, decisionLine, parseProcess, type CaseSample } from "../../core/bench/processes.ts";

const k = Number(process.env["GATE_PROCESSES"] ?? "11");
if (!Number.isInteger(k) || k < 1) throw new RangeError(`gate-processes: GATE_PROCESSES is "${String(process.env["GATE_PROCESSES"])}", not a whole number of 1 or more.`);
const gate = fileURLToPath(new URL("gate.ts", import.meta.url));

console.info(envLine("fresh"));
const processes: (readonly CaseSample[])[] = [];
let broken = false;
while (processes.length < k || (!complete(processes, k) && processes.length < 2 * k)) {
  const n = processes.length + 1;
  const out = spawnSync(process.execPath, [gate], { encoding: "utf8", maxBuffer: 1 << 26 });
  for (const line of out.stdout.split("\n")) if (line.trim() !== "") console.info(`  p${String(n)} ${line}`);
  // The gate exits 1 when a case of its one process is above the limit. Each other end is a broken process.
  if (out.status !== 0 && out.status !== 1) {
    broken = true;
    console.info(`  p${String(n)} ended with ${String(out.status ?? out.signal)}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
  }
  processes.push(parseProcess(out.stdout));
}

const decisions = decide(processes, k);
for (const d of decisions) console.info(decisionLine(d));
if (decisions.length === 0) console.info("FAIL the processes gave no result line");
if (broken) console.info("FAIL a process of the gate did not end normally");
process.exit(broken || decisions.length === 0 || decisions.some((d) => !d.ok) ? 1 : 0);

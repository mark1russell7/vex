/**
 * The speed gate of the compiler over fresh processes (GATENOISE). This script starts `gate.ts` for each case in
 * `GATE_PROCESSES` fresh processes (11 by default), and decides each case on its processes with
 * `core/bench/processes.ts`: (a) the median ratio against the limit, and (b) the count of slow processes.
 *
 * Each process measures one case only (`GATE_CASE`), so no other case changes its heap. In each round, the script starts
 * one process for each case, so a slow period of the runner touches all cases equally.
 *
 * A process is valid for a case only when its A/A band contains 1.0. When a case has fewer than k valid processes, the
 * script starts more processes of that case, up to 2k in all. A case that still has fewer fails: the gate fails closed.
 *
 * Each line of a process stands in the output with its case and its number, so the record keeps each process. Only the
 * decision lines start with `ok` or `FAIL`. Start: node packages/compiler/bench/gate-processes.ts
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { envLine } from "../../core/bench/measure.ts";
import { complete, decide, decisionLine, parseProcess, type CaseSample } from "../../core/bench/processes.ts";

const k = Number(process.env["GATE_PROCESSES"] ?? "11");
if (!Number.isInteger(k) || k < 1) throw new RangeError(`gate-processes: GATE_PROCESSES is "${String(process.env["GATE_PROCESSES"])}", not a whole number of 1 or more.`);
const gate = fileURLToPath(new URL("gate.ts", import.meta.url));

/** This function starts `gate.ts` with the case `which`, and gives its output and its exit. */
function start(which: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [gate], { encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, GATE_CASE: which } });
}

const count = Number(/^cases (\d+)$/mu.exec(start("count").stdout)?.[1]);
if (!Number.isInteger(count) || count < 1) throw new Error("gate-processes: gate.ts gave no count of cases.");

console.info(envLine("fresh"));
const processes: (readonly CaseSample[])[][] = Array.from({ length: count }, () => []);
let broken = false;
/** This function tells if the processes of a case need one more process. */
const needs = (ps: readonly (readonly CaseSample[])[]): boolean => ps.length < k || (!complete(ps, k) && ps.length < 2 * k);
for (let round = 1; processes.some(needs); round++) {
  for (const [c, ps] of processes.entries()) {
    if (!needs(ps)) continue;
    const out = start(String(c));
    for (const line of out.stdout.split("\n")) if (line.trim() !== "") console.info(`  c${String(c)} p${String(round)} ${line}`);
    // The gate exits 1 when its case is above the limit in its one process. Each other end is a broken process.
    if (out.status !== 0 && out.status !== 1) {
      broken = true;
      console.info(`  c${String(c)} p${String(round)} ended with ${String(out.status ?? out.signal)}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
    }
    ps.push(parseProcess(out.stdout));
  }
}

const decisions = processes.flatMap((ps) => decide(ps, k));
for (const d of decisions) console.info(decisionLine(d));
if (decisions.length !== count) console.info(`FAIL ${String(decisions.length)} cases gave a decision, not ${String(count)}`);
if (broken) console.info("FAIL a process of the gate did not end normally");
process.exit(broken || decisions.length !== count || decisions.some((d) => !d.ok) ? 1 : 0);

/**
 * The speed gate of the compiler over fresh processes (GATENOISE). This script starts `gate.ts` for each case in
 * `GATE_PROCESSES` fresh processes (11 by default). It decides each case on its processes with `processVerdict` of
 * rigor-bench: (a) the median ratio against the limit, and (b) the count of slow processes.
 *
 * Each process measures one case only, so no other case changes its heap. The script gives the case to `gate.ts` as
 * its first argument. In each round, the script starts one process for each case, so a slow period of the runner touches
 * all cases equally. `startProcess` of rigor-bench starts each process with no shell, and stops it at the time limit.
 *
 * A process is valid for a case only when its A/A band contains 1.0. When a case has fewer than k valid processes, the
 * script starts more processes of that case, up to 2k in all. A case that still has fewer cannot decide: the gate fails closed.
 *
 * Each line of a process stands in the output with its case and its number, so the record keeps each process. Each
 * process prints one read line of its case (gate-reads.ts). Only the decision lines start with `ok`, `FAIL` or `no read`.
 * A process that ends with another code, or that prints a read line that is not valid, is broken. Its case gets no read
 * of it, the other cases go on, and the gate fails at the end.
 * Start: node packages/compiler/bench/gate-processes.ts
 *
 * Three optional settings help to find the cause of a spread (GATEGC):
 *
 * - `GATE_CASE` is a list of case numbers, separated by commas. The script starts only these cases.
 * - `GATE_NODE_FLAGS` holds flags of Node.js, separated by spaces. Each process starts with these flags before the script.
 * - With `GATE_GC=1`, each process prints the garbage collections of each arm (gc.ts). The script prints their medians.
 */
import { processCaseLine, processVerdict, type CaseProcesses, type CpuEntry, type ProcessLimits, type ProcessRead } from "@mark1russell7/rigor-bench";
import { startProcess, type ChildExit } from "@mark1russell7/rigor-bench/fresh";
import { fileURLToPath } from "node:url";
import { envLine } from "../../core/bench/measure.ts";
import { GC_ON, gcSummary, parseGc, type ArmGc } from "./gc.ts";
import { parseReads, processRead } from "./gate-reads.ts";

const k = Number(process.env["GATE_PROCESSES"] ?? "11");
if (!Number.isInteger(k) || k < 1) throw new RangeError(`gate-processes: GATE_PROCESSES is "${String(process.env["GATE_PROCESSES"])}", not a whole number of 1 or more.`);
const gate = fileURLToPath(new URL("gate.ts", import.meta.url));
const flags = (process.env["GATE_NODE_FLAGS"] ?? "").split(" ").filter((f) => f !== "");
// A process of one case takes less than a minute on a CI runner. The limit stops a process that hangs, so the job ends with a reason.
const TIME_LIMIT_MS = 10 * 60_000;

/** This function starts `gate.ts` with the case `which`, and gives its output and its exit. */
function start(which: string): Promise<ChildExit> {
  return startProcess([process.execPath, ...flags, gate, which], { timeoutMs: TIME_LIMIT_MS, maxBuffer: 1 << 26 });
}

const count = Number(/^cases (\d+)$/mu.exec((await start("count")).stdout)?.[1]);
if (!Number.isInteger(count) || count < 1) throw new Error("gate-processes: gate.ts gave no count of cases.");
// An empty GATE_CASE starts all cases, as a pull request does.
const only = (process.env["GATE_CASE"] ?? "").split(",").filter((c) => c.trim() !== "").map(Number);
if (only.some((c) => !Number.isInteger(c) || c < 0 || c >= count)) throw new RangeError(`gate-processes: GATE_CASE is "${String(process.env["GATE_CASE"])}", not a list of cases from 0 to ${String(count - 1)}.`);
const chosen = (c: number): boolean => only.length === 0 || only.includes(c);

/** The processes of one case: their ids, their reads, and the title and the limits of the first read. */
interface CaseRun {
  readonly ids: string[];
  readonly reads: ProcessRead[];
  readonly gc: { readonly ratio: number; readonly gc: readonly ArmGc[] }[];
  first?: { readonly title: string; readonly limits: CpuEntry<ProcessLimits> };
}

/** This function gives the verdict of one case over its processes, or undefined when no process gave a read. */
function verdictOf(run: CaseRun): CaseProcesses | undefined {
  return run.first === undefined ? undefined : processVerdict(run.reads, { k, limits: run.first.limits.value, processes: run.ids }).cases[0];
}

console.info(envLine("fresh"));
if (flags.length > 0) console.info(`flags of each process: ${flags.join(" ")}`);
const runs: CaseRun[] = Array.from({ length: count }, () => ({ ids: [], reads: [], gc: [] }));
let broken = false;
/** This function tells if a case needs one more process: fewer than k, or fewer than 2k while its verdict needs more. */
const needs = (run: CaseRun, c: number): boolean => chosen(c) && (run.ids.length < k || (run.ids.length < 2 * k && (verdictOf(run)?.more ?? 0) > 0));
for (let round = 1; runs.some(needs); round++) {
  for (const [c, run] of runs.entries()) {
    if (!needs(run, c)) continue;
    const id = `p${String(round)}`;
    // oxlint-disable-next-line no-await-in-loop -- the processes run one after the other, so no process slows another.
    const out = await start(String(c));
    for (const line of out.stdout.split("\n")) if (line.trim() !== "") console.info(`  c${String(c)} ${id} ${line}`);
    // The gate exits 1 when its case is above the limit in its one process. Each other end is a broken process.
    if ((out.code !== 0 && out.code !== 1) || out.timedOut === true || out.error !== undefined) {
      broken = true;
      const why = out.timedOut === true ? `the time limit of ${String(TIME_LIMIT_MS)} ms` : (out.error ?? `the code ${String(out.code)}`);
      console.info(`  c${String(c)} ${id} ended with ${why}: ${out.stderr.trim().split("\n").slice(-3).join(" | ")}`);
    }
    run.ids.push(id);
    const parsed = parseReads(out.stdout);
    // A read line that is not valid breaks the process. Its case gets no read of it, and the other cases go on.
    for (const reason of parsed.bad) {
      broken = true;
      console.info(`  c${String(c)} ${id} gave a read line that is not valid: ${reason}`);
    }
    const read = parsed.bad.length === 0 ? parsed.reads[0] : undefined;
    if (read !== undefined) {
      run.first ??= { title: read.case, limits: read.limits };
      run.reads.push(processRead(id, run.first.title, run.first.limits, read));
    }
    if (GC_ON) run.gc.push({ ratio: read?.ratio ?? Number.NaN, gc: parseGc(out.stdout) });
  }
}

/** This function gives the start of a decision line for an outcome. */
const head = (v: CaseProcesses): string => (v.outcome === "within" ? "ok  " : v.outcome === "beyond" ? "FAIL" : "no read");
let decided = true;
for (const [c, run] of runs.entries()) {
  if (!chosen(c)) continue;
  const v = verdictOf(run);
  if (v === undefined) {
    decided = false;
    console.info(`no read c${String(c)}: none of its ${String(run.ids.length)} processes gave a read line`);
    continue;
  }
  decided &&= v.outcome === "within";
  console.info(`${head(v)} ${processCaseLine(v)}`);
  if (GC_ON) for (const line of gcSummary(`c${String(c)} ${v.case}`, run.gc)) console.info(line);
}
if (broken) console.info("FAIL a process of the gate did not end normally, or gave a read line that is not valid");
process.exit(broken || !decided ? 1 : 0);

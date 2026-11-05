/**
 * The gate of the time of a print of each module of ireko against a fixed base commit (COMPILE.MODULE.COST).
 *
 *   node bench/module-cost.ts <the folder of a checkout of the base, with `module-cost-child.ts` in its bench folder> [--turn <n>] [--catch]
 *
 * Each arm starts a fresh process for each print. The order of the arms comes from `armOrder`, and the order of the modules
 * turns at each round. The flag `--turn` gives each read of a set a different first place. The line `order` names the first
 * row and the order of the arms of each round.
 *
 * The base is fixed, so the gate also finds a cost that grows over many pull requests. Only a pull request moves the
 * base, with a ruling on its reason and new limits from new reads. A new module has no time on the base, so the base
 * moves with that module. A move of the base hides each cost that came since the old base. So the pull request states
 * the ratio of the new base to the old base on the row `build`.
 *
 * The row `build` prints all the modules with a shared object in one process, in the order of the table. The row
 * `build-no-avoid` leaves out `avoid`. Each ratio has three decimals, so that no row rounds on to its line.
 *
 * A read with a loud A/A arm has no power, so it does not decide. The gate takes another read, up to `MAX_READS`.
 *
 * The flag `--catch` tests the gate. The branch arm does added work in the modules of `CATCH_ADD`, and the gate must fail
 * the modules of `CATCH_MUST_FAIL`. A failed row is then the expected result, and a row that does not fail is the fault.
 *
 * The flag `--rounds` tests the second pair clause. The branch arm does added work in the modules of `ROUND_ADD`, in the
 * first rounds of a read only. So the median stays under its limit, and the clause must fail alone.
 *
 * The flag `--record` adds one JSON line for each row of each read to a file. Each line names its kind and if its read
 * decided. A read of a cost uses this record and `gateRecords`, and not the log, because the log also shows the rows with added work.
 */
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { armOrder, type TailLimitVerdict } from "@mark1russell7/rigor-bench";
import { placesRead } from "../../compiler/src/unshared.ts";
import { env, envLine, firstOfRound, measureIsolated } from "../../core/bench/measure.ts";
import { IREKO_MODULES, irekoExprs } from "../src/ireko-modules.ts";
import { ARMS, BUILD_NO_AVOID_ROW, BUILD_ROW, catchFaults, CATCH_ADD, CATCH_MUST_FAIL, CEILING_ONLY, ceilingOnly, falseFails, GAIN_BASE, limitOf, medianLimit, moduleCostFaults, moduleVerdict, orderCount, readingOf, ROUND_ADD, ROUND_ADD_STARTS, roundFaults, type ModuleTimes, readKind, recordLines } from "./module-cost-limits.ts";

/** The fresh processes of each arm on each module. */
const ROUNDS = 7;

/** The most reads that the gate takes when a read does not decide. */
const MAX_READS = 3;

/** The machine of this run. Its model picks the limit of a row with a gain, and the version of Node.js goes in the report of each gain. */
const machine = env();

/** One row of the gate: its name, its input to the child, and the result of `placesRead` on its program. */
interface Row {
  readonly module: string;
  readonly input: string;
  readonly shares: boolean;
}

/** This function gives the times of one arm with two decimals. */
function list(ms: readonly number[]): string {
  return ms.map((v) => v.toFixed(2)).join(",");
}

/** The word of a row of the gate for each outcome of the home rule. */
const WORDS = { within: "ok", beyond: "FAIL", "cannot decide": "undecided" } as const;

/** This function prints the lines of one read and gives its faults. The prefix keeps a read that tests the gate out of the rows of the gate. */
function printRead(times: readonly ModuleTimes[], verdict: TailLimitVerdict, prefix: string): readonly string[] {
  const aaSecond = verdict.aaTail?.toFixed(3) ?? "none";
  return times.flatMap((row) => {
    const read = verdict.cases.find((c) => c.case === row.module);
    if (read === undefined) throw new Error(`module-cost: the verdict has no row ${row.module}.`);
    const faults = moduleCostFaults(read, verdict.aaTail);
    const limit = limitOf(row.module, row.shares);
    const lines = `${medianLimit(limit, machine.cpu).toFixed(3)}/${limit.second?.toFixed(3) ?? "report"}`;
    const r = readingOf(row);
    console.info(`${prefix}times module=${row.module} base=${list(row.base)} branch=${list(row.branch)} aa=${list(row.aa)}`);
    console.info(
      `${prefix}${WORDS[read.outcome]} module ${row.module} shares=${String(row.shares)} base=${r.baseMs.toFixed(2)} branch=${r.branchMs.toFixed(2)} ratio=${r.ratio.toFixed(3)} aa=${r.aa.toFixed(3)} worstPair=${r.worstPair.toFixed(3)} secondPair=${r.secondPair.toFixed(3)} aaWorst=${r.aaWorst.toFixed(3)} aaSecond=${r.aaSecond.toFixed(3)} runAaSecond=${aaSecond} orderBranch=${orderCount(row, "branch")} orderAa=${orderCount(row, "aa")} limit=${lines}${ceilingOnly(limit, machine.cpu) ? ` ${CEILING_ONLY}` : ""}`,
    );
    if (limit.ceiling !== undefined) console.info(`${prefix}gain ${row.module} against ${GAIN_BASE} on ${machine.cpu}, Node.js ${machine.node}: ${ceilingOnly(limit, machine.cpu) ? CEILING_ONLY : "gain read"}`);
    return faults;
  });
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { turn: { type: "string", default: "0" }, catch: { type: "boolean", default: false }, rounds: { type: "boolean", default: false }, record: { type: "string" } } });
const [baseFolder] = positionals;
if (baseFolder === undefined) throw new Error("module-cost: give the folder of a checkout of the base.");
const testsTheRounds = values.rounds;
const testsTheGate = values.catch || testsTheRounds;
const kind = readKind(values);
const prefix = kind === "gate" ? "" : `${kind} `;
const added = testsTheRounds ? ROUND_ADD : CATCH_ADD;

const moduleRows: readonly Row[] = IREKO_MODULES.map((module) => ({ module, input: module as string, shares: placesRead(irekoExprs(module)).shares }));
const shared = moduleRows.filter((r) => r.shares).map((r) => r.module);
const rows: readonly Row[] = testsTheGate
  ? moduleRows.filter((r) => Object.hasOwn(added, r.module))
  : [
      ...moduleRows,
      { module: BUILD_ROW, input: shared.join(","), shares: true },
      { module: BUILD_NO_AVOID_ROW, input: shared.filter((m) => m !== "avoid").join(","), shares: true },
    ];
const add = testsTheGate ? ["--add", Object.entries(added).map(([module, share]) => `${module}:${String(share)}`).join(",")] : [];

console.info(envLine("fresh"));
let decided = false;
for (let read = 0; read < MAX_READS && !decided; read++) {
  const firstInput = Number(values.turn) + read;
  console.info(`${prefix}order first=${Array.from({ length: ROUNDS }, (_round, round) => rows[firstOfRound(round, rows.length, ROUNDS, firstInput)]?.module).join(",")} arms=${Array.from({ length: ROUNDS }, (_round, round) => armOrder(ARMS, round).join("/")).join(",")}`);
  // The reads run one at a time: two reads at one time change the times of each other.
  // oxlint-disable-next-line no-await-in-loop
  const report = await measureIsolated({
    arms: [
      { id: "base", command: [process.execPath, join(baseFolder, "packages/pilots/bench/module-cost-child.ts")] },
      // Each read counts the rounds of the added work again, in its own folder.
      { id: "branch", command: [process.execPath, fileURLToPath(new URL("module-cost-child.ts", import.meta.url)), ...add, ...(testsTheRounds ? ["--add-first", `${String(ROUND_ADD_STARTS)}:${mkdtempSync(join(tmpdir(), "module-cost-"))}`] : [])] },
    ],
    inputs: rows.map((r) => ({ id: r.input })),
    repeats: ROUNDS,
    warmup: 0,
    mode: "fresh",
    firstInput,
  });
  const times: readonly ModuleTimes[] = rows.map(({ module, shares }, at) => {
    const ms = report.inputs[at]?.ms ?? {};
    return { module, shares, base: ms["base"] ?? [], branch: ms["branch"] ?? [], aa: ms["base~aa"] ?? [] };
  });
  const verdict = moduleVerdict(times, machine.cpu);
  decided = verdict.outcome !== "cannot decide";
  const faults = printRead(times, verdict, prefix);
  if (values.record !== undefined) {
    appendFileSync(values.record, recordLines({ kind, read, decided, cpu: machine.cpu, node: machine.node, commit: process.env["GITHUB_SHA"] ?? "unknown", baseCommit: process.env["BASE"] ?? "unknown" }, times));
  }
  if (decided) {
    if (testsTheRounds) {
      const missed = roundFaults(verdict);
      for (const fault of faults) console.info(`rounds fault ${fault}`);
      for (const miss of missed) console.error(`FAIL rounds ${miss}`);
      if (missed.length > 0) process.exitCode = 1;
      else console.info(`rounds ok: the second pair clause alone fails ${Object.keys(ROUND_ADD).join(" and ")} with a cost in ${String(ROUND_ADD_STARTS)} rounds`);
    } else if (testsTheGate) {
      const missed = catchFaults(verdict);
      for (const fault of faults) console.info(`catch fault ${fault}`);
      for (const miss of missed) console.error(`FAIL catch ${miss}`);
      if (missed.length > 0) process.exitCode = 1;
      else console.info(`catch ok: the gate fails ${CATCH_MUST_FAIL.join(" and ")} with the added cost`);
    } else {
      for (const fault of faults) console.error(`FAIL ${fault}`);
      if (faults.length > 0) process.exitCode = 1;
      const noise = falseFails(times, machine.cpu);
      console.info(`false-fail ${String(noise.fails.length)} of ${String(times.length - noise.gains.length)} rows of the A/A arm: ${noise.fails.join(",")}. No A/A read of a gain: ${noise.gains.map((gain) => gain.case).join(",")}`);
    }
  } else {
    console.info(`${prefix}UNDECIDED read ${String(read + 1)} of ${String(MAX_READS)}: ${verdict.reason}`);
  }
}
if (!decided) {
  console.error(`FAIL ${prefix}no read of ${String(MAX_READS)} decided`);
  process.exitCode = 1;
}

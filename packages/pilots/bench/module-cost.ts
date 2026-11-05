/**
 * The gate of the time of a print of each module of ireko against a fixed base commit (COMPILE.MODULE.COST).
 *
 *   node bench/module-cost.ts <the folder of a checkout of the base, with `module-cost-child.ts` in its bench folder> [--turn <n>] [--catch]
 *
 * Each arm starts a fresh process for each print. The order of the arms and the order of the modules turn at each round.
 * The flag `--turn` gives each read of a set a different first place. The line `order` names the first row of each round.
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
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { placesRead } from "../../compiler/src/unshared.ts";
import { envLine, firstOfRound, measureIsolated } from "../../core/bench/measure.ts";
import { IREKO_MODULES, irekoExprs } from "../src/ireko-modules.ts";
import { AA_CAP, BUILD_NO_AVOID_ROW, BUILD_ROW, catchFaults, CATCH_ADD, falseFails, isLoud, limitOf, moduleCostFaults, readingOf, runAaSecond, type ModuleTimes } from "./module-cost-limits.ts";

/** The fresh processes of each arm on each module. */
const ROUNDS = 7;

/** The most reads that the gate takes when a read does not decide. */
const MAX_READS = 3;

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

/** This function prints the lines of one read and gives its faults. The prefix keeps a read that tests the gate out of the rows of the gate. */
function printRead(times: readonly ModuleTimes[], word: string | undefined, prefix: string): readonly string[] {
  const runSecond = runAaSecond(times);
  return times.flatMap((row) => {
    const faults = moduleCostFaults(row, runSecond);
    const limit = limitOf(row.module, row.shares);
    const r = readingOf(row);
    console.info(`${prefix}times module=${row.module} base=${list(row.base)} branch=${list(row.branch)} aa=${list(row.aa)}`);
    console.info(
      `${prefix}${word ?? (faults.length === 0 ? "ok" : "FAIL")} module ${row.module} shares=${String(row.shares)} base=${r.baseMs.toFixed(2)} branch=${r.branchMs.toFixed(2)} ratio=${r.ratio.toFixed(3)} aa=${r.aa.toFixed(3)} worstPair=${r.worstPair.toFixed(3)} secondPair=${r.secondPair.toFixed(3)} aaWorst=${r.aaWorst.toFixed(3)} aaSecond=${r.aaSecond.toFixed(3)} runAaSecond=${runSecond.toFixed(3)} limit=${limit.median.toFixed(3)}/${limit.second.toFixed(3)}`,
    );
    return faults;
  });
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { turn: { type: "string", default: "0" }, catch: { type: "boolean", default: false }, "catch-full": { type: "boolean", default: false } } });
const [baseFolder] = positionals;
if (baseFolder === undefined) throw new Error("module-cost: give the folder of a checkout of the base.");
const testsTheGate = values.catch || values["catch-full"];
const prefix = testsTheGate ? "catch " : "";

const moduleRows: readonly Row[] = IREKO_MODULES.map((module) => ({ module, input: module as string, shares: placesRead(irekoExprs(module)).shares }));
const shared = moduleRows.filter((r) => r.shares).map((r) => r.module);
const rows: readonly Row[] = values.catch
  ? moduleRows.filter((r) => Object.hasOwn(CATCH_ADD, r.module))
  : [
      ...moduleRows,
      { module: BUILD_ROW, input: shared.join(","), shares: true },
      { module: BUILD_NO_AVOID_ROW, input: shared.filter((m) => m !== "avoid").join(","), shares: true },
    ];
const add = testsTheGate ? ["--add", Object.entries(CATCH_ADD).map(([module, share]) => `${module}:${String(share)}`).join(",")] : [];

console.info(envLine("fresh"));
let decided = false;
for (let read = 0; read < MAX_READS && !decided; read++) {
  const firstInput = Number(values.turn) + read;
  console.info(`${prefix}order first=${Array.from({ length: ROUNDS }, (_round, round) => rows[firstOfRound(round, rows.length, ROUNDS, firstInput)]?.module).join(",")}`);
  // The reads run one at a time: two reads at one time change the times of each other.
  // oxlint-disable-next-line no-await-in-loop
  const report = await measureIsolated({
    arms: [
      { id: "base", command: [process.execPath, join(baseFolder, "packages/pilots/bench/module-cost-child.ts")] },
      { id: "branch", command: [process.execPath, fileURLToPath(new URL("module-cost-child.ts", import.meta.url)), ...add] },
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
  decided = !isLoud(times);
  const faults = printRead(times, decided ? undefined : "undecided", prefix);
  if (decided) {
    if (testsTheGate) {
      const missed = catchFaults(times, runAaSecond(times));
      for (const fault of faults) console.info(`catch fault ${fault}`);
      for (const miss of missed) console.error(`FAIL catch ${miss}`);
      if (missed.length > 0) process.exitCode = 1;
      else console.info("catch ok: the gate fails each module with the added cost");
    } else {
      for (const fault of faults) console.error(`FAIL ${fault}`);
      if (faults.length > 0) process.exitCode = 1;
      const noise = falseFails(times);
      const under = noise.filter((module) => limitOf(module, true).median < 1);
      console.info(`false-fail ${String(noise.length)} of ${String(times.length)} rows of the A/A arm, ${String(under.length)} of them with a limit under 1 that an A/A row cannot meet: ${noise.join(",")}`);
    }
  } else {
    console.info(`${prefix}UNDECIDED read ${String(read + 1)} of ${String(MAX_READS)}: the second pair ${runAaSecond(times).toFixed(3)} of the A/A arm is over the cap ${AA_CAP.toFixed(3)}, so this read does not count`);
  }
}
if (!decided) {
  console.error(`FAIL ${prefix}no read of ${String(MAX_READS)} decided: each A/A arm is over the cap`);
  process.exitCode = 1;
}

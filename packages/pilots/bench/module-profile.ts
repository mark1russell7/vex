/**
 * This script gives the CPU profile of the print of one module of ireko against the base of the module cost gate (BOUNDSCOST).
 * It starts the child of that gate in fresh processes of the base and of the branch.
 * It prints the self time of each file and of each function in each tree.
 * It is a read for the search of a cause, so it has no limit. Timing runs in CI only.
 *
 * Start: node packages/pilots/bench/module-profile.ts <base folder> <module>[,<module>] <processes> <dir>
 */
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { profileCommand, type ArmTime } from "../../compiler/bench/profile.ts";

/** The most functions of a row of the print. */
const TOP = 40;
/** The time between two samples in µs. A print of a small module takes less than 30 ms, so the default of 1000 µs gives few samples. */
const INTERVAL = "100";
/** The entry function of an arm. A sample in `emitModule` counts for that arm, and each other sample of the print counts for `irekoSource`. */
const ARMS = ["emitModule", "irekoSource"];
/** The arm of each other sample in the time of the print. The collector and `(program)` have no entry function above them. */
const OUTSIDE = "outside";

/** This function gives the self time of each part of a key of an arm, in µs. The key has the form `name file:line`. */
function sumBy(arm: ArmTime | undefined, part: (key: string) => string): ReadonlyMap<string, number> {
  const sums = new Map<string, number>();
  for (const [key, us] of arm?.byFunction ?? []) sums.set(part(key), (sums.get(part(key)) ?? 0) + us);
  return sums;
}

/** This function gives the function name of a key. */
const nameOf = (key: string): string => key.slice(0, key.lastIndexOf(" "));

/** This function gives the file of a key, with no folder and no line. */
const fileOf = (key: string): string => (key.slice(key.lastIndexOf(" ") + 1).split(/[\\/]/u).at(-1) ?? "").replace(/:\d+$/u, "");

/** This function prints the rows of a sum of each tree, with the largest difference first. */
function printRows(label: string, base: ReadonlyMap<string, number>, branch: ReadonlyMap<string, number>, processes: number): void {
  const ms = (us: number): string => (us / processes / 1000).toFixed(3);
  const rows = [...new Set([...base.keys(), ...branch.keys()])]
    .map((name) => ({ name, base: base.get(name) ?? 0, branch: branch.get(name) ?? 0 }))
    .toSorted((x, y) => Math.abs(y.branch - y.base) - Math.abs(x.branch - x.base))
    .slice(0, TOP);
  for (const row of rows) console.info(`  ${label} ${row.branch >= row.base ? "+" : ""}${ms(row.branch - row.base)} ms  base ${ms(row.base)}  branch ${ms(row.branch)}  ${row.name}`);
}

/** This function gives the time of each arm of a tree for each process. */
function read(child: string, input: string, processes: number, dir: string, name: string): readonly ArmTime[] {
  const profile = profileCommand([`--cpu-prof-interval=${INTERVAL}`, child, "--input", input], { processes, dir, name, arms: ARMS, outside: OUTSIDE, groups: {} });
  // The child prints its own time, so a read can compare the rows with the gap under the profile.
  for (const line of profile.output) if (line.includes('"ms"')) console.info(`child ${name} ${line}`);
  return profile.arms;
}

const [baseFolder, input, processText, dir] = process.argv.slice(2);
if (baseFolder === undefined || input === undefined || processText === undefined || dir === undefined) throw new Error("module-profile: give the base folder, the modules, the count of processes and a folder.");
const processes = Number(processText);
const here = fileURLToPath(new URL("module-cost-child.ts", import.meta.url));
const baseChild = join(baseFolder, "packages/pilots/bench/module-cost-child.ts");
copyFileSync(here, baseChild);

const base = read(baseChild, input, processes, dir, "base");
const branch = read(here, input, processes, dir, "branch");
for (const arm of [...ARMS, OUTSIDE]) {
  const b = base.find((x) => x.arm === arm);
  const t = branch.find((x) => x.arm === arm);
  console.info(`arm ${arm}: base ${((b?.total ?? 0) / processes / 1000).toFixed(3)} ms, branch ${((t?.total ?? 0) / processes / 1000).toFixed(3)} ms for each process`);
  printRows("file", sumBy(b, fileOf), sumBy(t, fileOf), processes);
  printRows("function", sumBy(b, nameOf), sumBy(t, nameOf), processes);
}

// The load check of the lane. A test file that does not load gives no failed test, so Stryker reports a score, or it
// stops with "No tests were executed". On 2026-11-05 the lane read 69.13 % for the printer, and that figure was no
// reading (V-090). This script collects each test file of the lane before Stryker starts, and each file that does not
// load, or that holds no test, fails the lane.
//
// With --flip, the script shows that the check can fail, in one job: an added test file with a missing package makes
// the check fail and names that file, and the same copy without that file passes.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createVitest } from "vitest/node";

/** This is the test file that the flip adds. */
const FLIP_FILE = "work/compiler/load-check-flip.test.ts";

/** This function gives each test file of the lane that does not load or that holds no test, with its reason. */
async function loadFaults(): Promise<string[]> {
  const vitest = await createVitest("test", { config: "vitest.config.ts", watch: false });
  const { testModules, unhandledErrors } = await vitest.collect();
  const faults: string[] = testModules.flatMap((m) => {
    const errors = m.errors().map((e) => e.message);
    if (errors.length > 0) return [`${m.moduleId}: ${errors.join(" ")}`];
    return m.children.size === 0 ? [`${m.moduleId}: the file holds no test`] : [];
  });
  faults.push(...unhandledErrors.map((e) => `an error outside a test file: ${String(e)}`));
  if (testModules.length === 0) faults.push("the lane found no test file");
  console.info(`The load check read ${testModules.length} test files, with ${faults.length} faults.`);
  await vitest.close();
  return faults;
}

/** This function starts the check in a new process and gives its exit code and its text. */
function checkInProcess(): { readonly code: number | null; readonly text: string } {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const run = spawnSync(process.execPath, ["load-check.ts"], { cwd: here, encoding: "utf8", maxBuffer: 1 << 26 });
  return { code: run.status, text: `${run.stdout}${run.stderr}` };
}

/** This function adds the file with the fault, reads the check, removes the file and reads the check again. */
function flip(): boolean {
  const file = fileURLToPath(new URL(FLIP_FILE, import.meta.url));
  writeFileSync(file, 'import "vex-load-check-no-such-package";\n');
  const injected = checkInProcess();
  rmSync(file);
  const clean = checkInProcess();
  const red = injected.code === 1 && injected.text.includes("load-check-flip.test.ts");
  console.info(`flip: with the fault the exit code is ${String(injected.code)}, and without it ${String(clean.code)}.`);
  if (!red) console.error(`The check did not fail on the fault:\n${injected.text}`);
  if (clean.code !== 0) console.error(`The check failed on the clean copy:\n${clean.text}`);
  return red && clean.code === 0;
}

if (process.argv.includes("--flip")) {
  if (!flip()) process.exitCode = 1;
} else {
  const faults = await loadFaults();
  for (const fault of faults) console.error(`The lane cannot read: ${fault}`);
  if (faults.length > 0) {
    console.error("No read: a test file of the lane does not load, so a score of this copy is not a reading.");
    process.exitCode = 1;
  }
}

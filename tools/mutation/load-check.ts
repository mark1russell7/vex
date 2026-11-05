// The load check of the lane. A test file that does not load gives no failed test, so Stryker reports a score, or it
// stops with "No tests were executed". On 2026-11-05 the lane read 69.13 % for the printer, and that figure was no
// reading (V-090). This script collects each test file of the lane before Stryker starts, and each file that does not
// load, or that holds no test, fails the lane.
//
// With --flip, the script shows that the check can fail, in one job: an added test file with a missing package makes
// the check fail and names that file, and the same copy without that file passes.
//
// The check also reads each test file by its name (LANE.FILES). A test file that does not reach the copy, or that no part
// selects, gives no fault at the load, and its mutants survive. The runner of Stryker sets the option `related` of Vitest to
// the mutated files, and Vitest keeps a test file when its imports reach one of them. This script asks Vitest the same
// question for the mutated files of all parts. Each test file on the disk that this selection leaves out fails the check,
// unless NOT_READ of layout.ts states why. The flip adds such a file in each of the two places.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createVitest } from "vitest/node";
import { laneParts, mutateOf, NOT_READ, staleEntries, testFilesOnDisk, unreadTests } from "./layout.ts";

/** This is the test file with a load fault that the flip adds to the copy. */
const FLIP_FILE = "work/compiler/load-check-flip.test.ts";

/** This is the name of the test file with no load fault that the flip adds. */
const FLIP_NAME = "load-check-names-flip.test.ts";

/** The folder of this script. */
const here = fileURLToPath(new URL(".", import.meta.url));

/** The root of the repository. */
const root = fileURLToPath(new URL("../../", import.meta.url));

/** The text of the test file that the flip adds to show the check by name. It loads, and it imports no mutated file. */
const FLIP_TEXT = 'import { expect, it } from "vitest";\nit("flip", () => { expect(1).toBe(1); });\n';

/** This function gives the faults of the check by name, from the test files that the selection over all parts keeps. */
function nameFaults(selected: readonly string[], collected: number): string[] {
  const read = new Set(selected);
  const onDisk = testFilesOnDisk(root).length;
  const allowed = Object.keys(NOT_READ).length;
  console.info(`The selection over all parts reads ${selected.length} of the ${collected} test files of the copy. The disk has ${onDisk} test files, and the allow list names ${allowed}.`);
  const unread = unreadTests(root, read).map((file) => `no read: file not read: ${file}. No part of the lane reads this test file, and NOT_READ of layout.ts does not state why.`);
  const stale = staleEntries(root, read).map((file) => `NOT_READ of layout.ts names ${file}, but that file is not on the disk, or a part reads it.`);
  return [...unread, ...stale];
}

/** This function gives each test file of the lane that does not load or holds no test, and each fault of the check by name. */
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
  // These calls are the calls of the runner of Stryker: it sets this option, and Vitest then reads the imports of each test file.
  vitest.config.related = [...new Set(laneParts().flatMap((part) => mutateOf(root, part)).map((entry) => entry.split(":")[0] ?? entry))].map((file) => `${here}${file}`.replaceAll("\\", "/"));
  const selected = await vitest.getRelevantTestSpecifications();
  faults.push(...nameFaults(selected.map((s) => relative(here, s.moduleId).replaceAll("\\", "/")), testModules.length));
  await vitest.close();
  return faults;
}

/** This function starts the check in a new process and gives its exit code and its text. */
function checkInProcess(): { readonly code: number | null; readonly text: string } {
  const run = spawnSync(process.execPath, ["load-check.ts"], { cwd: here, encoding: "utf8", maxBuffer: 1 << 26 });
  return { code: run.status, text: `${run.stdout}${run.stderr}` };
}

/** This function writes files, reads the check, and removes the files. It gives true when the check fails and names the word. */
function faultIsRed(name: string, files: readonly string[], text: string, word: string): boolean {
  for (const file of files) writeFileSync(file, text);
  const injected = checkInProcess();
  for (const file of files) rmSync(file);
  const red = injected.code === 1 && injected.text.includes(word);
  console.info(`flip, ${name}: the exit code is ${String(injected.code)}.`);
  if (!red) console.error(`The check did not fail on the fault:\n${injected.text}`);
  return red;
}

/** This function adds each fault in turn and reads the check, then it reads the check on the clean copy. */
function flip(): boolean {
  const inCopy = `${here}work/compiler/${FLIP_NAME}`;
  const onDisk = `${root}packages/compiler/src/${FLIP_NAME}`;
  const reds = [
    faultIsRed("a test file that does not load", [`${here}${FLIP_FILE}`], 'import "vex-load-check-no-such-package";\n', "load-check-flip.test.ts"),
    faultIsRed("a test file on the disk that does not reach the copy", [onDisk], FLIP_TEXT, `file not read: packages/compiler/src/${FLIP_NAME}`),
    faultIsRed("a test file in the copy that no part selects", [onDisk, inCopy], FLIP_TEXT, `file not read: packages/compiler/src/${FLIP_NAME}`),
  ];
  const clean = checkInProcess();
  console.info(`flip, the clean copy: the exit code is ${String(clean.code)}.`);
  if (clean.code !== 0) console.error(`The check failed on the clean copy:\n${clean.text}`);
  return reds.every(Boolean) && clean.code === 0;
}

if (process.argv.includes("--flip")) {
  if (!flip()) process.exitCode = 1;
} else {
  const faults = await loadFaults();
  for (const fault of faults) console.error(`The lane cannot read: ${fault}`);
  if (faults.length > 0) {
    console.error("No read: the lane does not read each test file, so a score of this copy is not a reading.");
    process.exitCode = 1;
  }
}

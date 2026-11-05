/**
 * The flip of the normal test run on a test file that does not load (rule 8i of the fleet). The load check of the
 * mutation lane holds the lane. This script reads the same fault in the normal run. A file that does not load must end
 * the run with a non-zero exit code. A clean copy must end it with 0.
 *
 * The script reads each fault under the root config and under the config of one package. It also prints what `collect`
 * lists for the file, in two forms, because a check that compares the disk with `collect` depends on that answer.
 * The default form parses the file and does not start it. The other form has the option `staticParse: false`.
 * Each fault holds a test, because a file with no test has an error of its own, and that error can hide the answer.
 * Start: node scripts/load-run-flip.ts
 */
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createVitest, version } from "vitest/node";

const root = fileURLToPath(new URL("..", import.meta.url));

/** This name selects only the files that this script adds. */
const FILTER = "load-run-flip";

/** The text of a test file that loads and passes. */
const CLEAN = 'import { expect, it } from "vitest";\nit("flip", () => { expect(1).toBe(1); });\n';

/** This file has no test name, so the filter does not select it. A fault reaches the missing package through this file. */
const HELPER = "load-run-helper.ts";

/** Each fault: its name and the text of a test file with that fault. */
const FAULTS: readonly (readonly [string, string])[] = [
  ["a missing package", `import "vex-load-run-no-such-package";\n${CLEAN}`],
  ["a missing package through an imported file", `import "./${HELPER}";\n${CLEAN}`],
  ["a syntax error", `${CLEAN}const = ;\n`],
  ["a throw at the top of the file", `${CLEAN}throw new Error("load-run-flip");\n`],
];

/** A file that loads and holds no test. This row shows the error of that case, so that a reader can tell it from a load fault. */
const NO_TEST = "export {};\n";

/** The two configs of the normal run: the folder of the config, and the folder of the added files. */
const CONFIGS: readonly (readonly [string, string, string])[] = [
  ["the root config", root, `${root}packages/core/src`],
  ["the package config", `${root}packages/formula`, `${root}packages/formula/src`],
];

/** This function starts the normal run in `cwd` on the added files, and gives its exit code and its count of failed suites. */
function runOf(cwd: string): { readonly code: number | null; readonly failed: string } {
  const args = ["exec", "vitest", "run", FILTER, "--coverage.enabled=false"];
  const run = spawnSync("pnpm", args, { cwd, encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, CI: "1", NO_COLOR: "1" } });
  const failed = /Test Files\s+(?<files>[^\n]*)/u.exec(`${run.stdout}${run.stderr}`)?.groups?.["files"] ?? "no count";
  return { code: run.status, failed };
}

/** This function gives what `collect` lists for the added files under the config in `cwd`, with the first words of each error. */
async function collectOf(cwd: string, staticParse: boolean): Promise<string> {
  const vitest = await createVitest("test", { root: cwd, watch: false, coverage: { enabled: false } });
  const { testModules } = await vitest.collect([FILTER], { staticParse });
  await vitest.close();
  const rows = testModules.map((m) => {
    const errors = m.errors().map((e) => e.message.slice(0, 70));
    return `${m.moduleId.slice(m.moduleId.lastIndexOf("/") + 1)} with ${String(errors.length)} errors${errors.length === 0 ? "" : ` (${errors.join("; ")})`}`;
  });
  return rows.length === 0 ? "no file" : rows.join(", ");
}

/** This function reads one fault, or the clean copy, under one config. It gives false when the exit code is not the expected code. */
async function readRow(name: string, config: string, cwd: string, folder: string, text: string, red: boolean): Promise<boolean> {
  const faulty = `${folder}/${FILTER}.test.ts`;
  const clean = `${folder}/${FILTER}-clean.test.ts`;
  const helper = `${folder}/${HELPER}`;
  writeFileSync(faulty, text);
  writeFileSync(clean, CLEAN);
  writeFileSync(helper, 'import "vex-load-run-no-such-package";\n');
  try {
    const run = runOf(cwd);
    const parsed = await collectOf(cwd, true);
    const started = await collectOf(cwd, false);
    const good = red ? run.code !== 0 && run.code !== null : run.code === 0;
    console.info(`${good ? "ok" : "FAIL"} ${name}, ${config}: the exit code is ${String(run.code)}. Test files: ${run.failed}.`);
    console.info(`  collect, the default form: ${parsed}`);
    console.info(`  collect, staticParse false: ${started}`);
    return good;
  } finally {
    rmSync(faulty, { force: true });
    rmSync(clean, { force: true });
    rmSync(helper, { force: true });
  }
}

let passed = true;
console.info(`The version of the runner is ${version}.`);
for (const [config, cwd, folder] of CONFIGS) {
  for (const [name, text] of FAULTS) passed = (await readRow(name, config, cwd, folder, text, true)) && passed;
  passed = (await readRow("the clean copy", config, cwd, folder, CLEAN, false)) && passed;
  passed = (await readRow("a file with no test", config, cwd, folder, NO_TEST, true)) && passed;
}
// `collect` sets the exit code of this process when a file has an error, so only the rows of the run decide it here.
process.exitCode = passed ? 0 : 1;

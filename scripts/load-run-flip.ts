/**
 * The flip of the normal test run on a test file that does not load (rule 8i of the fleet). The load check of the
 * mutation lane holds the lane. This script reads the same fault in the normal run. A file that does not load must end
 * the run with a non-zero exit code. A clean copy must end it with 0.
 *
 * The script reads each fault under the root config and under the config of one package. It also prints what `collect`
 * lists for the file, because a check that compares the disk with `collect` depends on that answer.
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

/** Each fault: its name and the text of a test file with that fault. */
const FAULTS: readonly (readonly [string, string])[] = [
  ["a missing package", 'import "vex-load-run-no-such-package";\n'],
  ["a syntax error", "const = ;\n"],
  ["a throw at the top of the file", 'throw new Error("load-run-flip");\n'],
];

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

/** This function gives what `collect` lists for the added files under the config in `cwd`. */
async function collectOf(cwd: string): Promise<string> {
  const vitest = await createVitest("test", { root: cwd, watch: false, coverage: { enabled: false } });
  const { testModules } = await vitest.collect([FILTER]);
  await vitest.close();
  const rows = testModules.map((m) => `${m.moduleId.slice(m.moduleId.lastIndexOf("/") + 1)} with ${String(m.errors().length)} errors`);
  return rows.length === 0 ? "no file" : rows.join(", ");
}

/** This function reads one fault, or the clean copy, under one config. It gives false when the exit code is not the expected code. */
async function readRow(name: string, config: string, cwd: string, folder: string, text: string, red: boolean): Promise<boolean> {
  const faulty = `${folder}/${FILTER}.test.ts`;
  const clean = `${folder}/${FILTER}-clean.test.ts`;
  writeFileSync(faulty, text);
  writeFileSync(clean, CLEAN);
  try {
    const run = runOf(cwd);
    const listed = await collectOf(cwd);
    const good = red ? run.code !== 0 && run.code !== null : run.code === 0;
    console.info(`${good ? "ok" : "FAIL"} ${name}, ${config}: the exit code is ${String(run.code)}. Test files: ${run.failed}. Collect lists ${listed}.`);
    return good;
  } finally {
    rmSync(faulty, { force: true });
    rmSync(clean, { force: true });
  }
}

let passed = true;
console.info(`The version of the runner is ${version}.`);
for (const [config, cwd, folder] of CONFIGS) {
  for (const [name, text] of FAULTS) passed = (await readRow(name, config, cwd, folder, text, true)) && passed;
  passed = (await readRow("the clean copy", config, cwd, folder, CLEAN, false)) && passed;
}
if (!passed) process.exitCode = 1;

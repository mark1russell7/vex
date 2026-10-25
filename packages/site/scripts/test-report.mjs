// This script runs the tests of the libraries with the JSON reporter, and writes one report for the site.
// The living spec page reads the report. Without a report, the page shows each requirement as "unknown".
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..", "..");
const tmp = join(site, ".report");
mkdirSync(tmp, { recursive: true });
// Windows starts pnpm through its shell, as scripts/release/pack.mjs does. Another system needs no shell.
const shell = process.platform === "win32";
const tests = [];
for (const pkg of ["core", "domains", "testkit", "compiler"]) {
  const cwd = join(repo, "packages", pkg);
  const file = join(tmp, `${pkg}.json`);
  try {
    // The path of the report is relative to the package, so it has no space for the shell to split.
    execFileSync("pnpm", ["exec", "vitest", "run", "--reporter=json", `--outputFile=${relative(cwd, file)}`], { cwd, stdio: "inherit", shell });
  } catch {
    // A failed test still writes the report. The page shows the failure.
  }
  if (!existsSync(file)) {
    console.warn(`test-report: no report for ${pkg}, so the page shows its requirements as "unknown"`);
    continue;
  }
  const json = JSON.parse(readFileSync(file, "utf8"));
  for (const f of json.testResults ?? []) {
    for (const t of f.assertionResults ?? []) tests.push({ package: pkg, name: t.fullName ?? t.title, state: t.status === "passed" ? "pass" : t.status === "failed" ? "fail" : "skip" });
  }
}
rmSync(tmp, { recursive: true, force: true });
mkdirSync(join(site, "src", "data"), { recursive: true });
writeFileSync(join(site, "src", "data", "test-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tests }, null, 1));
console.info(`test-report: ${tests.length} tests`);

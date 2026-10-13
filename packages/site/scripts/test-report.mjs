// This script runs the tests of the libraries with the JSON reporter, and writes one report for the site.
// The living spec page reads the report. Without a report, the page shows each requirement as "unknown".
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..", "..");
const tmp = join(site, ".report");
mkdirSync(tmp, { recursive: true });
const tests = [];
for (const pkg of ["core", "domains", "testkit", "compiler"]) {
  const file = join(tmp, `${pkg}.json`);
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--reporter=json", `--outputFile=${file}`], { cwd: join(repo, "packages", pkg), stdio: "inherit", shell: true });
  } catch {
    // A failed test still writes the report. The page shows the failure.
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

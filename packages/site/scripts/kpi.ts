// This script writes `kpi.json` into the built site, with the typed writer of site-pages. The collector of the project KPIs reads this file.
// A count from a committed file has the time of the commit. A measure from GitHub has the time of its read.
// A failed read of GitHub gives no measure and no failed build, so a fault in the API does not stop the deploy of the docs.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeKpi } from "@mark1russell7/site-pages";
import { commitTime } from "@mark1russell7/site-pages/vite";
import { MODULE_LINES } from "../../pilots/bench/module-cost-limits.ts";
import { gitHubMeasures, pendingRows, requirementCount, type Get } from "../src/lib/kpi.ts";

/** The target of the cost of a print of one module. The item BOUNDSCOST brings each limit to this target. */
const MODULE_TARGET = 1.1;
const READ_MS = 15_000;

const site = fileURLToPath(new URL("..", import.meta.url));
const repo = join(site, "..", "..");
const text = (...path: string[]): string => readFileSync(join(repo, ...path), "utf8");

const get: Get = (url, token) => fetch(url, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(READ_MS) });

const read = await gitHubMeasures(get, process.env["GITHUB_TOKEN"], Date.now());
for (const fault of read.faults) console.warn(`kpi: ${fault}`);

const file = writeKpi(join(site, "dist"), {
  project: "vex",
  at: commitTime({}, repo),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  measures: [
    { id: "requirements", value: requirementCount(text("spec", "README.md")), unit: "IDs" },
    { id: "regression-rows-pending", value: pendingRows(text("spec", "regressions.md")), unit: "rows", notCounted: "a defect that has no row in spec/regressions.md" },
    { id: "disabled-mutants", value: (JSON.parse(text("tools", "mutation", "disables.json")) as readonly unknown[]).length, unit: "comments" },
    { id: "module-limits-over-target", value: Object.values(MODULE_LINES).filter((line) => line.median > MODULE_TARGET).length, unit: "modules", notCounted: "a module cost under its limit and over the target" },
    ...read.measures,
  ],
});
console.info(`kpi: wrote ${file}`);

/**
 * The share of tier 2 on real programs (roadmap item FALLBACKSHARE). This script is a measurement, not a gate. It
 * runs each program of the pilots and each formula of the example sheets with `tiered`, on the inputs of their tests.
 *
 * Start it with `pnpm --filter @vex/pilots run fallback-share`, or from the repo root with
 * `node packages/pilots/bench/fallback-share.ts`. It needs Node 24 or later, for the type stripping.
 *
 * The script prints a table of the programs and the totals. It writes the records as JSON to the file of
 * `FALLBACK_OUT`. The default file is `reports/fallback-share.json` in the repo root. `FALLBACK_SEED` sets the seed of
 * the random inputs (default 1). `FALLBACK_SCALE` multiplies the number of random inputs of each case (default 1).
 *
 * The script also finds the site of each fallback in the generated code (FALLBACKOPS), and it prints the sites in two
 * tables. `FALLBACK_SITES=0` turns off the probe of the sites.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shareCases } from "../src/fallback-cases.ts";
import { measureShare, type ReasonCount, type ShareReport, type SiteCount } from "../src/fallback-share.ts";

const seed = Number(process.env["FALLBACK_SEED"] ?? 1);
const scale = Number(process.env["FALLBACK_SCALE"] ?? 1);
const sites = process.env["FALLBACK_SITES"] !== "0";
const root = fileURLToPath(new URL("../../../", import.meta.url));
// pnpm starts a script in the folder of the package, and INIT_CWD is the folder of the command.
const out = process.env["FALLBACK_OUT"] === undefined ? resolve(root, "reports/fallback-share.json") : resolve(process.env["INIT_CWD"] ?? process.cwd(), process.env["FALLBACK_OUT"]);

/** This function gives a number as a percentage with one decimal. */
const percent = (x: number): string => `${(x * 100).toFixed(1)} %`;

/** This function gives the rows of a table with columns of equal width. */
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (r: readonly string[]): string => r.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/** This function gives the reasons as lines of a list. */
const reasons = (list: readonly ReasonCount[]): string => (list.length === 0 ? "  (none)" : list.map((r) => `  ${String(r.count).padStart(6)}  ${r.reason}`).join("\n"));

/** This function gives a table of the sites of the fallbacks, with the programs of each site and its first run. */
function siteTable(list: readonly SiteCount[] | undefined): string {
  if (list === undefined) return "  (the probe of the sites is off)";
  if (list.length === 0) return "  (none)";
  const rows = list.map((s) => [String(s.count), s.reason, s.programs.map((p) => `${String(p.count)} x ${p.reason}`).join("; "), s.example]);
  return table(["runs", "site of the fallback", "programs", "first run"], rows);
}

/** This function gives the text of a report. */
function text(report: ShareReport): string {
  const t = report.totals;
  const rows = report.programs.map((p) => [
    p.name,
    String(p.tier),
    String(p.runs),
    String(p.fallbacks),
    p.runs === 0 ? "-" : percent(p.tier === 2 ? (p.runs - p.fallbacks) / p.runs : 0),
    p.reason ?? p.fallbackReasons.map((r) => `${String(r.count)} x ${r.reason}`).join("; "),
  ]);
  return [
    `The share of tier 2 on real programs (seed ${String(seed)}, scale ${String(scale)})`,
    "",
    table(["program", "tier", "runs", "fallbacks", "tier 2 runs", "reason of tier 1, or results of tier 1 after a fallback"], rows),
    "",
    `programs: ${String(t.programs)}, of tier 2: ${String(t.tier2)}, programShare: ${t.programShare.toFixed(4)} (${percent(t.programShare)})`,
    `runs: ${String(t.runs)}, finished by tier 2: ${String(t.tier2Runs)}, fallbacks: ${String(t.fallbacks)}, runShare: ${t.runShare.toFixed(4)} (${percent(t.runShare)})`,
    `values of tier 2: ${String(t.tier2ValueRuns)}, valueRunShare: ${t.valueRunShare.toFixed(4)} (${percent(t.valueRunShare)}); errors of tier 2: ${String(t.tier2ErrorRuns)}, errorShare: ${t.errorShare.toFixed(4)} (${percent(t.errorShare)})`,
    "",
    "The reasons of tier 1, by programs:",
    reasons(t.tier1Reasons),
    "",
    "The results of tier 1 after a fallback, by runs:",
    reasons(t.fallbackReasons),
    "",
    "The sites of the fallbacks where tier 1 gave a value, by runs:",
    siteTable(t.valueSites),
    "",
    "The sites of the fallbacks where tier 1 gave an error, by runs:",
    siteTable(t.errorSites),
    "",
    `The programs that did not run on the inputs of their tests (not in the shares): ${report.skipped.length === 0 ? "none" : ""}`,
    ...report.skipped.map((s) => `  ${s.name}: ${s.reason}`),
  ].join("\n");
}

const start = performance.now();
const report = measureShare(shareCases({ seed, scale }), { sites });
const ms = performance.now() - start;
console.log(text(report));
console.log(`\nThe measurement took ${(ms / 1000).toFixed(1)} s. The records are in ${out}.`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ item: "FALLBACKSHARE", seed, scale, node: process.version, ...report }, null, 2)}\n`);

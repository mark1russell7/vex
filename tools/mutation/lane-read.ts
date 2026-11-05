// This script reads the reports of Stryker and gives the mutation score of each package and each file. Stryker has one
// threshold for all files, so its own break is off.
//
// With no argument, the script reads the report of one job of the lane and prints it. One part is not a package, so a part
// under the line fails nothing, and a run over the changed files is report only.
// With --gate <folder>, the script reads the report of each part of a full run from <folder>/mutation-report-<part>/ and
// applies the line of 95 % to each package (LANE.GATE). A part with no report is no read, and a no read fails the gate.
// With --flip, the script shows that the gate can fail, in one job: a report with a score fall and a missing part fail,
// and a clean copy passes.
//
// A time-out has two kinds. The hit limit stops a mutant with an endless loop, and this finds a mutant. The clock stops a
// mutant that took too long, and this can come from the load of the runner, so it finds nothing for certain. The gate
// counts a clock time-out as not found. Each line also prints the score that counts it as found.
// A mutant with a disable comment does not count in the score, and a disable can raise a score. So each line prints the count of these mutants.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { laneParts, PACKAGES, packageOfPart } from "./layout.ts";

/** A place in a file of a report. */
interface Place {
  readonly line: number;
  readonly column: number;
}

/** A mutant of a report of Stryker. */
export interface Mutant {
  readonly status: string;
  readonly statusReason?: string;
  readonly mutatorName: string;
  readonly replacement?: string;
  readonly location: { readonly start: Place; readonly end: Place };
}

/** A report of Stryker. */
export interface Report {
  readonly files: Readonly<Record<string, { readonly mutants: readonly Mutant[] }>>;
}

/** The counts of a file or a package. */
export interface Counts {
  killed: number;
  hitLimit: number;
  clock: number;
  survived: number;
  disabled: number;
}

/** The read of one file. */
export interface FileRead extends Counts {
  readonly file: string;
  readonly survivors: readonly string[];
}

/** The read of one package. */
export interface PackageRead {
  readonly name: string;
  readonly counts: Counts;
  readonly files: readonly FileRead[];
}

/** The verdict of the gate on a full run. */
export interface LaneVerdict {
  readonly failed: boolean;
  readonly lines: readonly string[];
  readonly packages: readonly { readonly name: string; readonly outcome: "pass" | "under the line" | "no read"; readonly score: number; readonly scoreWithClock: number }[];
}

/** This value is the line of the gate, in percent. */
const LINE = 95;

/** This function gives the count of the mutants that a score reads. */
const valid = (c: Counts): number => c.killed + c.hitLimit + c.clock + c.survived;

/** This function gives the score of the gate: a clock time-out is not found. */
export function gateScore(c: Counts): number {
  return valid(c) === 0 ? 0 : (100 * (c.killed + c.hitLimit)) / valid(c);
}

/** This function gives the score that counts a clock time-out as found. */
export function scoreWithClock(c: Counts): number {
  return valid(c) === 0 ? 0 : (100 * (c.killed + c.hitLimit + c.clock)) / valid(c);
}

/** This function adds one mutant to the counts. */
function count(c: Counts, m: Mutant): void {
  if (m.status === "Killed") c.killed += 1;
  else if (m.status === "Timeout" && m.statusReason?.startsWith("Hit limit") === true) c.hitLimit += 1;
  else if (m.status === "Timeout") c.clock += 1;
  else if (m.status === "Survived" || m.status === "NoCoverage") c.survived += 1;
  else if (m.status === "Ignored") c.disabled += 1;
}

/** This function gives the key of a mutant in its file. Two parts of a file can report the same mutant. */
function mutantKey(m: Mutant): string {
  const { start, end } = m.location;
  return `${start.line}:${start.column}-${end.line}:${end.column} ${m.mutatorName} ${m.replacement ?? ""}`;
}

/** This function gives the name of a file in the lane, and the name of its package. */
function nameOf(file: string): { readonly name: string; readonly pkg: string } {
  const name = file.replace(/.*work[\\/]/u, "").replaceAll("\\", "/");
  return { name, pkg: /work[\\/](\w+)[\\/]/u.exec(file)?.[1] ?? "other" };
}

/**
 * This function merges reports into one read for each package. Each mutant counts once, also if two parts report it. A
 * mutant with a status overrides a report of the same mutant as disabled, because a range of lines can report the rest so.
 */
export function readReports(reports: readonly Report[]): PackageRead[] {
  const files = new Map<string, Map<string, Mutant>>();
  for (const report of reports) {
    for (const [file, data] of Object.entries(report.files)) {
      const mutants = files.get(file) ?? new Map<string, Mutant>();
      for (const m of data.mutants) {
        const old = mutants.get(mutantKey(m));
        if (old === undefined || old.status === "Ignored") mutants.set(mutantKey(m), m);
      }
      files.set(file, mutants);
    }
  }
  const packages = new Map<string, FileRead[]>();
  for (const [file, mutants] of [...files].toSorted(([a], [b]) => a.localeCompare(b))) {
    const { name, pkg } = nameOf(file);
    const counts: Counts = { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 };
    const survivors: string[] = [];
    for (const m of mutants.values()) {
      count(counts, m);
      if (m.status === "Survived" || m.status === "NoCoverage") survivors.push(`${name}:${m.location.start.line} ${m.mutatorName}`);
    }
    packages.set(pkg, [...(packages.get(pkg) ?? []), { ...counts, file: name, survivors }]);
  }
  return [...packages].map(([name, read]) => {
    const counts: Counts = { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 };
    for (const f of read) {
      counts.killed += f.killed;
      counts.hitLimit += f.hitLimit;
      counts.clock += f.clock;
      counts.survived += f.survived;
      counts.disabled += f.disabled;
    }
    return { name, counts, files: read };
  });
}

/** This function gives the lines of the read of one package. */
export function packageLines(read: PackageRead): string[] {
  const c = read.counts;
  return [
    `${read.name}: ${gateScore(c).toFixed(2)} % (${c.killed + c.hitLimit} of ${valid(c)}: stopped ${c.killed}, hit limit ${c.hitLimit}, clock time-outs ${c.clock}, survived ${c.survived}, ${c.disabled} disabled by a comment). With the clock time-outs as found: ${scoreWithClock(c).toFixed(2)} %.`,
    ...read.files.map((f) => `  ${f.file}: ${gateScore(f).toFixed(2)} % (stopped ${f.killed}, hit limit ${f.hitLimit}, clock ${f.clock}, survived ${f.survived}, disabled ${f.disabled})`),
  ];
}

/** This function gives the survivors of a read, one line for each. */
const survivorLines = (read: PackageRead): string[] => read.files.flatMap((f) => f.survivors.map((s) => `  survived: ${s}`));

/**
 * This function gives the verdict of the gate on a full run (LANE.GATE). The map has one entry for each part of the run, and
 * `undefined` is a part with no report. A package with such a part is no read, and a no read fails the gate.
 */
export function laneVerdict(reports: ReadonlyMap<string, Report | undefined>): LaneVerdict {
  const present = [...reports.values()].filter((r) => r !== undefined);
  const empty = (r: Report | undefined): boolean => r === undefined || Object.values(r.files).every((f) => f.mutants.length === 0);
  const missing = [...reports].filter(([, r]) => empty(r)).map(([part]) => part);
  const reads = readReports(present);
  const lines: string[] = [];
  const packages: { name: string; outcome: "pass" | "under the line" | "no read"; score: number; scoreWithClock: number }[] = [];
  for (const name of new Set([...reports.keys()].map(packageOfPart))) {
    const read = reads.find((r) => r.name === name);
    const counts = read?.counts ?? { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 };
    const score = gateScore(counts);
    const noReport = missing.filter((part) => packageOfPart(part) === name);
    const outcome = noReport.length > 0 ? "no read" : score < LINE ? "under the line" : "pass";
    packages.push({ name, outcome, score, scoreWithClock: scoreWithClock(counts) });
    if (outcome === "no read") lines.push(`${name}: no read. The part ${noReport.join(", ")} gave no report, so any figure of this package is not a score.`);
    if (read !== undefined) lines.push(...packageLines(read));
    if (outcome === "under the line" && read !== undefined) lines.push(`${name}: under ${LINE} %.`, ...survivorLines(read));
  }
  return { failed: packages.some((p) => p.outcome !== "pass"), lines, packages };
}

/** This function reads the report of each part of a full run from a folder. */
function readFolder(folder: string): Map<string, Report | undefined> {
  const reports = new Map<string, Report | undefined>();
  for (const part of laneParts()) {
    const file = join(folder, `mutation-report-${part}`, "mutation.json");
    reports.set(part, existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Report) : undefined);
  }
  return reports;
}

/** This function gives a mutant of a fixture, on its own line. */
function fixtureMutant(index: number, status: { readonly status: string; readonly statusReason?: string }): Mutant {
  return { ...status, mutatorName: "Fixture", location: { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 1 } } };
}

/** This function gives a report of one part with 100 mutants, of which `killed` are stopped and the rest have `other`. */
export function fixtureReport(part: string, killed: number, other: { readonly status: string; readonly statusReason?: string }): Report {
  const mutants = Array.from({ length: 100 }, (_unused, index) => fixtureMutant(index, index < killed ? { status: "Killed" } : other));
  return { files: { [`work/${packageOfPart(part)}/${part}.ts`]: { mutants } } };
}

/** The clean figure of each part of the flip: a score of 98 %. */
const CLEAN = 98;

/** The figure of the part with a fall: 5 parts of the core at 98 %, 98 %, 98 %, 98 % and this give 94.8 %, under the line. */
const FALLEN = 82;

/** The status of a mutant that a test did not find. */
const SURVIVED = { status: "Survived" } as const;

/** The status of a mutant that the clock stopped. */
const CLOCK = { status: "Timeout", statusReason: "Timeout" } as const;

/** One case of the flip: the reports of a run, and the outcome of the core that the gate must give. */
export interface FlipCase {
  readonly name: string;
  readonly reports: ReadonlyMap<string, Report | undefined>;
  readonly core: "pass" | "under the line" | "no read";
}

/** This function gives the cases of the flip of the gate. The first part of the core changes in each case with a fault. */
export function flipCases(): readonly FlipCase[] {
  const parts = laneParts();
  const clean = (): Map<string, Report | undefined> => new Map(parts.map((part) => [part, fixtureReport(part, CLEAN, SURVIVED)]));
  const first = parts[0] ?? "";
  return [
    { name: "no fault", reports: clean(), core: "pass" },
    { name: `a score fall in ${first}`, reports: clean().set(first, fixtureReport(first, FALLEN, SURVIVED)), core: "under the line" },
    { name: `no report of ${first}`, reports: clean().set(first, undefined), core: "no read" },
    { name: `clock time-outs in ${first}`, reports: clean().set(first, fixtureReport(first, FALLEN, CLOCK)), core: "under the line" },
  ];
}

/** This function starts the gate of this script on each case of the flip, each in a new process. It gives the count of wrong results. */
function flip(script: string): number {
  let wrong = 0;
  for (const c of flipCases()) {
    const folder = mkdtempSync(join(tmpdir(), "vex-lane-flip-"));
    for (const [part, report] of c.reports) {
      if (report === undefined) continue;
      mkdirSync(join(folder, `mutation-report-${part}`));
      writeFileSync(join(folder, `mutation-report-${part}`, "mutation.json"), JSON.stringify(report));
    }
    const result = spawnSync(process.execPath, [script, "--gate", folder], { encoding: "utf8" });
    rmSync(folder, { recursive: true });
    const word = c.core === "no read" ? "core: no read" : c.core === "under the line" ? `core: under ${LINE} %` : "core: ";
    const right = result.status === (c.core === "pass" ? 0 : 1) && result.stdout.includes(word);
    const line = result.stdout.split("\n").find((l) => l.startsWith("core: ")) ?? "no line of the core";
    console.info(`flip, ${c.name}: exit ${String(result.status)}, ${right ? "right" : "WRONG"}. ${line}`);
    if (!right) wrong += 1;
  }
  return wrong;
}

/** This function applies the gate to a folder, and it gives the exit code. */
function gate(folder: string): number {
  const verdict = laneVerdict(readFolder(folder));
  const head = `The read of ${new Date().toISOString().slice(0, 10)} on ${process.env["GITHUB_SHA"] ?? "a local tree"}. A score holds for 7 days, and an older score is stale (LANE.DELAY).`;
  for (const line of [head, ...verdict.lines]) console.info(line);
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "lane-read.json"), `${JSON.stringify({ date: new Date().toISOString(), sha: process.env["GITHUB_SHA"], packages: verdict.packages }, null, 2)}\n`);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined) appendFileSync(summary, `${[head, "", "```", ...verdict.lines, "```"].join("\n")}\n`);
  if (verdict.failed) console.error(`The gate failed: a package is under ${LINE} % or has no read.`);
  return verdict.failed ? 1 : 0;
}

/** This function prints the report of one job of the lane, and it gives the exit code. A score does not fail a job. */
function oneJob(): number {
  const file = fileURLToPath(new URL("../../reports/mutation/mutation.json", import.meta.url));
  const changed = (process.env["VEX_CHANGED"] ?? "") !== "";
  if (!existsSync(file)) {
    console.info(changed ? "The changed files of this part have no mutant." : "This job has no report of Stryker.");
    return changed ? 0 : 1;
  }
  const reads = readReports([JSON.parse(readFileSync(file, "utf8")) as Report]);
  for (const read of reads) console.info([...packageLines(read), ...survivorLines(read)].join("\n"));
  if (changed) return 0;
  const named = process.env["VEX_MUTATE"]?.split(",").filter((p) => p !== "") ?? PACKAGES;
  const absent = [...new Set(named.map(packageOfPart))].filter((name) => (reads.find((r) => r.name === name)?.counts.killed ?? 0) === 0 && valid(reads.find((r) => r.name === name)?.counts ?? { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 }) === 0);
  for (const name of absent) console.error(`${name}: the report has no mutants of this package, but the run names it.`);
  return absent.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "--flip") process.exitCode = flip(fileURLToPath(import.meta.url)) === 0 ? 0 : 1;
  else if (mode === "--gate") process.exitCode = gate(process.argv[3] ?? "reports/parts");
  else process.exitCode = oneJob();
}

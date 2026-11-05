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
//
// A score can come from a part of the tests. On 2026-11-05 the lane read compiler.rest with 1029 of 1990 tests (V-090). So each
// part prints its tests, and the gate reads two things (LANE.TESTS, LANE.FILES). With --last <file>, a part with a fall over
// FALL_LINE against its last good read is no read. A test file on the disk that no part read is no read. A later full run
// reads the file reports/lane-tests.json of this run. A part that fell or gave no report keeps its old count.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { laneParts, PACKAGES, packageOfPart, packageOfPath, plainFlip, SELECTION_FILE, unreadTests } from "./layout.ts";

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
  readonly static?: boolean;
  readonly testsCompleted?: number;
  readonly location: { readonly start: Place; readonly end: Place };
}

/** A report of Stryker. */
export interface Report {
  readonly files: Readonly<Record<string, { readonly mutants: readonly Mutant[] }>>;
  /** The tests of the first test run of this report, for each test file. */
  readonly testFiles?: Readonly<Record<string, { readonly tests: readonly unknown[] }>>;
}

/** A fall of the tests of a part that a pull request makes on purpose. The entry holds while the last good read is `old`. */
export interface PlannedFall {
  readonly part: string;
  readonly old: number;
  readonly new: number;
  readonly pr: string;
}

/** What the gate reads beside the reports. */
export interface LaneChecks {
  /** The tests of each part at the last good read. */
  readonly lastTests?: Readonly<Record<string, number>>;
  /** The falls that a pull request makes on purpose. */
  readonly planned?: readonly PlannedFall[];
  /** This function gives each test file on the disk that the parts did not read, as paths of the repository. */
  readonly unread?: (read: ReadonlySet<string>) => readonly string[];
  /** The test files that the load check selected, as paths of the lane. An empty list states that no part saved the selection. */
  readonly selection?: readonly string[] | undefined;
}

/** The counts of a file or a package. */
export interface Counts {
  killed: number;
  hitLimit: number;
  clock: number;
  survived: number;
  disabled: number;
}

/** The cost of one kind of mutant: the count of the mutants that a score reads, and the tests that they completed. */
export interface Cost {
  mutants: number;
  tests: number;
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
  readonly staticCost: Cost;
  readonly otherCost: Cost;
}

/** The verdict of the gate on a full run. */
export interface LaneVerdict {
  readonly failed: boolean;
  readonly lines: readonly string[];
  readonly packages: readonly { readonly name: string; readonly outcome: "pass" | "under the line" | "no read"; readonly score: number; readonly scoreWithClock: number }[];
  /** The tests of each part that the next full run compares with. */
  readonly tests: Readonly<Record<string, number>>;
}

/** This value is the line of the gate, in percent. */
const LINE = 95;

/**
 * The share of the tests of a part that can fall before the read is no read. This value is a first guess from very few
 * falls: the largest with no fault was 7.1 % (compiler.module, 295 to 274, as tests moved) and the fault was 48.3 %. Read this
 * line again after 4 Saturdays. Growth can hide a real fall: compiler.rest read 563, then 1029 with the fault, then 1990. A
 * compare with the last good read passes that 1029. The load check holds that fault, and this line does not.
 */
export const FALL_LINE = 0.2;

/** This function gives the count of the tests of a report. */
export function testCount(report: Report): number {
  return Object.values(report.testFiles ?? {}).reduce((sum, file) => sum + file.tests.length, 0);
}

/** This function gives the line of the tests of a part, beside the score. */
export function testsLine(part: string, report: Report, last?: number): string {
  const files = Object.keys(report.testFiles ?? {}).length;
  return `${part} tests: ${String(testCount(report))} in ${String(files)} files${last === undefined ? ", with no earlier read" : `, and the last good read has ${String(last)}`}.`;
}

/** This function gives the share of a fall of the tests. It gives undefined for a planned fall or a fall under the line. */
export function testFall(part: string, tests: number, last: number | undefined, planned: readonly PlannedFall[]): number | undefined {
  if (last === undefined || last <= 0) return undefined;
  const share = (last - tests) / last;
  return share > FALL_LINE && !planned.some((p) => p.part === part && p.old === last) ? share : undefined;
}

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

/** This function adds one mutant to a cost. */
function addCost(cost: Cost, m: Mutant): void {
  cost.mutants += 1;
  cost.tests += m.testsCompleted ?? 0;
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
  const costs = new Map<string, { readonly staticCost: Cost; readonly otherCost: Cost }>();
  for (const [file, mutants] of [...files].toSorted(([a], [b]) => a.localeCompare(b))) {
    const { name, pkg } = nameOf(file);
    const counts: Counts = { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 };
    const survivors: string[] = [];
    const cost = costs.get(pkg) ?? { staticCost: { mutants: 0, tests: 0 }, otherCost: { mutants: 0, tests: 0 } };
    costs.set(pkg, cost);
    for (const m of mutants.values()) {
      count(counts, m);
      if (m.status !== "Ignored") addCost(m.static === true ? cost.staticCost : cost.otherCost, m);
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
    return { name, counts, files: read, staticCost: costs.get(name)?.staticCost ?? { mutants: 0, tests: 0 }, otherCost: costs.get(name)?.otherCost ?? { mutants: 0, tests: 0 } };
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

/**
 * This function gives the line of the static mutants of a package. The report has no time for one mutant, so this line gives the tests that the mutants completed. It is not a time: a static mutant also loads each module again.
 */
export function staticLine(read: PackageRead): string {
  const { staticCost: s, otherCost: o } = read;
  const tests = s.tests + o.tests;
  const share = tests === 0 ? 0 : (100 * s.tests) / tests;
  return `${read.name} static mutants: ${String(s.mutants)} of ${String(s.mutants + o.mutants)}, with ${String(s.tests)} of ${String(tests)} completed tests (${share.toFixed(1)} %). Other mutants: ${String(o.mutants)}, with ${String(o.tests)} completed tests. This is a count of tests, not a time.`;
}

/** This function gives the survivors of a read, one line for each. */
const survivorLines = (read: PackageRead): string[] => read.files.flatMap((f) => f.survivors.map((s) => `  survived: ${s}`));

/**
 * This function compares two reads of one question: the selection of the load check and the test files of the reports. It
 * gives the package and the text of each difference. A difference is a finding, and the gate does not pick one of the reads.
 */
function readsDiffer(selection: readonly string[], names: ReadonlySet<string>): readonly (readonly [string, string])[] {
  const selected = new Set(selection);
  const onlySelected = selection.filter((file) => !names.has(file)).map((file) => [packageOfPath(file), `${packageOfPath(file)}: no read: the two reads differ. The load check selects ${file}, and no report of the run read it.`] as const);
  const onlyRead = [...names].filter((file) => !selected.has(file)).map((file) => [packageOfPath(file), `${packageOfPath(file)}: no read: the two reads differ. A report of the run read ${file}, and the load check does not select it.`] as const);
  return [...onlySelected, ...onlyRead];
}

/**
 * This function gives the verdict of the gate on a full run (LANE.GATE). The map has one entry for each part of the run, and
 * `undefined` is a part with no report. A package with such a part is no read, and a no read fails the gate.
 */
export function laneVerdict(reports: ReadonlyMap<string, Report | undefined>, checks: LaneChecks = {}): LaneVerdict {
  const present = [...reports.values()].filter((r) => r !== undefined);
  const empty = (r: Report | undefined): boolean => r === undefined || Object.values(r.files).every((f) => f.mutants.length === 0);
  const missing = [...reports].filter(([, r]) => empty(r)).map(([part]) => part);
  const reads = readReports(present);
  const lines: string[] = [];
  const noReads = new Map<string, string[]>();
  const tests: Record<string, number> = {};
  const addNoRead = (name: string, text: string): void => {
    noReads.set(name, [...(noReads.get(name) ?? []), text]);
  };
  for (const [part, report] of reports) {
    const last = checks.lastTests?.[part];
    const read = report === undefined || empty(report) ? undefined : testCount(report);
    const fall = read === undefined ? undefined : testFall(part, read, last, checks.planned ?? []);
    if (read !== undefined && fall !== undefined) addNoRead(packageOfPart(part), `${packageOfPart(part)}: no read: tests fell. The part ${part} read ${String(read)} tests, and the last good read has ${String(last)}: a fall of ${(100 * fall).toFixed(1)} %, over the line of ${String(100 * FALL_LINE)} %.`);
    const kept = read === undefined || fall !== undefined ? last : read;
    if (kept !== undefined) tests[part] = kept;
  }
  // A check by name needs a full set of parts. A part with no report is no read already.
  if (missing.length === 0) {
    const names = new Set(present.flatMap((r) => Object.keys(r.testFiles ?? {}).map((file) => file.replaceAll("\\", "/"))));
    for (const file of checks.unread?.(names) ?? []) addNoRead(packageOfPath(file), `${packageOfPath(file)}: no read: file not read. No part read ${file}, and NOT_READ of layout.ts does not state why.`);
    if (checks.selection?.length === 0) {
      for (const name of new Set([...reports.keys()].map(packageOfPart))) addNoRead(name, `${name}: no read: no selection. No part saved the selection of the load check, so the two reads of the test files have no compare.`);
    } else if (checks.selection !== undefined) {
      for (const [name, text] of readsDiffer(checks.selection, names)) addNoRead(name, text);
    }
  }
  const packages: { name: string; outcome: "pass" | "under the line" | "no read"; score: number; scoreWithClock: number }[] = [];
  for (const name of new Set([...reports.keys()].map(packageOfPart))) {
    const read = reads.find((r) => r.name === name);
    const counts = read?.counts ?? { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 };
    const score = gateScore(counts);
    const noReport = missing.filter((part) => packageOfPart(part) === name);
    const other = noReads.get(name) ?? [];
    const outcome = noReport.length > 0 || other.length > 0 ? "no read" : score < LINE ? "under the line" : "pass";
    packages.push({ name, outcome, score, scoreWithClock: scoreWithClock(counts) });
    if (noReport.length > 0) lines.push(`${name}: no read. The part ${noReport.join(", ")} gave no report, so any figure of this package is not a score.`);
    lines.push(...other);
    if (read !== undefined) lines.push(...packageLines(read), staticLine(read));
    for (const [part, report] of reports) {
      if (report !== undefined && packageOfPart(part) === name) lines.push(testsLine(part, report, checks.lastTests?.[part]));
    }
    if (outcome === "under the line" && read !== undefined) lines.push(`${name}: under ${LINE} %.`, ...survivorLines(read));
  }
  return { failed: packages.some((p) => p.outcome !== "pass"), lines, packages, tests };
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

/** This function reads the selections of the load check that the parts of a full run saved, as one list. */
function readSelection(folder: string): readonly string[] {
  const files = laneParts().map((part) => join(folder, `mutation-report-${part}`, "load-selection.json")).filter((file) => existsSync(file));
  return [...new Set(files.flatMap((file) => JSON.parse(readFileSync(file, "utf8")) as readonly string[]))];
}

/** This function gives a mutant of a fixture, on its own line. */
function fixtureMutant(index: number, status: { readonly status: string; readonly statusReason?: string }): Mutant {
  return { ...status, mutatorName: "Fixture", location: { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 1 } } };
}

/** This function gives a report of one part with 100 mutants and `tests` tests. Of the mutants, `killed` are stopped and the rest have `other`. */
export function fixtureReport(part: string, killed: number, other: { readonly status: string; readonly statusReason?: string }, tests = 100): Report {
  const mutants = Array.from({ length: 100 }, (_unused, index) => fixtureMutant(index, index < killed ? { status: "Killed" } : other));
  return { files: { [`work/${packageOfPart(part)}/${part}.ts`]: { mutants } }, testFiles: { [`work/${packageOfPart(part)}/${part}.test.ts`]: { tests: Array.from({ length: tests }) } } };
}

/** The clean figure of each part of the flip: a score of 98 %. */
const CLEAN = 98;

/** The figure of the part with a fall: 5 parts of the core at 98 %, 98 %, 98 %, 98 % and this give 94.8 %, under the line. */
const FALLEN = 82;

/** The status of a mutant that a test did not find. */
const SURVIVED = { status: "Survived" } as const;

/** The status of a mutant that the clock stopped. */
const CLOCK = { status: "Timeout", statusReason: "Timeout" } as const;

/** One case of the flip: the reports of a run, the last good read of the tests, and the outcome of the core. */
export interface FlipCase {
  readonly name: string;
  readonly reports: ReadonlyMap<string, Report | undefined>;
  readonly core: "pass" | "under the line" | "no read";
  readonly word?: string;
  readonly lastTests?: Readonly<Record<string, number>>;
  /** The selection of the load check that this case reads. An empty list is a run that saved no selection. */
  readonly selection: readonly string[];
}

/** A test file of the flip that one of the two reads holds and the other does not. */
const ONE_READ = "work/core/one-read-flip.test.ts";

/** The count of the tests of compiler.rest at the fault of 2026-11-05, and the count of the next read with no fault. */
const FAULT_TESTS = 1029;
const CLEAN_TESTS = 1990;

/**
 * This function gives the cases of the flip of the gate. The first part of the core changes in each case with a fault. The
 * list names the test files that the parts must read, as paths of the lane. The case of the tests uses the real counts of
 * compiler.rest. It shows that this rule can fail. It does not show that this rule finds V-090: at that time the last good
 * read was 563, so a compare passed 1029. The load check holds that fault.
 */
export function flipCases(expected: readonly string[] = []): readonly FlipCase[] {
  const parts = laneParts();
  const first = parts[0] ?? "";
  const named = (part: string, files: readonly string[], tests: number): Report => {
    const report = fixtureReport(part, CLEAN, SURVIVED, tests);
    return part === first ? { ...report, testFiles: { ...report.testFiles, ...Object.fromEntries(files.map((file) => [file, { tests: [] }])) } } : report;
  };
  const clean = (): Map<string, Report | undefined> => new Map(parts.map((part) => [part, named(part, expected, CLEAN_TESTS)]));
  const lastTests = Object.fromEntries(parts.map((part) => [part, CLEAN_TESTS]));
  const selection = [...clean().values()].flatMap((report) => Object.keys(report?.testFiles ?? {}));
  const firstReport = clean().get(first);
  const readsMore = firstReport === undefined ? undefined : { ...firstReport, testFiles: { ...firstReport.testFiles, [ONE_READ]: { tests: [] } } };
  return [
    { name: "no fault", reports: clean(), core: "pass", lastTests, selection },
    { name: `a score fall in ${first}`, reports: clean().set(first, { ...clean().get(first), files: fixtureReport(first, FALLEN, SURVIVED).files }), core: "under the line", selection },
    { name: `no report of ${first}`, reports: clean().set(first, undefined), core: "no read", selection },
    { name: `clock time-outs in ${first}`, reports: clean().set(first, { ...clean().get(first), files: fixtureReport(first, FALLEN, CLOCK).files }), core: "under the line", selection },
    { name: `the tests of ${first} fell from ${String(CLEAN_TESTS)} to ${String(FAULT_TESTS)}`, reports: clean().set(first, named(first, expected, FAULT_TESTS)), core: "no read", word: "core: no read: tests fell", lastTests, selection },
    { name: "a test file that no part read", reports: clean().set(first, named(first, expected.slice(1), CLEAN_TESTS)), core: "no read", word: "no read: file not read", lastTests, selection },
    { name: "a report reads a file that the load check does not select", reports: clean().set(first, readsMore), core: "no read", word: "A report of the run read", lastTests, selection },
    { name: "the load check selects a file that no report read", reports: clean(), core: "no read", word: "The load check selects", lastTests, selection: [...selection, ONE_READ] },
    { name: "no part saved the selection", reports: clean(), core: "no read", word: "no read: no selection", lastTests, selection: [] },
  ];
}

/** The root of the repository. */
const REPO = fileURLToPath(new URL("../../", import.meta.url));

/** This function gives each test file on the disk that the parts must read, as paths of the lane. */
function expectedTests(): string[] {
  return unreadTests(REPO, new Set()).map((file) => file.replace(/^packages\/([^/]+)\/src\//u, "work/$1/"));
}

/** This function starts the gate of this script on each case of the flip, each in a new process. It gives the count of wrong results. */
function flip(script: string): number {
  let wrong = 0;
  const expected = expectedTests();
  // A file that the flip drops must belong to the core, because the verdict of the flip reads the core.
  const coreFirst = expected.toSorted((a, b) => Number(!a.startsWith("work/core/")) - Number(!b.startsWith("work/core/")));
  for (const c of flipCases(coreFirst)) {
    const folder = mkdtempSync(join(tmpdir(), "vex-lane-flip-"));
    const last = join(folder, "last-tests.json");
    if (c.lastTests !== undefined) writeFileSync(last, JSON.stringify({ parts: c.lastTests }));
    for (const [part, report] of c.reports) {
      if (report === undefined) continue;
      mkdirSync(join(folder, `mutation-report-${part}`));
      writeFileSync(join(folder, `mutation-report-${part}`, "mutation.json"), JSON.stringify(report));
      if (c.selection.length > 0) writeFileSync(join(folder, `mutation-report-${part}`, "load-selection.json"), JSON.stringify(c.selection));
    }
    const result = spawnSync(process.execPath, [script, "--gate", folder, "--last", last], { encoding: "utf8" });
    rmSync(folder, { recursive: true });
    const word = c.word ?? (c.core === "no read" ? "core: no read" : c.core === "under the line" ? `core: under ${LINE} %` : "core: ");
    const right = result.status === (c.core === "pass" ? 0 : 1) && result.stdout.includes(word);
    const line = result.stdout.split("\n").find((l) => l.startsWith("core: ")) ?? "no line of the core";
    console.info(`flip, ${c.name}: exit ${String(result.status)}, ${right ? "right" : "WRONG"}. ${line}`);
    if (!right) wrong += 1;
  }
  const folder = mkdtempSync(join(tmpdir(), "vex-lane-flip-"));
  const plain = plainFlip(folder);
  rmSync(folder, { recursive: true });
  for (const line of plain.lines) console.info(`flip, ${line}`);
  return wrong + plain.failed;
}

/** The mark of the change of method for `domains`: a score of this read does not compare with an older score (rule 8h). */
const DOMAINS_METHOD = "The method of `domains` changed for the read of 2026-11-07 (LANE.PLAIN): 13 test files read the plain copy, so an older score does not compare.";

/** This function reads the last good read of the tests. A first run has no such file. */
function readLast(file: string | undefined): Readonly<Record<string, number>> | undefined {
  if (file === undefined || !existsSync(file)) return undefined;
  return (JSON.parse(readFileSync(file, "utf8")) as { readonly parts: Readonly<Record<string, number>> }).parts;
}

/** This function applies the gate to a folder, and it gives the exit code. */
function gate(folder: string, lastFile: string | undefined): number {
  const lastTests = readLast(lastFile);
  const planned = JSON.parse(readFileSync(new URL("./planned-falls.json", import.meta.url), "utf8")) as readonly PlannedFall[];
  const checks: LaneChecks = { planned, unread: (read) => unreadTests(REPO, read), selection: readSelection(folder), ...(lastTests === undefined ? {} : { lastTests }) };
  const verdict = laneVerdict(readFolder(folder), checks);
  const head = `The read of ${new Date().toISOString().slice(0, 10)} on ${process.env["GITHUB_SHA"] ?? "a local tree"}. A score holds for 7 days, and an older score is stale (LANE.DELAY).`;
  for (const line of [head, DOMAINS_METHOD, ...verdict.lines]) console.info(line);
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "lane-read.json"), `${JSON.stringify({ date: new Date().toISOString(), sha: process.env["GITHUB_SHA"], packages: verdict.packages }, null, 2)}\n`);
  writeFileSync(join("reports", "lane-tests.json"), `${JSON.stringify({ date: new Date().toISOString(), sha: process.env["GITHUB_SHA"], parts: verdict.tests }, null, 2)}\n`);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined) appendFileSync(summary, `${[head, "", "```", ...verdict.lines, "```"].join("\n")}\n`);
  if (verdict.failed) console.error(`The gate failed: a package is under ${LINE} % or has no read.`);
  return verdict.failed ? 1 : 0;
}

/** This function prints the report of one job of the lane, and it gives the exit code. A score does not fail a job. */
function oneJob(): number {
  const file = fileURLToPath(new URL("../../reports/mutation/mutation.json", import.meta.url));
  const changed = (process.env["VEX_CHANGED"] ?? "") !== "";
  if (process.env["VEX_DRY_RUN"] === "1") {
    console.info("The first test run of this part passed. A dry run gives no report and no score.");
    return 0;
  }
  if (!existsSync(file)) {
    console.info(changed ? "The changed files of this part have no mutant." : "This job has no report of Stryker.");
    return changed ? 0 : 1;
  }
  // The selection goes beside the report, so the gate of a full run can compare the two reads.
  const selection = fileURLToPath(new URL(`./${SELECTION_FILE}`, import.meta.url));
  if (existsSync(selection)) copyFileSync(selection, file.replace(/mutation\.json$/u, "load-selection.json"));
  const report = JSON.parse(readFileSync(file, "utf8")) as Report;
  const reads = readReports([report]);
  for (const read of reads) console.info([...packageLines(read), staticLine(read), ...survivorLines(read)].join("\n"));
  console.info(testsLine(process.env["VEX_MUTATE"] ?? "this part", report));
  if (changed) return 0;
  const named = process.env["VEX_MUTATE"]?.split(",").filter((p) => p !== "") ?? PACKAGES;
  const absent = [...new Set(named.map(packageOfPart))].filter((name) => (reads.find((r) => r.name === name)?.counts.killed ?? 0) === 0 && valid(reads.find((r) => r.name === name)?.counts ?? { killed: 0, hitLimit: 0, clock: 0, survived: 0, disabled: 0 }) === 0);
  for (const name of absent) console.error(`${name}: the report has no mutants of this package, but the run names it.`);
  return absent.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const mode = process.argv[2];
  if (mode === "--flip") process.exitCode = flip(fileURLToPath(import.meta.url)) === 0 ? 0 : 1;
  else if (mode === "--gate") process.exitCode = gate(process.argv[3] ?? "reports/parts", process.argv[4] === "--last" ? process.argv[5] : undefined);
  else process.exitCode = oneJob();
}

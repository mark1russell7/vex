import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo-root.ts";

/** The name of the configuration of the tests of a package. */
const CONFIG = "vitest.config.ts";

/** The part of `tools/mutation/layout.ts` that this test reads. */
interface Layout {
  readonly unresolvedImports: (root: string) => readonly string[];
  readonly missingPackages: (root: string) => readonly string[];
  readonly missingSetups: (root: string) => readonly string[];
  readonly printsModule: (file: string) => boolean;
  readonly plainFaults: (root: string) => readonly string[];
  readonly plainFlip: (root: string) => { readonly lines: readonly string[]; readonly failed: number };
  readonly laneParts: () => readonly string[];
  readonly PACKAGES: readonly string[];
  readonly mutateOf: (root: string, part: string) => readonly string[];
  readonly cutByCost: (files: readonly { readonly path: string; readonly lines: readonly string[]; readonly weights: readonly number[] }[], count: number) => readonly (readonly string[])[];
  readonly weightedFiles: (root: string, paths: readonly string[], maps: Readonly<Record<string, { readonly run: string; readonly segments: Readonly<Record<string, number>> }>>) => readonly { readonly path: string; readonly weights: readonly number[] }[];
  readonly partEnds: (text: string, count: number, weights?: readonly number[]) => { readonly ends: readonly number[]; readonly lines: number };
  readonly segmentsOf: (text: string) => readonly { readonly key: string; readonly start: number; readonly end: number }[];
  readonly costMapOf: (text: string, run: string, lines: readonly (readonly [number, number, number, number])[]) => { readonly run: string; readonly segments: Readonly<Record<string, number>> };
  readonly lineWeights: (text: string, map: { readonly run: string; readonly segments: Readonly<Record<string, number>> }) => number[];
  readonly entriesIn: (entries: readonly string[], files: readonly string[]) => readonly string[];
  readonly changedParts: (root: string, changed: readonly string[]) => { readonly parts: readonly string[]; readonly files: readonly string[] };
  readonly NOT_READ: Readonly<Record<string, string>>;
  readonly testFilesOnDisk: (root: string) => readonly string[];
  readonly unreadTests: (root: string, read: ReadonlySet<string>) => readonly string[];
  readonly staleEntries: (root: string, read: ReadonlySet<string>) => readonly string[];
}

/** The status of a mutant of a report. */
interface Status {
  readonly status: string;
  readonly statusReason?: string;
}

/** A report of Stryker, as this test reads it. */
interface LaneReport {
  readonly files: Readonly<Record<string, { readonly mutants: readonly unknown[] }>>;
  readonly testFiles?: Readonly<Record<string, { readonly tests: readonly unknown[] }>>;
}

/** What the gate of the lane reads beside the reports. */
interface Checks {
  readonly lastTests?: Readonly<Record<string, number>> | undefined;
  readonly lastFiles?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly planned?: readonly { readonly part: string; readonly old: number; readonly new: number; readonly pr: string }[];
  readonly unread?: (read: ReadonlySet<string>) => readonly string[];
  readonly selection?: readonly string[] | undefined;
  readonly partials?: Readonly<Record<string, PartialRead>>;
}

/** The partial read of a part that reached its stop. */
interface PartialRead {
  readonly part: string;
  readonly stopMinutes: number;
  readonly ended: number;
  readonly planned: number;
  readonly counts: { readonly killed: number; readonly hitLimit: number; readonly clock: number; readonly survived: number; readonly disabled: number };
  readonly score: number;
  readonly scoreWithClock: number;
}

/** The part of `tools/mutation/lane-read.ts` that this test reads. */
interface LaneRead {
  readonly fixtureReport: (part: string, killed: number, other: Status, tests?: number) => LaneReport;
  readonly FALL_LINE: number;
  readonly testCount: (report: LaneReport) => number;
  readonly testsLine: (part: string, report: LaneReport, last?: number) => string;
  readonly readReports: (reports: readonly LaneReport[]) => readonly { readonly name: string; readonly counts: { readonly killed: number; readonly hitLimit: number; readonly clock: number; readonly survived: number; readonly disabled: number } }[];
  readonly laneVerdict: (reports: ReadonlyMap<string, LaneReport | undefined>, checks?: Checks) => {
    readonly tests: Readonly<Record<string, number>>;
    readonly files: Readonly<Record<string, readonly string[]>>;
    readonly failed: boolean;
    readonly lines: readonly string[];
    readonly packages: readonly { readonly name: string; readonly outcome: string; readonly score: number; readonly scoreWithClock: number }[];
  };
  readonly flipCases: (expected?: readonly string[]) => readonly { readonly name: string; readonly reports: ReadonlyMap<string, LaneReport | undefined>; readonly core: string; readonly lastTests?: Readonly<Record<string, number>>; readonly lastFiles?: Readonly<Record<string, readonly string[]>>; readonly selection: readonly string[] }[];
  readonly staticLine: (read: unknown) => string;
  readonly partialRead: (part: string, stopMinutes: number, lines: readonly { readonly status: string; readonly reason: string | null }[], planned: number) => PartialRead;
  readonly partialLine: (p: PartialRead) => string;
  readonly PARTIAL_FILE: string;
}

/** This function loads the script of the parts of the lane. */
async function loadLayout(): Promise<Layout> {
  return (await import(pathToFileURL(join(repoRoot(), "tools", "mutation", "layout.ts")).href)) as Layout;
}

/** This function loads the script of the gate of the lane. */
async function loadRead(): Promise<LaneRead> {
  return (await import(pathToFileURL(join(repoRoot(), "tools", "mutation", "lane-read.ts")).href)) as LaneRead;
}

/** This function gives the file of an entry of `mutate`. */
const fileOfEntry = (entry: string): string => entry.split(":")[0] ?? entry;

/** This function gives the name of a file in the folder of its package. */
const lanePath = (name: string, file: string): string => `work/${name}/${file}`;

describe("the copy of the mutation lane", () => {
  // A test file whose import finds no file does not load in the lane. Stryker sees no failed test, so each mutant
  // that the file kills survives. On 2026-11-03, three test files of the compiler did not load.
  it("V-072: each relative import of a file of the copy finds a file of the copy", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.unresolvedImports(root)).toEqual([]);
  });

  // The printer imports `acorn` and `astring`, and on 2026-11-05 the lane did not have these packages. Each test file of the printer
  // did not load, so the lane read 69.13 %, and that figure was no reading.
  it("V-090: each import of a package by a file of the copy finds a package of the lane", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.missingPackages(root)).toEqual([]);
  });

  // The configuration of the compiler loads `module-fault.setup.ts`, and on 2026-11-05 the lane did not load it. So the
  // tests of a module printed other code in the lane than in CI, and one test failed at the dry run of Stryker.
  it("V-091: each setup file of a package with tests in the copy is a setup file of the lane", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.missingSetups(root)).toEqual([]);
  });

  it("V-091: the check names a setup file that the lane does not load", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    const other = mkdtempSync(join(tmpdir(), "vex-lane-"));
    mkdirSync(join(other, "packages", "compiler"), { recursive: true });
    const config = join(other, "packages", "compiler", CONFIG);
    writeFileSync(config, 'export default { test: { setupFiles: ["../testkit/src/fc-setup.ts", "./src/not-in-the-lane.ts"] } };\n');
    const found = layout.missingSetups(other);
    rmSync(other, { recursive: true });
    expect(found).toEqual([`packages/compiler/${CONFIG}: compiler/not-in-the-lane.ts`]);
  });

  // A module copies the text of each op function, and the counters of Stryker stop that copy. On 2026-11-05 the rule read the
  // name of a file, so `module-vec2.test.ts` and 12 other files got the mutated domains, and the dry run of each part failed.
  it("LANE.PLAIN: a test file with an import that reaches the printer reads the copy of the domains that Stryker does not mutate", async () => {
    const layout = await loadLayout();
    const source = join(repoRoot(), "packages", "compiler", "src");
    expect(layout.printsModule(join(source, "module-vec2.test.ts"))).toBe(true);
    expect(layout.printsModule(join(source, "module-sheet.test.ts"))).toBe(true);
  });

  it("LANE.PLAIN: a test file with no import that reaches the printer reads the mutated domains", async () => {
    const layout = await loadLayout();
    expect(layout.printsModule(join(repoRoot(), "packages", "compiler", "src", "sheet-order.test.ts"))).toBe(false);
  });

  it("LANE.PLAIN: the rule classifies each test file of the repository, and no test reads two copies of the domains", async () => {
    const layout = await loadLayout();
    expect(layout.plainFaults(repoRoot())).toEqual([]);
  });

  // A flip holds only its stated fault, so each row must give its own reason and no other fault.
  it("LANE.PLAIN: the rule refuses each file that it cannot classify, for the stated reason", async () => {
    const layout = await loadLayout();
    const other = mkdtempSync(join(tmpdir(), "vex-lane-"));
    const flip = layout.plainFlip(other);
    rmSync(other, { recursive: true });
    expect(flip.lines.length).toBe(6);
    expect(flip.failed).toBe(0);
  });
});

describe("the parts of the mutation lane", () => {
  it("LANE.PARTS: the parts of a package cover each file of the package once, and the parts of a file cover each line once", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const entries = layout.laneParts().flatMap((part) => layout.mutateOf(root, part));
    const whole = layout.PACKAGES.flatMap((name) => layout.mutateOf(root, name));
    expect([...new Set(entries.map(fileOfEntry))].toSorted()).toEqual([...whole].toSorted());
    const ranges = new Map<string, number[][]>();
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const file = fileOfEntry(entry);
      const lines = readFileSync(join(root, file.replace(/^work\/(\w+)\//u, "packages/$1/src/")), "utf8").split(/\r?\n/u).length;
      counts.set(file, lines);
      ranges.set(file, [...(ranges.get(file) ?? []), /:(\d+)-(\d+)$/u.exec(entry)?.slice(1).map(Number) ?? [1, lines]]);
    }
    // The ranges of a file start on line 1, each range starts on the line after the range before it, and the last range ends on the last line.
    const gaps = [...ranges].filter(([file, list]) => {
      const sorted = list.toSorted((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
      return sorted.some((range, index) => range[0] !== (sorted[index - 1]?.[1] ?? 0) + 1) || sorted.at(-1)?.[1] !== counts.get(file);
    });
    expect(gaps.map(([file]) => file)).toEqual([]);
  });

  it("LANE.PARTS: the parts of a package leave out the index, the tests and the files of test support", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const files = layout.PACKAGES.flatMap((name) => layout.mutateOf(root, name));
    expect(files.filter((file) => file.endsWith(".test.ts") || /work\/\w+\/index\.ts$/u.test(file) || file.endsWith("arbitraries.ts") || file.endsWith("test-support.ts") || file.endsWith("fc-setup.ts"))).toEqual([]);
    expect(files).toContain(lanePath("core", "evaluate.ts"));
    expect(files).toContain(lanePath("testkit", "fc-budget.ts"));
  });

  it("LANE.PARTS: each part of module.ts starts on the line after the end of the part before it", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const parts = moduleParts(layout);
    expect(parts).toHaveLength(7);
    const ranges = parts.map((part) => /:(\d+)-(\d+)$/u.exec(layout.mutateOf(root, part)[0] ?? "")?.slice(1).map(Number) ?? []);
    const lines = readFileSync(join(root, "packages", "compiler", "src", "module.ts"), "utf8").split(/\r?\n/u);
    expect(ranges[0]?.[0]).toBe(1);
    ranges.slice(1).forEach((range, index) => expect(range[0]).toBe((ranges[index]?.[1] ?? 0) + 1));
    expect(ranges.at(-1)?.[1]).toBe(lines.length);
    // A class body has no mutator, so a mutant does not cross the end of a method of the class.
    for (const range of ranges.slice(0, -1)) expect(lines[(range[1] ?? 0) - 1]).toMatch(/^ {0,2}\}$/u);
  });

  it("LANE.CUT: with no weights, the cut has the smallest largest part in lines", async () => {
    const layout = await loadLayout();
    const text = ["class A {", "  a() {", "    1;", "  }", "  b() {", "    2;", "    3;", "  }", "}"].join("\n");
    // An end at line 4 gives parts of 4 and 5 lines. An end at line 8 gives parts of 8 and 1 lines.
    expect(layout.partEnds(text, 2)).toEqual({ ends: [4], lines: 9 });
    expect(layout.partEnds(text, 1)).toEqual({ ends: [], lines: 9 });
    expect(() => layout.partEnds("one\ntwo", 2)).toThrow("no closing line");
  });

  it("LANE.COST: a segment ends on a closing line, and its key is the name of its first declaration", async () => {
    const layout = await loadLayout();
    const text = ["// a note", "function a() {", "  if (x) {", "    1;", "  }", "}", "class B {", "  #b() {", "    2;", "  }", "  #b() {", "  }", "}", "const C = 3;"].join("\n");
    expect(layout.segmentsOf(text)).toEqual([
      { key: "a", start: 1, end: 5 },
      { key: "@2", start: 6, end: 6 },
      { key: "B", start: 7, end: 10 },
      { key: "#b", start: 11, end: 12 },
      { key: "@5", start: 13, end: 13 },
      { key: "C", start: 14, end: 14 },
    ]);
    // A second segment of the same name has the key with #2, so each key names one segment.
    expect(layout.segmentsOf("a() {\n}\na() {\n}").map((s) => s.key)).toEqual(["a", "a#2"]);
  });

  it("LANE.COST: the cost map adds the plan of each line into its segment, and a new segment has the mean cost of a line", async () => {
    const layout = await loadLayout();
    const text = ["a() {", "  1;", "}", "b() {", "  2;", "}"].join("\n");
    const map = layout.costMapOf(text, "42", [[2, 3, 1, 600], [5, 1, 0, 60], [3, 1, 0, 0]]);
    expect(map).toEqual({ run: "42", segments: { a: 600, b: 60 } });
    expect(layout.lineWeights(text, map)).toEqual([200, 200, 200, 20, 20, 20]);
    expect(layout.lineWeights(text, { run: "42", segments: { a: 600 } })).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it("LANE.CUT: with weights, the cut has the smallest largest part in cost", async () => {
    const layout = await loadLayout();
    const text = ["a() {", "  1;", "}", "b() {", "  2;", "}", "c() {", "  3;", "}", "d() {", "  4;", "}"].join("\n");
    // By lines, the end is the closing line of b. Most of the cost is in a, so by cost the end is the closing line of a.
    expect(layout.partEnds(text, 2)).toEqual({ ends: [6], lines: 12 });
    expect(layout.partEnds(text, 2, [30, 30, 30, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual({ ends: [3], lines: 12 });
    // Each cut into three parts has a part of 90 or more. Two cuts have 90 and the same squares, and the first of them is the cut.
    expect(layout.partEnds(text, 3, [30, 30, 30, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toEqual({ ends: [3, 6], lines: 12 });
  });

  it("LANE.CUT: a part ends on the last line of a file or on a closing line, and a part of a file has its range of lines", async () => {
    const layout = await loadLayout();
    const files = [
      { path: "a", lines: ["const k = 1;"], weights: [50] },
      { path: "b", lines: ["y() {", "  2;", "}", "z() {", "  3;", "}"], weights: [10, 10, 10, 10, 10, 10] },
    ];
    // The last line of a is an end line, but it is not a closing line.
    expect(layout.cutByCost(files, 2)).toEqual([["a"], ["b"]]);
    expect(layout.cutByCost(files, 3)).toEqual([["a"], ["b:1-3"], ["b:4-6"]]);
    expect(layout.cutByCost(files, 1)).toEqual([["a", "b"]]);
    expect(layout.cutByCost(files.map((file) => ({ ...file })), 3)).toEqual(layout.cutByCost(files, 3));
  });

  it("LANE.CUT: a file that no map names has the mean cost of a line of the files of the group with a map", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const [json, fix] = [lanePath("core", "json.ts"), lanePath("core", "fix.ts")];
    const [named, other] = layout.weightedFiles(root, [json, fix], { [json]: { run: "42", segments: { import: 600 } } });
    const mean = (named?.weights ?? []).reduce((sum, w) => sum + w, 0) / (named?.weights.length ?? 1);
    expect(mean).toBeGreaterThan(0);
    for (const w of other?.weights ?? []) expect(w).toBeCloseTo(mean, 9);
    expect(new Set(layout.weightedFiles(root, [fix], {})[0]?.weights)).toEqual(new Set([1]));
  });

  it("LANE.PARTS: a part that the lane does not have stops the run", async () => {
    const layout = await loadLayout();
    expect(() => layout.mutateOf(repoRoot(), "core.base.99")).toThrow("does not have the part");
    expect(() => layout.mutateOf(repoRoot(), "other")).toThrow("does not have the part");
  });

  it("LANE.DELAY: a changed test file selects the source file of the same name", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const selected = layout.changedParts(root, ["packages/core/src/evaluate.test.ts", "docs/ROADMAP.md", "packages/core/src/not-a-file.ts"]);
    expect(selected.files).toEqual([lanePath("core", "evaluate.ts")]);
    // A large file can have its lines in more than one part, and the change selects each of them.
    const holders = layout.laneParts().filter((part) => layout.mutateOf(root, part).some((entry) => fileOfEntry(entry) === lanePath("core", "evaluate.ts")));
    expect(selected.parts).toEqual(holders);
    expect(holders.length).toBeGreaterThan(0);
    for (const part of holders) expect(part).toMatch(/^core\.base\.\d+$/u);
  });

  it("LANE.DELAY: a change of module.ts selects both of its parts", async () => {
    const layout = await loadLayout();
    const selected = layout.changedParts(repoRoot(), ["packages/compiler/src/module.ts"]);
    expect(selected).toEqual({ parts: moduleParts(layout), files: [lanePath("compiler", "module.ts")] });
    expect(layout.entriesIn(["work/compiler/module.ts:1-9", "work/core/ir.ts"], ["work/compiler/module.ts"])).toEqual(["work/compiler/module.ts:1-9"]);
  });

  it("LANE.DELAY: the full run starts each week and the night is report only", () => {
    const workflows = join(repoRoot(), ".github", "workflows");
    const weekly = readFileSync(join(workflows, "mutation-weekly.yml"), "utf8");
    const night = readFileSync(join(workflows, "nightly.yml"), "utf8");
    expect(weekly).toMatch(/cron: "\d+ \d+ \* \* 6"/u);
    expect(weekly).toContain("lane-read.ts --gate");
    expect(weekly).toContain("max-parallel: 3");
    expect(night).not.toContain("lane-read.ts --gate");
  });

  it("LANE.DRYRUN: a change of the lane starts the first test run of each part", () => {
    const workflow = readFileSync(join(repoRoot(), ".github", "workflows", "lane-dry-run.yml"), "utf8");
    const action = readFileSync(join(repoRoot(), ".github", "actions", "mutation-part", "action.yml"), "utf8");
    const config = readFileSync(join(repoRoot(), "tools", "mutation", "stryker.config.mjs"), "utf8");
    expect(workflow).toContain("plan.ts --full");
    expect(workflow).toContain("tools/mutation/**");
    expect(workflow).toContain("max-parallel: 3");
    expect(workflow).toContain('dry-run: "1"');
    expect(action).toContain("VEX_DRY_RUN: ${{ inputs.dry-run }}");
    expect(config).toContain('disableBail: process.env.VEX_DRY_RUN === "1"');
  });
});

describe("the gate of the mutation lane", () => {
  it("LANE.GATE: each case of the flip gives its outcome", async () => {
    const read = await loadRead();
    const file = "work/core/a.test.ts";
    const unread = (names: ReadonlySet<string>): readonly string[] => (names.has(file) ? [] : ["packages/core/src/a.test.ts"]);
    const outcomes = read.flipCases([file]).map((c) => {
      const verdict = read.laneVerdict(c.reports, { lastTests: c.lastTests, lastFiles: c.lastFiles, unread, selection: c.selection });
      return [verdict.packages.find((p) => p.name === "core")?.outcome, verdict.failed];
    });
    expect(outcomes).toEqual([
      ["pass", false],
      ["under the line", true],
      ["no read", true],
      ["under the line", true],
      ["no read", true],
      ["no read", true],
      ["no read", true],
      ["no read", true],
      ["no read", true],
    ]);
  });

  it("LANE.GATE: a time-out of the clock counts as not found, and a hit limit counts as found", async () => {
    const read = await loadRead();
    const clock = new Map([["core.kernel", read.fixtureReport("core.kernel", 90, { status: "Timeout", statusReason: "Timeout" })]]);
    const limit = new Map([["core.kernel", read.fixtureReport("core.kernel", 90, { status: "Timeout", statusReason: "Hit limit reached (5/1)" })]]);
    expect(read.laneVerdict(clock).packages).toEqual([{ name: "core", outcome: "under the line", score: 90, scoreWithClock: 100 }]);
    expect(read.laneVerdict(limit).packages).toEqual([{ name: "core", outcome: "pass", score: 100, scoreWithClock: 100 }]);
  });

  it("LANE.GATE: two parts that report the same mutant count it once", async () => {
    const read = await loadRead();
    const stopped = read.fixtureReport("core.kernel", 100, { status: "Survived" });
    const disabled = read.fixtureReport("core.kernel", 0, { status: "Ignored" });
    expect(read.readReports([stopped, disabled])[0]?.counts).toEqual({ killed: 100, hitLimit: 0, clock: 0, survived: 0, disabled: 0 });
    expect(read.readReports([disabled, stopped])[0]?.counts).toEqual({ killed: 100, hitLimit: 0, clock: 0, survived: 0, disabled: 0 });
  });

  it("LANE.GATE: the read prints the disabled mutants, the survivors and each file", async () => {
    const read = await loadRead();
    const report = read.fixtureReport("core.kernel", 90, { status: "Ignored" });
    const fall = read.fixtureReport("core.base.1", 10, { status: "NoCoverage" });
    const { lines } = read.laneVerdict(new Map([["core.kernel", report], ["core.base.1", fall]]));
    expect(lines.join("\n")).toContain("10 disabled by a comment");
    expect(lines.join("\n")).toContain("core/core.kernel.ts: 100.00 %");
    expect(lines.join("\n")).toContain("survived: core/core.base.1.ts:11 Fixture");
  });

  it("LANE.GATE: the read prints the static mutants and their completed tests, and it does not call this a time", async () => {
    const read = await loadRead();
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
    const mutant = (line: number, status: string, isStatic: boolean, testsCompleted: number): unknown => ({
      status,
      mutatorName: "Fixture",
      static: isStatic,
      testsCompleted,
      location: { ...location, start: { line, column: 0 }, end: { line, column: 1 } },
    });
    const report = { files: { "work/core/a.ts": { mutants: [mutant(1, "Killed", true, 30), mutant(2, "Survived", false, 10), mutant(3, "Ignored", true, 500)] } } };
    expect(read.staticLine(read.readReports([report])[0])).toBe("core static mutants: 1 of 2, with 30 of 40 completed tests (75.0 %). Other mutants: 1, with 10 completed tests. This is a count of tests, not a time.");
  });

  it("LANE.TESTS: the real fall of compiler.rest reads as no read, and a copy with no fault passes", async () => {
    const read = await loadRead();
    const part = "compiler.rest.1";
    const report = (tests: number): LaneReport => read.fixtureReport(part, 99, { status: "Survived" }, tests);
    const fell = read.laneVerdict(new Map([[part, report(1029)]]), { lastTests: { [part]: 1990 } });
    const clean = read.laneVerdict(new Map([[part, report(1990)]]), { lastTests: { [part]: 1990 } });
    expect(fell.packages[0]?.outcome).toBe("no read");
    expect(fell.lines.join("\n")).toContain("compiler: no read: tests fell. The part compiler.rest.1 read 1029 tests, and the last good read has 1990: a fall of 48.3 %");
    expect(clean.packages[0]?.outcome).toBe("pass");
  });

  it("LANE.TESTS: a fall at the line passes, and a fall over the line is no read", async () => {
    const read = await loadRead();
    const part = "testkit";
    const verdict = (tests: number): string | undefined => read.laneVerdict(new Map([[part, read.fixtureReport(part, 99, { status: "Survived" }, tests)]]), { lastTests: { [part]: 100 } }).packages[0]?.outcome;
    expect(read.FALL_LINE).toBe(0.2);
    expect(verdict(80)).toBe("pass");
    expect(verdict(79)).toBe("no read");
    expect(verdict(500)).toBe("pass");
  });

  it("LANE.TESTS: a part with a fall or with no report keeps its old count, and a good read saves its count", async () => {
    const read = await loadRead();
    const report = (part: string, tests: number): LaneReport => read.fixtureReport(part, 99, { status: "Survived" }, tests);
    const { tests } = read.laneVerdict(new Map<string, LaneReport | undefined>([["testkit", report("testkit", 10)], ["core.kernel", undefined], ["domains.1", report("domains.1", 90)]]), { lastTests: { testkit: 100, "core.kernel": 50, "domains.1": 80 } });
    expect(tests).toEqual({ testkit: 100, "core.kernel": 50, "domains.1": 90 });
  });

  it("LANE.TESTS: a count compares only with a read of the same mutated files, and the verdict saves the files of each count", async () => {
    const read = await loadRead();
    const part = "core.base.1";
    const report = read.fixtureReport(part, 99, { status: "Survived" }, 10);
    const own = ["core/core.base.1.ts"];
    const same = read.laneVerdict(new Map([[part, report]]), { lastTests: { [part]: 100 }, lastFiles: { [part]: own } });
    expect(same.packages[0]?.outcome).toBe("no read");
    expect(same.files).toEqual({ [part]: own });
    // A new cut of the parts gives the part other files, so its count starts a new line of reads.
    const other = read.laneVerdict(new Map([[part, report]]), { lastTests: { [part]: 100 }, lastFiles: { [part]: ["core/other.ts"] } });
    expect(other.packages[0]?.outcome).toBe("pass");
    expect(other.tests).toEqual({ [part]: 10 });
    expect(other.files).toEqual({ [part]: own });
    expect(other.lines.join("\n")).toContain("core.base.1 tests: 10 in 1 files, with other mutated files than at the last good read, so no compare.");
    // A last read with no record of the files of a part compares nothing for that part.
    expect(read.laneVerdict(new Map([[part, report]]), { lastTests: { [part]: 100 }, lastFiles: {} }).packages[0]?.outcome).toBe("pass");
  });

  it("LANE.TESTS: a planned fall holds only while the last good read is its old count", async () => {
    const read = await loadRead();
    const part = "testkit";
    const reports = new Map([[part, read.fixtureReport(part, 99, { status: "Survived" }, 50)]]);
    const planned = [{ part, old: 100, new: 50, pr: "#1" }];
    expect(read.laneVerdict(reports, { lastTests: { [part]: 100 }, planned }).packages[0]?.outcome).toBe("pass");
    expect(read.laneVerdict(reports, { lastTests: { [part]: 100 }, planned }).tests).toEqual({ [part]: 50 });
    expect(read.laneVerdict(reports, { lastTests: { [part]: 90 }, planned }).packages[0]?.outcome).toBe("no read");
  });

  it("LANE.TESTS: the read prints the tests of a part beside its score", async () => {
    const read = await loadRead();
    const report = read.fixtureReport("testkit", 99, { status: "Survived" }, 7);
    expect(read.testCount(report)).toBe(7);
    expect(read.testsLine("testkit", report)).toBe("testkit tests: 7 in 1 files, with no earlier read.");
    expect(read.testsLine("testkit", report, 9)).toBe("testkit tests: 7 in 1 files, and the last good read has 9.");
    expect(read.laneVerdict(new Map([["testkit", report]]), { lastTests: { testkit: 9 } }).lines.join("\n")).toContain("testkit tests: 7 in 1 files, and the last good read has 9.");
  });

  it("LANE.FILES: a test file on the disk that no part read is no read", async () => {
    const read = await loadRead();
    const report = read.fixtureReport("testkit", 99, { status: "Survived" });
    const clean = read.laneVerdict(new Map([["testkit", report]]), { unread: () => [] });
    const found = read.laneVerdict(new Map([["testkit", report]]), { unread: (names) => (names.has("work/testkit/testkit.test.ts") ? ["packages/compiler/src/a.test.ts"] : []) });
    expect(clean.failed).toBe(false);
    expect(found.lines.join("\n")).toContain("compiler: no read: file not read. No part read packages/compiler/src/a.test.ts");
  });

  it("LANE.FILES: a difference of the two reads is no read, with its own text, on each side", async () => {
    const read = await loadRead();
    const report = read.fixtureReport("testkit", 99, { status: "Survived" });
    const same = read.laneVerdict(new Map([["testkit", report]]), { selection: ["work/testkit/testkit.test.ts"] });
    const more = read.laneVerdict(new Map([["testkit", report]]), { selection: ["work/testkit/testkit.test.ts", "work/compiler/a.test.ts"] });
    const less = read.laneVerdict(new Map([["testkit", report]]), { selection: ["work/compiler/a.test.ts"] });
    expect(same.failed).toBe(false);
    expect(more.lines.join("\n")).toContain("compiler: no read: the two reads differ. The load check selects work/compiler/a.test.ts, and no report of the run read it.");
    expect(less.lines.join("\n")).toContain("testkit: no read: the two reads differ. A report of the run read work/testkit/testkit.test.ts, and the load check does not select it.");
    expect(less.packages.find((p) => p.name === "testkit")?.outcome).toBe("no read");
  });

  it("LANE.FILES: a full run that saved no selection is no read, and a run that does not ask for one reads as before", async () => {
    const read = await loadRead();
    const report = read.fixtureReport("testkit", 99, { status: "Survived" });
    const none = read.laneVerdict(new Map([["testkit", report]]), { selection: [] });
    expect(none.lines.join("\n")).toContain("testkit: no read: no selection.");
    expect(none.failed).toBe(true);
    expect(read.laneVerdict(new Map([["testkit", report]])).failed).toBe(false);
  });

  it("LANE.FILES: the load check saves its selection, and each job copies it beside its report", () => {
    const check = readFileSync(join(repoRoot(), "tools", "mutation", "load-check.ts"), "utf8");
    const lane = readFileSync(join(repoRoot(), "tools", "mutation", "lane-read.ts"), "utf8");
    expect(check).toContain("writeFileSync(`${here}${SELECTION_FILE}`");
    expect(lane).toContain('"load-selection.json"');
  });

  it("LANE.FILES: a run with a missing part does not read the files by name", async () => {
    const read = await loadRead();
    const verdict = read.laneVerdict(new Map([["testkit", undefined]]), { unread: () => ["packages/testkit/src/a.test.ts"] });
    expect(verdict.lines.join("\n")).not.toContain("file not read");
  });

  it("LANE.FILES: the allow list states a reason for each file, and each of its files is on the disk", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const onDisk = layout.testFilesOnDisk(root);
    expect(Object.keys(layout.NOT_READ).filter((file) => !onDisk.includes(file))).toEqual([]);
    expect(Object.values(layout.NOT_READ).filter((reason) => reason.length < 20)).toEqual([]);
  });

  it("LANE.FILES: the check names a file that no part reads, and an entry of the allow list that is not true", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const onDisk = layout.testFilesOnDisk(root);
    const lane = new Set(onDisk.map((file) => file.replace(/^packages\/([^/]+)\/src\//u, "work/$1/")));
    expect(layout.unreadTests(root, lane)).toEqual([]);
    lane.delete(lanePath("core", "evaluate.test.ts"));
    expect(layout.unreadTests(root, lane)).toEqual(["packages/core/src/evaluate.test.ts"]);
    expect(layout.staleEntries(root, new Set())).toEqual([]);
    expect(layout.staleEntries(root, new Set([lanePath("core", "spec-coverage.test.ts")]))).toEqual(["packages/core/src/spec-coverage.test.ts"]);
  });

  it("LANE.TESTS: the weekly run reads the last good read and saves its own", () => {
    const weekly = readFileSync(join(repoRoot(), ".github", "workflows", "mutation-weekly.yml"), "utf8");
    expect(weekly).toContain("--last reports/last-tests/lane-tests.json");
    expect(weekly).toContain("name: lane-tests");
    expect(weekly).toContain("actions: read");
  });

  it("LANE.GATE: a part with a report of no mutants is no read", async () => {
    const read = await loadRead();
    const verdict = read.laneVerdict(new Map([["core.kernel", { files: {} }], ["testkit", read.fixtureReport("testkit", 99, { status: "Survived" })]]));
    expect(verdict.packages.map((p) => [p.name, p.outcome])).toEqual([["core", "no read"], ["testkit", "pass"]]);
    expect(verdict.failed).toBe(true);
  });
});

/** The functions of the reporter of the cost of each mutant (tools/mutation/lane-cost.ts). */
interface LaneCost {
  readonly PLAN_FILE: string;
  readonly COST_FILE: string;
  readonly laneFile: (fileName: string) => string;
  readonly STOP_MINUTES: number;
  readonly TARGET_MINUTES: number;
  readonly PLAN_PER_CLOCK: number;
  readonly clockMinutes: (netMs: number) => number;
  readonly filePlans: (plans: readonly unknown[]) => Record<string, FilePlan>;
  readonly planLine: (part: string, files: Readonly<Record<string, FilePlan>>) => string;
  readonly STATIC_LIMITS: Readonly<Record<string, number>>;
  readonly staticFaults: (files: Readonly<Record<string, FilePlan>>) => string[];
  readonly TOP_TESTS: number;
  readonly testPlans: (plans: readonly unknown[], tests: readonly { id: string; name: string; fileName?: string; timeSpentMs: number }[], top?: number) => (readonly [string, string, number, number, number])[];
  readonly costOf: (run: { file: string; line: number; static: boolean; netMs: number; limitMs: number } | undefined, status: string) => number | null;
  readonly costReporter: (root: string, now: () => number, afterPlan?: () => void) => { onDryRunCompleted: (event: { result: { tests: readonly unknown[] } }) => void; onMutationTestingPlanReady: (event: { mutantPlans: readonly unknown[] }) => void; onMutantTested: (result: unknown) => void };
  readonly strykerPlugins: readonly { readonly kind: string; readonly name: string; readonly value: Record<string, unknown> }[];
}

/** The plan of one file of a part, with the plan of each of its lines. */
interface FilePlan {
  readonly mutants: number;
  readonly runs: number;
  readonly static: number;
  readonly netMs: number;
  readonly limitMs: number;
  readonly lines: readonly (readonly [number, number, number, number])[];
}

/** This function gives the plan of a file with 3 runs, 1 of them static, and the planned net time `netMs`. */
const planRow = (netMs: number): FilePlan => ({ mutants: 4, runs: 3, static: 1, netMs, limitMs: 0, lines: [] });

/** This function gives a plan of Stryker for a run of the tests `testFilter`. With no filter, the run starts each test. */
const filteredRun = (id: string, testFilter?: readonly string[]): unknown => ({ plan: "Run", mutant: { id, fileName: "/w/work/core/steps.ts" }, netTime: 1, runOptions: testFilter === undefined ? { timeout: 9 } : { timeout: 9, testFilter } });

/** This function loads the reporter of the cost of each mutant. */
async function loadCost(): Promise<LaneCost> {
  return (await import(pathToFileURL(join(repoRoot(), "tools", "mutation", "lane-cost.ts")).href)) as LaneCost;
}

/** The functions of the script of the cost maps (tools/mutation/cost-map.ts). */
interface CostMapScript {
  readonly partMinutes: (root: string, parts: readonly string[], maps: Readonly<Record<string, { readonly run: string; readonly segments: Readonly<Record<string, number>> }>>) => number[];
}

/** This function loads the script of the cost maps. */
async function loadCostMap(): Promise<CostMapScript> {
  return (await import(pathToFileURL(join(repoRoot(), "tools", "mutation", "cost-map.ts")).href)) as CostMapScript;
}

/** This function gives the parts of compiler.module, in their order. */
const moduleParts = (layout: Layout): string[] => layout.laneParts().filter((part) => part.startsWith("compiler.module."));

/**
 * This function gives a plan of Stryker for one mutant: a run with its net time and its limit, or an early result. Stryker
 * counts the lines of a plan from 0, so the mutant starts on the line `line` + 1.
 */
function planOf(id: string, file: string, run?: { readonly netMs: number; readonly limitMs: number; readonly static?: boolean }, line = 0): unknown {
  const mutant = { id, fileName: `/runner/vex/tools/mutation/work/core/${file}`, static: run?.static ?? false, location: { start: { line, column: 2 }, end: { line, column: 9 } } };
  return run === undefined ? { plan: "EarlyResult", mutant: { ...mutant, status: "NoCoverage" } } : { plan: "Run", mutant, netTime: run.netMs, runOptions: { timeout: run.limitMs } };
}

// On 2026-11-06, Nightly 42142449218 stopped three parts of the core at the limit of 150 minutes. The parts are cut by
// the size of their files, and the stopped jobs uploaded nothing, so no record gave the time of a file.
describe("the cost of the mutation lane", () => {
  it("LANE.COST: a file of Stryker gets its path of the lane, from a path of Linux or of Windows", async () => {
    const cost = await loadCost();
    expect(cost.laneFile("/home/runner/work/vex/vex/tools/mutation/work/core/steps.ts")).toBe("work/core/steps.ts");
    expect(cost.laneFile("D:\\git\\vex\\tools\\mutation\\work\\domains\\vec2.ts")).toBe("work/domains/vec2.ts");
  });

  it("LANE.COST: the plan of a file counts its mutants, its runs and its static runs, and it adds their planned times", async () => {
    const cost = await loadCost();
    const plans = [planOf("1", "steps.ts", { netMs: 100, limitMs: 120150, static: true }, 9), planOf("2", "steps.ts", { netMs: 20, limitMs: 120030 }, 4), planOf("3", "steps.ts", undefined, 4), planOf("4", "size.ts", { netMs: 5, limitMs: 120008 }), planOf("5", "steps.ts", { netMs: 7, limitMs: 120010 }, 9)];
    expect(cost.filePlans(plans)).toEqual({
      "work/core/size.ts": { mutants: 1, runs: 1, static: 0, netMs: 5, limitMs: 120008, lines: [[1, 1, 0, 5]] },
      "work/core/steps.ts": { mutants: 4, runs: 3, static: 1, netMs: 127, limitMs: 360190, lines: [[5, 1, 0, 20], [10, 2, 1, 107]] },
    });
  });

  it("LANE.COST: the line of a plan gives the estimate of its clock, and it has a mark over the target", async () => {
    const cost = await loadCost();
    expect([cost.STOP_MINUTES, cost.TARGET_MINUTES, cost.PLAN_PER_CLOCK]).toEqual([140, 100, 9.8]);
    expect(cost.clockMinutes(9.8 * 60_000 * 50)).toBeCloseTo(50);
    const under = cost.planLine("compiler.module.1", { "work/compiler/module.ts": planRow(9.8 * 60_000 * 60), "work/compiler/lower.ts": planRow(9.8 * 60_000 * 40) });
    expect(under).toBe("The plan of compiler.module.1: 6 runs, 2 of them static, with a planned net time of 16.3 h. Its estimate is 100 minutes of the clock, against the target of 100 and the stop of 140.");
    const over = cost.planLine("compiler.module.1", { "work/compiler/module.ts": planRow(9.8 * 60_000 * 101) });
    expect(over).toMatch(/Its estimate is 101 minutes of the clock, against the target of 100 and the stop of 140\. OVER THE TARGET: cut this part \(LANE\.COST\)\.$/u);
  });

  it("LANE.COST: a time-out costs its limit, another run costs its net time, and an early result costs no run", async () => {
    const cost = await loadCost();
    const run = { file: "work/core/steps.ts", line: 3, static: true, netMs: 100, limitMs: 120150 };
    expect([cost.costOf(run, "Timeout"), cost.costOf(run, "Killed"), cost.costOf(run, "Survived"), cost.costOf(undefined, "NoCoverage")]).toEqual([120150, 100, 100, null]);
  });

  it("LANE.COST: the reporter writes the plan, then one line for each mutant that ends, and a new plan clears the old lines", async () => {
    const cost = await loadCost();
    const root = mkdtempSync(join(tmpdir(), "vex-lane-cost-"));
    try {
      let clock = 1000;
      const reporter = cost.costReporter(root, () => clock);
      const plans = [planOf("1", "steps.ts", { netMs: 100, limitMs: 120150, static: true }, 6), planOf("2", "size.ts")];
      reporter.onMutationTestingPlanReady({ mutantPlans: plans });
      clock = 121500;
      // A result counts its lines from 1, and the reason of a time-out tells a hit limit from the clock.
      reporter.onMutantTested({ id: "1", fileName: "/runner/vex/tools/mutation/work/core/steps.ts", status: "Timeout", static: true, statusReason: "Hit limit reached (501/500)", location: { start: { line: 7, column: 3 } } });
      reporter.onMutantTested({ id: "2", fileName: "/runner/vex/tools/mutation/work/core/size.ts", status: "NoCoverage", statusReason: "not covered" });
      const plan = JSON.parse(readFileSync(join(root, cost.PLAN_FILE), "utf8")) as { files: Record<string, unknown> };
      expect(Object.keys(plan.files)).toEqual(["work/core/size.ts", "work/core/steps.ts"]);
      const lines = readFileSync(join(root, cost.COST_FILE), "utf8").trim().split("\n").map((line) => JSON.parse(line) as unknown);
      expect(lines).toEqual([
        { file: "work/core/steps.ts", line: 7, status: "Timeout", reason: "Hit limit reached (501/500)", static: true, netMs: 100, limitMs: 120150, costMs: 120150, atMs: 120500 },
        { file: "work/core/size.ts", line: null, status: "NoCoverage", reason: null, static: false, netMs: null, limitMs: null, costMs: null, atMs: 120500 },
      ]);
      reporter.onMutationTestingPlanReady({ mutantPlans: plans });
      expect(readFileSync(join(root, cost.COST_FILE), "utf8")).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("LANE.COST: under the committed cost maps, the estimate of each part of a full run is at most the target", async () => {
    const [layout, cost, script] = await Promise.all([loadLayout(), loadCost(), loadCostMap()]);
    const root = repoRoot();
    const costs = JSON.parse(readFileSync(join(root, "tools", "mutation", "costs.json"), "utf8")) as Record<string, { readonly run: string; readonly segments: Readonly<Record<string, number>> }>;
    // A file with no mutant has a map with no cost, and a refresh keeps its old map. Each map with a cost comes from one run.
    const costly = Object.values(costs).filter((map) => Object.values(map.segments).some((ms) => ms > 0));
    expect(new Set(costly.map((map) => map.run))).toEqual(new Set(["42499785623"]));
    // A new file has no map until the next refresh of the maps. The cut gives each of its lines the mean cost of its group,
    // so the file still goes into a part, and the estimate of the part still counts it.
    const parts = layout.laneParts();
    const minutes = script.partMinutes(root, parts, costs);
    expect(minutes).toHaveLength(parts.length);
    expect(parts.filter((_part, index) => (minutes[index] ?? 0) > cost.TARGET_MINUTES)).toEqual([]);
  });

  it("LANE.STATIC: a plan with more static runs in a file than its limit gives a fault, and a plan at the limit gives none", async () => {
    const cost = await loadCost();
    const limit = cost.STATIC_LIMITS["work/compiler/module.ts"] ?? 0;
    expect(cost.STATIC_LIMITS).toEqual({ "work/compiler/module.ts": 600, "work/core/kernel.ts": 350, "work/core/list.ts": 200 });
    const at = { "work/compiler/module.ts": { ...planRow(1), static: limit }, "work/core/steps.ts": { ...planRow(1), static: limit * 9 } };
    expect(cost.staticFaults(at)).toEqual([]);
    const over = { "work/compiler/module.ts": { ...planRow(1), static: limit + 1 } };
    expect(cost.staticFaults(over)).toEqual([
      "The plan has 601 static runs in work/compiler/module.ts, and the limit is 600. Code outside a test gives a static mutant, which starts each test. Move that code into a test, a beforeEach or a function (LANE.STATIC).",
    ]);
    expect(cost.staticFaults({})).toEqual([]);
  });

  it("LANE.COST: the plan gives the tests of the largest cost, and a run with no filter of tests starts each test", async () => {
    const cost = await loadCost();
    expect(cost.TOP_TESTS).toBe(40);
    const tests = [
      { id: "a", name: "slow", fileName: "/runner/vex/tools/mutation/work/compiler/module.test.ts", timeSpentMs: 400.4 },
      { id: "b", name: "quick", fileName: "/runner/vex/tools/mutation/work/core/steps.test.ts", timeSpentMs: 2 },
      { id: "c", name: "wide", timeSpentMs: 50 },
    ];
    // The run 1 is static: it has no filter, so it starts each test. An early result starts no test.
    const plans = [filteredRun("1"), filteredRun("2", ["b", "c"]), filteredRun("3", ["c"]), filteredRun("4", ["c"]), planOf("5", "steps.ts")];
    expect(cost.testPlans(plans, tests)).toEqual([
      ["slow", "work/compiler/module.test.ts", 400, 1, 400],
      ["wide", "", 50, 4, 200],
      ["quick", "work/core/steps.test.ts", 2, 2, 4],
    ]);
    expect(cost.testPlans(plans, tests, 1)).toEqual([["slow", "work/compiler/module.test.ts", 400, 1, 400]]);
    const root = mkdtempSync(join(tmpdir(), "vex-lane-tests-"));
    try {
      const reporter = cost.costReporter(root, () => 0);
      reporter.onDryRunCompleted({ result: { tests } });
      reporter.onMutationTestingPlanReady({ mutantPlans: plans });
      const plan = JSON.parse(readFileSync(join(root, cost.PLAN_FILE), "utf8")) as { tests: unknown };
      expect(plan.tests).toEqual(cost.testPlans(plans, tests));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("LANE.DRYRUN: the reporter starts the function after the plan when the plan is on the disk, and a dry run reaches the plan", async () => {
    const cost = await loadCost();
    const root = mkdtempSync(join(tmpdir(), "vex-lane-plan-"));
    try {
      const seen: boolean[] = [];
      const reporter = cost.costReporter(root, () => 0, () => seen.push(readFileSync(join(root, cost.PLAN_FILE), "utf8").includes("work/core/steps.ts")));
      reporter.onMutationTestingPlanReady({ mutantPlans: [planOf("1", "steps.ts", { netMs: 1, limitMs: 2 })] });
      expect(seen).toEqual([true]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // With dryRunOnly, Stryker stops before its plan, and the dry run gives no plan of the part.
    const config = readFileSync(join(repoRoot(), "tools", "mutation", "stryker.config.mjs"), "utf8");
    expect(config).not.toContain("dryRunOnly");
    expect(readFileSync(join(repoRoot(), "tools", "mutation", "lane-cost.ts"), "utf8")).toContain(`process.env["VEX_DRY_RUN"] === "1" ? stopAfterPlan : undefined`);
  });

  it("LANE.COST: Stryker loads the reporter, and each part of a full run stops itself 10 minutes under the limit of its job", async () => {
    const cost = await loadCost();
    expect(cost.strykerPlugins.map((plugin) => [plugin.kind, plugin.name, typeof plugin.value["onMutantTested"], typeof plugin.value["onMutationTestingPlanReady"]])).toEqual([["Reporter", "lane-cost", "function", "function"]]);
    const config = readFileSync(join(repoRoot(), "tools", "mutation", "stryker.config.mjs"), "utf8");
    expect(config).toContain(`"./lane-cost.ts"`);
    expect(config).toMatch(/reporters: \[[^\]]*"lane-cost"/u);
    const action = readFileSync(join(repoRoot(), ".github", "actions", "mutation-part", "action.yml"), "utf8");
    expect(action).toContain(`timeout --signal=TERM --kill-after=2m "\${STOP_MINUTES}m" pnpm --filter @vex/mutation run mutation`);
    for (const name of ["nightly.yml", "mutation-weekly.yml"]) {
      const workflow = readFileSync(join(repoRoot(), ".github", "workflows", name), "utf8");
      const job = workflow.slice(workflow.indexOf("\n  mutation:\n"));
      expect([name, /timeout-minutes: (\d+)/u.exec(job)?.[1], /stop-minutes: (\d+)/u.exec(job)?.[1]]).toEqual([name, "150", "140"]);
    }
  });
});

describe("the partial read of a part that reached its stop", () => {
  it("LANE.PARTIAL: the mutants that ended give a partial score, and a time-out with no reason counts as the clock", async () => {
    const read = await loadRead();
    const lines = [
      ...Array.from({ length: 8 }, () => ({ status: "Killed", reason: null })),
      { status: "Timeout", reason: "Hit limit reached (501/500)" },
      { status: "Timeout", reason: null },
      { status: "Survived", reason: null },
      { status: "NoCoverage", reason: null },
      { status: "Ignored", reason: null },
      { status: "RuntimeError", reason: null },
    ];
    const partial = read.partialRead("compiler.module.2", 140, lines, 40);
    expect(partial).toEqual({ part: "compiler.module.2", stopMinutes: 140, ended: 14, planned: 40, counts: { killed: 8, hitLimit: 1, clock: 1, survived: 2, disabled: 1 }, score: 75, scoreWithClock: (100 * 10) / 12 });
    expect(read.partialLine(partial)).toBe(
      "PARTIAL: the part compiler.module.2 reached its stop of 140 minutes. Of the 40 mutants of its plan, 14 ended, with the partial score 75.00 % (9 of 12: stopped 8, hit limit 1, clock time-outs 1, survived 2, disabled 1). The mutants that ended are not a random sample, so this is not a score of the part. The gate reads the part as no read (LANE.PARTIAL).",
    );
  });

  it("LANE.PARTIAL: the gate prints the partial read of a part with no report, and the part stays no read", async () => {
    const read = await loadRead();
    const partial = read.partialRead("core.kernel", 140, [{ status: "Killed", reason: null }], 9);
    const reports = new Map([["core.kernel", undefined], ["testkit", read.fixtureReport("testkit", 99, { status: "Survived" })]]);
    const verdict = read.laneVerdict(reports, { partials: { "core.kernel": partial } });
    expect(verdict.packages.map((p) => [p.name, p.outcome])).toEqual([["core", "no read"], ["testkit", "pass"]]);
    expect(verdict.failed).toBe(true);
    expect(verdict.lines.filter((line) => line.startsWith("PARTIAL: "))).toEqual([read.partialLine(partial)]);
    expect(read.laneVerdict(reports).lines.some((line) => line.startsWith("PARTIAL: "))).toBe(false);
  });

  it("LANE.PARTIAL: a part that reaches its stop writes its partial read beside its report, and the job still fails", async () => {
    const read = await loadRead();
    expect(read.PARTIAL_FILE).toBe("partial.json");
    const action = readFileSync(join(repoRoot(), ".github", "actions", "mutation-part", "action.yml"), "utf8");
    const stop = action.slice(action.indexOf("if [[ $status -eq 124"));
    expect(stop.slice(0, stop.indexOf("fi\n"))).toContain(`node tools/mutation/lane-read.ts --partial "$VEX_MUTATE" "$STOP_MINUTES" || true`);
    expect(stop).toContain("exit $status");
  });
});

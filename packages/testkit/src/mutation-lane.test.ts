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
  readonly splitBySize: (files: readonly { readonly path: string; readonly size: number }[], count: number) => readonly (readonly string[])[];
  readonly partEnds: (text: string, count: number) => { readonly ends: readonly number[]; readonly lines: number };
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
  readonly planned?: readonly { readonly part: string; readonly old: number; readonly new: number; readonly pr: string }[];
  readonly unread?: (read: ReadonlySet<string>) => readonly string[];
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
    readonly failed: boolean;
    readonly lines: readonly string[];
    readonly packages: readonly { readonly name: string; readonly outcome: string; readonly score: number; readonly scoreWithClock: number }[];
  };
  readonly flipCases: (expected?: readonly string[]) => readonly { readonly name: string; readonly reports: ReadonlyMap<string, LaneReport | undefined>; readonly core: string; readonly lastTests?: Readonly<Record<string, number>> }[];
  readonly staticLine: (read: unknown) => string;
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
  it("LANE.PARTS: the parts of a package cover each file of the package once", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const entries = layout.laneParts().flatMap((part) => layout.mutateOf(root, part).map(fileOfEntry));
    const noModule = entries.filter((file) => file !== "work/compiler/module.ts");
    const whole = layout.PACKAGES.flatMap((name) => layout.mutateOf(root, name));
    expect(new Set(noModule).size).toBe(noModule.length);
    expect([...new Set(entries)].toSorted()).toEqual([...whole].toSorted());
    expect(entries.filter((file) => file === "work/compiler/module.ts")).toHaveLength(2);
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
    const [first, second] = ["compiler.module.1", "compiler.module.2"].map((part) => layout.mutateOf(root, part)[0] ?? "");
    const ranges = [first, second].map((entry) => /:(\d+)-(\d+)$/u.exec(entry ?? "")?.slice(1).map(Number) ?? []);
    const lines = readFileSync(join(root, "packages", "compiler", "src", "module.ts"), "utf8").split(/\r?\n/u);
    expect(ranges[0]?.[0]).toBe(1);
    expect(ranges[1]?.[0]).toBe((ranges[0]?.[1] ?? 0) + 1);
    expect(ranges[1]?.[1]).toBe(lines.length);
    // A class body has no mutator, so a mutant does not cross the end of a method of the class.
    expect(lines[(ranges[0]?.[1] ?? 0) - 1]).toBe("  }");
  });

  it("LANE.PARTS: the end of a part is the closing line nearest its share of the lines", async () => {
    const layout = await loadLayout();
    const text = ["class A {", "  a() {", "    1;", "  }", "  b() {", "    2;", "    3;", "  }", "}"].join("\n");
    expect(layout.partEnds(text, 2)).toEqual({ ends: [8], lines: 9 });
    expect(() => layout.partEnds("one\ntwo", 2)).toThrow("no closing line");
  });

  it("LANE.PARTS: each input gives the same parts, and the largest file goes first", async () => {
    const layout = await loadLayout();
    const files = [
      { path: "a", size: 5 },
      { path: "b", size: 9 },
      { path: "c", size: 4 },
      { path: "d", size: 5 },
    ];
    expect(layout.splitBySize(files, 2)).toEqual([["b", "c"], ["a", "d"]]);
    expect(layout.splitBySize(files.toReversed(), 2)).toEqual([["b", "c"], ["a", "d"]]);
  });

  it("LANE.PARTS: a part that the lane does not have stops the run", async () => {
    const layout = await loadLayout();
    expect(() => layout.mutateOf(repoRoot(), "core.base.9")).toThrow("does not have the part");
    expect(() => layout.mutateOf(repoRoot(), "other")).toThrow("does not have the part");
  });

  it("LANE.DELAY: a changed test file selects the source file of the same name", async () => {
    const layout = await loadLayout();
    const root = repoRoot();
    const selected = layout.changedParts(root, ["packages/core/src/evaluate.test.ts", "docs/ROADMAP.md", "packages/core/src/not-a-file.ts"]);
    expect(selected.files).toEqual([lanePath("core", "evaluate.ts")]);
    expect(selected.parts).toHaveLength(1);
    expect(selected.parts[0]).toMatch(/^core\.base\.\d$/u);
  });

  it("LANE.DELAY: a change of module.ts selects both of its parts", async () => {
    const layout = await loadLayout();
    const selected = layout.changedParts(repoRoot(), ["packages/compiler/src/module.ts"]);
    expect(selected).toEqual({ parts: ["compiler.module.1", "compiler.module.2"], files: [lanePath("compiler", "module.ts")] });
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
    expect(config).toContain('dryRunOnly: process.env.VEX_DRY_RUN === "1"');
  });
});

describe("the gate of the mutation lane", () => {
  it("LANE.GATE: each case of the flip gives its outcome", async () => {
    const read = await loadRead();
    const file = "work/core/a.test.ts";
    const unread = (names: ReadonlySet<string>): readonly string[] => (names.has(file) ? [] : ["packages/core/src/a.test.ts"]);
    const outcomes = read.flipCases([file]).map((c) => {
      const verdict = read.laneVerdict(c.reports, { lastTests: c.lastTests, unread });
      return [verdict.packages.find((p) => p.name === "core")?.outcome, verdict.failed];
    });
    expect(outcomes).toEqual([
      ["pass", false],
      ["under the line", true],
      ["no read", true],
      ["under the line", true],
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

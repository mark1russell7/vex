import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * This function gives the root of the repository: the first folder above this file that holds `pnpm-workspace.yaml`.
 * The mutation lane runs a copy of this file in `tools/mutation/.stryker-tmp`.
 */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("The folders above this file do not hold pnpm-workspace.yaml.");
    dir = up;
  }
  return dir;
}

/** The name of the configuration of the tests of a package. */
const CONFIG = "vitest.config.ts";

/** The part of `tools/mutation/layout.ts` that this test reads. */
interface Layout {
  readonly unresolvedImports: (root: string) => readonly string[];
  readonly missingPackages: (root: string) => readonly string[];
  readonly missingSetups: (root: string) => readonly string[];
  readonly laneParts: () => readonly string[];
  readonly PACKAGES: readonly string[];
  readonly mutateOf: (root: string, part: string) => readonly string[];
  readonly splitBySize: (files: readonly { readonly path: string; readonly size: number }[], count: number) => readonly (readonly string[])[];
  readonly partEnds: (text: string, count: number) => { readonly ends: readonly number[]; readonly lines: number };
  readonly entriesIn: (entries: readonly string[], files: readonly string[]) => readonly string[];
  readonly changedParts: (root: string, changed: readonly string[]) => { readonly parts: readonly string[]; readonly files: readonly string[] };
}

/** The status of a mutant of a report. */
interface Status {
  readonly status: string;
  readonly statusReason?: string;
}

/** A report of Stryker, as this test reads it. */
interface LaneReport {
  readonly files: Readonly<Record<string, { readonly mutants: readonly unknown[] }>>;
}

/** The part of `tools/mutation/lane-read.ts` that this test reads. */
interface LaneRead {
  readonly fixtureReport: (part: string, killed: number, other: Status) => LaneReport;
  readonly readReports: (reports: readonly LaneReport[]) => readonly { readonly name: string; readonly counts: { readonly killed: number; readonly hitLimit: number; readonly clock: number; readonly survived: number; readonly disabled: number } }[];
  readonly laneVerdict: (reports: ReadonlyMap<string, LaneReport | undefined>) => {
    readonly failed: boolean;
    readonly lines: readonly string[];
    readonly packages: readonly { readonly name: string; readonly outcome: string; readonly score: number; readonly scoreWithClock: number }[];
  };
  readonly flipCases: () => readonly { readonly name: string; readonly reports: ReadonlyMap<string, LaneReport | undefined>; readonly core: string }[];
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
    const outcomes = read.flipCases().map((c) => [read.laneVerdict(c.reports).packages.find((p) => p.name === "core")?.outcome, read.laneVerdict(c.reports).failed]);
    expect(outcomes).toEqual([
      ["pass", false],
      ["under the line", true],
      ["no read", true],
      ["under the line", true],
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

  it("LANE.GATE: a part with a report of no mutants is no read", async () => {
    const read = await loadRead();
    const verdict = read.laneVerdict(new Map([["core.kernel", { files: {} }], ["testkit", read.fixtureReport("testkit", 99, { status: "Survived" })]]));
    expect(verdict.packages.map((p) => [p.name, p.outcome])).toEqual([["core", "no read"], ["testkit", "pass"]]);
    expect(verdict.failed).toBe(true);
  });
});

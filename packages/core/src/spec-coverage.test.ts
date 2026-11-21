/**
 * The link between the specification and the tests. Each requirement ID of `spec/README.md` and of the formula
 * language (`spec/formula.md`) must have a test that names it. Each ID that a test names must be in one of them.
 * Each row with the status `test` in `spec/regressions.md` must have a test that names the defect ID.
 * This file also compares the `private` field of each package of the workspace with the list of published packages, and
 * the export map of each published package with its `publishConfig.exports`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "..", "..", "..");
const read = (p: string): string => readFileSync(join(repo, p), "utf8");

function files(dir: string, test: (f: string) => boolean): readonly string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (name === "node_modules" || name === "dist") continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (test(p)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** This function tells if CI runs a file of tests: a Vitest file, or a browser test under the `testDir` of Playwright. */
const isTestFile = (f: string): boolean => /\.test\.tsx?$/.test(f) || /[\\/]site[\\/]e2e[\\/][^\\/]+\.spec\.ts$/.test(f);

const testFiles = ["core", "domains", "testkit", "compiler", "site", "formula", "pilots", "mcp"]
  .map((p) => join(repo, "packages", p))
  .filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap((p) => files(p, isTestFile));

/** The title of a test or a group that runs: the first string argument of `describe(`, `it(` and `test(`. A skipped test has no title here. */
const TITLE = /\b(?:describe|it|test)(?:\.(?!skip\b|fixme\b|todo\b)\w+)?\(\s*"([^"]+)"/g;

/** This function gives the titles in the source of a file of tests. */
const titlesOf = (source: string): readonly string[] => [...source.matchAll(TITLE)].map((m) => m[1] ?? "");

const titles: readonly string[] = testFiles.flatMap((f) => titlesOf(readFileSync(f, "utf8")));

const REQ = /\b[A-Z][A-Z0-9-]*(?:\.[A-Z0-9][A-Z0-9-]*)+\b/g;
const specIds = new Set(["spec/README.md", "spec/formula.md"].flatMap((p) => [...read(p).matchAll(/\*\*\[([A-Z0-9.-]+)\]\*\*/g)].map((m) => m[1] ?? "")));
const testedIds = new Set(titles.flatMap((t) => t.match(REQ) ?? []));
const testedDefects = new Set(titles.flatMap((t) => t.match(/\bV-\d{3}\b/g) ?? []));

/** The packages of this workspace that the release publishes. Each other package must be private. */
const PUBLISHED: ReadonlySet<string> = new Set(["@mark1russell7/vex", "@mark1russell7/vex-domains", "@mark1russell7/vex-testkit", "@mark1russell7/vex-compiler", "@mark1russell7/vex-mcp"]);

/** The fields of a `package.json` file that the publish check reads. */
interface PackageRecord {
  readonly name: string;
  readonly private?: boolean;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly publishConfig?: { readonly exports?: Readonly<Record<string, unknown>> };
}

/**
 * This function gives one problem for each entry of the export map of a package whose built files are not the entry of the
 * same key in `publishConfig.exports`: the entry `./x` of `./src/x.ts` is published as `./build/x.d.ts` and `./build/x.js`.
 */
function exportProblems(p: PackageRecord): readonly string[] {
  const published = p.publishConfig?.exports ?? {};
  const problems = Object.entries(p.exports ?? {}).flatMap(([key, target]) => {
    const src = typeof target === "string" ? /^\.\/src\/(.+)\.ts$/.exec(target) : null;
    const want = src === null ? target : { types: `./build/${src[1]}.d.ts`, default: `./build/${src[1]}.js` };
    return JSON.stringify(published[key]) === JSON.stringify(want) ? [] : [`${p.name}: the entry ${key} is published as ${JSON.stringify(published[key])}, not ${JSON.stringify(want)}`];
  });
  const extra = Object.keys(published).filter((key) => p.exports?.[key] === undefined).map((key) => `${p.name}: the published entry ${key} is not in the export map`);
  return [...problems, ...extra];
}

/** This function gives one problem for each package whose `private` field does not agree with `PUBLISHED`. */
function publishProblems(packages: readonly PackageRecord[]): readonly string[] {
  return packages.flatMap((p) => {
    const isPrivate = p.private === true;
    if (PUBLISHED.has(p.name)) return isPrivate ? [`${p.name} is a published package, but it is private`] : [];
    return isPrivate ? [] : [`${p.name} is not a published package, but it is not private`];
  });
}

/** This function gives the records of the `package.json` files of the workspace folder `dir`. */
function packagesIn(dir: string): readonly PackageRecord[] {
  return readdirSync(join(repo, dir))
    .map((name) => join(dir, name, "package.json"))
    .filter((p) => existsSync(join(repo, p)))
    .map((p) => JSON.parse(read(p)) as PackageRecord);
}

describe("the specification is executable", () => {
  it("each requirement ID of the specification has a test", () => {
    expect([...specIds].filter((id) => !testedIds.has(id))).toEqual([]);
    expect(specIds.size).toBeGreaterThan(50);
  });

  it("each requirement ID in a test title is in the specification", () => {
    expect([...testedIds].filter((id) => !specIds.has(id))).toEqual([]);
  });

  it("a skipped test or a browser file that CI does not run names no defect", () => {
    const skipped = ['test.skip("V-999: a", f)', 'test.fixme("V-999: b", f)', 'it.todo("V-999: c")', 'describe.skip("V-999: d", f)'];
    expect(titlesOf(skipped.join("\n"))).toEqual([]);
    expect(titlesOf('test("V-999: e", f)')).toEqual(["V-999: e"]);
    expect(isTestFile(join(repo, "packages", "site", "e2e", "app.spec.ts"))).toBe(true);
    expect(isTestFile(join(repo, "packages", "site", "src", "app.spec.ts"))).toBe(false);
    // The rule above holds only while Playwright reads that folder and CI starts Playwright.
    expect(read("packages/site/playwright.config.ts")).toContain('testDir: "./e2e"');
    expect(read(".github/workflows/ci.yml")).toContain("pnpm --filter @vex/site run test:e2e");
  });

  it("each defect with the status test has a test that names it", () => {
    const rows = [...read("spec/regressions.md").matchAll(/^\| (V-\d{3}) \| (test|resolved|pending) \|/gm)];
    // The IDs run from V-001 without a gap: V-001 to V-042 are the audit defects, and later defects come after them. A pending row holds its place.
    expect(rows.length).toBeGreaterThanOrEqual(42);
    expect(rows.map((m) => m[1])).toEqual(rows.map((_m, i) => `V-${String(i + 1).padStart(3, "0")}`));
    const missing = rows.filter((m) => m[2] === "test" && !testedDefects.has(m[1] ?? "")).map((m) => m[1]);
    expect(missing).toEqual([]);
  });

  it("V-079, V-081, V-084, V-085, V-088, V-090 and V-091: a row that went to main with the status pending has the status test", () => {
    const pending = [...read("spec/regressions.md").matchAll(/^\| (V-\d{3}) \| pending \|/gm)].map((m) => m[1]);
    expect(pending.filter((id) => ["V-079", "V-081", "V-084", "V-085", "V-088", "V-090", "V-091"].includes(id ?? ""))).toEqual([]);
  });

  it("V-021: @mark1russell7/vex imports no domain package and no legacy code", () => {
    const sources = files(join(repo, "packages", "core", "src"), (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const bad = sources.filter((f) => /from\s+["']@vex\/(domains|legacy|testkit)["']/.test(readFileSync(f, "utf8"))).map((f) => relative(repo, f));
    expect(bad).toEqual([]);
  });
});

describe("the private field of each package", () => {
  it("a package outside the published names without private true is a problem", () => {
    expect(publishProblems([{ name: "@vex/other" }, { name: "@vex/open", private: false }])).toEqual([
      "@vex/other is not a published package, but it is not private",
      "@vex/open is not a published package, but it is not private",
    ]);
  });

  it("a published package with private true is a problem", () => {
    expect(publishProblems([{ name: "@mark1russell7/vex-mcp", private: true }])).toEqual(["@mark1russell7/vex-mcp is a published package, but it is private"]);
  });

  it("a published package and a private package outside the published names are not problems", () => {
    expect(publishProblems([{ name: "@mark1russell7/vex" }, { name: "@mark1russell7/vex-compiler", private: false }, { name: "@vex/site", private: true }])).toEqual([]);
  });

  it("each package of the workspace agrees with the published names", () => {
    const packages = [...packagesIn("packages"), ...packagesIn("tools")];
    expect(publishProblems(packages)).toEqual([]);
    expect(packages.map((p) => p.name)).toEqual(expect.arrayContaining([...PUBLISHED]));
  });
});

// The test of the entry ./query read the package.json of the core, and the copy of the mutation lane has no such file. This
// file does not run in the lane, so it reads the export maps of the published packages (V-103).
describe("the export map of each published package", () => {
  it("an entry whose built files are not its published entry, and a published entry with no entry, are problems", () => {
    const pkg = {
      name: "@vex/a",
      exports: { ".": "./src/index.ts", "./query": "./src/query.ts", "./package.json": "./package.json" },
      publishConfig: { exports: { ".": { types: "./build/index.d.ts", default: "./build/index.js" }, "./package.json": "./package.json", "./old": "./build/old.js" } },
    };
    expect(exportProblems(pkg)).toEqual([
      '@vex/a: the entry ./query is published as undefined, not {"types":"./build/query.d.ts","default":"./build/query.js"}',
      "@vex/a: the published entry ./old is not in the export map",
    ]);
  });

  it("QUERY.ENTRY: each entry of the export map of a published package, ./query of the core too, has its built files as its published entry", () => {
    const packages = [...packagesIn("packages"), ...packagesIn("tools")].filter((p) => PUBLISHED.has(p.name));
    expect(packages.flatMap(exportProblems)).toEqual([]);
    expect(packages.find((p) => p.name === "@mark1russell7/vex")?.exports?.["./query"]).toBe("./src/query.ts");
  });
});

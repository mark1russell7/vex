/**
 * The link between the specification and the tests. Each requirement ID of `spec/README.md` and of the formula
 * language (`spec/formula.md`) must have a test that names it. Each ID that a test names must be in one of them.
 * Each row with the status `test` in `spec/regressions.md` must have a test that names the defect ID.
 * This file also compares the `private` field of each package of the workspace with the list of published packages.
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

const testFiles = ["core", "domains", "testkit", "compiler", "site", "formula", "pilots", "mcp"]
  .map((p) => join(repo, "packages", p))
  .filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap((p) => files(p, (f) => /\.(?:test|spec)\.tsx?$/.test(f)));

/** The titles of the tests and groups: the first string argument of `describe(`, `it(` and `test(`. */
const titles: readonly string[] = testFiles.flatMap((f) =>
  [...readFileSync(f, "utf8").matchAll(/\b(?:describe|it|test)(?:\.\w+)?\(\s*"([^"]+)"/g)].map((m) => m[1] ?? ""),
);

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

  it("each defect with the status test has a test that names it", () => {
    const rows = [...read("spec/regressions.md").matchAll(/^\| (V-\d{3}) \| (test|resolved) \|/gm)];
    // The IDs run from V-001 without a gap: V-001 to V-042 are the audit defects, and later defects come after them.
    expect(rows.length).toBeGreaterThanOrEqual(42);
    expect(rows.map((m) => m[1])).toEqual(rows.map((_m, i) => `V-${String(i + 1).padStart(3, "0")}`));
    const missing = rows.filter((m) => m[2] === "test" && !testedDefects.has(m[1] ?? "")).map((m) => m[1]);
    expect(missing).toEqual([]);
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

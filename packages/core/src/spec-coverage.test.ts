/**
 * The link between the specification and the tests. Each requirement ID of `spec/README.md` must have a test
 * that names it, and each ID that a test names must be in the specification. Each row with the status `test`
 * in `spec/regressions.md` must have a test that names the defect ID.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
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

const testFiles = ["core", "domains", "testkit", "site"]
  .map((p) => join(repo, "packages", p))
  .filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap((p) => files(p, (f) => /\.test\.tsx?$/.test(f)));

/** The titles of the tests and groups: the first string argument of `describe(`, `it(` and `test(`. */
const titles: readonly string[] = testFiles.flatMap((f) =>
  [...readFileSync(f, "utf8").matchAll(/\b(?:describe|it|test)(?:\.\w+)?\(\s*"([^"]+)"/g)].map((m) => m[1] ?? ""),
);

const REQ = /\b[A-Z][A-Z0-9-]*(?:\.[A-Z0-9][A-Z0-9-]*)+\b/g;
const specIds = new Set([...read("spec/README.md").matchAll(/\*\*\[([A-Z0-9.-]+)\]\*\*/g)].map((m) => m[1] ?? ""));
const testedIds = new Set(titles.flatMap((t) => t.match(REQ) ?? []));
const testedDefects = new Set(titles.flatMap((t) => t.match(/\bV-\d{3}\b/g) ?? []));

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

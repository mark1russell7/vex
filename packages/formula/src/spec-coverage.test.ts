/**
 * The specification of the formula language is executable. Each requirement ID of `spec/formula.md` has a test that
 * names it, and each ID that a test names is in the specification. The tests are in this package and in the test
 * of the Vex view in the site (`packages/site/src/lib/formula-chain.test.ts`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(import.meta.dirname, "..", "..", "..");
const read = (path: string): string => readFileSync(join(repo, path), "utf8");
const ID = /FORMULA(?:\.[A-Z][A-Z-]*)+/g;

const specIds = new Set([...read("spec/formula.md").matchAll(/\[(FORMULA(?:\.[A-Z][A-Z-]*)+)\]/g)].map((m) => m[1] ?? ""));
const testFiles = [
  ...readdirSync(join(repo, "packages", "formula", "src"))
    .filter((f) => f.endsWith(".test.ts") && f !== "spec-coverage.test.ts")
    .map((f) => `packages/formula/src/${f}`),
  "packages/site/src/lib/formula-chain.test.ts",
];
/** The IDs in the titles of the tests: the first argument of `it`. */
const testedIds = new Set(testFiles.flatMap((f) => [...read(f).matchAll(/\bit\(\s*"([^"]*)"/g)].flatMap((m) => [...(m[1] ?? "").matchAll(ID)].map((x) => x[0]))));

describe("the specification of the formula language is executable", () => {
  it("has requirement IDs", () => {
    expect(specIds.size).toBeGreaterThan(20);
  });

  it("each requirement ID has a test that names it", () => {
    expect([...specIds].filter((id) => !testedIds.has(id))).toEqual([]);
  });

  it("each requirement ID in a test title is in the specification", () => {
    expect([...testedIds].filter((id) => !specIds.has(id))).toEqual([]);
  });
});

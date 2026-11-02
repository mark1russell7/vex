import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
/** A `describe` or an `it` of a property (a title with `P<n>`) whose options give a fixed number as the time-out. */
const FIXED = /(?:describe|it)\(\s*"[^"]*\bP\d+\b[^"]*",\s*\{\s*timeout:\s*[\d_]+\s*\}/gu;

/** This function gives each test file of the packages, as a path from the root of the repository. */
function testFiles(): readonly string[] {
  return readdirSync(join(root, "packages"), { recursive: true, encoding: "utf8" })
    .filter((p) => /[\\/]src[\\/].*\.test\.ts$/u.test(p) && !p.includes("node_modules"))
    .map((p) => join("packages", p));
}

describe("the time-outs of the weekly long run", () => {
  it("finds the test files", () => {
    expect(testFiles().length).toBeGreaterThan(50);
  });

  // The weekly run gives each property 10 minutes (FC_TIME_LIMIT_MS). A fixed time-out of 60 s in the options of a
  // property ends the test first. On 2026-11-02, two P17 properties of the compiler failed so in all 5 jobs.
  it("gives no property a fixed time-out, so the time-out of the weekly run applies", () => {
    const found = testFiles().flatMap((p) => [...readFileSync(join(root, p), "utf8").matchAll(FIXED)].map((m) => `${p}: ${m[0]}`));
    expect(found).toEqual([]);
  });

  it("finds a fixed time-out of a property", () => {
    expect('describe("X P17: random sheets", { timeout: 60_000 }, () => {'.match(FIXED)).toHaveLength(1);
    expect('describe("X P17: random sheets", { timeout: process.env["FC_NUM_RUNS"] === undefined ? 60_000 : 900_000 }, () => {'.match(FIXED)).toBeNull();
    expect('describe("SHEET.DEEP: deep sheets", { timeout: 30_000 }, () => {'.match(FIXED)).toBeNull();
  });
});
